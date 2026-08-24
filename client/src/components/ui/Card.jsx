import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/** Cards, stat tiles and chart frames — the backbone of every dashboard. */

export function Card({ children, className, padded = true, as: Component = 'div', ...props }) {
  return (
    <Component
      className={cn(
        'rounded-2xl border border-line bg-surface-raised shadow-card',
        padded && 'p-5',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const TONE_STYLES = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400',
  success: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500',
  warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-500',
  danger: 'bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500',
  info: 'bg-info-50 text-info-600 dark:bg-info-500/10 dark:text-info-500',
  neutral: 'bg-surface-sunken text-ink-muted',
};

/**
 * KPI tile. Pass `to` and the whole card becomes a link — dashboard cards
 * must go somewhere (§72).
 */
export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'brand',
  trend,
  trendLabel,
  hint,
  to,
  onClick,
  isLoading = false,
  className,
}) {
  if (isLoading) {
    return (
      <div className={cn('rounded-2xl border border-line bg-surface-raised p-5 shadow-card', className)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2.5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-8 w-20" />
            <div className="skeleton h-3 w-28" />
          </div>
          <div className="skeleton h-10 w-10 rounded-xl" />
        </div>
      </div>
    );
  }

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendTone =
    trend > 0 ? 'text-success-600' : trend < 0 ? 'text-danger-600' : 'text-ink-subtle';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-muted">{label}</p>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{value}</span>
            {unit && <span className="text-sm font-medium text-ink-muted">{unit}</span>}
          </div>
        </div>

        {Icon && (
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              TONE_STYLES[tone]
            )}
          >
            <Icon size={19} aria-hidden="true" />
          </span>
        )}
      </div>

      {(trend !== undefined && trend !== null) || hint ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {trend !== undefined && trend !== null && (
            <span className={cn('flex items-center gap-1 font-medium', trendTone)}>
              <TrendIcon size={13} aria-hidden="true" />
              {Math.abs(trend)}%
            </span>
          )}
          <span className="truncate text-ink-muted">{trendLabel ?? hint}</span>
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    'block rounded-2xl border border-line bg-surface-raised p-5 text-left shadow-card transition duration-200',
    (to || onClick) && 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover',
    className
  );

  if (to) {
    return (
      <Link to={to} className={cn(classes, 'group')}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, 'w-full group')}>
        {body}
      </button>
    );
  }

  return <div className={classes}>{body}</div>;
}

/** Frame for a chart: title, optional action, and a fixed-height body. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  height = 280,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data to display yet',
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} subtitle={subtitle} action={action} />

      <div className={cn('mt-5 flex-1', bodyClassName)} style={{ minHeight: height }}>
        {isLoading ? (
          <div className="flex h-full items-end gap-2 px-2" style={{ height }} aria-hidden="true">
            {[45, 70, 55, 85, 60, 75, 50].map((value, index) => (
              <div key={index} className="skeleton flex-1 rounded-t-md" style={{ height: `${value}%` }} />
            ))}
          </div>
        ) : isEmpty ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-2 text-center"
            style={{ height }}
          >
            <p className="text-sm text-ink-muted">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/** A row that navigates — used in "students needing attention" lists (§54). */
export function ClickableRow({ to, onClick, children, className }) {
  const classes = cn(
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
    'hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    className
  );

  if (to) {
    return (
      <Link to={to} className={cn(classes, 'group')}>
        {children}
        <ArrowRight
          size={15}
          className="ml-auto shrink-0 text-ink-subtle opacity-0 transition group-hover:opacity-100"
          aria-hidden="true"
        />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

export function SectionHeading({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export default Card;
