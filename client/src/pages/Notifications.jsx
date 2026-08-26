import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, FileText } from 'lucide-react';
import { notificationApi, noticeApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card, CardHeader, Tabs, Button, Badge, StatusBadge, EmptyState, ErrorState,
  LoadingSkeleton, Pagination, ConfirmDialog,
} from '../components/ui/index.js';
import { formatRelative, formatDate, humanise } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/** Notifications and notices in one place (§14, §46) — shared by every role. */
export function Notifications({ defaultTab = 'notifications' }) {
  const toast = useToast();
  const navigate = useNavigate();

  // `/…/notices` routes open on the notices tab; `/…/notifications` on alerts.
  const [tab, setTab] = useState(defaultTab);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const {
    data: notifications,
    isLoading,
    error,
    refetch,
  } = useApi(
    () => notificationApi.list({ page, limit: 20, unreadOnly: unreadOnly ? 'true' : undefined }),
    [page, unreadOnly]
  );

  const { data: notices, isLoading: noticesLoading } = useApi(
    () => noticeApi.list({ limit: 20 }),
    []
  );

  const openNotification = async (notification) => {
    if (!notification.isRead) {
      await notificationApi.markRead(notification.id).catch(() => {});
      refetch();
    }
    if (notification.link) navigate(notification.link);
  };

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      toast.success('All notifications marked as read');
      refetch();
    } catch (markError) {
      toast.error(markError.message);
    }
  };

  const clearAll = async () => {
    try {
      await notificationApi.clearAll();
      toast.success('Notifications cleared');
      setConfirmClear(false);
      refetch();
    } catch (clearError) {
      toast.error(clearError.message);
    }
  };

  const remove = async (id, event) => {
    event.stopPropagation();
    try {
      await notificationApi.remove(id);
      refetch();
    } catch (removeError) {
      toast.error(removeError.message);
    }
  };

  const items = notifications?.data ?? [];
  const unreadCount = notifications?.meta?.pagination?.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts about your attendance, marks, assignments and institution notices."
        action={
          tab === 'notifications' &&
          items.length > 0 && (
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAllRead}>
                  Mark all read
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmClear(true)}>
                Clear
              </Button>
            </div>
          )
        }
      />

      <Tabs
        tabs={[
          { value: 'notifications', label: 'Alerts', count: unreadCount || undefined },
          { value: 'notices', label: 'Notices', count: notices?.data?.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'notifications' && (
        <Card>
          <CardHeader
            title="Your alerts"
            icon={Bell}
            action={
              <Button
                variant={unreadOnly ? 'subtle' : 'ghost'}
                size="sm"
                onClick={() => {
                  setUnreadOnly((current) => !current);
                  setPage(1);
                }}
              >
                {unreadOnly ? 'Showing unread' : 'Show unread only'}
              </Button>
            }
          />

          <div className="mt-4">
            {error ? (
              <ErrorState error={error} onRetry={refetch} compact />
            ) : isLoading ? (
              <LoadingSkeleton count={5} height="h-16" />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Bell}
                title={unreadOnly ? 'Nothing unread' : "You're all caught up"}
                message="Alerts about attendance, marks and deadlines will appear here."
              />
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {items.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className={cn(
                          'group flex w-full items-start gap-3 rounded-lg px-2 py-3.5 text-left transition hover:bg-surface-sunken',
                          !notification.isRead && 'bg-brand-50/40 dark:bg-brand-950/20'
                        )}
                      >
                        {!notification.isRead && (
                          <span
                            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                            aria-label="Unread"
                          />
                        )}

                        <div className={cn('min-w-0 flex-1', notification.isRead && 'ml-5')}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={cn(
                                'text-sm',
                                notification.isRead ? 'text-ink-muted' : 'font-semibold text-ink'
                              )}
                            >
                              {notification.title}
                            </p>
                            <Badge tone="neutral" size="sm">
                              {humanise(notification.type)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-xs text-ink-subtle">
                            {formatRelative(notification.createdAt)}
                          </p>
                        </div>

                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Delete notification"
                          onClick={(event) => remove(notification.id, event)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') remove(notification.id, event);
                          }}
                          className="shrink-0 rounded-md p-1.5 text-ink-subtle opacity-0 transition hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {notifications?.meta?.pagination?.totalPages > 1 && (
                  <Pagination pagination={notifications.meta.pagination} onPageChange={setPage} />
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {tab === 'notices' && (
        <Card>
          <CardHeader title="Institution notices" icon={FileText} />

          <div className="mt-4">
            {noticesLoading ? (
              <LoadingSkeleton count={4} height="h-24" />
            ) : !notices?.data?.length ? (
              <EmptyState
                icon={FileText}
                title="No notices"
                message="Announcements from your institution will appear here."
              />
            ) : (
              <ul className="space-y-4">
                {notices.data.map((notice) => (
                  <li
                    key={notice.id}
                    className={cn(
                      'rounded-xl border p-4',
                      notice.isPinned
                        ? 'border-brand-200 bg-brand-50/40 dark:border-brand-900 dark:bg-brand-950/20'
                        : 'border-line'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink">{notice.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                          <span>{notice.authorName ?? 'Administration'}</span>
                          <span>·</span>
                          <span>{formatDate(notice.createdAt)}</span>
                          {notice.className && (
                            <>
                              <span>·</span>
                              <span>{notice.className}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {notice.isPinned && (
                          <Badge tone="brand" size="sm">
                            Pinned
                          </Badge>
                        )}
                        <Badge tone="neutral" size="sm">
                          {humanise(notice.category)}
                        </Badge>
                        {['high', 'urgent'].includes(notice.priority) && (
                          <StatusBadge status={notice.priority} size="sm" />
                        )}
                      </div>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                      {notice.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clearAll}
        title="Clear all notifications?"
        message="Every notification will be removed from your list. This cannot be undone."
        confirmLabel="Clear all"
      />
    </>
  );
}

export default Notifications;
