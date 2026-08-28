import { useState } from 'react';
import { MessageSquareWarning, ShieldOff, Filter, CheckCircle2 } from 'lucide-react';
import { complaintApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  StatCard,
  Select,
  Button,
  Modal,
  Textarea,
  Badge,
  StatusBadge,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Pagination,
  Callout,
} from '../../components/ui/index.js';
import { formatDate, formatRelative, humanise } from '../../utils/format.js';
import { resolveFileUrl } from '../../utils/fileUrl.js';
import { cn } from '../../utils/cn.js';

/** Complaint triage (§39). */
export function AdminComplaints() {
  const toast = useToast();

  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState(null);
  const [response, setResponse] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [isSaving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useApi(
    () =>
      complaintApi.list({
        page,
        limit: 20,
        status: status || undefined,
        category: category || undefined,
      }),
    [page, status, category]
  );

  const { data: stats, refetch: refetchStats } = useApi(() => complaintApi.stats(), []);

  const openComplaint = (complaint) => {
    setActive(complaint);
    setResponse(complaint.response ?? '');
    setNewStatus(complaint.status);
    setPriority(complaint.priority);
  };

  const save = async () => {
    setSaving(true);
    try {
      await complaintApi.update(active.id, {
        status: newStatus,
        priority,
        response: response.trim() || null,
      });
      toast.success('Complaint updated');
      setActive(null);
      refetch();
      refetchStats();
    } catch (saveError) {
      toast.error(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const complaints = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Triage and resolve issues raised by students."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting action"
          value={stats?.pending ?? 0}
          icon={MessageSquareWarning}
          tone={stats?.pending > 0 ? 'warning' : 'success'}
          hint={`${stats?.submitted ?? 0} new · ${stats?.under_review ?? 0} in review`}
        />
        <StatCard label="Resolved" value={stats?.resolved ?? 0} icon={CheckCircle2} tone="success" />
        <StatCard
          label="Anonymous"
          value={stats?.anonymous ?? 0}
          icon={ShieldOff}
          tone="info"
          hint="No author recorded"
        />
        <StatCard label="Total filed" value={stats?.total ?? 0} icon={Filter} tone="neutral" />
      </div>

      <Card>
        <CardHeader
          title="All complaints"
          icon={MessageSquareWarning}
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                placeholder="All statuses"
                options={[
                  { value: 'submitted', label: 'Submitted' },
                  { value: 'under_review', label: 'Under review' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
                containerClassName="w-40"
              />
              <Select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}
                placeholder="All categories"
                options={[
                  { value: 'academic', label: 'Academic' },
                  { value: 'bullying', label: 'Bullying' },
                  { value: 'infrastructure', label: 'Infrastructure' },
                  { value: 'teacher_help', label: 'Teacher support' },
                  { value: 'other', label: 'Other' },
                ]}
                containerClassName="w-40"
              />
            </div>
          }
        />

        <div className="mt-5">
          {error ? (
            <ErrorState error={error} onRetry={refetch} compact />
          ) : isLoading ? (
            <LoadingSkeleton count={4} height="h-28" />
          ) : complaints.length === 0 ? (
            <EmptyState
              icon={MessageSquareWarning}
              title="No complaints"
              message={
                status || category
                  ? 'Nothing matches those filters.'
                  : 'Nothing has been raised yet — which is a good sign.'
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {complaints.map((complaint) => (
                  <li key={complaint.id}>
                    <button
                      type="button"
                      onClick={() => openComplaint(complaint)}
                      className={cn(
                        'w-full rounded-xl border p-4 text-left transition hover:border-brand-300 hover:bg-surface-sunken/50',
                        complaint.priority === 'urgent'
                          ? 'border-danger-300 dark:border-danger-500/40'
                          : 'border-line'
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-ink">{complaint.subject}</h3>
                            <Badge tone="neutral" size="sm">
                              {humanise(complaint.category)}
                            </Badge>
                            {complaint.priority === 'urgent' && (
                              <StatusBadge status="urgent" size="sm" />
                            )}
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                            {complaint.isAnonymous ? (
                              <span className="flex items-center gap-1">
                                <ShieldOff size={11} aria-hidden="true" />
                                Anonymous
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <Avatar name={complaint.studentName} size="xs" />
                                {complaint.studentName}
                              </span>
                            )}
                            <span>·</span>
                            <span>{formatRelative(complaint.createdAt)}</span>
                            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px]">
                              {complaint.trackingCode}
                            </code>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                            {complaint.description}
                          </p>
                        </div>

                        <StatusBadge status={complaint.status} size="sm" />
                      </div>
                    </button>
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

      {/* Triage */}
      <Modal
        isOpen={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.subject ?? ''}
        description={
          active
            ? `${humanise(active.category)} · filed ${formatDate(active.createdAt)} · ${active.trackingCode}`
            : ''
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setActive(null)}>
              Close
            </Button>
            <Button onClick={save} isLoading={isSaving}>
              Save changes
            </Button>
          </>
        }
      >
        {active && (
          <div className="space-y-5">
            {active.isAnonymous && (
              <Callout tone="info" icon={ShieldOff} title="Anonymous complaint">
                <p className="text-xs">
                  No author is recorded for this complaint — the identity was never stored. The
                  student can follow it using their tracking code, but cannot be notified directly.
                </p>
              </Callout>
            )}

            <div className="rounded-xl bg-surface-sunken p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                What was reported
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {active.description}
              </p>
            </div>

            {active.attachmentUrl && (
              <a
                href={resolveFileUrl(active.attachmentUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                View the attached file
              </a>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Status"
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value)}
                options={[
                  { value: 'submitted', label: 'Submitted' },
                  { value: 'under_review', label: 'Under review' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
              <Select
                label="Priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </div>

            <Textarea
              label="Response"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              rows={5}
              placeholder="What action has been taken?"
              hint={
                active.isAnonymous
                  ? 'Visible to anyone who looks up the tracking code.'
                  : 'The student sees this on their complaints page and is notified.'
              }
            />
          </div>
        )}
      </Modal>
    </>
  );
}

export default AdminComplaints;
