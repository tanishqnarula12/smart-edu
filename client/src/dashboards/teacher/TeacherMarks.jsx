import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  GraduationCap,
  Plus,
  Save,
  Send,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import { marksApi, teacherApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  Select,
  DatePicker,
  Input,
  Button,
  Modal,
  Badge,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Callout,
  ProgressBar,
  ConfirmDialog,
} from '../../components/ui/index.js';
import { formatDate, formatPercent, todayIso, humanise } from '../../utils/format.js';
import { ASSESSMENT_TYPES, scoreTone } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';

/**
 * Marks entry (§22).
 *
 * A spreadsheet-style grid: Enter/↓ moves to the next student, marks are
 * validated against the assessment's maximum as you type, and publishing is a
 * deliberate second step so nothing reaches students half-entered.
 */
export function TeacherMarks() {
  const toast = useToast();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [entries, setEntries] = useState({});
  const [isSaving, setSaving] = useState(false);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [isPublishing, setPublishing] = useState(false);

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

  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0].value);
  }, [classes, classId]);

  useEffect(() => {
    if (subjects.length && !subjects.some((subject) => subject.value === subjectId)) {
      setSubjectId(subjects[0].value);
    }
  }, [subjects, subjectId]);

  const {
    data: assessments,
    isLoading: assessmentsLoading,
    refetch: refetchAssessments,
  } = useApi(
    () => (classId ? marksApi.assessments({ classId, subjectId: subjectId || undefined }) : Promise.resolve([])),
    [classId, subjectId]
  );

  useEffect(() => {
    if (assessments?.length && !assessments.some((a) => a.id === assessmentId)) {
      setAssessmentId(assessments[0].id);
    } else if (!assessments?.length) {
      setAssessmentId('');
    }
  }, [assessments, assessmentId]);

  const { data: sheet, isLoading, error, refetch } = useApi(
    () => (assessmentId ? marksApi.sheet(assessmentId) : Promise.resolve(null)),
    [assessmentId]
  );

  useEffect(() => {
    if (!sheet?.students) return;
    setEntries(
      Object.fromEntries(
        sheet.students.map((student) => [
          student.studentId,
          {
            marksObtained: student.marksObtained ?? '',
            isAbsent: student.isAbsent ?? false,
            remarks: student.remarks ?? '',
          },
        ])
      )
    );
  }, [sheet]);

  const maxMarks = sheet?.assessment?.maxMarks ?? 100;

  const update = (studentId, patch) =>
    setEntries((current) => ({ ...current, [studentId]: { ...current[studentId], ...patch } }));

  /** Enter or ↓ jumps to the next input — the thing that makes bulk entry bearable. */
  const handleKeyDown = (event, index) => {
    if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const delta = event.key === 'ArrowUp' ? -1 : 1;
    const next = document.querySelector(`[data-mark-index="${index + delta}"]`);
    next?.focus();
    next?.select?.();
  };

  const save = async () => {
    const invalid = Object.entries(entries).filter(
      ([, entry]) =>
        !entry.isAbsent &&
        entry.marksObtained !== '' &&
        (Number(entry.marksObtained) < 0 || Number(entry.marksObtained) > maxMarks)
    );

    if (invalid.length) {
      toast.error(`${invalid.length} mark(s) are outside 0–${maxMarks}`);
      return;
    }

    setSaving(true);
    try {
      const records = Object.entries(entries)
        .filter(([, entry]) => entry.isAbsent || entry.marksObtained !== '')
        .map(([studentId, entry]) => ({
          studentId,
          marksObtained: entry.isAbsent ? null : Number(entry.marksObtained),
          isAbsent: entry.isAbsent,
          remarks: entry.remarks || null,
        }));

      if (!records.length) {
        toast.error('Enter at least one mark before saving');
        return;
      }

      const result = await marksApi.enterMarks(assessmentId, records);
      toast.success(`Saved marks for ${result.saved} student(s)`);
      refetch();
      refetchAssessments();
    } catch (saveError) {
      toast.error(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await marksApi.publish(assessmentId);
      toast.success('Marks published to students and parents');
      setConfirmPublish(false);
      refetch();
      refetchAssessments();
    } catch (publishError) {
      toast.error(publishError.message);
      setConfirmPublish(false);
    } finally {
      setPublishing(false);
    }
  };

  const entered = Object.values(entries).filter(
    (entry) => entry.isAbsent || entry.marksObtained !== ''
  ).length;
  const total = sheet?.students?.length ?? 0;
  const isPublished = sheet?.assessment?.isPublished;

  return (
    <>
      <PageHeader
        title="Marks entry"
        description="Enter marks for an assessment, then publish when the sheet is complete."
        action={
          <Button icon={Plus} onClick={() => setCreateOpen(true)} disabled={!classId || !subjectId}>
            New assessment
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            options={classes}
            placeholder="Select a class"
          />
          <Select
            label="Subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            options={subjects}
            placeholder="All subjects"
            disabled={!classId}
          />
          <Select
            label="Assessment"
            value={assessmentId}
            onChange={(event) => setAssessmentId(event.target.value)}
            placeholder={assessmentsLoading ? 'Loading…' : 'Select an assessment'}
            options={(assessments ?? []).map((assessment) => ({
              value: assessment.id,
              label: `${assessment.name} (${assessment.max_marks} marks)${assessment.is_published ? ' ✓' : ''}`,
            }))}
          />
        </div>
      </Card>

      {isPublished && (
        <Callout tone="success" icon={CheckCircle2} title="Published" className="mb-5">
          These marks are visible to students and their parents. Edits are still possible and are
          recorded in the audit log.
        </Callout>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={8} height="h-12" />
      ) : !assessmentId ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No assessment selected"
          message={
            assessments?.length
              ? 'Choose an assessment to start entering marks.'
              : 'Create an assessment for this class and subject to begin.'
          }
          action={
            !assessments?.length && (
              <Button icon={Plus} onClick={() => setCreateOpen(true)} disabled={!classId || !subjectId}>
                Create an assessment
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardHeader
            title={sheet?.assessment?.name}
            subtitle={`${sheet?.assessment?.subjectName} · ${sheet?.assessment?.className} · ${humanise(sheet?.assessment?.type)} · ${formatDate(sheet?.assessment?.date)}`}
            icon={GraduationCap}
            action={
              <Badge tone={isPublished ? 'success' : 'warning'}>
                {isPublished ? 'Published' : 'Draft'}
              </Badge>
            }
          />

          <div className="mt-4">
            <ProgressBar
              label={`${entered} of ${total} students entered`}
              value={total ? (entered / total) * 100 : 0}
              tone={entered === total ? 'success' : 'brand'}
              showValue
            />
          </div>

          {/* Grid */}
          <div className="mt-5 overflow-hidden rounded-xl border border-line">
            <div className="scrollbar-slim overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken/60 text-left">
                    <th className="w-16 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Roll
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Student
                    </th>
                    <th className="w-32 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Marks / {maxMarks}
                    </th>
                    <th className="w-20 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      %
                    </th>
                    <th className="w-24 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Absent
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-line">
                  {(sheet?.students ?? []).map((student, index) => {
                    const entry = entries[student.studentId] ?? {};
                    const value = entry.marksObtained;
                    const percentage =
                      value !== '' && !entry.isAbsent ? (Number(value) / maxMarks) * 100 : null;
                    const isInvalid =
                      value !== '' && !entry.isAbsent && (Number(value) < 0 || Number(value) > maxMarks);

                    return (
                      <tr key={student.studentId} className="bg-surface-raised">
                        <td className="px-3 py-2 text-xs font-medium tabular-nums text-ink-muted">
                          {student.rollNumber ?? '—'}
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={student.name} src={student.avatarUrl} size="xs" />
                            <span className="truncate font-medium text-ink">{student.name}</span>
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={maxMarks}
                            step="0.5"
                            data-mark-index={index}
                            value={entry.isAbsent ? '' : value}
                            disabled={entry.isAbsent}
                            onChange={(event) =>
                              update(student.studentId, { marksObtained: event.target.value })
                            }
                            onKeyDown={(event) => handleKeyDown(event, index)}
                            aria-label={`Marks for ${student.name}`}
                            aria-invalid={isInvalid}
                            className={cn(
                              'h-9 w-full rounded-lg border bg-surface-raised px-2.5 text-sm tabular-nums text-ink transition',
                              'focus:outline-none focus:ring-2 focus:ring-brand-500/25',
                              isInvalid
                                ? 'border-danger-400 focus:border-danger-500'
                                : 'border-line focus:border-brand-500',
                              entry.isAbsent && 'bg-surface-sunken text-ink-subtle'
                            )}
                          />
                        </td>

                        <td className="px-3 py-2 text-center">
                          {percentage !== null ? (
                            <Badge tone={scoreTone(percentage)} size="sm">
                              {formatPercent(percentage, 0)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-ink-subtle">—</span>
                          )}
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={entry.isAbsent ?? false}
                              onChange={(event) =>
                                update(student.studentId, {
                                  isAbsent: event.target.checked,
                                  marksObtained: event.target.checked ? '' : entry.marksObtained,
                                })
                              }
                              aria-label={`Mark ${student.name} absent`}
                              className="h-4 w-4 rounded border-line text-danger-600 focus:ring-2 focus:ring-danger-500/30"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-sm text-ink-muted">
              Press Enter or ↓ to move to the next student.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Save} onClick={save} isLoading={isSaving}>
                Save marks
              </Button>

              {!isPublished && (
                <Button
                  icon={Send}
                  onClick={() => setConfirmPublish(true)}
                  disabled={entered < total}
                  title={entered < total ? 'Enter every mark before publishing' : undefined}
                >
                  Publish
                </Button>
              )}
            </div>
          </div>

          {!isPublished && entered < total && (
            <Callout tone="warning" icon={AlertTriangle} className="mt-4">
              <p className="text-xs">
                {total - entered} student(s) still have no mark. Every mark must be entered before
                the assessment can be published.
              </p>
            </Callout>
          )}
        </Card>
      )}

      <CreateAssessmentModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        classId={classId}
        subjectId={subjectId}
        onCreated={(created) => {
          refetchAssessments();
          setAssessmentId(created.id);
          setCreateOpen(false);
        }}
      />

      <ConfirmDialog
        isOpen={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={publish}
        title="Publish these marks?"
        message={`All ${total} students and their parents will be able to see these results immediately, and will be notified. You can still correct a mark afterwards.`}
        confirmLabel="Publish marks"
        variant="primary"
        isPending={isPublishing}
      />
    </>
  );
}

function CreateAssessmentModal({ isOpen, onClose, classId, subjectId, onCreated }) {
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { type: 'internal', maxMarks: 25, weightage: 20, date: todayIso() },
  });

  const submit = async (values) => {
    try {
      const created = await marksApi.createAssessment({ ...values, classId, subjectId });
      toast.success('Assessment created');
      reset({ type: 'internal', maxMarks: 25, weightage: 20, date: todayIso() });
      onCreated(created);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New assessment"
      description="Create an assessment for the selected class and subject."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            Create assessment
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input
          label="Name"
          placeholder="Unit Test 2"
          required
          error={errors.name?.message}
          {...register('name', { required: 'Give the assessment a name' })}
        />

        <Select
          label="Type"
          options={ASSESSMENT_TYPES}
          error={errors.type?.message}
          {...register('type', { required: true })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
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
          <Input
            label="Weightage (%)"
            type="number"
            min="0"
            max="100"
            hint="Share of the final grade"
            {...register('weightage')}
          />
        </div>

        <DatePicker
          label="Date"
          required
          error={errors.date?.message}
          {...register('date', { required: 'Choose a date' })}
        />
      </form>
    </Modal>
  );
}

export default TeacherMarks;
