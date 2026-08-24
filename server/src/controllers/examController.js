import { query, queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as access from '../services/accessService.js';
import { notifyClass, NOTIFICATION_TYPES } from '../services/notificationService.js';

/** Exam schedule (§16, §54). Students see their own class's exams. */

/** GET /api/exams */
export const listExams = asyncHandler(async (req, res) => {
  let classId = req.query.classId;

  if (req.user.role === 'student') {
    const profile = await queryOne('SELECT class_id FROM student_profiles WHERE user_id = $1', [
      req.user.id,
    ]);
    classId = profile?.class_id;
    if (!classId) return sendSuccess(res, [], 'No class assigned');
  } else if (req.user.role === 'parent') {
    const studentId = req.query.studentId;
    if (!studentId) throw ApiError.badRequest('A studentId is required');
    await access.assertParentCanView(req.user.id, studentId, 'marks');
    const profile = await queryOne('SELECT class_id FROM student_profiles WHERE user_id = $1', [studentId]);
    classId = profile?.class_id;
    if (!classId) return sendSuccess(res, [], 'No class assigned');
  }

  const conditions = [];
  const params = [];

  if (classId) {
    params.push(classId);
    conditions.push(`e.class_id = $${params.length}`);
  }
  if (req.query.upcoming === 'true') conditions.push('e.exam_date >= CURRENT_DATE');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await queryMany(
    `SELECT e.*, s.name AS subject_name, s.code AS subject_code,
            c.name AS class_name, c.section,
            (e.exam_date - CURRENT_DATE) AS days_away
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       JOIN classes c  ON c.id = e.class_id
       ${where}
      ORDER BY e.exam_date ASC, e.start_time ASC`,
    params
  );

  return sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      subjectCode: row.subject_code,
      className: `${row.class_name} ${row.section}`,
      examDate: row.exam_date,
      startTime: row.start_time,
      endTime: row.end_time,
      room: row.room,
      maxMarks: row.max_marks,
      syllabus: row.syllabus,
      daysAway: row.days_away,
      isPast: row.days_away < 0,
    })),
    'Exam schedule'
  );
});

/** POST /api/exams — teacher/admin. */
export const createExam = asyncHandler(async (req, res) => {
  const { name, classId, subjectId, examDate, startTime, endTime, room, maxMarks, syllabus } = req.body;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(req.user.id, subjectId, classId);
    if (!teaches) throw ApiError.forbidden('You do not teach this subject in this class');
  }

  const exam = await queryOne(
    `INSERT INTO exams (name, class_id, subject_id, exam_date, start_time, end_time, room, max_marks, syllabus)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [name, classId, subjectId, examDate, startTime ?? null, endTime ?? null, room ?? null, maxMarks, syllabus ?? null]
  );

  await notifyClass(classId, {
    title: 'Exam scheduled',
    message: `${name} is scheduled for ${examDate}.`,
    type: NOTIFICATION_TYPES.EXAM,
    link: '/student/exams',
  });

  return sendCreated(res, exam, 'Exam scheduled');
});

/** DELETE /api/exams/:id */
export const deleteExam = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM exams WHERE id = $1', [req.params.id]);
  if (!rowCount) throw ApiError.notFound('Exam not found');
  return sendSuccess(res, null, 'Exam removed');
});

export default { listExams, createExam, deleteExam };
