import { useState } from 'react';
import { PlaneTakeoff, Check, X, CalendarDays } from 'lucide-react';
import { leaveApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, StatCard, Tabs, Button, Modal, Textarea, StatusBadge, Badge, Avatar,
  EmptyState, ErrorState, LoadingSkeleton, Pagination,
} from '../components/ui/index.js';
import { formatDate, humanise } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/** Leave review for teachers and admins (§16, §19). */
export function LeaveManager() {
  const toast = useToast();

  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState(null);
  const [decision, setDecision] = useState('approved');
  const [note, setNote] = useState('');
  const [isSaving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useApi(
    () => leaveApi.list({ page, limit: 20, status: status === 'all' ? undefined : status }),
    [page, status]
  );

  const openReview = (application, initialDecision) => {
    setReviewing(application);
    setDecision(initialDecision);
    setNote('');
  };

  const submit = async () => {
    setSaving(true);
    try {
      await leaveApi.review(reviewing.id, { status: decision, reviewNote: note || null });
      toast.success(`Leave ${decision}`);
      setReviewing(null);
      refetch();
    } catch (reviewError) {
      toast.error(reviewError.message);
    } finally {
      setSaving(false);
    }
  };

  const applications = data?.data ?? [];
  const pendingCount = applications.filter((row) => row.status === 'pending').length;

  return (
    <>
      <PageHeader
        title="Leave applications"
        description="Review leave requests from students in your classes."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting review"
          value={pendingCount}
          icon={PlaneTakeoff}
          tone={pendingCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Approved"
          value={applications.filter((row) => row.status === 'approved').length}
          icon={Check}
          tone="success"
        />
        <StatCard
          label="Rejected"
          value={applications.filter((row) => row.status === 'rejected').length}
          icon={X}
          tone="neutral"
        />
      </div>

      <Tabs
        tabs={[
          { value: 'pending', label: 'Pending', count: pendingCount || undefined },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'all', label: 'All' },
        ]}
        active={status}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        className="mb-5"
      />

      <Card>
        <CardHeader title="Applications" icon={CalendarDays} />

        <div className="mt-4">
          {error ? (
            <ErrorState error={error} onRetry={refetch} compact />
          ) : isLoading ? (
            <LoadingSkeleton count={4} height="h-28" />
          ) : applications.length === 0 ? (
            <EmptyState
              icon={PlaneTakeoff}
              title={status === 'pending' ? 'Nothing awaiting review' : 'No applications'}
              message={
                status === 'pending'
                  ? 'Leave requests from your students will appear here.'
                  : 'Try a different filter.'
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {applications.map((application) => (
                  <li
                    key={application.id}
                    className={cn(
                      'rounded-xl border p-4',
                      application.status === 'pending'
                        ? 'border-warning-300 bg-warning-50/30 dark:border-warning-500/40 dark:bg-warning-500/5'
                        : 'border-line'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <Avatar name={application.studentName} src={application.avatarUrl} size="sm" />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-ink">
                              {application.studentName}
                            </p>
                            <Badge tone="neutral" size="sm">
                              {humanise(application.leaveType)}
                            </Badge>
                            <Badge tone="info" size="sm">
                              {application.days} day{application.days === 1 ? '' : 's'}
                            </Badge>
                          </div>

                          <p className="mt-1 text-xs text-ink-muted">
                            {application.className} · Roll {application.rollNumber ?? '—'} ·{' '}
                            {formatDate(application.startDate)} – {formatDate(application.endDate)}
                          </p>

                          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                            {application.reason}
                          </p>

                          {application.attachmentUrl && (
                            <a
                              href={application.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline"
                            >
                              View the attached document
                            </a>
                          )}

                          {application.reviewNote && (
                            <p className="mt-2 rounded-lg bg-surface-sunken p-2.5 text-xs text-ink-muted">
                              <span className="font-semibold">
                                {application.reviewerName ?? 'Reviewer'}:
                              </span>{' '}
                              {application.reviewNote}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <StatusBadge status={application.status} size="sm" />

                        {application.status === 'pending' && (
                          <>
                            <Button
                              size="xs"
                              variant="success"
                              icon={Check}
                              onClick={() => openReview(application, 'approved')}
                            >
                              Approve
                            </Button>
                            <Button
                              size="xs"
                              variant="secondary"
                              icon={X}
                              onClick={() => openReview(application, 'rejected')}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {data?.meta?.pagination?.totalPages > 1 && (
                <Pagination pagination={data.meta.pagination} onPageChange={setPage} />
              )}
            </>
          )}
        </div>
      </Card>

      <Modal
        isOpen={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title={decision === 'approved' ? 'Approve this leave?' : 'Reject this leave?'}
        description={
          reviewing
            ? `${reviewing.studentName} · ${formatDate(reviewing.startDate)} – ${formatDate(reviewing.endDate)}`
            : ''
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === 'approved' ? 'success' : 'danger'}
              onClick={submit}
              isLoading={isSaving}
            >
              {decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-sunken p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Their reason
            </p>
            <p className="mt-1.5 text-sm text-ink">{reviewing?.reason}</p>
          </div>

          <Textarea
            label="Note to the student"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder={
              decision === 'approved'
                ? 'Anything they should know — catch-up work, conditions…'
                : 'Explain why, so they know what to do differently.'
            }
            hint="Optional, but a rejection without a reason is rarely helpful."
          />
        </div>
      </Modal>
    </>
  );
}

export default LeaveManager;
