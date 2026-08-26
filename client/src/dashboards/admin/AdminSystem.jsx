import { useEffect, useState } from 'react';
import {
  KeyRound,
  Settings,
  ScrollText,
  Server,
  Shield,
  Save,
  RefreshCw,
  Database,
} from 'lucide-react';
import { adminApi, userApi } from '../../services/endpoints.js';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Select,
  SearchInput,
  Button,
  Badge,
  Avatar,
  Toggle,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Callout,
  Modal,
} from '../../components/ui/index.js';
import { formatDateTime, formatRelative, humanise } from '../../utils/format.js';

import { ROLE_LABELS } from '../../layouts/navigation.js';
import { cn } from '../../utils/cn.js';

/** Permissions, settings and the audit trail (§30, §40). */

// ═══════════════════════════ PERMISSIONS ══════════════════════════════════

export function AdminPermissions() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [pending, setPending] = useState({});
  const [isSaving, setSaving] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const { data: users, isLoading } = useApi(
    () => userApi.list({ limit: 30, role: role || undefined, search: debouncedSearch || undefined }),
    [role, debouncedSearch]
  );

  const {
    data: userPermissions,
    isLoading: permissionsLoading,
    refetch: refetchPermissions,
  } = useApi(
    () => (selectedUser ? adminApi.userPermissions(selectedUser.id) : Promise.resolve(null)),
    [selectedUser?.id]
  );

  // Reset the pending edits whenever a different user is opened.
  useEffect(() => {
    setPending({});
  }, [selectedUser?.id]);

  const toggle = (code, granted) =>
    setPending((current) => ({ ...current, [code]: granted }));

  const save = async () => {
    const changes = Object.entries(pending).map(([code, granted]) => ({ code, granted }));
    if (!changes.length) return;

    setSaving(true);
    try {
      await adminApi.updatePermissions(selectedUser.id, changes);
      toast.success(`Permissions updated for ${selectedUser.name}`);
      setPending({});
      refetchPermissions();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const byCategory = (userPermissions?.permissions ?? []).reduce((acc, permission) => {
    (acc[permission.category] ??= []).push(permission);
    return acc;
  }, {});

  const pendingCount = Object.keys(pending).length;

  return (
    <>
      <PageHeader
        title="Permissions"
        description="Role defaults with per-user overrides where someone needs more or less."
      />

      <Callout tone="info" icon={Shield} title="How permissions work" className="mb-6">
        <p className="text-sm leading-relaxed">
          Each role carries a baseline set of permissions. An override grants or revokes one
          permission for one person without changing the role. Permissions layer on top of role
          checks — they can narrow what someone can do, never widen it beyond what their role allows.
        </p>
      </Callout>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* User picker */}
        <Card className="lg:sticky lg:top-24 lg:self-start">
          <CardHeader title="Choose a user" icon={KeyRound} />

          <div className="mt-4 space-y-3">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or e-mail…"
            />
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="All roles"
              options={[
                { value: 'admin', label: 'Administrators' },
                { value: 'teacher', label: 'Teachers' },
                { value: 'student', label: 'Students' },
                { value: 'parent', label: 'Parents' },
              ]}
            />
          </div>

          <div className="scrollbar-slim mt-4 max-h-[26rem] space-y-1 overflow-y-auto">
            {isLoading ? (
              <LoadingSkeleton count={5} height="h-12" />
            ) : !users?.data?.length ? (
              <p className="py-6 text-center text-sm text-ink-muted">No users matched</p>
            ) : (
              users.data.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedUser(candidate)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                    selectedUser?.id === candidate.id
                      ? 'bg-brand-50 dark:bg-brand-950/40'
                      : 'hover:bg-surface-sunken'
                  )}
                >
                  <Avatar name={candidate.name} src={candidate.avatarUrl} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {candidate.name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">{candidate.email}</span>
                  </span>
                  <Badge tone="neutral" size="sm">
                    {candidate.role}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Permission grid */}
        <div className="lg:col-span-2">
          {!selectedUser ? (
            <EmptyState
              icon={KeyRound}
              title="Select a user"
              message="Choose someone from the list to review and adjust their permissions."
            />
          ) : (
            <Card>
              <CardHeader
                title={selectedUser.name}
                subtitle={`${ROLE_LABELS[selectedUser.role]} · ${selectedUser.email}`}
                icon={Shield}
                action={
                  pendingCount > 0 && (
                    <Button size="sm" icon={Save} onClick={save} isLoading={isSaving}>
                      Save {pendingCount} change{pendingCount === 1 ? '' : 's'}
                    </Button>
                  )
                }
              />

              <div className="mt-5 space-y-6">
                {permissionsLoading ? (
                  <LoadingSkeleton count={6} height="h-14" />
                ) : (
                  Object.entries(byCategory).map(([category, permissions]) => (
                    <section key={category}>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                        {humanise(category)}
                      </h3>

                      <div className="space-y-3.5">
                        {permissions.map((permission) => {
                          const value = pending[permission.code] ?? permission.effective;
                          const isOverridden =
                            permission.override !== null && permission.override !== undefined;

                          return (
                            <div key={permission.code} className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <Toggle
                                  ariaLabel={permission.label}
                                  label={
                                    <span className="flex items-center gap-2">
                                      {permission.label}
                                      {isOverridden && (
                                        <Badge tone="warning" size="sm">
                                          Override
                                        </Badge>
                                      )}
                                      {pending[permission.code] !== undefined && (
                                        <Badge tone="brand" size="sm">
                                          Unsaved
                                        </Badge>
                                      )}
                                    </span>
                                  }
                                  description={permission.description}
                                  checked={value}
                                  onChange={(next) => toggle(permission.code, next)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>

              {pendingCount > 0 && (
                <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
                  <Button variant="secondary" onClick={() => setPending({})}>
                    Discard changes
                  </Button>
                  <Button icon={Save} onClick={save} isLoading={isSaving}>
                    Save changes
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

// ════════════════════════════ SETTINGS ════════════════════════════════════

export function AdminSettings() {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [isSaving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useApi(() => adminApi.settings(), []);
  const { data: system, refetch: refetchSystem } = useApi(() => adminApi.system(), []);

  const openSetting = (setting) => {
    setEditing(setting);
    setValue(JSON.stringify(setting.value, null, 2));
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateSetting(editing.key, { value: JSON.parse(value) });
      toast.success('Setting saved');
      setEditing(null);
      refetch();
    } catch (saveError) {
      toast.error(
        saveError instanceof SyntaxError
          ? 'That is not valid JSON — check the quotes and brackets.'
          : saveError.message
      );
    } finally {
      setSaving(false);
    }
  };

  const recalculate = async () => {
    try {
      const result = await adminApi.recalculateFees();
      toast.success(`${result.updated} fee record(s) reclassified`);
    } catch (recalcError) {
      toast.error(recalcError.message);
    }
  };

  const runtime = data?.runtime ?? {};

  return (
    <>
      <PageHeader
        title="Settings"
        description="Institution-wide configuration and system status."
        action={
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => {
              refetch();
              refetchSystem();
            }}
          >
            Refresh
          </Button>
        }
      />

      {/* Runtime status */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Environment"
          value={runtime.environment ?? '—'}
          icon={Server}
          tone={runtime.environment === 'production' ? 'danger' : 'info'}
        />
        <StatCard
          label="AI provider"
          value={runtime.aiProvider ?? '—'}
          icon={Settings}
          tone={runtime.aiConfigured ? 'success' : 'warning'}
          hint={runtime.aiConfigured ? 'Configured' : 'No API key — using the built-in assistant'}
        />
        <StatCard
          label="Payments"
          value={runtime.paymentsConfigured ? 'Razorpay' : 'Mock mode'}
          icon={Database}
          tone={runtime.paymentsConfigured ? 'success' : 'warning'}
        />
        <StatCard
          label="Database"
          value={system?.database?.connected ? 'Connected' : 'Unavailable'}
          icon={Database}
          tone={system?.database?.connected ? 'success' : 'danger'}
          hint={system?.database?.latencyMs ? `${system.database.latencyMs}ms` : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Institution settings"
            subtitle="Values the application reads at runtime"
            icon={Settings}
          />

          <div className="mt-5">
            {error ? (
              <ErrorState error={error} onRetry={refetch} compact />
            ) : isLoading ? (
              <LoadingSkeleton count={5} height="h-16" />
            ) : (
              <ul className="divide-y divide-line">
                {(data?.settings ?? []).map((setting) => (
                  <li key={setting.key} className="flex flex-wrap items-start gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium text-ink">{setting.key}</p>
                      {setting.description && (
                        <p className="mt-0.5 text-xs text-ink-muted">{setting.description}</p>
                      )}
                      <code className="mt-1.5 block max-w-full overflow-x-auto rounded bg-surface-sunken px-2 py-1 font-mono text-[11px] text-ink-muted scrollbar-slim">
                        {JSON.stringify(setting.value)}
                      </code>
                      {setting.updated_by_name && (
                        <p className="mt-1 text-[10px] text-ink-subtle">
                          Last changed by {setting.updated_by_name}{' '}
                          {formatRelative(setting.updated_at)}
                        </p>
                      )}
                    </div>

                    <Button variant="secondary" size="xs" onClick={() => openSetting(setting)}>
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="System" icon={Server} />
            <dl className="mt-4 space-y-2.5 text-sm">
              {[
                { label: 'Node version', value: system?.nodeVersion },
                {
                  label: 'Uptime',
                  value: system?.uptimeSeconds
                    ? `${Math.floor(system.uptimeSeconds / 3600)}h ${Math.floor((system.uptimeSeconds % 3600) / 60)}m`
                    : '—',
                },
                { label: 'Database', value: system?.database?.database },
                { label: 'Vector store', value: runtime.vectorProvider },
                { label: 'File storage', value: runtime.storageDriver },
                { label: 'Attendance threshold', value: `${runtime.attendanceThreshold}%` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{item.label}</dt>
                  <dd className="truncate font-medium text-ink">{item.value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Record counts" icon={Database} />
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {Object.entries(system?.counts ?? {}).map(([key, count]) => (
                <div key={key} className="rounded-lg bg-surface-sunken p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">
                    {humanise(key)}
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink">{count}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Maintenance" icon={RefreshCw} />
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Recalculate fee statuses so records past their due date are correctly flagged as
              overdue.
            </p>
            <Button variant="secondary" fullWidth icon={RefreshCw} onClick={recalculate} className="mt-4">
              Recalculate fee statuses
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.key ?? ''}
        description={editing?.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} isLoading={isSaving} icon={Save}>
              Save setting
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label htmlFor="setting-value" className="block text-sm font-medium text-ink">
            Value (JSON)
          </label>
          <textarea
            id="setting-value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full rounded-xl border border-line bg-surface-sunken p-3 font-mono text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="text-xs text-ink-muted">
            Must be valid JSON. Strings need quotes: <code>&quot;2025-26&quot;</code>. Numbers and
            booleans do not.
          </p>
        </div>
      </Modal>
    </>
  );
}

// ═══════════════════════════ AUDIT LOGS ═══════════════════════════════════

export function AdminAuditLogs() {
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search, 300);

  const { data, isLoading, error, refetch } = useApi(
    () =>
      adminApi.auditLogs({
        page,
        limit: 25,
        action: action || undefined,
        search: debouncedSearch || undefined,
      }),
    [page, action, debouncedSearch]
  );

  const { data: actions } = useApi(() => adminApi.auditActions(), []);

  const columns = [
    {
      key: 'created_at',
      header: 'When',
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{formatRelative(row.createdAt)}</p>
          <p className="truncate text-xs text-ink-subtle">{formatDateTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Who',
      render: (row) =>
        row.user ? (
          <div className="flex items-center gap-2">
            <Avatar name={row.user.name} size="xs" />
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{row.user.name}</p>
              <p className="truncate text-xs text-ink-subtle">{row.user.role}</p>
            </div>
          </div>
        ) : (
          <span className="text-xs text-ink-subtle">System</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge
          tone={
            row.action.startsWith('auth.login_failed')
              ? 'danger'
              : row.action.startsWith('auth')
                ? 'info'
                : row.action.includes('deleted')
                  ? 'danger'
                  : row.action.includes('published') || row.action.includes('created')
                    ? 'success'
                    : 'neutral'
          }
          size="sm"
        >
          {row.action}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      hideOnMobile: true,
      render: (row) => row.entity ?? <span className="text-ink-subtle">—</span>,
    },
    {
      key: 'metadata',
      header: 'Details',
      hideOnMobile: true,
      render: (row) => {
        const entries = Object.entries(row.metadata ?? {}).slice(0, 2);
        if (!entries.length) return <span className="text-ink-subtle">—</span>;
        return (
          <span className="text-xs text-ink-muted">
            {entries
              .map(([key, value]) => `${key}: ${typeof value === 'object' ? '…' : value}`)
              .join(', ')}
          </span>
        );
      },
    },
    {
      key: 'ipAddress',
      header: 'IP',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-ink-subtle">{row.ipAddress ?? '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every sensitive action — sign-ins, permission changes, marks and attendance edits."
      />

      <Card>
        <CardHeader
          title={`${data?.meta?.pagination?.totalItems ?? 0} entries`}
          icon={ScrollText}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,16rem]">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by user or action…"
          />
          <Select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            placeholder="All actions"
            options={(actions ?? []).map((entry) => ({
              value: entry.action,
              label: `${entry.action} (${entry.count})`,
            }))}
          />
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
          compact
          emptyTitle="No audit entries"
          emptyMessage="Sensitive actions are recorded here as they happen."
          emptyIcon={ScrollText}
        />
      </Card>
    </>
  );
}

export default AdminSettings;
