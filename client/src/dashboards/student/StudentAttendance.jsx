import { useState } from 'react';
import { CalendarCheck, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { attendanceApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, ChartCard, StatCard, DataTable, StatusBadge, ProgressBar,
  Callout, Tabs, ErrorState, Select,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart } from '../../charts/Charts.jsx';
import { formatPercent, formatDate } from '../../utils/format.js';
import { ATTENDANCE_THRESHOLD, attendanceTone, CHART_COLORS } from '../../utils/constants.js';

/** Student attendance detail (§16). Overall, per subject, monthly and daily. */
export function StudentAttendance() {
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState('');

  const { data, isLoading, error, refetch } = useApi(() => attendanceApi.summary({ months: 12 }), []);

  const {
    data: records,
    isLoading: recordsLoading,
    error: recordsError,
  } = useApi(
    () => attendanceApi.list({ page, limit: 20, subjectId: subjectFilter || undefined }),
    [page, subjectFilter]
  );

  if (error) {
    return (
      <>
        <PageHeader title="My attendance" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const summary = data?.summary ?? {};
  const subjects = data?.subjects ?? [];
  const trend = data?.monthlyTrend ?? [];

  const belowThreshold = subjects.filter((subject) => subject.isBelowThreshold);

  const columns = [
    {
      key: 'date',
      header: 'Date',
      primary: true,
      render: (row) => <span className="font-medium">{formatDate(row.date)}</span>,
    },
    { key: 'subject_name', header: 'Subject' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    { key: 'teacher_name', header: 'Marked by', hideOnMobile: true },
    {
      key: 'remarks',
      header: 'Remarks',
      hideOnMobile: true,
      render: (row) => row.remarks || <span className="text-ink-subtle">—</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="My attendance"
        description={`You need at least ${ATTENDANCE_THRESHOLD}% attendance to sit end-semester examinations.`}
      />

      {summary.isBelowThreshold && (
        <Callout tone="warning" icon={AlertTriangle} title="Below the attendance requirement" className="mb-6">
          You are at {formatPercent(summary.attendancePercentage)}. To reach{' '}
          {ATTENDANCE_THRESHOLD}% you need to attend consistently from here — missed classes cannot be
          recovered retrospectively.
        </Callout>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={formatPercent(summary.attendancePercentage)}
          icon={CalendarCheck}
          tone={attendanceTone(summary.attendancePercentage)}
          hint={`${summary.totalClasses ?? 0} classes recorded`}
          isLoading={isLoading}
        />
        <StatCard
          label="Classes attended"
          value={summary.presentCount ?? 0}
          icon={CheckCircle2}
          tone="success"
          hint="Marked present"
          isLoading={isLoading}
        />
        <StatCard
          label="Classes missed"
          value={summary.absentCount ?? 0}
          icon={XCircle}
          tone={summary.absentCount > 0 ? 'danger' : 'neutral'}
          hint="Marked absent"
          isLoading={isLoading}
        />
        <StatCard
          label="Late arrivals"
          value={summary.lateCount ?? 0}
          icon={Clock}
          tone={summary.lateCount > 0 ? 'warning' : 'neutral'}
          hint="Counted as attended"
          isLoading={isLoading}
        />
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'subjects', label: 'By subject', count: subjects.length },
          { value: 'records', label: 'Daily record' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Monthly trend"
            subtitle="Your attendance over the past year"
            isLoading={isLoading}
            isEmpty={!trend.length}
          >
            <TrendChart
              data={trend}
              series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
              referenceValue={ATTENDANCE_THRESHOLD}
              referenceLabel="Required"
              height={280}
            />
          </ChartCard>

          <ChartCard
            title="Subject comparison"
            subtitle="Where you attend most and least"
            isLoading={isLoading}
            isEmpty={!subjects.length}
          >
            <ComparisonBarChart
              data={subjects.map((subject) => ({
                name: subject.subjectName,
                value: subject.attendancePercentage,
              }))}
              layout="vertical"
              series={[{ key: 'value', name: 'Attendance', color: CHART_COLORS[0] }]}
              referenceValue={ATTENDANCE_THRESHOLD}
              height={Math.max(240, subjects.length * 42)}
            />
          </ChartCard>
        </div>
      )}

      {tab === 'subjects' && (
        <div className="space-y-4">
          {belowThreshold.length > 0 && (
            <Callout tone="danger" title={`${belowThreshold.length} subject(s) below ${ATTENDANCE_THRESHOLD}%`}>
              {belowThreshold.map((subject) => subject.subjectName).join(', ')}
            </Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {subjects.map((subject) => (
              <Card key={subject.subjectId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink">{subject.subjectName}</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">{subject.subjectCode}</p>
                  </div>
                  <StatusBadge
                    status={subject.isBelowThreshold ? 'high' : 'low'}
                    label={subject.isBelowThreshold ? 'At risk' : 'On track'}
                    size="sm"
                  />
                </div>

                <ProgressBar
                  value={subject.attendancePercentage}
                  tone={attendanceTone(subject.attendancePercentage)}
                  showValue
                  className="mt-4"
                />

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Present</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-success-600">
                      {subject.presentCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Absent</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-danger-600">
                      {subject.absentCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Total</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">{subject.totalClasses}</dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'records' && (
        <Card padded={false} className="p-5">
          <CardHeader
            title="Daily attendance"
            subtitle="Every class marked, most recent first"
            action={
              <Select
                value={subjectFilter}
                onChange={(event) => {
                  setSubjectFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="All subjects"
                options={subjects.map((subject) => ({
                  value: subject.subjectId,
                  label: subject.subjectName,
                }))}
                containerClassName="w-48"
              />
            }
          />

          <DataTable
            className="mt-4"
            columns={columns}
            rows={records?.data ?? []}
            isLoading={recordsLoading}
            error={recordsError}
            pagination={records?.meta?.pagination}
            onPageChange={setPage}
            emptyTitle="No attendance records"
            emptyMessage="Records appear here once your teachers mark attendance."
            emptyIcon={CalendarCheck}
          />
        </Card>
      )}
    </>
  );
}

export default StudentAttendance;
