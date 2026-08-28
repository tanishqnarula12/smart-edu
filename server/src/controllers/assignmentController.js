import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { recordAudit, AUDIT_ACTIONS } from '../utils/audit.js';
import { fileUrl } from '../middleware/upload.js';
import * as assignmentService from '../services/assignmentService.js';
import * as access from '../services/accessService.js';
import { notifyClass, notify, notifyParentsOf, NOTIFICATION_TYPES } from '../services/notificationService.js';

/** A teacher may only manage assignments they created; admins may manage any. */
async function assertCanManage(req, assignment) {
  if (req.user.role === 'admin') return;
  if (assignment.teacher_id !== req.user.id) {
    throw ApiError.forbidden('You can only manage assignments you created');
  }
}

/** GET /api/assignments — role-aware listing. */
export const listAssignments = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  if (req.user.role === 'student') {
    const { assignments, total } = await assignmentService.getStudentAssignments(req.user.id, {
      status: req.query.status,
      subjectId: req.query.subjectId,
      sourceKind: req.query.sourceKind,
      limit,
      offset,
    });

    return sendPaginated(
      res,
      assignments.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        dueDate: row.due_date,
        maxMarks: row.max_marks,
        attachmentUrl: row.attachment_url,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectCode: row.subject_code,
        teacherName: row.teacher_name,
        status: row.derived_status,
        isOverdue: row.is_overdue,
        submittedAt: row.submitted_at,
        marks: row.marks,
        feedback: row.feedback,
        sourceKind: row.source_kind,
        isAutoGraded: row.is_auto_graded,
      })),
      buildPaginationMeta({ page, limit }, total),
      'Assignments'
    );
  }

  if (req.user.role === 'parent') {
    const studentId = req.query.studentId;
    if (!studentId) throw ApiError.badRequest('A studentId is required');
    await access.assertParentCanView(req.user.id, studentId, 'assignments');

    const { assignments, total } = await assignmentService.getStudentAssignments(studentId, {
      status: req.query.status,
      sourceKind: req.query.sourceKind,
      limit,
      offset,
    });

    return sendPaginated(
      res,
      assignments.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
        maxMarks: row.max_marks,
        subjectName: row.subject_name,
        teacherName: row.teacher_name,
        status: row.derived_status,
        isOverdue: row.is_overdue,
        submittedAt: row.submitted_at,
        marks: row.marks,
      })),
      buildPaginationMeta({ page, limit }, total),
      'Assignments'
    );
  }

  // Teacher / admin
  const { assignments, total } = await assignmentService.getTeacherAssignments({
    teacherId: req.user.role === 'teacher' ? req.user.id : undefined,
    classId: req.query.classId,
    subjectId: req.query.subjectId,
    sourceKind: req.query.sourceKind,
    limit,
    offset,
  });

  return sendPaginated(
    res,
    assignments.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      maxMarks: row.max_marks,
      attachmentUrl: row.attachment_url,
      isPublished: row.is_published,
      subjectName: row.subject_name,
      className: `${row.class_name} ${row.section}`,
      classId: row.class_id,
      classSize: row.class_size,
      submissionCount: row.submission_count,
      gradedCount: row.graded_count,
      createdAt: row.created_at,
      sourceKind: row.source_kind,
    })),
    buildPaginationMeta({ page, limit }, total),
    'Assignments'
  );
});

/** GET /api/assignments/:id */
export const getAssignment = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.getAssignment(req.params.id);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  // Students only see assignments set for their own class.
  if (req.user.role === 'student') {
    const { assignments } = await assignmentService.getStudentAssignments(req.user.id, { limit: 500 });
    const own = assignments.find((row) => row.id === assignment.id);
    if (!own) throw ApiError.forbidden('This assignment was not set for your class');

    return sendSuccess(
      res,
      {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        instructions: assignment.instructions,
        dueDate: assignment.due_date,
        maxMarks: assignment.max_marks,
        attachmentUrl: assignment.attachment_url,
        questions: assignment.questions,
        sourceKind: assignment.source_kind,
        subjectName: assignment.subject_name,
        teacherName: assignment.teacher_name,
        status: own.derived_status,
        isOverdue: own.is_overdue,
        submission: own.submission_id
          ? {
              id: own.submission_id,
              content: own.submission_content,
              submissionUrl: own.submission_url,
              submittedAt: own.submitted_at,
              marks: own.marks,
              feedback: own.feedback,
              isAutoGraded: own.is_auto_graded,
            }
          : null,
      },
      'Assignment'
    );
  }

  if (req.user.role === 'parent') {
    throw ApiError.forbidden('Open assignments from your child’s assignment list');
  }

  return sendSuccess(res, assignment, 'Assignment');
});

/** POST /api/assignments */
export const createAssignment = asyncHandler(async (req, res) => {
  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(
      req.user.id,
      req.body.subjectId,
      req.body.classId
    );
    if (!teaches) throw ApiError.forbidden('You do not teach this subject in this class');
  }

  const attachmentUrl = req.file ? fileUrl(req.file) : req.body.attachmentUrl;
  const assignment = await assignmentService.createAssignment(
    { ...req.body, attachmentUrl },
    req.user.id
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ASSIGNMENT_CREATED,
    entity: 'assignment',
    entityId: assignment.id,
    metadata: { title: assignment.title, classId: assignment.class_id },
  });

  if (assignment.is_published) {
    await notifyClass(assignment.class_id, {
      title: 'New assignment',
      message: `"${assignment.title}" is due ${new Date(assignment.due_date).toLocaleDateString()}.`,
      type: NOTIFICATION_TYPES.ASSIGNMENT,
      link: `/student/assignments/${assignment.id}`,
    });
  }

  return sendCreated(res, assignment, 'Assignment created');
});

/** PATCH /api/assignments/:id */
export const updateAssignment = asyncHandler(async (req, res) => {
  const existing = await assignmentService.getAssignment(req.params.id);
  if (!existing) throw ApiError.notFound('Assignment not found');
  await assertCanManage(req, existing);

  const attachmentUrl = req.file ? fileUrl(req.file) : req.body.attachmentUrl;
  const updated = await assignmentService.updateAssignment(req.params.id, {
    ...req.body,
    ...(attachmentUrl !== undefined ? { attachmentUrl } : {}),
  });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ASSIGNMENT_UPDATED,
    entity: 'assignment',
    entityId: req.params.id,
    metadata: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, updated, 'Assignment updated');
});

/** DELETE /api/assignments/:id */
export const deleteAssignment = asyncHandler(async (req, res) => {
  const existing = await assignmentService.getAssignment(req.params.id);
  if (!existing) throw ApiError.notFound('Assignment not found');
  await assertCanManage(req, existing);

  await assignmentService.deleteAssignment(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ASSIGNMENT_DELETED,
    entity: 'assignment',
    entityId: req.params.id,
    metadata: { title: existing.title },
  });

  return sendSuccess(res, null, 'Assignment deleted');
});

/** POST /api/assignments/:id/submit — student only. */
export const submitAssignment = asyncHandler(async (req, res) => {
  const submissionUrl = req.file ? fileUrl(req.file) : req.body.submissionUrl;
  const hasSelectedAnswers = Boolean(
    req.body.selectedAnswers && Object.keys(req.body.selectedAnswers).length
  );

  if (!submissionUrl && !req.body.content?.trim() && !hasSelectedAnswers) {
    throw ApiError.badRequest('Attach a file or write your answer before submitting');
  }

  const { submission, assignment, isLate, autoGraded } = await assignmentService.submitAssignment(
    req.params.id,
    req.user.id,
    { content: req.body.content, submissionUrl, selectedAnswers: req.body.selectedAnswers }
  );

  // An auto-graded quiz has nothing left for the teacher to do — spare them
  // a "please grade this" notification for every student's attempt.
  if (!autoGraded) {
    await notify({
      userId: assignment.teacher_id,
      title: isLate ? 'Late submission received' : 'New submission',
      message: `${req.user.name} submitted "${assignment.title}".`,
      type: NOTIFICATION_TYPES.ASSIGNMENT,
      link: `/teacher/assignments/${assignment.id}`,
    });
  }

  return sendSuccess(
    res,
    submission,
    autoGraded
      ? 'Submitted and graded'
      : isLate
        ? 'Submitted after the deadline — your teacher will see it flagged as late'
        : 'Assignment submitted'
  );
});

/** GET /api/assignments/:id/submissions — teacher/admin. */
export const getSubmissions = asyncHandler(async (req, res) => {
  const { assignment, submissions } = await assignmentService.getSubmissions(req.params.id);
  await assertCanManage(req, assignment);

  return sendSuccess(
    res,
    {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        maxMarks: assignment.max_marks,
        dueDate: assignment.due_date,
        subjectName: assignment.subject_name,
        className: `${assignment.class_name} ${assignment.section}`,
        classSize: assignment.class_size,
        submissionCount: assignment.submission_count,
        gradedCount: assignment.graded_count,
      },
      submissions: submissions.map((row) => ({
        studentId: row.student_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        rollNumber: row.roll_number,
        submissionId: row.submission_id,
        content: row.content,
        submissionUrl: row.submission_url,
        submittedAt: row.submitted_at,
        marks: row.marks,
        feedback: row.feedback,
        gradedAt: row.graded_at,
        status: row.status,
      })),
    },
    'Submissions'
  );
});

/** POST /api/submissions/:id/grade — teacher/admin. */
export const gradeSubmission = asyncHandler(async (req, res) => {
  // Authorise before writing — never grade first and check afterwards.
  const target = await assignmentService.getSubmissionContext(req.params.id);
  if (!target) throw ApiError.notFound('Submission not found');

  if (req.user.role === 'teacher') {
    const teaches = await access.teacherTeachesSubjectInClass(
      req.user.id,
      target.subject_id,
      target.class_id
    );
    if (!teaches) throw ApiError.forbidden('You do not teach this subject in this class');
  }

  const { submission, assignment } = await assignmentService.gradeSubmission(
    req.params.id,
    req.body,
    req.user.id
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.SUBMISSION_GRADED,
    entity: 'submission',
    entityId: submission.id,
    metadata: { marks: submission.marks, assignment: assignment.title },
  });

  await notify({
    userId: submission.student_id,
    title: 'Assignment graded',
    message: `"${assignment.title}" has been graded: ${submission.marks}/${assignment.max_marks}.`,
    type: NOTIFICATION_TYPES.ASSIGNMENT,
    link: `/student/assignments/${assignment.assignment_id}`,
  });

  await notifyParentsOf(
    submission.student_id,
    {
      title: 'Assignment graded',
      message: `"${assignment.title}" was graded ${submission.marks}/${assignment.max_marks}.`,
      type: NOTIFICATION_TYPES.ASSIGNMENT,
      link: '/parent/assignments',
    },
    'assignments'
  );

  return sendSuccess(res, submission, 'Submission graded');
});

/** GET /api/assignments/stats — completion overview. */
export const getStats = asyncHandler(async (req, res) => {
  const classIds = req.user.role === 'teacher' ? await access.getTeacherClassIds(req.user.id) : null;
  const stats = await assignmentService.getCompletionStats({
    classIds,
    sourceKind: req.query.sourceKind,
  });
  return sendSuccess(res, stats, 'Assignment completion');
});

export default {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getSubmissions,
  gradeSubmission,
  getStats,
};
