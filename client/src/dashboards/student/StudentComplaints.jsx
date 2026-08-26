import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MessageSquareWarning, Plus, ShieldOff, Search, Copy, Check } from 'lucide-react';
import { complaintApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, Button, Modal, Input, Textarea, Select, Checkbox, StatusBadge,
  EmptyState, ErrorState, Callout, Badge, LoadingSkeleton,
} from '../../components/ui/index.js';
import { formatDate, humanise } from '../../utils/format.js';
import { COMPLAINT_CATEGORIES } from '../../utils/constants.js';

/**
 * Complaints (§16, §39).
 *
 * Anonymous complaints are stored with no link to the author, so they never
 * appear in this list — the tracking code is the only way back to one. The UI
 * says so plainly rather than letting a student assume otherwise.
 */
export function StudentComplaints() {
  const toast = useToast();
  const [isFormOpen, setFormOpen] = useState(false);
  const [trackingCode, setTrackingCode] = useState(null);
  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error, refetch } = useApi(() => complaintApi.list({ limit: 50 }), []);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { category: 'academic', isAnonymous: false } });

  const isAnonymous = watch('isAnonymous');

  const submit = async (values) => {
    try {
      const result = await complaintApi.create(values);
      setFormOpen(false);
      reset();

      if (result.isAnonymous) {
        setTrackingCode(result.trackingCode);
      } else {
        toast.success('Complaint submitted');
        refetch();
      }
    } catch (submitError) {
      toast.error(submitError.message);
    }
  };

  const lookup = async (event) => {
    event.preventDefault();
    if (!lookupCode.trim()) return;

    try {
      const result = await complaintApi.track(lookupCode.trim());
      setLookupResult(result);
    } catch (lookupError) {
      toast.error(lookupError.message);
      setLookupResult(null);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(trackingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const complaints = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Raise an issue with the administration. You can do so anonymously."
        action={
          <Button icon={Plus} onClick={() => setFormOpen(true)}>
            New complaint
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Your complaints"
              subtitle="Complaints filed under your name"
              icon={MessageSquareWarning}
            />

            <div className="mt-4">
              {error ? (
                <ErrorState error={error} onRetry={refetch} compact />
              ) : isLoading ? (
                <LoadingSkeleton count={3} height="h-24" />
              ) : complaints.length === 0 ? (
                <EmptyState
                  icon={MessageSquareWarning}
                  title="No complaints filed"
                  message="If something needs attention — academic, infrastructure or personal — you can raise it here."
                  action={
                    <Button icon={Plus} onClick={() => setFormOpen(true)}>
                      File a complaint
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {complaints.map((complaint) => (
                    <li key={complaint.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-ink">{complaint.subject}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge tone="neutral" size="sm">
                              {humanise(complaint.category)}
                            </Badge>
                            <span className="text-xs text-ink-subtle">
                              {formatDate(complaint.createdAt)}
                            </span>
                            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                              {complaint.trackingCode}
                            </code>
                          </div>
                        </div>
                        <StatusBadge status={complaint.status} size="sm" />
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                        {complaint.description}
                      </p>

                      {complaint.response && (
                        <div className="mt-3 rounded-lg bg-success-50 p-3 dark:bg-success-500/10">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-success-700 dark:text-success-500">
                            Response from administration
                          </p>
                          <p className="mt-1 text-sm text-success-900 dark:text-success-100">
                            {complaint.response}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Track an anonymous complaint" icon={Search} />
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Anonymous complaints are not linked to your account, so they do not appear in the list.
              Use the tracking code you were given.
            </p>

            <form onSubmit={lookup} className="mt-4 space-y-3">
              <Input
                label="Tracking code"
                value={lookupCode}
                onChange={(event) => setLookupCode(event.target.value.toUpperCase())}
                placeholder="SE-XXXXXXXX"
                className="font-mono"
              />
              <Button type="submit" variant="secondary" fullWidth icon={Search}>
                Check status
              </Button>
            </form>

            {lookupResult && (
              <div className="mt-4 rounded-xl border border-line bg-surface-sunken p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{lookupResult.subject}</p>
                  <StatusBadge status={lookupResult.status} size="sm" />
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Filed {formatDate(lookupResult.created_at)} ·{' '}
                  {humanise(lookupResult.category)}
                </p>
                {lookupResult.response && (
                  <p className="mt-3 border-t border-line pt-3 text-sm text-ink">
                    {lookupResult.response}
                  </p>
                )}
              </div>
            )}
          </Card>

          <Callout tone="info" icon={ShieldOff} title="About anonymity">
            <p className="text-xs leading-relaxed">
              When you tick &ldquo;submit anonymously&rdquo;, no identifier linking the complaint to
              you is stored at all — not hidden, not encrypted, simply not recorded. That also means
              nobody can restore the link later, including you.
            </p>
          </Callout>
        </div>
      </div>

      {/* New complaint */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setFormOpen(false)}
        title="File a complaint"
        description="Your complaint goes to the administration team."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
              Submit complaint
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Select
            label="Category"
            required
            options={COMPLAINT_CATEGORIES}
            error={errors.category?.message}
            {...register('category', { required: 'Choose a category' })}
          />

          <Input
            label="Subject"
            placeholder="A short summary of the issue"
            required
            error={errors.subject?.message}
            {...register('subject', {
              required: 'Give your complaint a short title',
              minLength: { value: 4, message: 'At least 4 characters' },
            })}
          />

          <Textarea
            label="What happened?"
            placeholder="Describe the issue with enough detail for someone to act on it…"
            rows={6}
            required
            error={errors.description?.message}
            {...register('description', {
              required: 'Please describe the issue',
              minLength: { value: 15, message: 'Please give a little more detail' },
            })}
          />

          <div className="rounded-xl border border-line bg-surface-sunken p-4">
            <Checkbox
              label="Submit anonymously"
              description="Your name will not be stored with this complaint."
              {...register('isAnonymous')}
            />

            {isAnonymous && (
              <Callout tone="warning" className="mt-3">
                <p className="text-xs">
                  You will be given a tracking code once you submit. It is shown only once and cannot
                  be recovered — save it if you want to follow the complaint.
                </p>
              </Callout>
            )}
          </div>
        </form>
      </Modal>

      {/* Tracking code, shown once */}
      <Modal
        isOpen={Boolean(trackingCode)}
        onClose={() => setTrackingCode(null)}
        title="Save your tracking code"
        size="sm"
        closeOnBackdrop={false}
        footer={
          <Button onClick={() => setTrackingCode(null)}>I’ve saved it</Button>
        }
      >
        <p className="text-sm text-ink-muted">
          Your complaint was submitted anonymously. This code is the only way to check its status —
          it is not stored against your account and cannot be recovered.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-4 dark:bg-brand-950/40">
          <code className="flex-1 text-center font-mono text-lg font-bold tracking-wider text-brand-700 dark:text-brand-300">
            {trackingCode}
          </code>
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? Check : Copy}
            onClick={copyCode}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default StudentComplaints;
