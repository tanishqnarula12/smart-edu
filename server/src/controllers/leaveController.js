import { queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import { fileUrl } from '../middleware/upload.js';
import * as access from '../services/accessService.js';
import { notify, notifyParentsOf, NOTIFICATION_TYPES } from '../services/notificationService.js';

/** Leave applications (§16). Reviewed by the class teacher or an admin. */

/** POST /api/leave — student. */
export const applyForLeave = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, leaveType } = req.body;
  const attachmentUrl = req.file ? fileUrl(req.file) : req.body.attachmentUrl ?? null;

  const overlapping = await queryOne(
    `SELECT id FROM leave_applications
      WHERE student_id = $1 AND status <> 'rejected'
        AND daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')
      LIMIT 1`,
    [req.user.id, startDate, endDate]
  );
  if (overlapping) {
    throw ApiError.conflict('You already have a leave application covering those dates');
  }

  const application = await queryOne(
    `INSERT INTO leave_applications (student_id, start_date, end_date, reason, leave_type, attachment_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.id, startDate, endDate, reason, leaveType, attachmentUrl]
  );

  // The class teacher is the reviewer, so they are the one told about it.
  const classTeacher = await queryOne(
    `SELECT c.class_teacher_id
       FROM student_profiles sp JOIN classes c ON c.id = sp.class_id
      WHERE sp.user_id = $1`,
    [req.user.id]
  );

  if (classTeacher?.class_teacher_id) {
    await notify({
      userId: classTeacher.class_teacher_id,
      title: 'Leave application',
      message: `${req.user.name} has applied for leave from ${startDate} to ${endDate}.`,
      type: NOTIFICATION_TYPES.LEAVE,
      link: '/teacher/students',
    });
  }

  await notifyParentsOf(
    req.user.id,
    {
      title: 'Leave applied',
      message: `Your child applied for ${leaveType} leave from ${startDate} to ${endDate}.`,
      type: NOTIFICATION_TYPES.LEAVE,
      link: '/parent/dashboard',
    },
    'attendance'
  );

  return sendCreated(res, application, 'Leave application submitted');
});

/** GET /api/leave — scoped by role. */
export const listLeave = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const conditions = [];
  const params = [];

  if (req.user.role === 'student') {
    params.push(req.user.id);
    conditions.push(`l.student_id = $${params.length}`);
  } else if (req.user.role === 'teacher') {
    const classIds = await access.getTeacherClassIds(req.user.id);
    if (!classIds.length) {
      return sendPaginated(res, [], buildPaginationMeta({ page, limit }, 0), 'Leave applications');
    }
    params.push(classIds);
    conditions.push(`sp.class_id = ANY($${params.length}::uuid[])`);
  } else if (req.user.role === 'parent') {
    const studentId = req.query.studentId;
    if (!studentId) throw ApiError.badRequest('A studentId is required');
    await access.assertParentCanView(req.user.id, studentId, 'attendance');
    params.push(studentId);
    conditions.push(`l.student_id = $${params.length}`);
  }

  if (req.query.status) {
    params.push(req.query.status);
    conditions.push(`l.status = $${params.length}::leave_status`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total
       FROM leave_applications l
       JOIN student_profiles sp ON sp.user_id = l.student_id
       ${where}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT l.*, u.name AS student_name, u.avatar_url, sp.roll_number,
            c.name AS class_name, c.section,
            r.name AS reviewer_name
       FROM leave_applications l
       JOIN users u             ON u.id = l.student_id
       JOIN student_profiles sp ON sp.user_id = l.student_id
       LEFT JOIN classes c      ON c.id = sp.class_id
       LEFT JOIN users r        ON r.id = l.reviewed_by
       ${where}
      ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(
    res,
    rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
      avatarUrl: row.avatar_url,
      rollNumber: row.roll_number,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      startDate: row.start_date,
      endDate: row.end_date,
      days: Math.round((new Date(row.end_date) - new Date(row.start_date)) / 86_400_000) + 1,
      reason: row.reason,
      leaveType: row.leave_type,
      attachmentUrl: row.attachment_url,
      status: row.status,
      reviewNote: row.review_note,
      reviewerName: row.reviewer_name,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    })),
    buildPaginationMeta({ page, limit }, countRow?.total ?? 0),
    'Leave applications'
  );
});

/** PATCH /api/leave/:id/review — teacher/admin. */
export const reviewLeave = asyncHandler(async (req, res) => {
  const { status, reviewNote } = req.body;

  const application = await queryOne(
    `SELECT l.*, sp.class_id, u.name AS student_name
       FROM leave_applications l
       JOIN student_profiles sp ON sp.user_id = l.student_id
       JOIN users u             ON u.id = l.student_id
      WHERE l.id = $1`,
    [req.params.id]
  );
  if (!application) throw ApiError.notFound('Leave application not found');
  if (application.status !== 'pending') {
    throw ApiError.badRequest(`This application has already been ${application.status}`);
  }

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesClass(req.user.id, application.class_id);
    if (!teaches) throw ApiError.forbidden('This student is not in one of your classes');
  }

  const updated = await queryOne(
    `UPDATE leave_applications
        SET status = $1::leave_status, review_note = $2, reviewed_by = $3, reviewed_at = NOW()
      WHERE id = $4 RETURNING *`,
    [status, reviewNote ?? null, req.user.id, req.params.id]
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.LEAVE_REVIEWED,
    entity: 'leave_application',
    entityId: req.params.id,
    metadata: { status, student: application.student_name },
  });

  await notify({
    userId: application.student_id,
    title: `Leave ${status}`,
    message: `Your leave request for ${application.start_date} – ${application.end_date} was ${status}.${
      reviewNote ? ` Note: ${reviewNote}` : ''
    }`,
    type: NOTIFICATION_TYPES.LEAVE,
    link: '/student/leave',
  });

  await notifyParentsOf(
    application.student_id,
    {
      title: `Leave ${status}`,
      message: `Leave for ${application.start_date} – ${application.end_date} was ${status}.`,
      type: NOTIFICATION_TYPES.LEAVE,
      link: '/parent/dashboard',
    },
    'attendance'
  );

  return sendSuccess(res, updated, `Leave application ${status}`);
});

/** DELETE /api/leave/:id — a student may withdraw a pending request. */
export const cancelLeave = asyncHandler(async (req, res) => {
  const application = await queryOne(
    'SELECT id, student_id, status FROM leave_applications WHERE id = $1',
    [req.params.id]
  );
  if (!application) throw ApiError.notFound('Leave application not found');
  if (application.student_id !== req.user.id) {
    throw ApiError.forbidden('You can only withdraw your own applications');
  }
  if (application.status !== 'pending') {
    throw ApiError.badRequest('Only pending applications can be withdrawn');
  }

  await queryOne('DELETE FROM leave_applications WHERE id = $1 RETURNING id', [req.params.id]);
  return sendSuccess(res, null, 'Leave application withdrawn');
});

export default { applyForLeave, listLeave, reviewLeave, cancelLeave };
