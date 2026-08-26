import { TrendingUp, TrendingDown, Sparkles, Info } from 'lucide-react';
import { analyticsApi, aiApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  ChartCard,
  ProgressRing,
  ProgressBar,
  Badge,
  Button,
  ErrorState,
  Callout,
  Tooltip,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart, SubjectRadar } from '../../charts/Charts.jsx';
import { formatPercent } from '../../utils/format.js';
import { scoreTone, attendanceTone, CHART_COLORS, RISK_COLORS } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';

/**
 * Progress page (§37) — charts plus the AI-generated insight panel.
 *
 * The risk indicator is shown with its own breakdown and caveat, so a student
 * sees *why* they were flagged rather than an opaque score.
 */
export function StudentProgress() {
  const { data, isLoading, error, refetch } = useApi(() => analyticsApi.student(), []);
  const { data: insights } = useApi(() => aiApi.insights(), []);

  if (error) {
    return (
      <>
        <PageHeader title="Progress" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const attendance = data?.attendance?.summary ?? {};
  const performance = data?.performance ?? {};
  const assignments = data?.assignments ?? {};
  const risk = data?.risk ?? {};
  const subjects = performance.subjects ?? [];

  return (
    <>
      <PageHeader
        title="Progress"
        description="How you're tracking across attendance, results and coursework."
      />

      {/* AI insights */}
      <Card className="mb-6 border-brand-200 bg-gradient-to-br from-brand-50/70 to-violet-50/40 dark:border-brand-900 dark:from-brand-950/40 dark:to-violet-950/20">
        <CardHeader
          title="Your insights"
          subtitle="Generated from your own academic record"
          icon={Sparkles}
          action={
            <Button to="/student/ai-tutor" variant="subtle" size="sm">
              Ask the tutor
            </Button>
          }
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {!insights?.insights?.length ? (
            <p className="text-sm text-ink-muted sm:col-span-2">
              Insights appear once there is enough attendance and assessment data on your account.
            </p>
          ) : (
            insights.insights.map((insight, index) => (
              <div
                key={index}
                className="rounded-xl border border-line bg-surface-raised/80 p-4 backdrop-blur"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      insight.tone === 'positive'
                        ? 'bg-success-100 text-success-600 dark:bg-success-500/15'
                        : 'bg-warning-100 text-warning-600 dark:bg-warning-500/15'
                    )}
                  >
                    {insight.tone === 'positive' ? (
                      <TrendingUp size={14} aria-hidden="true" />
                    ) : (
                      <TrendingDown size={14} aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {insight.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{insight.body}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Headline metrics */}
      <div className="mb-6 grid gap-5 lg:grid-cols-4">
        <Card className="flex flex-col items-center justify-center text-center">
          <ProgressRing
            value={attendance.attendancePercentage ?? 0}
            tone={attendanceTone(attendance.attendancePercentage)}
            size={104}
          />
          <p className="mt-3 text-sm font-semibold text-ink">Attendance</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {attendance.presentCount ?? 0} of {attendance.totalClasses ?? 0} classes
          </p>
        </Card>

        <Card className="flex flex-col items-center justify-center text-center">
          <ProgressRing
            value={performance.overallAverage ?? 0}
            tone={scoreTone(performance.overallAverage)}
            size={104}
            label={performance.grade?.grade ?? '—'}
            sublabel="grade"
          />
          <p className="mt-3 text-sm font-semibold text-ink">Academic average</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {formatPercent(performance.overallAverage)} · CGPA {performance.cgpa?.toFixed(2) ?? '—'}
          </p>
        </Card>

        <Card className="flex flex-col items-center justify-center text-center">
          <ProgressRing
            value={
              assignments.pending + assignments.submitted + assignments.graded > 0
                ? ((assignments.submitted + assignments.graded) /
                    (assignments.pending + assignments.submitted + assignments.graded)) *
                  100
                : 100
            }
            tone="info"
            size={104}
          />
          <p className="mt-3 text-sm font-semibold text-ink">Assignment completion</p>
          <p className="mt-0.5 text-xs text-ink-muted">{assignments.pending ?? 0} outstanding</p>
        </Card>

        {/* Risk indicator — always shown with its reasoning */}
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Academic standing</p>
              <p className="mt-0.5 text-xs text-ink-muted">Combined indicator</p>
            </div>
            <Tooltip content="An indicator to prompt a check-in, not a prediction" side="left">
              <Info size={14} className="text-ink-subtle" aria-hidden="true" />
            </Tooltip>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk.level] }}
              aria-hidden="true"
            />
            <span className="text-lg font-bold capitalize text-ink">{risk.level ?? '—'}</span>
            <Badge tone={risk.level === 'low' ? 'success' : risk.level === 'medium' ? 'warning' : 'danger'} size="sm">
              {risk.healthScore?.toFixed(0) ?? '—'}/100
            </Badge>
          </div>

          <div className="mt-4 space-y-2">
            <ProgressBar
              label="Attendance"
              value={risk.breakdown?.attendanceScore ?? 0}
              tone={attendanceTone(risk.breakdown?.attendanceScore)}
              size="sm"
            />
            <ProgressBar
              label="Performance"
              value={risk.breakdown?.performanceScore ?? 0}
              tone={scoreTone(risk.breakdown?.performanceScore)}
              size="sm"
            />
            <ProgressBar
              label="Assignments"
              value={risk.breakdown?.assignmentScore ?? 0}
              tone="info"
              size="sm"
            />
          </div>
        </Card>
      </div>

      {risk.factors?.length > 0 && (
        <Callout tone="warning" title="What's pulling your standing down" className="mb-6">
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

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Attendance trend"
          subtitle="Monthly, against the 75% requirement"
          isLoading={isLoading}
          isEmpty={!data?.attendance?.monthlyTrend?.length}
        >
          <TrendChart
            data={data?.attendance?.monthlyTrend ?? []}
            series={[{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }]}
            referenceValue={75}
            referenceLabel="Required"
          />
        </ChartCard>

        <ChartCard
          title="Score trend"
          subtitle="Assessment by assessment, with your running average"
          isLoading={isLoading}
          isEmpty={!performance.trend?.length}
        >
          <TrendChart
            data={performance.trend ?? []}
            series={[
              { key: 'score', name: 'Score', color: CHART_COLORS[0] },
              { key: 'cumulativeAverage', name: 'Running average', color: CHART_COLORS[1] },
            ]}
            showLegend
          />
        </ChartCard>

        <ChartCard
          title="Subject comparison"
          subtitle="Your average against the class"
          isLoading={isLoading}
          isEmpty={!subjects.length}
        >
          <ComparisonBarChart
            data={subjects.map((subject) => ({
              name: subject.subjectCode ?? subject.subjectName,
              You: subject.averagePercentage,
              Class: subject.classAverage ?? 0,
            }))}
            series={[
              { key: 'You', name: 'You', color: CHART_COLORS[0] },
              { key: 'Class', name: 'Class average', color: CHART_COLORS[1] },
            ]}
            showLegend
          />
        </ChartCard>

        <ChartCard
          title="Subject profile"
          subtitle="Where your strengths sit"
          isLoading={isLoading}
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
      </div>
    </>
  );
}

export default StudentProgress;
