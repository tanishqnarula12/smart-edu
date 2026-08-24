import { queryOne, queryMany, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';

/**
 * Attendance domain (§9). Percentages count 'late' as attended — a student who
 * arrived is present for the purposes of the 75% rule; the late count is
 * reported separately so it stays visible.
 */

export const THRESHOLD = config.academic.attendanceThreshold;

/**
 * Record a register for one class × subject × date.
 *
 * The whole register is one transaction: a half-saved register would leave the
 * class in a state nobody can reason about. Re-submitting the same date updates
 * the existing rows rather than failing on the uniqueness constraint (§21).
 */
export async function markAttendance({ classId, subjectId, date, records, teacherId }) {
  return withTransaction(async (tx) => {
    // Every student in the payload must actually be in this class.
    const { rows: enrolled } = await tx.query(
      'SELECT user_id FROM student_profiles WHERE class_id = $1',
      [classId]
    );
    const enrolledIds = new Set(enrolled.map((row) => row.user_id));

    const strangers = records.filter((record) => !enrolledIds.has(record.studentId));
    if (strangers.length) {
      throw ApiError.badRequest(
        `${strangers.length} student(s) in this register are not enrolled in the selected class`
      );
    }

    const studentIds = records.map((record) => record.studentId);
    const statuses = records.map((record) => record.status);
    const remarks = records.map((record) => record.remarks ?? null);

    // One statement for the whole register: unnest the arrays into rows and
    // upsert against the (student, subject, date) uniqueness constraint.
    const { rows } = await tx.query(
      `INSERT INTO attendance (student_id, subject_id, class_id, teacher_id, date, status, remarks)
       SELECT s.student_id, $4::uuid, $5::uuid, $6::uuid, $7::date, s.status::attendance_status, s.remarks
         FROM unnest($1::uuid[], $2::text[], $3::text[]) AS s(student_id, status, remarks)
       ON CONFLICT (student_id, subject_id, date)
       DO UPDATE SET status     = EXCLUDED.status,
                     remarks    = EXCLUDED.remarks,
                     teacher_id = EXCLUDED.teacher_id,
                     class_id   = EXCLUDED.class_id,
                     updated_at = NOW()
       RETURNING id, student_id, status`,
      [studentIds, statuses, remarks, subjectId, classId, teacherId, date]
    );

    return {
      date,
      classId,
      subjectId,
      recordCount: rows.length,
      present: rows.filter((row) => row.status === 'present').length,
      absent: rows.filter((row) => row.status === 'absent').length,
      late: rows.filter((row) => row.status === 'late').length,
    };
  });
}

/** The register for a class × subject × date, including unmarked students. */
export async function getRegister({ classId, subjectId, date }) {
  return queryMany(
    `SELECT u.id            AS student_id,
            u.name,
            u.avatar_url,
            sp.roll_number,
            sp.student_id   AS admission_number,
            a.id            AS attendance_id,
            a.status,
            a.remarks
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id AND u.is_active
       LEFT JOIN attendance a
              ON a.student_id = sp.user_id
             AND a.subject_id = $2
             AND a.date = $3::date
      WHERE sp.class_id = $1
      ORDER BY NULLIF(regexp_replace(COALESCE(sp.roll_number, ''), '\\D', '', 'g'), '')::int NULLS LAST,
               u.name`,
    [classId, subjectId, date]
  );
}

/** Overall attendance summary for one student. */
export async function getStudentSummary(studentId) {
  const summary = await queryOne(
    'SELECT * FROM v_student_attendance_summary WHERE student_id = $1',
    [studentId]
  );

  return {
    totalClasses: summary?.total_classes ?? 0,
    presentCount: summary?.present_count ?? 0,
    absentCount: summary?.absent_count ?? 0,
    lateCount: summary?.late_count ?? 0,
    attendancePercentage: summary?.attendance_percentage ?? 0,
    threshold: THRESHOLD,
    isBelowThreshold: (summary?.attendance_percentage ?? 0) < THRESHOLD,
  };
}

/** Subject-wise breakdown for one student. */
export async function getStudentSubjectBreakdown(studentId) {
  const rows = await queryMany(
    `SELECT v.*, s.credits
       FROM v_student_subject_attendance v
       JOIN subjects s ON s.id = v.subject_id
      WHERE v.student_id = $1
      ORDER BY v.attendance_percentage ASC`,
    [studentId]
  );

  return rows.map((row) => ({
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectCode: row.subject_code,
    totalClasses: row.total_classes,
    presentCount: row.present_count,
    absentCount: row.absent_count,
    lateCount: row.late_count,
    attendancePercentage: row.attendance_percentage,
    isBelowThreshold: row.attendance_percentage < THRESHOLD,
  }));
}

/** Month-by-month trend for the last `months` months. */
export async function getMonthlyTrend(studentId, months = 6) {
  const rows = await queryMany(
    `SELECT to_char(date_trunc('month', date), 'YYYY-MM')  AS month,
            to_char(date_trunc('month', date), 'Mon')      AS label,
            COUNT(*)                                        AS total,
            COUNT(*) FILTER (WHERE status IN ('present','late')) AS attended,
            ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('present','late'))
                  / NULLIF(COUNT(*), 0), 2)                 AS percentage
       FROM attendance
      WHERE student_id = $1
        AND date >= date_trunc('month', CURRENT_DATE) - make_interval(months => $2::int - 1)
      GROUP BY date_trunc('month', date)
      ORDER BY date_trunc('month', date)`,
    [studentId, months]
  );

  return rows.map((row) => ({
    month: row.month,
    label: row.label,
    total: row.total,
    attended: row.attended,
    percentage: row.percentage ?? 0,
  }));
}

/** Recent day-by-day records, most recent first. */
export async function getStudentRecords(studentId, { from, to, subjectId, limit = 60, offset = 0 } = {}) {
  const conditions = ['a.student_id = $1'];
  const params = [studentId];

  if (from) {
    params.push(from);
    conditions.push(`a.date >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`a.date <= $${params.length}::date`);
  }
  if (subjectId) {
    params.push(subjectId);
    conditions.push(`a.subject_id = $${params.length}`);
  }

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total FROM attendance a WHERE ${conditions.join(' AND ')}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT a.id, a.date, a.status, a.remarks,
            s.name AS subject_name, s.code AS subject_code,
            t.name AS teacher_name
       FROM attendance a
       JOIN subjects s ON s.id = a.subject_id
       LEFT JOIN users t ON t.id = a.teacher_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.date DESC, s.name
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { records: rows, total: countRow?.total ?? 0 };
}

/** Class-level attendance overview, used by teacher and admin dashboards. */
export async function getClassOverview(classId) {
  const rows = await queryMany(
    `SELECT u.id AS student_id, u.name, u.avatar_url,
            sp.roll_number,
            COALESCE(v.total_classes, 0)                AS total_classes,
            COALESCE(v.present_count, 0)                AS present_count,
            COALESCE(v.absent_count, 0)                 AS absent_count,
            COALESCE(v.attendance_percentage, 0)        AS attendance_percentage
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id AND u.is_active
       LEFT JOIN v_student_attendance_summary v ON v.student_id = sp.user_id
      WHERE sp.class_id = $1
      ORDER BY COALESCE(v.attendance_percentage, 0) ASC`,
    [classId]
  );

  const withRecords = rows.filter((row) => row.total_classes > 0);
  const average = withRecords.length
    ? Number(
        (
          withRecords.reduce((sum, row) => sum + Number(row.attendance_percentage), 0) / withRecords.length
        ).toFixed(2)
      )
    : 0;

  return {
    students: rows.map((row) => ({
      studentId: row.student_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      rollNumber: row.roll_number,
      totalClasses: row.total_classes,
      presentCount: row.present_count,
      absentCount: row.absent_count,
      attendancePercentage: row.attendance_percentage,
      isBelowThreshold: row.attendance_percentage < THRESHOLD && row.total_classes > 0,
    })),
    averageAttendance: average,
    belowThresholdCount: rows.filter(
      (row) => row.total_classes > 0 && row.attendance_percentage < THRESHOLD
    ).length,
    totalStudents: rows.length,
  };
}

/**
 * Students below the attendance threshold (§19).
 * `classIds = null` means institution-wide; an empty array means nothing.
 */
export async function getLowAttendanceStudents({ classIds = null, threshold = THRESHOLD, limit = 50 } = {}) {
  if (Array.isArray(classIds) && classIds.length === 0) return [];

  const params = [threshold];
  let scope = '';
  if (Array.isArray(classIds)) {
    params.push(classIds);
    scope = `AND sp.class_id = ANY($${params.length}::uuid[])`;
  }
  params.push(limit);

  return queryMany(
    `SELECT u.id AS student_id, u.name, u.email, u.avatar_url,
            sp.roll_number, sp.class_id,
            c.name AS class_name, c.section,
            v.total_classes, v.present_count, v.absent_count, v.attendance_percentage
       FROM v_student_attendance_summary v
       JOIN student_profiles sp ON sp.user_id = v.student_id
       JOIN users u            ON u.id = v.student_id AND u.is_active
       LEFT JOIN classes c     ON c.id = sp.class_id
      WHERE v.attendance_percentage < $1
        AND v.total_classes > 0
        ${scope}
      ORDER BY v.attendance_percentage ASC
      LIMIT $${params.length}`,
    params
  );
}

/** Has this register already been submitted? Used to warn before overwriting. */
export async function registerExists({ classId, subjectId, date }) {
  const row = await queryOne(
    'SELECT COUNT(*)::int AS count FROM attendance WHERE class_id = $1 AND subject_id = $2 AND date = $3::date',
    [classId, subjectId, date]
  );
  return (row?.count ?? 0) > 0;
}

export default {
  THRESHOLD,
  markAttendance,
  getRegister,
  getStudentSummary,
  getStudentSubjectBreakdown,
  getMonthlyTrend,
  getStudentRecords,
  getClassOverview,
  getLowAttendanceStudents,
  registerExists,
};
