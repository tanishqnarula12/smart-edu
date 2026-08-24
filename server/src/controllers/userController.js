import crypto from 'node:crypto';
import { query, queryOne, queryMany, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { publicUser } from '../utils/sanitize.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import { hashPassword } from '../utils/tokens.js';
import * as authService from '../services/authService.js';
import { notify, NOTIFICATION_TYPES } from '../services/notificationService.js';

/** Admin user management (§29). Every handler here is admin-gated by the router. */

/** GET /api/users */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = [];
  const params = [];

  if (req.query.role) {
    params.push(req.query.role);
    conditions.push(`u.role = $${params.length}::user_role`);
  }
  if (req.query.status === 'active') conditions.push('u.is_active');
  else if (req.query.status === 'inactive') conditions.push('NOT u.is_active');

  if (req.query.classId) {
    params.push(req.query.classId);
    conditions.push(`sp.class_id = $${params.length}`);
  }
  if (req.query.departmentId) {
    params.push(req.query.departmentId);
    conditions.push(`tp.department_id = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    conditions.push(
      `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length}
        OR sp.student_id ILIKE $${params.length} OR tp.employee_id ILIKE $${params.length})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const joins = `
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
    LEFT JOIN classes c           ON c.id = sp.class_id
    LEFT JOIN departments d       ON d.id = tp.department_id`;

  const countRow = await queryOne(`SELECT COUNT(*)::int AS total FROM users u ${joins} ${where}`, params);

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.avatar_url, u.is_active,
            u.last_login_at, u.created_at,
            sp.student_id, sp.roll_number, sp.class_id,
            c.name AS class_name, c.section,
            tp.employee_id, tp.designation, d.name AS department_name
       FROM users u ${joins} ${where}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      ...publicUser(row),
      studentId: row.student_id,
      rollNumber: row.roll_number,
      classId: row.class_id,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      employeeId: row.employee_id,
      designation: row.designation,
      departmentName: row.department_name,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Users'
  );
});

/** GET /api/users/:id */
export const getUser = asyncHandler(async (req, res) => {
  const { user, profile, preferences } = await authService.getFullProfile(req.params.id);
  return sendSuccess(res, { user: publicUser(user), profile, preferences }, 'User');
});

/** POST /api/users — admin provisions an account of any role. */
export const createUser = asyncHandler(async (req, res) => {
  // An admin-created account gets a random password unless one is supplied;
  // it is returned once so the admin can hand it over, never stored in clear.
  const generatedPassword = req.body.password || `SE${crypto.randomBytes(6).toString('base64url')}1a`;

  const user = await authService.createUser({ ...req.body, password: generatedPassword });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.USER_CREATED,
    entity: 'user',
    entityId: user.id,
    metadata: { role: user.role, email: user.email },
  });

  return sendCreated(
    res,
    {
      user: publicUser(user),
      // Only surfaced when we generated it — an admin-supplied password is
      // already known to them and is never echoed back.
      temporaryPassword: req.body.password ? undefined : generatedPassword,
    },
    'Account created'
  );
});

/** PATCH /api/users/:id */
export const updateUser = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, role, name, email, is_active FROM users WHERE id = $1', [
    req.params.id,
  ]);
  if (!existing) throw ApiError.notFound('User not found');

  // Changing a role would orphan the old profile row and leave the new one
  // missing; that migration needs its own deliberate flow.
  if (req.body.role && req.body.role !== existing.role) {
    throw ApiError.badRequest(
      'A user’s role cannot be changed after creation. Create a new account for the other role instead.'
    );
  }
  if (existing.id === req.user.id && req.body.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const updated = await withTransaction(async (tx) => {
    const userMap = { name: 'name', email: 'email', phone: 'phone', isActive: 'is_active', avatarUrl: 'avatar_url' };
    const updates = [];
    const params = [];

    for (const [key, column] of Object.entries(userMap)) {
      if (req.body[key] !== undefined) {
        params.push(key === 'email' ? String(req.body[key]).toLowerCase() : req.body[key]);
        updates.push(`${column} = $${params.length}`);
      }
    }

    let user = existing;
    if (updates.length) {
      params.push(req.params.id);
      const { rows } = await tx.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
         RETURNING id, name, email, role, phone, avatar_url, is_active, created_at`,
        params
      );
      user = rows[0];
    }

    if (existing.role === 'student') {
      const { classId, rollNumber, address } = req.body;
      if (classId !== undefined || rollNumber !== undefined || address !== undefined) {
        await tx.query(
          `UPDATE student_profiles
              SET class_id = COALESCE($1, class_id),
                  roll_number = COALESCE($2, roll_number),
                  address = COALESCE($3, address)
            WHERE user_id = $4`,
          [classId ?? null, rollNumber ?? null, address ?? null, req.params.id]
        );
        // Keep the enrollments table in step with the profile's class.
        if (classId) {
          const { rows: classRows } = await tx.query('SELECT academic_year FROM classes WHERE id = $1', [
            classId,
          ]);
          if (classRows[0]) {
            await tx.query(
              `INSERT INTO enrollments (student_id, class_id, academic_year)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [req.params.id, classId, classRows[0].academic_year]
            );
          }
        }
      }
    } else if (existing.role === 'teacher') {
      const { departmentId, designation } = req.body;
      if (departmentId !== undefined || designation !== undefined) {
        await tx.query(
          `UPDATE teacher_profiles
              SET department_id = COALESCE($1, department_id),
                  designation = COALESCE($2, designation)
            WHERE user_id = $3`,
          [departmentId ?? null, designation ?? null, req.params.id]
        );
      }
    } else if (existing.role === 'parent') {
      const { occupation, address } = req.body;
      if (occupation !== undefined || address !== undefined) {
        await tx.query(
          `UPDATE parent_profiles
              SET occupation = COALESCE($1, occupation), address = COALESCE($2, address)
            WHERE user_id = $3`,
          [occupation ?? null, address ?? null, req.params.id]
        );
      }
    }

    return user;
  });

  const action =
    req.body.isActive === false
      ? AUDIT_ACTIONS.USER_DISABLED
      : req.body.isActive === true
        ? AUDIT_ACTIONS.USER_ENABLED
        : AUDIT_ACTIONS.USER_UPDATED;

  await recordAudit({
    req,
    action,
    entity: 'user',
    entityId: req.params.id,
    metadata: { fields: Object.keys(req.body) },
  });

  // Deactivation must also end any live session, or the user keeps working
  // until their access token happens to expire.
  if (req.body.isActive === false) {
    await authService.revokeAllSessions(req.params.id);
  }

  return sendSuccess(res, publicUser(updated), 'User updated');
});

/** DELETE /api/users/:id */
export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
  if (!user) throw ApiError.notFound('User not found');

  // Deleting the last admin would lock everyone out of user management.
  if (user.role === 'admin') {
    const remaining = await queryOne(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active AND id <> $1",
      [req.params.id]
    );
    if (remaining.count === 0) {
      throw ApiError.badRequest('This is the last active administrator and cannot be deleted');
    }
  }

  // The schema's ON DELETE CASCADE handles profiles, enrollments, attendance
  // and the rest; the transaction keeps the audit entry consistent with it.
  await withTransaction(async (tx) => {
    await tx.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.USER_DELETED,
    entity: 'user',
    entityId: req.params.id,
    metadata: { name: user.name, email: user.email, role: user.role },
  });

  return sendSuccess(res, null, `${user.name}'s account has been deleted`);
});

/** POST /api/users/:id/reset-password — admin sets a new password. */
export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await queryOne('SELECT id, name FROM users WHERE id = $1', [req.params.id]);
  if (!user) throw ApiError.notFound('User not found');

  const passwordHash = await hashPassword(req.body.newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.id]);
  await authService.revokeAllSessions(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entity: 'user',
    entityId: req.params.id,
    metadata: { name: user.name },
  });

  await notify({
    userId: req.params.id,
    title: 'Your password was reset',
    message: 'An administrator reset your password. Please sign in with the new one and change it.',
    type: NOTIFICATION_TYPES.SYSTEM,
    link: '/profile',
  });

  return sendSuccess(res, null, `Password reset for ${user.name}. They have been signed out everywhere.`);
});

/** POST /api/users/link-parent — connect a parent to a student. */
export const linkParent = asyncHandler(async (req, res) => {
  const { parentId, studentId, relationship, isPrimary } = req.body;

  const [parent, student] = await Promise.all([
    queryOne("SELECT id, name FROM users WHERE id = $1 AND role = 'parent'", [parentId]),
    queryOne("SELECT id, name FROM users WHERE id = $1 AND role = 'student'", [studentId]),
  ]);
  if (!parent) throw ApiError.badRequest('That user is not a parent account');
  if (!student) throw ApiError.badRequest('That user is not a student account');

  const link = await withTransaction(async (tx) => {
    if (isPrimary) {
      await tx.query('UPDATE parent_student SET is_primary = FALSE WHERE student_id = $1', [studentId]);
    }
    const { rows } = await tx.query(
      `INSERT INTO parent_student (parent_id, student_id, relationship, is_primary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (parent_id, student_id)
       DO UPDATE SET relationship = EXCLUDED.relationship, is_primary = EXCLUDED.is_primary
       RETURNING *`,
      [parentId, studentId, relationship, isPrimary ?? false]
    );
    return rows[0];
  });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PARENT_LINKED,
    entity: 'parent_student',
    entityId: link.id,
    metadata: { parent: parent.name, student: student.name, relationship },
  });

  await notify({
    userId: studentId,
    title: 'A parent was linked to your account',
    message: `${parent.name} has been linked as your ${relationship}. You control what they can see from your Privacy page.`,
    type: NOTIFICATION_TYPES.SYSTEM,
    link: '/student/privacy',
  });

  return sendCreated(res, link, `${parent.name} linked to ${student.name}`);
});

/** DELETE /api/users/link-parent/:id */
export const unlinkParent = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM parent_student WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Link not found');

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PARENT_UNLINKED,
    entity: 'parent_student',
    entityId: req.params.id,
  });

  return sendSuccess(res, null, 'Parent unlinked');
});

/** GET /api/users/parent-links — the full parent↔student map. */
export const listParentLinks = asyncHandler(async (_req, res) => {
  const rows = await queryMany(
    `SELECT ps.id, ps.relationship, ps.is_primary, ps.created_at,
            p.id AS parent_id, p.name AS parent_name, p.email AS parent_email,
            s.id AS student_id, s.name AS student_name,
            sp.student_id AS admission_number, sp.parent_permission_enabled,
            c.name AS class_name, c.section
       FROM parent_student ps
       JOIN users p             ON p.id = ps.parent_id
       JOIN users s             ON s.id = ps.student_id
       JOIN student_profiles sp ON sp.user_id = s.id
       LEFT JOIN classes c      ON c.id = sp.class_id
      ORDER BY s.name, ps.is_primary DESC`
  );
  return sendSuccess(res, rows, 'Parent links');
});

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  linkParent,
  unlinkParent,
  listParentLinks,
};
