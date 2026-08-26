import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  GraduationCap,
  ClipboardList,
  Trophy,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  ShieldOff,
  FileText,
  Users,
  Lock,
} from 'lucide-react';
import { parentApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  StatCard,
  ChartCard,
  Card,
  CardHeader,
  Badge,
  StatusBadge,
  Button,
  ProgressBar,
  EmptyState,
  ErrorState,
  Callout,
  Avatar,
  ClickableRow,
  RestrictedState,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart } from '../../charts/Charts.jsx';
import { ChildSelector } from './ChildSelector.jsx';
import {
  greeting,
  firstName,
  formatPercent,
  formatDate,
  truncate,
} from '../../utils/format.js';
import { ATTENDANCE_THRESHOLD, attendanceTone, CHART_COLORS } from '../../utils/constants.js';

/**
 * Parent dashboard (§17).
 *
 * Whatever the student has withheld simply is not in the response, so this
 * page renders a `RestrictedState` for those panels rather than a zero. A
 * blank chart would imply "no data"; the student's choice is a different fact
 * and the parent deserves to see which one it is.
 */
export function ParentDashboard() {
  const { user } = useAuth();
  const [selectedChildId, setSelectedChildId] = useState(null);

  const { data, isLoading, error, refetch } = useApi(
    () => parentApi.dashboard(selectedChildId ? { studentId: selectedChildId } : {}),
    [selectedChildId]
  );

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const children = data?.children ?? [];
  const child = data?.selectedChild;
  const permissions = data?.permissions ?? {};
  const kpis = data?.kpis ?? {};
  const attendance = data?.attendance;
  const performance = data?.performance;
  const assignments = data?.assignments;

  if (!isLoading && children.length === 0) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${firstName(user?.name)}`} />
        <EmptyState
          icon={Users}
          title="No children linked yet"
          message="Ask your institution's administrator to link your child's account to yours. Once linked, your child controls which parts of their record you can see."
        />
      </>
    );
  }

  const subjectScores = (performance?.subjects ?? []).slice(0, 6).map((subject) => ({
    name: subject.subjectCode ?? subject.subjectName,
    Child: subject.averagePercentage,
    'Class average': subject.classAverage ?? 0,
  }));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user?.name)}`}
        description={child ? `Here's how ${firstName(child.name)} is doing.` : 'Your children at a glance.'}
        action={
          <Button to="/parent/ai-assistant" icon={Sparkles} variant="subtle">
            Ask the assistant
          </Button>
        }
      >
        {children.length > 1 && (
          <ChildSelector
            students={children}
            selectedId={child?.id}
            onSelect={setSelectedChildId}
            className="mt-4"
          />
        )}
      </PageHeader>

      {/* Privacy notice, when the student has withheld something */}
      {data?.privacyNote && (
        <Callout tone="info" icon={ShieldOff} title="Some information is not shared" className="mb-6">
          <p>{data.privacyNote}</p>
          <p className="mt-1.5 text-xs opacity-85">
            Students control what their parents can see. This is their decision to make — if you need
            access, the conversation to have is with them.
          </p>
        </Callout>
      )}

      {/* Attendance warning, only when we can actually see attendance */}
      {permissions.attendance && kpis.attendanceBelowThreshold && (
        <Callout tone="warning" icon={AlertTriangle} title="Attendance below the requirement" className="mb-6">
          {firstName(child?.name)} is at {formatPercent(kpis.attendancePercentage)}, under the{' '}
          {ATTENDANCE_THRESHOLD}% needed to sit end-semester examinations.{' '}
          <Link to="/parent/attendance" className="font-medium underline underline-offset-2">
            See the breakdown
          </Link>
          .
        </Callout>
      )}

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attendance"
          value={permissions.attendance ? formatPercent(kpis.attendancePercentage) : 'Not shared'}
          icon={permissions.attendance ? CalendarCheck : Lock}
          tone={permissions.attendance ? attendanceTone(kpis.attendancePercentage) : 'neutral'}
          hint={
            permissions.attendance
              ? `${attendance?.summary?.presentCount ?? 0} of ${attendance?.summary?.totalClasses ?? 0} classes`
              : 'Your child has not shared this'
          }
          to={permissions.attendance ? '/parent/attendance' : undefined}
          isLoading={isLoading}
        />

        <StatCard
          label="CGPA"
          value={permissions.cgpa ? (kpis.cgpa?.toFixed(2) ?? '—') : 'Not shared'}
          unit={permissions.cgpa ? '/ 10' : ''}
          icon={permissions.cgpa ? GraduationCap : Lock}
          tone={permissions.cgpa ? 'brand' : 'neutral'}
          hint={
            permissions.cgpa
              ? kpis.classRank
                ? `Rank ${kpis.classRank} of ${kpis.classSize}`
                : 'Across published assessments'
              : 'Your child has not shared this'
          }
          to={permissions.marks ? '/parent/marks' : undefined}
          isLoading={isLoading}
        />

        <StatCard
          label="Assignments pending"
          value={permissions.assignments ? (kpis.pendingAssignments ?? 0) : 'Not shared'}
          icon={permissions.assignments ? ClipboardList : Lock}
          tone={
            !permissions.assignments
              ? 'neutral'
              : kpis.pendingAssignments > 0
                ? 'warning'
                : 'success'
          }
          hint={
            permissions.assignments
              ? kpis.pendingAssignments > 0
                ? 'Outstanding submissions'
                : 'All up to date'
              : 'Your child has not shared this'
          }
          to={permissions.assignments ? '/parent/assignments' : undefined}
          isLoading={isLoading}
        />

        <StatCard
          label="Class rank"
          value={permissions.cgpa && kpis.classRank ? `${kpis.classRank}` : 'Not shared'}
          unit={permissions.cgpa && kpis.classSize ? `of ${kpis.classSize}` : ''}
          icon={permissions.cgpa ? Trophy : Lock}
          tone={permissions.cgpa ? 'warning' : 'neutral'}
          hint={permissions.cgpa ? 'By overall average' : 'Your child has not shared this'}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Attendance trend */}
          {permissions.attendance ? (
            <ChartCard
              title="Attendance trend"
              subtitle="Month by month against the 75% requirement"
              isLoading={isLoading}
              isEmpty={!attendance?.monthlyTrend?.length}
              action={
                <Button to="/parent/attendance" variant="ghost" size="sm" iconRight={ArrowRight}>
                  Details
                </Button>
              }
            >
              <TrendChart
                data={attendance?.monthlyTrend ?? []}
                series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
                referenceValue={ATTENDANCE_THRESHOLD}
                referenceLabel="Required"
              />
            </ChartCard>
          ) : (
            <Card>
              <CardHeader title="Attendance" icon={CalendarCheck} />
              <RestrictedState scope="attendance records" studentName={child?.name} className="mt-4" />
            </Card>
          )}

          {/* Performance */}
          {permissions.marks ? (
            <ChartCard
              title="Subject performance"
              subtitle="Your child's average against the class"
              isLoading={isLoading}
              isEmpty={!subjectScores.length}
              emptyMessage="Results appear once teachers publish marks"
              action={
                <Button to="/parent/performance" variant="ghost" size="sm" iconRight={ArrowRight}>
                  Details
                </Button>
              }
            >
              <ComparisonBarChart
                data={subjectScores}
                series={[
                  { key: 'Child', name: firstName(child?.name) ?? 'Your child', color: CHART_COLORS[0] },
                  { key: 'Class average', name: 'Class average', color: CHART_COLORS[1] },
                ]}
                showLegend
              />
            </ChartCard>
          ) : (
            <Card>
              <CardHeader title="Performance" icon={GraduationCap} />
              <RestrictedState scope="marks" studentName={child?.name} className="mt-4" />
            </Card>
          )}

          {/* Assignments */}
          {permissions.assignments && (
            <Card>
              <CardHeader
                title="Recent assignments"
                icon={ClipboardList}
                subtitle={
                  assignments
                    ? `${assignments.pending} pending · ${assignments.graded} graded`
                    : undefined
                }
                action={
                  <Button to="/parent/assignments" variant="ghost" size="sm" iconRight={ArrowRight}>
                    All
                  </Button>
                }
              />

              <div className="mt-4">
                {!assignments?.recent?.length ? (
                  <EmptyState icon={ClipboardList} title="No assignments yet" compact />
                ) : (
                  <ul className="space-y-1">
                    {assignments.recent.map((assignment) => (
                      <li key={assignment.id}>
                        <ClickableRow to="/parent/assignments">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {assignment.title}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {assignment.subjectName} · due {formatDate(assignment.dueDate)}
                            </span>
                          </span>

                          {assignment.marks != null && (
                            <Badge tone="success" size="sm">
                              {assignment.marks}
                            </Badge>
                          )}
                          <StatusBadge status={assignment.status} size="sm" />
                        </ClickableRow>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Child summary */}
          {child && (
            <Card>
              <div className="flex items-center gap-3">
                <Avatar name={child.name} src={child.avatarUrl} size="lg" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{child.name}</h3>
                  <p className="truncate text-xs text-ink-muted">
                    {child.className ?? 'No class assigned'}
                  </p>
                  {child.rollNumber && (
                    <p className="mt-0.5 text-xs text-ink-subtle">Roll no. {child.rollNumber}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                  Shared with you
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(permissions).map(([scope, allowed]) => (
                    <Badge key={scope} tone={allowed ? 'success' : 'neutral'} size="sm">
                      {allowed ? '' : '✕ '}
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Attendance by subject */}
          {permissions.attendance && attendance?.subjects?.length > 0 && (
            <Card>
              <CardHeader title="Attendance by subject" icon={CalendarCheck} />
              <div className="mt-4 space-y-3.5">
                {attendance.subjects.slice(0, 6).map((subject) => (
                  <ProgressBar
                    key={subject.subjectId}
                    label={subject.subjectName}
                    value={subject.attendancePercentage}
                    showValue
                    tone={attendanceTone(subject.attendancePercentage)}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Upcoming exams */}
          {data?.upcomingExams?.length > 0 && (
            <Card>
              <CardHeader title="Upcoming exams" icon={FileText} />
              <ul className="mt-4 space-y-2.5">
                {data.upcomingExams.map((exam) => (
                  <li key={exam.id} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-danger-50 text-[10px] font-bold leading-none text-danger-600 dark:bg-danger-500/10">
                      <span className="text-sm">{exam.days_away}</span>
                      <span>days</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{exam.subject_name}</p>
                      <p className="truncate text-xs text-ink-muted">{formatDate(exam.exam_date)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Notices */}
          <Card>
            <CardHeader
              title="Notices"
              icon={FileText}
              action={
                <Button to="/parent/notices" variant="ghost" size="sm">
                  All
                </Button>
              }
            />
            <div className="mt-4">
              {!data?.notices?.length ? (
                <p className="py-4 text-center text-sm text-ink-muted">No notices right now</p>
              ) : (
                <ul className="space-y-3">
                  {data.notices.map((notice) => (
                    <li key={notice.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-medium leading-snug text-ink">{notice.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {truncate(notice.content, 100)}
                      </p>
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

export default ParentDashboard;
