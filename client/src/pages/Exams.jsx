import {
  FileText,
  Clock,
  MapPin,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import { examApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card,
  EmptyState,
  ErrorState,
  Badge,
  Callout,
} from '../components/ui/index.js';
import { formatDate, formatTime } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/** Exam schedule (§16), shared by students and parents. */
export function Exams({ studentId }) {
  const { data, isLoading, error, refetch } = useApi(
    () => examApi.list(studentId ? { studentId } : {}),
    [studentId]
  );

  const upcoming = (data ?? []).filter((exam) => !exam.isPast);
  const past = (data ?? []).filter((exam) => exam.isPast);
  const next = upcoming[0];

  return (
    <>
      <PageHeader title="Exams" description="Your examination schedule, syllabus and hall allocation." />

      {next && next.daysAway <= 7 && (
        <Callout
          tone={next.daysAway <= 2 ? 'danger' : 'warning'}
          icon={AlertTriangle}
          title={`${next.subjectName} exam ${next.daysAway === 0 ? 'today' : `in ${next.daysAway} day${next.daysAway === 1 ? '' : 's'}`}`}
          className="mb-6"
        >
          {next.name} · {formatDate(next.examDate)}
          {next.startTime && ` at ${formatTime(next.startTime)}`}
          {next.room && ` · ${next.room}`}
        </Callout>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={FileText}
          title="No exams scheduled"
          message="Your examination schedule will appear here once it is published."
        />
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Upcoming ({upcoming.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((exam) => (
                  <ExamCard key={exam.id} exam={exam} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Completed ({past.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {past.map((exam) => (
                  <ExamCard key={exam.id} exam={exam} isPast />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function ExamCard({ exam, isPast = false }) {
  const urgency =
    isPast ? 'neutral' : exam.daysAway <= 2 ? 'danger' : exam.daysAway <= 7 ? 'warning' : 'info';

  const accent = {
    danger: 'border-l-danger-500',
    warning: 'border-l-warning-500',
    info: 'border-l-info-500',
    neutral: 'border-l-ink-subtle',
  }[urgency];

  return (
    <Card className={cn('border-l-4', accent, isPast && 'opacity-65')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{exam.subjectName}</h3>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{exam.name}</p>
        </div>

        <Badge tone={urgency} size="sm">
          {isPast
            ? 'Done'
            : exam.daysAway === 0
              ? 'Today'
              : `${exam.daysAway}d`}
        </Badge>
      </div>

      <dl className="mt-4 space-y-2 text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <CalendarDays size={13} className="shrink-0" aria-hidden="true" />
          <span className="font-medium text-ink">{formatDate(exam.examDate)}</span>
        </div>

        {exam.startTime && (
          <div className="flex items-center gap-2">
            <Clock size={13} className="shrink-0" aria-hidden="true" />
            <span>
              {formatTime(exam.startTime)}
              {exam.endTime && ` – ${formatTime(exam.endTime)}`}
            </span>
          </div>
        )}

        {exam.room && (
          <div className="flex items-center gap-2">
            <MapPin size={13} className="shrink-0" aria-hidden="true" />
            <span>{exam.room}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <FileText size={13} className="shrink-0" aria-hidden="true" />
          <span>{exam.maxMarks} marks</span>
        </div>
      </dl>

      {exam.syllabus && (
        <div className="mt-4 rounded-lg bg-surface-sunken p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">Syllabus</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{exam.syllabus}</p>
        </div>
      )}
    </Card>
  );
}

export default Exams;
