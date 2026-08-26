import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PlaneTakeoff, Plus, Trash2 } from 'lucide-react';
import { leaveApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  Button,
  Modal,
  Textarea,
  Select,
  DatePicker,
  StatusBadge,
  EmptyState,
  ErrorState,
  ConfirmDialog,
  LoadingSkeleton,
  Badge,
} from '../../components/ui/index.js';
import { formatDate, humanise, todayIso } from '../../utils/format.js';
import { LEAVE_TYPES } from '../../utils/constants.js';

/** Leave applications (§16). */
export function StudentLeave() {
  const toast = useToast();
  const [isFormOpen, setFormOpen] = useState(false);
  const [toCancel, setToCancel] = useState(null);
  const [isCancelling, setCancelling] = useState(false);

  const { data, isLoading, error, refetch } = useApi(() => leaveApi.list({ limit: 50 }), []);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { leaveType: 'personal', startDate: todayIso() } });

  const startDate = watch('startDate');

  const submit = async (values) => {
    try {
      await leaveApi.apply(values);
      toast.success('Leave application submitted');
      setFormOpen(false);
      reset({ leaveType: 'personal', startDate: todayIso() });
      refetch();
    } catch (submitError) {
      toast.error(submitError.message);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await leaveApi.cancel(toCancel.id);
      toast.success('Application withdrawn');
      setToCancel(null);
      refetch();
    } catch (cancelError) {
      toast.error(cancelError.message);
    } finally {
      setCancelling(false);
    }
  };

  const applications = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Leave applications"
        description="Apply for leave and track the decision from your class teacher."
        action={
          <Button icon={Plus} onClick={() => setFormOpen(true)}>
            Apply for leave
          </Button>
        }
      />

      <Card>
        <CardHeader title="Your applications" icon={PlaneTakeoff} />

        <div className="mt-4">
          {error ? (
            <ErrorState error={error} onRetry={refetch} compact />
          ) : isLoading ? (
            <LoadingSkeleton count={3} height="h-24" />
          ) : applications.length === 0 ? (
            <EmptyState
              icon={PlaneTakeoff}
              title="No leave applications"
              message="Apply here when you need to be away, and your class teacher will review it."
              action={
                <Button icon={Plus} onClick={() => setFormOpen(true)}>
                  Apply for leave
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {applications.map((application) => (
                <li key={application.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">
                          {formatDate(application.startDate)} – {formatDate(application.endDate)}
                        </h3>
                        <Badge tone="neutral" size="sm">
                          {application.days} day{application.days === 1 ? '' : 's'}
                        </Badge>
                        <Badge tone="info" size="sm">
                          {humanise(application.leaveType)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                        {application.reason}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={application.status} size="sm" />
                      {application.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Trash2}
                          onClick={() => setToCancel(application)}
                        >
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>

                  {application.reviewNote && (
                    <div className="mt-3 rounded-lg bg-surface-sunken p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                        Note from {application.reviewerName ?? 'your teacher'}
                      </p>
                      <p className="mt-1 text-sm text-ink">{application.reviewNote}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setFormOpen(false)}
        title="Apply for leave"
        description="Your class teacher will review this application."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
              Submit application
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker
              label="Start date"
              required
              error={errors.startDate?.message}
              {...register('startDate', { required: 'Choose a start date' })}
            />
            <DatePicker
              label="End date"
              required
              min={startDate}
              error={errors.endDate?.message}
              {...register('endDate', {
                required: 'Choose an end date',
                validate: (value) =>
                  !startDate || value >= startDate || 'The end date cannot be before the start date',
              })}
            />
          </div>

          <Select
            label="Type of leave"
            options={LEAVE_TYPES}
            error={errors.leaveType?.message}
            {...register('leaveType', { required: 'Choose a leave type' })}
          />

          <Textarea
            label="Reason"
            placeholder="Explain why you need to be away…"
            rows={5}
            required
            hint="Your teacher sees this, so give enough context for a decision."
            error={errors.reason?.message}
            {...register('reason', {
              required: 'Give a reason for your leave',
              minLength: { value: 10, message: 'Please give at least 10 characters' },
            })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(toCancel)}
        onClose={() => setToCancel(null)}
        onConfirm={cancel}
        title="Withdraw this application?"
        message={
          toCancel
            ? `Your leave request for ${formatDate(toCancel.startDate)} – ${formatDate(toCancel.endDate)} will be removed. You can apply again later.`
            : ''
        }
        confirmLabel="Withdraw"
        isPending={isCancelling}
      />
    </>
  );
}

export default StudentLeave;
