import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  CalendarDays,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { timetableApi, academicApi, userApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  Button,
  Modal,
  Select,
  Input,
  Badge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ConfirmDialog,
  Callout,
  Tabs,
} from '../../components/ui/index.js';
import { formatTime } from '../../utils/format.js';
import { WEEKDAYS, CHART_COLORS } from '../../utils/constants.js';

/**
 * Timetable management (§12).
 *
 * The conflict audit is the point: teacher and class clashes are detected on
 * save, and the whole timetable can be checked at once from the second tab.
 */
export function AdminTimetable() {
  const toast = useToast();

  const [tab, setTab] = useState('grid');
  const [classId, setClassId] = useState('');
  const [isOpen, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const { data: classes } = useApi(() => academicApi.classes({ scope: 'all' }), []);
  const effectiveClassId = classId || classes?.[0]?.id;

  const { data, isLoading, error, refetch } = useApi(
    () => (effectiveClassId ? timetableApi.get({ classId: effectiveClassId }) : Promise.resolve(null)),
    [effectiveClassId]
  );

  const { data: conflicts, refetch: refetchConflicts } = useApi(() => timetableApi.conflicts(), []);

  const remove = async () => {
    try {
      await timetableApi.remove(toDelete.id);
      toast.success('Period removed');
      setToDelete(null);
      refetch();
      refetchConflicts();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  const days = data?.days ?? {};
  const weekdays = WEEKDAYS.slice(0, 6);

  const subjectColours = new Map();
  Object.values(days)
    .flat()
    .forEach((period) => {
      if (!subjectColours.has(period.subjectId)) {
        subjectColours.set(period.subjectId, CHART_COLORS[subjectColours.size % CHART_COLORS.length]);
      }
    });

  return (
    <>
      <PageHeader
        title="Timetable"
        description="Build the weekly schedule. Teacher and class clashes are refused automatically."
        action={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Add a period
          </Button>
        }
      />

      <Tabs
        tabs={[
          { value: 'grid', label: 'Weekly grid', icon: CalendarDays },
          {
            value: 'conflicts',
            label: 'Conflict audit',
            icon: AlertTriangle,
            count: conflicts?.count || undefined,
          },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'grid' && (
        <>
          <Card className="mb-5">
            <Select
              label="Class"
              value={effectiveClassId ?? ''}
              onChange={(event) => setClassId(event.target.value)}
              options={(classes ?? []).map((classRow) => ({
                value: classRow.id,
                label: `${classRow.name} ${classRow.section}`,
              }))}
              placeholder="Select a class"
              containerClassName="max-w-xs"
            />
          </Card>

          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingSkeleton count={6} height="h-48" />
          ) : !effectiveClassId ? (
            <EmptyState icon={CalendarDays} title="Select a class" />
          ) : (
            <div className="scroll-x">
              <div className="grid min-w-[52rem] gap-3 lg:grid-cols-6">
                {weekdays.map((day) => {
                  const periods = days[day.value] ?? [];

                  return (
                    <div key={day.value}>
                      <div className="mb-2.5 rounded-xl bg-surface-sunken px-3 py-2 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {day.short}
                        </p>
                      </div>

                      <div className="space-y-2">
                        {periods.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-ink-subtle">
                            Free
                          </p>
                        ) : (
                          periods.map((period) => (
                            <div
                              key={period.id}
                              className="group relative rounded-xl border border-line bg-surface-raised p-3 shadow-card"
                              style={{
                                borderLeftWidth: 3,
                                borderLeftColor: subjectColours.get(period.subjectId),
                              }}
                            >
                              <p className="text-[11px] font-semibold tabular-nums text-ink-muted">
                                {formatTime(period.startTime)} – {formatTime(period.endTime)}
                              </p>
                              <p className="mt-1 text-xs font-semibold leading-snug text-ink">
                                {period.subjectName}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-ink-muted">
                                {period.teacherName}
                              </p>
                              {period.room && (
                                <p className="text-[11px] text-ink-subtle">{period.room}</p>
                              )}

                              <button
                                type="button"
                                onClick={() => setToDelete(period)}
                                aria-label="Remove this period"
                                className="absolute right-1.5 top-1.5 rounded-md p-1 text-ink-subtle opacity-0 transition hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'conflicts' && (
        <Card>
          <CardHeader
            title="Conflict audit"
            subtitle="Every overlapping period across the whole timetable"
            icon={AlertTriangle}
          />

          <div className="mt-4">
            {!conflicts ? (
              <LoadingSkeleton count={3} height="h-20" />
            ) : conflicts.count === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-success-500/25 bg-success-50/50 px-6 py-12 text-center dark:bg-success-500/5">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-100 text-success-600 dark:bg-success-500/15">
                  <CheckCircle2 size={22} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-ink">No conflicts</h3>
                <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
                  No teacher is double-booked and no class has two lessons at the same time.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {conflicts.conflicts.map((conflict, index) => (
                  <li
                    key={index}
                    className="rounded-xl border border-danger-300 bg-danger-50/40 p-4 dark:border-danger-500/40 dark:bg-danger-500/5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="danger" size="sm">
                        {conflict.conflict_type} clash
                      </Badge>
                      <span className="text-sm font-medium capitalize text-ink">{conflict.day}</span>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-surface-raised p-3">
                        <p className="text-xs font-semibold text-ink">{conflict.subject_a}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {conflict.class_a} {conflict.section_a} · {conflict.teacher_a}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink-subtle">
                          {formatTime(conflict.a_start)} – {formatTime(conflict.a_end)}
                        </p>
                      </div>

                      <div className="rounded-lg bg-surface-raised p-3">
                        <p className="text-xs font-semibold text-ink">{conflict.subject_b}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {conflict.class_b} {conflict.section_b} · {conflict.teacher_b}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink-subtle">
                          {formatTime(conflict.b_start)} – {formatTime(conflict.b_end)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <AddPeriodModal
        isOpen={isOpen}
        classes={classes}
        defaultClassId={effectiveClassId}
        onClose={() => setOpen(false)}
        onAdded={() => {
          setOpen(false);
          refetch();
          refetchConflicts();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Remove this period?"
        message={
          toDelete
            ? `${toDelete.subjectName} at ${formatTime(toDelete.startTime)} will be removed from the timetable.`
            : ''
        }
        confirmLabel="Remove period"
      />
    </>
  );
}

function AddPeriodModal({ isOpen, classes, defaultClassId, onClose, onAdded }) {
  const toast = useToast();

  const { data: subjects } = useApi(() => academicApi.subjects({ scope: 'all' }), []);
  const { data: teachers } = useApi(() => userApi.list({ role: 'teacher', limit: 100 }), []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      day: 'monday',
      startTime: '09:00',
      endTime: '10:00',
      academicYear: '2025-26',
      classId: defaultClassId,
    },
  });

  const submit = async (values) => {
    try {
      await timetableApi.create({ ...values, room: values.room || null });
      toast.success('Period added');
      reset({
        day: 'monday',
        startTime: '09:00',
        endTime: '10:00',
        academicYear: '2025-26',
        classId: defaultClassId,
      });
      onAdded();
    } catch (error) {
      // A 409 here is the conflict detector doing its job.
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add a period"
      description="A clash with an existing period for the same teacher or class will be refused."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            Add period
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Select
          label="Class"
          required
          defaultValue={defaultClassId}
          error={errors.classId?.message}
          options={(classes ?? []).map((classRow) => ({
            value: classRow.id,
            label: `${classRow.name} ${classRow.section}`,
          }))}
          {...register('classId', { required: 'Choose a class' })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Subject"
            required
            placeholder="Select a subject"
            error={errors.subjectId?.message}
            options={(subjects ?? []).map((subject) => ({
              value: subject.id,
              label: `${subject.name} (${subject.code})`,
            }))}
            {...register('subjectId', { required: 'Choose a subject' })}
          />

          <Select
            label="Teacher"
            required
            placeholder="Select a teacher"
            error={errors.teacherId?.message}
            options={(teachers?.data ?? []).map((teacher) => ({
              value: teacher.id,
              label: teacher.name,
            }))}
            {...register('teacherId', { required: 'Choose a teacher' })}
          />
        </div>

        <Select
          label="Day"
          options={WEEKDAYS.map((day) => ({ value: day.value, label: day.label }))}
          {...register('day')}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Start"
            type="time"
            required
            error={errors.startTime?.message}
            {...register('startTime', { required: 'Enter a start time' })}
          />
          <Input
            label="End"
            type="time"
            required
            error={errors.endTime?.message}
            {...register('endTime', { required: 'Enter an end time' })}
          />
          <Input label="Room" placeholder="B-201" {...register('room')} />
        </div>

        <Input
          label="Academic year"
          required
          hint="Format: 2025-26"
          error={errors.academicYear?.message}
          {...register('academicYear', {
            required: 'Enter the academic year',
            pattern: { value: /^\d{4}-\d{2}$/, message: 'Use the format 2025-26' },
          })}
        />

        <Callout tone="info">
          <p className="text-xs">
            The teacher must already be assigned to this subject and class for them to mark
            attendance or enter marks. Assign them from the Subjects page.
          </p>
        </Callout>
      </form>
    </Modal>
  );
}

export default AdminTimetable;
