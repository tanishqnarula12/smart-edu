import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  School, Users, CalendarCheck, GraduationCap, ArrowLeft, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { academicApi, teacherApi, attendanceApi, marksApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, StatCard, ChartCard, DataTable, Badge, Button, Avatar, Tabs,
  EmptyState, ErrorState, LoadingSkeleton, ProgressBar,
} from '../../components/ui/index.js';
import { ComparisonBarChart } from '../../charts/Charts.jsx';
import { formatPercent } from '../../utils/format.js';
import { attendanceTone, scoreTone, CHART_COLORS, ATTENDANCE_THRESHOLD } from '../../utils/constants.js';

/** /teacher/classes — the classes and subjects a teacher is assigned. */
export function TeacherClasses() {
  const { data, isLoading, error, refetch } = useApi(() => teacherApi.myClasses(), []);

  // Group the teacher×subject×class rows by class.
  const grouped = (data ?? []).reduce((acc, row) => {
    (acc[row.class_id] ??= { classId: row.class_id, name: `${row.class_name} ${row.section}`, meta: row, subjects: [] }).subjects.push(row);
    return acc;
  }, {});

  const classes = Object.values(grouped);

  return (
    <>
      <PageHeader title="My classes" description="The classes and subjects assigned to you." />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={3} height="h-44" />
      ) : classes.length === 0 ? (
        <EmptyState
          icon={School}
          title="No classes assigned"
          message="An administrator assigns teaching duties. Once assigned, your classes appear here."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((classRow) => (
            <Card key={classRow.classId} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-ink">{classRow.name}</h3>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {classRow.meta.academic_year} · {classRow.meta.student_count} students
                  </p>
                </div>
                {classRow.meta.is_class_teacher && (
                  <Badge tone="brand" size="sm">
                    Class teacher
                  </Badge>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <ProgressBar
                  label="Average attendance"
                  value={classRow.meta.average_attendance ?? 0}
                  tone={attendanceTone(classRow.meta.average_attendance)}
                  showValue
                  size="sm"
                />
                <ProgressBar
                  label="Average marks"
                  value={classRow.meta.average_marks ?? 0}
                  tone={scoreTone(classRow.meta.average_marks)}
                  showValue
                  size="sm"
                />
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                  You teach
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {classRow.subjects.map((subject) => (
                    <Badge key={subject.assignment_id} tone="neutral" size="sm">
                      {subject.subject_code}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                to={`/teacher/classes/${classRow.classId}`}
                variant="secondary"
                fullWidth
                className="mt-4"
              >
                Open class
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** /teacher/classes/:id — the roster plus attendance and performance. */
export function TeacherClassDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState('students');

  const { data: classData, isLoading, error, refetch } = useApi(() => academicApi.classDetail(id), [id]);
  const { data: attendance } = useApi(() => attendanceApi.classOverview(id), [id]);
  const { data: performance } = useApi(() => marksApi.classPerformance(id), [id]);

  if (error) {
    return (
      <>
        <PageHeader title="Class" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const studentColumns = [
    {
      key: 'name',
      header: 'Student',
      primary: true,
      render: (row) => (
        <Link
          to={`/teacher/students/${row.studentId ?? row.id}`}
          className="flex items-center gap-2.5 font-medium text-ink hover:text-brand-600"
        >
          <Avatar name={row.name} src={row.avatarUrl ?? row.avatar_url} size="xs" />
          <span className="truncate">{row.name}</span>
        </Link>
      ),
    },
    { key: 'rollNumber', header: 'Roll', render: (row) => row.rollNumber ?? row.roll_number ?? '—' },
    {
      key: 'attendancePercentage',
      header: 'Attendance',
      align: 'right',
      render: (row) => {
        const value = row.attendancePercentage ?? row.attendance_percentage ?? 0;
        return (
          <Badge tone={attendanceTone(value)} size="sm">
            {formatPercent(value)}
          </Badge>
        );
      },
    },
  ];

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={ArrowLeft}
        to="/teacher/classes"
        className="mb-4"
      >
        Back to classes
      </Button>

      <PageHeader
        title={classData ? `${classData.name} ${classData.section}` : 'Class'}
        description={
          classData
            ? `${classData.academic_year}${classData.department_name ? ` · ${classData.department_name}` : ''}${classData.room ? ` · ${classData.room}` : ''}`
            : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          value={attendance?.totalStudents ?? classData?.students?.length ?? 0}
          icon={Users}
          tone="brand"
          isLoading={isLoading}
        />
        <StatCard
          label="Average attendance"
          value={formatPercent(attendance?.averageAttendance)}
          icon={CalendarCheck}
          tone={attendanceTone(attendance?.averageAttendance)}
          isLoading={isLoading}
        />
        <StatCard
          label="Below threshold"
          value={attendance?.belowThresholdCount ?? 0}
          icon={AlertTriangle}
          tone={attendance?.belowThresholdCount > 0 ? 'danger' : 'success'}
          hint={`Under ${ATTENDANCE_THRESHOLD}%`}
          isLoading={isLoading}
        />
        <StatCard
          label="Class average"
          value={formatPercent(performance?.classAverage)}
          icon={GraduationCap}
          tone={scoreTone(performance?.classAverage)}
          isLoading={isLoading}
        />
      </div>

      <Tabs
        tabs={[
          { value: 'students', label: 'Students', count: classData?.students?.length },
          { value: 'attendance', label: 'Attendance' },
          { value: 'performance', label: 'Performance' },
          { value: 'subjects', label: 'Subjects', count: classData?.subjects?.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'students' && (
        <Card>
          <CardHeader title="Class roster" icon={Users} />
          <DataTable
            className="mt-4"
            columns={studentColumns}
            rows={(classData?.students ?? []).map((student) => ({ ...student, studentId: student.id }))}
            isLoading={isLoading}
            emptyTitle="No students enrolled"
          />
        </Card>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader
            title="Attendance by student"
            subtitle="Lowest first, so the students needing attention are at the top"
            icon={CalendarCheck}
          />
          <div className="mt-4 space-y-3.5">
            {!attendance?.students?.length ? (
              <EmptyState icon={CalendarCheck} title="No attendance recorded" compact />
            ) : (
              attendance.students.map((student) => (
                <div key={student.studentId} className="flex items-center gap-3">
                  <Avatar name={student.name} src={student.avatarUrl} size="xs" />
                  <Link
                    to={`/teacher/students/${student.studentId}`}
                    className="w-40 shrink-0 truncate text-sm font-medium text-ink hover:text-brand-600"
                  >
                    {student.name}
                  </Link>
                  <ProgressBar
                    value={student.attendancePercentage}
                    tone={attendanceTone(student.attendancePercentage)}
                    className="flex-1"
                    size="sm"
                  />
                  <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                    {formatPercent(student.attendancePercentage, 0)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {tab === 'performance' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Subject averages"
            subtitle="How the class performs per subject"
            isEmpty={!performance?.subjects?.length}
          >
            <ComparisonBarChart
              data={(performance?.subjects ?? []).map((subject) => ({
                name: subject.subject_code,
                value: subject.average_percentage,
              }))}
              layout="vertical"
              series={[{ key: 'value', name: 'Average', color: CHART_COLORS[0] }]}
              height={Math.max(220, (performance?.subjects?.length ?? 0) * 42)}
            />
          </ChartCard>

          <Card>
            <CardHeader title="Top performers" icon={TrendingUp} />
            <ul className="mt-4 space-y-2">
              {(performance?.students ?? []).slice(0, 10).map((student, index) => (
                <li key={student.studentId} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-xs font-bold text-ink-muted">
                    {index + 1}
                  </span>
                  <Link
                    to={`/teacher/students/${student.studentId}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand-600"
                  >
                    {student.name}
                  </Link>
                  <Badge tone={scoreTone(student.average)} size="sm">
                    {formatPercent(student.average)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'subjects' && (
        <Card>
          <CardHeader title="Subjects taught in this class" icon={GraduationCap} />
          <ul className="mt-4 divide-y divide-line">
            {(classData?.subjects ?? []).map((subject) => (
              <li key={subject.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{subject.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {subject.code} · {subject.credits} credits
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-muted">
                  {subject.teacher_name ?? 'Unassigned'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default TeacherClasses;
