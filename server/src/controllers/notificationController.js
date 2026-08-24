import { query, queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

/**
 * Notification centre (§46). Every query is scoped to `req.user.id` — a
 * notification belongs to exactly one person and there is no cross-user read.
 */

/** GET /api/notifications */
export const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = ['user_id = $1'];
  const params = [req.user.id];

  if (req.query.unreadOnly === 'true') conditions.push('NOT is_read');
  if (req.query.type) {
    params.push(req.query.type);
    conditions.push(`type = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [countRow, unreadRow] = await Promise.all([
    queryOne(`SELECT COUNT(*)::int AS total FROM notifications ${where}`, params),
    queryOne(
      'SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND NOT is_read',
      [req.user.id]
    ),
  ]);

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT id, title, message, type, link, is_read, created_at
       FROM notifications ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      link: row.link,
      isRead: row.is_read,
      createdAt: row.created_at,
    })),
    { ...buildPaginationMeta({ page, limit }, countRow?.total ?? 0), unreadCount: unreadRow?.unread ?? 0 },
    'Notifications'
  );
});

/** GET /api/notifications/unread-count — polled by the navbar bell. */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const row = await queryOne(
    'SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND NOT is_read',
    [req.user.id]
  );
  return sendSuccess(res, { unreadCount: row?.unread ?? 0 }, 'Unread count');
});

/** PATCH /api/notifications/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw ApiError.notFound('Notification not found');
  return sendSuccess(res, { id: rows[0].id }, 'Marked as read');
});

/** PATCH /api/notifications/read-all */
export const markAllRead = asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read',
    [req.user.id]
  );
  return sendSuccess(res, { updated: rowCount }, `${rowCount} notification(s) marked as read`);
});

/** DELETE /api/notifications/:id */
export const deleteNotification = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  if (!rowCount) throw ApiError.notFound('Notification not found');
  return sendSuccess(res, null, 'Notification removed');
});

/** DELETE /api/notifications — clear the whole list. */
export const clearAll = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
  return sendSuccess(res, { deleted: rowCount }, 'Notifications cleared');
});

export default {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  clearAll,
};
