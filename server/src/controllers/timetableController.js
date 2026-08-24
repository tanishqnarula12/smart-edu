import { query, queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as access from '../services/accessService.js';

/**
 * Timetable (§12).
 *
 * Conflict detection is the point of this module: a teacher cannot be in two
 * rooms at once, and a class cannot sit two lessons at once. Both are checked
 * before any insert or update.
 */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * Find rows that overlap the proposed slot.
 * Two ranges overlap when each starts before the other ends — the classic
 * `startA < endB AND startB < endA` test.
 */
async function findConflicts({ classId, teacherId, day, startTime, endTime, academicYear, excludeId = null }) {
  return queryMany(
    `SELECT t.id, t.day, t.start_time, t.end_time, t.room,
            c.name AS class_name, c.section,
            s.name AS subject_name,
            u.name AS teacher_name,
            CASE WHEN t.teacher_id = $2 THEN 'teacher' ELSE 'class' END AS conflict_type
       FROM timetable t
       JOIN classes c  ON c.id = t.class_id
       JOIN subjects s ON s.id = t.subject_id
       JOIN users u    ON u.id = t.teacher_id
      WHERE t.day = $3
        AND t.academic_year = $6
        AND (t.class_id = $1 OR t.teacher_id = $2)
        AND t.start_time < $5::time
        AND $4::time < t.end_time
        AND ($7::uuid IS NULL OR t.id <> $7::uuid)`,
    [classId, teacherId, day, startTime, endTime, academicYear, excludeId]
  );
}

/** GET /api/timetable — role-aware. */
export const getTimetable = asyncHandler(async (req, res) => {
  let classId = req.query.classId;
  let teacherId = req.query.teacherId;

  if (req.user.role === 'student') {
    const profile = await queryOne('SELECT class_id FROM student_profiles WHERE user_id = $1', [
      req.user.id,
    ]);
    if (!profile?.class_id) {
      return sendSuccess(res, { days: {}, entries: [] }, 'You are not assigned to a class yet');
    }
    classId = profile.class_id;
    teacherId = undefined;
  } else if (req.user.role === 'teacher' && !classId) {
    teacherId = req.user.id;
  } else if (req.user.role === 'parent') {
    const studentId = req.query.studentId;
    if (!studentId) throw ApiError.badRequest('A studentId is required');
    await access.assertParentCanView(req.user.id, studentId, 'attendance');

    const profile = await queryOne('SELECT class_id FROM student_profiles WHERE user_id = $1', [studentId]);
    classId = profile?.class_id;
    teacherId = undefined;
    if (!classId) return sendSuccess(res, { days: {}, entries: [] }, 'No class assigned');
  }

  const conditions = [];
  const params = [];
  if (classId) {
    params.push(classId);
    conditions.push(`t.class_id = $${params.length}`);
  }
  if (teacherId) {
    params.push(teacherId);
    conditions.push(`t.teacher_id = $${params.length}`);
  }
  if (req.query.academicYear) {
    params.push(req.query.academicYear);
    conditions.push(`t.academic_year = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await queryMany(
    `SELECT t.id, t.day, t.start_time, t.end_time, t.room, t.academic_year,
            s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            c.id AS class_id, c.name AS class_name, c.section,
            u.id AS teacher_id, u.name AS teacher_name, u.avatar_url AS teacher_avatar
       FROM timetable t
       JOIN subjects s ON s.id = t.subject_id
       JOIN classes c  ON c.id = t.class_id
       JOIN users u    ON u.id = t.teacher_id
       ${where}
      ORDER BY array_position($${params.length + 1}::text[], t.day::text), t.start_time`,
    [...params, DAYS]
  );

  // Group by weekday so the client can render a grid without regrouping.
  const days = Object.fromEntries(DAYS.map((day) => [day, []]));
  for (const row of rows) {
    days[row.day].push({
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time,
      room: row.room,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      subjectCode: row.subject_code,
      classId: row.class_id,
      className: `${row.class_name} ${row.section}`,
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      teacherAvatar: row.teacher_avatar,
    });
  }

  return sendSuccess(res, { days, entries: rows.length }, 'Timetable');
});

/** GET /api/timetable/today — today's classes for the dashboard. */
export const getToday = asyncHandler(async (req, res) => {
  const today = DAYS[(new Date().getDay() + 6) % 7]; // JS Sunday=0 → our Monday=0

  let filterColumn = 't.class_id';
  let filterValue;

  if (req.user.role === 'student') {
    const profile = await queryOne('SELECT class_id FROM student_profiles WHERE user_id = $1', [
      req.user.id,
    ]);
    if (!profile?.class_id) return sendSuccess(res, { day: today, classes: [] }, 'No class assigned');
    filterValue = profile.class_id;
  } else if (req.user.role === 'teacher') {
    filterColumn = 't.teacher_id';
    filterValue = req.user.id;
  } else if (req.user.role === 'parent') {
    const studentId = req.query.studentId;
    if (!studentId) return sendSuccess(res, { day: today, classes: [] }, 'No student selected');
    await access.assertParentCanView(req.user.id, studentId, 'attendance');
    const profile = await queryOne('SELECT class_id FROM student_profiles WHERE user_id = $1', [studentId]);
    if (!profile?.class_id) return sendSuccess(res, { day: today, classes: [] }, 'No class assigned');
    filterValue = profile.class_id;
  } else {
    // Admin: whole-institution view for today.
    const rows = await queryMany(
      `SELECT t.id, t.start_time, t.end_time, t.room,
              s.name AS subject_name, c.name AS class_name, c.section, u.name AS teacher_name
         FROM timetable t
         JOIN subjects s ON s.id = t.subject_id
         JOIN classes c  ON c.id = t.class_id
         JOIN users u    ON u.id = t.teacher_id
        WHERE t.day = $1
        ORDER BY t.start_time
        LIMIT 50`,
      [today]
    );
    return sendSuccess(res, { day: today, classes: rows }, "Today's schedule");
  }

  const rows = await queryMany(
    `SELECT t.id, t.start_time, t.end_time, t.room,
            s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            c.name AS class_name, c.section,
            u.name AS teacher_name, u.avatar_url AS teacher_avatar
       FROM timetable t
       JOIN subjects s ON s.id = t.subject_id
       JOIN classes c  ON c.id = t.class_id
       JOIN users u    ON u.id = t.teacher_id
      WHERE t.day = $1 AND ${filterColumn} = $2
      ORDER BY t.start_time`,
    [today, filterValue]
  );

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return sendSuccess(
    res,
    {
      day: today,
      classes: rows.map((row) => ({
        id: row.id,
        startTime: row.start_time,
        endTime: row.end_time,
        room: row.room,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectCode: row.subject_code,
        className: `${row.class_name} ${row.section}`,
        teacherName: row.teacher_name,
        teacherAvatar: row.teacher_avatar,
        isCurrent: row.start_time <= `${currentTime}:00` && `${currentTime}:00` < row.end_time,
        isPast: row.end_time <= `${currentTime}:00`,
      })),
    },
    "Today's schedule"
  );
});

/** POST /api/timetable — admin. */
export const createEntry = asyncHandler(async (req, res) => {
  const { classId, subjectId, teacherId, day, startTime, endTime, room, academicYear } = req.body;

  const conflicts = await findConflicts({ classId, teacherId, day, startTime, endTime, academicYear });
  if (conflicts.length) {
    const teacherClash = conflicts.find((c) => c.conflict_type === 'teacher');
    const message = teacherClash
      ? `${teacherClash.teacher_name} already teaches ${teacherClash.subject_name} to ` +
        `${teacherClash.class_name} ${teacherClash.section} at that time`
      : `This class already has ${conflicts[0].subject_name} scheduled at that time`;

    throw new ApiError(409, message, conflicts.map((c) => ({
      field: 'startTime',
      message: `${c.conflict_type} conflict: ${c.start_time}–${c.end_time}`,
      code: 'conflict',
    })));
  }

  const row = await queryOne(
    `INSERT INTO timetable (class_id, subject_id, teacher_id, day, start_time, end_time, room, academic_year)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [classId, subjectId, teacherId, day, startTime, endTime, room ?? null, academicYear]
  );

  return sendCreated(res, row, 'Timetable entry added');
});

/** PATCH /api/timetable/:id — admin. */
export const updateEntry = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM timetable WHERE id = $1', [req.params.id]);
  if (!existing) throw ApiError.notFound('Timetable entry not found');

  const merged = {
    classId: req.body.classId ?? existing.class_id,
    subjectId: req.body.subjectId ?? existing.subject_id,
    teacherId: req.body.teacherId ?? existing.teacher_id,
    day: req.body.day ?? existing.day,
    startTime: req.body.startTime ?? existing.start_time,
    endTime: req.body.endTime ?? existing.end_time,
    room: req.body.room ?? existing.room,
    academicYear: req.body.academicYear ?? existing.academic_year,
  };

  const conflicts = await findConflicts({ ...merged, excludeId: req.params.id });
  if (conflicts.length) {
    throw ApiError.conflict(
      `That slot clashes with ${conflicts[0].subject_name} for ${conflicts[0].class_name} ${conflicts[0].section}`
    );
  }

  const row = await queryOne(
    `UPDATE timetable
        SET class_id = $1, subject_id = $2, teacher_id = $3, day = $4,
            start_time = $5, end_time = $6, room = $7, academic_year = $8
      WHERE id = $9 RETURNING *`,
    [
      merged.classId,
      merged.subjectId,
      merged.teacherId,
      merged.day,
      merged.startTime,
      merged.endTime,
      merged.room,
      merged.academicYear,
      req.params.id,
    ]
  );

  return sendSuccess(res, row, 'Timetable entry updated');
});

/** DELETE /api/timetable/:id — admin. */
export const deleteEntry = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM timetable WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Timetable entry not found');
  return sendSuccess(res, null, 'Timetable entry removed');
});

/** GET /api/timetable/conflicts — audit the whole timetable at once. */
export const listConflicts = asyncHandler(async (req, res) => {
  const rows = await queryMany(
    `SELECT a.id AS entry_a, b.id AS entry_b, a.day,
            a.start_time AS a_start, a.end_time AS a_end,
            b.start_time AS b_start, b.end_time AS b_end,
            CASE WHEN a.teacher_id = b.teacher_id THEN 'teacher' ELSE 'class' END AS conflict_type,
            ta.name AS teacher_a, tb.name AS teacher_b,
            ca.name AS class_a, ca.section AS section_a,
            cb.name AS class_b, cb.section AS section_b,
            sa.name AS subject_a, sb.name AS subject_b
       FROM timetable a
       JOIN timetable b
         ON a.id < b.id
        AND a.day = b.day
        AND a.academic_year = b.academic_year
        AND a.start_time < b.end_time
        AND b.start_time < a.end_time
        AND (a.teacher_id = b.teacher_id OR a.class_id = b.class_id)
       JOIN users ta    ON ta.id = a.teacher_id
       JOIN users tb    ON tb.id = b.teacher_id
       JOIN classes ca  ON ca.id = a.class_id
       JOIN classes cb  ON cb.id = b.class_id
       JOIN subjects sa ON sa.id = a.subject_id
       JOIN subjects sb ON sb.id = b.subject_id
      ORDER BY a.day, a.start_time`
  );

  return sendSuccess(
    res,
    { count: rows.length, conflicts: rows },
    rows.length ? `${rows.length} scheduling conflict(s) found` : 'No conflicts — the timetable is clean'
  );
});

export default { getTimetable, getToday, createEntry, updateEntry, deleteEntry, listConflicts };
