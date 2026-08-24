import { queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import * as access from '../services/accessService.js';

/** Teacher directory and workload (§20, §32). */

/** GET /api/teachers */
export const listTeachers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = ["u.role = 'teacher'"];
  const params = [];

  if (req.query.status !== 'all') conditions.push('u.is_active');
  if (req.query.departmentId) {
    params.push(req.query.departmentId);
    conditions.push(`tp.department_id = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    conditions.push(
      `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR tp.employee_id ILIKE $${params.length})`
    );
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.id ${where}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active,
            tp.employee_id, tp.designation, tp.qualification, tp.joined_on,
            d.name AS department_name, d.id AS department_id,
            (SELECT COUNT(DISTINCT class_id)   FROM teacher_subjects WHERE teacher_id = u.id)::int AS class_count,
            (SELECT COUNT(DISTINCT subject_id) FROM teacher_subjects WHERE teacher_id = u.id)::int AS subject_count
       FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.id
       LEFT JOIN departments d  ON d.id = tp.department_id
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
      isActive: row.is_active,
      employeeId: row.employee_id,
      designation: row.designation,
      qualification: row.qualification,
      joinedOn: row.joined_on,
      departmentId: row.department_id,
      departmentName: row.department_name,
      classCount: row.class_count,
      subjectCount: row.subject_count,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Teachers'
  );
});

/** GET /api/teachers/me/classes — the signed-in teacher's assignments. */
export const getMyClasses = asyncHandler(async (req, res) => {
  const teacherId = req.user.role === 'admin' && req.query.teacherId ? req.query.teacherId : req.user.id;

  const rows = await queryMany(
    `SELECT ts.id AS assignment_id,
            c.id AS class_id, c.name AS class_name, c.section, c.academic_year, c.room,
            s.id AS subject_id, s.name AS subject_name, s.code AS subject_code, s.credits,
            (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id)::int AS student_count,
            (SELECT ROUND(AVG(v.attendance_percentage), 2)
               FROM v_student_attendance_summary v
               JOIN student_profiles sp ON sp.user_id = v.student_id
              WHERE sp.class_id = c.id) AS average_attendance,
            (SELECT ROUND(AVG(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0)), 2)
               FROM assessments a JOIN marks m ON m.assessment_id = a.id
              WHERE a.class_id = c.id AND a.subject_id = s.id AND a.is_published AND NOT m.is_absent)
              AS average_marks,
            (c.class_teacher_id = $1) AS is_class_teacher
       FROM teacher_subjects ts
       JOIN classes c  ON c.id = ts.class_id
       JOIN subjects s ON s.id = ts.subject_id
      WHERE ts.teacher_id = $1
      ORDER BY c.name, c.section, s.name`,
    [teacherId]
  );

  return sendSuccess(res, rows, 'Your classes');
});

/** GET /api/teachers/:id — profile plus workload (the teacher report, §32). */
export const getTeacher = asyncHandler(async (req, res) => {
  const teacher = await queryOne(
    `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
            tp.employee_id, tp.designation, tp.qualification, tp.joined_on,
            d.name AS department_name
       FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.id
       LEFT JOIN departments d  ON d.id = tp.department_id
      WHERE u.id = $1`,
    [req.params.id]
  );

  if (!teacher) {
    return sendSuccess(res, null, 'Teacher not found');
  }

  const [assignments, workload] = await Promise.all([
    queryMany(
      `SELECT c.name AS class_name, c.section, s.name AS subject_name, s.code AS subject_code,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id)::int AS student_count
         FROM teacher_subjects ts
         JOIN classes c  ON c.id = ts.class_id
         JOIN subjects s ON s.id = ts.subject_id
        WHERE ts.teacher_id = $1
        ORDER BY c.name, s.name`,
      [req.params.id]
    ),
    queryOne(
      `SELECT
         (SELECT COUNT(*) FROM timetable WHERE teacher_id = $1)::int          AS weekly_periods,
         (SELECT COUNT(*) FROM assignments WHERE teacher_id = $1)::int        AS assignments_created,
         (SELECT COUNT(DISTINCT (class_id, subject_id, date))
            FROM attendance WHERE teacher_id = $1)::int                       AS registers_submitted,
         (SELECT COUNT(*) FROM assessments WHERE teacher_id = $1)::int        AS assessments_created,
         (SELECT COUNT(*) FROM submissions su JOIN assignments a ON a.id = su.assignment_id
           WHERE a.teacher_id = $1 AND su.status IN ('submitted','late'))::int AS pending_grading`,
      [req.params.id]
    ),
  ]);

  return sendSuccess(res, { teacher, assignments, workload }, 'Teacher profile');
});

/** GET /api/teachers/me/students — every student the teacher is responsible for. */
export const getMyStudents = asyncHandler(async (req, res) => {
  const classIds = await access.getTeacherClassIds(req.user.id);
  if (!classIds.length) return sendSuccess(res, [], 'No classes assigned yet');

  const rows = await queryMany(
    `SELECT u.id, u.name, u.email, u.avatar_url,
            sp.student_id, sp.roll_number, sp.class_id,
            c.name AS class_name, c.section,
            COALESCE(att.attendance_percentage, 0) AS attendance_percentage,
            perf.average_percentage
       FROM student_profiles sp
       JOIN users u        ON u.id = sp.user_id AND u.is_active
       LEFT JOIN classes c ON c.id = sp.class_id
       LEFT JOIN v_student_attendance_summary att ON att.student_id = u.id
       LEFT JOIN (
         SELECT student_id, ROUND(AVG(percentage), 2) AS average_percentage
           FROM v_student_marks_detail WHERE is_published AND NOT is_absent
          GROUP BY student_id
       ) perf ON perf.student_id = u.id
      WHERE sp.class_id = ANY($1::uuid[])
      ORDER BY c.name, c.section, u.name`,
    [classIds]
  );

  return sendSuccess(res, rows, 'Your students');
});

export default { listTeachers, getMyClasses, getTeacher, getMyStudents };
