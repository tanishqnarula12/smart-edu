import { queryOne, queryMany, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Assignments and submissions (§11).
 *
 * A submission row exists only once a student actually submits; "pending" is
 * therefore derived from the absence of a row rather than stored, which keeps
 * the table honest and avoids a nightly job to create placeholder rows.
 */

export async function createAssignment(data, teacherId) {
  return queryOne(
    `INSERT INTO assignments
       (title, description, instructions, subject_id, teacher_id, class_id,
        due_date, max_marks, attachment_url, questions, answer_key, source_kind, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      data.title,
      data.description ?? null,
      data.instructions ?? null,
      data.subjectId,
      teacherId,
      data.classId,
      data.dueDate,
      data.maxMarks,
      data.attachmentUrl ?? null,
      data.questions ? JSON.stringify(data.questions) : null,
      data.answerKey ? JSON.stringify(data.answerKey) : null,
      data.sourceKind ?? null,
      data.isPublished ?? true,
    ]
  );
}

export async function updateAssignment(assignmentId, data) {
  const map = {
    title: 'title',
    description: 'description',
    instructions: 'instructions',
    subjectId: 'subject_id',
    classId: 'class_id',
    dueDate: 'due_date',
    maxMarks: 'max_marks',
    attachmentUrl: 'attachment_url',
    isPublished: 'is_published',
  };

  const updates = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (data.questions !== undefined) {
    params.push(data.questions ? JSON.stringify(data.questions) : null);
    updates.push(`questions = $${params.length}`);
  }
  if (data.answerKey !== undefined) {
    params.push(data.answerKey ? JSON.stringify(data.answerKey) : null);
    updates.push(`answer_key = $${params.length}`);
  }
  if (!updates.length) throw ApiError.badRequest('Provide at least one field to update');

  params.push(assignmentId);
  return queryOne(
    `UPDATE assignments SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
}

export async function getAssignment(assignmentId) {
  return queryOne(
    `SELECT a.*,
            s.name AS subject_name, s.code AS subject_code,
            c.name AS class_name, c.section,
            t.name AS teacher_name, t.avatar_url AS teacher_avatar,
            (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = a.class_id)::int AS class_size,
            (SELECT COUNT(*) FROM submissions su
              WHERE su.assignment_id = a.id AND su.status <> 'pending')::int AS submission_count,
            (SELECT COUNT(*) FROM submissions su
              WHERE su.assignment_id = a.id AND su.status = 'graded')::int   AS graded_count
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN classes c  ON c.id = a.class_id
       JOIN users t    ON t.id = a.teacher_id
      WHERE a.id = $1`,
    [assignmentId]
  );
}

/**
 * Assignments for a student, each carrying their own submission state.
 * `derived_status` distinguishes "not submitted and still open" from
 * "not submitted and overdue".
 */
export async function getStudentAssignments(
  studentId,
  { status, subjectId, sourceKind, limit = 100, offset = 0 } = {}
) {
  const conditions = [
    'a.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)',
    'a.is_published',
  ];
  const params = [studentId];

  if (subjectId) {
    params.push(subjectId);
    conditions.push(`a.subject_id = $${params.length}`);
  }

  if (sourceKind) {
    params.push(sourceKind);
    conditions.push(`a.source_kind = $${params.length}`);
  }

  const derivedStatus = `
    CASE
      WHEN su.status = 'graded'    THEN 'graded'
      WHEN su.status = 'late'      THEN 'late'
      WHEN su.status = 'submitted' THEN 'submitted'
      WHEN a.due_date < NOW()      THEN 'overdue'
      ELSE 'pending'
    END`;

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`${derivedStatus} = $${params.length}`);
  }

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total
       FROM assignments a
       LEFT JOIN submissions su ON su.assignment_id = a.id AND su.student_id = $1
      WHERE ${conditions.join(' AND ')}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT a.id, a.title, a.description, a.due_date, a.max_marks, a.attachment_url, a.created_at,
            a.source_kind,
            s.name AS subject_name, s.code AS subject_code, s.id AS subject_id,
            t.name AS teacher_name,
            su.id AS submission_id, su.submitted_at, su.marks, su.feedback,
            su.submission_url, su.content AS submission_content,
            (su.status = 'graded' AND su.graded_by IS NULL) AS is_auto_graded,
            ${derivedStatus} AS derived_status,
            (a.due_date < NOW()) AS is_overdue
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN users t    ON t.id = a.teacher_id
       LEFT JOIN submissions su ON su.assignment_id = a.id AND su.student_id = $1
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.due_date ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { assignments: rows, total: countRow?.total ?? 0 };
}

/** Assignments created by a teacher (or across classes, for admin). */
export async function getTeacherAssignments({
  teacherId,
  classId,
  subjectId,
  sourceKind,
  limit = 100,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];

  if (teacherId) {
    params.push(teacherId);
    conditions.push(`a.teacher_id = $${params.length}`);
  }
  if (classId) {
    params.push(classId);
    conditions.push(`a.class_id = $${params.length}`);
  }
  if (subjectId) {
    params.push(subjectId);
    conditions.push(`a.subject_id = $${params.length}`);
  }
  if (sourceKind) {
    params.push(sourceKind);
    conditions.push(`a.source_kind = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total FROM assignments a ${where}`,
    params
  );

  params.push(limit, offset);
  const rows = await queryMany(
    `SELECT a.*,
            s.name AS subject_name, s.code AS subject_code,
            c.name AS class_name, c.section,
            (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = a.class_id)::int AS class_size,
            (SELECT COUNT(*) FROM submissions su
              WHERE su.assignment_id = a.id AND su.status <> 'pending')::int AS submission_count,
            (SELECT COUNT(*) FROM submissions su
              WHERE su.assignment_id = a.id AND su.status = 'graded')::int   AS graded_count
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN classes c  ON c.id = a.class_id
       ${where}
      ORDER BY a.due_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { assignments: rows, total: countRow?.total ?? 0 };
}

/**
 * A quiz where *every* question is objectively gradable (mcq / true_false)
 * can be scored the instant it's submitted, the way a real quiz app works —
 * no waiting on the teacher. One with any short/long-answer question mixed
 * in still needs a human, so it's left as a normal pending submission; the
 * selected answers are still recorded either way.
 */
function autoGrade(questions, answerKey, selectedAnswers) {
  if (!answerKey?.length || !questions?.length) return null;
  if (answerKey.length !== questions.length) return null; // a subjective question is mixed in

  let score = 0;
  let correctCount = 0;
  for (const entry of answerKey) {
    const picked = selectedAnswers?.[String(entry.number)];
    if (picked != null && picked === entry.answer) {
      score += Number(entry.marks) || 0;
      correctCount += 1;
    }
  }
  return { score, correctCount, total: answerKey.length };
}

/**
 * Record a student's submission. Late submissions are flagged rather than
 * refused — the teacher decides what a late answer is worth.
 */
export async function submitAssignment(
  assignmentId,
  studentId,
  { content, submissionUrl, selectedAnswers }
) {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT a.id, a.due_date, a.class_id, a.title, a.teacher_id, a.questions, a.answer_key,
              sp.class_id AS student_class_id
         FROM assignments a
         LEFT JOIN student_profiles sp ON sp.user_id = $2
        WHERE a.id = $1`,
      [assignmentId, studentId]
    );
    const assignment = rows[0];

    if (!assignment) throw ApiError.notFound('Assignment not found');
    if (assignment.class_id !== assignment.student_class_id) {
      throw ApiError.forbidden('This assignment was not set for your class');
    }

    const { rows: existingRows } = await tx.query(
      'SELECT id, status FROM submissions WHERE assignment_id = $1 AND student_id = $2',
      [assignmentId, studentId]
    );
    if (existingRows[0]?.status === 'graded') {
      throw ApiError.badRequest('This assignment has already been graded and cannot be resubmitted');
    }

    const isLate = new Date(assignment.due_date) < new Date();
    const result = autoGrade(assignment.questions, assignment.answer_key, selectedAnswers);

    const status = result ? 'graded' : isLate ? 'late' : 'submitted';
    const marks = result ? result.score : null;
    const feedback = result
      ? `Auto-graded — ${result.correctCount} of ${result.total} correct.`
      : null;
    const gradedAt = result ? new Date() : null;

    const { rows: saved } = await tx.query(
      `INSERT INTO submissions
         (assignment_id, student_id, content, submission_url, selected_answers,
          submitted_at, status, marks, feedback, graded_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET content          = EXCLUDED.content,
                     submission_url   = EXCLUDED.submission_url,
                     selected_answers = EXCLUDED.selected_answers,
                     submitted_at     = NOW(),
                     status           = EXCLUDED.status,
                     marks            = EXCLUDED.marks,
                     feedback         = EXCLUDED.feedback,
                     graded_at        = EXCLUDED.graded_at,
                     updated_at       = NOW()
       RETURNING *`,
      [
        assignmentId,
        studentId,
        content ?? null,
        submissionUrl ?? null,
        selectedAnswers ? JSON.stringify(selectedAnswers) : null,
        status,
        marks,
        feedback,
        gradedAt,
      ]
    );

    return { submission: saved[0], assignment, isLate, autoGraded: Boolean(result) };
  });
}

/** All submissions for an assignment, including students who have not submitted. */
export async function getSubmissions(assignmentId) {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  const rows = await queryMany(
    `SELECT u.id AS student_id, u.name, u.avatar_url, sp.roll_number,
            su.id AS submission_id, su.content, su.submission_url, su.submitted_at,
            su.marks, su.feedback, su.graded_at,
            COALESCE(su.status, 'pending') AS status
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id AND u.is_active
       LEFT JOIN submissions su ON su.assignment_id = $2 AND su.student_id = sp.user_id
      WHERE sp.class_id = $1
      ORDER BY (su.submitted_at IS NULL), su.submitted_at DESC, u.name`,
    [assignment.class_id, assignmentId]
  );

  return { assignment, submissions: rows };
}

/**
 * The assignment a submission belongs to. Controllers call this *before*
 * grading so authorisation happens ahead of the write.
 */
export async function getSubmissionContext(submissionId) {
  return queryOne(
    `SELECT su.id, su.student_id, su.assignment_id,
            a.max_marks, a.title, a.class_id, a.subject_id, a.teacher_id
       FROM submissions su
       JOIN assignments a ON a.id = su.assignment_id
      WHERE su.id = $1`,
    [submissionId]
  );
}

/** Grade one submission, validating against the assignment's max marks. */
export async function gradeSubmission(submissionId, { marks, feedback }, gradedBy) {
  const submission = await getSubmissionContext(submissionId);
  if (!submission) throw ApiError.notFound('Submission not found');

  if (marks < 0 || marks > Number(submission.max_marks)) {
    throw ApiError.badRequest(`Marks must be between 0 and ${submission.max_marks}`);
  }

  const graded = await queryOne(
    `UPDATE submissions
        SET marks = $1, feedback = $2, status = 'graded', graded_by = $3, graded_at = NOW()
      WHERE id = $4
      RETURNING *`,
    [marks, feedback ?? null, gradedBy, submissionId]
  );

  return { submission: graded, assignment: submission };
}

export async function deleteAssignment(assignmentId) {
  const { rowCount } = await query('DELETE FROM assignments WHERE id = $1', [assignmentId]);
  if (!rowCount) throw ApiError.notFound('Assignment not found');
}

/** Completion stats for a class — feeds the teacher and admin dashboards. */
export async function getCompletionStats({ classIds = null, sourceKind = null } = {}) {
  if (Array.isArray(classIds) && classIds.length === 0) {
    return { total: 0, submitted: 0, late: 0, graded: 0, pending: 0, completionRate: 0 };
  }

  // `$1` is either the class-id array or NULL; a NULL disables the filter, so
  // one query text covers both the scoped and institution-wide cases. Same
  // for `$2` / sourceKind.
  const row = await queryOne(
    `WITH scoped_assignments AS (
       SELECT a.id, a.class_id
         FROM assignments a
        WHERE a.is_published
          AND ($1::uuid[] IS NULL OR a.class_id = ANY($1::uuid[]))
          AND ($2::varchar IS NULL OR a.source_kind = $2::varchar)
     ),
     expected AS (
       SELECT COUNT(*)::int AS count
         FROM scoped_assignments sa
         JOIN student_profiles sp ON sp.class_id = sa.class_id
     ),
     actual AS (
       SELECT
         COUNT(*) FILTER (WHERE su.status IN ('submitted','late','graded'))::int AS submitted,
         COUNT(*) FILTER (WHERE su.status = 'late')::int                          AS late,
         COUNT(*) FILTER (WHERE su.status = 'graded')::int                        AS graded
         FROM submissions su
         JOIN scoped_assignments sa ON sa.id = su.assignment_id
     )
     SELECT expected.count AS expected, actual.submitted, actual.late, actual.graded
       FROM expected, actual`,
    [Array.isArray(classIds) ? classIds : null, sourceKind]
  );

  const expected = row?.expected ?? 0;
  const submitted = row?.submitted ?? 0;

  return {
    total: expected,
    submitted,
    late: row?.late ?? 0,
    graded: row?.graded ?? 0,
    pending: Math.max(0, expected - submitted),
    completionRate: expected ? Number(((submitted / expected) * 100).toFixed(2)) : 0,
  };
}

/** Per-student assignment completion, used by the risk indicator. */
export async function getStudentCompletionRate(studentId) {
  const row = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM assignments a
         WHERE a.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)
           AND a.is_published AND a.due_date < NOW())::int AS due,
       (SELECT COUNT(*) FROM submissions su
          JOIN assignments a ON a.id = su.assignment_id
         WHERE su.student_id = $1 AND su.status IN ('submitted','late','graded'))::int AS submitted`,
    [studentId]
  );

  const due = row?.due ?? 0;
  const submitted = row?.submitted ?? 0;

  return {
    due,
    submitted,
    pending: Math.max(0, due - submitted),
    // With nothing due yet, treat the student as fully up to date.
    completionRate: due ? Number(((Math.min(submitted, due) / due) * 100).toFixed(2)) : 100,
  };
}

export default {
  createAssignment,
  updateAssignment,
  getAssignment,
  getStudentAssignments,
  getTeacherAssignments,
  submitAssignment,
  getSubmissions,
  getSubmissionContext,
  gradeSubmission,
  deleteAssignment,
  getCompletionStats,
  getStudentCompletionRate,
};
