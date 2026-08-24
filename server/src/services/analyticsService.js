import { queryOne, queryMany } from '../db/pool.js';
import { calculateRiskScore, percentageToGrade } from '../utils/grades.js';
import { config } from '../config/env.js';
import * as attendanceService from './attendanceService.js';
import * as marksService from './marksService.js';
import * as assignmentService from './assignmentService.js';

/**
 * Analytics engine (§36).
 *
 * Everything here is derived from PostgreSQL aggregates — no cached tables to
 * fall out of date. The risk indicator is assembled from three independently
 * observable signals and always ships its own breakdown so a human can see
 * why a student was flagged.
 */

const THRESHOLD = config.academic.attendanceThreshold;

// ═══════════════════════ INSTITUTION-WIDE (ADMIN) ═════════════════════════

export async function getInstitutionOverview() {
  const counts = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'student' AND is_active)::int AS students,
       (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND is_active)::int AS teachers,
       (SELECT COUNT(*) FROM users WHERE role = 'parent'  AND is_active)::int AS parents,
       (SELECT COUNT(*) FROM users WHERE role = 'admin'   AND is_active)::int AS admins,
       (SELECT COUNT(*) FROM classes)::int                                    AS classes,
       (SELECT COUNT(*) FROM subjects)::int                                   AS subjects,
       (SELECT COUNT(*) FROM departments)::int                                AS departments,
       (SELECT COUNT(*) FROM complaints WHERE status IN ('submitted','under_review'))::int
         AS pending_complaints,
       (SELECT COUNT(*) FROM leave_applications WHERE status = 'pending')::int AS pending_leave`
  );

  const attendance = await queryOne(
    `SELECT ROUND(AVG(attendance_percentage), 2) AS average,
            COUNT(*) FILTER (WHERE attendance_percentage < $1)::int AS below_threshold
       FROM v_student_attendance_summary`,
    [THRESHOLD]
  );

  const performance = await queryOne(
    `SELECT ROUND(AVG(percentage), 2) AS average
       FROM v_student_marks_detail
      WHERE is_published AND NOT is_absent`
  );

  const assignments = await assignmentService.getCompletionStats({});

  return {
    counts,
    attendance: {
      average: attendance?.average ?? 0,
      belowThreshold: attendance?.below_threshold ?? 0,
      threshold: THRESHOLD,
    },
    performance: {
      average: performance?.average ?? 0,
      grade: percentageToGrade(performance?.average ?? 0),
    },
    assignments,
  };
}

/** Monthly attendance across the institution. */
export async function getAttendanceTrend(months = 6, { classId = null, departmentId = null } = {}) {
  return queryMany(
    `SELECT to_char(date_trunc('month', a.date), 'YYYY-MM') AS month,
            to_char(date_trunc('month', a.date), 'Mon')     AS label,
            COUNT(*)::int                                    AS total,
            COUNT(*) FILTER (WHERE a.status IN ('present','late'))::int AS attended,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('present','late'))
                  / NULLIF(COUNT(*), 0), 2)                  AS percentage
       FROM attendance a
       LEFT JOIN classes c ON c.id = a.class_id
      WHERE a.date >= date_trunc('month', CURRENT_DATE) - make_interval(months => $1::int - 1)
        AND ($2::uuid IS NULL OR a.class_id = $2::uuid)
        AND ($3::uuid IS NULL OR c.department_id = $3::uuid)
      GROUP BY date_trunc('month', a.date)
      ORDER BY date_trunc('month', a.date)`,
    [months, classId, departmentId]
  );
}

/** Attendance by department. */
export async function getDepartmentAttendance() {
  return queryMany(
    `SELECT d.id AS department_id, d.name AS department_name, d.code,
            COUNT(DISTINCT sp.user_id)::int AS student_count,
            ROUND(AVG(v.attendance_percentage), 2) AS average_attendance
       FROM departments d
       LEFT JOIN classes c          ON c.department_id = d.id
       LEFT JOIN student_profiles sp ON sp.class_id = c.id
       LEFT JOIN v_student_attendance_summary v ON v.student_id = sp.user_id
      GROUP BY d.id, d.name, d.code
      ORDER BY average_attendance DESC NULLS LAST`
  );
}

/** Attendance by class. */
export async function getClassAttendance() {
  return queryMany(
    `SELECT c.id AS class_id, c.name AS class_name, c.section, c.academic_year,
            d.name AS department_name,
            COUNT(DISTINCT sp.user_id)::int AS student_count,
            ROUND(AVG(v.attendance_percentage), 2) AS average_attendance,
            COUNT(*) FILTER (WHERE v.attendance_percentage < $1)::int AS below_threshold
       FROM classes c
       LEFT JOIN departments d       ON d.id = c.department_id
       LEFT JOIN student_profiles sp ON sp.class_id = c.id
       LEFT JOIN v_student_attendance_summary v ON v.student_id = sp.user_id
      GROUP BY c.id, c.name, c.section, c.academic_year, d.name
      ORDER BY average_attendance DESC NULLS LAST`,
    [THRESHOLD]
  );
}

/** Average performance by subject — the "top performing subjects" chart. */
export async function getSubjectPerformance({ classId = null, limit = 20 } = {}) {
  return queryMany(
    `SELECT s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            d.name AS department_name,
            COUNT(DISTINCT m.student_id)::int AS students_assessed,
            ROUND(AVG(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0)), 2) AS average_percentage,
            ROUND(100.0 * COUNT(*) FILTER (WHERE 100.0 * m.marks_obtained / NULLIF(a.max_marks, 0) >= 40)
                  / NULLIF(COUNT(*), 0), 2)                                   AS pass_rate
       FROM assessments a
       JOIN subjects s     ON s.id = a.subject_id
       LEFT JOIN departments d ON d.id = s.department_id
       JOIN marks m        ON m.assessment_id = a.id AND NOT m.is_absent
      WHERE a.is_published
        AND ($1::uuid IS NULL OR a.class_id = $1::uuid)
      GROUP BY s.id, s.name, s.code, d.name
      ORDER BY average_percentage DESC
      LIMIT $2`,
    [classId, limit]
  );
}

/** Class-by-class academic comparison. */
export async function getClassComparison() {
  return queryMany(
    `SELECT c.id AS class_id, c.name AS class_name, c.section,
            COUNT(DISTINCT sp.user_id)::int AS student_count,
            ROUND(AVG(d.percentage), 2)     AS average_percentage,
            ROUND(AVG(v.attendance_percentage), 2) AS average_attendance
       FROM classes c
       LEFT JOIN student_profiles sp ON sp.class_id = c.id
       LEFT JOIN v_student_marks_detail d
              ON d.student_id = sp.user_id AND d.is_published AND NOT d.is_absent
       LEFT JOIN v_student_attendance_summary v ON v.student_id = sp.user_id
      GROUP BY c.id, c.name, c.section
      ORDER BY average_percentage DESC NULLS LAST`
  );
}

// ═══════════════════════════ RISK ANALYTICS ═══════════════════════════════

/**
 * The risk register: every student's three signals blended into one indicator.
 * `classIds = null` covers the whole institution; an array scopes to a teacher.
 */
export async function getRiskRegister({ classIds = null, level = null, limit = 100 } = {}) {
  if (Array.isArray(classIds) && classIds.length === 0) {
    return { students: [], distribution: { low: 0, medium: 0, high: 0 }, total: 0 };
  }

  const rows = await queryMany(
    `WITH scoped_students AS (
       SELECT sp.user_id AS student_id, sp.class_id, sp.roll_number
         FROM student_profiles sp
         JOIN users u ON u.id = sp.user_id AND u.is_active
        WHERE ($1::uuid[] IS NULL OR sp.class_id = ANY($1::uuid[]))
     ),
     assignment_stats AS (
       SELECT ss.student_id,
              COUNT(a.id)::int AS due,
              COUNT(su.id) FILTER (WHERE su.status IN ('submitted','late','graded'))::int AS submitted
         FROM scoped_students ss
         LEFT JOIN assignments a
                ON a.class_id = ss.class_id AND a.is_published AND a.due_date < NOW()
         LEFT JOIN submissions su
                ON su.assignment_id = a.id AND su.student_id = ss.student_id
        GROUP BY ss.student_id
     )
     SELECT ss.student_id, u.name, u.email, u.avatar_url,
            ss.roll_number, ss.class_id,
            c.name AS class_name, c.section,
            COALESCE(att.attendance_percentage, 0) AS attendance_percentage,
            COALESCE(att.total_classes, 0)         AS total_classes,
            COALESCE(perf.average_percentage, 0)   AS average_percentage,
            asg.due, asg.submitted
       FROM scoped_students ss
       JOIN users u        ON u.id = ss.student_id
       LEFT JOIN classes c ON c.id = ss.class_id
       LEFT JOIN v_student_attendance_summary att ON att.student_id = ss.student_id
       LEFT JOIN (
         SELECT student_id, ROUND(AVG(percentage), 2) AS average_percentage
           FROM v_student_marks_detail
          WHERE is_published AND NOT is_absent
          GROUP BY student_id
       ) perf ON perf.student_id = ss.student_id
       LEFT JOIN assignment_stats asg ON asg.student_id = ss.student_id`,
    [Array.isArray(classIds) ? classIds : null]
  );

  const distribution = { low: 0, medium: 0, high: 0 };

  const students = rows.map((row) => {
    const due = row.due ?? 0;
    const submitted = row.submitted ?? 0;
    const completionRate = due ? (Math.min(submitted, due) / due) * 100 : 100;

    const risk = calculateRiskScore({
      attendancePercentage: row.attendance_percentage,
      averagePercentage: row.average_percentage,
      assignmentCompletionRate: completionRate,
    });

    distribution[risk.level] += 1;

    return {
      studentId: row.student_id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      rollNumber: row.roll_number,
      classId: row.class_id,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      attendancePercentage: Number(row.attendance_percentage),
      averagePercentage: Number(row.average_percentage),
      assignmentCompletionRate: Number(completionRate.toFixed(2)),
      assignmentsDue: due,
      assignmentsSubmitted: submitted,
      ...risk,
    };
  });

  const filtered = level ? students.filter((student) => student.level === level) : students;

  return {
    students: filtered.sort((a, b) => b.riskScore - a.riskScore).slice(0, limit),
    distribution,
    total: students.length,
  };
}

/** One student's full risk picture — used on the profile page and by the AI. */
export async function getStudentRisk(studentId) {
  const [attendance, performance, assignments] = await Promise.all([
    attendanceService.getStudentSummary(studentId),
    marksService.getStudentPerformance(studentId),
    assignmentService.getStudentCompletionRate(studentId),
  ]);

  const risk = calculateRiskScore({
    attendancePercentage: attendance.attendancePercentage,
    averagePercentage: performance.overallAverage,
    assignmentCompletionRate: assignments.completionRate,
  });

  return { attendance, performance, assignments, risk };
}

// ═════════════════════════ TEACHER DASHBOARD ══════════════════════════════

export async function getTeacherOverview(teacherId) {
  const summary = await queryOne(
    `WITH scoped_classes AS (
       SELECT DISTINCT class_id FROM teacher_subjects WHERE teacher_id = $1
       UNION
       SELECT id FROM classes WHERE class_teacher_id = $1
     )
     SELECT
       (SELECT COUNT(DISTINCT sp.user_id)
          FROM student_profiles sp
          JOIN users u ON u.id = sp.user_id AND u.is_active
         WHERE sp.class_id IN (SELECT class_id FROM scoped_classes))::int AS total_students,
       (SELECT COUNT(*) FROM scoped_classes)::int                          AS total_classes,
       (SELECT COUNT(DISTINCT subject_id) FROM teacher_subjects WHERE teacher_id = $1)::int
         AS total_subjects,
       (SELECT ROUND(AVG(v.attendance_percentage), 2)
          FROM v_student_attendance_summary v
          JOIN student_profiles sp ON sp.user_id = v.student_id
         WHERE sp.class_id IN (SELECT class_id FROM scoped_classes))       AS average_attendance,
       (SELECT ROUND(AVG(d.percentage), 2)
          FROM v_student_marks_detail d
          JOIN student_profiles sp ON sp.user_id = d.student_id
         WHERE sp.class_id IN (SELECT class_id FROM scoped_classes)
           AND d.is_published AND NOT d.is_absent)                          AS average_marks,
       (SELECT COUNT(*) FROM assignments a
         WHERE a.teacher_id = $1 AND a.due_date > NOW())::int               AS active_assignments,
       (SELECT COUNT(*)
          FROM submissions su
          JOIN assignments a ON a.id = su.assignment_id
         WHERE a.teacher_id = $1 AND su.status IN ('submitted','late'))::int
         AS ungraded_submissions`,
    [teacherId]
  );

  return {
    totalStudents: summary?.total_students ?? 0,
    totalClasses: summary?.total_classes ?? 0,
    totalSubjects: summary?.total_subjects ?? 0,
    averageAttendance: summary?.average_attendance ?? 0,
    averageMarks: summary?.average_marks ?? 0,
    activeAssignments: summary?.active_assignments ?? 0,
    ungradedSubmissions: summary?.ungraded_submissions ?? 0,
  };
}

/** Attendance distribution buckets — feeds the teacher dashboard chart. */
export async function getAttendanceDistribution(classIds = null) {
  if (Array.isArray(classIds) && classIds.length === 0) return [];

  const rows = await queryMany(
    `SELECT
       COUNT(*) FILTER (WHERE v.attendance_percentage >= 90)::int                                  AS excellent,
       COUNT(*) FILTER (WHERE v.attendance_percentage >= 75 AND v.attendance_percentage < 90)::int AS good,
       COUNT(*) FILTER (WHERE v.attendance_percentage >= 60 AND v.attendance_percentage < 75)::int AS at_risk,
       COUNT(*) FILTER (WHERE v.attendance_percentage < 60)::int                                   AS critical
       FROM v_student_attendance_summary v
       JOIN student_profiles sp ON sp.user_id = v.student_id
      WHERE ($1::uuid[] IS NULL OR sp.class_id = ANY($1::uuid[]))`,
    [Array.isArray(classIds) ? classIds : null]
  );

  const row = rows[0] ?? {};
  return [
    { band: '90–100%', label: 'Excellent', count: row.excellent ?? 0 },
    { band: '75–89%', label: 'Good', count: row.good ?? 0 },
    { band: '60–74%', label: 'At risk', count: row.at_risk ?? 0 },
    { band: 'Below 60%', label: 'Critical', count: row.critical ?? 0 },
  ];
}

// ═════════════════════════ STUDENT DASHBOARD ══════════════════════════════

export async function getStudentDashboard(studentId) {
  const [attendance, subjects, monthlyTrend, performance, trend, rank, assignments, risk] =
    await Promise.all([
      attendanceService.getStudentSummary(studentId),
      attendanceService.getStudentSubjectBreakdown(studentId),
      attendanceService.getMonthlyTrend(studentId, 6),
      marksService.getStudentPerformance(studentId),
      marksService.getPerformanceTrend(studentId, 10),
      marksService.getClassRank(studentId),
      assignmentService.getStudentAssignments(studentId, { limit: 100 }),
      getStudentRisk(studentId),
    ]);

  const now = new Date();
  const pending = assignments.assignments.filter((row) =>
    ['pending', 'overdue'].includes(row.derived_status)
  );
  const dueSoon = pending.filter((row) => {
    const days = (new Date(row.due_date) - now) / 86_400_000;
    return days >= 0 && days <= 7;
  });

  const upcomingExams = await queryMany(
    `SELECT e.id, e.name, e.exam_date, e.start_time, e.room,
            s.name AS subject_name,
            (e.exam_date - CURRENT_DATE) AS days_away
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
      WHERE e.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)
        AND e.exam_date >= CURRENT_DATE
      ORDER BY e.exam_date
      LIMIT 5`,
    [studentId]
  );

  const recentMarks = await marksService.getStudentMarks(studentId, { limit: 5 });

  return {
    kpis: {
      attendancePercentage: attendance.attendancePercentage,
      attendanceBelowThreshold: attendance.isBelowThreshold,
      cgpa: performance.cgpa,
      overallAverage: performance.overallAverage,
      pendingAssignments: pending.length,
      upcomingExams: upcomingExams.length,
      classRank: rank.rank,
      classSize: rank.total,
    },
    attendance: { summary: attendance, subjects, monthlyTrend },
    performance: { ...performance, trend, rank },
    assignments: {
      pending: pending.length,
      dueSoon: dueSoon.slice(0, 5).map((row) => ({
        id: row.id,
        title: row.title,
        subjectName: row.subject_name,
        dueDate: row.due_date,
        status: row.derived_status,
      })),
      submitted: assignments.assignments.filter((row) => row.derived_status === 'submitted').length,
      graded: assignments.assignments.filter((row) => row.derived_status === 'graded').length,
    },
    upcomingExams,
    recentMarks,
    risk: risk.risk,
  };
}

export default {
  getInstitutionOverview,
  getAttendanceTrend,
  getDepartmentAttendance,
  getClassAttendance,
  getSubjectPerformance,
  getClassComparison,
  getRiskRegister,
  getStudentRisk,
  getTeacherOverview,
  getAttendanceDistribution,
  getStudentDashboard,
};
