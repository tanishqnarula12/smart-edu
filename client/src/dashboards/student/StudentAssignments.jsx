import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ClipboardList, Upload, Calendar, ArrowLeft, Paperclip, CheckCircle2, AlertTriangle, Award,
} from 'lucide-react';
import { assignmentApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, StatCard, Tabs, StatusBadge, Button, Textarea, EmptyState,
  ErrorState, PageLoader, Callout, Badge, ProgressBar,
} from '../../components/ui/index.js';
import { formatDate, formatDateTime, formatRelative, daysUntil, truncate } from '../../utils/format.js';
import { resolveFileUrl } from '../../utils/fileUrl.js';
import { cn } from '../../utils/cn.js';

/**
 * Assignment list (§16) with status filtering. `sourceKind` narrows this to
 * just the AI-published quizzes when rendered as the student's dedicated
 * Quizzes section, rather than mixing them into every assignment.
 */
export function StudentAssignments({ sourceKind }) {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useApi(
    () => assignmentApi.list({ status: tab === 'all' ? undefined : tab, sourceKind, page, limit: 20 }),
    [tab, page, sourceKind]
  );

  const assignments = data?.data ?? [];

  const counts = assignments.reduce((acc, assignment) => {
    acc[assignment.status] = (acc[assignment.status] ?? 0) + 1;
    return acc;
  }, {});

  const isQuizzes = sourceKind === 'quiz';

  return (
    <>
      <PageHeader
        title={isQuizzes ? 'Quizzes' : 'Assignments'}
        description={
          isQuizzes
            ? 'Quizzes your teachers have published — answer each question, then submit.'
            : 'Everything set for your class, with deadlines and feedback.'
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending"
          value={(counts.pending ?? 0) + (counts.overdue ?? 0)}
          icon={ClipboardList}
          tone={counts.overdue ? 'danger' : counts.pending ? 'warning' : 'success'}
          hint={counts.overdue ? `${counts.overdue} past the deadline` : 'Nothing overdue'}
          isLoading={isLoading}
        />
        <StatCard
          label="Submitted"
          value={counts.submitted ?? 0}
          icon={Upload}
          tone="info"
          hint="Awaiting grading"
          isLoading={isLoading}
        />
        <StatCard
          label="Graded"
          value={counts.graded ?? 0}
          icon={Award}
          tone="success"
          hint="Feedback available"
          isLoading={isLoading}
        />
        <StatCard
          label="Late"
          value={counts.late ?? 0}
          icon={AlertTriangle}
          tone={counts.late ? 'warning' : 'neutral'}
          hint="Submitted after the deadline"
          isLoading={isLoading}
        />
      </div>

      <Tabs
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'submitted', label: 'Submitted' },
          { value: 'graded', label: 'Graded' },
        ]}
        active={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
        className="mb-5"
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab === 'all' ? `No ${isQuizzes ? 'quizzes' : 'assignments'} yet` : `No ${tab} ${isQuizzes ? 'quizzes' : 'assignments'}`}
          message={
            tab === 'all'
              ? `${isQuizzes ? 'Quizzes' : 'Assignments'} set for your class will appear here.`
              : `Try a different filter to see other ${isQuizzes ? 'quizzes' : 'assignments'}.`
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {assignments.map((assignment) => {
              const days = daysUntil(assignment.dueDate);
              const isUrgent = ['pending', 'overdue'].includes(assignment.status) && days <= 2;

              return (
                <Link
                  key={assignment.id}
                  to={`/student/assignments/${assignment.id}`}
                  className={cn(
                    'group flex flex-col rounded-2xl border bg-surface-raised p-5 shadow-card transition duration-200',
                    'hover:-translate-y-0.5 hover:shadow-card-hover',
                    isUrgent ? 'border-danger-300 dark:border-danger-500/40' : 'border-line hover:border-brand-200'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone="neutral" size="sm">
                      {assignment.subjectCode ?? assignment.subjectName}
                    </Badge>
                    <StatusBadge status={assignment.status} size="sm" />
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                    {assignment.title}
                  </h3>

                  {assignment.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                      {truncate(assignment.description, 110)}
                    </p>
                  )}

                  <div className="mt-auto space-y-2 pt-4">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Calendar size={12} className="shrink-0 text-ink-subtle" aria-hidden="true" />
                      <span
                        className={cn(
                          isUrgent ? 'font-medium text-danger-600' : 'text-ink-muted'
                        )}
                      >
                        {assignment.status === 'overdue'
                          ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
                          : ['submitted', 'graded', 'late'].includes(assignment.status)
                            ? `Submitted ${formatRelative(assignment.submittedAt)}`
                            : `Due ${formatDate(assignment.dueDate)}`}
                      </span>
                    </div>

                    {assignment.status === 'graded' && assignment.marks != null && (
                      <div className="flex items-center justify-between rounded-lg bg-success-50 px-2.5 py-1.5 dark:bg-success-500/10">
                        <span className="text-xs font-medium text-success-700 dark:text-success-500">
                          Graded
                        </span>
                        <span className="text-sm font-bold tabular-nums text-success-700 dark:text-success-500">
                          {assignment.marks} / {assignment.maxMarks}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {data?.meta?.pagination?.totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!data.meta.pagination.hasPrevPage}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm text-ink-muted">
                Page {data.meta.pagination.page} of {data.meta.pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!data.meta.pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Assignment detail with the submission form (§11). */
export function StudentAssignmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [content, setContent] = useState('');
  const [answers, setAnswers] = useState({});
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, error, refetch } = useApi(() => assignmentApi.get(id), [id]);

  const hasQuestions = Boolean(data?.questions?.length);
  const isObjective = (question) =>
    ['mcq', 'true_false'].includes(question.type) && question.options?.length > 0;
  const isFullyObjective = hasQuestions && data.questions.every(isObjective);
  const freeTextQuestions = hasQuestions ? data.questions.filter((q) => !isObjective(q)) : [];

  // A structured assignment gets one answer box per question on screen.
  // Multiple-choice answers go to the server separately (for auto-grading);
  // everything else is still concatenated into the one `content` field the
  // grading view already reads — no schema change needed for free text.
  const buildQuestionAnswerContent = () =>
    freeTextQuestions
      .map((question) => {
        const answer = (answers[question.number] ?? '').trim();
        return `Q${question.number}. ${question.question}\nAnswer: ${answer || '(no answer provided)'}`;
      })
      .join('\n\n');

  const submit = async (event) => {
    event.preventDefault();

    if (hasQuestions) {
      const answered =
        Object.values(selectedAnswers).some(Boolean) ||
        freeTextQuestions.some((question) => (answers[question.number] ?? '').trim());
      if (!answered && !file) {
        toast.error('Answer at least one question or attach a file before submitting');
        return;
      }
    } else if (!content.trim() && !file) {
      toast.error('Attach a file or write your answer before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      const combinedContent = hasQuestions ? buildQuestionAnswerContent() : content.trim();

      const payload = new FormData();
      if (combinedContent) payload.append('content', combinedContent);
      if (Object.keys(selectedAnswers).length) {
        payload.append('selectedAnswers', JSON.stringify(selectedAnswers));
      }
      if (file) payload.append('file', file);

      await assignmentApi.submit(id, payload);
      toast.success(isFullyObjective ? 'Submitted and graded' : 'Assignment submitted');
      setContent('');
      setAnswers({});
      setSelectedAnswers({});
      setFile(null);
      refetch();
    } catch (submitError) {
      toast.error(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PageLoader message="Loading assignment…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const days = daysUntil(data.dueDate);
  const canSubmit = data.status !== 'graded';
  const hasSubmission = Boolean(data.submission);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={ArrowLeft}
        onClick={() => navigate('/student/assignments')}
        className="mb-4"
      >
        Back to assignments
      </Button>

      <PageHeader
        title={data.title}
        description={`${data.subjectName} · set by ${data.teacherName}`}
        action={<StatusBadge status={data.status} size="lg" />}
      />

      {data.status === 'overdue' && (
        <Callout tone="danger" icon={AlertTriangle} title="Past the deadline" className="mb-5">
          This was due {Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} ago. You can still
          submit — it will be flagged as late for your teacher.
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Brief" icon={ClipboardList} />
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink">
              {data.description ? (
                <p className="whitespace-pre-wrap">{data.description}</p>
              ) : (
                <p className="text-ink-muted">No description provided.</p>
              )}

              {data.instructions && (
                <div className="rounded-xl bg-surface-sunken p-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Instructions
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{data.instructions}</p>
                </div>
              )}

              {data.attachmentUrl && (
                <a
                  href={resolveFileUrl(data.attachmentUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
                >
                  <Paperclip size={15} aria-hidden="true" />
                  Download the attached brief
                </a>
              )}
            </div>
          </Card>

          {/* Existing submission */}
          {hasSubmission && (
            <Card>
              <CardHeader
                title="Your submission"
                subtitle={`Submitted ${formatDateTime(data.submission.submittedAt)}`}
                icon={CheckCircle2}
              />

              <div className="mt-4 space-y-4">
                {data.submission.content && (
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {data.submission.content}
                    </p>
                  </div>
                )}

                {data.submission.submissionUrl && (
                  <a
                    href={resolveFileUrl(data.submission.submissionUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
                  >
                    <Paperclip size={15} aria-hidden="true" />
                    View your uploaded file
                  </a>
                )}

                {data.status === 'graded' && (
                  <div className="rounded-xl border border-success-500/25 bg-success-50 p-4 dark:bg-success-500/10">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-success-800 dark:text-success-500">
                        {data.submission.isAutoGraded ? 'Your score' : 'Graded'}
                      </p>
                      <p className="text-lg font-bold tabular-nums text-success-800 dark:text-success-500">
                        {data.submission.marks} / {data.maxMarks}
                      </p>
                    </div>

                    <ProgressBar
                      value={(data.submission.marks / data.maxMarks) * 100}
                      tone="success"
                      className="mt-3"
                    />

                    {data.submission.feedback && (
                      <div className="mt-3 border-t border-success-500/20 pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-success-700 dark:text-success-500">
                          {data.submission.isAutoGraded ? 'Result' : 'Teacher feedback'}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-success-900 dark:text-success-100">
                          {data.submission.feedback}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Submit / resubmit */}
          {canSubmit && (
            <Card>
              <CardHeader
                title={hasSubmission ? 'Resubmit' : 'Submit your work'}
                subtitle={
                  hasSubmission
                    ? 'Submitting again replaces your previous answer.'
                    : isFullyObjective
                      ? "Pick an answer for each question — you'll get your score the moment you submit."
                      : hasQuestions
                        ? 'Answer each question in its own box below.'
                        : 'Write your answer, attach a file, or both.'
                }
                icon={Upload}
              />

              <form onSubmit={submit} className="mt-4 space-y-4">
                {hasQuestions ? (
                  <div className="space-y-3">
                    {data.questions.map((question, index) => {
                      // Matches the 1-based fallback the generators and the
                      // publish step use — the auto-grading answer key is
                      // matched by this same number, so it must agree.
                      const key = question.number ?? index + 1;
                      const showSectionHeading =
                        question.section && question.section !== data.questions[index - 1]?.section;

                      return (
                        <div key={key}>
                          {showSectionHeading && (
                            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-subtle first:mt-0">
                              {question.section}
                            </p>
                          )}
                          <div className="rounded-xl border border-line p-4">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium leading-relaxed text-ink">
                                {question.number ?? index + 1}. {question.question}
                              </p>
                              {question.marks != null && (
                                <Badge tone="info" size="sm" className="shrink-0">
                                  {question.marks} marks
                                </Badge>
                              )}
                            </div>

                            {question.guidance && (
                              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                                {question.guidance}
                              </p>
                            )}

                            {isObjective(question) ? (
                              <div className="mt-3 space-y-2" role="radiogroup" aria-label={`Answer for question ${key}`}>
                                {question.options.map((option, optionIndex) => {
                                  const isSelected = selectedAnswers[key] === option;
                                  return (
                                    <label
                                      key={optionIndex}
                                      className={cn(
                                        'flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm transition',
                                        isSelected
                                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40'
                                          : 'border-line hover:bg-surface-sunken'
                                      )}
                                    >
                                      <input
                                        type="radio"
                                        name={`question-${key}`}
                                        checked={isSelected}
                                        onChange={() =>
                                          setSelectedAnswers((current) => ({ ...current, [key]: option }))
                                        }
                                        className="h-4 w-4 accent-brand-600"
                                      />
                                      <span className="text-ink">{option}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <Textarea
                                className="mt-3"
                                value={answers[key] ?? ''}
                                onChange={(event) =>
                                  setAnswers((current) => ({ ...current, [key]: event.target.value }))
                                }
                                placeholder="Type your answer…"
                                rows={3}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Textarea
                    label="Your answer"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Type your answer here…"
                    rows={7}
                    hint="Optional if you are attaching a file"
                  />
                )}

                {!isFullyObjective && (
                  <div>
                    <label
                      htmlFor="submission-file"
                      className="mb-1.5 block text-sm font-medium text-ink"
                    >
                      Attach a file
                    </label>
                    <input
                      id="submission-file"
                      type="file"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                      className="block w-full cursor-pointer rounded-xl border border-line bg-surface-raised text-sm text-ink-muted file:mr-3 file:cursor-pointer file:rounded-l-xl file:border-0 file:bg-surface-sunken file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-ink hover:file:bg-line/50"
                    />
                    <p className="mt-1.5 text-xs text-ink-muted">
                      PDF, Word, images, spreadsheets or a zip. Up to 10MB.
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  icon={Upload}
                  isLoading={isSubmitting}
                  disabled={
                    !content.trim() &&
                    !file &&
                    !Object.values(selectedAnswers).some(Boolean) &&
                    !Object.values(answers).some((value) => value?.trim())
                  }
                >
                  {hasSubmission ? 'Replace submission' : isFullyObjective ? 'Submit and see score' : 'Submit assignment'}
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" icon={Calendar} />
            <dl className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Subject</dt>
                <dd className="font-medium text-ink">{data.subjectName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Set by</dt>
                <dd className="font-medium text-ink">{data.teacherName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Due</dt>
                <dd
                  className={cn(
                    'font-medium',
                    data.isOverdue && data.status !== 'graded' ? 'text-danger-600' : 'text-ink'
                  )}
                >
                  {formatDateTime(data.dueDate)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Maximum marks</dt>
                <dd className="font-medium text-ink">{data.maxMarks}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <StatusBadge status={data.status} size="sm" />
                </dd>
              </div>
            </dl>
          </Card>

          {!data.isOverdue && data.status === 'pending' && (
            <Callout tone={days <= 2 ? 'warning' : 'info'} title="Time remaining">
              {days === 0
                ? 'Due today.'
                : `${days} day${days === 1 ? '' : 's'} until the deadline.`}
            </Callout>
          )}
        </div>
      </div>
    </>
  );
}

/** /student/quizzes — the same list, narrowed to published quizzes. */
export function StudentQuizzes() {
  return <StudentAssignments sourceKind="quiz" />;
}

export default StudentAssignments;
