import { queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as analytics from '../services/analyticsService.js';
import * as access from '../services/accessService.js';
import * as marksService from '../services/marksService.js';
import * as attendanceService from '../services/attendanceService.js';
import * as assignmentService from '../services/assignmentService.js';

/**
 * Analytics endpoints. Each dashboard has one endpoint that returns everything
 * it needs, so the client makes a single request instead of a dozen.
 */

/** GET /api/analytics/student — the student dashboard payload (§15). */
export const getStudentDashboard = asyncHandler(async (req, res) => {
  let studentId = req.user.id;

  if (req.user.role !== 'student') {
    const requested = req.query.studentId;
    if (!requested) throw ApiError.badRequest('A studentId is required');
    await access.assertCanAccessStudentData(req.user, requested, 'reports');
    studentId = requested;
  }

  const dashboard = await analytics.getStudentDashboard(studentId);
  return sendSuccess(res, dashboard, 'Dashboard');
});

/** GET /api/analytics/teacher — the teacher dashboard payload (§19). */
export const getTeacherDashboard = asyncHandler(async (req, res) => {
  const teacherId = req.user.role === 'admin' && req.query.teacherId ? req.query.teacherId : req.user.id;
  const classIds = await access.getTeacherClassIds(teacherId);

  const [overview, lowAttendance, declining, distribution, riskRegister, assignmentStats, classes] =
    await Promise.all([
      analytics.getTeacherOverview(teacherId),
      attendanceService.getLowAttendanceStudents({ classIds, limit: 10 }),
      marksService.getDecliningStudents({ classIds, limit: 10 }),
      analytics.getAttendanceDistribution(classIds),
      analytics.getRiskRegister({ classIds, limit: 10 }),
      assignmentService.getCompletionStats({ classIds }),
      classIds.length
        ? queryMany(
            `SELECT c.id, c.name, c.section,
                    (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id)::int AS student_count,
                    (SELECT ROUND(AVG(v.attendance_percentage), 2)
                       FROM v_student_attendance_summary v
                       JOIN student_profiles sp ON sp.user_id = v.student_id
                      WHERE sp.class_id = c.id) AS average_attendance,
                    (SELECT ROUND(AVG(d.percentage), 2)
                       FROM v_student_marks_detail d
                       JOIN student_profiles sp ON sp.user_id = d.student_id
                      WHERE sp.class_id = c.id AND d.is_published AND NOT d.is_absent) AS average_marks
               FROM classes c
              WHERE c.id = ANY($1::uuid[])
              ORDER BY c.name, c.section`,
            [classIds]
          )
        : Promise.resolve([]),
    ]);

  return sendSuccess(
    res,
    {
      kpis: {
        totalStudents: overview.totalStudents,
        totalClasses: overview.totalClasses,
        averageAttendance: overview.averageAttendance,
        averageMarks: overview.averageMarks,
        activeAssignments: overview.activeAssignments,
        ungradedSubmissions: overview.ungradedSubmissions,
        studentsAtRisk: riskRegister.distribution.high + riskRegister.distribution.medium,
      },
      classes,
      lowAttendance: lowAttendance.map((row) => ({
        studentId: row.student_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        rollNumber: row.roll_number,
        className: row.class_name ? `${row.class_name} ${row.section}` : null,
        attendancePercentage: row.attendance_percentage,
        absentCount: row.absent_count,
      })),
      decliningStudents: declining,
      attendanceDistribution: distribution,
      riskDistribution: riskRegister.distribution,
      atRiskStudents: riskRegister.students,
      assignmentStats,
    },
    'Teacher dashboard'
  );
});

/** GET /api/analytics/admin — the institutional control centre (§27, §54). */
export const getAdminDashboard = asyncHandler(async (req, res) => {
  const months = Number(req.query.months) || 6;

  const [
    overview,
    attendanceTrend,
    subjectPerformance,
    classComparison,
    departmentAttendance,
    riskRegister,
    lowAttendance,
  ] = await Promise.all([
    analytics.getInstitutionOverview(),
    analytics.getAttendanceTrend(months),
    analytics.getSubjectPerformance({ limit: 10 }),
    analytics.getClassComparison(),
    analytics.getDepartmentAttendance(),
    analytics.getRiskRegister({ limit: 15 }),
    attendanceService.getLowAttendanceStudents({ limit: 10 }),
  ]);

  return sendSuccess(
    res,
    {
      kpis: {
        totalStudents: overview.counts.students,
        totalTeachers: overview.counts.teachers,
        totalParents: overview.counts.parents,
        totalClasses: overview.counts.classes,
        totalSubjects: overview.counts.subjects,
        averageAttendance: overview.attendance.average,
        averagePerformance: overview.performance.average,
        atRiskStudents: riskRegister.distribution.high + riskRegister.distribution.medium,
        pendingComplaints: overview.counts.pending_complaints,
        pendingLeave: overview.counts.pending_leave,
      },
      attendanceTrend,
      subjectPerformance,
      classComparison,
      departmentAttendance,
      riskDistribution: riskRegister.distribution,
      atRiskStudents: riskRegister.students,
      lowAttendance: lowAttendance.map((row) => ({
        studentId: row.student_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        className: row.class_name ? `${row.class_name} ${row.section}` : null,
        attendancePercentage: row.attendance_percentage,
      })),
      assignmentCompletion: overview.assignments,
    },
    'Admin dashboard'
  );
});

/** GET /api/analytics/attendance — attendance analytics with filters. */
export const getAttendanceAnalytics = asyncHandler(async (req, res) => {
  const months = Number(req.query.months) || 6;

  const [trend, byDepartment, byClass, low] = await Promise.all([
    analytics.getAttendanceTrend(months, {
      classId: req.query.classId ?? null,
      departmentId: req.query.departmentId ?? null,
    }),
    analytics.getDepartmentAttendance(),
    analytics.getClassAttendance(),
    attendanceService.getLowAttendanceStudents({ limit: 50 }),
  ]);

  return sendSuccess(res, { trend, byDepartment, byClass, lowAttendance: low }, 'Attendance analytics');
});

/** GET /api/analytics/academic — performance analytics. */
export const getAcademicAnalytics = asyncHandler(async (req, res) => {
  const [subjects, classes, declining] = await Promise.all([
    analytics.getSubjectPerformance({ classId: req.query.classId ?? null, limit: 30 }),
    analytics.getClassComparison(),
    marksService.getDecliningStudents({ limit: 30 }),
  ]);

  return sendSuccess(
    res,
    {
      subjectPerformance: subjects,
      classComparison: classes,
      decliningStudents: declining,
      topSubjects: subjects.slice(0, 5),
      weakestSubjects: [...subjects].reverse().slice(0, 5),
    },
    'Academic analytics'
  );
});

/** GET /api/analytics/risk — the risk register. */
export const getRiskAnalytics = asyncHandler(async (req, res) => {
  const classIds = req.user.role === 'teacher' ? await access.getTeacherClassIds(req.user.id) : null;

  const register = await analytics.getRiskRegister({
    classIds,
    level: req.query.level ?? null,
    limit: Math.min(Number(req.query.limit) || 100, 200),
  });

  return sendSuccess(
    res,
    {
      ...register,
      methodology: {
        description:
          'A weighted blend of attendance, assessment averages and assignment completion. ' +
          'Each student’s contributing factors are listed so the score can be checked by hand.',
        weights: { attendance: 0.4, performance: 0.4, assignments: 0.2 },
        bands: { low: '0–29', medium: '30–49', high: '50–100' },
        caveat:
          'This is an academic risk indicator to prompt a human review, not a validated predictive model.',
      },
    },
    'Risk register'
  );
});

/** GET /api/analytics/student/:studentId/risk — one student's risk detail. */
export const getStudentRisk = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  await access.assertCanAccessStudentData(req.user, studentId, 'reports');

  const risk = await analytics.getStudentRisk(studentId);
  return sendSuccess(res, risk, 'Student risk profile');
});

export default {
  getStudentDashboard,
  getTeacherDashboard,
  getAdminDashboard,
  getAttendanceAnalytics,
  getAcademicAnalytics,
  getRiskAnalytics,
  getStudentRisk,
};
