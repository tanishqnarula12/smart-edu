import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Wallet,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { feeApi, academicApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  StatCard,
  ChartCard,
  DataTable,
  Button,
  Modal,
  Input,
  Select,
  DatePicker,
  Textarea,
  Badge,
  ProgressBar,
  ErrorState,
  LoadingSkeleton,
  Tabs,
} from '../../components/ui/index.js';
import { ComparisonBarChart } from '../../charts/Charts.jsx';
import { formatCurrency, formatDate, formatPercent } from '../../utils/format.js';
import { CHART_COLORS } from '../../utils/constants.js';

/** Fee administration (§31): structures, collection and outstanding balances. */
export function AdminFees() {
  const [tab, setTab] = useState('overview');
  const [isOpen, setOpen] = useState(false);

  const { data: overview, isLoading, error, refetch } = useApi(() => feeApi.overview(), []);
  const { data: structures, refetch: refetchStructures } = useApi(() => feeApi.structures(), []);
  const { data: classes } = useApi(() => academicApi.classes({ scope: 'all' }), []);

  const structureColumns = [
    {
      key: 'name',
      header: 'Fee structure',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">
            {row.academic_year}
            {row.class_name ? ` · ${row.class_name} ${row.section}` : ' · all classes'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => formatCurrency(row.amount),
    },
    { key: 'record_count', header: 'Students', align: 'right' },
    {
      key: 'collected',
      header: 'Collected',
      align: 'right',
      render: (row) => (
        <span className="font-medium text-success-600">{formatCurrency(row.collected)}</span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'right',
      hideOnMobile: true,
      render: (row) => {
        const expected = Number(row.amount) * row.record_count;
        const rate = expected ? (Number(row.collected) / expected) * 100 : 0;
        return (
          <Badge tone={rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger'} size="sm">
            {formatPercent(rate, 0)}
          </Badge>
        );
      },
    },
    {
      key: 'due_date',
      header: 'Due',
      hideOnMobile: true,
      render: (row) => formatDate(row.due_date),
    },
  ];

  const classColumns = [
    { key: 'className', header: 'Class', primary: true },
    {
      key: 'billed',
      header: 'Billed',
      align: 'right',
      render: (row) => formatCurrency(row.billed),
    },
    {
      key: 'collected',
      header: 'Collected',
      align: 'right',
      render: (row) => (
        <span className="text-success-600">{formatCurrency(row.collected)}</span>
      ),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      render: (row) =>
        row.outstanding > 0 ? (
          <span className="font-semibold text-danger-600">{formatCurrency(row.outstanding)}</span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Fees"
        description="Fee structures, collection progress and outstanding balances."
        action={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            New fee structure
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-24" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total billed"
              value={formatCurrency(overview?.billed)}
              icon={Wallet}
              tone="info"
            />
            <StatCard
              label="Collected"
              value={formatCurrency(overview?.collected)}
              icon={CheckCircle2}
              tone="success"
              hint={`${formatPercent(overview?.collectionRate)} collection rate`}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(overview?.outstanding)}
              icon={AlertTriangle}
              tone={overview?.outstanding > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Overdue records"
              value={overview?.counts?.overdue ?? 0}
              icon={AlertTriangle}
              tone={overview?.counts?.overdue > 0 ? 'danger' : 'success'}
              hint={`${overview?.counts?.paid ?? 0} fully paid`}
            />
          </div>

          <Card className="mb-5">
            <ProgressBar
              label="Overall collection"
              value={overview?.collectionRate ?? 0}
              tone={overview?.collectionRate >= 80 ? 'success' : 'brand'}
              showValue
              size="lg"
            />

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
              {[
                { label: 'Paid', value: overview?.counts?.paid ?? 0, tone: 'text-success-600' },
                { label: 'Partial', value: overview?.counts?.partial ?? 0, tone: 'text-warning-600' },
                { label: 'Pending', value: overview?.counts?.pending ?? 0, tone: 'text-ink' },
                { label: 'Overdue', value: overview?.counts?.overdue ?? 0, tone: 'text-danger-600' },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-ink-subtle">{item.label}</p>
                  <p className={`mt-0.5 text-xl font-bold tabular-nums ${item.tone}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Tabs
            tabs={[
              { value: 'overview', label: 'By class' },
              { value: 'structures', label: 'Fee structures', count: structures?.length },
            ]}
            active={tab}
            onChange={setTab}
            className="mb-5"
          />

          {tab === 'overview' && (
            <div className="space-y-5">
              <ChartCard
                title="Collection by class"
                subtitle="Billed against collected"
                isEmpty={!overview?.byClass?.length}
              >
                <ComparisonBarChart
                  data={(overview?.byClass ?? []).map((row) => ({
                    name: row.className,
                    Billed: row.billed,
                    Collected: row.collected,
                  }))}
                  series={[
                    { key: 'Billed', name: 'Billed', color: CHART_COLORS[0] },
                    { key: 'Collected', name: 'Collected', color: CHART_COLORS[1] },
                  ]}
                  domain={[0, 'dataMax']}
                  valueSuffix=""
                  showLegend
                  height={300}
                />
              </ChartCard>

              <Card>
                <CardHeader title="Class breakdown" icon={TrendingUp} />
                <DataTable
                  className="mt-4"
                  columns={classColumns}
                  rows={overview?.byClass ?? []}
                  keyField="classId"
                  emptyTitle="No fee records"
                />
              </Card>
            </div>
          )}

          {tab === 'structures' && (
            <Card>
              <CardHeader title="Fee structures" icon={Wallet} />
              <DataTable
                className="mt-4"
                columns={structureColumns}
                rows={structures ?? []}
                emptyTitle="No fee structures"
                emptyMessage="Create a structure and a fee record is raised for every student in scope."
                emptyIcon={Wallet}
                emptyAction={
                  <Button icon={Plus} onClick={() => setOpen(true)}>
                    New fee structure
                  </Button>
                }
              />
            </Card>
          )}
        </>
      )}

      <FeeStructureModal
        isOpen={isOpen}
        classes={classes}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          refetch();
          refetchStructures();
        }}
      />
    </>
  );
}

function FeeStructureModal({ isOpen, classes, onClose, onCreated }) {
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { academicYear: '2025-26' } });

  const submit = async (values) => {
    try {
      const result = await feeApi.createStructure({ ...values, classId: values.classId || null });
      toast.success(`Created and raised for ${result.recordsCreated} student(s)`);
      reset({ academicYear: '2025-26' });
      onCreated();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New fee structure"
      description="A fee record is raised for every student in scope as soon as you create this."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            Create and raise
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input
          label="Name"
          placeholder="Semester 3 Tuition Fee"
          required
          error={errors.name?.message}
          {...register('name', { required: 'Give the fee a name' })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Amount"
            type="number"
            min="0"
            step="1"
            required
            hint="Per student, in rupees"
            error={errors.amount?.message}
            {...register('amount', { required: 'Enter an amount' })}
          />
          <DatePicker
            label="Due date"
            required
            error={errors.dueDate?.message}
            {...register('dueDate', { required: 'Choose a due date' })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Class"
            placeholder="All classes"
            hint="Leave empty to bill every student"
            options={(classes ?? []).map((classRow) => ({
              value: classRow.id,
              label: `${classRow.name} ${classRow.section}`,
            }))}
            {...register('classId')}
          />
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
        </div>

        <Textarea label="Description" rows={3} {...register('description')} />
      </form>
    </Modal>
  );
}

export default AdminFees;
