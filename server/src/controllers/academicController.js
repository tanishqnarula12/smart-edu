import { query, queryOne, queryMany, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as access from '../services/accessService.js';

/**
 * Departments, classes and subjects — the organisational backbone the rest of
 * the academic data hangs off (§8).
 */

// ═══════════════════════════ DEPARTMENTS ══════════════════════════════════

export const listDepartments = asyncHandler(async (req, res) => {
  const rows = await queryMany(
    `SELECT d.*,
            h.name AS head_name,
            (SELECT COUNT(*) FROM classes c  WHERE c.department_id = d.id)::int  AS class_count,
            (SELECT COUNT(*) FROM subjects s WHERE s.department_id = d.id)::int  AS subject_count,
            (SELECT COUNT(*) FROM teacher_profiles tp WHERE tp.department_id = d.id)::int AS teacher_count
       FROM departments d
       LEFT JOIN users h ON h.id = d.head_id
      ORDER BY d.name`
  );
  return sendSuccess(res, rows, 'Departments');
});

export const createDepartment = asyncHandler(async (req, res) => {
  const { name, code, headId } = req.body;
  const row = await queryOne(
    'INSERT INTO departments (name, code, head_id) VALUES ($1, $2, $3) RETURNING *',
    [name, code, headId ?? null]
  );
  return sendCreated(res, row, 'Department created');
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const { name, code, headId } = req.body;
  const row = await queryOne(
    `UPDATE departments
        SET name = COALESCE($1, name), code = COALESCE($2, code), head_id = $3
      WHERE id = $4 RETURNING *`,
    [name ?? null, code ?? null, headId ?? null, req.params.id]
  );
  if (!row) throw ApiError.notFound('Department not found');
  return sendSuccess(res, row, 'Department updated');
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM departments WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Department not found');
  return sendSuccess(res, null, 'Department deleted');
});

// ════════════════════════════ CLASSES ═════════════════════════════════════

export const listClasses = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];

  // A teacher's class list is their own; everyone else sees the institution's.
  if (req.user.role === 'teacher' && req.query.scope !== 'all') {
    const classIds = await access.getTeacherClassIds(req.user.id);
    if (!classIds.length) return sendSuccess(res, [], 'Classes');
    params.push(classIds);
    conditions.push(`c.id = ANY($${params.length}::uuid[])`);
  }
  if (req.query.departmentId) {
    params.push(req.query.departmentId);
    conditions.push(`c.department_id = $${params.length}`);
  }
  if (req.query.academicYear) {
    params.push(req.query.academicYear);
    conditions.push(`c.academic_year = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await queryMany(
    `SELECT c.*,
            d.name AS department_name,
            t.name AS class_teacher_name,
            (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id)::int AS student_count,
            (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id)::int   AS subject_count,
            (SELECT ROUND(AVG(v.attendance_percentage), 2)
               FROM v_student_attendance_summary v
               JOIN student_profiles sp ON sp.user_id = v.student_id
              WHERE sp.class_id = c.id) AS average_attendance
       FROM classes c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users t       ON t.id = c.class_teacher_id
       ${where}
      ORDER BY c.name, c.section`,
    params
  );

  return sendSuccess(res, rows, 'Classes');
});

export const getClass = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesClass(req.user.id, id);
    if (!teaches) throw ApiError.forbidden('This class is not assigned to you');
  }

  const classRow = await queryOne(
    `SELECT c.*, d.name AS department_name, t.name AS class_teacher_name
       FROM classes c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users t       ON t.id = c.class_teacher_id
      WHERE c.id = $1`,
    [id]
  );
  if (!classRow) throw ApiError.notFound('Class not found');

  const [students, subjects] = await Promise.all([
    queryMany(
      `SELECT u.id, u.name, u.email, u.avatar_url,
              sp.roll_number, sp.student_id,
              COALESCE(v.attendance_percentage, 0) AS attendance_percentage
         FROM student_profiles sp
         JOIN users u ON u.id = sp.user_id AND u.is_active
         LEFT JOIN v_student_attendance_summary v ON v.student_id = sp.user_id
        WHERE sp.class_id = $1
        ORDER BY NULLIF(regexp_replace(COALESCE(sp.roll_number, ''), '\\D', '', 'g'), '')::int NULLS LAST,
                 u.name`,
      [id]
    ),
    queryMany(
      `SELECT s.id, s.name, s.code, s.credits,
              t.id AS teacher_id, t.name AS teacher_name
         FROM class_subjects cs
         JOIN subjects s ON s.id = cs.subject_id
         LEFT JOIN teacher_subjects ts ON ts.subject_id = s.id AND ts.class_id = cs.class_id
         LEFT JOIN users t ON t.id = ts.teacher_id
        WHERE cs.class_id = $1
        ORDER BY s.name`,
      [id]
    ),
  ]);

  return sendSuccess(res, { ...classRow, students, subjects }, 'Class detail');
});

export const createClass = asyncHandler(async (req, res) => {
  const { name, section, academicYear, departmentId, classTeacherId, room } = req.body;
  const row = await queryOne(
    `INSERT INTO classes (name, section, academic_year, department_id, class_teacher_id, room)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, section, academicYear, departmentId ?? null, classTeacherId ?? null, room ?? null]
  );
  return sendCreated(res, row, 'Class created');
});

export const updateClass = asyncHandler(async (req, res) => {
  const map = {
    name: 'name',
    section: 'section',
    academicYear: 'academic_year',
    departmentId: 'department_id',
    classTeacherId: 'class_teacher_id',
    room: 'room',
  };

  const updates = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (!updates.length) throw ApiError.badRequest('Provide at least one field to update');

  params.push(req.params.id);
  const row = await queryOne(
    `UPDATE classes SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!row) throw ApiError.notFound('Class not found');
  return sendSuccess(res, row, 'Class updated');
});

export const deleteClass = asyncHandler(async (req, res) => {
  const students = await queryOne(
    'SELECT COUNT(*)::int AS count FROM student_profiles WHERE class_id = $1',
    [req.params.id]
  );
  if (students.count > 0) {
    throw ApiError.conflict(
      `This class still has ${students.count} student(s). Move them to another class first.`
    );
  }

  const { rowCount } = await query('DELETE FROM classes WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Class not found');
  return sendSuccess(res, null, 'Class deleted');
});

/** POST /api/classes/:id/students — enroll a student. */
export const enrollStudent = asyncHandler(async (req, res) => {
  const classId = req.params.id;
  const { studentId, rollNumber } = req.body;

  const result = await withTransaction(async (tx) => {
    const { rows: classRows } = await tx.query('SELECT id, academic_year FROM classes WHERE id = $1', [
      classId,
    ]);
    if (!classRows[0]) throw ApiError.notFound('Class not found');

    const { rows: profileRows } = await tx.query(
      'SELECT user_id FROM student_profiles WHERE user_id = $1',
      [studentId]
    );
    if (!profileRows[0]) throw ApiError.notFound('Student not found');

    // The profile's class_id and the enrollments row must move together.
    await tx.query(
      'UPDATE student_profiles SET class_id = $1, roll_number = COALESCE($2, roll_number) WHERE user_id = $3',
      [classId, rollNumber ?? null, studentId]
    );
    await tx.query(
      `INSERT INTO enrollments (student_id, class_id, academic_year)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, class_id, academic_year) DO UPDATE SET is_active = TRUE`,
      [studentId, classId, classRows[0].academic_year]
    );

    return { studentId, classId };
  });

  return sendSuccess(res, result, 'Student enrolled');
});

// ════════════════════════════ SUBJECTS ════════════════════════════════════

export const listSubjects = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.departmentId) {
    params.push(req.query.departmentId);
    conditions.push(`s.department_id = $${params.length}`);
  }
  if (req.query.classId) {
    params.push(req.query.classId);
    conditions.push(`s.id IN (SELECT subject_id FROM class_subjects WHERE class_id = $${params.length})`);
  }

  // A student's subject list is whatever their own class studies.
  if (req.user.role === 'student' && !req.query.classId) {
    params.push(req.user.id);
    conditions.push(
      `s.id IN (SELECT cs.subject_id FROM class_subjects cs
                 JOIN student_profiles sp ON sp.class_id = cs.class_id
                WHERE sp.user_id = $${params.length})`
    );
  }
  if (req.user.role === 'teacher' && req.query.scope !== 'all') {
    params.push(req.user.id);
    conditions.push(
      `s.id IN (SELECT subject_id FROM teacher_subjects WHERE teacher_id = $${params.length})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await queryMany(
    `SELECT s.*, d.name AS department_name,
            (SELECT COUNT(*) FROM teacher_subjects ts WHERE ts.subject_id = s.id)::int AS assignment_count
       FROM subjects s
       LEFT JOIN departments d ON d.id = s.department_id
       ${where}
      ORDER BY s.name`,
    params
  );

  return sendSuccess(res, rows, 'Subjects');
});

export const createSubject = asyncHandler(async (req, res) => {
  const { name, code, credits, departmentId, description } = req.body;
  const row = await queryOne(
    `INSERT INTO subjects (name, code, credits, department_id, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, code, credits, departmentId ?? null, description ?? null]
  );
  return sendCreated(res, row, 'Subject created');
});

export const updateSubject = asyncHandler(async (req, res) => {
  const map = {
    name: 'name',
    code: 'code',
    credits: 'credits',
    departmentId: 'department_id',
    description: 'description',
  };

  const updates = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (!updates.length) throw ApiError.badRequest('Provide at least one field to update');

  params.push(req.params.id);
  const row = await queryOne(
    `UPDATE subjects SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!row) throw ApiError.notFound('Subject not found');
  return sendSuccess(res, row, 'Subject updated');
});

export const deleteSubject = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Subject not found');
  return sendSuccess(res, null, 'Subject deleted');
});

/** POST /api/subjects/assign — link teacher × subject × class. */
export const assignTeacher = asyncHandler(async (req, res) => {
  const { teacherId, subjectId, classId, academicYear } = req.body;

  const result = await withTransaction(async (tx) => {
    const { rows: teacherRows } = await tx.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'teacher'",
      [teacherId]
    );
    if (!teacherRows[0]) throw ApiError.badRequest('That user is not a teacher');

    const { rows } = await tx.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, class_id, academic_year)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (teacher_id, subject_id, class_id, academic_year) DO NOTHING
       RETURNING *`,
      [teacherId, subjectId, classId, academicYear]
    );

    // The class must also study the subject, or students would never see it.
    await tx.query(
      `INSERT INTO class_subjects (class_id, subject_id, academic_year)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [classId, subjectId, academicYear]
    );

    return rows[0] ?? { teacherId, subjectId, classId, academicYear, alreadyAssigned: true };
  });

  return sendCreated(res, result, 'Teacher assigned');
});

/** DELETE /api/subjects/assign/:id */
export const unassignTeacher = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM teacher_subjects WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Assignment not found');
  return sendSuccess(res, null, 'Teacher unassigned');
});

/** GET /api/subjects/assignments — the teacher × subject × class matrix. */
export const listAssignments = asyncHandler(async (req, res) => {
  const rows = await queryMany(
    `SELECT ts.id, ts.academic_year,
            t.id AS teacher_id, t.name AS teacher_name,
            s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            c.id AS class_id, c.name AS class_name, c.section
       FROM teacher_subjects ts
       JOIN users t    ON t.id = ts.teacher_id
       JOIN subjects s ON s.id = ts.subject_id
       JOIN classes c  ON c.id = ts.class_id
      ORDER BY c.name, c.section, s.name`
  );
  return sendSuccess(res, rows, 'Teaching assignments');
});

export default {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  enrollStudent,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  assignTeacher,
  unassignTeacher,
  listAssignments,
};
