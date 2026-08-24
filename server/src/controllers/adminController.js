import { query, queryOne, queryMany, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import { healthCheck } from '../db/pool.js';
import { config } from '../config/env.js';

/** Admin control centre: permissions, settings and the audit trail (§30, §40). */

// ═══════════════════════════ PERMISSIONS ══════════════════════════════════

/** GET /api/admin/permissions — the catalogue and role defaults. */
export const listPermissions = asyncHandler(async (_req, res) => {
  const [permissions, rolePermissions] = await Promise.all([
    queryMany('SELECT id, code, label, category, description FROM permissions ORDER BY category, code'),
    queryMany(
      `SELECT rp.role, p.code
         FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id`
    ),
  ]);

  const byRole = { admin: [], teacher: [], student: [], parent: [] };
  for (const row of rolePermissions) byRole[row.role]?.push(row.code);

  const byCategory = permissions.reduce((acc, permission) => {
    (acc[permission.category] ??= []).push(permission);
    return acc;
  }, {});

  return sendSuccess(res, { permissions, byCategory, roleDefaults: byRole }, 'Permissions');
});

/** GET /api/admin/permissions/:userId — one user's effective permissions. */
export const getUserPermissions = asyncHandler(async (req, res) => {
  const user = await queryOne('SELECT id, name, role FROM users WHERE id = $1', [req.params.userId]);
  if (!user) throw ApiError.notFound('User not found');

  const rows = await queryMany(
    `SELECT p.id, p.code, p.label, p.category, p.description,
            (rp.role IS NOT NULL)                       AS from_role,
            up.granted                                  AS override,
            COALESCE(up.granted, rp.role IS NOT NULL)   AS effective
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role = $2
       LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = $1
      ORDER BY p.category, p.code`,
    [req.params.userId, user.role]
  );

  return sendSuccess(
    res,
    {
      user,
      permissions: rows.map((row) => ({
        code: row.code,
        label: row.label,
        category: row.category,
        description: row.description,
        fromRole: row.from_role,
        override: row.override,
        effective: row.effective,
      })),
    },
    'User permissions'
  );
});

/** PATCH /api/admin/permissions/:userId — grant or revoke, per user. */
export const updateUserPermissions = asyncHandler(async (req, res) => {
  const user = await queryOne('SELECT id, name, role FROM users WHERE id = $1', [req.params.userId]);
  if (!user) throw ApiError.notFound('User not found');

  // Removing manage_permissions from yourself locks you out of this screen.
  if (
    user.id === req.user.id &&
    req.body.permissions.some((p) => p.code === 'manage_permissions' && !p.granted)
  ) {
    throw ApiError.badRequest('You cannot revoke your own permission management access');
  }

  const changes = await withTransaction(async (tx) => {
    const applied = [];

    for (const { code, granted } of req.body.permissions) {
      const { rows } = await tx.query('SELECT id FROM permissions WHERE code = $1', [code]);
      if (!rows[0]) throw ApiError.badRequest(`Unknown permission: ${code}`);

      const permissionId = rows[0].id;

      const { rows: roleRows } = await tx.query(
        'SELECT 1 AS ok FROM role_permissions WHERE role = $1 AND permission_id = $2',
        [user.role, permissionId]
      );
      const isRoleDefault = Boolean(roleRows[0]);

      // A per-user row is only needed when it differs from the role baseline;
      // matching the default just clears the override.
      if (granted === isRoleDefault) {
        await tx.query('DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2', [
          user.id,
          permissionId,
        ]);
        applied.push({ code, granted, source: 'role default' });
      } else {
        await tx.query(
          `INSERT INTO user_permissions (user_id, permission_id, granted, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, permission_id)
           DO UPDATE SET granted = EXCLUDED.granted, assigned_by = EXCLUDED.assigned_by`,
          [user.id, permissionId, granted, req.user.id]
        );
        applied.push({ code, granted, source: 'override' });
      }
    }

    return applied;
  });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PERMISSIONS_CHANGED,
    entity: 'user',
    entityId: user.id,
    metadata: { user: user.name, changes },
  });

  return sendSuccess(res, { changes }, `Permissions updated for ${user.name}`);
});

// ════════════════════════════ SETTINGS ════════════════════════════════════

/** GET /api/admin/settings */
export const listSettings = asyncHandler(async (_req, res) => {
  const rows = await queryMany(
    `SELECT s.key, s.value, s.description, s.updated_at, u.name AS updated_by_name
       FROM settings s LEFT JOIN users u ON u.id = s.updated_by
      ORDER BY s.key`
  );

  return sendSuccess(
    res,
    {
      settings: rows,
      // Runtime facts an admin needs when diagnosing a deployment.
      runtime: {
        environment: config.nodeEnv,
        aiProvider: config.ai.provider,
        aiConfigured: config.ai.provider === 'mock' || Boolean(config.ai.apiKey),
        vectorProvider: config.vector.provider,
        paymentsConfigured: config.payments.enabled,
        storageDriver: config.storage.driver,
        attendanceThreshold: config.academic.attendanceThreshold,
      },
    },
    'Settings'
  );
});

/** PUT /api/admin/settings/:key */
export const updateSetting = asyncHandler(async (req, res) => {
  const row = await queryOne(
    `INSERT INTO settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           description = COALESCE(EXCLUDED.description, settings.description),
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     RETURNING *`,
    [req.params.key, JSON.stringify(req.body.value), req.body.description ?? null, req.user.id]
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entity: 'setting',
    entityId: req.params.key,
    metadata: { value: req.body.value },
  });

  return sendSuccess(res, row, 'Setting saved');
});

// ═══════════════════════════ AUDIT LOGS ═══════════════════════════════════

/** GET /api/admin/audit-logs */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = [];
  const params = [];

  if (req.query.action) {
    params.push(`${req.query.action}%`);
    conditions.push(`al.action LIKE $${params.length}`);
  }
  if (req.query.entity) {
    params.push(req.query.entity);
    conditions.push(`al.entity = $${params.length}`);
  }
  if (req.query.userId) {
    params.push(req.query.userId);
    conditions.push(`al.user_id = $${params.length}`);
  }
  if (req.query.from) {
    params.push(req.query.from);
    conditions.push(`al.created_at >= $${params.length}::timestamptz`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    conditions.push(`al.created_at <= $${params.length}::timestamptz`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR al.action ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id ${where}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT al.id, al.action, al.entity, al.entity_id, al.metadata,
            al.ip_address, al.created_at,
            u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
      ORDER BY al.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      user: row.user_id
        ? { id: row.user_id, name: row.user_name, email: row.user_email, role: row.user_role }
        : null,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Audit log'
  );
});

/** GET /api/admin/audit-logs/actions — the distinct actions, for the filter. */
export const listAuditActions = asyncHandler(async (_req, res) => {
  const rows = await queryMany(
    'SELECT action, COUNT(*)::int AS count FROM audit_logs GROUP BY action ORDER BY count DESC'
  );
  return sendSuccess(res, rows, 'Audit actions');
});

// ════════════════════════════ SYSTEM ══════════════════════════════════════

/** GET /api/admin/system — health and record counts. */
export const getSystemStatus = asyncHandler(async (_req, res) => {
  const [database, counts] = await Promise.all([
    healthCheck().catch((error) => ({ connected: false, error: error.message })),
    queryOne(
      `SELECT
         (SELECT COUNT(*) FROM users)::int          AS users,
         (SELECT COUNT(*) FROM attendance)::int     AS attendance_records,
         (SELECT COUNT(*) FROM marks)::int          AS marks,
         (SELECT COUNT(*) FROM assignments)::int    AS assignments,
         (SELECT COUNT(*) FROM submissions)::int    AS submissions,
         (SELECT COUNT(*) FROM notifications)::int  AS notifications,
         (SELECT COUNT(*) FROM audit_logs)::int     AS audit_entries`
    ),
  ]);

  return sendSuccess(
    res,
    {
      database,
      counts,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: config.nodeEnv,
    },
    'System status'
  );
});

/** POST /api/admin/recalculate-fees — refresh overdue flags. */
export const recalculateFeeStatuses = asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    `UPDATE fee_records
        SET status = CASE
          WHEN paid_amount >= total_amount   THEN 'paid'::fee_status
          WHEN due_date < CURRENT_DATE       THEN 'overdue'::fee_status
          WHEN paid_amount > 0               THEN 'partial'::fee_status
          ELSE 'pending'::fee_status
        END
      WHERE status <> CASE
          WHEN paid_amount >= total_amount   THEN 'paid'::fee_status
          WHEN due_date < CURRENT_DATE       THEN 'overdue'::fee_status
          WHEN paid_amount > 0               THEN 'partial'::fee_status
          ELSE 'pending'::fee_status
        END`
  );

  return sendSuccess(res, { updated: rowCount }, `${rowCount} fee record(s) reclassified`);
});

export default {
  listPermissions,
  getUserPermissions,
  updateUserPermissions,
  listSettings,
  updateSetting,
  listAuditLogs,
  listAuditActions,
  getSystemStatus,
  recalculateFeeStatuses,
};
