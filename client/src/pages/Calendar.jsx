import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, FileText, ClipboardList } from 'lucide-react';
import { examApi, assignmentApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import { Card, CardHeader, IconButton, Badge, EmptyState, Button } from '../components/ui/index.js';
import { formatDate, toIsoDate } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/**
 * Month calendar (§16) overlaying exams and assignment deadlines.
 *
 * Built with plain date arithmetic rather than a calendar library — the grid
 * is six rows of seven, and everything else is a lookup by ISO date.
 */
export function Calendar({ studentId }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => toIsoDate(new Date()));

  const { data: exams } = useApi(() => examApi.list(studentId ? { studentId } : {}), [studentId]);
  const { data: assignments } = useApi(
    () => assignmentApi.list({ limit: 100, ...(studentId ? { studentId } : {}) }),
    [studentId]
  );

  /** Group every event by ISO date so a day cell is a single lookup. */
  const eventsByDate = useMemo(() => {
    const map = new Map();

    const add = (date, event) => {
      const key = toIsoDate(date);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    };

    for (const exam of exams ?? []) {
      add(exam.examDate, {
        type: 'exam',
        title: exam.subjectName,
        detail: exam.name,
        tone: 'danger',
      });
    }

    for (const assignment of assignments?.data ?? []) {
      add(assignment.dueDate, {
        type: 'assignment',
        title: assignment.title,
        detail: assignment.subjectName,
        tone: ['graded', 'submitted', 'late'].includes(assignment.status) ? 'success' : 'warning',
        status: assignment.status,
      });
    }

    return map;
  }, [exams, assignments]);

  // Build the 42-cell grid: leading days from the previous month, this month,
  // then trailing days — so every month renders the same shape.
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const firstDay = new Date(year, month, 1);
    // Monday-first: JS Sunday (0) becomes index 6.
    const leading = (firstDay.getDay() + 6) % 7;

    const start = new Date(year, month, 1 - leading);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date,
        iso: toIsoDate(date),
        isCurrentMonth: date.getMonth() === month,
        isToday: toIsoDate(date) === toIsoDate(new Date()),
      };
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const selectedEvents = eventsByDate.get(selected) ?? [];

  const shift = (delta) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <>
      <PageHeader title="Calendar" description="Exams and assignment deadlines in one view." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">{monthLabel}</h2>
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label="Previous month" size="sm" onClick={() => shift(-1)} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelected(toIsoDate(now));
                }}
              >
                Today
              </Button>
              <IconButton icon={ChevronRight} label="Next month" size="sm" onClick={() => shift(1)} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div
                key={day}
                className="pb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-subtle"
              >
                {day.slice(0, 1)}
                <span className="hidden sm:inline">{day.slice(1)}</span>
              </div>
            ))}

            {cells.map((cell) => {
              const events = eventsByDate.get(cell.iso) ?? [];
              const isSelected = cell.iso === selected;

              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setSelected(cell.iso)}
                  aria-label={`${formatDate(cell.date)}${events.length ? `, ${events.length} event(s)` : ''}`}
                  aria-current={cell.isToday ? 'date' : undefined}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-start rounded-lg p-1 text-xs transition sm:p-1.5',
                    !cell.isCurrentMonth && 'opacity-35',
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : cell.isToday
                        ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                        : 'hover:bg-surface-sunken'
                  )}
                >
                  <span className={cn('tabular-nums', cell.isToday && !isSelected && 'font-bold')}>
                    {cell.date.getDate()}
                  </span>

                  {events.length > 0 && (
                    <span className="mt-auto flex gap-0.5">
                      {events.slice(0, 3).map((event, index) => (
                        <span
                          key={index}
                          className={cn(
                            'h-1 w-1 rounded-full',
                            isSelected
                              ? 'bg-white'
                              : event.tone === 'danger'
                                ? 'bg-danger-500'
                                : event.tone === 'success'
                                  ? 'bg-success-500'
                                  : 'bg-warning-500'
                          )}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 border-t border-line pt-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-danger-500" aria-hidden="true" /> Exam
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning-500" aria-hidden="true" /> Assignment due
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success-500" aria-hidden="true" /> Submitted
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={formatDate(selected)}
            subtitle={
              selectedEvents.length
                ? `${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'}`
                : 'Nothing scheduled'
            }
            icon={CalendarDays}
          />

          <div className="mt-4">
            {selectedEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Free day"
                message="No exams or deadlines on this date."
                compact
              />
            ) : (
              <ul className="space-y-2.5">
                {selectedEvents.map((event, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-xl border border-line p-3"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        event.type === 'exam'
                          ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10'
                          : 'bg-warning-50 text-warning-600 dark:bg-warning-500/10'
                      )}
                    >
                      {event.type === 'exam' ? (
                        <FileText size={15} aria-hidden="true" />
                      ) : (
                        <ClipboardList size={15} aria-hidden="true" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{event.title}</p>
                      <p className="truncate text-xs text-ink-muted">{event.detail}</p>
                    </div>

                    {event.status && (
                      <Badge tone={event.tone} size="sm">
                        {event.status}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

export default Calendar;
