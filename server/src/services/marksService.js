import { queryOne, queryMany, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { calculateCGPA, percentageToGrade, detectTrend } from '../utils/grades.js';

/**
 * Assessments, marks, CGPA and performance analytics (§10).
 *
 * Unpublished assessments are visible to the teacher who owns them and to
 * admins only — students and parents see marks the moment they are published,
 * never before.
 */

// ───────────────────────────── ASSESSMENTS ────────────────────────────────

export async function createAssessment(data, teacherId) {
  const row = await queryOne(
    `INSERT INTO assessments (name, subject_id, class_id, teacher_id, type, max_marks, weightage, date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.name,
      data.subjectId,
      data.classId,
      teacherId,
      data.type,
      data.maxMarks,
      data.weightage,
      data.date,
    ]
  );
  return row;
}

export async function listAssessments({ classId, subjectId, teacherId, includeUnpublished = false } = {}) {
  const conditions = [];
  const params = [];

  if (classId) {
    params.push(classId);
    conditions.push(`a.class_id = $${params.length}`);
  }
  if (subjectId) {
    params.push(subjectId);
    conditions.push(`a.subject_id = $${params.length}`);
  }
  if (teacherId) {
    params.push(teacherId);
    conditions.push(`a.teacher_id = $${params.length}`);
  }
  if (!includeUnpublished) conditions.push('a.is_published');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return queryMany(
    `SELECT a.*,
            s.name AS subject_name, s.code AS subject_code,
            c.name AS class_name, c.section,
            t.name AS teacher_name,
            (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id)::int AS marks_entered,
            (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = a.class_id)::int AS class_size,
            (SELECT ROUND(AVG(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0)), 2)
               FROM marks m WHERE m.assessment_id = a.id AND NOT m.is_absent) AS average_percentage
       FROM assessments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN classes c  ON c.id = a.class_id
       LEFT JOIN users t ON t.id = a.teacher_id
       ${where}
      ORDER BY a.date DESC, a.created_at DESC`,
    params
  );
}

export async function getAssessment(assessmentId) {
  return queryOne(
    `SELECT a.*, s.name AS subject_name, s.code AS subject_code,
            c.name AS class_name, c.section
       FROM assessments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN classes c  ON c.id = a.class_id
      WHERE a.id = $1`,
    [assessmentId]
  );
}

/** The marks sheet for an assessment, including students with nothing entered. */
export async function getMarksSheet(assessmentId) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw ApiError.notFound('Assessment not found');

  const students = await queryMany(
    `SELECT u.id AS student_id, u.name, u.avatar_url,
            sp.roll_number,
            m.id AS mark_id, m.marks_obtained, m.is_absent, m.remarks
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id AND u.is_active
       LEFT JOIN marks m ON m.student_id = sp.user_id AND m.assessment_id = $2
      WHERE sp.class_id = $1
      ORDER BY NULLIF(regexp_replace(COALESCE(sp.roll_number, ''), '\\D', '', 'g'), '')::int NULLS LAST,
               u.name`,
    [assessment.class_id, assessmentId]
  );

  return { assessment, students };
}

/**
 * Bulk marks entry, validated against the assessment's own max_marks — the
 * only place that value is known, so the check cannot live in a Zod schema.
 */
export async function enterMarks(assessmentId, records, gradedBy) {
  return withTransaction(async (tx) => {
    const { rows: assessmentRows } = await tx.query(
      'SELECT id, class_id, max_marks, is_published FROM assessments WHERE id = $1 FOR UPDATE',
      [assessmentId]
    );
    const assessment = assessmentRows[0];
    if (!assessment) throw ApiError.notFound('Assessment not found');

    const invalid = records.filter(
      (record) =>
        !record.isAbsent &&
        record.marksObtained !== null &&
        record.marksObtained !== undefined &&
        (record.marksObtained < 0 || record.marksObtained > Number(assessment.max_marks))
    );
    if (invalid.length) {
      throw ApiError.badRequest(
        `Marks must be between 0 and ${assessment.max_marks}. ` +
          `${invalid.length} entr${invalid.length === 1 ? 'y is' : 'ies are'} out of range.`
      );
    }

    const { rows: enrolled } = await tx.query(
      'SELECT user_id FROM student_profiles WHERE class_id = $1',
      [assessment.class_id]
    );
    const enrolledIds = new Set(enrolled.map((row) => row.user_id));
    const strangers = records.filter((record) => !enrolledIds.has(record.studentId));
    if (strangers.length) {
      throw ApiError.badRequest(`${strangers.length} student(s) are not enrolled in this class`);
    }

    const studentIds = records.map((r) => r.studentId);
    const values = records.map((r) => (r.isAbsent ? null : r.marksObtained ?? null));
    const absentFlags = records.map((r) => Boolean(r.isAbsent));
    const remarks = records.map((r) => r.remarks ?? null);

    const { rows } = await tx.query(
      `INSERT INTO marks (assessment_id, student_id, marks_obtained, is_absent, remarks, graded_by)
       SELECT $1::uuid, s.student_id, s.marks, s.is_absent, s.remarks, $6::uuid
         FROM unnest($2::uuid[], $3::numeric[], $4::boolean[], $5::text[])
              AS s(student_id, marks, is_absent, remarks)
       ON CONFLICT (assessment_id, student_id)
       DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained,
                     is_absent      = EXCLUDED.is_absent,
                     remarks        = EXCLUDED.remarks,
                     graded_by      = EXCLUDED.graded_by,
                     updated_at     = NOW()
       RETURNING id`,
      [assessmentId, studentIds, values, absentFlags, remarks, gradedBy]
    );

    return { assessmentId, saved: rows.length, wasPublished: assessment.is_published };
  });
}

/**
 * Publish an assessment. Marks must exist for every student first, otherwise
 * half the class sees a blank result (§60 — publishing spans two tables).
 */
export async function publishAssessment(assessmentId) {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      'SELECT id, class_id, name, subject_id, is_published FROM assessments WHERE id = $1 FOR UPDATE',
      [assessmentId]
    );
    const assessment = rows[0];
    if (!assessment) throw ApiError.notFound('Assessment not found');
    if (assessment.is_published) throw ApiError.badRequest('This assessment is already published');

    const { rows: countRows } = await tx.query(
      `SELECT (SELECT COUNT(*) FROM student_profiles WHERE class_id = $1)::int AS class_size,
              (SELECT COUNT(*) FROM marks WHERE assessment_id = $2)::int       AS entered`,
      [assessment.class_id, assessmentId]
    );
    const { class_size: classSize, entered } = countRows[0];

    if (entered < classSize) {
      throw ApiError.badRequest(
        `Marks are missing for ${classSize - entered} of ${classSize} students. ` +
          'Enter every mark before publishing.'
      );
    }

    await tx.query('UPDATE assessments SET is_published = TRUE, published_at = NOW() WHERE id = $1', [
      assessmentId,
    ]);

    const { rows: students } = await tx.query('SELECT student_id FROM marks WHERE assessment_id = $1', [
      assessmentId,
    ]);

    return {
      assessment,
      studentIds: students.map((row) => row.student_id),
      classSize,
    };
  });
}

// ──────────────────────── STUDENT-FACING READS ────────────────────────────

/** Every published mark for a student, newest first. */
export async function getStudentMarks(studentId, { subjectId, type, limit = 100 } = {}) {
  const conditions = ['d.student_id = $1', 'd.is_published'];
  const params = [studentId];

  if (subjectId) {
    params.push(subjectId);
    conditions.push(`d.subject_id = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`d.assessment_type = $${params.length}::assessment_type`);
  }
  params.push(limit);

  const rows = await queryMany(
    `SELECT d.*,
            (SELECT ROUND(AVG(100.0 * m2.marks_obtained / NULLIF(a2.max_marks, 0)), 2)
               FROM marks m2
               JOIN assessments a2 ON a2.id = m2.assessment_id
              WHERE m2.assessment_id = d.assessment_id AND NOT m2.is_absent) AS class_average
       FROM v_student_marks_detail d
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.assessment_date DESC
      LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    assessmentId: row.assessment_id,
    assessmentName: row.assessment_name,
    assessmentType: row.assessment_type,
    date: row.assessment_date,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectCode: row.subject_code,
    marksObtained: row.marks_obtained,
    maxMarks: row.max_marks,
    percentage: row.percentage,
    isAbsent: row.is_absent,
    remarks: row.remarks,
    classAverage: row.class_average,
    ...percentageToGrade(row.percentage),
  }));
}

/** Subject averages + CGPA + grade for one student. */
export async function getStudentPerformance(studentId) {
  const subjects = await queryMany(
    `SELECT p.*,
            (SELECT ROUND(AVG(d2.percentage), 2)
               FROM v_student_marks_detail d2
               JOIN student_profiles sp2 ON sp2.user_id = d2.student_id
              WHERE d2.subject_id = p.subject_id
                AND d2.is_published
                AND sp2.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)
            ) AS class_average
       FROM v_student_subject_performance p
      WHERE p.student_id = $1
      ORDER BY p.average_percentage DESC`,
    [studentId]
  );

  const cgpa = calculateCGPA(subjects);
  const overallAverage = subjects.length
    ? Number(
        (subjects.reduce((sum, s) => sum + Number(s.average_percentage), 0) / subjects.length).toFixed(2)
      )
    : 0;

  return {
    cgpa,
    overallAverage,
    grade: percentageToGrade(overallAverage),
    subjectCount: subjects.length,
    subjects: subjects.map((subject) => ({
      subjectId: subject.subject_id,
      subjectName: subject.subject_name,
      subjectCode: subject.subject_code,
      credits: subject.credits,
      assessmentCount: subject.assessment_count,
      averagePercentage: subject.average_percentage,
      bestPercentage: subject.best_percentage,
      worstPercentage: subject.worst_percentage,
      classAverage: subject.class_average,
      ...percentageToGrade(subject.average_percentage),
    })),
    strongest: subjects[0]
      ? { name: subjects[0].subject_name, average: subjects[0].average_percentage }
      : null,
    weakest: subjects.length
      ? {
          name: subjects[subjects.length - 1].subject_name,
          average: subjects[subjects.length - 1].average_percentage,
        }
      : null,
  };
}

/** CGPA trend: cumulative CGPA after each assessment date. */
export async function getPerformanceTrend(studentId, limit = 12) {
  const rows = await queryMany(
    `SELECT d.assessment_date AS date,
            d.assessment_name AS label,
            d.subject_name,
            d.percentage
       FROM v_student_marks_detail d
      WHERE d.student_id = $1 AND d.is_published AND NOT d.is_absent
      ORDER BY d.assessment_date ASC
      LIMIT $2`,
    [studentId, limit * 4]
  );

  // Walk forward accumulating a running average, so the chart shows how the
  // student's standing evolved rather than isolated scores.
  const points = [];
  let runningTotal = 0;

  rows.forEach((row, index) => {
    runningTotal += Number(row.percentage);
    const runningAverage = runningTotal / (index + 1);
    points.push({
      date: row.date,
      label: row.label,
      subject: row.subject_name,
      score: Number(row.percentage),
      cumulativeAverage: Number(runningAverage.toFixed(2)),
      cgpa: Number((percentageToGrade(runningAverage).point).toFixed(2)),
    });
  });

  return points.slice(-limit);
}

/** Rank within the student's own class, by overall average. */
export async function getClassRank(studentId) {
  const row = await queryOne(
    `WITH class_scope AS (
       SELECT class_id FROM student_profiles WHERE user_id = $1
     ),
     averages AS (
       SELECT sp.user_id AS student_id,
              ROUND(AVG(d.percentage), 2) AS average
         FROM student_profiles sp
         JOIN v_student_marks_detail d ON d.student_id = sp.user_id
        WHERE sp.class_id = (SELECT class_id FROM class_scope)
          AND d.is_published AND NOT d.is_absent
        GROUP BY sp.user_id
     ),
     ranked AS (
       SELECT student_id, average, RANK() OVER (ORDER BY average DESC) AS rank,
              COUNT(*) OVER () AS total
         FROM averages
     )
     SELECT rank, total, average FROM ranked WHERE student_id = $1`,
    [studentId]
  );

  if (!row) return { rank: null, total: 0, average: 0, percentile: null };

  const percentile = row.total > 1
    ? Number((((row.total - row.rank) / (row.total - 1)) * 100).toFixed(1))
    : 100;

  return { rank: row.rank, total: row.total, average: row.average, percentile };
}

/** Class-level subject averages, for teacher and admin dashboards. */
export async function getClassPerformance(classId) {
  const subjects = await queryMany(
    `SELECT s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            COUNT(DISTINCT m.student_id)::int AS students_assessed,
            COUNT(m.id)::int                  AS marks_count,
            ROUND(AVG(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0)), 2) AS average_percentage,
            ROUND(MAX(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0)), 2) AS highest,
            ROUND(MIN(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0)), 2) AS lowest
       FROM assessments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN marks m    ON m.assessment_id = a.id AND NOT m.is_absent
      WHERE a.class_id = $1 AND a.is_published
      GROUP BY s.id, s.name, s.code
      ORDER BY average_percentage DESC`,
    [classId]
  );

  const students = await queryMany(
    `SELECT u.id AS student_id, u.name, sp.roll_number,
            ROUND(AVG(d.percentage), 2) AS average,
            COUNT(d.id)::int            AS assessment_count
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id AND u.is_active
       LEFT JOIN v_student_marks_detail d
              ON d.student_id = sp.user_id AND d.is_published AND NOT d.is_absent
      WHERE sp.class_id = $1
      GROUP BY u.id, u.name, sp.roll_number
      ORDER BY average DESC NULLS LAST`,
    [classId]
  );

  const scored = students.filter((student) => student.average !== null);
  const classAverage = scored.length
    ? Number((scored.reduce((sum, s) => sum + Number(s.average), 0) / scored.length).toFixed(2))
    : 0;

  return {
    classAverage,
    subjects,
    students: students.map((student, index) => ({
      studentId: student.student_id,
      name: student.name,
      rollNumber: student.roll_number,
      average: student.average,
      assessmentCount: student.assessment_count,
      rank: student.average !== null ? index + 1 : null,
      ...percentageToGrade(student.average),
    })),
    topPerformers: students.slice(0, 5),
  };
}

/**
 * Students whose recent scores dropped versus their earlier ones (§19).
 * Compares each student's most recent assessments against everything before.
 */
export async function getDecliningStudents({ classIds = null, minDrop = 5, limit = 25 } = {}) {
  if (Array.isArray(classIds) && classIds.length === 0) return [];

  const params = [];
  let scope = '';
  if (Array.isArray(classIds)) {
    params.push(classIds);
    scope = `AND sp.class_id = ANY($${params.length}::uuid[])`;
  }

  const rows = await queryMany(
    `SELECT d.student_id, u.name, u.avatar_url, sp.roll_number, sp.class_id,
            c.name AS class_name, c.section,
            d.subject_id, d.subject_name,
            d.assessment_date, d.assessment_name, d.percentage
       FROM v_student_marks_detail d
       JOIN student_profiles sp ON sp.user_id = d.student_id
       JOIN users u             ON u.id = d.student_id AND u.is_active
       LEFT JOIN classes c      ON c.id = sp.class_id
      WHERE d.is_published AND NOT d.is_absent AND d.percentage IS NOT NULL
        ${scope}
      ORDER BY d.student_id, d.subject_id, d.assessment_date ASC`,
    params
  );

  // Group by student × subject and run the trend detector over each series.
  const series = new Map();
  for (const row of rows) {
    const key = `${row.student_id}:${row.subject_id}`;
    if (!series.has(key)) series.set(key, { meta: row, entries: [] });
    series.get(key).entries.push(row);
  }

  const declines = [];
  for (const { meta, entries } of series.values()) {
    if (entries.length < 3) continue;

    const trend = detectTrend(entries, 2);
    if (trend.direction !== 'declining' || Math.abs(trend.change) < minDrop) continue;

    const drop = Math.abs(trend.change);
    declines.push({
      studentId: meta.student_id,
      name: meta.name,
      avatarUrl: meta.avatar_url,
      rollNumber: meta.roll_number,
      classId: meta.class_id,
      className: meta.class_name ? `${meta.class_name} ${meta.section}` : null,
      subjectId: meta.subject_id,
      subjectName: meta.subject_name,
      previousScore: trend.previousAverage,
      currentScore: trend.recentAverage,
      change: trend.change,
      riskLevel: drop >= 20 ? 'high' : drop >= 10 ? 'medium' : 'low',
    });
  }

  return declines.sort((a, b) => a.change - b.change).slice(0, limit);
}

export default {
  createAssessment,
  listAssessments,
  getAssessment,
  getMarksSheet,
  enterMarks,
  publishAssessment,
  getStudentMarks,
  getStudentPerformance,
  getPerformanceTrend,
  getClassRank,
  getClassPerformance,
  getDecliningStudents,
};
