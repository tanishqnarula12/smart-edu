import { Link } from 'react-router-dom';
import {
  Users, GraduationCap, School, CalendarCheck, BarChart3, AlertTriangle, Baby,
  MessageSquareWarning, ArrowRight, Sparkles, BookMarked, TrendingUp,
} from 'lucide-react';
import { analyticsApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  StatCard, ChartCard, Card, CardHeader, Badge, Button, Avatar, ClickableRow,
  EmptyState, ErrorState, ProgressBar, Callout,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart, RiskDonut, DonutChart } from '../../charts/Charts.jsx';
import { greeting, firstName, formatPercent } from '../../utils/format.js';
import {
  attendanceTone, scoreTone, CHART_COLORS, ATTENDANCE_THRESHOLD,
} from '../../utils/constants.js';

/** Admin dashboard (§27, §54) — the institution at a glance. */
export function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useApi(() => analyticsApi.admin({ months: 6 }), []);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const kpis = data?.kpis ?? {};
  const completion = data?.assignmentCompletion ?? {};

  const assignmentBreakdown = [
    { name: 'On time', value: (completion.submitted ?? 0) - (completion.late ?? 0), color: CHART_COLORS[1] },
    { name: 'Late', value: completion.late ?? 0, color: CHART_COLORS[2] },
    { name: 'Pending', value: completion.pending ?? 0, color: '#94a3b8' },
  ].filter((entry) => entry.value > 0);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user?.name)}`}
        description="Your institution's academic health at a glance."
        action={
          <div className="flex gap-2">
            <Button to="/admin/analytics" variant="secondary" icon={BarChart3}>
              Analytics
            </Button>
            <Button to="/admin/ai-assistant" variant="subtle" icon={Sparkles}>
              Ask the analyst
            </Button>
          </div>
        }
      />

      {(kpis.pendingComplaints > 0 || kpis.pendingLeave > 0) && (
        <Callout tone="info" title="Awaiting your action" className="mb-6">
          {kpis.pendingComplaints > 0 && (
            <>
              <Link to="/admin/complaints" className="font-medium underline underline-offset-2">
                {kpis.pendingComplaints} complaint{kpis.pendingComplaints === 1 ? '' : 's'}
              </Link>
              {kpis.pendingLeave > 0 && ' and '}
            </>
          )}
          {kpis.pendingLeave > 0 && (
            <span>
              {kpis.pendingLeave} leave request{kpis.pendingLeave === 1 ? '' : 's'}
            </span>
          )}{' '}
          need review.
        </Callout>
      )}

      {/* Overview cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          value={kpis.totalStudents ?? 0}
          icon={GraduationCap}
          tone="brand"
          hint={`Across ${kpis.totalClasses ?? 0} classes`}
          to="/admin/students"
          isLoading={isLoading}
        />
        <StatCard
          label="Teachers"
          value={kpis.totalTeachers ?? 0}
          icon={Users}
          tone="info"
          hint={`${kpis.totalSubjects ?? 0} subjects taught`}
          to="/admin/teachers"
          isLoading={isLoading}
        />
        <StatCard
          label="Parents"
          value={kpis.totalParents ?? 0}
          icon={Baby}
          tone="success"
          hint="Linked guardian accounts"
          to="/admin/parents"
          isLoading={isLoading}
        />
        <StatCard
          label="Classes"
          value={kpis.totalClasses ?? 0}
          icon={School}
          tone="warning"
          hint={`${kpis.totalSubjects ?? 0} subjects`}
          to="/admin/classes"
          isLoading={isLoading}
        />
      </div>

      {/* Health cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Average attendance"
          value={formatPercent(kpis.averageAttendance)}
          icon={CalendarCheck}
          tone={attendanceTone(kpis.averageAttendance)}
          hint={`Threshold ${ATTENDANCE_THRESHOLD}%`}
          to="/admin/attendance"
          isLoading={isLoading}
        />
        <StatCard
          label="Average performance"
          value={formatPercent(kpis.averagePerformance)}
          icon={TrendingUp}
          tone={scoreTone(kpis.averagePerformance)}
          hint="Across published assessments"
          to="/admin/marks"
          isLoading={isLoading}
        />
        <StatCard
          label="Students at risk"
          value={kpis.atRiskStudents ?? 0}
          icon={AlertTriangle}
          tone={kpis.atRiskStudents > 0 ? 'danger' : 'success'}
          hint="Medium or high indicator"
          to="/admin/analytics"
          isLoading={isLoading}
        />
        <StatCard
          label="Pending complaints"
          value={kpis.pendingComplaints ?? 0}
          icon={MessageSquareWarning}
          tone={kpis.pendingComplaints > 0 ? 'warning' : 'success'}
          hint="Awaiting triage"
          to="/admin/complaints"
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ChartCard
            title="Attendance trend"
            subtitle="Institution-wide, month by month"
            isLoading={isLoading}
            isEmpty={!data?.attendanceTrend?.length}
            action={
              <Button to="/admin/analytics" variant="ghost" size="sm" iconRight={ArrowRight}>
                Analytics
              </Button>
            }
          >
            <TrendChart
              data={data?.attendanceTrend ?? []}
              series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
              referenceValue={ATTENDANCE_THRESHOLD}
              referenceLabel="Required"
            />
          </ChartCard>

          <ChartCard
            title="Performance by subject"
            subtitle="Top performing subjects across the institution"
            isLoading={isLoading}
            isEmpty={!data?.subjectPerformance?.length}
          >
            <ComparisonBarChart
              data={(data?.subjectPerformance ?? []).map((subject) => ({
                name: subject.subject_code,
                value: subject.average_percentage,
              }))}
              series={[{ key: 'value', name: 'Average', color: CHART_COLORS[0] }]}
              height={300}
            />
          </ChartCard>

          {/* Students requiring attention — clickable rows (§54) */}
          <Card>
            <CardHeader
              title="Students requiring attention"
              subtitle="Ranked by the combined academic risk indicator"
              icon={AlertTriangle}
              action={
                <Button to="/admin/analytics" variant="ghost" size="sm" iconRight={ArrowRight}>
                  Full register
                </Button>
              }
            />

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : !data?.atRiskStudents?.length ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No students flagged"
                  message="Nobody currently sits in the medium or high risk bands."
                  compact
                />
              ) : (
                <ul className="space-y-1">
                  {data.atRiskStudents.slice(0, 8).map((student) => (
                    <li key={student.studentId}>
                      <ClickableRow to={`/admin/students/${student.studentId}`}>
                        <Avatar name={student.name} src={student.avatarUrl} size="sm" />

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {student.name}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {student.className} ·{' '}
                            {student.factors[0]?.detail ?? 'Multiple factors'}
                          </span>
                        </span>

                        <span className="hidden shrink-0 gap-3 sm:flex">
                          <span className="text-right">
                            <span className="block text-[10px] uppercase tracking-wide text-ink-subtle">
                              Attend
                            </span>
                            <span className="block text-sm font-semibold tabular-nums text-ink">
                              {formatPercent(student.attendancePercentage, 0)}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-[10px] uppercase tracking-wide text-ink-subtle">
                              Marks
                            </span>
                            <span className="block text-sm font-semibold tabular-nums text-ink">
                              {formatPercent(student.averagePercentage, 0)}
                            </span>
                          </span>
                        </span>

                        <Badge
                          tone={student.level === 'high' ? 'danger' : 'warning'}
                          size="sm"
                          className="shrink-0"
                        >
                          {student.level}
                        </Badge>
                      </ClickableRow>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <ChartCard
            title="Risk distribution"
            subtitle="Across all assessed students"
            height={240}
            isLoading={isLoading}
            isEmpty={
              !data?.riskDistribution ||
              Object.values(data.riskDistribution).every((count) => count === 0)
            }
          >
            <RiskDonut distribution={data?.riskDistribution} height={240} />
          </ChartCard>

          <ChartCard
            title="Assignment completion"
            subtitle={`${formatPercent(completion.completionRate)} of expected submissions`}
            height={220}
            isLoading={isLoading}
            isEmpty={!assignmentBreakdown.length}
          >
            <DonutChart data={assignmentBreakdown} height={220} centerLabel="submissions" />
          </ChartCard>

          <Card>
            <CardHeader
              title="Attendance by department"
              icon={BookMarked}
              action={
                <Button to="/admin/departments" variant="ghost" size="sm">
                  Manage
                </Button>
              }
            />
            <div className="mt-4 space-y-3.5">
              {!data?.departmentAttendance?.length ? (
                <p className="py-4 text-center text-sm text-ink-muted">No departments yet</p>
              ) : (
                data.departmentAttendance.map((department) => (
                  <ProgressBar
                    key={department.department_id}
                    label={`${department.code} · ${department.student_count} students`}
                    value={department.average_attendance ?? 0}
                    tone={attendanceTone(department.average_attendance)}
                    showValue
                    size="sm"
                  />
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Low attendance"
              icon={AlertTriangle}
              action={
                data?.lowAttendance?.length > 0 && (
                  <Badge tone="danger" size="sm">
                    {data.lowAttendance.length}
                  </Badge>
                )
              }
            />
            <div className="mt-4">
              {!data?.lowAttendance?.length ? (
                <p className="py-4 text-center text-sm text-ink-muted">
                  Everyone is above the threshold
                </p>
              ) : (
                <ul className="space-y-1">
                  {data.lowAttendance.slice(0, 6).map((student) => (
                    <li key={student.studentId}>
                      <ClickableRow to={`/admin/students/${student.studentId}`}>
                        <Avatar name={student.name} src={student.avatarUrl} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {student.name}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {student.className}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-danger-600">
                          {formatPercent(student.attendancePercentage, 0)}
                        </span>
                      </ClickableRow>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export default AdminDashboard;
