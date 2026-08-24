import { query, queryMany } from '../db/pool.js';

/**
 * Notification fan-out (§14).
 *
 * Every helper is fire-and-forget from the caller's perspective: a failure to
 * notify must never fail the action that triggered it, so errors are logged
 * rather than rethrown.
 */

export const NOTIFICATION_TYPES = Object.freeze({
  ASSIGNMENT: 'assignment',
  ATTENDANCE: 'attendance',
  MARKS: 'marks',
  EXAM: 'exam',
  NOTICE: 'notice',
  PTM: 'ptm',
  COMPLAINT: 'complaint',
  LEAVE: 'leave',
  FEE: 'fee',
  SYSTEM: 'system',
});

/** Send one notification. */
export async function notify({ userId, title, message, type = 'system', link = null }) {
  if (!userId) return null;
  try {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, title, message, type, link]
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    console.error('[notifications] failed to create:', error.message);
    return null;
  }
}

/** Send the same notification to many users in a single statement. */
export async function notifyMany(userIds, { title, message, type = 'system', link = null }) {
  const recipients = [...new Set((userIds || []).filter(Boolean))];
  if (!recipients.length) return 0;

  try {
    // UNNEST keeps this to one round trip regardless of recipient count.
    const { rowCount } = await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       SELECT unnest($1::uuid[]), $2, $3, $4, $5`,
      [recipients, title, message, type, link]
    );
    return rowCount;
  } catch (error) {
    console.error('[notifications] bulk create failed:', error.message);
    return 0;
  }
}

/** Everyone enrolled in a class. */
export async function notifyClass(classId, payload) {
  const rows = await queryMany(
    `SELECT sp.user_id FROM student_profiles sp
      JOIN users u ON u.id = sp.user_id
     WHERE sp.class_id = $1 AND u.is_active`,
    [classId]
  );
  return notifyMany(rows.map((row) => row.user_id), payload);
}

/**
 * Parents of a student, but only those the student has actually shared this
 * category with — a notification is itself a disclosure (§34).
 */
export async function notifyParentsOf(studentId, payload, scope = 'reports') {
  const column = {
    attendance: 'can_view_attendance',
    marks: 'can_view_marks',
    assignments: 'can_view_assignments',
    cgpa: 'can_view_cgpa',
    reports: 'can_view_reports',
    fees: 'can_view_fees',
  }[scope];

  // `column` can only be one of the six literals above — never caller input —
  // so interpolating it as an identifier is safe. Values stay parameterised.
  if (!column) return 0;

  const rows = await queryMany(
    `SELECT ps.parent_id
       FROM parent_student ps
       JOIN student_profiles sp ON sp.user_id = ps.student_id
       JOIN users u             ON u.id = ps.parent_id
      WHERE ps.student_id = $1
        AND sp.parent_permission_enabled
        AND ps.${column}
        AND u.is_active`,
    [studentId]
  );
  return notifyMany(rows.map((row) => row.parent_id), payload);
}

/** Every active user holding a role. */
export async function notifyRole(role, payload) {
  const rows = await queryMany('SELECT id FROM users WHERE role = $1 AND is_active', [role]);
  return notifyMany(rows.map((row) => row.id), payload);
}

/** Recipients of a notice, resolved from its targeting rules. */
export async function notifyNoticeAudience(notice) {
  const conditions = ['u.is_active'];
  const params = [];

  if (notice.class_id) {
    params.push(notice.class_id);
    conditions.push(`(sp.class_id = $${params.length} OR u.role IN ('admin','teacher'))`);
  }
  if (notice.target_role) {
    params.push(notice.target_role);
    conditions.push(`u.role = $${params.length}`);
  }

  const rows = await queryMany(
    `SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE ${conditions.join(' AND ')}`,
    params
  );

  return notifyMany(rows.map((row) => row.id), {
    title: notice.title,
    message: notice.content.slice(0, 240),
    type: NOTIFICATION_TYPES.NOTICE,
    link: '/notices',
  });
}

export default {
  NOTIFICATION_TYPES,
  notify,
  notifyMany,
  notifyClass,
  notifyParentsOf,
  notifyRole,
  notifyNoticeAudience,
};
