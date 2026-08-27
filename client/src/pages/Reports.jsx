import { useState } from 'react';
import {
  BarChart3,
  Printer,
  Download,
  School,
  User,
  Building2,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { reportApi, academicApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  StatCard,
  ChartCard,
  Tabs,
  Select,
  Button,
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ProgressBar,
  Callout,
  Avatar,
  PrintMasthead,
  PrintFooter,
} from '../components/ui/index.js';
import { ComparisonBarChart, RiskDonut, TrendChart } from '../charts/Charts.jsx';
import { formatPercent, formatDate } from '../utils/format.js';
import { attendanceTone, scoreTone, CHART_COLORS, ATTENDANCE_THRESHOLD } from '../utils/constants.js';

/** Reports (§32), shared by teachers and admins with different scopes. */
export function Reports() {
  const { role } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState(role === 'admin' ? 'institution' : 'class');
  const [classId, setClassId] = useState('');

  const { data: classes } = useApi(() => academicApi.classes(), []);

  const download = (report, name) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  const tabs = [
    { value: 'class', label: 'Class report', icon: School },
    { value: 'teacher', label: 'My workload', icon: User },
    ...(role === 'admin' ? [{ value: 'institution', label: 'Institution', icon: Building2 }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Generated from live records — print or export any of these."
        action={
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-5 no-print" />

      {tab === 'class' && (
        <ClassReport
          classes={classes}
          classId={classId}
          onClassChange={setClassId}
          onDownload={download}
        />
      )}
      {tab === 'teacher' && <TeacherReport onDownload={download} />}
      {tab === 'institution' && <InstitutionReport onDownload={download} />}
    </>
  );
}

function ClassReport({ classes, classId, onClassChange, onDownload }) {
  const effectiveClassId = classId || classes?.[0]?.id;

  const { data, isLoading, error, refetch } = useApi(
    () => (effectiveClassId ? reportApi.class(effectiveClassId) : Promise.resolve(null)),
    [effectiveClassId]
  );

  const studentColumns = [
    {
      key: 'name',
      header: 'Student',
      primary: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} size="xs" />
          <span className="truncate font-medium text-ink">{row.name}</span>
        </div>
      ),
    },
    { key: 'rollNumber', header: 'Roll', render: (row) => row.rollNumber ?? '—' },
    {
      key: 'attendancePercentage',
      header: 'Attendance',
      align: 'right',
      render: (row) => (
        <Badge tone={attendanceTone(row.attendancePercentage)} size="sm">
          {formatPercent(row.attendancePercentage)}
        </Badge>
      ),
    },
    {
      key: 'absentCount',
      header: 'Absences',
      align: 'right',
      hideOnMobile: true,
    },
  ];

  return (
    <>
      <Card className="mb-5 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Class"
            value={effectiveClassId ?? ''}
            onChange={(event) => onClassChange(event.target.value)}
            options={(classes ?? []).map((classRow) => ({
              value: classRow.id,
              label: `${classRow.name} ${classRow.section}`,
            }))}
            placeholder="Select a class"
            containerClassName="w-full sm:w-64"
          />
          {data && (
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => onDownload(data, `class-report-${data.class.name}`)}
            >
              Export
            </Button>
          )}
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={5} height="h-24" />
      ) : !data ? (
        <EmptyState icon={School} title="Select a class" message="Choose a class to generate its report." />
      ) : (
        <div className="space-y-5 print-full">
          <PrintMasthead
            title={`Class report — ${data.class.name}`}
            subtitle={[data.class.academicYear, data.class.department, data.class.classTeacher && `Class teacher: ${data.class.classTeacher}`]
              .filter(Boolean)
              .join(' · ')}
            meta={`Generated ${formatDate(data.generatedAt)} by ${data.generatedBy}`}
          />
          <PrintFooter />

          <Card className="no-print">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">{data.class.name}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {data.class.academicYear}
                  {data.class.department && ` · ${data.class.department}`}
                  {data.class.classTeacher && ` · Class teacher: ${data.class.classTeacher}`}
                </p>
              </div>
              <p className="text-xs text-ink-subtle">
                Generated {formatDate(data.generatedAt)} by {data.generatedBy}
              </p>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Students" value={data.class.studentCount} icon={School} tone="brand" />
            <StatCard
              label="Average attendance"
              value={formatPercent(data.attendance.average)}
              icon={TrendingUp}
              tone={attendanceTone(data.attendance.average)}
            />
            <StatCard
              label="Below threshold"
              value={data.attendance.belowThreshold}
              icon={AlertTriangle}
              tone={data.attendance.belowThreshold > 0 ? 'danger' : 'success'}
              hint={`Under ${ATTENDANCE_THRESHOLD}%`}
            />
            <StatCard
              label="Class average"
              value={formatPercent(data.performance.classAverage)}
              icon={BarChart3}
              tone={scoreTone(data.performance.classAverage)}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Subject averages" isEmpty={!data.performance.subjects?.length}>
              <ComparisonBarChart
                data={data.performance.subjects.map((subject) => ({
                  name: subject.subject_code,
                  value: subject.average_percentage,
                }))}
                layout="vertical"
                series={[{ key: 'value', name: 'Average', color: CHART_COLORS[0] }]}
                height={Math.max(220, data.performance.subjects.length * 42)}
              />
            </ChartCard>

            <ChartCard title="Risk distribution" isEmpty={!data.riskDistribution}>
              <RiskDonut distribution={data.riskDistribution} />
            </ChartCard>
          </div>

          {data.weakSubjects?.length > 0 && (
            <Callout tone="warning" title="Weakest subjects in this class">
              {data.weakSubjects
                .map((subject) => `${subject.subject_name} (${formatPercent(subject.average_percentage)})`)
                .join(' · ')}
            </Callout>
          )}

          <Card>
            <CardHeader title="Attendance by student" icon={School} />
            <DataTable className="mt-4" columns={studentColumns} rows={data.attendance.students} />
          </Card>

          {data.atRiskStudents?.length > 0 && (
            <Card>
              <CardHeader
                title="Students requiring attention"
                subtitle="Flagged by the combined academic indicator"
                icon={AlertTriangle}
              />
              <ul className="mt-4 space-y-3">
                {data.atRiskStudents.map((student) => (
                  <li key={student.studentId} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={student.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{student.name}</p>
                          <p className="truncate text-xs text-ink-muted">
                            Roll {student.rollNumber ?? '—'}
                          </p>
                        </div>
                      </div>
                      <Badge tone={student.level === 'high' ? 'danger' : 'warning'} size="sm">
                        {student.level} risk
                      </Badge>
                    </div>

                    <ul className="mt-3 space-y-1">
                      {student.factors.map((factor, index) => (
                        <li key={index} className="text-xs text-ink-muted">
                          • {factor.detail}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function TeacherReport({ onDownload }) {
  const { data, isLoading, error, refetch } = useApi(() => reportApi.teacher('me'), []);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading) return <LoadingSkeleton count={4} height="h-24" />;
  if (!data) return null;

  return (
    <div className="space-y-5 print-full">
      <PrintMasthead
        title={`Teacher workload report — ${data.teacher.name}`}
        subtitle={[data.teacher.designation, data.teacher.department, data.teacher.employeeId]
          .filter(Boolean)
          .join(' · ')}
      />
      <PrintFooter />

      <Card className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{data.teacher.name}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {data.teacher.designation}
              {data.teacher.department && ` · ${data.teacher.department}`}
              {data.teacher.employeeId && ` · ${data.teacher.employeeId}`}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => onDownload(data, 'teacher-report')}
            className="no-print"
          >
            Export
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={data.overview.totalStudents} icon={User} tone="brand" />
        <StatCard label="Classes" value={data.overview.totalClasses} icon={School} tone="info" />
        <StatCard
          label="Weekly periods"
          value={data.workload.weekly_periods}
          icon={BarChart3}
          tone="warning"
        />
        <StatCard
          label="Pending grading"
          value={data.workload.pending_grading}
          icon={AlertTriangle}
          tone={data.workload.pending_grading > 0 ? 'danger' : 'success'}
        />
      </div>

      <Card>
        <CardHeader title="Workload summary" icon={BarChart3} />
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Assignments created', value: data.workload.assignments_created },
            { label: 'Assessments created', value: data.workload.assessments_created },
            { label: 'Registers submitted', value: data.workload.registers_submitted },
            { label: 'Submissions graded', value: data.workload.submissions_graded },
            { label: 'Awaiting grading', value: data.workload.pending_grading },
            { label: 'Weekly periods', value: data.workload.weekly_periods },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-surface-sunken p-4">
              <dt className="text-xs text-ink-muted">{item.label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Classes taught" icon={School} />
        <ul className="mt-4 divide-y divide-line">
          {data.classes.map((row, index) => (
            <li key={index} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {row.class_name} {row.section}
                </p>
                <p className="truncate text-xs text-ink-muted">{row.subject_name}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-ink-muted">{row.student_count} students</span>
                <Badge tone={attendanceTone(row.average_attendance)} size="sm">
                  {formatPercent(row.average_attendance)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function InstitutionReport({ onDownload }) {
  const { data, isLoading, error, refetch } = useApi(() => reportApi.institution(), []);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading) return <LoadingSkeleton count={5} height="h-24" />;
  if (!data) return null;

  const { overview } = data;

  return (
    <div className="space-y-5 print-full">
      <PrintMasthead
        title="Institution report"
        meta={`Generated ${formatDate(data.generatedAt)} by ${data.generatedBy}`}
      />
      <PrintFooter />

      <Card className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Institution report</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Generated {formatDate(data.generatedAt)} by {data.generatedBy}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => onDownload(data, 'institution-report')}
            className="no-print"
          >
            Export
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={overview.counts.students} icon={User} tone="brand" />
        <StatCard label="Teachers" value={overview.counts.teachers} icon={User} tone="info" />
        <StatCard
          label="Average attendance"
          value={formatPercent(overview.attendance.average)}
          icon={TrendingUp}
          tone={attendanceTone(overview.attendance.average)}
          hint={`${overview.attendance.belowThreshold} below threshold`}
        />
        <StatCard
          label="Average performance"
          value={formatPercent(overview.performance.average)}
          icon={BarChart3}
          tone={scoreTone(overview.performance.average)}
          hint={`Grade ${overview.performance.grade.grade}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Attendance over the year" isEmpty={!data.attendanceTrend?.length}>
          <TrendChart
            data={data.attendanceTrend}
            series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
            referenceValue={ATTENDANCE_THRESHOLD}
          />
        </ChartCard>

        <ChartCard title="Risk distribution" isEmpty={!data.risk?.distribution}>
          <RiskDonut distribution={data.risk.distribution} />
        </ChartCard>

        <ChartCard
          title="Subject performance"
          className="lg:col-span-2"
          isEmpty={!data.subjectPerformance?.length}
        >
          <ComparisonBarChart
            data={data.subjectPerformance.slice(0, 12).map((subject) => ({
              name: subject.subject_code,
              value: subject.average_percentage,
            }))}
            series={[{ key: 'value', name: 'Average', color: CHART_COLORS[0] }]}
            height={300}
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="Class comparison" icon={School} />
        <div className="mt-4 space-y-3.5">
          {data.classComparison.map((row) => (
            <div key={row.class_id} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm font-medium text-ink">
                {row.class_name} {row.section}
              </span>
              <ProgressBar
                value={row.average_percentage ?? 0}
                tone={scoreTone(row.average_percentage)}
                className="flex-1"
                size="sm"
              />
              <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                {formatPercent(row.average_percentage, 0)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default Reports;
