import { queryOne, queryMany, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as access from '../services/accessService.js';
import { notify, NOTIFICATION_TYPES } from '../services/notificationService.js';

/** Parent–teacher meetings (§17). Teachers publish slots; parents book them. */

/** GET /api/ptm/slots — available slots (parent) or own slots (teacher). */
export const listSlots = asyncHandler(async (req, res) => {
  if (req.user.role === 'teacher') {
    const rows = await queryMany(
      `SELECT s.*,
              b.id AS booking_id, b.status AS booking_status, b.agenda,
              p.name AS parent_name, st.name AS student_name
         FROM ptm_slots s
         LEFT JOIN ptm_bookings b ON b.slot_id = s.id AND b.status <> 'cancelled'
         LEFT JOIN users p        ON p.id = b.parent_id
         LEFT JOIN users st       ON st.id = b.student_id
        WHERE s.teacher_id = $1 AND s.date >= CURRENT_DATE - 30
        ORDER BY s.date, s.start_time`,
      [req.user.id]
    );
    return sendSuccess(res, rows, 'Your meeting slots');
  }

  // Parents see open slots from teachers who actually teach their children.
  const teacherFilter = req.query.teacherId ? [req.query.teacherId] : null;

  const rows = await queryMany(
    `SELECT s.*, u.name AS teacher_name, u.avatar_url AS teacher_avatar,
            tp.designation, d.name AS department_name,
            (b.id IS NOT NULL) AS is_booked
       FROM ptm_slots s
       JOIN users u                 ON u.id = s.teacher_id
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
       LEFT JOIN departments d       ON d.id = tp.department_id
       LEFT JOIN ptm_bookings b      ON b.slot_id = s.id AND b.status <> 'cancelled'
      WHERE s.date >= CURRENT_DATE
        AND s.is_available
        AND ($1::uuid[] IS NULL OR s.teacher_id = ANY($1::uuid[]))
        AND s.teacher_id IN (
          SELECT DISTINCT ts.teacher_id
            FROM teacher_subjects ts
            JOIN student_profiles sp ON sp.class_id = ts.class_id
            JOIN parent_student ps   ON ps.student_id = sp.user_id
           WHERE ps.parent_id = $2
        )
      ORDER BY s.date, s.start_time`,
    [teacherFilter, req.user.id]
  );

  return sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      teacherAvatar: row.teacher_avatar,
      designation: row.designation,
      departmentName: row.department_name,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      mode: row.mode,
      location: row.location,
      isBooked: row.is_booked,
    })),
    'Available meeting slots'
  );
});

/** POST /api/ptm/slots — teacher publishes availability. */
export const createSlot = asyncHandler(async (req, res) => {
  const { date, startTime, endTime, mode, location } = req.body;

  const slot = await queryOne(
    `INSERT INTO ptm_slots (teacher_id, date, start_time, end_time, mode, location)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.id, date, startTime, endTime, mode, location ?? null]
  );

  return sendCreated(res, slot, 'Availability published');
});

/** DELETE /api/ptm/slots/:id */
export const deleteSlot = asyncHandler(async (req, res) => {
  const slot = await queryOne('SELECT id, teacher_id FROM ptm_slots WHERE id = $1', [req.params.id]);
  if (!slot) throw ApiError.notFound('Slot not found');
  if (slot.teacher_id !== req.user.id && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only remove your own slots');
  }

  const booking = await queryOne(
    "SELECT id FROM ptm_bookings WHERE slot_id = $1 AND status <> 'cancelled'",
    [req.params.id]
  );
  if (booking) throw ApiError.conflict('This slot is booked — cancel the meeting before removing it');

  await queryOne('DELETE FROM ptm_slots WHERE id = $1 RETURNING id', [req.params.id]);
  return sendSuccess(res, null, 'Slot removed');
});

/** POST /api/ptm/bookings — parent books a slot. */
export const bookSlot = asyncHandler(async (req, res) => {
  const { slotId, studentId, agenda } = req.body;

  // A parent may only book a meeting about a child linked to them.
  const link = await access.getParentLink(req.user.id, studentId);
  if (!link) throw ApiError.forbidden('That student is not linked to your account');

  const booking = await withTransaction(async (tx) => {
    // Lock the slot so two parents cannot win the same one concurrently.
    const { rows: slotRows } = await tx.query(
      'SELECT * FROM ptm_slots WHERE id = $1 FOR UPDATE',
      [slotId]
    );
    const slot = slotRows[0];
    if (!slot) throw ApiError.notFound('Slot not found');
    if (!slot.is_available) throw ApiError.conflict('That slot is no longer available');
    if (new Date(`${slot.date}T${slot.end_time}`) < new Date()) {
      throw ApiError.badRequest('That slot is in the past');
    }

    const { rows: existing } = await tx.query(
      "SELECT id FROM ptm_bookings WHERE slot_id = $1 AND status <> 'cancelled'",
      [slotId]
    );
    if (existing.length) throw ApiError.conflict('That slot has just been booked by someone else');

    const { rows } = await tx.query(
      `INSERT INTO ptm_bookings (slot_id, parent_id, student_id, agenda)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [slotId, req.user.id, studentId, agenda ?? null]
    );

    return { ...rows[0], slot };
  });

  const student = await queryOne('SELECT name FROM users WHERE id = $1', [studentId]);

  await notify({
    userId: booking.slot.teacher_id,
    title: 'New meeting request',
    message: `${req.user.name} requested a meeting about ${student?.name ?? 'a student'} on ${
      booking.slot.date
    } at ${booking.slot.start_time}.`,
    type: NOTIFICATION_TYPES.PTM,
    link: '/teacher/dashboard',
  });

  return sendCreated(res, booking, 'Meeting requested');
});

/** GET /api/ptm/bookings — role-scoped meeting list. */
export const listBookings = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.user.role === 'parent') {
    params.push(req.user.id);
    conditions.push(`b.parent_id = $${params.length}`);
  } else if (req.user.role === 'teacher') {
    params.push(req.user.id);
    conditions.push(`s.teacher_id = $${params.length}`);
  } else if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Meetings are visible to parents, teachers and administrators');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await queryMany(
    `SELECT b.*, s.date, s.start_time, s.end_time, s.mode, s.location,
            t.id AS teacher_id, t.name AS teacher_name, t.avatar_url AS teacher_avatar,
            p.name AS parent_name,
            st.name AS student_name
       FROM ptm_bookings b
       JOIN ptm_slots s ON s.id = b.slot_id
       JOIN users t     ON t.id = s.teacher_id
       JOIN users p     ON p.id = b.parent_id
       JOIN users st    ON st.id = b.student_id
       ${where}
      ORDER BY s.date DESC, s.start_time DESC`,
    params
  );

  return sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      slotId: row.slot_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      mode: row.mode,
      location: row.location,
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      teacherAvatar: row.teacher_avatar,
      parentName: row.parent_name,
      studentName: row.student_name,
      agenda: row.agenda,
      status: row.status,
      teacherNote: row.teacher_note,
      isPast: new Date(`${row.date}T${row.end_time}`) < new Date(),
    })),
    'Meetings'
  );
});

/** PATCH /api/ptm/bookings/:id — confirm, cancel, reschedule or complete. */
export const updateBooking = asyncHandler(async (req, res) => {
  const { status, teacherNote, slotId } = req.body;

  const booking = await queryOne(
    `SELECT b.*, s.teacher_id, s.date, s.start_time
       FROM ptm_bookings b JOIN ptm_slots s ON s.id = b.slot_id
      WHERE b.id = $1`,
    [req.params.id]
  );
  if (!booking) throw ApiError.notFound('Meeting not found');

  const isTeacher = booking.teacher_id === req.user.id;
  const isParent = booking.parent_id === req.user.id;

  if (!isTeacher && !isParent && req.user.role !== 'admin') {
    throw ApiError.forbidden('You are not part of this meeting');
  }
  // Parents can withdraw; only the teacher decides confirmation.
  if (isParent && !['cancelled', 'rescheduled'].includes(status)) {
    throw ApiError.forbidden('Parents can only cancel or request to reschedule');
  }

  const updated = await withTransaction(async (tx) => {
    if (status === 'rescheduled' && slotId) {
      const { rows: slotRows } = await tx.query(
        'SELECT id, is_available FROM ptm_slots WHERE id = $1 FOR UPDATE',
        [slotId]
      );
      if (!slotRows[0]) throw ApiError.notFound('The new slot does not exist');

      const { rows: clash } = await tx.query(
        "SELECT id FROM ptm_bookings WHERE slot_id = $1 AND status <> 'cancelled' AND id <> $2",
        [slotId, req.params.id]
      );
      if (clash.length) throw ApiError.conflict('That slot is already booked');

      const { rows } = await tx.query(
        `UPDATE ptm_bookings SET slot_id = $1, status = 'rescheduled', teacher_note = $2
          WHERE id = $3 RETURNING *`,
        [slotId, teacherNote ?? null, req.params.id]
      );
      return rows[0];
    }

    const { rows } = await tx.query(
      `UPDATE ptm_bookings SET status = $1::ptm_status, teacher_note = COALESCE($2, teacher_note)
        WHERE id = $3 RETURNING *`,
      [status, teacherNote ?? null, req.params.id]
    );
    return rows[0];
  });

  // Tell whichever side did not make the change.
  const recipient = isTeacher ? booking.parent_id : booking.teacher_id;
  await notify({
    userId: recipient,
    title: `Meeting ${status}`,
    message: `The meeting on ${booking.date} at ${booking.start_time} is now ${status}.${
      teacherNote ? ` Note: ${teacherNote}` : ''
    }`,
    type: NOTIFICATION_TYPES.PTM,
    link: isTeacher ? '/parent/ptm' : '/teacher/dashboard',
  });

  return sendSuccess(res, updated, `Meeting ${status}`);
});

export default { listSlots, createSlot, deleteSlot, bookSlot, listBookings, updateBooking };
