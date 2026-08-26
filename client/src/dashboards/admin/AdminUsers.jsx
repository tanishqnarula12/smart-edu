import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  UserCog,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Link2,
  Copy,
  Check,
  Ban,
  CircleCheck,
  Users,
} from 'lucide-react';
import { userApi, academicApi } from '../../services/endpoints.js';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  DataTable,
  SearchInput,
  Select,
  Button,
  Modal,
  Input,
  Badge,
  Avatar,
  ConfirmDialog,
  Tabs,
  Callout,
  PasswordInput,
} from '../../components/ui/index.js';
import { formatRelative, humanise } from '../../utils/format.js';
import { ROLE_LABELS } from '../../layouts/navigation.js';

/** Admin user management (§29). */
export function AdminUsers({ fixedRole, title, description }) {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState(fixedRole ?? '');
  const [status, setStatus] = useState('active');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState(null);

  const debouncedSearch = useDebounced(search, 300);

  const { data: classes } = useApi(() => academicApi.classes(), []);

  const { data, isLoading, error, refetch } = useApi(
    () =>
      userApi.list({
        page,
        limit: 20,
        role: (fixedRole ?? role) || undefined,
        status,
        classId: classId || undefined,
        search: debouncedSearch || undefined,
      }),
    [page, role, status, classId, debouncedSearch, fixedRole]
  );

  const toggleActive = async (target) => {
    try {
      await userApi.update(target.id, { isActive: !target.isActive });
      toast.success(target.isActive ? `${target.name} deactivated` : `${target.name} reactivated`);
      refetch();
    } catch (updateError) {
      toast.error(updateError.message);
    }
  };

  const remove = async () => {
    try {
      await userApi.remove(toDelete.id);
      toast.success(`${toDelete.name}'s account deleted`);
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'User',
      primary: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} src={row.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <Badge
          tone={
            row.role === 'admin'
              ? 'danger'
              : row.role === 'teacher'
                ? 'brand'
                : row.role === 'parent'
                  ? 'info'
                  : 'neutral'
          }
          size="sm"
        >
          {ROLE_LABELS[row.role]}
        </Badge>
      ),
    },
    {
      key: 'identifier',
      header: 'ID',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs text-ink-muted">
          {row.studentId ?? row.employeeId ?? '—'}
        </span>
      ),
    },
    {
      key: 'context',
      header: 'Class / Department',
      hideOnMobile: true,
      render: (row) => row.className ?? row.departmentName ?? <span className="text-ink-subtle">—</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.isActive ? 'success' : 'neutral'} size="sm" dot>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last seen',
      hideOnMobile: true,
      render: (row) =>
        row.lastLoginAt ? (
          <span className="text-xs text-ink-muted">{formatRelative(row.lastLoginAt)}</span>
        ) : (
          <span className="text-xs text-ink-subtle">Never</span>
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
            onClick={() => setEditing(row)}
            aria-label={`Edit ${row.name}`}
          />
          <Button
            variant="ghost"
            size="xs"
            icon={KeyRound}
            onClick={() => setResetting(row)}
            aria-label={`Reset password for ${row.name}`}
          />
          <Button
            variant="ghost"
            size="xs"
            icon={row.isActive ? Ban : CircleCheck}
            onClick={() => toggleActive(row)}
            disabled={row.id === currentUser?.id}
            aria-label={row.isActive ? `Deactivate ${row.name}` : `Reactivate ${row.name}`}
          />
          <Button
            variant="ghost"
            size="xs"
            icon={Trash2}
            onClick={() => setToDelete(row)}
            disabled={row.id === currentUser?.id}
            aria-label={`Delete ${row.name}`}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={title ?? 'Users'}
        description={description ?? 'Create, edit and manage every account in the institution.'}
        action={
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            New user
          </Button>
        }
      />

      <Card>
        <CardHeader
          title={`${data?.meta?.pagination?.totalItems ?? 0} accounts`}
          icon={UserCog}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name, e-mail or ID…"
            className="lg:col-span-2"
          />

          {!fixedRole && (
            <Select
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              placeholder="All roles"
              options={[
                { value: 'student', label: 'Students' },
                { value: 'teacher', label: 'Teachers' },
                { value: 'parent', label: 'Parents' },
                { value: 'admin', label: 'Administrators' },
              ]}
            />
          )}

          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={[
              { value: 'active', label: 'Active only' },
              { value: 'inactive', label: 'Inactive only' },
              { value: 'all', label: 'All statuses' },
            ]}
          />

          {(fixedRole === 'student' || role === 'student') && (
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
          )}
        </div>

        <DataTable
          className="mt-5"
          columns={columns}
          rows={data?.data ?? []}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          pagination={data?.meta?.pagination}
          onPageChange={setPage}
          emptyTitle="No users found"
          emptyMessage="Adjust the filters, or create a new account."
          emptyIcon={Users}
          emptyAction={
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>
              New user
            </Button>
          }
        />
      </Card>

      <UserFormModal
        isOpen={isCreateOpen || Boolean(editing)}
        user={editing}
        fixedRole={fixedRole}
        classes={classes}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={(result) => {
          setCreateOpen(false);
          setEditing(null);
          refetch();
          if (result?.temporaryPassword) setTemporaryPassword(result);
        }}
      />

      <ResetPasswordModal
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={() => {
          setResetting(null);
          refetch();
        }}
      />

      <TemporaryPasswordModal
        result={temporaryPassword}
        onClose={() => setTemporaryPassword(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this account?"
        message={
          toDelete
            ? `${toDelete.name}'s account and all associated records — attendance, marks, submissions — will be permanently deleted. Consider deactivating instead if you only want to revoke access.`
            : ''
        }
        confirmLabel="Delete permanently"
      />
    </>
  );
}

function UserFormModal({ isOpen, user, fixedRole, classes, onClose, onSaved }) {
  const toast = useToast();
  const isEditing = Boolean(user);

  const { data: departments } = useApi(() => academicApi.departments(), []);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    values: user
      ? {
          name: user.name,
          email: user.email,
          phone: user.phone ?? '',
          role: user.role,
          classId: user.classId ?? '',
          rollNumber: user.rollNumber ?? '',
          designation: user.designation ?? '',
        }
      : { role: fixedRole ?? 'student' },
  });

  const selectedRole = watch('role');

  const submit = async (values) => {
    try {
      // Strip empty optional fields so the server does not try to null them out.
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== '' && value !== undefined)
      );

      if (isEditing) {
        // Role is immutable after creation — the server rejects a change too.
        delete payload.role;
        await userApi.update(user.id, payload);
        toast.success('User updated');
        onSaved();
      } else {
        const result = await userApi.create(payload);
        toast.success('Account created');
        reset({ role: fixedRole ?? 'student' });
        onSaved(result);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit ${user.name}` : 'Create an account'}
      description={
        isEditing
          ? 'Update this account. A role cannot be changed after creation.'
          : 'A temporary password is generated unless you set one.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            required
            error={errors.name?.message}
            {...register('name', { required: 'Enter a name' })}
          />
          <Input
            label="E-mail address"
            type="email"
            required
            error={errors.email?.message}
            {...register('email', {
              required: 'Enter an e-mail address',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid e-mail address' },
            })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Role"
            required
            disabled={isEditing || Boolean(fixedRole)}
            hint={isEditing ? 'Roles cannot be changed after creation' : undefined}
            options={[
              { value: 'student', label: 'Student' },
              { value: 'teacher', label: 'Teacher' },
              { value: 'parent', label: 'Parent' },
              { value: 'admin', label: 'Administrator' },
            ]}
            {...register('role', { required: true })}
          />
          <Input label="Phone number" type="tel" {...register('phone')} />
        </div>

        {selectedRole === 'student' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Class"
              placeholder="Assign later"
              options={(classes ?? []).map((classRow) => ({
                value: classRow.id,
                label: `${classRow.name} ${classRow.section}`,
              }))}
              {...register('classId')}
            />
            <Input label="Roll number" placeholder="A07" {...register('rollNumber')} />
          </div>
        )}

        {selectedRole === 'teacher' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Department"
              placeholder="Assign later"
              options={(departments ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
              {...register('departmentId')}
            />
            <Input
              label="Designation"
              placeholder="Assistant Professor"
              {...register('designation')}
            />
          </div>
        )}

        {selectedRole === 'parent' && (
          <Input label="Occupation" {...register('occupation')} />
        )}

        {!isEditing && (
          <>
            <PasswordInput
              label="Password"
              hint="Leave empty to generate a temporary password automatically"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password', {
                minLength: { value: 8, message: 'At least 8 characters' },
              })}
            />

            <Callout tone="info">
              <p className="text-xs">
                {selectedRole === 'parent'
                  ? 'After creating this account, link it to a student from the parent links page. The student then controls what the parent can see.'
                  : selectedRole === 'teacher'
                    ? 'After creating this account, assign the teacher to subjects and classes from the Subjects page.'
                    : 'A student ID is generated automatically. You can assign a class now or later.'}
              </p>
            </Callout>
          </>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();

  const submit = async (values) => {
    try {
      await userApi.resetPassword(user.id, values.newPassword);
      toast.success(`Password reset for ${user.name}. They have been signed out everywhere.`);
      reset();
      onDone();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={Boolean(user)}
      onClose={onClose}
      title="Reset password"
      description={user ? `Set a new password for ${user.name}.` : ''}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting} icon={KeyRound}>
            Reset password
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          required
          error={errors.newPassword?.message}
          {...register('newPassword', {
            required: 'Enter a new password',
            minLength: { value: 8, message: 'At least 8 characters' },
          })}
        />

        <Callout tone="warning">
          <p className="text-xs">
            The user is signed out of every device and notified. Share the new password with them
            through a channel you trust.
          </p>
        </Callout>
      </form>
    </Modal>
  );
}

/** Shows a generated password once — it is never stored in clear anywhere. */
function TemporaryPasswordModal({ result, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={Boolean(result?.temporaryPassword)}
      onClose={onClose}
      title="Account created"
      description="Share these credentials with the new user."
      size="sm"
      closeOnBackdrop={false}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-sunken p-4">
          <p className="text-xs text-ink-muted">E-mail</p>
          <p className="font-mono text-sm font-medium text-ink">{result?.user?.email}</p>
        </div>

        <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-4 dark:bg-brand-950/40">
          <p className="text-xs text-brand-700 dark:text-brand-300">Temporary password</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 font-mono text-base font-bold tracking-wide text-brand-700 dark:text-brand-300">
              {result?.temporaryPassword}
            </code>
            <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <Callout tone="warning">
          <p className="text-xs">
            This password is shown once and is not stored anywhere in readable form. Ask the user to
            change it after their first sign-in.
          </p>
        </Callout>
      </div>
    </Modal>
  );
}

/** /admin/parents — the roster plus the parent↔student link manager. */
export function AdminParents() {
  const toast = useToast();
  const [tab, setTab] = useState('accounts');
  const [isLinkOpen, setLinkOpen] = useState(false);
  const [toUnlink, setToUnlink] = useState(null);

  const { data: links, isLoading, refetch } = useApi(() => userApi.parentLinks(), []);

  const unlink = async () => {
    try {
      await userApi.unlinkParent(toUnlink.id);
      toast.success('Link removed');
      setToUnlink(null);
      refetch();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const columns = [
    {
      key: 'parent_name',
      header: 'Parent',
      primary: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.parent_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.parent_name}</p>
            <p className="truncate text-xs text-ink-muted">{row.parent_email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'student_name',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.student_name}</p>
          <p className="truncate text-xs text-ink-muted">
            {row.admission_number}
            {row.class_name && ` · ${row.class_name} ${row.section}`}
          </p>
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Relationship',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge tone="neutral" size="sm">
            {humanise(row.relationship)}
          </Badge>
          {row.is_primary && (
            <Badge tone="brand" size="sm">
              Primary
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'parent_permission_enabled',
      header: 'Student sharing',
      hideOnMobile: true,
      render: (row) => (
        <Badge tone={row.parent_permission_enabled ? 'success' : 'warning'} size="sm">
          {row.parent_permission_enabled ? 'Enabled' : 'Turned off'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="xs"
          icon={Trash2}
          onClick={() => setToUnlink(row)}
          aria-label="Remove link"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Parents"
        description="Parent accounts and their links to students."
        action={
          tab === 'links' && (
            <Button icon={Link2} onClick={() => setLinkOpen(true)}>
              Link a parent
            </Button>
          )
        }
      />

      <Tabs
        tabs={[
          { value: 'accounts', label: 'Accounts' },
          { value: 'links', label: 'Parent links', count: links?.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'accounts' ? (
        <AdminUsers fixedRole="parent" title="" description="" />
      ) : (
        <Card>
          <CardHeader
            title="Parent–student links"
            subtitle="Students control what each linked parent can actually see"
            icon={Link2}
          />

          <Callout tone="info" className="mt-4">
            <p className="text-xs">
              Linking a parent gives them an account relationship, not automatic access. Each student
              decides which categories their parents can view from their own privacy page.
            </p>
          </Callout>

          <DataTable
            className="mt-5"
            columns={columns}
            rows={links ?? []}
            isLoading={isLoading}
            emptyTitle="No links yet"
            emptyMessage="Link a parent account to a student to get started."
            emptyIcon={Link2}
            emptyAction={
              <Button icon={Link2} onClick={() => setLinkOpen(true)}>
                Link a parent
              </Button>
            }
          />
        </Card>
      )}

      <LinkParentModal
        isOpen={isLinkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={() => {
          setLinkOpen(false);
          refetch();
          setTab('links');
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(toUnlink)}
        onClose={() => setToUnlink(null)}
        onConfirm={unlink}
        title="Remove this link?"
        message={
          toUnlink
            ? `${toUnlink.parent_name} will no longer be linked to ${toUnlink.student_name} and will lose all access to their records.`
            : ''
        }
        confirmLabel="Remove link"
      />
    </>
  );
}

function LinkParentModal({ isOpen, onClose, onLinked }) {
  const toast = useToast();

  const { data: parents } = useApi(() => userApi.list({ role: 'parent', limit: 100 }), []);
  const { data: students } = useApi(() => userApi.list({ role: 'student', limit: 100 }), []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { relationship: 'guardian' } });

  const submit = async (values) => {
    try {
      await userApi.linkParent(values);
      toast.success('Parent linked');
      reset({ relationship: 'guardian' });
      onLinked();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link a parent to a student"
      description="The student will be notified and can control what the parent sees."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting} icon={Link2}>
            Create link
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Select
          label="Parent account"
          required
          placeholder="Select a parent"
          error={errors.parentId?.message}
          options={(parents?.data ?? []).map((parent) => ({
            value: parent.id,
            label: `${parent.name} (${parent.email})`,
          }))}
          {...register('parentId', { required: 'Choose a parent' })}
        />

        <Select
          label="Student"
          required
          placeholder="Select a student"
          error={errors.studentId?.message}
          options={(students?.data ?? []).map((student) => ({
            value: student.id,
            label: `${student.name}${student.className ? ` — ${student.className}` : ''}`,
          }))}
          {...register('studentId', { required: 'Choose a student' })}
        />

        <Select
          label="Relationship"
          options={[
            { value: 'father', label: 'Father' },
            { value: 'mother', label: 'Mother' },
            { value: 'guardian', label: 'Guardian' },
            { value: 'other', label: 'Other' },
          ]}
          {...register('relationship')}
        />

        <Callout tone="info">
          <p className="text-xs">
            By default the student shares everything with a newly linked parent. They can narrow that
            at any time from their privacy page — and only they can.
          </p>
        </Callout>
      </form>
    </Modal>
  );
}

export default AdminUsers;
