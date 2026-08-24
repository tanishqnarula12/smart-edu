import { query, queryOne, queryMany, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import { notify, NOTIFICATION_TYPES } from '../services/notificationService.js';

/**
 * Privacy centre (§38).
 *
 * These settings belong to the *student*. Nobody else — not a parent, not a
 * teacher, not an admin — can change them, which is why every handler here is
 * hard-scoped to `req.user.id` rather than taking a student id.
 */

const SCOPE_COLUMNS = {
  canViewAttendance: 'can_view_attendance',
  canViewMarks: 'can_view_marks',
  canViewAssignments: 'can_view_assignments',
  canViewCgpa: 'can_view_cgpa',
  canViewReports: 'can_view_reports',
  canViewFees: 'can_view_fees',
};

/** GET /api/privacy — the student's own settings and linked parents. */
export const getPrivacySettings = asyncHandler(async (req, res) => {
  const profile = await queryOne(
    'SELECT parent_permission_enabled FROM student_profiles WHERE user_id = $1',
    [req.user.id]
  );
  if (!profile) throw ApiError.notFound('Student profile not found');

  const parents = await queryMany(
    `SELECT ps.id AS link_id, ps.parent_id, ps.relationship, ps.is_primary,
            ps.can_view_attendance, ps.can_view_marks, ps.can_view_assignments,
            ps.can_view_cgpa, ps.can_view_reports, ps.can_view_fees,
            u.name AS parent_name, u.email AS parent_email, u.avatar_url
       FROM parent_student ps
       JOIN users u ON u.id = ps.parent_id
      WHERE ps.student_id = $1
      ORDER BY ps.is_primary DESC, u.name`,
    [req.user.id]
  );

  return sendSuccess(
    res,
    {
      parentPermissionEnabled: profile.parent_permission_enabled,
      parents: parents.map((row) => ({
        linkId: row.link_id,
        parentId: row.parent_id,
        parentName: row.parent_name,
        parentEmail: row.parent_email,
        avatarUrl: row.avatar_url,
        relationship: row.relationship,
        isPrimary: row.is_primary,
        permissions: {
          canViewAttendance: row.can_view_attendance,
          canViewMarks: row.can_view_marks,
          canViewAssignments: row.can_view_assignments,
          canViewCgpa: row.can_view_cgpa,
          canViewReports: row.can_view_reports,
          canViewFees: row.can_view_fees,
        },
      })),
      scopes: [
        { key: 'canViewAttendance', label: 'Attendance', description: 'Daily and subject-wise attendance records' },
        { key: 'canViewMarks', label: 'Marks', description: 'Assessment results and subject averages' },
        { key: 'canViewCgpa', label: 'CGPA', description: 'Overall grade point average and rank' },
        { key: 'canViewAssignments', label: 'Assignments', description: 'Assignment status, deadlines and grades' },
        { key: 'canViewReports', label: 'Performance reports', description: 'Progress reports and AI insights' },
        { key: 'canViewFees', label: 'Fees', description: 'Fee records, dues and payment history' },
      ],
    },
    'Privacy settings'
  );
});

/**
 * PATCH /api/privacy
 *
 * Applies to one parent link when `parentId` is given, or to every link when
 * it is not. The master switch lives on the student profile.
 */
export const updatePrivacySettings = asyncHandler(async (req, res) => {
  const { parentPermissionEnabled, parentId, ...scopes } = req.body;

  const result = await withTransaction(async (tx) => {
    const changes = {};

    if (parentPermissionEnabled !== undefined) {
      await tx.query('UPDATE student_profiles SET parent_permission_enabled = $1 WHERE user_id = $2', [
        parentPermissionEnabled,
        req.user.id,
      ]);
      changes.parentPermissionEnabled = parentPermissionEnabled;
    }

    const updates = [];
    const params = [];
    for (const [key, column] of Object.entries(SCOPE_COLUMNS)) {
      if (scopes[key] !== undefined) {
        params.push(scopes[key]);
        updates.push(`${column} = $${params.length}`);
        changes[key] = scopes[key];
      }
    }

    if (updates.length) {
      params.push(req.user.id);
      let where = `student_id = $${params.length}`;
      if (parentId) {
        params.push(parentId);
        where += ` AND parent_id = $${params.length}`;
      }

      const { rowCount } = await tx.query(
        `UPDATE parent_student SET ${updates.join(', ')} WHERE ${where}`,
        params
      );

      if (parentId && !rowCount) {
        throw ApiError.notFound('That parent is not linked to your account');
      }
      changes.linksUpdated = rowCount;
    }

    return changes;
  });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PRIVACY_UPDATED,
    entity: 'student_profile',
    entityId: req.user.id,
    metadata: result,
  });

  // Parents are told that access changed — silently losing a dashboard is
  // confusing, and the student's decision is not a secret from them.
  const affected = parentId
    ? [{ parent_id: parentId }]
    : await queryMany('SELECT parent_id FROM parent_student WHERE student_id = $1', [req.user.id]);

  await Promise.all(
    affected.map((row) =>
      notify({
        userId: row.parent_id,
        title: 'Privacy settings updated',
        message: `${req.user.name} has updated what you can see about their academic record.`,
        type: NOTIFICATION_TYPES.SYSTEM,
        link: '/parent/children',
      })
    )
  );

  return sendSuccess(res, result, 'Privacy settings saved');
});

/** DELETE /api/privacy/parents/:parentId — revoke a parent link entirely. */
export const unlinkParent = asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM parent_student WHERE student_id = $1 AND parent_id = $2',
    [req.user.id, req.params.parentId]
  );

  if (!rowCount) throw ApiError.notFound('That parent is not linked to your account');

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PARENT_UNLINKED,
    entity: 'parent_student',
    entityId: req.params.parentId,
  });

  return sendSuccess(res, null, 'Parent access removed');
});

export default { getPrivacySettings, updatePrivacySettings, unlinkParent };
