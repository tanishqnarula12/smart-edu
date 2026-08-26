import { Link } from 'react-router-dom';
import {
  Users,
  CalendarCheck,
  GraduationCap,
  ClipboardList,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
  Sparkles,
  School,
  Clock,
} from 'lucide-react';
import { analyticsApi, timetableApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  StatCard,
  ChartCard,
  Card,
  CardHeader,
  Badge,
  Button,
  Avatar,
  ClickableRow,
  EmptyState,
  ErrorState,
  Callout,
} from '../../components/ui/index.js';
import { ComparisonBarChart, DonutChart, RiskDonut } from '../../charts/Charts.jsx';
import { greeting, firstName, formatPercent, formatTime } from '../../utils/format.js';
import { attendanceTone, scoreTone, CHART_COLORS } from '../../utils/constants.js';

/** Teacher dashboard (§19): class health, students at risk, work to grade. */
export function TeacherDashboard() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useApi(() => analyticsApi.teacher(), []);
  const { data: today } = useApi(() => timetableApi.today(), []);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const kpis = data?.kpis ?? {};
  const classes = data?.classes ?? [];
  const lowAttendance = data?.lowAttendance ?? [];
  const declining = data?.decliningStudents ?? [];
  const distribution = data?.attendanceDistribution ?? [];
  const assignmentStats = data?.assignmentStats ?? {};

  const assignmentBreakdown = [
    { name: 'Submitted', value: (assignmentStats.submitted ?? 0) - (assignmentStats.late ?? 0), color: CHART_COLORS[1] },
    { name: 'Late', value: assignmentStats.late ?? 0, color: CHART_COLORS[2] },
    { name: 'Pending', value: assignmentStats.pending ?? 0, color: '#94a3b8' },
  ].filter((entry) => entry.value > 0);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user?.name)}`}
        description="Your classes at a glance, and who needs attention."
        action={
          <div className="flex gap-2">
            <Button to="/teacher/attendance" icon={CalendarCheck} variant="secondary">
              Mark attendance
            </Button>
            <Button to="/teacher/ai-tools" icon={Sparkles} variant="subtle">
              AI tools
            </Button>
          </div>
        }
      />

      {kpis.ungradedSubmissions > 0 && (
        <Callout tone="info" title={`${kpis.ungradedSubmissions} submission(s) awaiting grading`} className="mb-6">
          <Link to="/teacher/assignments" className="font-medium underline underline-offset-2">
            Grade them now
          </Link>{' '}
          — feedback lands better while the work is still fresh.
        </Callout>
      )}

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total students"
          value={kpis.totalStudents ?? 0}
          icon={Users}
          tone="brand"
          hint={`Across ${kpis.totalClasses ?? 0} class(es)`}
          to="/teacher/students"
          isLoading={isLoading}
        />
        <StatCard
          label="Average attendance"
          value={formatPercent(kpis.averageAttendance)}
          icon={CalendarCheck}
          tone={attendanceTone(kpis.averageAttendance)}
          hint={`${lowAttendance.length} student(s) below 75%`}
          to="/teacher/attendance"
          isLoading={isLoading}
        />
        <StatCard
          label="Average marks"
          value={formatPercent(kpis.averageMarks)}
          icon={GraduationCap}
          tone={scoreTone(kpis.averageMarks)}
          hint="Across published assessments"
          to="/teacher/marks"
          isLoading={isLoading}
        />
        <StatCard
          label="Pending grading"
          value={kpis.ungradedSubmissions ?? 0}
          icon={ClipboardList}
          tone={kpis.ungradedSubmissions > 0 ? 'warning' : 'success'}
          hint={`${kpis.activeAssignments ?? 0} assignment(s) open`}
          to="/teacher/assignments"
          isLoading={isLoading}
        />
        <StatCard
          label="Students at risk"
          value={kpis.studentsAtRisk ?? 0}
          icon={AlertTriangle}
          tone={kpis.studentsAtRisk > 0 ? 'danger' : 'success'}
          hint="Flagged for a check-in"
          to="/teacher/reports"
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Class overview */}
          <Card>
            <CardHeader
              title="Your classes"
              subtitle="Attendance and results per class"
              icon={School}
              action={
                <Button to="/teacher/classes" variant="ghost" size="sm" iconRight={ArrowRight}>
                  All
                </Button>
              }
            />

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              ) : classes.length === 0 ? (
                <EmptyState
                  icon={School}
                  title="No classes assigned"
                  message="Once an administrator assigns you to classes, they will appear here."
                  compact
                />
              ) : (
                <ul className="space-y-2">
                  {classes.map((classRow) => (
                    <li key={classRow.id}>
                      <ClickableRow to={`/teacher/classes/${classRow.id}`}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-950/50">
                          {classRow.section}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {classRow.name} {classRow.section}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {classRow.student_count} students
                          </span>
                        </span>

                        <span className="hidden shrink-0 items-center gap-4 sm:flex">
                          <span className="text-right">
                            <span className="block text-[10px] uppercase tracking-wide text-ink-subtle">
                              Attendance
                            </span>
                            <span className="block text-sm font-semibold tabular-nums text-ink">
                              {formatPercent(classRow.average_attendance)}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-[10px] uppercase tracking-wide text-ink-subtle">
                              Marks
                            </span>
                            <span className="block text-sm font-semibold tabular-nums text-ink">
                              {formatPercent(classRow.average_marks)}
                            </span>
                          </span>
                        </span>
                      </ClickableRow>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Low attendance */}
          <Card>
            <CardHeader
              title="Low attendance"
              subtitle="Students below the 75% requirement"
              icon={AlertTriangle}
              action={
                lowAttendance.length > 0 && (
                  <Badge tone="danger" size="sm">
                    {lowAttendance.length}
                  </Badge>
                )
              }
            />

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : lowAttendance.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Everyone is above the threshold"
                  message="No student in your classes is below 75%."
                  compact
                />
              ) : (
                <ul className="space-y-1">
                  {lowAttendance.map((student) => (
                    <li key={student.studentId}>
                      <ClickableRow to={`/teacher/students/${student.studentId}`}>
                        <Avatar name={student.name} src={student.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {student.name}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {student.className} · Roll {student.rollNumber ?? '—'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-bold tabular-nums text-danger-600">
                            {formatPercent(student.attendancePercentage)}
                          </span>
                          <span className="block text-[10px] text-ink-subtle">
                            {student.absentCount} absences
                          </span>
                        </span>
                      </ClickableRow>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Declining performance (§19) */}
          <Card>
            <CardHeader
              title="Performance decline"
              subtitle="Students whose recent scores have dropped"
              icon={TrendingDown}
            />

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1].map((index) => (
                    <div key={index} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : declining.length === 0 ? (
                <EmptyState
                  icon={TrendingDown}
                  title="No declines detected"
                  message="Nobody's recent scores have dropped meaningfully."
                  compact
                />
              ) : (
                <div className="scroll-x">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Student
                        </th>
                        <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Subject
                        </th>
                        <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Previous
                        </th>
                        <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Current
                        </th>
                        <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Change
                        </th>
                        <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Risk
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {declining.map((student, index) => (
                        <tr key={`${student.studentId}-${student.subjectId}-${index}`}>
                          <td className="py-2.5">
                            <Link
                              to={`/teacher/students/${student.studentId}`}
                              className="font-medium text-ink hover:text-brand-600"
                            >
                              {student.name}
                            </Link>
                          </td>
                          <td className="py-2.5 text-ink-muted">{student.subjectName}</td>
                          <td className="py-2.5 text-right tabular-nums text-ink-muted">
                            {formatPercent(student.previousScore, 0)}
                          </td>
                          <td className="py-2.5 text-right font-semibold tabular-nums text-ink">
                            {formatPercent(student.currentScore, 0)}
                          </td>
                          <td className="py-2.5 text-right font-semibold tabular-nums text-danger-600">
                            {student.change}
                          </td>
                          <td className="py-2.5 text-right">
                            <Badge
                              tone={
                                student.riskLevel === 'high'
                                  ? 'danger'
                                  : student.riskLevel === 'medium'
                                    ? 'warning'
                                    : 'neutral'
                              }
                              size="sm"
                            >
                              {student.riskLevel}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Today */}
          <Card>
            <CardHeader
              title="Today's classes"
              icon={Clock}
              action={
                <Button to="/teacher/timetable" variant="ghost" size="sm">
                  Week
                </Button>
              }
            />
            <div className="mt-4">
              {!today?.classes?.length ? (
                <EmptyState icon={Clock} title="No classes today" compact />
              ) : (
                <ul className="space-y-1.5">
                  {today.classes.map((period) => (
                    <li
                      key={period.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                        period.isCurrent
                          ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-950/40'
                          : period.isPast
                            ? 'opacity-55'
                            : 'bg-surface-sunken/60'
                      }`}
                    >
                      <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-ink-muted">
                        {formatTime(period.startTime)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {period.subjectName}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {period.className}
                          {period.room && ` · ${period.room}`}
                        </span>
                      </span>
                      {period.isCurrent && (
                        <Badge tone="brand" size="sm" dot>
                          Now
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <ChartCard
            title="Attendance distribution"
            subtitle="How your students are spread"
            height={220}
            isLoading={isLoading}
            isEmpty={!distribution.some((band) => band.count > 0)}
          >
            <ComparisonBarChart
              data={distribution.map((band) => ({ name: band.band, value: band.count }))}
              layout="vertical"
              series={[{ key: 'value', name: 'Students', color: CHART_COLORS[0] }]}
              domain={[0, 'dataMax']}
              valueSuffix=""
              height={220}
            />
          </ChartCard>

          <ChartCard
            title="Risk distribution"
            subtitle="Combined academic indicator"
            height={230}
            isLoading={isLoading}
            isEmpty={
              !data?.riskDistribution ||
              Object.values(data.riskDistribution).every((count) => count === 0)
            }
          >
            <RiskDonut distribution={data?.riskDistribution} height={230} />
          </ChartCard>

          <ChartCard
            title="Assignment completion"
            subtitle={`${formatPercent(assignmentStats.completionRate)} submitted`}
            height={220}
            isLoading={isLoading}
            isEmpty={!assignmentBreakdown.length}
          >
            <DonutChart data={assignmentBreakdown} height={220} centerLabel="submissions" />
          </ChartCard>
        </div>
      </div>
    </>
  );
}

export default TeacherDashboard;
