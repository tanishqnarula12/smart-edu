import crypto from 'node:crypto';
import { queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import { fileUrl } from '../middleware/upload.js';
import { notify, notifyRole, NOTIFICATION_TYPES } from '../services/notificationService.js';

/**
 * Complaints (§39).
 *
 * Anonymity is real, not cosmetic: when `isAnonymous` is set, `student_id` is
 * stored as NULL so there is nothing in the database linking the complaint to
 * its author. The tracking code returned to the student is the only way back
 * to it — which is why it is shown once and cannot be recovered.
 */

/** Human-friendly, unambiguous code — no 0/O or 1/I confusion. */
function generateTrackingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `SE-${code}`;
}

/** POST /api/complaints — student. */
export const createComplaint = asyncHandler(async (req, res) => {
  const { category, subject, description, isAnonymous } = req.body;
  const attachmentUrl = req.file ? fileUrl(req.file) : req.body.attachmentUrl ?? null;

  let trackingCode;
  let complaint;

  // Retry on the astronomically unlikely code collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    trackingCode = generateTrackingCode();
    try {
      complaint = await queryOne(
        `INSERT INTO complaints
           (student_id, is_anonymous, tracking_code, category, subject, description, attachment_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tracking_code, category, subject, status, created_at`,
        [
          isAnonymous ? null : req.user.id,
          isAnonymous,
          trackingCode,
          category,
          subject,
          description,
          attachmentUrl,
        ]
      );
      break;
    } catch (error) {
      if (error.code !== '23505' || attempt === 4) throw error;
    }
  }

  await notifyRole('admin', {
    title: 'New complaint submitted',
    message: `A ${category.replace('_', ' ')} complaint has been filed: "${subject}"`,
    type: NOTIFICATION_TYPES.COMPLAINT,
    link: '/admin/complaints',
  });

  return sendCreated(
    res,
    {
      ...complaint,
      trackingCode: complaint.tracking_code,
      isAnonymous,
      note: isAnonymous
        ? 'Save this tracking code — it is the only way to follow an anonymous complaint, and it cannot be recovered.'
        : 'You can follow this complaint from your complaints page.',
    },
    'Complaint submitted'
  );
});

/** GET /api/complaints — student sees their own, admin sees all. */
export const listComplaints = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = [];
  const params = [];

  if (req.user.role === 'student') {
    // Anonymous complaints are deliberately excluded: nothing ties them back.
    params.push(req.user.id);
    conditions.push(`c.student_id = $${params.length}`);
  } else if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Complaints are handled by administrators');
  }

  if (req.query.status) {
    params.push(req.query.status);
    conditions.push(`c.status = $${params.length}::complaint_status`);
  }
  if (req.query.category) {
    params.push(req.query.category);
    conditions.push(`c.category = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await queryOne(`SELECT COUNT(*)::int AS total FROM complaints c ${where}`, params);

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT c.id, c.tracking_code, c.category, c.subject, c.description, c.status,
            c.priority, c.response, c.attachment_url, c.created_at, c.resolved_at,
            c.is_anonymous,
            CASE WHEN c.is_anonymous THEN NULL ELSE u.name END  AS student_name,
            CASE WHEN c.is_anonymous THEN NULL ELSE u.id   END  AS student_id,
            a.name AS assigned_to_name
       FROM complaints c
       LEFT JOIN users u ON u.id = c.student_id
       LEFT JOIN users a ON a.id = c.assigned_to
       ${where}
      ORDER BY
        CASE c.status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,
        CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        c.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      id: row.id,
      trackingCode: row.tracking_code,
      category: row.category,
      subject: row.subject,
      description: row.description,
      status: row.status,
      priority: row.priority,
      response: row.response,
      attachmentUrl: row.attachment_url,
      isAnonymous: row.is_anonymous,
      studentName: row.student_name ?? (row.is_anonymous ? 'Anonymous' : null),
      studentId: row.student_id,
      assignedToName: row.assigned_to_name,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Complaints'
  );
});

/**
 * GET /api/complaints/track/:code
 * Lets an anonymous author check progress without identifying themselves.
 */
export const trackComplaint = asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT tracking_code, category, subject, status, priority, response, created_at, resolved_at
       FROM complaints WHERE tracking_code = $1`,
    [req.params.code.toUpperCase()]
  );

  if (!row) throw ApiError.notFound('No complaint found with that tracking code');
  return sendSuccess(res, row, 'Complaint status');
});

/** PATCH /api/complaints/:id — admin triage. */
export const updateComplaint = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, student_id, subject, status FROM complaints WHERE id = $1', [
    req.params.id,
  ]);
  if (!existing) throw ApiError.notFound('Complaint not found');

  const map = {
    status: 'status',
    priority: 'priority',
    assignedTo: 'assigned_to',
    response: 'response',
  };

  const updates = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }

  if (req.body.status === 'resolved' || req.body.status === 'rejected') {
    updates.push('resolved_at = NOW()');
  }

  params.push(req.params.id);
  const row = await queryOne(
    `UPDATE complaints SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.COMPLAINT_UPDATED,
    entity: 'complaint',
    entityId: req.params.id,
    metadata: { from: existing.status, to: row.status },
  });

  // Only a named complainant can be notified — anonymity has no address.
  if (existing.student_id && req.body.status) {
    await notify({
      userId: existing.student_id,
      title: 'Complaint update',
      message: `Your complaint "${existing.subject}" is now ${row.status.replace('_', ' ')}.`,
      type: NOTIFICATION_TYPES.COMPLAINT,
      link: '/student/complaints',
    });
  }

  return sendSuccess(res, row, 'Complaint updated');
});

/** GET /api/complaints/stats — admin dashboard tile. */
export const getStats = asyncHandler(async (_req, res) => {
  const row = await queryOne(
    `SELECT COUNT(*)::int                                                AS total,
            COUNT(*) FILTER (WHERE status = 'submitted')::int            AS submitted,
            COUNT(*) FILTER (WHERE status = 'under_review')::int         AS under_review,
            COUNT(*) FILTER (WHERE status = 'resolved')::int             AS resolved,
            COUNT(*) FILTER (WHERE status = 'rejected')::int             AS rejected,
            COUNT(*) FILTER (WHERE is_anonymous)::int                    AS anonymous
       FROM complaints`
  );

  const byCategory = await queryMany(
    'SELECT category, COUNT(*)::int AS count FROM complaints GROUP BY category ORDER BY count DESC'
  );

  return sendSuccess(
    res,
    { ...row, pending: row.submitted + row.under_review, byCategory },
    'Complaint statistics'
  );
});

export default { createComplaint, listComplaints, trackComplaint, updateComplaint, getStats };
