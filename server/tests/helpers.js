import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import * as authService from '../src/services/authService.js';

/** Shared fixtures and helpers for the integration suite. */

export const app = createApp();
export const api = () => request(app);

export const TEST_PASSWORD = 'Test@1234';

/** Ensure the schema exists before the first test runs. */
export async function ensureSchema() {
  await runMigrations({ silent: true });
}

/**
 * Wipe every table the tests touch.
 *
 * DELETE rather than TRUNCATE ... CASCADE: the latter would also truncate
 * `settings`, because `settings.updated_by` holds a foreign key to `users`.
 * DELETE honours the per-column ON DELETE rules and leaves reference data from
 * seed.sql intact.
 */
export async function resetDatabase() {
  // Must include every table that survives deleting a user — anything whose
  // user reference is ON DELETE SET NULL rather than CASCADE.
  const order = [
    'users',
    'complaints',
    'notices',
    'documents',
    'generated_content',
    'audit_logs',
    'exams',
    'fee_structures',
    'class_subjects',
    'classes',
    'subjects',
    'departments',
  ];

  for (const table of order) {
    await query(`DELETE FROM ${table}`);
  }
}

let sequence = 0;
const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${sequence++}@test.local`;

/** Create a user and return the row plus a signed-in access token. */
export async function createTestUser({ role = 'student', name, email, ...extra } = {}) {
  const user = await authService.createUser({
    name: name ?? `Test ${role}`,
    email: email ?? uniqueEmail(role),
    password: TEST_PASSWORD,
    role,
    ...extra,
  });

  const response = await api()
    .post('/api/auth/login')
    .send({ email: user.email, password: TEST_PASSWORD });

  return {
    ...user,
    accessToken: response.body.data.accessToken,
    refreshToken: response.body.data.refreshToken,
  };
}

/** `authed(token).get('/api/…')` — a request with the bearer header applied. */
export function authed(token) {
  const withAuth = (method) => (url) =>
    api()[method](url).set('Authorization', `Bearer ${token}`);

  return {
    get: withAuth('get'),
    post: withAuth('post'),
    patch: withAuth('patch'),
    put: withAuth('put'),
    delete: withAuth('delete'),
  };
}

/** A department → class → subject → teacher assignment, ready to use. */
export async function createAcademicFixture({ teacherId } = {}) {
  const { rows: departmentRows } = await query(
    "INSERT INTO departments (name, code) VALUES ('Test Department', $1) RETURNING id",
    [`T${Date.now().toString().slice(-6)}`]
  );
  const departmentId = departmentRows[0].id;

  const { rows: classRows } = await query(
    `INSERT INTO classes (name, section, academic_year, department_id)
     VALUES ('Test Class', $1, '2025-26', $2) RETURNING id`,
    [`S${sequence++}`, departmentId]
  );
  const classId = classRows[0].id;

  const { rows: subjectRows } = await query(
    `INSERT INTO subjects (name, code, credits, department_id)
     VALUES ('Test Subject', $1, 4, $2) RETURNING id`,
    [`TS${Date.now().toString().slice(-6)}`, departmentId]
  );
  const subjectId = subjectRows[0].id;

  await query(
    `INSERT INTO class_subjects (class_id, subject_id, academic_year)
     VALUES ($1, $2, '2025-26') ON CONFLICT DO NOTHING`,
    [classId, subjectId]
  );

  if (teacherId) {
    await query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, class_id, academic_year)
       VALUES ($1, $2, $3, '2025-26') ON CONFLICT DO NOTHING`,
      [teacherId, subjectId, classId]
    );
  }

  return { departmentId, classId, subjectId };
}

/** Put an existing student into a class. */
export async function enrollStudent(studentId, classId, rollNumber = null) {
  await query('UPDATE student_profiles SET class_id = $1, roll_number = $2 WHERE user_id = $3', [
    classId,
    rollNumber,
    studentId,
  ]);
  await query(
    `INSERT INTO enrollments (student_id, class_id, academic_year)
     VALUES ($1, $2, '2025-26') ON CONFLICT DO NOTHING`,
    [studentId, classId]
  );
}

/** Link a parent to a student, optionally narrowing what they may see. */
export async function linkParent(parentId, studentId, permissions = {}) {
  const {
    canViewAttendance = true,
    canViewMarks = true,
    canViewAssignments = true,
    canViewCgpa = true,
    canViewReports = true,
    canViewFees = true,
  } = permissions;

  await query(
    `INSERT INTO parent_student
       (parent_id, student_id, relationship, can_view_attendance, can_view_marks,
        can_view_assignments, can_view_cgpa, can_view_reports, can_view_fees)
     VALUES ($1, $2, 'guardian', $3, $4, $5, $6, $7, $8)
     ON CONFLICT (parent_id, student_id) DO UPDATE
       SET can_view_attendance = EXCLUDED.can_view_attendance,
           can_view_marks = EXCLUDED.can_view_marks,
           can_view_assignments = EXCLUDED.can_view_assignments,
           can_view_cgpa = EXCLUDED.can_view_cgpa,
           can_view_reports = EXCLUDED.can_view_reports,
           can_view_fees = EXCLUDED.can_view_fees`,
    [
      parentId,
      studentId,
      canViewAttendance,
      canViewMarks,
      canViewAssignments,
      canViewCgpa,
      canViewReports,
      canViewFees,
    ]
  );
}

export async function closeDatabase() {
  await pool.end();
}

export { query };
