import { useState } from 'react';
import {
  Wallet,
  CreditCard,
  Receipt,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { feeApi, parentApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  StatCard,
  DataTable,
  StatusBadge,
  Button,
  Modal,
  Input,
  Select,
  EmptyState,
  ErrorState,
  Callout,
  ProgressBar,
  LoadingSkeleton,
  RestrictedState,
} from '../../components/ui/index.js';
import { ChildSelector } from './ChildSelector.jsx';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format.js';

/**
 * Fees (§31), used by both students and parents.
 *
 * Without Razorpay keys the API runs in mock mode and settles instantly; the
 * page says which mode it is in rather than pretending a real charge happened.
 */
export function Fees({ forParent = false }) {
  const toast = useToast();

  const [selectedChildId, setSelectedChildId] = useState(null);
  const [payingRecord, setPayingRecord] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [isPaying, setPaying] = useState(false);

  const { data: childList } = useApi(
    () => (forParent ? parentApi.children() : Promise.resolve(null)),
    [forParent]
  );

  const child = forParent
    ? selectedChildId
      ? childList?.find((candidate) => candidate.id === selectedChildId)
      : childList?.[0]
    : null;

  const allowed = !forParent || (child?.permissions?.fees ?? false);

  const { data, isLoading, error, refetch } = useApi(
    () =>
      allowed
        ? feeApi.mine(forParent && child ? { studentId: child.id } : {})
        : Promise.resolve(null),
    [child?.id, allowed]
  );

  const startPayment = (record) => {
    setPayingRecord(record);
    setAmount(String(record.pendingAmount));
  };

  const pay = async () => {
    setPaying(true);
    try {
      // Two-step, provider-shaped flow: create the order, then verify it.
      const created = await feeApi.pay({
        feeRecordId: payingRecord.id,
        amount: Number(amount),
        method,
      });

      const verified = await feeApi.verify({ paymentId: created.payment.id });

      toast.success(`Payment successful. Receipt ${verified.receiptNo}.`);
      setPayingRecord(null);
      refetch();
    } catch (payError) {
      toast.error(payError.message);
    } finally {
      setPaying(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Fee',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.academicYear}</p>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Amount',
      align: 'right',
      render: (row) => formatCurrency(row.totalAmount),
    },
    {
      key: 'paidAmount',
      header: 'Paid',
      align: 'right',
      render: (row) => (
        <span className="text-success-600">{formatCurrency(row.paidAmount)}</span>
      ),
    },
    {
      key: 'pendingAmount',
      header: 'Outstanding',
      align: 'right',
      render: (row) =>
        row.pendingAmount > 0 ? (
          <span className="font-semibold text-danger-600">{formatCurrency(row.pendingAmount)}</span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    { key: 'dueDate', header: 'Due', hideOnMobile: true, render: (row) => formatDate(row.dueDate) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) =>
        row.pendingAmount > 0 ? (
          <Button size="xs" icon={CreditCard} onClick={() => startPayment(row)}>
            Pay
          </Button>
        ) : (
          <CheckCircle2 size={16} className="ml-auto text-success-500" aria-hidden="true" />
        ),
    },
  ];

  const summary = data?.summary ?? {};

  return (
    <>
      <PageHeader
        title="Fees"
        description={
          forParent ? "Your child's fee records and payment history." : 'Your fee records and payment history.'
        }
      >
        {forParent && childList?.length > 1 && (
          <ChildSelector
            students={childList}
            selectedId={child?.id}
            onSelect={setSelectedChildId}
            className="mt-4"
          />
        )}
      </PageHeader>

      {!allowed ? (
        <Card>
          <CardHeader title="Fees" icon={Wallet} />
          <RestrictedState scope="fee records" studentName={child?.name} className="mt-4" />
        </Card>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-24" />
      ) : (
        <>
          {data?.mockMode && (
            <Callout tone="info" title="Mock payment mode" className="mb-6">
              No payment provider is configured, so payments settle instantly without a real charge.
              Set <code className="rounded bg-surface-raised px-1 font-mono text-xs">RAZORPAY_KEY_ID</code>{' '}
              and <code className="rounded bg-surface-raised px-1 font-mono text-xs">RAZORPAY_KEY_SECRET</code>{' '}
              to take real payments.
            </Callout>
          )}

          {summary.overdueCount > 0 && (
            <Callout tone="danger" icon={AlertTriangle} title="Overdue payment" className="mb-6">
              {summary.overdueCount} fee record
              {summary.overdueCount === 1 ? ' is' : 's are'} past the due date.
            </Callout>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total billed"
              value={formatCurrency(summary.totalAmount)}
              icon={Wallet}
              tone="info"
            />
            <StatCard
              label="Paid"
              value={formatCurrency(summary.paidAmount)}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(summary.pendingAmount)}
              icon={AlertTriangle}
              tone={summary.pendingAmount > 0 ? 'danger' : 'success'}
            />
          </div>

          {summary.totalAmount > 0 && (
            <Card className="mb-5">
              <ProgressBar
                label="Payment progress"
                value={(summary.paidAmount / summary.totalAmount) * 100}
                tone={summary.pendingAmount === 0 ? 'success' : 'brand'}
                showValue
                size="lg"
              />
            </Card>
          )}

          <Card className="mb-5">
            <CardHeader title="Fee records" icon={Wallet} />
            <DataTable
              className="mt-4"
              columns={columns}
              rows={data?.records ?? []}
              emptyTitle="No fee records"
              emptyMessage="Fee records raised by your institution will appear here."
              emptyIcon={Wallet}
            />
          </Card>

          <Card>
            <CardHeader title="Payment history" icon={Receipt} />
            <div className="mt-4">
              {!data?.payments?.length ? (
                <EmptyState icon={Receipt} title="No payments yet" compact />
              ) : (
                <ul className="divide-y divide-line">
                  {data.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-3 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600 dark:bg-success-500/10">
                        <Receipt size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{payment.fee_name}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {payment.receipt_no} · {formatDateTime(payment.paid_at ?? payment.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-ink">
                          {formatCurrency(payment.amount)}
                        </p>
                        <StatusBadge
                          status={payment.status === 'success' ? 'paid' : payment.status}
                          size="sm"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}

      <Modal
        isOpen={Boolean(payingRecord)}
        onClose={() => setPayingRecord(null)}
        title="Make a payment"
        description={payingRecord?.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingRecord(null)} disabled={isPaying}>
              Cancel
            </Button>
            <Button onClick={pay} isLoading={isPaying} icon={CreditCard}>
              Pay {formatCurrency(Number(amount) || 0)}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-sunken p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Total</dt>
                <dd className="font-medium text-ink">{formatCurrency(payingRecord?.totalAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Already paid</dt>
                <dd className="font-medium text-success-600">
                  {formatCurrency(payingRecord?.paidAmount)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="font-medium text-ink">Outstanding</dt>
                <dd className="font-bold text-ink">{formatCurrency(payingRecord?.pendingAmount)}</dd>
              </div>
            </dl>
          </div>

          <Input
            label="Amount to pay"
            type="number"
            min="1"
            max={payingRecord?.pendingAmount}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            hint={`You can pay up to ${formatCurrency(payingRecord?.pendingAmount)}`}
          />

          <Select
            label="Payment method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            options={[
              { value: 'upi', label: 'UPI' },
              { value: 'card', label: 'Card' },
              { value: 'netbanking', label: 'Net banking' },
            ]}
          />

          {data?.mockMode && (
            <Callout tone="warning">
              <p className="text-xs">
                Mock mode: this records a payment without charging anything.
              </p>
            </Callout>
          )}
        </div>
      </Modal>
    </>
  );
}

export default Fees;
