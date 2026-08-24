import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { queryOne, query } from '../db/pool.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import * as attendanceService from '../services/attendanceService.js';
import * as access from '../services/accessService.js';
import { notify, notifyParentsOf, NOTIFICATION_TYPES } from '../services/notificationService.js';

/**
 * Attendance endpoints.
 *
 * `resolveStudentId` is the pattern used across the read endpoints: a student
 * implicitly means themselves, everyone else must name a student and pass the
 * access check for the relevant privacy scope.
 */
async function resolveStudentId(req, scope = 'attendance') {
  const requested = req.validatedQuery?.studentId || req.query.studentId || req.params.studentId;

  if (req.user.role === 'student') {
    if (requested && requested !== req.user.id) {
      throw ApiError.forbidden('You can only view your own attendance');
    }
    return req.user.id;
  }

  if (!requested) throw ApiError.badRequest('A studentId is required');
  await access.assertCanAccessStudentData(req.user, requested, scope);
  return requested;
}

/** POST /api/attendance — submit a register (teacher/admin). */
export const markAttendance = asyncHandler(async (req, res) => {
  const { classId, subjectId, date, records } = req.body;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(req.user.id, subjectId, classId);
    if (!teaches) {
      throw ApiError.forbidden('You are not assigned to teach this subject in this class');
    }
  }

  const alreadyExists = await attendanceService.registerExists({ classId, subjectId, date });

  const result = await attendanceService.markAttendance({
    classId,
    subjectId,
    date,
    records,
    teacherId: req.user.role === 'teacher' ? req.user.id : req.body.teacherId ?? req.user.id,
  });

  await recordAudit({
    req,
    action: alreadyExists ? AUDIT_ACTIONS.ATTENDANCE_UPDATED : AUDIT_ACTIONS.ATTENDANCE_MARKED,
    entity: 'attendance',
    entityId: `${classId}:${subjectId}:${date}`,
    metadata: { ...result, amended: alreadyExists },
  });

  // Tell absent students (and the parents they've shared attendance with).
  const absentees = records.filter((record) => record.status === 'absent').map((r) => r.studentId);
  const subject = await queryOne('SELECT name FROM subjects WHERE id = $1', [subjectId]);

  await Promise.all(
    absentees.map(async (studentId) => {
      await notify({
        userId: studentId,
        title: 'Marked absent',
        message: `You were marked absent for ${subject?.name ?? 'a class'} on ${date}.`,
        type: NOTIFICATION_TYPES.ATTENDANCE,
        link: '/student/attendance',
      });
      await notifyParentsOf(
        studentId,
        {
          title: 'Attendance update',
          message: `Your child was marked absent for ${subject?.name ?? 'a class'} on ${date}.`,
          type: NOTIFICATION_TYPES.ATTENDANCE,
          link: '/parent/attendance',
        },
        'attendance'
      );
    })
  );

  return sendSuccess(
    res,
    result,
    alreadyExists ? 'Attendance updated for this date' : 'Attendance recorded'
  );
});

/** GET /api/attendance/register — the marking sheet for a class × subject × date. */
export const getRegister = asyncHandler(async (req, res) => {
  const { classId, subjectId, date } = req.query;
  if (!classId || !subjectId || !date) {
    throw ApiError.badRequest('classId, subjectId and date are all required');
  }

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(req.user.id, subjectId, classId);
    if (!teaches) throw ApiError.forbidden('You do not teach this subject in this class');
  }

  const students = await attendanceService.getRegister({ classId, subjectId, date });
  const alreadyMarked = students.some((student) => student.attendance_id);

  return sendSuccess(
    res,
    {
      classId,
      subjectId,
      date,
      alreadyMarked,
      students: students.map((student) => ({
        studentId: student.student_id,
        name: student.name,
        avatarUrl: student.avatar_url,
        rollNumber: student.roll_number,
        admissionNumber: student.admission_number,
        // Default to present so "mark all present, flag the exceptions" is
        // the fast path teachers actually use.
        status: student.status ?? 'present',
        remarks: student.remarks ?? null,
        isRecorded: Boolean(student.attendance_id),
      })),
    },
    alreadyMarked ? 'Attendance already recorded for this date' : 'Register ready'
  );
});

/** GET /api/attendance/summary — overall + subject-wise + monthly trend. */
export const getSummary = asyncHandler(async (req, res) => {
  const studentId = await resolveStudentId(req);
  const months = Number(req.query.months) || 6;

  const [summary, subjects, trend] = await Promise.all([
    attendanceService.getStudentSummary(studentId),
    attendanceService.getStudentSubjectBreakdown(studentId),
    attendanceService.getMonthlyTrend(studentId, months),
  ]);

  return sendSuccess(res, { summary, subjects, monthlyTrend: trend }, 'Attendance summary');
});

/** GET /api/attendance — paginated day-by-day records. */
export const listRecords = asyncHandler(async (req, res) => {
  const studentId = await resolveStudentId(req);
  const { page, limit, offset } = getPagination(req.query);

  const { records, total } = await attendanceService.getStudentRecords(studentId, {
    from: req.query.from,
    to: req.query.to,
    subjectId: req.query.subjectId,
    limit,
    offset,
  });

  return sendPaginated(res, records, buildPaginationMeta({ page, limit }, total), 'Attendance records');
});

/** GET /api/attendance/class/:classId — class overview (teacher/admin). */
export const getClassOverview = asyncHandler(async (req, res) => {
  const { classId } = req.params;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesClass(req.user.id, classId);
    if (!teaches) throw ApiError.forbidden('This class is not assigned to you');
  }

  const overview = await attendanceService.getClassOverview(classId);
  return sendSuccess(res, overview, 'Class attendance overview');
});

/** GET /api/attendance/low — students below the threshold. */
export const getLowAttendance = asyncHandler(async (req, res) => {
  const threshold = Number(req.query.threshold) || attendanceService.THRESHOLD;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  // Teachers only ever see their own classes.
  const classIds = req.user.role === 'teacher' ? await access.getTeacherClassIds(req.user.id) : null;

  const students = await attendanceService.getLowAttendanceStudents({ classIds, threshold, limit });

  return sendSuccess(
    res,
    {
      threshold,
      count: students.length,
      students: students.map((student) => ({
        studentId: student.student_id,
        name: student.name,
        email: student.email,
        avatarUrl: student.avatar_url,
        rollNumber: student.roll_number,
        classId: student.class_id,
        className: student.class_name ? `${student.class_name} ${student.section}` : null,
        totalClasses: student.total_classes,
        presentCount: student.present_count,
        absentCount: student.absent_count,
        attendancePercentage: student.attendance_percentage,
      })),
    },
    `${students.length} student(s) below ${threshold}% attendance`
  );
});

/** PATCH /api/attendance/:id — amend a single record. */
export const updateRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body;

  const record = await queryOne(
    'SELECT id, student_id, subject_id, class_id, date, status FROM attendance WHERE id = $1',
    [id]
  );
  if (!record) throw ApiError.notFound('Attendance record not found');

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(
      req.user.id,
      record.subject_id,
      record.class_id
    );
    if (!teaches) throw ApiError.forbidden('You cannot amend attendance for this class');
  }

  const { rows } = await query(
    `UPDATE attendance SET status = $1, remarks = $2, teacher_id = $3 WHERE id = $4
     RETURNING id, student_id, subject_id, date, status, remarks`,
    [status, remarks ?? null, req.user.id, id]
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
    entity: 'attendance',
    entityId: id,
    metadata: { from: record.status, to: status },
  });

  return sendSuccess(res, rows[0], 'Attendance record updated');
});

export default {
  markAttendance,
  getRegister,
  getSummary,
  listRecords,
  getClassOverview,
  getLowAttendance,
  updateRecord,
};
