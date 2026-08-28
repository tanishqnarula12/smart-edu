import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ClipboardList,
  Plus,
  Users,
  CheckCircle2,
  Clock,
  Award,
  Trash2,
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import { assignmentApi, teacherApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  StatCard,
  Button,
  Modal,
  Drawer,
  Input,
  Textarea,
  Select,
  DatePicker,
  Badge,
  StatusBadge,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ProgressBar,
  ConfirmDialog,
  Callout,
} from '../../components/ui/index.js';
import { formatDateTime, formatRelative, formatPercent } from '../../utils/format.js';
import { resolveFileUrl } from '../../utils/fileUrl.js';
import { cn } from '../../utils/cn.js';

/**
 * Teacher assignments (§11): create, track submissions and grade.
 * `sourceKind` narrows this to just quizzes, for the "Quiz progress" view —
 * same list, same grading drawer, just scoped and re-labelled.
 */
export function TeacherAssignments({ sourceKind }) {
  const toast = useToast();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [gradingId, setGradingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useApi(
    () => assignmentApi.list({ page, limit: 20, sourceKind }),
    [page, sourceKind]
  );
  const { data: stats } = useApi(() => assignmentApi.stats({ sourceKind }), [sourceKind]);

  const remove = async () => {
    try {
      await assignmentApi.remove(toDelete.id);
      toast.success('Assignment deleted');
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  const assignments = data?.data ?? [];
  const isQuizProgress = sourceKind === 'quiz';

  return (
    <>
      <PageHeader
        title={isQuizProgress ? 'Quiz progress' : 'Assignments'}
        description={
          isQuizProgress
            ? 'Completion and grading for every quiz you have published.'
            : 'Set work, track who has submitted, and grade.'
        }
        action={
          isQuizProgress ? (
            <Button to="/teacher/ai-tools" icon={Sparkles}>
              Generate a quiz
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button to="/teacher/ai-tools" variant="secondary" icon={Sparkles}>
                Generate
              </Button>
              <Button icon={Plus} onClick={() => setCreateOpen(true)}>
                New assignment
              </Button>
            </div>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expected submissions"
          value={stats?.total ?? 0}
          icon={Users}
          tone="info"
          hint="Across all your assignments"
        />
        <StatCard
          label="Submitted"
          value={stats?.submitted ?? 0}
          icon={CheckCircle2}
          tone="success"
          hint={`${formatPercent(stats?.completionRate)} completion`}
        />
        <StatCard
          label="Outstanding"
          value={stats?.pending ?? 0}
          icon={Clock}
          tone={stats?.pending > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Graded" value={stats?.graded ?? 0} icon={Award} tone="brand" />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-28" />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={isQuizProgress ? FlaskConical : ClipboardList}
          title={isQuizProgress ? 'No quizzes published yet' : 'No assignments yet'}
          message={
            isQuizProgress
              ? 'Generate a quiz from the AI tools and publish it to a class to see progress here.'
              : 'Create your first assignment, or generate one with the AI tools.'
          }
          action={
            isQuizProgress ? (
              <Button to="/teacher/ai-tools" icon={Sparkles}>
                Generate a quiz
              </Button>
            ) : (
              <Button icon={Plus} onClick={() => setCreateOpen(true)}>
                New assignment
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const submissionRate = assignment.classSize
              ? (assignment.submissionCount / assignment.classSize) * 100
              : 0;
            const isOverdue = new Date(assignment.dueDate) < new Date();

            return (
              <Card key={assignment.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{assignment.title}</h3>
                      <Badge tone="neutral" size="sm">
                        {assignment.subjectName}
                      </Badge>
                      <Badge tone="brand" size="sm">
                        {assignment.className}
                      </Badge>
                      {!assignment.isPublished && (
                        <Badge tone="warning" size="sm">
                          Draft
                        </Badge>
                      )}
                    </div>

                    {assignment.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                        {assignment.description}
                      </p>
                    )}

                    <p className="mt-2 text-xs text-ink-subtle">
                      Due {formatDateTime(assignment.dueDate)}
                      {isOverdue && ' · deadline passed'} · {assignment.maxMarks} marks
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setGradingId(assignment.id)}>
                      {assignment.gradedCount < assignment.submissionCount ? 'Grade' : 'Submissions'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => setToDelete(assignment)}
                      aria-label="Delete assignment"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <ProgressBar
                    label={`Submitted (${assignment.submissionCount}/${assignment.classSize})`}
                    value={submissionRate}
                    tone={submissionRate >= 80 ? 'success' : submissionRate >= 50 ? 'warning' : 'danger'}
                    showValue
                    size="sm"
                  />
                  <ProgressBar
                    label={`Graded (${assignment.gradedCount}/${assignment.submissionCount || 1})`}
                    value={
                      assignment.submissionCount
                        ? (assignment.gradedCount / assignment.submissionCount) * 100
                        : 0
                    }
                    tone="brand"
                    showValue
                    size="sm"
                  />
                  <div className="text-xs text-ink-muted">
                    <p className="font-medium text-ink">
                      {assignment.submissionCount - assignment.gradedCount} awaiting grading
                    </p>
                    <p className="mt-0.5">Created {formatRelative(assignment.createdAt)}</p>
                  </div>
                </div>
              </Card>
            );
          })}

          {data?.meta?.pagination?.totalPages > 1 && (
            <div className="flex justify-center gap-2">
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
        </div>
      )}

      <CreateAssignmentModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          refetch();
        }}
      />

      <GradingDrawer
        assignmentId={gradingId}
        onClose={() => {
          setGradingId(null);
          refetch();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this assignment?"
        message={
          toDelete
            ? `"${toDelete.title}" and every submission against it will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete assignment"
      />
    </>
  );
}

function CreateAssignmentModal({ isOpen, onClose, onCreated, prefill }) {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  // Structured questions aren't a plain form field — react-hook-form only
  // tracks inputs a user types into, not JSON handed over from a generator.
  const [questions, setQuestions] = useState(null);
  const [sourceKind, setSourceKind] = useState(null);

  const { data: assignments } = useApi(() => teacherApi.myClasses(), []);

  const classes = useMemo(() => {
    const map = new Map();
    for (const row of assignments ?? []) {
      if (!map.has(row.class_id)) {
        map.set(row.class_id, { value: row.class_id, label: `${row.class_name} ${row.section}` });
      }
    }
    return [...map.values()];
  }, [assignments]);

  const subjects = useMemo(
    () =>
      (assignments ?? [])
        .filter((row) => row.class_id === classId)
        .map((row) => ({ value: row.subject_id, label: row.subject_name })),
    [assignments, classId]
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { maxMarks: 20, isPublished: true } });

  // Pre-fill from an AI-generated assignment when one was handed over.
  useEffect(() => {
    if (!prefill) return;
    setValue('title', prefill.title ?? '');
    setValue('description', prefill.description ?? '');
    setValue('instructions', prefill.instructions ?? '');
    if (prefill.maxMarks) setValue('maxMarks', prefill.maxMarks);
    setQuestions(prefill.questions ?? null);
    setSourceKind(prefill.sourceKind ?? null);
  }, [prefill, setValue]);

  const submit = async (values) => {
    try {
      await assignmentApi.create({
        ...values,
        classId,
        questions,
        sourceKind,
        dueDate: new Date(values.dueDate).toISOString(),
      });
      toast.success('Assignment created and published to the class');
      reset({ maxMarks: 20, isPublished: true });
      setQuestions(null);
      setSourceKind(null);
      onCreated();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 7);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New assignment"
      description="Students in the selected class are notified as soon as it is published."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            Create assignment
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            options={classes}
            placeholder="Select a class"
            required
          />
          <Select
            label="Subject"
            options={subjects}
            placeholder="Select a subject"
            disabled={!classId}
            required
            error={errors.subjectId?.message}
            {...register('subjectId', { required: 'Choose a subject' })}
          />
        </div>

        <Input
          label="Title"
          placeholder="Implement and analyse a balanced binary search tree"
          required
          error={errors.title?.message}
          {...register('title', {
            required: 'Give the assignment a title',
            minLength: { value: 3, message: 'At least 3 characters' },
          })}
        />

        <Textarea
          label="Description"
          placeholder="What the students need to do…"
          rows={4}
          {...register('description')}
        />

        <Textarea
          label="Instructions"
          placeholder="How it should be submitted, what earns marks…"
          rows={3}
          {...register('instructions')}
        />

        {questions?.length > 0 && (
          <Callout tone="info">
            {questions.length} question{questions.length === 1 ? '' : 's'} will be attached, each as
            its own answer box for students.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label="Due date and time"
            type="datetime-local"
            required
            defaultValue={`${tomorrow.toISOString().slice(0, 10)}T23:59`}
            error={errors.dueDate?.message}
            {...register('dueDate', { required: 'Choose a deadline' })}
          />
          <Input
            label="Maximum marks"
            type="number"
            min="1"
            required
            error={errors.maxMarks?.message}
            {...register('maxMarks', {
              required: 'Enter the maximum marks',
              min: { value: 1, message: 'Must be greater than zero' },
            })}
          />
        </div>
      </form>
    </Modal>
  );
}

/** Grading panel — one submission at a time, with the student's work in view. */
function GradingDrawer({ assignmentId, onClose }) {
  const toast = useToast();
  const [grades, setGrades] = useState({});
  const [savingId, setSavingId] = useState(null);

  const { data, isLoading, error, refetch } = useApi(
    () => (assignmentId ? assignmentApi.submissions(assignmentId) : Promise.resolve(null)),
    [assignmentId]
  );

  useEffect(() => {
    if (!data?.submissions) return;
    setGrades(
      Object.fromEntries(
        data.submissions
          .filter((submission) => submission.submissionId)
          .map((submission) => [
            submission.submissionId,
            { marks: submission.marks ?? '', feedback: submission.feedback ?? '' },
          ])
      )
    );
  }, [data]);

  const maxMarks = data?.assignment?.maxMarks ?? 100;

  const grade = async (submissionId) => {
    const entry = grades[submissionId];

    if (entry?.marks === '' || entry?.marks == null) {
      toast.error('Enter a mark before saving');
      return;
    }
    if (Number(entry.marks) < 0 || Number(entry.marks) > maxMarks) {
      toast.error(`Marks must be between 0 and ${maxMarks}`);
      return;
    }

    setSavingId(submissionId);
    try {
      await assignmentApi.grade(submissionId, {
        marks: Number(entry.marks),
        feedback: entry.feedback || null,
      });
      toast.success('Submission graded — the student has been notified');
      refetch();
    } catch (gradeError) {
      toast.error(gradeError.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Drawer
      isOpen={Boolean(assignmentId)}
      onClose={onClose}
      title={data?.assignment?.title ?? 'Submissions'}
      description={
        data?.assignment
          ? `${data.assignment.className} · ${data.assignment.submissionCount} of ${data.assignment.classSize} submitted`
          : undefined
      }
      width="max-w-2xl"
    >
      {error ? (
        <ErrorState error={error} onRetry={refetch} compact />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-32" />
      ) : !data?.submissions?.length ? (
        <EmptyState icon={Users} title="No students in this class" />
      ) : (
        <ul className="space-y-4">
          {data.submissions.map((submission) => {
            const entry = grades[submission.submissionId] ?? {};
            const hasSubmitted = Boolean(submission.submissionId);

            return (
              <li
                key={submission.studentId}
                className={cn(
                  'rounded-xl border p-4',
                  submission.status === 'graded'
                    ? 'border-success-500/25 bg-success-50/40 dark:bg-success-500/5'
                    : 'border-line'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={submission.name} src={submission.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{submission.name}</p>
                      <p className="truncate text-xs text-ink-muted">
                        Roll {submission.rollNumber ?? '—'}
                        {submission.submittedAt && ` · ${formatRelative(submission.submittedAt)}`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={submission.status} size="sm" />
                </div>

                {!hasSubmitted ? (
                  <p className="mt-3 rounded-lg bg-surface-sunken p-3 text-xs text-ink-muted">
                    Nothing submitted yet.
                  </p>
                ) : (
                  <>
                    {submission.content && (
                      <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-surface-sunken p-3 scrollbar-slim">
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">
                          {submission.content}
                        </p>
                      </div>
                    )}

                    {submission.submissionUrl && (
                      <a
                        href={resolveFileUrl(submission.submissionUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline"
                      >
                        Open the attached file
                      </a>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-[7rem,1fr,auto] sm:items-end">
                      <Input
                        label={`Marks / ${maxMarks}`}
                        type="number"
                        min="0"
                        max={maxMarks}
                        step="0.5"
                        value={entry.marks ?? ''}
                        onChange={(event) =>
                          setGrades((current) => ({
                            ...current,
                            [submission.submissionId]: {
                              ...current[submission.submissionId],
                              marks: event.target.value,
                            },
                          }))
                        }
                      />

                      <Input
                        label="Feedback"
                        placeholder="What was strong, what to improve…"
                        value={entry.feedback ?? ''}
                        onChange={(event) =>
                          setGrades((current) => ({
                            ...current,
                            [submission.submissionId]: {
                              ...current[submission.submissionId],
                              feedback: event.target.value,
                            },
                          }))
                        }
                      />

                      <Button
                        size="md"
                        onClick={() => grade(submission.submissionId)}
                        isLoading={savingId === submission.submissionId}
                      >
                        {submission.status === 'graded' ? 'Update' : 'Grade'}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

/** /teacher/quiz-progress — the same list and grading drawer, scoped to quizzes. */
export function TeacherQuizProgress() {
  return <TeacherAssignments sourceKind="quiz" />;
}

export { CreateAssignmentModal };
export default TeacherAssignments;
