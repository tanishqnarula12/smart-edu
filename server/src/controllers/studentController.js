import { queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import * as access from '../services/accessService.js';
import * as analytics from '../services/analyticsService.js';
import * as marksService from '../services/marksService.js';
import * as attendanceService from '../services/attendanceService.js';
import * as assignmentService from '../services/assignmentService.js';

/**
 * Student records as seen by teachers and administrators (§55).
 *
 * A parent reaching a student profile goes through the same access layer, so
 * their privacy flags still apply — there is no back door via this route.
 */

/** GET /api/students */
export const listStudents = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = ["u.role = 'student'", 'u.is_active'];
  const params = [];

  // Teachers only ever see students in classes they teach.
  if (req.user.role === 'teacher') {
    const classIds = await access.getTeacherClassIds(req.user.id);
    if (!classIds.length) {
      return sendPaginated(res, [], buildPaginationMeta({ page, limit }, 0), 'Students');
    }
    params.push(classIds);
    conditions.push(`sp.class_id = ANY($${params.length}::uuid[])`);
  }

  if (req.query.classId) {
    params.push(req.query.classId);
    conditions.push(`sp.class_id = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    conditions.push(
      `(u.name ILIKE $${params.length} OR sp.student_id ILIKE $${params.length}
        OR sp.roll_number ILIKE $${params.length} OR u.email ILIKE $${params.length})`
    );
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total
       FROM users u JOIN student_profiles sp ON sp.user_id = u.id ${where}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT u.id, u.name, u.email, u.avatar_url, u.phone,
            sp.student_id, sp.roll_number, sp.class_id, sp.gender,
            c.name AS class_name, c.section,
            COALESCE(att.attendance_percentage, 0) AS attendance_percentage,
            COALESCE(att.total_classes, 0)         AS total_classes,
            perf.average_percentage
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN classes c      ON c.id = sp.class_id
       LEFT JOIN v_student_attendance_summary att ON att.student_id = u.id
       LEFT JOIN (
         SELECT student_id, ROUND(AVG(percentage), 2) AS average_percentage
           FROM v_student_marks_detail
          WHERE is_published AND NOT is_absent
          GROUP BY student_id
       ) perf ON perf.student_id = u.id
       ${where}
      ORDER BY u.name
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      studentId: row.student_id,
      rollNumber: row.roll_number,
      gender: row.gender,
      classId: row.class_id,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      attendancePercentage: Number(row.attendance_percentage),
      totalClasses: row.total_classes,
      averagePercentage: row.average_percentage,
      isBelowThreshold:
        row.total_classes > 0 && Number(row.attendance_percentage) < attendanceService.THRESHOLD,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Students'
  );
});

/** GET /api/students/:studentId — the full profile page (§55). */
export const getStudentProfile = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  await access.assertCanAccessStudentData(req.user, studentId, 'reports');

  const student = await queryOne(
    `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.created_at,
            sp.student_id, sp.roll_number, sp.date_of_birth, sp.gender, sp.address,
            sp.guardian_name, sp.admission_year, sp.class_id,
            c.name AS class_name, c.section, c.academic_year,
            ct.name AS class_teacher_name,
            d.name AS department_name
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN classes c      ON c.id = sp.class_id
       LEFT JOIN users ct       ON ct.id = c.class_teacher_id
       LEFT JOIN departments d  ON d.id = c.department_id
      WHERE u.id = $1`,
    [studentId]
  );
  if (!student) throw ApiError.notFound('Student not found');

  // Parents see only the sections they have been granted.
  const scopes = { attendance: true, marks: true, cgpa: true, assignments: true };
  if (req.user.role === 'parent') {
    for (const scope of Object.keys(scopes)) {
      const result = await access.parentCanView(req.user.id, studentId, scope);
      scopes[scope] = result.allowed;
    }
  }

  const [attendance, subjectAttendance, performance, trend, rank, assignments, risk, remarks] =
    await Promise.all([
      scopes.attendance ? attendanceService.getStudentSummary(studentId) : null,
      scopes.attendance ? attendanceService.getStudentSubjectBreakdown(studentId) : null,
      scopes.marks ? marksService.getStudentPerformance(studentId) : null,
      scopes.marks ? marksService.getPerformanceTrend(studentId) : null,
      scopes.cgpa ? marksService.getClassRank(studentId) : null,
      scopes.assignments ? assignmentService.getStudentCompletionRate(studentId) : null,
      req.user.role === 'parent' ? null : analytics.getStudentRisk(studentId),
      queryMany(
        `SELECT tr.remark, tr.sentiment, tr.created_at,
                t.name AS teacher_name, s.name AS subject_name
           FROM teacher_remarks tr
           JOIN users t ON t.id = tr.teacher_id
           LEFT JOIN subjects s ON s.id = tr.subject_id
          WHERE tr.student_id = $1
          ORDER BY tr.created_at DESC LIMIT 10`,
        [studentId]
      ),
    ]);

  const payload = {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      avatarUrl: student.avatar_url,
      studentId: student.student_id,
      rollNumber: student.roll_number,
      dateOfBirth: student.date_of_birth,
      gender: student.gender,
      address: student.address,
      guardianName: student.guardian_name,
      admissionYear: student.admission_year,
      classId: student.class_id,
      className: student.class_name ? `${student.class_name} ${student.section}` : null,
      academicYear: student.academic_year,
      classTeacherName: student.class_teacher_name,
      departmentName: student.department_name,
      joinedAt: student.created_at,
    },
    attendance: attendance ? { summary: attendance, subjects: subjectAttendance } : null,
    performance: performance ? { ...performance, trend, rank } : null,
    assignments,
    risk: risk?.risk ?? null,
    remarks,
    // Tells the client which panels to render as "hidden by the student".
    visibleScopes: scopes,
  };

  if (performance && !scopes.cgpa) {
    delete payload.performance.cgpa;
    payload.performance.cgpaHidden = true;
  }

  return sendSuccess(res, payload, 'Student profile');
});

/** GET /api/students/:studentId/marks — teacher/admin/parent view. */
export const getStudentMarks = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  await access.assertCanAccessStudentData(req.user, studentId, 'marks');

  const marks = await marksService.getStudentMarks(studentId, { limit: 100 });
  return sendSuccess(res, marks, 'Marks');
});

/** GET /api/students/:studentId/attendance */
export const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  await access.assertCanAccessStudentData(req.user, studentId, 'attendance');

  const [summary, subjects, monthlyTrend, records] = await Promise.all([
    attendanceService.getStudentSummary(studentId),
    attendanceService.getStudentSubjectBreakdown(studentId),
    attendanceService.getMonthlyTrend(studentId, 6),
    attendanceService.getStudentRecords(studentId, { limit: 40 }),
  ]);

  return sendSuccess(
    res,
    { summary, subjects, monthlyTrend, records: records.records },
    'Attendance'
  );
});

/** POST /api/students/:studentId/remarks — teacher notes on a student. */
export const addRemark = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesStudent(req.user.id, studentId);
    if (!teaches) throw ApiError.forbidden('This student is not in any of your classes');
  }

  const remark = await queryOne(
    `INSERT INTO teacher_remarks (student_id, teacher_id, subject_id, remark, sentiment)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [studentId, req.user.id, req.body.subjectId ?? null, req.body.remark, req.body.sentiment]
  );

  return sendCreated(res, remark, 'Remark added');
});

export default {
  listStudents,
  getStudentProfile,
  getStudentMarks,
  getStudentAttendance,
  addRemark,
};
