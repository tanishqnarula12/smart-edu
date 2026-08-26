import { Link } from 'react-router-dom';
import {
  CalendarCheck, GraduationCap, ClipboardList, FileText, Clock, ArrowRight,
  AlertTriangle, Sparkles, TrendingUp, MapPin,
} from 'lucide-react';
import { analyticsApi, timetableApi, noticeApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  StatCard, ChartCard, Card, CardHeader, Badge, StatusBadge, Button, ProgressBar,
  EmptyState, ErrorState, ClickableRow, Callout, ProgressRing,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart } from '../../charts/Charts.jsx';
import {
  greeting, firstName, formatPercent, formatDate, formatTime, daysUntil, truncate,
} from '../../utils/format.js';
import { ATTENDANCE_THRESHOLD, attendanceTone, CHART_COLORS } from '../../utils/constants.js';

/**
 * Student dashboard (§15).
 *
 * One request loads the whole page — /analytics/student assembles attendance,
 * performance, assignments and risk server-side, so the dashboard paints in a
 * single round trip instead of a waterfall of six.
 */
export function StudentDashboard() {
  const { user, profile } = useAuth();

  const { data, isLoading, error, refetch } = useApi(() => analyticsApi.student(), []);
  const { data: today } = useApi(() => timetableApi.today(), []);
  const { data: notices } = useApi(() => noticeApi.list({ limit: 4 }), []);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const kpis = data?.kpis ?? {};
  const attendance = data?.attendance ?? {};
  const performance = data?.performance ?? {};
  const assignments = data?.assignments ?? {};

  const subjectAttendance = (attendance.subjects ?? []).slice(0, 6).map((subject) => ({
    name: subject.subjectCode ?? subject.subjectName,
    fullName: subject.subjectName,
    value: subject.attendancePercentage,
  }));

  const subjectScores = (performance.subjects ?? []).slice(0, 6).map((subject) => ({
    name: subject.subjectCode ?? subject.subjectName,
    You: subject.averagePercentage,
    'Class average': subject.classAverage ?? 0,
  }));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user?.name)}`}
        description="Here's your academic overview."
        action={
          <Button to="/student/ai-tutor" icon={Sparkles} variant="subtle">
            Ask the AI tutor
          </Button>
        }
      >
        {profile && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
            {profile.className && (
              <span className="flex items-center gap-1.5">
                <GraduationCap size={14} aria-hidden="true" />
                {profile.className} {profile.section}
              </span>
            )}
            {profile.rollNumber && <span>Roll no. {profile.rollNumber}</span>}
            {profile.studentId && <span>ID {profile.studentId}</span>}
            {profile.academicYear && <span>{profile.academicYear}</span>}
          </div>
        )}
      </PageHeader>

      {/* Low-attendance warning is the one thing worth interrupting for. */}
      {kpis.attendanceBelowThreshold && (
        <Callout tone="warning" icon={AlertTriangle} title="Your attendance is below the requirement" className="mb-6">
          <p>
            You are at {formatPercent(kpis.attendancePercentage)}, under the {ATTENDANCE_THRESHOLD}%
            needed to sit end-semester examinations.{' '}
            <Link to="/student/attendance" className="font-medium underline underline-offset-2">
              See which subjects are affected
            </Link>
            .
          </p>
        </Callout>
      )}

      {/* KPI cards — each one navigates (§72) */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={formatPercent(kpis.attendancePercentage)}
          icon={CalendarCheck}
          tone={attendanceTone(kpis.attendancePercentage)}
          hint={`${attendance.summary?.presentCount ?? 0} of ${attendance.summary?.totalClasses ?? 0} classes attended`}
          to="/student/attendance"
          isLoading={isLoading}
        />
        <StatCard
          label="Current CGPA"
          value={kpis.cgpa?.toFixed(2) ?? '—'}
          unit="/ 10"
          icon={GraduationCap}
          tone="brand"
          hint={
            kpis.classRank
              ? `Rank ${kpis.classRank} of ${kpis.classSize} in your class`
              : 'Across all published assessments'
          }
          to="/student/marks"
          isLoading={isLoading}
        />
        <StatCard
          label="Assignments pending"
          value={kpis.pendingAssignments ?? 0}
          icon={ClipboardList}
          tone={kpis.pendingAssignments > 0 ? 'warning' : 'success'}
          hint={
            kpis.pendingAssignments > 0
              ? `${assignments.dueSoon?.length ?? 0} due within a week`
              : 'Everything submitted'
          }
          to="/student/assignments"
          isLoading={isLoading}
        />
        <StatCard
          label="Upcoming exams"
          value={kpis.upcomingExams ?? 0}
          icon={FileText}
          tone="info"
          hint={
            data?.upcomingExams?.[0]
              ? `Next: ${data.upcomingExams[0].subject_name} in ${data.upcomingExams[0].days_away} days`
              : 'None scheduled'
          }
          to="/student/exams"
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Left column ───────────────────────────────────────────── */}
        <div className="space-y-5 lg:col-span-2">
          <ChartCard
            title="Attendance trend"
            subtitle="Month by month, against the 75% requirement"
            isLoading={isLoading}
            isEmpty={!attendance.monthlyTrend?.length}
            emptyMessage="Attendance records will appear here once classes are marked"
            action={
              <Button to="/student/attendance" variant="ghost" size="sm" iconRight={ArrowRight}>
                Details
              </Button>
            }
          >
            <TrendChart
              data={attendance.monthlyTrend ?? []}
              series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
              referenceValue={ATTENDANCE_THRESHOLD}
              referenceLabel="75% required"
              height={260}
            />
          </ChartCard>

          <ChartCard
            title="Subject performance"
            subtitle="Your average against the class average"
            isLoading={isLoading}
            isEmpty={!subjectScores.length}
            emptyMessage="Results appear here once your teachers publish marks"
            action={
              <Button to="/student/progress" variant="ghost" size="sm" iconRight={ArrowRight}>
                Progress
              </Button>
            }
          >
            <ComparisonBarChart
              data={subjectScores}
              series={[
                { key: 'You', name: 'You', color: CHART_COLORS[0] },
                { key: 'Class average', name: 'Class average', color: CHART_COLORS[1] },
              ]}
              showLegend
              height={280}
            />
          </ChartCard>

          {/* Assignments due soon */}
          <Card>
            <CardHeader
              title="Due soon"
              subtitle={
                assignments.dueSoon?.length
                  ? `${assignments.dueSoon.length} assignment(s) due within a week`
                  : 'Nothing due in the next seven days'
              }
              icon={ClipboardList}
              action={
                <Button to="/student/assignments" variant="ghost" size="sm" iconRight={ArrowRight}>
                  All
                </Button>
              }
            />

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : !assignments.dueSoon?.length ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nothing due this week"
                  message="You're on top of your work."
                  compact
                />
              ) : (
                <ul className="space-y-1">
                  {assignments.dueSoon.map((assignment) => {
                    const days = daysUntil(assignment.dueDate);
                    return (
                      <li key={assignment.id}>
                        <ClickableRow to={`/student/assignments/${assignment.id}`}>
                          <span
                            className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-bold leading-none ${
                              days <= 1
                                ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10'
                                : days <= 3
                                  ? 'bg-warning-50 text-warning-600 dark:bg-warning-500/10'
                                  : 'bg-surface-sunken text-ink-muted'
                            }`}
                          >
                            <span className="text-sm">{Math.max(0, days)}</span>
                            <span>{days === 1 ? 'day' : 'days'}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {assignment.title}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {assignment.subjectName} · due {formatDate(assignment.dueDate)}
                            </span>
                          </span>
                          <StatusBadge status={assignment.status} size="sm" />
                        </ClickableRow>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right column ──────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Today's schedule */}
          <Card>
            <CardHeader
              title="Today's classes"
              subtitle={today?.day ? today.day[0].toUpperCase() + today.day.slice(1) : undefined}
              icon={Clock}
              action={
                <Button to="/student/timetable" variant="ghost" size="sm">
                  Week
                </Button>
              }
            />

            <div className="mt-4">
              {!today ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="skeleton h-12 rounded-lg" />
                  ))}
                </div>
              ) : !today.classes?.length ? (
                <EmptyState
                  icon={Clock}
                  title="No classes today"
                  message="Enjoy the day off."
                  compact
                />
              ) : (
                <ul className="space-y-1.5">
                  {today.classes.map((period) => (
                    <li
                      key={period.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                        period.isCurrent
                          ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-950/40 dark:ring-brand-900'
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
                        <span className="flex items-center gap-1 truncate text-xs text-ink-muted">
                          {period.room && (
                            <>
                              <MapPin size={10} aria-hidden="true" />
                              {period.room} ·
                            </>
                          )}
                          {period.teacherName}
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

          {/* Attendance by subject */}
          <Card>
            <CardHeader title="Attendance by subject" icon={CalendarCheck} />

            <div className="mt-4 space-y-3.5">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="skeleton h-8 rounded-lg" />
                  ))}
                </div>
              ) : !subjectAttendance.length ? (
                <p className="py-4 text-center text-sm text-ink-muted">No records yet</p>
              ) : (
                subjectAttendance.map((subject) => (
                  <ProgressBar
                    key={subject.name}
                    label={subject.fullName}
                    value={subject.value}
                    showValue
                    tone={attendanceTone(subject.value)}
                  />
                ))
              )}
            </div>
          </Card>

          {/* Academic standing */}
          <Card>
            <CardHeader title="Academic standing" icon={TrendingUp} />

            <div className="mt-4 flex items-center gap-5">
              <ProgressRing
                value={performance.overallAverage ?? 0}
                tone={
                  (performance.overallAverage ?? 0) >= 75
                    ? 'success'
                    : (performance.overallAverage ?? 0) >= 50
                      ? 'info'
                      : 'warning'
                }
                label={performance.grade?.grade ?? '—'}
                sublabel="grade"
                size={92}
              />

              <dl className="min-w-0 flex-1 space-y-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-muted">Average</dt>
                  <dd className="font-semibold text-ink">
                    {formatPercent(performance.overallAverage)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-muted">CGPA</dt>
                  <dd className="font-semibold text-ink">{performance.cgpa?.toFixed(2) ?? '—'}</dd>
                </div>
                {performance.rank?.rank && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-muted">Class rank</dt>
                    <dd className="font-semibold text-ink">
                      {performance.rank.rank} / {performance.rank.total}
                    </dd>
                  </div>
                )}
                {performance.strongest && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-muted">Strongest</dt>
                    <dd className="truncate font-medium text-success-600">
                      {performance.strongest.name}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </Card>

          {/* Notices */}
          <Card>
            <CardHeader
              title="Latest notices"
              icon={FileText}
              action={
                <Button to="/student/notifications" variant="ghost" size="sm">
                  All
                </Button>
              }
            />

            <div className="mt-4">
              {!notices ? (
                <div className="space-y-2">
                  {[0, 1].map((index) => (
                    <div key={index} className="skeleton h-16 rounded-lg" />
                  ))}
                </div>
              ) : !notices.data?.length ? (
                <p className="py-4 text-center text-sm text-ink-muted">No notices right now</p>
              ) : (
                <ul className="space-y-3">
                  {notices.data.slice(0, 4).map((notice) => (
                    <li key={notice.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-ink">
                            {notice.title}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                            {truncate(notice.content, 110)}
                          </span>
                        </span>
                        {(notice.priority === 'urgent' || notice.priority === 'high') && (
                          <StatusBadge status={notice.priority} size="sm" />
                        )}
                      </div>
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

export default StudentDashboard;
