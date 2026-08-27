import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarCheck,
  GraduationCap,
  ClipboardList,
  AlertTriangle,
  MessageSquarePlus,
  Mail,
  Phone,
  MapPin,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { studentApi, reportApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

import {
  Card,
  CardHeader,
  StatCard,
  ChartCard,
  Tabs,
  Badge,
  Button,
  Avatar,
  ProgressBar,
  ProgressRing,
  EmptyState,
  ErrorState,
  PageLoader,
  Modal,
  Textarea,
  Select,
  Callout,
  PrintMasthead,
  PrintFooter,
} from '../components/ui/index.js';
import { TrendChart, ComparisonBarChart } from '../charts/Charts.jsx';
import { formatPercent, formatDate, humanise } from '../utils/format.js';
import { attendanceTone, scoreTone, CHART_COLORS, ATTENDANCE_THRESHOLD } from '../utils/constants.js';

/**
 * Full student profile (§55), for teachers and admins.
 *
 * The API returns `visibleScopes`, so when this same route is reached by a
 * parent the withheld sections are absent rather than merely hidden.
 */
export function StudentProfilePage() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('overview');
  const [isRemarkOpen, setRemarkOpen] = useState(false);
  const [remark, setRemark] = useState('');
  const [sentiment, setSentiment] = useState('neutral');
  const [isSaving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useApi(
    () => studentApi.profile(studentId),
    [studentId]
  );

  const addRemark = async () => {
    if (remark.trim().length < 5) {
      toast.error('Write a slightly longer remark');
      return;
    }

    setSaving(true);
    try {
      await studentApi.addRemark(studentId, { remark: remark.trim(), sentiment });
      toast.success('Remark added');
      setRemark('');
      setRemarkOpen(false);
      refetch();
    } catch (saveError) {
      toast.error(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = async () => {
    try {
      const report = await reportApi.student(studentId);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${report.student.studentId ?? studentId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (reportError) {
      toast.error(reportError.message);
    }
  };

  if (isLoading) return <PageLoader message="Loading student profile…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { student, attendance, performance, assignments, risk, remarks, visibleScopes } = data;
  const backPath = role === 'admin' ? '/admin/students' : '/teacher/students';

  return (
    <>
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(backPath)} className="mb-4 no-print">
        Back to students
      </Button>

      <PrintMasthead
        title={`Student report — ${student.name}`}
        subtitle={[student.className, student.departmentName].filter(Boolean).join(' · ')}
        meta={`Student ID ${student.studentId} · Roll ${student.rollNumber ?? '—'}`}
      />
      <PrintFooter />

      {/* Identity */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={student.name} src={student.avatarUrl} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{student.name}</h1>
              {student.className && <Badge tone="brand">{student.className}</Badge>}
              {risk && (
                <Badge
                  tone={risk.level === 'low' ? 'success' : risk.level === 'medium' ? 'warning' : 'danger'}
                >
                  {risk.level} risk
                </Badge>
              )}
            </div>

            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs text-ink-muted sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-1.5">
                <Mail size={12} aria-hidden="true" />
                <dd className="truncate">{student.email}</dd>
              </div>
              {student.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={12} aria-hidden="true" />
                  <dd>{student.phone}</dd>
                </div>
              )}
              {student.address && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} aria-hidden="true" />
                  <dd className="truncate">{student.address}</dd>
                </div>
              )}
              <div className="flex gap-1.5">
                <dt>Student ID</dt>
                <dd className="font-medium text-ink">{student.studentId}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Roll number</dt>
                <dd className="font-medium text-ink">{student.rollNumber ?? '—'}</dd>
              </div>
              {student.classTeacherName && (
                <div className="flex gap-1.5">
                  <dt>Class teacher</dt>
                  <dd className="font-medium text-ink">{student.classTeacherName}</dd>
                </div>
              )}
              {student.dateOfBirth && (
                <div className="flex gap-1.5">
                  <dt>Date of birth</dt>
                  <dd className="font-medium text-ink">{formatDate(student.dateOfBirth)}</dd>
                </div>
              )}
              {student.departmentName && (
                <div className="flex gap-1.5">
                  <dt>Department</dt>
                  <dd className="font-medium text-ink">{student.departmentName}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 no-print">
            <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadReport}>
              Export report
            </Button>
            <Button size="sm" icon={MessageSquarePlus} onClick={() => setRemarkOpen(true)}>
              Add remark
            </Button>
          </div>
        </div>
      </Card>

      {/* Risk summary */}
      {risk?.factors?.length > 0 && (
        <Callout tone="warning" icon={AlertTriangle} title="Why this student is flagged" className="mb-6">
          <ul className="mt-1 space-y-1">
            {risk.factors.map((factor, index) => (
              <li key={index} className="text-sm">
                • {factor.detail}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-80">{risk.disclaimer}</p>
        </Callout>
      )}

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attendance"
          value={visibleScopes?.attendance ? formatPercent(attendance?.summary?.attendancePercentage) : 'Not shared'}
          icon={CalendarCheck}
          tone={
            visibleScopes?.attendance
              ? attendanceTone(attendance?.summary?.attendancePercentage)
              : 'neutral'
          }
          hint={
            visibleScopes?.attendance
              ? `${attendance?.summary?.absentCount ?? 0} absences`
              : undefined
          }
        />
        <StatCard
          label="Average"
          value={visibleScopes?.marks ? formatPercent(performance?.overallAverage) : 'Not shared'}
          icon={GraduationCap}
          tone={visibleScopes?.marks ? scoreTone(performance?.overallAverage) : 'neutral'}
          hint={performance?.grade ? `Grade ${performance.grade.grade}` : undefined}
        />
        <StatCard
          label="CGPA"
          value={
            performance?.cgpaHidden
              ? 'Not shared'
              : (performance?.cgpa?.toFixed(2) ?? '—')
          }
          unit={performance?.cgpaHidden ? '' : '/ 10'}
          icon={TrendingUp}
          tone="brand"
          hint={
            performance?.rank?.rank
              ? `Rank ${performance.rank.rank} of ${performance.rank.total}`
              : undefined
          }
        />
        <StatCard
          label="Assignments"
          value={assignments ? `${assignments.submitted}/${assignments.due}` : 'Not shared'}
          icon={ClipboardList}
          tone={
            !assignments ? 'neutral' : assignments.pending > 0 ? 'warning' : 'success'
          }
          hint={assignments ? `${formatPercent(assignments.completionRate)} completion` : undefined}
        />
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'attendance', label: 'Attendance' },
          { value: 'performance', label: 'Performance' },
          { value: 'remarks', label: 'Remarks', count: remarks?.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5 no-print"
      />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          {risk && (
            <Card>
              <CardHeader title="Risk indicator" icon={AlertTriangle} />

              <div className="mt-4 flex items-center gap-4">
                <ProgressRing
                  value={risk.healthScore}
                  tone={risk.level === 'low' ? 'success' : risk.level === 'medium' ? 'warning' : 'danger'}
                  size={88}
                  label={`${Math.round(risk.healthScore)}`}
                  sublabel="health"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <ProgressBar
                    label="Attendance"
                    value={risk.breakdown.attendanceScore}
                    tone={attendanceTone(risk.breakdown.attendanceScore)}
                    size="sm"
                  />
                  <ProgressBar
                    label="Performance"
                    value={risk.breakdown.performanceScore}
                    tone={scoreTone(risk.breakdown.performanceScore)}
                    size="sm"
                  />
                  <ProgressBar
                    label="Assignments"
                    value={risk.breakdown.assignmentScore}
                    tone="info"
                    size="sm"
                  />
                </div>
              </div>

              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-subtle">
                {risk.disclaimer}
              </p>
            </Card>
          )}

          {visibleScopes?.attendance && (
            <Card>
              <CardHeader title="Attendance by subject" icon={CalendarCheck} />
              <div className="mt-4 space-y-3.5">
                {(attendance?.subjects ?? []).slice(0, 8).map((subject) => (
                  <ProgressBar
                    key={subject.subjectId}
                    label={subject.subjectName}
                    value={subject.attendancePercentage}
                    tone={attendanceTone(subject.attendancePercentage)}
                    showValue
                    size="sm"
                  />
                ))}
              </div>
            </Card>
          )}

          {visibleScopes?.marks && (
            <Card>
              <CardHeader title="Subject averages" icon={GraduationCap} />
              <div className="mt-4 space-y-3.5">
                {(performance?.subjects ?? []).slice(0, 8).map((subject) => (
                  <ProgressBar
                    key={subject.subjectId}
                    label={subject.subjectName}
                    value={subject.averagePercentage}
                    tone={scoreTone(subject.averagePercentage)}
                    showValue
                    size="sm"
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Attendance by subject"
            isEmpty={!attendance?.subjects?.length}
            subtitle={`Against the ${ATTENDANCE_THRESHOLD}% requirement`}
          >
            <ComparisonBarChart
              data={(attendance?.subjects ?? []).map((subject) => ({
                name: subject.subjectCode ?? subject.subjectName,
                value: subject.attendancePercentage,
              }))}
              layout="vertical"
              series={[{ key: 'value', name: 'Attendance', color: CHART_COLORS[0] }]}
              referenceValue={ATTENDANCE_THRESHOLD}
              height={Math.max(220, (attendance?.subjects?.length ?? 0) * 40)}
            />
          </ChartCard>

          <Card>
            <CardHeader title="Attendance summary" icon={CalendarCheck} />
            <dl className="mt-4 grid grid-cols-2 gap-4">
              {[
                { label: 'Total classes', value: attendance?.summary?.totalClasses ?? 0, tone: 'text-ink' },
                { label: 'Present', value: attendance?.summary?.presentCount ?? 0, tone: 'text-success-600' },
                { label: 'Absent', value: attendance?.summary?.absentCount ?? 0, tone: 'text-danger-600' },
                { label: 'Late', value: attendance?.summary?.lateCount ?? 0, tone: 'text-warning-600' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-surface-sunken p-4 text-center">
                  <dt className="text-xs text-ink-muted">{item.label}</dt>
                  <dd className={`mt-1 text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {tab === 'performance' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Score trend" isEmpty={!performance?.trend?.length}>
            <TrendChart
              data={performance?.trend ?? []}
              series={[
                { key: 'score', name: 'Score', color: CHART_COLORS[0] },
                { key: 'cumulativeAverage', name: 'Running average', color: CHART_COLORS[1] },
              ]}
              showLegend
            />
          </ChartCard>

          <ChartCard title="Against the class" isEmpty={!performance?.subjects?.length}>
            <ComparisonBarChart
              data={(performance?.subjects ?? []).map((subject) => ({
                name: subject.subjectCode ?? subject.subjectName,
                Student: subject.averagePercentage,
                Class: subject.classAverage ?? 0,
              }))}
              series={[
                { key: 'Student', name: 'Student', color: CHART_COLORS[0] },
                { key: 'Class', name: 'Class average', color: CHART_COLORS[1] },
              ]}
              showLegend
            />
          </ChartCard>
        </div>
      )}

      {tab === 'remarks' && (
        <Card>
          <CardHeader
            title="Teacher remarks"
            icon={MessageSquarePlus}
            action={
              <Button size="sm" icon={MessageSquarePlus} onClick={() => setRemarkOpen(true)}>
                Add
              </Button>
            }
          />

          <div className="mt-4">
            {!remarks?.length ? (
              <EmptyState
                icon={MessageSquarePlus}
                title="No remarks yet"
                message="Record an observation about this student's progress or conduct."
                compact
              />
            ) : (
              <ul className="space-y-3">
                {remarks.map((entry, index) => (
                  <li key={index} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{entry.teacher_name}</p>
                      <div className="flex items-center gap-2">
                        {entry.subject_name && (
                          <Badge tone="neutral" size="sm">
                            {entry.subject_name}
                          </Badge>
                        )}
                        <Badge
                          tone={
                            entry.sentiment === 'positive'
                              ? 'success'
                              : entry.sentiment === 'concern'
                                ? 'warning'
                                : 'neutral'
                          }
                          size="sm"
                        >
                          {humanise(entry.sentiment)}
                        </Badge>
                        <span className="text-xs text-ink-subtle">{formatDate(entry.created_at)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{entry.remark}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <Modal
        isOpen={isRemarkOpen}
        onClose={() => setRemarkOpen(false)}
        title="Add a remark"
        description={`An observation about ${student.name}, visible to staff and on their report.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemarkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addRemark} isLoading={isSaving}>
              Save remark
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Tone"
            value={sentiment}
            onChange={(event) => setSentiment(event.target.value)}
            options={[
              { value: 'positive', label: 'Positive' },
              { value: 'neutral', label: 'Neutral' },
              { value: 'concern', label: 'Concern' },
            ]}
          />

          <Textarea
            label="Remark"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            rows={5}
            placeholder="What have you observed?"
          />
        </div>
      </Modal>
    </>
  );
}

export default StudentProfilePage;
