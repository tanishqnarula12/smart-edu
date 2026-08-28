import { useState } from 'react';
import {
  CalendarCheck,
  GraduationCap,
  ClipboardList,
  TrendingUp,
  Users,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { parentApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  ChartCard,
  StatCard,
  DataTable,
  Badge,
  StatusBadge,
  ProgressBar,
  EmptyState,
  ErrorState,
  RestrictedState,
  LoadingSkeleton,
  Avatar,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart, SubjectRadar } from '../../charts/Charts.jsx';
import { Calendar } from '../../pages/Calendar.jsx';
import { ChildSelector } from './ChildSelector.jsx';
import { formatPercent, formatDate, humanise } from '../../utils/format.js';
import { ATTENDANCE_THRESHOLD, attendanceTone, scoreTone, CHART_COLORS } from '../../utils/constants.js';

/**
 * Parent detail pages (§18).
 *
 * All four share `ParentSection`, which resolves the selected child, checks the
 * relevant permission, and renders a `RestrictedState` when the student has not
 * shared that category — a 403 from the API is expected here, not a bug.
 */
function ParentSection({ section, scope, title, description, icon, children: render }) {
  const [selectedChildId, setSelectedChildId] = useState(null);

  const { data: childList, isLoading: childrenLoading } = useApi(() => parentApi.children(), []);

  const child = selectedChildId
    ? childList?.find((candidate) => candidate.id === selectedChildId)
    : childList?.[0];

  const allowed = child?.permissions?.[scope] ?? false;

  const { data, isLoading, error, refetch } = useApi(
    () => (child && allowed ? parentApi.section(child.id, section) : Promise.resolve(null)),
    [child?.id, allowed]
  );

  if (childrenLoading) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <LoadingSkeleton count={4} height="h-24" />
      </>
    );
  }

  if (!childList?.length) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <EmptyState
          icon={Users}
          title="No children linked"
          message="Ask your administrator to link your child's account to yours."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} description={description}>
        <ChildSelector
          students={childList}
          selectedId={child?.id}
          onSelect={setSelectedChildId}
          className="mt-4"
        />
      </PageHeader>

      {!allowed ? (
        <Card>
          <CardHeader title={title} icon={icon} />
          <RestrictedState scope={scope} studentName={child?.name} className="mt-4" />
        </Card>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={5} height="h-24" />
      ) : (
        render({ data, child })
      )}
    </>
  );
}

/** /parent/children — the roster with what each child has shared. */
export function ParentChildren() {
  const { data, isLoading, error, refetch } = useApi(() => parentApi.children(), []);

  return (
    <>
      <PageHeader
        title="My children"
        description="Your linked students and what each has chosen to share with you."
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={2} height="h-56" />
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          title="No children linked"
          message="Ask your institution's administrator to link your child's account to yours."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {data.map((child) => {
            const shared = Object.entries(child.permissions);
            const sharedCount = shared.filter(([, allowed]) => allowed).length;

            return (
              <Card key={child.id}>
                <div className="flex items-center gap-4">
                  <Avatar name={child.name} src={child.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-ink">{child.name}</h3>
                    <p className="truncate text-sm text-ink-muted">
                      {child.className ?? 'No class assigned'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                      {child.rollNumber && <span>Roll {child.rollNumber}</span>}
                      {child.studentId && <span>· {child.studentId}</span>}
                      <Badge tone="neutral" size="sm">
                        {child.relationship}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                      <ShieldCheck size={13} aria-hidden="true" />
                      Shared with you
                    </p>
                    <Badge tone={sharedCount === 0 ? 'warning' : 'success'} size="sm">
                      {sharedCount} of {shared.length}
                    </Badge>
                  </div>

                  {!child.privacyEnabled ? (
                    <p className="rounded-lg bg-warning-50 p-3 text-xs text-warning-800 dark:bg-warning-500/10 dark:text-warning-500">
                      {child.name} has turned off parent access entirely. Nothing is visible to you
                      while that setting is off.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {shared.map(([scope, allowed]) => (
                        <Badge key={scope} tone={allowed ? 'success' : 'neutral'} size="sm">
                          {allowed ? '' : <Lock size={9} className="mr-0.5" aria-hidden="true" />}
                          {humanise(scope)}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
                    Your child controls these settings from their own privacy page. Neither you nor
                    the institution can change them on their behalf.
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/** /parent/attendance */
export function ParentAttendance() {
  return (
    <ParentSection
      section="attendance"
      scope="attendance"
      title="Attendance"
      description="Your child's attendance record, by subject and over time."
      icon={CalendarCheck}
    >
      {({ data, child }) => {
        const summary = data?.summary ?? {};
        const subjects = data?.subjects ?? [];

        const columns = [
          { key: 'date', header: 'Date', primary: true, render: (row) => formatDate(row.date) },
          { key: 'subject_name', header: 'Subject' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => <StatusBadge status={row.status} size="sm" />,
          },
          { key: 'teacher_name', header: 'Marked by', hideOnMobile: true },
        ];

        return (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Overall attendance"
                value={formatPercent(summary.attendancePercentage)}
                icon={CalendarCheck}
                tone={attendanceTone(summary.attendancePercentage)}
                hint={`${summary.totalClasses ?? 0} classes recorded`}
              />
              <StatCard label="Present" value={summary.presentCount ?? 0} tone="success" />
              <StatCard label="Absent" value={summary.absentCount ?? 0} tone="danger" />
              <StatCard label="Late" value={summary.lateCount ?? 0} tone="warning" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <ChartCard
                title="Monthly trend"
                isEmpty={!data?.monthlyTrend?.length}
                subtitle={`Against the ${ATTENDANCE_THRESHOLD}% requirement`}
              >
                <TrendChart
                  data={data?.monthlyTrend ?? []}
                  series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
                  referenceValue={ATTENDANCE_THRESHOLD}
                />
              </ChartCard>

              <Card>
                <CardHeader title="By subject" icon={CalendarCheck} />
                <div className="mt-4 space-y-3.5">
                  {subjects.length === 0 ? (
                    <p className="py-4 text-center text-sm text-ink-muted">No records yet</p>
                  ) : (
                    subjects.map((subject) => (
                      <ProgressBar
                        key={subject.subjectId}
                        label={subject.subjectName}
                        value={subject.attendancePercentage}
                        showValue
                        tone={attendanceTone(subject.attendancePercentage)}
                      />
                    ))
                  )}
                </div>
              </Card>
            </div>

            <Card className="mt-5">
              <CardHeader title="Recent records" subtitle={`${child?.name}'s daily attendance`} />
              <DataTable
                className="mt-4"
                columns={columns}
                rows={data?.records ?? []}
                emptyTitle="No attendance records"
              />
            </Card>
          </>
        );
      }}
    </ParentSection>
  );
}

/** /parent/marks */
export function ParentMarks() {
  return (
    <ParentSection
      section="marks"
      scope="marks"
      title="Marks"
      description="Published assessment results for your child."
      icon={GraduationCap}
    >
      {({ data }) => {
        const columns = [
          {
            key: 'assessmentName',
            header: 'Assessment',
            primary: true,
            render: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{row.assessmentName}</p>
                <p className="truncate text-xs text-ink-muted">{humanise(row.assessmentType)}</p>
              </div>
            ),
          },
          { key: 'subjectName', header: 'Subject' },
          {
            key: 'marksObtained',
            header: 'Score',
            align: 'right',
            render: (row) =>
              row.isAbsent ? (
                <Badge tone="neutral" size="sm">
                  Absent
                </Badge>
              ) : (
                <span className="font-semibold tabular-nums">
                  {row.marksObtained} <span className="text-ink-subtle">/ {row.maxMarks}</span>
                </span>
              ),
          },
          {
            key: 'percentage',
            header: '%',
            align: 'right',
            render: (row) => (row.isAbsent ? '—' : formatPercent(row.percentage)),
          },
          {
            key: 'classAverage',
            header: 'Class avg',
            align: 'right',
            hideOnMobile: true,
            render: (row) => (row.classAverage != null ? formatPercent(row.classAverage) : '—'),
          },
          {
            key: 'grade',
            header: 'Grade',
            align: 'center',
            render: (row) => (
              <Badge tone={scoreTone(row.percentage)} size="sm">
                {row.grade}
              </Badge>
            ),
          },
          { key: 'date', header: 'Date', hideOnMobile: true, render: (row) => formatDate(row.date) },
        ];

        return (
          <Card>
            <CardHeader title="All results" icon={GraduationCap} />
            <DataTable
              className="mt-4"
              columns={columns}
              rows={data ?? []}
              emptyTitle="No marks published"
              emptyMessage="Results appear here once teachers publish them."
            />
          </Card>
        );
      }}
    </ParentSection>
  );
}

/** /parent/assignments */
export function ParentAssignments() {
  return (
    <ParentSection
      section="assignments"
      scope="assignments"
      title="Assignments"
      description="What has been set, submitted and graded."
      icon={ClipboardList}
    >
      {({ data }) => {
        const columns = [
          {
            key: 'title',
            header: 'Assignment',
            primary: true,
            render: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{row.title}</p>
                <p className="truncate text-xs text-ink-muted">{row.subjectName}</p>
              </div>
            ),
          },
          { key: 'teacherName', header: 'Set by', hideOnMobile: true },
          { key: 'dueDate', header: 'Due', render: (row) => formatDate(row.dueDate) },
          {
            key: 'status',
            header: 'Status',
            render: (row) => <StatusBadge status={row.status} size="sm" />,
          },
          {
            key: 'marks',
            header: 'Marks',
            align: 'right',
            render: (row) =>
              row.marks != null ? (
                <span className="font-semibold tabular-nums">
                  {row.marks} <span className="text-ink-subtle">/ {row.maxMarks}</span>
                </span>
              ) : (
                '—'
              ),
          },
        ];

        const pending = (data ?? []).filter((row) => ['pending', 'overdue'].includes(row.status));
        const graded = (data ?? []).filter((row) => row.status === 'graded');

        return (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Total set"
                value={data?.length ?? 0}
                icon={ClipboardList}
                tone="info"
              />
              <StatCard
                label="Outstanding"
                value={pending.length}
                icon={ClipboardList}
                tone={pending.length ? 'warning' : 'success'}
              />
              <StatCard label="Graded" value={graded.length} icon={GraduationCap} tone="success" />
            </div>

            <Card>
              <CardHeader title="All assignments" icon={ClipboardList} />
              <DataTable
                className="mt-4"
                columns={columns}
                rows={data ?? []}
                emptyTitle="No assignments yet"
              />
            </Card>
          </>
        );
      }}
    </ParentSection>
  );
}

/** /parent/performance */
export function ParentPerformance() {
  return (
    <ParentSection
      section="performance"
      scope="reports"
      title="Performance"
      description="How your child is tracking across subjects."
      icon={TrendingUp}
    >
      {({ data }) => {
        const subjects = data?.subjects ?? [];

        return (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Overall average"
                value={formatPercent(data?.overallAverage)}
                icon={TrendingUp}
                tone={scoreTone(data?.overallAverage)}
                hint={`Grade ${data?.grade?.grade ?? '—'}`}
              />
              <StatCard
                label="CGPA"
                value={data?.cgpaHidden ? 'Not shared' : (data?.cgpa?.toFixed(2) ?? '—')}
                unit={data?.cgpaHidden ? '' : '/ 10'}
                icon={data?.cgpaHidden ? Lock : GraduationCap}
                tone={data?.cgpaHidden ? 'neutral' : 'brand'}
                hint={data?.cgpaHidden ? 'Your child has not shared their CGPA' : undefined}
              />
              <StatCard
                label="Class rank"
                value={data?.rank?.rank ?? 'Not shared'}
                unit={data?.rank?.total ? `of ${data.rank.total}` : ''}
                icon={data?.rank ? TrendingUp : Lock}
                tone={data?.rank ? 'warning' : 'neutral'}
              />
              <StatCard
                label="Subjects"
                value={data?.subjectCount ?? 0}
                icon={GraduationCap}
                tone="info"
                hint={data?.strongest ? `Strongest: ${data.strongest.name}` : undefined}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <ChartCard title="Score trend" isEmpty={!data?.trend?.length}>
                <TrendChart
                  data={data?.trend ?? []}
                  series={[
                    { key: 'score', name: 'Score', color: CHART_COLORS[0] },
                    { key: 'cumulativeAverage', name: 'Running average', color: CHART_COLORS[1] },
                  ]}
                  showLegend
                />
              </ChartCard>

              <ChartCard
                title="Subject profile"
                isEmpty={subjects.length < 3}
                emptyMessage="Needs at least three assessed subjects"
              >
                <SubjectRadar
                  data={subjects.map((subject) => ({
                    subject: subject.subjectCode ?? subject.subjectName,
                    value: subject.averagePercentage,
                  }))}
                />
              </ChartCard>

              <ChartCard title="Against the class" className="lg:col-span-2" isEmpty={!subjects.length}>
                <ComparisonBarChart
                  data={subjects.map((subject) => ({
                    name: subject.subjectCode ?? subject.subjectName,
                    Child: subject.averagePercentage,
                    Class: subject.classAverage ?? 0,
                  }))}
                  series={[
                    { key: 'Child', name: 'Your child', color: CHART_COLORS[0] },
                    { key: 'Class', name: 'Class average', color: CHART_COLORS[1] },
                  ]}
                  showLegend
                />
              </ChartCard>
            </div>
          </>
        );
      }}
    </ParentSection>
  );
}

/**
 * /parent/calendar — the shared `Calendar` needs a `studentId` to fetch
 * anything at all; without one the exam/assignment endpoints reject a
 * parent's request outright (they don't know who "your" exams belong to),
 * which is why an unwired parent calendar renders as permanently empty.
 */
export function ParentCalendar() {
  const [selectedChildId, setSelectedChildId] = useState(null);
  const { data: childList, isLoading } = useApi(() => parentApi.children(), []);

  const child = selectedChildId
    ? childList?.find((candidate) => candidate.id === selectedChildId)
    : childList?.[0];

  if (isLoading) {
    return (
      <>
        <PageHeader title="Calendar" description="Exams and assignment deadlines in one view." />
        <LoadingSkeleton count={4} height="h-24" />
      </>
    );
  }

  if (!childList?.length) {
    return (
      <>
        <PageHeader title="Calendar" description="Exams and assignment deadlines in one view." />
        <EmptyState
          icon={Users}
          title="No children linked"
          message="Ask your administrator to link your child's account to yours."
        />
      </>
    );
  }

  return (
    <Calendar
      studentId={child.id}
      headerExtra={
        childList.length > 1 && (
          <ChildSelector
            students={childList}
            selectedId={child?.id}
            onSelect={setSelectedChildId}
            className="mt-4"
          />
        )
      }
    />
  );
}

export default ParentChildren;
