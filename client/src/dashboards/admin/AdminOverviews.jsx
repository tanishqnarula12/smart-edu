import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck, GraduationCap, ClipboardList, AlertTriangle, TrendingUp, Users,
} from 'lucide-react';
import {
  analyticsApi, marksApi, assignmentApi, academicApi, attendanceApi,
} from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, StatCard, ChartCard, DataTable, Select, Badge, Avatar, Button,
  EmptyState, ErrorState, LoadingSkeleton, ProgressBar,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart } from '../../charts/Charts.jsx';
import { formatPercent, formatDate, humanise } from '../../utils/format.js';
import {
  attendanceTone, scoreTone, CHART_COLORS, ATTENDANCE_THRESHOLD,
} from '../../utils/constants.js';

/**
 * Read-only institution-wide views (§28) for attendance, marks and
 * assignments. Deeper analysis lives on the Analytics page; these are the
 * "show me the current state" screens.
 */

export function AdminAttendanceOverview() {
  const [classId, setClassId] = useState('');

  const { data: classes } = useApi(() => academicApi.classes({ scope: 'all' }), []);
  const { data, isLoading, error, refetch } = useApi(
    () => analyticsApi.attendance({ months: 6, classId: classId || undefined }),
    [classId]
  );
  const { data: low } = useApi(() => attendanceApi.low({ limit: 50 }), []);

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
      header: `Below ${ATTENDANCE_THRESHOLD}%`,
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
    <>
      <PageHeader
        title="Attendance"
        description="Institution-wide attendance, by class and by department."
        action={
          <Button to="/admin/analytics" variant="secondary">
            Full analytics
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-48" />
      ) : (
        <div className="space-y-5">
          <Card>
            <Select
              label="Filter by class"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              placeholder="All classes"
              options={(classes ?? []).map((row) => ({
                value: row.id,
                label: `${row.name} ${row.section}`,
              }))}
              containerClassName="max-w-xs"
            />
          </Card>

          <ChartCard
            title="Attendance trend"
            subtitle={`Against the ${ATTENDANCE_THRESHOLD}% requirement`}
            isEmpty={!data?.trend?.length}
          >
            <TrendChart
              data={data?.trend ?? []}
              series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
              referenceValue={ATTENDANCE_THRESHOLD}
              height={300}
            />
          </ChartCard>

          <Card>
            <CardHeader title="By class" icon={CalendarCheck} />
            <DataTable className="mt-4" columns={columns} rows={data?.byClass ?? []} keyField="class_id" />
          </Card>

          <Card>
            <CardHeader
              title="Students below the threshold"
              icon={AlertTriangle}
              action={<Badge tone="danger">{low?.count ?? 0}</Badge>}
            />
            <div className="mt-4">
              {!low?.students?.length ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Everyone is above the threshold"
                  compact
                />
              ) : (
                <ul className="divide-y divide-line">
                  {low.students.map((student) => (
                    <li key={student.studentId}>
                      <Link
                        to={`/admin/students/${student.studentId}`}
                        className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
                      >
                        <Avatar name={student.name} src={student.avatarUrl} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {student.name}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {student.className} · {student.absentCount} absences of{' '}
                            {student.totalClasses}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-danger-600">
                          {formatPercent(student.attendancePercentage, 0)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export function AdminMarksOverview() {
  const [classId, setClassId] = useState('');

  const { data: classes } = useApi(() => academicApi.classes({ scope: 'all' }), []);
  const { data, isLoading, error, refetch } = useApi(() => analyticsApi.academic(), []);
  const { data: assessments } = useApi(
    () => marksApi.assessments(classId ? { classId } : {}),
    [classId]
  );

  const columns = [
    {
      key: 'name',
      header: 'Assessment',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">
            {humanise(row.type)} · {row.max_marks} marks
          </p>
        </div>
      ),
    },
    { key: 'subject_name', header: 'Subject' },
    {
      key: 'class_name',
      header: 'Class',
      render: (row) => `${row.class_name} ${row.section}`,
    },
    { key: 'teacher_name', header: 'Teacher', hideOnMobile: true },
    {
      key: 'marks_entered',
      header: 'Entered',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">
          {row.marks_entered} / {row.class_size}
        </span>
      ),
    },
    {
      key: 'average_percentage',
      header: 'Average',
      align: 'right',
      render: (row) =>
        row.average_percentage != null ? (
          <Badge tone={scoreTone(row.average_percentage)} size="sm">
            {formatPercent(row.average_percentage)}
          </Badge>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: 'is_published',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <Badge tone={row.is_published ? 'success' : 'warning'} size="sm">
          {row.is_published ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    { key: 'date', header: 'Date', hideOnMobile: true, render: (row) => formatDate(row.date) },
  ];

  return (
    <>
      <PageHeader
        title="Marks"
        description="Every assessment across the institution, published and draft."
        action={
          <Button to="/admin/analytics" variant="secondary">
            Full analytics
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-48" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Assessments"
              value={assessments?.length ?? 0}
              icon={GraduationCap}
              tone="brand"
            />
            <StatCard
              label="Awaiting publication"
              value={(assessments ?? []).filter((row) => !row.is_published).length}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Subjects assessed"
              value={data?.subjectPerformance?.length ?? 0}
              icon={TrendingUp}
              tone="info"
            />
          </div>

          <ChartCard
            title="Average by subject"
            isEmpty={!data?.subjectPerformance?.length}
            subtitle="Across published assessments"
          >
            <ComparisonBarChart
              data={(data?.subjectPerformance ?? []).slice(0, 12).map((subject) => ({
                name: subject.subject_code,
                value: subject.average_percentage,
              }))}
              series={[{ key: 'value', name: 'Average', color: CHART_COLORS[0] }]}
              height={300}
            />
          </ChartCard>

          <Card>
            <CardHeader
              title="All assessments"
              icon={GraduationCap}
              action={
                <Select
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                  placeholder="All classes"
                  options={(classes ?? []).map((row) => ({
                    value: row.id,
                    label: `${row.name} ${row.section}`,
                  }))}
                  containerClassName="w-48"
                />
              }
            />
            <DataTable
              className="mt-4"
              columns={columns}
              rows={assessments ?? []}
              emptyTitle="No assessments"
              emptyMessage="Assessments created by teachers appear here."
            />
          </Card>
        </div>
      )}
    </>
  );
}

export function AdminAssignmentsOverview() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useApi(
    () => assignmentApi.list({ page, limit: 20 }),
    [page]
  );
  const { data: stats } = useApi(() => assignmentApi.stats(), []);

  const columns = [
    {
      key: 'title',
      header: 'Assignment',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.title}</p>
          <p className="truncate text-xs text-ink-muted">
            {row.subjectName} · {row.className}
          </p>
        </div>
      ),
    },
    { key: 'dueDate', header: 'Due', render: (row) => formatDate(row.dueDate) },
    {
      key: 'submissionCount',
      header: 'Submitted',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">
          {row.submissionCount} / {row.classSize}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Completion',
      align: 'right',
      hideOnMobile: true,
      render: (row) => {
        const rate = row.classSize ? (row.submissionCount / row.classSize) * 100 : 0;
        return (
          <Badge tone={rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger'} size="sm">
            {formatPercent(rate, 0)}
          </Badge>
        );
      },
    },
    {
      key: 'gradedCount',
      header: 'Graded',
      align: 'right',
      hideOnMobile: true,
      render: (row) => `${row.gradedCount}`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Every assignment set across the institution, with completion rates."
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Expected submissions"
              value={stats?.total ?? 0}
              icon={Users}
              tone="info"
            />
            <StatCard
              label="Submitted"
              value={stats?.submitted ?? 0}
              icon={ClipboardList}
              tone="success"
              hint={`${formatPercent(stats?.completionRate)} completion`}
            />
            <StatCard
              label="Outstanding"
              value={stats?.pending ?? 0}
              icon={AlertTriangle}
              tone={stats?.pending > 0 ? 'warning' : 'success'}
            />
            <StatCard label="Late" value={stats?.late ?? 0} icon={AlertTriangle} tone="warning" />
          </div>

          {stats?.total > 0 && (
            <Card>
              <ProgressBar
                label="Institution-wide completion"
                value={stats.completionRate}
                tone={stats.completionRate >= 80 ? 'success' : 'brand'}
                showValue
                size="lg"
              />
            </Card>
          )}

          <Card>
            <CardHeader title="All assignments" icon={ClipboardList} />
            <DataTable
              className="mt-4"
              columns={columns}
              rows={data?.data ?? []}
              isLoading={isLoading}
              pagination={data?.meta?.pagination}
              onPageChange={setPage}
              emptyTitle="No assignments"
              emptyMessage="Assignments created by teachers appear here."
            />
          </Card>
        </div>
      )}
    </>
  );
}

export default AdminAttendanceOverview;
