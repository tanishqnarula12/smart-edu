import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { notificationApi } from '../services/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useClickOutside, useEscapeKey } from '../hooks/useApi.js';
import { formatRelative } from '../utils/format.js';
import { IconButton, Button } from '../components/ui/Button.jsx';
import { CountBadge } from '../components/ui/Badge.jsx';
import { EmptyState, LoadingSkeleton } from '../components/ui/States.jsx';
import { cn } from '../utils/cn.js';

/** Notification centre in the navbar (§46). */

const TYPE_STYLES = {
  attendance: 'bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500',
  marks: 'bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-500',
  assignment: 'bg-info-100 text-info-700 dark:bg-info-500/15 dark:text-info-500',
  exam: 'bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-500',
  notice: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  ptm: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  fee: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  default: 'bg-surface-sunken text-ink-muted',
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { role } = useAuth();

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);
  useEscapeKey(() => setIsOpen(false), isOpen);

  const loadCount = useCallback(async () => {
    try {
      const data = await notificationApi.unreadCount();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // A failed count poll is not worth surfacing to the user.
    }
  }, []);

  // Poll for the badge count. 60s is frequent enough to feel live without
  // making the API busy on every open tab.
  useEffect(() => {
    loadCount();
    const timer = setInterval(loadCount, 60_000);
    return () => clearInterval(timer);
  }, [loadCount]);

  // Only fetch the list when the panel is actually opened.
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    notificationApi
      .list({ limit: 12 })
      .then((response) => {
        setNotifications(response.data ?? []);
        setUnreadCount(response.meta?.pagination?.unreadCount ?? 0);
      })
      .catch(() => setNotifications([]))
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  const handleOpen = async (notification) => {
    setIsOpen(false);

    if (!notification.isRead) {
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      notificationApi.markRead(notification.id).catch(() => {});
    }

    if (notification.link) navigate(notification.link);
  };

  const markAllRead = async () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    await notificationApi.markAllRead().catch(() => {});
  };

  const clearAll = async () => {
    setNotifications([]);
    setUnreadCount(0);
    await notificationApi.clearAll().catch(() => {});
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5">
            <CountBadge count={unreadCount} />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-popover">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">
              Notifications
              {unreadCount > 0 && <span className="ml-1.5 text-ink-muted">({unreadCount} new)</span>}
            </h3>

            {notifications.length > 0 && (
              <div className="flex items-center gap-0.5">
                {unreadCount > 0 && (
                  <IconButton icon={CheckCheck} label="Mark all as read" size="xs" onClick={markAllRead} />
                )}
                <IconButton icon={Trash2} label="Clear all" size="xs" onClick={clearAll} />
              </div>
            )}
          </div>

          <div className="scrollbar-slim max-h-[26rem] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-4">
                <LoadingSkeleton count={4} height="h-12" />
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="You're all caught up"
                message="New alerts about attendance, marks and assignments will appear here."
                compact
                className="m-3 border-0 bg-transparent"
              />
            ) : (
              <ul className="divide-y divide-line">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleOpen(notification)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken',
                        !notification.isRead && 'bg-brand-50/40 dark:bg-brand-950/20'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase',
                          TYPE_STYLES[notification.type] ?? TYPE_STYLES.default
                        )}
                      >
                        {notification.type?.slice(0, 2) ?? 'SE'}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span
                            className={cn(
                              'block flex-1 text-sm leading-snug',
                              notification.isRead ? 'text-ink-muted' : 'font-semibold text-ink'
                            )}
                          >
                            {notification.title}
                          </span>
                          {!notification.isRead && (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                          {notification.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-ink-subtle">
                          {formatRelative(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line p-2">
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              to={`/${role}/notifications`}
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
