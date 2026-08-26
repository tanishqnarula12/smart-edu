import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldOff,
  UserMinus,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';
import { privacyApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  Toggle,
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Callout,
  ConfirmDialog,
  LoadingSkeleton,
} from '../../components/ui/index.js';
import { cn } from '../../utils/cn.js';

/**
 * Privacy centre (§38).
 *
 * These settings belong to the student and nobody else can change them — not a
 * parent, not a teacher, not an administrator. The page says so, because a
 * control is only meaningful if the person using it knows it is theirs.
 *
 * Toggles apply optimistically and roll back if the request fails.
 */
export function StudentPrivacy() {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useApi(() => privacyApi.get(), []);

  const [masterEnabled, setMasterEnabled] = useState(true);
  const [parents, setParents] = useState([]);
  const [toUnlink, setToUnlink] = useState(null);
  const [isUnlinking, setUnlinking] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMasterEnabled(data.parentPermissionEnabled);
    setParents(data.parents ?? []);
  }, [data]);

  const toggleMaster = async (next) => {
    const previous = masterEnabled;
    setMasterEnabled(next);

    try {
      await privacyApi.update({ parentPermissionEnabled: next });
      toast.success(
        next ? 'Parent access enabled' : 'Parent access turned off — no parent can see your records'
      );
    } catch (updateError) {
      setMasterEnabled(previous);
      toast.error(updateError.message);
    }
  };

  const toggleScope = async (parentId, key, next) => {
    const previous = parents;
    setParents((current) =>
      current.map((parent) =>
        parent.parentId === parentId
          ? { ...parent, permissions: { ...parent.permissions, [key]: next } }
          : parent
      )
    );

    try {
      await privacyApi.update({ parentId, [key]: next });
    } catch (updateError) {
      setParents(previous);
      toast.error(updateError.message);
    }
  };

  const unlink = async () => {
    setUnlinking(true);
    try {
      await privacyApi.unlinkParent(toUnlink.parentId);
      toast.success(`${toUnlink.parentName} no longer has access to your records`);
      setToUnlink(null);
      refetch();
    } catch (unlinkError) {
      toast.error(unlinkError.message);
    } finally {
      setUnlinking(false);
    }
  };

  if (error) {
    return (
      <>
        <PageHeader title="Privacy" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const scopes = data?.scopes ?? [];

  return (
    <>
      <PageHeader
        title="Privacy"
        description="You decide what your parents can see. These controls are yours alone."
      />

      <Callout tone="info" icon={Info} title="How this works" className="mb-6">
        <p className="text-sm leading-relaxed">
          Your parents only see a category when you have shared it. Turning something off hides it
          from their dashboard immediately — including from the AI assistant, which cannot answer
          questions about data you have withheld. Nobody but you can change these settings.
        </p>
      </Callout>

      {/* Master switch */}
      <Card
        className={cn(
          'mb-5 border-2',
          masterEnabled ? 'border-brand-200 dark:border-brand-900' : 'border-warning-300 dark:border-warning-500/40'
        )}
      >
        <div className="flex items-start gap-4">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              masterEnabled
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/50'
                : 'bg-warning-50 text-warning-600 dark:bg-warning-500/10'
            )}
          >
            {masterEnabled ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
          </span>

          <div className="min-w-0 flex-1">
            <Toggle
              label="Allow parent access to my academic records"
              description={
                masterEnabled
                  ? 'Your parents can see the categories you have shared below.'
                  : 'All parent access is off. No parent can see any of your records, whatever the individual settings say.'
              }
              checked={masterEnabled}
              onChange={toggleMaster}
            />
          </div>
        </div>
      </Card>

      {/* Per-parent controls */}
      {isLoading ? (
        <LoadingSkeleton count={2} height="h-64" />
      ) : parents.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No parents linked"
          message="When your institution links a parent to your account, you will control what they can see from here."
        />
      ) : (
        <div className="space-y-5">
          {parents.map((parent) => {
            const sharedCount = Object.values(parent.permissions).filter(Boolean).length;

            return (
              <Card key={parent.parentId} className={cn(!masterEnabled && 'opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={parent.parentName} src={parent.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-ink">
                          {parent.parentName}
                        </h3>
                        {parent.isPrimary && (
                          <Badge tone="brand" size="sm">
                            Primary
                          </Badge>
                        )}
                        <Badge tone="neutral" size="sm">
                          {parent.relationship}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-ink-muted">{parent.parentEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={sharedCount === 0 ? 'warning' : 'success'} size="sm">
                      {sharedCount === 0
                        ? 'Nothing shared'
                        : `${sharedCount} of ${scopes.length} shared`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={UserMinus}
                      onClick={() => setToUnlink(parent)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="mt-5 space-y-4 border-t border-line pt-5">
                  {scopes.map((scope) => {
                    const isOn = parent.permissions[scope.key];

                    return (
                      <div key={scope.key} className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                            isOn && masterEnabled
                              ? 'bg-success-50 text-success-600 dark:bg-success-500/10'
                              : 'bg-surface-sunken text-ink-subtle'
                          )}
                        >
                          {isOn && masterEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
                        </span>

                        <div className="min-w-0 flex-1">
                          <Toggle
                            label={scope.label}
                            description={scope.description}
                            checked={isOn}
                            disabled={!masterEnabled}
                            onChange={(next) => toggleScope(parent.parentId, scope.key, next)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(toUnlink)}
        onClose={() => setToUnlink(null)}
        onConfirm={unlink}
        title="Remove this parent's access?"
        message={
          toUnlink
            ? `${toUnlink.parentName} will be unlinked from your account entirely and will no longer see any of your records. An administrator would have to link them again.`
            : ''
        }
        confirmLabel="Remove access"
        isPending={isUnlinking}
      />
    </>
  );
}

export default StudentPrivacy;
