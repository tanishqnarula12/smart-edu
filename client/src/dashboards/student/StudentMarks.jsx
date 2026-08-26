import { useState } from 'react';
import { GraduationCap, Trophy, Target, TrendingUp } from 'lucide-react';
import { marksApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, ChartCard, StatCard, DataTable, Badge, Tabs, ProgressBar,
  ErrorState, EmptyState,
} from '../../components/ui/index.js';
import { TrendChart, ComparisonBarChart, SubjectRadar } from '../../charts/Charts.jsx';
import { formatPercent, formatDate, humanise } from '../../utils/format.js';
import { scoreTone, CHART_COLORS } from '../../utils/constants.js';

// Tailwind only emits classes it can see as complete strings, so tone → class
// has to be an explicit map rather than an interpolated name.
const SCORE_TEXT = {
  success: 'text-success-600',
  info: 'text-info-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600',
  neutral: 'text-ink-muted',
};

/** Marks and CGPA (§16). */
export function StudentMarks() {
  const [tab, setTab] = useState('overview');

  const { data: performance, isLoading, error, refetch } = useApi(() => marksApi.performance(), []);
  const { data: marks, isLoading: marksLoading } = useApi(() => marksApi.list({ limit: 100 }), []);

  if (error) {
    return (
      <>
        <PageHeader title="Marks & CGPA" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const subjects = performance?.subjects ?? [];
  const trend = performance?.trend ?? [];
  const rank = performance?.rank ?? {};

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
      render: (row) =>
        row.isAbsent ? (
          '—'
        ) : (
          <span className={`font-semibold tabular-nums ${SCORE_TEXT[scoreTone(row.percentage)]}`}>
            {formatPercent(row.percentage)}
          </span>
        ),
    },
    {
      key: 'classAverage',
      header: 'Class avg',
      align: 'right',
      hideOnMobile: true,
      render: (row) =>
        row.classAverage != null ? (
          <span className="tabular-nums text-ink-muted">{formatPercent(row.classAverage)}</span>
        ) : (
          '—'
        ),
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
    {
      key: 'date',
      header: 'Date',
      hideOnMobile: true,
      render: (row) => formatDate(row.date),
    },
  ];

  return (
    <>
      <PageHeader
        title="Marks & CGPA"
        description="Every published assessment result, with how you compare to your class."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current CGPA"
          value={performance?.cgpa?.toFixed(2) ?? '—'}
          unit="/ 10"
          icon={GraduationCap}
          tone="brand"
          hint="Credit-weighted across all subjects"
          isLoading={isLoading}
        />
        <StatCard
          label="Overall average"
          value={formatPercent(performance?.overallAverage)}
          icon={Target}
          tone={scoreTone(performance?.overallAverage)}
          hint={`Grade ${performance?.grade?.grade ?? '—'}`}
          isLoading={isLoading}
        />
        <StatCard
          label="Class rank"
          value={rank.rank ? `${rank.rank}` : '—'}
          unit={rank.total ? `of ${rank.total}` : ''}
          icon={Trophy}
          tone="warning"
          hint={rank.percentile ? `${rank.percentile} percentile` : 'Not yet ranked'}
          isLoading={isLoading}
        />
        <StatCard
          label="Subjects assessed"
          value={performance?.subjectCount ?? 0}
          icon={TrendingUp}
          tone="info"
          hint={
            performance?.strongest ? `Strongest: ${performance.strongest.name}` : 'No results yet'
          }
          isLoading={isLoading}
        />
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'subjects', label: 'By subject', count: subjects.length },
          { value: 'results', label: 'All results', count: marks?.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Performance trend"
            subtitle="Your running average across assessments"
            isLoading={isLoading}
            isEmpty={!trend.length}
            emptyMessage="Results appear here once marks are published"
          >
            <TrendChart
              data={trend}
              xKey="label"
              series={[
                { key: 'score', name: 'Score', color: CHART_COLORS[0] },
                { key: 'cumulativeAverage', name: 'Running average', color: CHART_COLORS[1] },
              ]}
              showLegend
              height={280}
            />
          </ChartCard>

          <ChartCard
            title="Subject profile"
            subtitle="Your spread across subjects"
            isLoading={isLoading}
            isEmpty={subjects.length < 3}
            emptyMessage="Needs at least three assessed subjects"
          >
            <SubjectRadar
              data={subjects.map((subject) => ({
                subject: subject.subjectCode ?? subject.subjectName,
                value: subject.averagePercentage,
              }))}
              height={280}
            />
          </ChartCard>

          <ChartCard
            title="You vs the class"
            subtitle="Subject averages compared"
            className="lg:col-span-2"
            isLoading={isLoading}
            isEmpty={!subjects.length}
          >
            <ComparisonBarChart
              data={subjects.map((subject) => ({
                name: subject.subjectCode ?? subject.subjectName,
                You: subject.averagePercentage,
                'Class average': subject.classAverage ?? 0,
              }))}
              series={[
                { key: 'You', name: 'You', color: CHART_COLORS[0] },
                { key: 'Class average', name: 'Class average', color: CHART_COLORS[1] },
              ]}
              showLegend
              height={300}
            />
          </ChartCard>
        </div>
      )}

      {tab === 'subjects' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.length === 0 ? (
            <EmptyState
              className="sm:col-span-2 xl:col-span-3"
              icon={GraduationCap}
              title="No results published yet"
              message="Your subject averages will appear here once teachers publish marks."
            />
          ) : (
            subjects.map((subject) => (
              <Card key={subject.subjectId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink">{subject.subjectName}</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {subject.subjectCode} · {subject.credits} credits
                    </p>
                  </div>
                  <Badge tone={scoreTone(subject.averagePercentage)}>{subject.grade}</Badge>
                </div>

                <ProgressBar
                  value={subject.averagePercentage}
                  tone={scoreTone(subject.averagePercentage)}
                  showValue
                  label="Average"
                  className="mt-4"
                />

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Best</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-success-600">
                      {formatPercent(subject.bestPercentage, 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Lowest</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink-muted">
                      {formatPercent(subject.worstPercentage, 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Class</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">
                      {subject.classAverage != null ? formatPercent(subject.classAverage, 0) : '—'}
                    </dd>
                  </div>
                </dl>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'results' && (
        <Card>
          <CardHeader title="All results" subtitle="Every published assessment" icon={GraduationCap} />
          <DataTable
            className="mt-4"
            columns={columns}
            rows={marks ?? []}
            isLoading={marksLoading}
            emptyTitle="No marks published"
            emptyMessage="Results appear here as soon as your teachers publish them."
            emptyIcon={GraduationCap}
          />
        </Card>
      )}
    </>
  );
}

export default StudentMarks;
