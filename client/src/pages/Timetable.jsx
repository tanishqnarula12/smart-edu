import { useState } from 'react';
import { CalendarDays, MapPin, User, Clock } from 'lucide-react';
import { timetableApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import { Tabs, EmptyState, ErrorState } from '../components/ui/index.js';
import { formatTime } from '../utils/format.js';
import { WEEKDAYS, CHART_COLORS } from '../utils/constants.js';
import { cn } from '../utils/cn.js';

/**
 * Weekly timetable (§12), shared by students and teachers — the API scopes
 * itself from the caller's role, so this component does not branch on it.
 *
 * Desktop shows a seven-column grid; mobile switches to a day picker, because
 * a week grid at 320px is unreadable.
 */
export function Timetable({ studentId }) {
  const { role } = useAuth();

  // Default the mobile day picker to today (Sunday wraps to Monday).
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [activeDay, setActiveDay] = useState(WEEKDAYS[Math.min(todayIndex, 5)].value);

  const { data, isLoading, error, refetch } = useApi(
    () => timetableApi.get(studentId ? { studentId } : {}),
    [studentId]
  );

  const days = data?.days ?? {};
  const weekdays = WEEKDAYS.slice(0, 6); // Monday–Saturday

  // Colour each subject consistently across the week.
  const subjectColours = new Map();
  Object.values(days)
    .flat()
    .forEach((period) => {
      if (!subjectColours.has(period.subjectId)) {
        subjectColours.set(period.subjectId, CHART_COLORS[subjectColours.size % CHART_COLORS.length]);
      }
    });

  const hasAny = Object.values(days).some((list) => list.length > 0);

  return (
    <>
      <PageHeader
        title="Timetable"
        description={
          role === 'teacher'
            ? 'Your teaching schedule for the week.'
            : 'Your weekly class schedule.'
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="skeleton h-72 rounded-2xl" />
          ))}
        </div>
      ) : !hasAny ? (
        <EmptyState
          icon={CalendarDays}
          title="No timetable published yet"
          message={
            role === 'teacher'
              ? 'Once an administrator schedules your classes, they will appear here.'
              : 'Your class timetable will appear here once it is published.'
          }
        />
      ) : (
        <>
          {/* Desktop grid */}
          <div className="hidden gap-3 lg:grid lg:grid-cols-6">
            {weekdays.map((day) => {
              const periods = days[day.value] ?? [];
              const isToday = day.value === WEEKDAYS[todayIndex]?.value;

              return (
                <div key={day.value}>
                  <div
                    className={cn(
                      'mb-2.5 rounded-xl px-3 py-2 text-center',
                      isToday ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-ink-muted'
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide">{day.short}</p>
                  </div>

                  <div className="space-y-2">
                    {periods.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-ink-subtle">
                        No classes
                      </p>
                    ) : (
                      periods.map((period) => (
                        <PeriodCard
                          key={period.id}
                          period={period}
                          colour={subjectColours.get(period.subjectId)}
                          role={role}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile day picker */}
          <div className="lg:hidden">
            <Tabs
              tabs={weekdays.map((day) => ({
                value: day.value,
                label: day.short,
                count: (days[day.value] ?? []).length || undefined,
              }))}
              active={activeDay}
              onChange={setActiveDay}
              variant="pills"
              className="mb-4"
            />

            <div className="space-y-2.5">
              {(days[activeDay] ?? []).length === 0 ? (
                <EmptyState icon={Clock} title="No classes" message="Nothing scheduled today." compact />
              ) : (
                (days[activeDay] ?? []).map((period) => (
                  <PeriodCard
                    key={period.id}
                    period={period}
                    colour={subjectColours.get(period.subjectId)}
                    role={role}
                    expanded
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PeriodCard({ period, colour, role, expanded = false }) {
  return (
    <div
      className="rounded-xl border border-line bg-surface-raised p-3 shadow-card transition hover:shadow-card-hover"
      style={{ borderLeftWidth: 3, borderLeftColor: colour }}
    >
      <p className="text-[11px] font-semibold tabular-nums text-ink-muted">
        {formatTime(period.startTime)} – {formatTime(period.endTime)}
      </p>

      <p className={cn('mt-1 font-semibold leading-snug text-ink', expanded ? 'text-sm' : 'text-xs')}>
        {period.subjectName}
      </p>

      <div className="mt-2 space-y-1 text-[11px] text-ink-muted">
        {/* A teacher's timetable is about which class; a student's is about who teaches. */}
        {role === 'teacher' ? (
          <p className="flex items-center gap-1 truncate">
            <User size={10} aria-hidden="true" />
            {period.className}
          </p>
        ) : (
          <p className="flex items-center gap-1 truncate">
            <User size={10} aria-hidden="true" />
            {period.teacherName}
          </p>
        )}

        {period.room && (
          <p className="flex items-center gap-1 truncate">
            <MapPin size={10} aria-hidden="true" />
            {period.room}
          </p>
        )}
      </div>
    </div>
  );
}

export default Timetable;
