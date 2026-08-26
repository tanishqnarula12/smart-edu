import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search } from 'lucide-react';
import { studentApi, academicApi } from '../services/endpoints.js';
import { useApi, useDebounced } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  DataTable,
  SearchInput,
  Select,
  Badge,
  Avatar,
} from '../components/ui/index.js';
import { formatPercent } from '../utils/format.js';
import { attendanceTone, scoreTone, ATTENDANCE_THRESHOLD } from '../utils/constants.js';

/**
 * Student directory (§20, §28), shared by teachers and admins.
 *
 * The API scopes the result set — a teacher sees only their own classes — so
 * this component does not filter by role itself.
 */
export function StudentDirectory() {
  const { role } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search, 300);

  const { data: classes } = useApi(() => academicApi.classes(), []);

  const { data, isLoading, error, refetch } = useApi(
    () =>
      studentApi.list({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        classId: classId || undefined,
      }),
    [page, debouncedSearch, classId]
  );

  const basePath = role === 'admin' ? '/admin/students' : '/teacher/students';

  const columns = [
    {
      key: 'name',
      header: 'Student',
      primary: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} src={row.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-muted">{row.studentId}</p>
          </div>
        </div>
      ),
    },
    { key: 'rollNumber', header: 'Roll', render: (row) => row.rollNumber ?? '—' },
    {
      key: 'className',
      header: 'Class',
      render: (row) => row.className ?? <span className="text-ink-subtle">Unassigned</span>,
    },
    {
      key: 'attendancePercentage',
      header: 'Attendance',
      align: 'right',
      render: (row) =>
        row.totalClasses > 0 ? (
          <Badge tone={attendanceTone(row.attendancePercentage)} size="sm">
            {formatPercent(row.attendancePercentage)}
          </Badge>
        ) : (
          <span className="text-xs text-ink-subtle">No records</span>
        ),
    },
    {
      key: 'averagePercentage',
      header: 'Average',
      align: 'right',
      hideOnMobile: true,
      render: (row) =>
        row.averagePercentage != null ? (
          <Badge tone={scoreTone(row.averagePercentage)} size="sm">
            {formatPercent(row.averagePercentage)}
          </Badge>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    },
    {
      key: 'email',
      header: 'E-mail',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-ink-muted">{row.email}</span>,
    },
  ];

  const students = data?.data ?? [];
  const atRisk = students.filter((student) => student.isBelowThreshold).length;

  return (
    <>
      <PageHeader
        title="Students"
        description={
          role === 'admin'
            ? 'Every student in the institution.'
            : 'Students in the classes you teach.'
        }
      />

      <Card>
        <CardHeader
          title={`${data?.meta?.pagination?.totalItems ?? 0} students`}
          subtitle={
            atRisk > 0
              ? `${atRisk} on this page are below ${ATTENDANCE_THRESHOLD}% attendance`
              : undefined
          }
          icon={Users}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,14rem]">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name, roll number or ID…"
          />

          <Select
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setPage(1);
            }}
            placeholder="All classes"
            options={(classes ?? []).map((classRow) => ({
              value: classRow.id,
              label: `${classRow.name} ${classRow.section}`,
            }))}
          />
        </div>

        <DataTable
          className="mt-5"
          columns={columns}
          rows={students}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          onRowClick={(row) => navigate(`${basePath}/${row.id}`)}
          pagination={data?.meta?.pagination}
          onPageChange={setPage}
          emptyTitle={search || classId ? 'No students matched' : 'No students'}
          emptyMessage={
            search || classId
              ? 'Try a different search term or class filter.'
              : role === 'teacher'
                ? 'You have no students assigned yet.'
                : 'Add students from the users page.'
          }
          emptyIcon={search ? Search : Users}
        />
      </Card>
    </>
  );
}

export default StudentDirectory;
