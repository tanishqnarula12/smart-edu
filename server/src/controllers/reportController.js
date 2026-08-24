import { queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as access from '../services/accessService.js';
import * as analytics from '../services/analyticsService.js';
import * as marksService from '../services/marksService.js';
import * as attendanceService from '../services/attendanceService.js';
import * as assignmentService from '../services/assignmentService.js';

/**
 * Report generation (§32). Each report returns structured JSON that the client
 * renders and can print; nothing here is a pre-baked PDF, so the same payload
 * drives the on-screen view and the printable one.
 */

/** GET /api/reports/student/:studentId */
export const getStudentReport = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  await access.assertCanAccessStudentData(req.user, studentId, 'reports');

  const student = await queryOne(
    `SELECT u.id, u.name, u.email, sp.student_id, sp.roll_number,
            c.name AS class_name, c.section, c.academic_year,
            ct.name AS class_teacher_name, d.name AS department_name
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN classes c      ON c.id = sp.class_id
       LEFT JOIN users ct       ON ct.id = c.class_teacher_id
       LEFT JOIN departments d  ON d.id = c.department_id
      WHERE u.id = $1`,
    [studentId]
  );
  if (!student) throw ApiError.notFound('Student not found');

  const [attendance, subjectAttendance, performance, marks, rank, assignments, risk, remarks] =
    await Promise.all([
      attendanceService.getStudentSummary(studentId),
      attendanceService.getStudentSubjectBreakdown(studentId),
      marksService.getStudentPerformance(studentId),
      marksService.getStudentMarks(studentId, { limit: 50 }),
      marksService.getClassRank(studentId),
      assignmentService.getStudentCompletionRate(studentId),
      analytics.getStudentRisk(studentId),
      queryMany(
        `SELECT tr.remark, tr.sentiment, tr.created_at, t.name AS teacher_name, s.name AS subject_name
           FROM teacher_remarks tr
           JOIN users t ON t.id = tr.teacher_id
           LEFT JOIN subjects s ON s.id = tr.subject_id
          WHERE tr.student_id = $1 ORDER BY tr.created_at DESC LIMIT 10`,
        [studentId]
      ),
    ]);

  return sendSuccess(
    res,
    {
      reportType: 'student',
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.name,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        studentId: student.student_id,
        rollNumber: student.roll_number,
        className: student.class_name ? `${student.class_name} ${student.section}` : null,
        academicYear: student.academic_year,
        classTeacher: student.class_teacher_name,
        department: student.department_name,
      },
      attendance: { summary: attendance, bySubject: subjectAttendance },
      performance: { ...performance, rank },
      marks,
      assignments,
      risk: risk.risk,
      remarks,
    },
    'Student report'
  );
});

/** GET /api/reports/class/:classId */
export const getClassReport = asyncHandler(async (req, res) => {
  const { classId } = req.params;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesClass(req.user.id, classId);
    if (!teaches) throw ApiError.forbidden('This class is not assigned to you');
  }

  const classRow = await queryOne(
    `SELECT c.*, d.name AS department_name, t.name AS class_teacher_name
       FROM classes c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users t       ON t.id = c.class_teacher_id
      WHERE c.id = $1`,
    [classId]
  );
  if (!classRow) throw ApiError.notFound('Class not found');

  const [attendance, performance, assignments, risk] = await Promise.all([
    attendanceService.getClassOverview(classId),
    marksService.getClassPerformance(classId),
    assignmentService.getCompletionStats({ classIds: [classId] }),
    analytics.getRiskRegister({ classIds: [classId], limit: 50 }),
  ]);

  const weakest = [...performance.subjects].sort(
    (a, b) => Number(a.average_percentage) - Number(b.average_percentage)
  );

  return sendSuccess(
    res,
    {
      reportType: 'class',
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.name,
      class: {
        id: classRow.id,
        name: `${classRow.name} ${classRow.section}`,
        academicYear: classRow.academic_year,
        department: classRow.department_name,
        classTeacher: classRow.class_teacher_name,
        studentCount: attendance.totalStudents,
      },
      attendance: {
        average: attendance.averageAttendance,
        belowThreshold: attendance.belowThresholdCount,
        students: attendance.students,
      },
      performance,
      weakSubjects: weakest.slice(0, 3),
      assignments,
      riskDistribution: risk.distribution,
      atRiskStudents: risk.students.filter((student) => student.level !== 'low'),
    },
    'Class report'
  );
});

/** GET /api/reports/teacher/:teacherId */
export const getTeacherReport = asyncHandler(async (req, res) => {
  const teacherId = req.params.teacherId === 'me' ? req.user.id : req.params.teacherId;

  if (req.user.role === 'teacher' && teacherId !== req.user.id) {
    throw ApiError.forbidden('You can only view your own report');
  }

  const teacher = await queryOne(
    `SELECT u.id, u.name, u.email, tp.employee_id, tp.designation, tp.joined_on,
            d.name AS department_name
       FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.id
       LEFT JOIN departments d  ON d.id = tp.department_id
      WHERE u.id = $1`,
    [teacherId]
  );
  if (!teacher) throw ApiError.notFound('Teacher not found');

  const [overview, classes, workload] = await Promise.all([
    analytics.getTeacherOverview(teacherId),
    queryMany(
      `SELECT c.name AS class_name, c.section, s.name AS subject_name,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id)::int AS student_count,
              (SELECT ROUND(AVG(v.attendance_percentage), 2)
                 FROM v_student_attendance_summary v
                 JOIN student_profiles sp ON sp.user_id = v.student_id
                WHERE sp.class_id = c.id) AS average_attendance
         FROM teacher_subjects ts
         JOIN classes c  ON c.id = ts.class_id
         JOIN subjects s ON s.id = ts.subject_id
        WHERE ts.teacher_id = $1
        ORDER BY c.name, s.name`,
      [teacherId]
    ),
    queryOne(
      `SELECT
         (SELECT COUNT(*) FROM timetable WHERE teacher_id = $1)::int                 AS weekly_periods,
         (SELECT COUNT(*) FROM assignments WHERE teacher_id = $1)::int               AS assignments_created,
         (SELECT COUNT(*) FROM assessments WHERE teacher_id = $1)::int               AS assessments_created,
         (SELECT COUNT(DISTINCT (class_id, subject_id, date))
            FROM attendance WHERE teacher_id = $1)::int                              AS registers_submitted,
         (SELECT COUNT(*) FROM submissions su JOIN assignments a ON a.id = su.assignment_id
           WHERE a.teacher_id = $1 AND su.status = 'graded')::int                     AS submissions_graded,
         (SELECT COUNT(*) FROM submissions su JOIN assignments a ON a.id = su.assignment_id
           WHERE a.teacher_id = $1 AND su.status IN ('submitted','late'))::int        AS pending_grading`,
      [teacherId]
    ),
  ]);

  return sendSuccess(
    res,
    {
      reportType: 'teacher',
      generatedAt: new Date().toISOString(),
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        employeeId: teacher.employee_id,
        designation: teacher.designation,
        department: teacher.department_name,
        joinedOn: teacher.joined_on,
      },
      overview,
      classes,
      workload,
    },
    'Teacher report'
  );
});

/** GET /api/reports/institution — admin only. */
export const getInstitutionReport = asyncHandler(async (req, res) => {
  const [overview, attendanceTrend, subjects, classes, departments, risk] = await Promise.all([
    analytics.getInstitutionOverview(),
    analytics.getAttendanceTrend(12),
    analytics.getSubjectPerformance({ limit: 30 }),
    analytics.getClassComparison(),
    analytics.getDepartmentAttendance(),
    analytics.getRiskRegister({ limit: 200 }),
  ]);

  return sendSuccess(
    res,
    {
      reportType: 'institution',
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.name,
      overview,
      attendanceTrend,
      subjectPerformance: subjects,
      classComparison: classes,
      departmentAttendance: departments,
      risk: {
        distribution: risk.distribution,
        total: risk.total,
        highRisk: risk.students.filter((student) => student.level === 'high'),
      },
    },
    'Institution report'
  );
});

export default { getStudentReport, getClassReport, getTeacherReport, getInstitutionReport };
