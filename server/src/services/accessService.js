import { queryOne, queryMany } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * The single authority on "may this user see that student's data?".
 *
 * Every controller and every AI agent resolves access through this module —
 * so the AI can never see more than the REST API would hand the same user
 * (§34). Adding a rule here changes it everywhere at once.
 *
 * Scopes map to the per-link flags on `parent_student`:
 *   attendance | marks | assignments | cgpa | reports | fees
 */

export const PRIVACY_SCOPES = Object.freeze([
  'attendance',
  'marks',
  'assignments',
  'cgpa',
  'reports',
  'fees',
]);

const SCOPE_COLUMN = Object.freeze({
  attendance: 'can_view_attendance',
  marks: 'can_view_marks',
  assignments: 'can_view_assignments',
  cgpa: 'can_view_cgpa',
  reports: 'can_view_reports',
  fees: 'can_view_fees',
});

// ─────────────────────────── PARENT ↔ STUDENT ────────────────────────────

/** The raw link row, or null when the two are not linked. */
export async function getParentLink(parentId, studentId) {
  return queryOne(
    `SELECT ps.*, sp.parent_permission_enabled
       FROM parent_student ps
       JOIN student_profiles sp ON sp.user_id = ps.student_id
      WHERE ps.parent_id = $1 AND ps.student_id = $2`,
    [parentId, studentId]
  );
}

/** Children linked to a parent, with each child's effective permission flags. */
export async function getLinkedChildren(parentId) {
  const rows = await queryMany(
    `SELECT u.id, u.name, u.email, u.avatar_url,
            sp.student_id, sp.roll_number, sp.class_id, sp.parent_permission_enabled,
            c.name AS class_name, c.section, c.academic_year,
            ps.relationship, ps.is_primary,
            ps.can_view_attendance, ps.can_view_marks, ps.can_view_assignments,
            ps.can_view_cgpa, ps.can_view_reports, ps.can_view_fees
       FROM parent_student ps
       JOIN users u             ON u.id = ps.student_id
       JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN classes c      ON c.id = sp.class_id
      WHERE ps.parent_id = $1 AND u.is_active
      ORDER BY ps.is_primary DESC, u.name`,
    [parentId]
  );

  return rows.map((row) => {
    // The student's master switch overrides every individual flag.
    const master = row.parent_permission_enabled;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      studentId: row.student_id,
      rollNumber: row.roll_number,
      classId: row.class_id,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      academicYear: row.academic_year,
      relationship: row.relationship,
      isPrimary: row.is_primary,
      privacyEnabled: master,
      permissions: {
        attendance: master && row.can_view_attendance,
        marks: master && row.can_view_marks,
        assignments: master && row.can_view_assignments,
        cgpa: master && row.can_view_cgpa,
        reports: master && row.can_view_reports,
        fees: master && row.can_view_fees,
      },
    };
  });
}

/**
 * Does this parent have `scope` access to this student right now?
 * Returns `{ allowed, reason }` so callers can explain the refusal.
 */
export async function parentCanView(parentId, studentId, scope) {
  const column = SCOPE_COLUMN[scope];
  if (!column) throw ApiError.badRequest(`Unknown privacy scope: ${scope}`);

  const link = await getParentLink(parentId, studentId);
  if (!link) {
    return { allowed: false, reason: 'not_linked', message: 'This student is not linked to your account' };
  }
  if (!link.parent_permission_enabled) {
    return {
      allowed: false,
      reason: 'privacy_disabled',
      message: 'The student has turned off parent access to their records',
    };
  }
  if (!link[column]) {
    return {
      allowed: false,
      reason: 'scope_denied',
      message: `The student has not shared their ${scope} with you`,
    };
  }
  return { allowed: true, link };
}

/** Same check, but throws 403 — for use directly in a controller. */
export async function assertParentCanView(parentId, studentId, scope) {
  const result = await parentCanView(parentId, studentId, scope);
  if (!result.allowed) throw ApiError.forbidden(result.message);
  return result.link;
}

// ─────────────────────────── TEACHER SCOPING ─────────────────────────────

/** Class ids a teacher teaches or is class-teacher for. */
export async function getTeacherClassIds(teacherId) {
  const rows = await queryMany(
    `SELECT DISTINCT class_id FROM (
       SELECT class_id FROM teacher_subjects WHERE teacher_id = $1
       UNION
       SELECT id AS class_id FROM classes WHERE class_teacher_id = $1
     ) AS scoped
     WHERE class_id IS NOT NULL`,
    [teacherId]
  );
  return rows.map((row) => row.class_id);
}

/** Subject ids a teacher teaches, optionally narrowed to one class. */
export async function getTeacherSubjectIds(teacherId, classId = null) {
  const rows = classId
    ? await queryMany(
        'SELECT DISTINCT subject_id FROM teacher_subjects WHERE teacher_id = $1 AND class_id = $2',
        [teacherId, classId]
      )
    : await queryMany('SELECT DISTINCT subject_id FROM teacher_subjects WHERE teacher_id = $1', [teacherId]);
  return rows.map((row) => row.subject_id);
}

export async function teacherTeachesClass(teacherId, classId) {
  const row = await queryOne(
    `SELECT 1 AS ok
       FROM (
         SELECT class_id FROM teacher_subjects WHERE teacher_id = $1 AND class_id = $2
         UNION
         SELECT id FROM classes WHERE class_teacher_id = $1 AND id = $2
       ) AS scoped
      LIMIT 1`,
    [teacherId, classId]
  );
  return Boolean(row);
}

export async function teacherTeachesSubjectInClass(teacherId, subjectId, classId) {
  const row = await queryOne(
    'SELECT 1 AS ok FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2 AND class_id = $3 LIMIT 1',
    [teacherId, subjectId, classId]
  );
  return Boolean(row);
}

/** A teacher may see a student who sits in any class they teach. */
export async function teacherTeachesStudent(teacherId, studentId) {
  const row = await queryOne(
    `SELECT 1 AS ok
       FROM student_profiles sp
      WHERE sp.user_id = $2
        AND (
          sp.class_id IN (SELECT class_id FROM teacher_subjects WHERE teacher_id = $1)
          OR sp.class_id IN (SELECT id FROM classes WHERE class_teacher_id = $1)
        )
      LIMIT 1`,
    [teacherId, studentId]
  );
  return Boolean(row);
}

// ──────────────────────── UNIFIED ENTRY POINT ────────────────────────────

/**
 * Can `requester` read `scope` of `studentId`?
 *
 *   admin   → always
 *   student → only their own record
 *   teacher → students in classes they teach
 *   parent  → linked children, subject to the student's privacy flags
 */
export async function canAccessStudentData(requester, studentId, scope = 'reports') {
  if (!requester) return { allowed: false, message: 'Authentication required' };

  switch (requester.role) {
    case 'admin':
      return { allowed: true, via: 'admin' };

    case 'student':
      return requester.id === studentId
        ? { allowed: true, via: 'self' }
        : { allowed: false, message: 'You can only access your own records' };

    case 'teacher': {
      const teaches = await teacherTeachesStudent(requester.id, studentId);
      return teaches
        ? { allowed: true, via: 'teacher' }
        : { allowed: false, message: 'This student is not in any of your classes' };
    }

    case 'parent': {
      const result = await parentCanView(requester.id, studentId, scope);
      return result.allowed
        ? { allowed: true, via: 'parent' }
        : { allowed: false, message: result.message, reason: result.reason };
    }

    default:
      return { allowed: false, message: 'Unrecognised role' };
  }
}

/** Throwing form of `canAccessStudentData`. */
export async function assertCanAccessStudentData(requester, studentId, scope = 'reports') {
  const result = await canAccessStudentData(requester, studentId, scope);
  if (!result.allowed) throw ApiError.forbidden(result.message);
  return result;
}

/**
 * The set of student ids a requester may see at all — used to scope list
 * endpoints and AI context retrieval without N+1 permission checks.
 * `null` means "no restriction" (admin).
 */
export async function getVisibleStudentIds(requester) {
  switch (requester.role) {
    case 'admin':
      return null;

    case 'student':
      return [requester.id];

    case 'teacher': {
      const rows = await queryMany(
        `SELECT sp.user_id
           FROM student_profiles sp
          WHERE sp.class_id IN (
            SELECT class_id FROM teacher_subjects WHERE teacher_id = $1
            UNION
            SELECT id FROM classes WHERE class_teacher_id = $1
          )`,
        [requester.id]
      );
      return rows.map((row) => row.user_id);
    }

    case 'parent': {
      const rows = await queryMany(
        `SELECT ps.student_id
           FROM parent_student ps
           JOIN student_profiles sp ON sp.user_id = ps.student_id
          WHERE ps.parent_id = $1 AND sp.parent_permission_enabled`,
        [requester.id]
      );
      return rows.map((row) => row.student_id);
    }

    default:
      return [];
  }
}

export default {
  PRIVACY_SCOPES,
  getParentLink,
  getLinkedChildren,
  parentCanView,
  assertParentCanView,
  getTeacherClassIds,
  getTeacherSubjectIds,
  teacherTeachesClass,
  teacherTeachesSubjectInClass,
  teacherTeachesStudent,
  canAccessStudentData,
  assertCanAccessStudentData,
  getVisibleStudentIds,
};
