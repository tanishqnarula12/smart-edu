import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, Check, X, Clock, Save, Users, AlertTriangle, CheckCheck,
} from 'lucide-react';
import { attendanceApi, teacherApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, Select, DatePicker, Button, Avatar, Badge, EmptyState,
  ErrorState, LoadingSkeleton, Callout, SearchInput,
} from '../../components/ui/index.js';
import { todayIso, formatDate } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

/**
 * Attendance marking (§21).
 *
 * Optimised for how teachers actually work: everyone defaults to present, and
 * you flag the exceptions. Re-opening a date loads what was already saved so
 * the register can be amended rather than re-entered.
 */
export function TeacherAttendance() {
  const toast = useToast();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [records, setRecords] = useState({});
  const [search, setSearch] = useState('');
  const [isSaving, setSaving] = useState(false);

  const { data: assignments, isLoading: assignmentsLoading } = useApi(
    () => teacherApi.myClasses(),
    []
  );

  // Distinct classes, and the subjects taught within the chosen one.
  const classes = useMemo(() => {
    const map = new Map();
    for (const row of assignments ?? []) {
      if (!map.has(row.class_id)) {
        map.set(row.class_id, {
          value: row.class_id,
          label: `${row.class_name} ${row.section}`,
        });
      }
    }
    return [...map.values()];
  }, [assignments]);

  const subjects = useMemo(
    () =>
      (assignments ?? [])
        .filter((row) => row.class_id === classId)
        .map((row) => ({ value: row.subject_id, label: `${row.subject_name} (${row.subject_code})` })),
    [assignments, classId]
  );

  // Default to the first class/subject so the page is usable immediately.
  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0].value);
  }, [classes, classId]);

  useEffect(() => {
    if (subjects.length && !subjects.some((subject) => subject.value === subjectId)) {
      setSubjectId(subjects[0].value);
    }
  }, [subjects, subjectId]);

  const ready = Boolean(classId && subjectId && date);

  const { data: register, isLoading, error, refetch } = useApi(
    () => (ready ? attendanceApi.register({ classId, subjectId, date }) : Promise.resolve(null)),
    [classId, subjectId, date]
  );

  // Seed the local edit state from whatever the server returned.
  useEffect(() => {
    if (!register?.students) return;
    setRecords(
      Object.fromEntries(
        register.students.map((student) => [
          student.studentId,
          { status: student.status, remarks: student.remarks ?? '' },
        ])
      )
    );
  }, [register]);

  const setStatus = (studentId, status) =>
    setRecords((current) => ({
      ...current,
      [studentId]: { ...current[studentId], status },
    }));

  const markAll = (status) =>
    setRecords((current) =>
      Object.fromEntries(
        Object.entries(current).map(([studentId, record]) => [studentId, { ...record, status }])
      )
    );

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        classId,
        subjectId,
        date,
        records: Object.entries(records).map(([studentId, record]) => ({
          studentId,
          status: record.status,
          remarks: record.remarks || null,
        })),
      };

      const result = await attendanceApi.mark(payload);
      toast.success(
        `Saved — ${result.present} present, ${result.absent} absent, ${result.late} late.`
      );
      refetch();
    } catch (saveError) {
      toast.error(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const students = (register?.students ?? []).filter((student) =>
    search
      ? student.name.toLowerCase().includes(search.toLowerCase()) ||
        String(student.rollNumber ?? '').includes(search)
      : true
  );

  const tally = Object.values(records).reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0 }
  );

  if (!assignmentsLoading && classes.length === 0) {
    return (
      <>
        <PageHeader title="Mark attendance" />
        <EmptyState
          icon={Users}
          title="No classes assigned"
          message="Once an administrator assigns you to a class and subject, you can mark attendance here."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Mark attendance"
        description="Everyone starts as present — flag the exceptions and save."
      />

      {/* Selection */}
      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            options={classes}
            placeholder={assignmentsLoading ? 'Loading…' : 'Select a class'}
          />
          <Select
            label="Subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            options={subjects}
            placeholder="Select a subject"
            disabled={!classId}
          />
          <DatePicker
            label="Date"
            value={date}
            max={todayIso()}
            onChange={(event) => setDate(event.target.value)}
            hint="Attendance cannot be recorded for a future date"
          />
        </div>
      </Card>

      {register?.alreadyMarked && (
        <Callout tone="info" icon={AlertTriangle} title="Already recorded" className="mb-5">
          Attendance for {formatDate(date)} has already been submitted. Saving again will amend the
          existing register — the change is recorded in the audit log.
        </Callout>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={8} height="h-14" />
      ) : !ready ? (
        <EmptyState
          icon={CalendarCheck}
          title="Choose a class, subject and date"
          message="The register will load once you make a selection."
        />
      ) : students.length === 0 && !search ? (
        <EmptyState icon={Users} title="No students in this class" />
      ) : (
        <Card>
          <CardHeader
            title="Register"
            subtitle={`${register?.students?.length ?? 0} students`}
            icon={CalendarCheck}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={CheckCheck} onClick={() => markAll('present')}>
                  All present
                </Button>
                <Button variant="ghost" size="sm" onClick={() => markAll('absent')}>
                  All absent
                </Button>
              </div>
            }
          />

          {/* Live tally */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="success">{tally.present} present</Badge>
            <Badge tone="danger">{tally.absent} absent</Badge>
            <Badge tone="warning">{tally.late} late</Badge>
          </div>

          <div className="mt-4">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a student by name or roll number…"
            />
          </div>

          <ul className="mt-4 divide-y divide-line">
            {students.map((student) => {
              const status = records[student.studentId]?.status ?? 'present';

              return (
                <li
                  key={student.studentId}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-ink-muted">
                    {student.rollNumber ?? '—'}
                  </span>

                  <Avatar name={student.name} src={student.avatarUrl} size="sm" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{student.name}</span>
                    <span className="block truncate text-xs text-ink-subtle">
                      {student.admissionNumber}
                    </span>
                  </span>

                  {/* Segmented status control */}
                  <div
                    role="radiogroup"
                    aria-label={`Attendance for ${student.name}`}
                    className="flex shrink-0 gap-1 rounded-xl bg-surface-sunken p-1"
                  >
                    {[
                      { value: 'present', icon: Check, label: 'Present', tone: 'success' },
                      { value: 'late', icon: Clock, label: 'Late', tone: 'warning' },
                      { value: 'absent', icon: X, label: 'Absent', tone: 'danger' },
                    ].map((option) => {
                      const isActive = status === option.value;
                      const activeStyles = {
                        success: 'bg-success-500 text-white',
                        warning: 'bg-warning-500 text-white',
                        danger: 'bg-danger-500 text-white',
                      }[option.tone];

                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          aria-label={option.label}
                          title={option.label}
                          onClick={() => setStatus(student.studentId, option.value)}
                          className={cn(
                            'flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition',
                            isActive ? activeStyles : 'text-ink-muted hover:bg-surface-raised'
                          )}
                        >
                          <option.icon size={14} aria-hidden="true" />
                          <span className="hidden sm:inline">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-sm text-ink-muted">
              {formatDate(date)} · {register?.students?.length ?? 0} students
            </p>
            <Button icon={Save} onClick={save} isLoading={isSaving} size="lg">
              {register?.alreadyMarked ? 'Update attendance' : 'Submit attendance'}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

export default TeacherAttendance;
