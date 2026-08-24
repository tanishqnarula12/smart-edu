import { cn } from '../../utils/cn.js';
import { humanise } from '../../utils/format.js';
import { STATUS_TONES } from '../../utils/constants.js';

/** Status pills. `Badge` takes a tone; `StatusBadge` derives one from a status. */

const TONES = {
  neutral: 'bg-surface-sunken text-ink-muted ring-line',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:ring-brand-900',
  success: 'bg-success-50 text-success-700 ring-success-500/20 dark:bg-success-500/10 dark:text-success-500',
  warning: 'bg-warning-50 text-warning-700 ring-warning-500/20 dark:bg-warning-500/10 dark:text-warning-500',
  danger: 'bg-danger-50 text-danger-700 ring-danger-500/20 dark:bg-danger-500/10 dark:text-danger-500',
  info: 'bg-info-50 text-info-700 ring-info-500/20 dark:bg-info-500/10 dark:text-info-500',
};

const SIZES = {
  sm: 'px-1.5 py-0.5 text-[11px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

export function Badge({ children, tone = 'neutral', size = 'md', icon: Icon, dot, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset',
        TONES[tone] ?? TONES.neutral,
        SIZES[size],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {Icon && <Icon size={size === 'sm' ? 11 : 12} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Looks the tone up from the shared status→tone map so it stays consistent. */
export function StatusBadge({ status, size = 'md', className, label }) {
  if (!status) return null;
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} size={size} dot className={className}>
      {label ?? humanise(status)}
    </Badge>
  );
}

/** Small count bubble for the notification bell and sidebar items. */
export function CountBadge({ count, max = 99, tone = 'danger', className }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px]',
        tone === 'danger' ? 'bg-danger-500 text-white' : 'bg-brand-600 text-white',
        className
      )}
      aria-label={`${count} unread`}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

export default Badge;
