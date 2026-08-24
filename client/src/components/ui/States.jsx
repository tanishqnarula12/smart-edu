import { AlertTriangle, Inbox, RefreshCw, WifiOff, Lock } from 'lucide-react';
import { Button } from './Button.jsx';
import { cn } from '../../utils/cn.js';

/**
 * Loading, empty and error states (§48).
 *
 * Every API-backed surface renders one of these instead of a blank area, so
 * there is never a white screen while something is in flight or has failed.
 */

export function LoadingSkeleton({ className, count = 1, height = 'h-4' }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn('skeleton w-full', height)} />
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 1, className }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn('rounded-2xl border border-line bg-surface-raised p-5 shadow-card', className)}
          aria-hidden="true"
        >
          <div className="space-y-3">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        </div>
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="skeleton h-9 w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className="skeleton h-11 flex-1 rounded-lg"
              style={{ flexGrow: columnIndex === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full-page loader used while the session is being established. */
export function PageLoader({ message = 'Loading…' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-[3px] border-line" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-brand-600" />
      </div>
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  message,
  action,
  className,
  compact = false,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-raised/50 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Error state with a retry (§48). Recognises the two errors worth handling
 * differently: a lost connection and a permission refusal.
 */
export function ErrorState({ error, onRetry, title, className, compact = false }) {
  const isNetwork = error?.isNetworkError;
  const isForbidden = error?.status === 403;

  const Icon = isNetwork ? WifiOff : isForbidden ? Lock : AlertTriangle;

  const heading =
    title ??
    (isNetwork
      ? 'Cannot reach the server'
      : isForbidden
        ? 'You do not have access'
        : 'Something went wrong');

  const message =
    error?.message ??
    'An unexpected error occurred. Try again, and if it keeps happening let your administrator know.';

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-danger-500/20 bg-danger-50/50 text-center dark:bg-danger-500/5',
        compact ? 'px-4 py-8' : 'px-6 py-12',
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-100 text-danger-600 dark:bg-danger-500/15">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-ink">{heading}</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-muted">{message}</p>

      {onRetry && !isForbidden && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry} className="mt-5">
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * The three states in one wrapper. Pages pass their `useApi` result straight
 * in, which is what keeps the handling consistent everywhere.
 */
export function AsyncBoundary({
  isLoading,
  error,
  isEmpty,
  onRetry,
  loadingFallback,
  emptyState,
  children,
}) {
  if (isLoading) return loadingFallback ?? <LoadingSkeleton count={4} height="h-12" />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return emptyState ?? <EmptyState />;
  return children;
}

/** Shown where a student has withheld a data category from a parent (§18). */
export function RestrictedState({ scope, studentName, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-raised/50 px-6 py-12 text-center',
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle">
        <Lock size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-ink">Not shared with you</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
        {studentName ? `${studentName} has` : 'The student has'} chosen not to share their{' '}
        {scope ?? 'records'} through the parent portal. This is their decision to make and change.
      </p>
    </div>
  );
}

export default EmptyState;
