import { query, queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { notifyNoticeAudience } from '../services/notificationService.js';

/**
 * Notices (§13).
 *
 * Visibility rules, applied on every read:
 *   • a notice with no target_role and no class_id is institution-wide
 *   • target_role narrows it to one role
 *   • class_id narrows it to one class (students in it; staff still see it)
 *   • expired notices drop out automatically
 */
function visibilityClause(user, params) {
  if (user.role === 'admin') return 'TRUE';

  params.push(user.role);
  const rolePlaceholder = `$${params.length}`;
  params.push(user.id);
  const userPlaceholder = `$${params.length}`;

  return `(
    (n.expires_at IS NULL OR n.expires_at > NOW())
    AND (n.target_role IS NULL OR n.target_role = ${rolePlaceholder}::user_role)
    AND (
      n.class_id IS NULL
      OR ${rolePlaceholder} IN ('teacher')
      OR n.class_id = (SELECT class_id FROM student_profiles WHERE user_id = ${userPlaceholder})
      OR n.class_id IN (
        SELECT sp.class_id FROM student_profiles sp
         JOIN parent_student ps ON ps.student_id = sp.user_id
        WHERE ps.parent_id = ${userPlaceholder}
      )
    )
  )`;
}

/** GET /api/notices */
export const listNotices = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const params = [];
  const conditions = [visibilityClause(req.user, params)];

  if (req.query.category) {
    params.push(req.query.category);
    conditions.push(`n.category = $${params.length}`);
  }
  if (req.query.priority) {
    params.push(req.query.priority);
    conditions.push(`n.priority = $${params.length}::notice_priority`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    conditions.push(`(n.title ILIKE $${params.length} OR n.content ILIKE $${params.length})`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await queryOne(`SELECT COUNT(*)::int AS total FROM notices n ${where}`, params);

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT n.*, u.name AS author_name, u.role AS author_role, u.avatar_url AS author_avatar,
            c.name AS class_name, c.section
       FROM notices n
       LEFT JOIN users u   ON u.id = n.created_by
       LEFT JOIN classes c ON c.id = n.class_id
       ${where}
      ORDER BY n.is_pinned DESC,
               CASE n.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               n.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      priority: row.priority,
      category: row.category,
      isPinned: row.is_pinned,
      targetRole: row.target_role,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      authorName: row.author_name,
      authorRole: row.author_role,
      authorAvatar: row.author_avatar,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Notices'
  );
});

/** GET /api/notices/:id */
export const getNotice = asyncHandler(async (req, res) => {
  const params = [req.params.id];
  const visibility = visibilityClause(req.user, params);

  const row = await queryOne(
    `SELECT n.*, u.name AS author_name, u.role AS author_role
       FROM notices n
       LEFT JOIN users u ON u.id = n.created_by
      WHERE n.id = $1 AND ${visibility}`,
    params
  );

  if (!row) throw ApiError.notFound('Notice not found');
  return sendSuccess(res, row, 'Notice');
});

/** POST /api/notices — teacher/admin. */
export const createNotice = asyncHandler(async (req, res) => {
  const { title, content, targetRole, classId, priority, category, isPinned, expiresAt } = req.body;

  const notice = await queryOne(
    `INSERT INTO notices (title, content, created_by, target_role, class_id, priority, category, is_pinned, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      title,
      content,
      req.user.id,
      targetRole ?? null,
      classId ?? null,
      priority,
      category,
      isPinned ?? false,
      expiresAt || null,
    ]
  );

  const recipients = await notifyNoticeAudience(notice);

  return sendCreated(res, { ...notice, notified: recipients }, 'Notice published');
});

/** PATCH /api/notices/:id */
export const updateNotice = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT created_by FROM notices WHERE id = $1', [req.params.id]);
  if (!existing) throw ApiError.notFound('Notice not found');

  // Teachers may only edit their own notices.
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
    throw ApiError.forbidden('You can only edit notices you published');
  }

  const map = {
    title: 'title',
    content: 'content',
    targetRole: 'target_role',
    classId: 'class_id',
    priority: 'priority',
    category: 'category',
    isPinned: 'is_pinned',
    expiresAt: 'expires_at',
  };

  const updates = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key] || null);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (!updates.length) throw ApiError.badRequest('Provide at least one field to update');

  params.push(req.params.id);
  const row = await queryOne(
    `UPDATE notices SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  return sendSuccess(res, row, 'Notice updated');
});

/** DELETE /api/notices/:id */
export const deleteNotice = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT created_by FROM notices WHERE id = $1', [req.params.id]);
  if (!existing) throw ApiError.notFound('Notice not found');
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
    throw ApiError.forbidden('You can only delete notices you published');
  }

  await query('DELETE FROM notices WHERE id = $1', [req.params.id]);
  return sendSuccess(res, null, 'Notice removed');
});

export default { listNotices, getNotice, createNotice, updateNotice, deleteNotice };
