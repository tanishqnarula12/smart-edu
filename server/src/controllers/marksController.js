import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import * as marksService from '../services/marksService.js';
import * as access from '../services/accessService.js';
import { notifyMany, notifyParentsOf, NOTIFICATION_TYPES } from '../services/notificationService.js';

/** Resolve which student's marks the caller is asking for, with permission. */
async function resolveStudentId(req, scope = 'marks') {
  const requested = req.validatedQuery?.studentId || req.query.studentId || req.params.studentId;

  if (req.user.role === 'student') {
    if (requested && requested !== req.user.id) {
      throw ApiError.forbidden('You can only view your own marks');
    }
    return req.user.id;
  }

  if (!requested) throw ApiError.badRequest('A studentId is required');
  await access.assertCanAccessStudentData(req.user, requested, scope);
  return requested;
}

/** Teachers may only touch assessments in classes/subjects they teach. */
async function assertCanManageAssessment(req, assessment) {
  if (req.user.role === 'admin') return;
  const teaches = await access.teacherTeachesSubjectInClass(
    req.user.id,
    assessment.subject_id,
    assessment.class_id
  );
  if (!teaches) throw ApiError.forbidden('You do not teach this subject in this class');
}

// ───────────────────────────── ASSESSMENTS ────────────────────────────────

/** POST /api/marks/assessments */
export const createAssessment = asyncHandler(async (req, res) => {
  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(
      req.user.id,
      req.body.subjectId,
      req.body.classId
    );
    if (!teaches) throw ApiError.forbidden('You do not teach this subject in this class');
  }

  const assessment = await marksService.createAssessment(req.body, req.user.id);
  return sendCreated(res, assessment, 'Assessment created');
});

/** GET /api/marks/assessments */
export const listAssessments = asyncHandler(async (req, res) => {
  const isStaff = req.user.role === 'admin' || req.user.role === 'teacher';

  const assessments = await marksService.listAssessments({
    classId: req.query.classId,
    subjectId: req.query.subjectId,
    // A teacher listing without a class filter sees their own assessments.
    teacherId: req.user.role === 'teacher' && !req.query.classId ? req.user.id : undefined,
    includeUnpublished: isStaff,
  });

  return sendSuccess(res, assessments, 'Assessments');
});

/** GET /api/marks/assessments/:id/sheet — spreadsheet-style entry grid. */
export const getMarksSheet = asyncHandler(async (req, res) => {
  const { assessment, students } = await marksService.getMarksSheet(req.params.id);
  await assertCanManageAssessment(req, assessment);

  return sendSuccess(
    res,
    {
      assessment: {
        id: assessment.id,
        name: assessment.name,
        type: assessment.type,
        maxMarks: assessment.max_marks,
        date: assessment.date,
        isPublished: assessment.is_published,
        subjectName: assessment.subject_name,
        className: `${assessment.class_name} ${assessment.section}`,
      },
      students: students.map((student) => ({
        studentId: student.student_id,
        name: student.name,
        avatarUrl: student.avatar_url,
        rollNumber: student.roll_number,
        marksObtained: student.marks_obtained,
        isAbsent: student.is_absent ?? false,
        remarks: student.remarks,
        isRecorded: Boolean(student.mark_id),
      })),
    },
    'Marks sheet'
  );
});

/** POST /api/marks/assessments/:id/marks — bulk entry. */
export const enterMarks = asyncHandler(async (req, res) => {
  const assessment = await marksService.getAssessment(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  await assertCanManageAssessment(req, assessment);

  const result = await marksService.enterMarks(req.params.id, req.body.records, req.user.id);

  await recordAudit({
    req,
    action: result.wasPublished ? AUDIT_ACTIONS.MARKS_UPDATED : AUDIT_ACTIONS.MARKS_ENTERED,
    entity: 'assessment',
    entityId: req.params.id,
    metadata: { saved: result.saved, assessment: assessment.name },
  });

  return sendSuccess(res, result, `Marks saved for ${result.saved} student(s)`);
});

/** POST /api/marks/assessments/:id/publish */
export const publishAssessment = asyncHandler(async (req, res) => {
  const assessment = await marksService.getAssessment(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  await assertCanManageAssessment(req, assessment);

  const result = await marksService.publishAssessment(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.MARKS_PUBLISHED,
    entity: 'assessment',
    entityId: req.params.id,
    metadata: { name: assessment.name, students: result.studentIds.length },
  });

  await notifyMany(result.studentIds, {
    title: 'Marks published',
    message: `Your results for "${assessment.name}" (${assessment.subject_name}) are now available.`,
    type: NOTIFICATION_TYPES.MARKS,
    link: '/student/marks',
  });

  await Promise.all(
    result.studentIds.map((studentId) =>
      notifyParentsOf(
        studentId,
        {
          title: 'New marks published',
          message: `Results for "${assessment.name}" (${assessment.subject_name}) have been published.`,
          type: NOTIFICATION_TYPES.MARKS,
          link: '/parent/marks',
        },
        'marks'
      )
    )
  );

  return sendSuccess(res, { published: true }, 'Marks published to students and parents');
});

// ──────────────────────────── STUDENT READS ───────────────────────────────

/** GET /api/marks */
export const listMarks = asyncHandler(async (req, res) => {
  const studentId = await resolveStudentId(req);
  const marks = await marksService.getStudentMarks(studentId, {
    subjectId: req.query.subjectId,
    type: req.query.type,
    limit: Math.min(Number(req.query.limit) || 100, 200),
  });
  return sendSuccess(res, marks, 'Marks');
});

/** GET /api/marks/performance — subject averages, CGPA, rank, trend. */
export const getPerformance = asyncHandler(async (req, res) => {
  const studentId = await resolveStudentId(req);

  // CGPA is its own privacy scope: a parent may see marks but not the CGPA.
  let includeCgpa = true;
  if (req.user.role === 'parent') {
    const cgpaAccess = await access.parentCanView(req.user.id, studentId, 'cgpa');
    includeCgpa = cgpaAccess.allowed;
  }

  const [performance, trend, rank] = await Promise.all([
    marksService.getStudentPerformance(studentId),
    marksService.getPerformanceTrend(studentId),
    marksService.getClassRank(studentId),
  ]);

  const payload = { ...performance, trend, rank };
  if (!includeCgpa) {
    delete payload.cgpa;
    payload.cgpaHidden = true;
    payload.cgpaHiddenReason = 'The student has not shared their CGPA with you';
  }

  return sendSuccess(res, payload, 'Performance summary');
});

/** GET /api/marks/class/:classId — class-wide performance (teacher/admin). */
export const getClassPerformance = asyncHandler(async (req, res) => {
  const { classId } = req.params;

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesClass(req.user.id, classId);
    if (!teaches) throw ApiError.forbidden('This class is not assigned to you');
  }

  const performance = await marksService.getClassPerformance(classId);
  return sendSuccess(res, performance, 'Class performance');
});

/** GET /api/marks/declining — students whose scores are dropping. */
export const getDeclining = asyncHandler(async (req, res) => {
  const classIds = req.user.role === 'teacher' ? await access.getTeacherClassIds(req.user.id) : null;

  const students = await marksService.getDecliningStudents({
    classIds,
    minDrop: Number(req.query.minDrop) || 5,
    limit: Math.min(Number(req.query.limit) || 25, 100),
  });

  return sendSuccess(res, students, `${students.length} student(s) showing a decline`);
});

export default {
  createAssessment,
  listAssessments,
  getMarksSheet,
  enterMarks,
  publishAssessment,
  listMarks,
  getPerformance,
  getClassPerformance,
  getDeclining,
};
