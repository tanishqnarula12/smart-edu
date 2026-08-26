import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  School,
  BookMarked,
  Building2,
  Plus,
  Pencil,
  Trash2,
  Link2,
  UserPlus,
} from 'lucide-react';
import { academicApi, userApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  DataTable,
  Button,
  Modal,
  Input,
  Select,
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Tabs,
  Callout,
} from '../../components/ui/index.js';
import { formatPercent } from '../../utils/format.js';
import { attendanceTone } from '../../utils/constants.js';

/** Departments, classes and subjects management (§28). */

// ═════════════════════════════ DEPARTMENTS ════════════════════════════════

export function AdminDepartments() {
  const toast = useToast();
  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const { data, isLoading, error, refetch } = useApi(() => academicApi.departments(), []);
  const { data: teachers } = useApi(() => userApi.list({ role: 'teacher', limit: 100 }), []);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    values: editing
      ? { name: editing.name, code: editing.code, headId: editing.head_id ?? '' }
      : { name: '', code: '', headId: '' },
  });

  const submit = async (values) => {
    try {
      const payload = { ...values, headId: values.headId || null };
      if (editing) {
        await academicApi.updateDepartment(editing.id, payload);
        toast.success('Department updated');
      } else {
        await academicApi.createDepartment(payload);
        toast.success('Department created');
      }
      reset({ name: '', code: '', headId: '' });
      setOpen(false);
      setEditing(null);
      refetch();
    } catch (submitError) {
      toast.error(submitError.message);
    }
  };

  const remove = async () => {
    try {
      await academicApi.deleteDepartment(toDelete.id);
      toast.success('Department deleted');
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Departments"
        description="Organisational units that classes, subjects and teachers belong to."
        action={
          <Button icon={Plus} onClick={() => { setEditing(null); setOpen(true); }}>
            New department
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={3} height="h-32" />
      ) : !data?.length ? (
        <EmptyState
          icon={Building2}
          title="No departments"
          message="Create a department to organise classes, subjects and teaching staff."
          action={<Button icon={Plus} onClick={() => setOpen(true)}>New department</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((department) => (
            <Card key={department.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{department.name}</h3>
                    <Badge tone="brand" size="sm">{department.code}</Badge>
                  </div>
                  {department.head_name && (
                    <p className="mt-1 truncate text-xs text-ink-muted">
                      Head: {department.head_name}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Pencil}
                    onClick={() => { setEditing(department); setOpen(true); }}
                    aria-label="Edit"
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Trash2}
                    onClick={() => setToDelete(department)}
                    aria-label="Delete"
                  />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                {[
                  { label: 'Classes', value: department.class_count },
                  { label: 'Subjects', value: department.subject_count },
                  { label: 'Teachers', value: department.teacher_count },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Edit department' : 'New department'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Input
            label="Name"
            placeholder="Computer Science & Engineering"
            required
            error={errors.name?.message}
            {...register('name', { required: 'Enter a name' })}
          />
          <Input
            label="Code"
            placeholder="CSE"
            required
            hint="A short code, used throughout the app"
            error={errors.code?.message}
            {...register('code', { required: 'Enter a code' })}
          />
          <Select
            label="Head of department"
            placeholder="Assign later"
            options={(teachers?.data ?? []).map((teacher) => ({
              value: teacher.id,
              label: teacher.name,
            }))}
            {...register('headId')}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this department?"
        message={
          toDelete
            ? `${toDelete.name} will be removed. Classes and subjects in it will become unassigned rather than deleted.`
            : ''
        }
        confirmLabel="Delete department"
      />
    </>
  );
}

// ══════════════════════════════ CLASSES ═══════════════════════════════════

export function AdminClasses() {
  const toast = useToast();
  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const { data, isLoading, error, refetch } = useApi(() => academicApi.classes({ scope: 'all' }), []);
  const { data: departments } = useApi(() => academicApi.departments(), []);
  const { data: teachers } = useApi(() => userApi.list({ role: 'teacher', limit: 100 }), []);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    values: editing
      ? {
          name: editing.name,
          section: editing.section,
          academicYear: editing.academic_year,
          departmentId: editing.department_id ?? '',
          classTeacherId: editing.class_teacher_id ?? '',
          room: editing.room ?? '',
        }
      : { section: 'A', academicYear: '2025-26' },
  });

  const submit = async (values) => {
    try {
      const payload = {
        ...values,
        departmentId: values.departmentId || null,
        classTeacherId: values.classTeacherId || null,
        room: values.room || null,
      };

      if (editing) {
        await academicApi.updateClass(editing.id, payload);
        toast.success('Class updated');
      } else {
        await academicApi.createClass(payload);
        toast.success('Class created');
      }
      reset({ section: 'A', academicYear: '2025-26' });
      setOpen(false);
      setEditing(null);
      refetch();
    } catch (submitError) {
      toast.error(submitError.message);
    }
  };

  const remove = async () => {
    try {
      await academicApi.deleteClass(toDelete.id);
      toast.success('Class deleted');
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Class',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {row.name} {row.section}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {row.academic_year}
            {row.room && ` · ${row.room}`}
          </p>
        </div>
      ),
    },
    {
      key: 'department_name',
      header: 'Department',
      render: (row) => row.department_name ?? <span className="text-ink-subtle">—</span>,
    },
    {
      key: 'class_teacher_name',
      header: 'Class teacher',
      hideOnMobile: true,
      render: (row) => row.class_teacher_name ?? <span className="text-ink-subtle">Unassigned</span>,
    },
    { key: 'student_count', header: 'Students', align: 'right' },
    { key: 'subject_count', header: 'Subjects', align: 'right', hideOnMobile: true },
    {
      key: 'average_attendance',
      header: 'Attendance',
      align: 'right',
      render: (row) =>
        row.average_attendance != null ? (
          <Badge tone={attendanceTone(row.average_attendance)} size="sm">
            {formatPercent(row.average_attendance)}
          </Badge>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={Pencil}
            onClick={() => { setEditing(row); setOpen(true); }}
            aria-label="Edit"
          />
          <Button
            variant="ghost"
            size="xs"
            icon={Trash2}
            onClick={() => setToDelete(row)}
            aria-label="Delete"
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Classes"
        description="Every class in the institution, with its department and class teacher."
        action={
          <Button icon={Plus} onClick={() => { setEditing(null); setOpen(true); }}>
            New class
          </Button>
        }
      />

      <Card>
        <CardHeader title={`${data?.length ?? 0} classes`} icon={School} />
        <DataTable
          className="mt-4"
          columns={columns}
          rows={data ?? []}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          emptyTitle="No classes"
          emptyMessage="Create a class to start enrolling students."
          emptyIcon={School}
          emptyAction={<Button icon={Plus} onClick={() => setOpen(true)}>New class</Button>}
        />
      </Card>

      <Modal
        isOpen={isOpen}
        onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Edit class' : 'New class'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Create class'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Name"
              placeholder="CSE Semester 3"
              containerClassName="sm:col-span-2"
              required
              error={errors.name?.message}
              {...register('name', { required: 'Enter a name' })}
            />
            <Input
              label="Section"
              placeholder="A"
              required
              error={errors.section?.message}
              {...register('section', { required: 'Enter a section' })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Academic year"
              placeholder="2025-26"
              required
              hint="Format: 2025-26"
              error={errors.academicYear?.message}
              {...register('academicYear', {
                required: 'Enter the academic year',
                pattern: { value: /^\d{4}-\d{2}$/, message: 'Use the format 2025-26' },
              })}
            />
            <Input label="Room" placeholder="B-201" {...register('room')} />
          </div>

          <Select
            label="Department"
            placeholder="Assign later"
            options={(departments ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            }))}
            {...register('departmentId')}
          />

          <Select
            label="Class teacher"
            placeholder="Assign later"
            hint="The class teacher reviews leave applications for this class"
            options={(teachers?.data ?? []).map((teacher) => ({
              value: teacher.id,
              label: teacher.name,
            }))}
            {...register('classTeacherId')}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this class?"
        message={
          toDelete
            ? `${toDelete.name} ${toDelete.section} will be removed. A class with students enrolled cannot be deleted — move them first.`
            : ''
        }
        confirmLabel="Delete class"
      />
    </>
  );
}

// ══════════════════════════════ SUBJECTS ══════════════════════════════════

export function AdminSubjects() {
  const toast = useToast();
  const [tab, setTab] = useState('subjects');
  const [isOpen, setOpen] = useState(false);
  const [isAssignOpen, setAssignOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [toUnassign, setToUnassign] = useState(null);

  const { data, isLoading, error, refetch } = useApi(() => academicApi.subjects({ scope: 'all' }), []);
  const { data: departments } = useApi(() => academicApi.departments(), []);
  const { data: assignments, refetch: refetchAssignments } = useApi(
    () => academicApi.teachingAssignments(),
    []
  );

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    values: editing
      ? {
          name: editing.name,
          code: editing.code,
          credits: editing.credits,
          departmentId: editing.department_id ?? '',
          description: editing.description ?? '',
        }
      : { credits: 4 },
  });

  const submit = async (values) => {
    try {
      const payload = { ...values, departmentId: values.departmentId || null };
      if (editing) {
        await academicApi.updateSubject(editing.id, payload);
        toast.success('Subject updated');
      } else {
        await academicApi.createSubject(payload);
        toast.success('Subject created');
      }
      reset({ credits: 4 });
      setOpen(false);
      setEditing(null);
      refetch();
    } catch (submitError) {
      toast.error(submitError.message);
    }
  };

  const remove = async () => {
    try {
      await academicApi.deleteSubject(toDelete.id);
      toast.success('Subject deleted');
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  const unassign = async () => {
    try {
      await academicApi.unassignTeacher(toUnassign.id);
      toast.success('Assignment removed');
      setToUnassign(null);
      refetchAssignments();
    } catch (unassignError) {
      toast.error(unassignError.message);
    }
  };

  const subjectColumns = [
    {
      key: 'name',
      header: 'Subject',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.code}</p>
        </div>
      ),
    },
    {
      key: 'department_name',
      header: 'Department',
      render: (row) => row.department_name ?? <span className="text-ink-subtle">—</span>,
    },
    { key: 'credits', header: 'Credits', align: 'right' },
    {
      key: 'assignment_count',
      header: 'Assigned to',
      align: 'right',
      render: (row) => `${row.assignment_count} class(es)`,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={Pencil}
            onClick={() => { setEditing(row); setOpen(true); }}
            aria-label="Edit"
          />
          <Button
            variant="ghost"
            size="xs"
            icon={Trash2}
            onClick={() => setToDelete(row)}
            aria-label="Delete"
          />
        </div>
      ),
    },
  ];

  const assignmentColumns = [
    {
      key: 'teacher_name',
      header: 'Teacher',
      primary: true,
      render: (row) => <span className="font-medium text-ink">{row.teacher_name}</span>,
    },
    {
      key: 'subject_name',
      header: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.subject_name}</p>
          <p className="truncate text-xs text-ink-muted">{row.subject_code}</p>
        </div>
      ),
    },
    {
      key: 'class_name',
      header: 'Class',
      render: (row) => `${row.class_name} ${row.section}`,
    },
    { key: 'academic_year', header: 'Year', hideOnMobile: true },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="xs"
          icon={Trash2}
          onClick={() => setToUnassign(row)}
          aria-label="Remove assignment"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects offered, and which teacher takes each one in each class."
        action={
          tab === 'subjects' ? (
            <Button icon={Plus} onClick={() => { setEditing(null); setOpen(true); }}>
              New subject
            </Button>
          ) : (
            <Button icon={UserPlus} onClick={() => setAssignOpen(true)}>
              Assign a teacher
            </Button>
          )
        }
      />

      <Tabs
        tabs={[
          { value: 'subjects', label: 'Subjects', count: data?.length },
          { value: 'assignments', label: 'Teaching assignments', count: assignments?.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'subjects' ? (
        <Card>
          <CardHeader title={`${data?.length ?? 0} subjects`} icon={BookMarked} />
          <DataTable
            className="mt-4"
            columns={subjectColumns}
            rows={data ?? []}
            isLoading={isLoading}
            error={error}
            onRetry={refetch}
            emptyTitle="No subjects"
            emptyIcon={BookMarked}
            emptyAction={<Button icon={Plus} onClick={() => setOpen(true)}>New subject</Button>}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Who teaches what"
            subtitle="A teacher can only mark attendance and enter marks for classes assigned here"
            icon={Link2}
          />
          <DataTable
            className="mt-4"
            columns={assignmentColumns}
            rows={assignments ?? []}
            emptyTitle="No teaching assignments"
            emptyMessage="Assign teachers to subjects and classes so they can mark attendance and enter marks."
            emptyIcon={Link2}
            emptyAction={
              <Button icon={UserPlus} onClick={() => setAssignOpen(true)}>
                Assign a teacher
              </Button>
            }
          />
        </Card>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Edit subject' : 'New subject'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Create subject'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Input
            label="Name"
            placeholder="Data Structures & Algorithms"
            required
            error={errors.name?.message}
            {...register('name', { required: 'Enter a name' })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Code"
              placeholder="CS201"
              required
              error={errors.code?.message}
              {...register('code', { required: 'Enter a code' })}
            />
            <Input
              label="Credits"
              type="number"
              step="0.5"
              min="0.5"
              required
              hint="Used to weight the CGPA"
              error={errors.credits?.message}
              {...register('credits', { required: 'Enter the credits' })}
            />
          </div>

          <Select
            label="Department"
            placeholder="Assign later"
            options={(departments ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            }))}
            {...register('departmentId')}
          />

          <Input label="Description" {...register('description')} />
        </form>
      </Modal>

      <AssignTeacherModal
        isOpen={isAssignOpen}
        onClose={() => setAssignOpen(false)}
        subjects={data}
        onAssigned={() => {
          setAssignOpen(false);
          refetchAssignments();
          refetch();
          setTab('assignments');
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this subject?"
        message={
          toDelete
            ? `${toDelete.name} will be removed along with its assessments, attendance records and assignments. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete subject"
      />

      <ConfirmDialog
        isOpen={Boolean(toUnassign)}
        onClose={() => setToUnassign(null)}
        onConfirm={unassign}
        title="Remove this teaching assignment?"
        message={
          toUnassign
            ? `${toUnassign.teacher_name} will no longer be able to mark attendance or enter marks for ${toUnassign.subject_name} in ${toUnassign.class_name} ${toUnassign.section}.`
            : ''
        }
        confirmLabel="Remove assignment"
      />
    </>
  );
}

function AssignTeacherModal({ isOpen, onClose, subjects, onAssigned }) {
  const toast = useToast();

  const { data: teachers } = useApi(() => userApi.list({ role: 'teacher', limit: 100 }), []);
  const { data: classes } = useApi(() => academicApi.classes({ scope: 'all' }), []);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { academicYear: '2025-26' },
  });

  const submit = async (values) => {
    try {
      await academicApi.assignTeacher(values);
      toast.success('Teacher assigned');
      reset({ academicYear: '2025-26' });
      onAssigned();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign a teacher"
      description="This is what gives a teacher access to a class's attendance and marks."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting} icon={UserPlus}>
            Assign
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Select
          label="Teacher"
          required
          placeholder="Select a teacher"
          error={errors.teacherId?.message}
          options={(teachers?.data ?? []).map((teacher) => ({
            value: teacher.id,
            label: `${teacher.name}${teacher.departmentName ? ` — ${teacher.departmentName}` : ''}`,
          }))}
          {...register('teacherId', { required: 'Choose a teacher' })}
        />

        <Select
          label="Subject"
          required
          placeholder="Select a subject"
          error={errors.subjectId?.message}
          options={(subjects ?? []).map((subject) => ({
            value: subject.id,
            label: `${subject.name} (${subject.code})`,
          }))}
          {...register('subjectId', { required: 'Choose a subject' })}
        />

        <Select
          label="Class"
          required
          placeholder="Select a class"
          error={errors.classId?.message}
          options={(classes ?? []).map((classRow) => ({
            value: classRow.id,
            label: `${classRow.name} ${classRow.section}`,
          }))}
          {...register('classId', { required: 'Choose a class' })}
        />

        <Input
          label="Academic year"
          required
          hint="Format: 2025-26"
          error={errors.academicYear?.message}
          {...register('academicYear', {
            required: 'Enter the academic year',
            pattern: { value: /^\d{4}-\d{2}$/, message: 'Use the format 2025-26' },
          })}
        />

        <Callout tone="info">
          <p className="text-xs">
            Assigning a teacher also adds the subject to the class’s curriculum, so students see it in
            their subject list.
          </p>
        </Callout>
      </form>
    </Modal>
  );
}

export default AdminClasses;
