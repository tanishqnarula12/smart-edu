import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarCheck, GraduationCap, AlertTriangle, Info, Users } from 'lucide-react';
import { analyticsApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, ChartCard, StatCard, Tabs, Select, Badge, Avatar, DataTable,
  EmptyState, ErrorState, LoadingSkeleton, ProgressBar, Callout,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart, RiskDonut } from '../../charts/Charts.jsx';
import { formatPercent } from '../../utils/format.js';
import {
  attendanceTone, scoreTone, CHART_COLORS, ATTENDANCE_THRESHOLD,
} from '../../utils/constants.js';

/** Institution analytics (§27) — attendance, academics and risk. */
export function AdminAnalytics() {
  const [tab, setTab] = useState('attendance');

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Attendance, academic performance and the academic risk register."
      />

      <Tabs
        tabs={[
          { value: 'attendance', label: 'Attendance', icon: CalendarCheck },
          { value: 'academic', label: 'Academic', icon: GraduationCap },
          { value: 'risk', label: 'Risk register', icon: AlertTriangle },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'attendance' && <AttendanceAnalytics />}
      {tab === 'academic' && <AcademicAnalytics />}
      {tab === 'risk' && <RiskRegister />}
    </>
  );
}

function AttendanceAnalytics() {
  const [months, setMonths] = useState(12);
  const { data, isLoading, error, refetch } = useApi(
    () => analyticsApi.attendance({ months }),
    [months]
  );

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading) return <LoadingSkeleton count={4} height="h-64" />;

  const columns = [
    {
      key: 'class_name',
      header: 'Class',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {row.class_name} {row.section}
          </p>
          <p className="truncate text-xs text-ink-muted">{row.department_name ?? '—'}</p>
        </div>
      ),
    },
    { key: 'student_count', header: 'Students', align: 'right' },
    {
      key: 'average_attendance',
      header: 'Average',
      align: 'right',
      render: (row) => (
        <Badge tone={attendanceTone(row.average_attendance)} size="sm">
          {formatPercent(row.average_attendance)}
        </Badge>
      ),
    },
    {
      key: 'below_threshold',
      header: 'Below threshold',
      align: 'right',
      render: (row) =>
        row.below_threshold > 0 ? (
          <span className="font-semibold text-danger-600">{row.below_threshold}</span>
        ) : (
          <span className="text-ink-subtle">0</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Select
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
          options={[
            { value: 3, label: 'Last 3 months' },
            { value: 6, label: 'Last 6 months' },
            { value: 12, label: 'Last 12 months' },
          ]}
          containerClassName="w-48"
        />
      </div>

      <ChartCard
        title="Attendance trend"
        subtitle={`Institution-wide, against the ${ATTENDANCE_THRESHOLD}% requirement`}
        isEmpty={!data?.trend?.length}
      >
        <TrendChart
          data={data?.trend ?? []}
          series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
          referenceValue={ATTENDANCE_THRESHOLD}
          referenceLabel="Required"
          height={300}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="By department" isEmpty={!data?.byDepartment?.length}>
          <ComparisonBarChart
            data={(data?.byDepartment ?? []).map((department) => ({
              name: department.code,
              value: department.average_attendance ?? 0,
            }))}
            layout="vertical"
            series={[{ key: 'value', name: 'Attendance', color: CHART_COLORS[0] }]}
            referenceValue={ATTENDANCE_THRESHOLD}
            height={Math.max(220, (data?.byDepartment?.length ?? 0) * 46)}
          />
        </ChartCard>

        <Card>
          <CardHeader title="Students below the threshold" icon={AlertTriangle} />
          <div className="mt-4">
            {!data?.lowAttendance?.length ? (
              <EmptyState
                icon={CalendarCheck}
                title="Everyone is above the threshold"
                compact
              />
            ) : (
              <ul className="scrollbar-slim max-h-80 space-y-1 overflow-y-auto">
                {data.lowAttendance.map((student) => (
                  <li key={student.student_id}>
                    <Link
                      to={`/admin/students/${student.student_id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-sunken"
                    >
                      <Avatar name={student.name} src={student.avatar_url} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {student.name}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {student.class_name} {student.section}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-danger-600">
                        {formatPercent(student.attendance_percentage, 0)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Class-by-class attendance" icon={BarChart3} />
        <DataTable className="mt-4" columns={columns} rows={data?.byClass ?? []} />
      </Card>
    </div>
  );
}

function AcademicAnalytics() {
  const { data, isLoading, error, refetch } = useApi(() => analyticsApi.academic(), []);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading) return <LoadingSkeleton count={4} height="h-64" />;

  const decliningColumns = [
    {
      key: 'name',
      header: 'Student',
      primary: true,
      render: (row) => (
        <Link
          to={`/admin/students/${row.studentId}`}
          className="flex items-center gap-2.5 font-medium text-ink hover:text-brand-600"
        >
          <Avatar name={row.name} src={row.avatarUrl} size="xs" />
          <span className="truncate">{row.name}</span>
        </Link>
      ),
    },
    { key: 'className', header: 'Class' },
    { key: 'subjectName', header: 'Subject' },
    {
      key: 'previousScore',
      header: 'Previous',
      align: 'right',
      render: (row) => formatPercent(row.previousScore, 0),
    },
    {
      key: 'currentScore',
      header: 'Current',
      align: 'right',
      render: (row) => (
        <span className="font-semibold">{formatPercent(row.currentScore, 0)}</span>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      render: (row) => <span className="font-semibold text-danger-600">{row.change}</span>,
    },
    {
      key: 'riskLevel',
      header: 'Risk',
      align: 'right',
      render: (row) => (
        <Badge tone={row.riskLevel === 'high' ? 'danger' : 'warning'} size="sm">
          {row.riskLevel}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <ChartCard
        title="Performance by subject"
        subtitle="Average score across published assessments"
        isEmpty={!data?.subjectPerformance?.length}
      >
        <ComparisonBarChart
          data={(data?.subjectPerformance ?? []).slice(0, 15).map((subject) => ({
            name: subject.subject_code,
            value: subject.average_percentage,
          }))}
          series={[{ key: 'value', name: 'Average', color: CHART_COLORS[0] }]}
          height={320}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Strongest subjects" icon={GraduationCap} />
          <ul className="mt-4 space-y-3">
            {(data?.topSubjects ?? []).map((subject) => (
              <li key={subject.subject_id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {subject.subject_name}
                </span>
                <ProgressBar
                  value={subject.average_percentage}
                  tone="success"
                  className="w-32 shrink-0"
                  size="sm"
                />
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                  {formatPercent(subject.average_percentage, 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Subjects needing attention" icon={AlertTriangle} />
          <ul className="mt-4 space-y-3">
            {(data?.weakestSubjects ?? []).map((subject) => (
              <li key={subject.subject_id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {subject.subject_name}
                </span>
                <ProgressBar
                  value={subject.average_percentage}
                  tone={scoreTone(subject.average_percentage)}
                  className="w-32 shrink-0"
                  size="sm"
                />
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                  {formatPercent(subject.average_percentage, 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ChartCard title="Class comparison" isEmpty={!data?.classComparison?.length}>
        <ComparisonBarChart
          data={(data?.classComparison ?? []).map((row) => ({
            name: `${row.class_name} ${row.section}`,
            Marks: row.average_percentage ?? 0,
            Attendance: row.average_attendance ?? 0,
          }))}
          series={[
            { key: 'Marks', name: 'Average marks', color: CHART_COLORS[0] },
            { key: 'Attendance', name: 'Attendance', color: CHART_COLORS[1] },
          ]}
          showLegend
          height={300}
        />
      </ChartCard>

      <Card>
        <CardHeader
          title="Students whose scores are declining"
          subtitle="Recent assessments compared against earlier ones"
          icon={AlertTriangle}
        />
        <DataTable
          className="mt-4"
          columns={decliningColumns}
          rows={data?.decliningStudents ?? []}
          keyField="studentId"
          emptyTitle="No declines detected"
          emptyMessage="No student's recent scores have dropped meaningfully."
        />
      </Card>
    </div>
  );
}

function RiskRegister() {
  const [level, setLevel] = useState('');
  const { data, isLoading, error, refetch } = useApi(
    () => analyticsApi.risk({ level: level || undefined, limit: 200 }),
    [level]
  );

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading) return <LoadingSkeleton count={4} height="h-24" />;

  const columns = [
    {
      key: 'name',
      header: 'Student',
      primary: true,
      render: (row) => (
        <Link
          to={`/admin/students/${row.studentId}`}
          className="flex items-center gap-2.5 hover:text-brand-600"
        >
          <Avatar name={row.name} src={row.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-muted">{row.className}</p>
          </div>
        </Link>
      ),
    },
    {
      key: 'attendancePercentage',
      header: 'Attendance',
      align: 'right',
      render: (row) => (
        <Badge tone={attendanceTone(row.attendancePercentage)} size="sm">
          {formatPercent(row.attendancePercentage, 0)}
        </Badge>
      ),
    },
    {
      key: 'averagePercentage',
      header: 'Marks',
      align: 'right',
      render: (row) => (
        <Badge tone={scoreTone(row.averagePercentage)} size="sm">
          {formatPercent(row.averagePercentage, 0)}
        </Badge>
      ),
    },
    {
      key: 'assignmentCompletionRate',
      header: 'Assignments',
      align: 'right',
      hideOnMobile: true,
      render: (row) => formatPercent(row.assignmentCompletionRate, 0),
    },
    {
      key: 'riskScore',
      header: 'Risk score',
      align: 'right',
      render: (row) => (
        <span className="font-bold tabular-nums text-ink">{row.riskScore.toFixed(0)}</span>
      ),
    },
    {
      key: 'level',
      header: 'Band',
      align: 'right',
      render: (row) => (
        <Badge
          tone={row.level === 'high' ? 'danger' : row.level === 'medium' ? 'warning' : 'success'}
          size="sm"
        >
          {row.level}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Callout tone="info" icon={Info} title="How this score is built">
        <p className="text-sm leading-relaxed">
          {data?.methodology?.description}
        </p>
        <p className="mt-2 text-xs">
          Weights — attendance {(data?.methodology?.weights?.attendance ?? 0) * 100}%, performance{' '}
          {(data?.methodology?.weights?.performance ?? 0) * 100}%, assignments{' '}
          {(data?.methodology?.weights?.assignments ?? 0) * 100}%. Bands: low{' '}
          {data?.methodology?.bands?.low}, medium {data?.methodology?.bands?.medium}, high{' '}
          {data?.methodology?.bands?.high}.
        </p>
        <p className="mt-2 text-xs font-medium">{data?.methodology?.caveat}</p>
      </Callout>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Distribution" height={240} isEmpty={!data?.distribution}>
          <RiskDonut distribution={data?.distribution} height={240} />
        </ChartCard>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-3">
          <StatCard
            label="High risk"
            value={data?.distribution?.high ?? 0}
            icon={AlertTriangle}
            tone="danger"
            hint="Needs a conversation this week"
          />
          <StatCard
            label="Medium risk"
            value={data?.distribution?.medium ?? 0}
            icon={AlertTriangle}
            tone="warning"
            hint="Worth monitoring"
          />
          <StatCard
            label="Low risk"
            value={data?.distribution?.low ?? 0}
            icon={Users}
            tone="success"
            hint="Tracking well"
          />
        </div>
      </div>

      <Card>
        <CardHeader
          title="Risk register"
          subtitle={`${data?.students?.length ?? 0} students shown, highest risk first`}
          icon={AlertTriangle}
          action={
            <Select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              placeholder="All bands"
              options={[
                { value: 'high', label: 'High risk only' },
                { value: 'medium', label: 'Medium risk only' },
                { value: 'low', label: 'Low risk only' },
              ]}
              containerClassName="w-44"
            />
          }
        />

        <DataTable
          className="mt-4"
          columns={columns}
          rows={data?.students ?? []}
          keyField="studentId"
          emptyTitle="Nobody flagged"
          emptyMessage="No student currently falls into the selected band."
        />
      </Card>
    </div>
  );
}

export default AdminAnalytics;
