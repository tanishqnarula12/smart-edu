import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { initials } from '../../utils/format.js';

/** Smaller shared primitives: avatar, tabs, progress, breadcrumbs, tooltip. */

const AVATAR_SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

/**
 * Avatar. Falls back to initials on a colour derived from the name, so the
 * same person always gets the same colour without storing one.
 */
export function Avatar({ name, src, size = 'md', className, ring = false }) {
  const [failed, setFailed] = useState(false);

  const palette = [
    'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200',
    'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200',
    'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
    'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
    'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
  ];

  const hash = (name ?? '').split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const tone = palette[hash % palette.length];

  const classes = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
    AVATAR_SIZES[size],
    ring && 'ring-2 ring-surface-raised',
    className
  );

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s avatar` : 'Avatar'}
        onError={() => setFailed(true)}
        className={cn(classes, 'object-cover')}
      />
    );
  }

  return (
    <span className={cn(classes, tone)} aria-label={name ? `${name}'s avatar` : undefined}>
      {initials(name)}
    </span>
  );
}

export function Tabs({ tabs, active, onChange, className, variant = 'underline' }) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1 overflow-x-auto scrollbar-slim',
        variant === 'underline' && 'border-b border-line',
        variant === 'pills' && 'rounded-xl bg-surface-sunken p-1',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition',
              variant === 'underline' && [
                '-mb-px border-b-2',
                isActive
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-ink-muted hover:border-line hover:text-ink',
              ],
              variant === 'pills' && [
                'rounded-lg',
                isActive
                  ? 'bg-surface-raised text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              ]
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.icon && <tab.icon size={15} aria-hidden="true" />}
              {tab.label}
              {tab.count !== undefined && tab.count !== null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    isActive ? 'bg-brand-100 text-brand-700' : 'bg-surface-sunken text-ink-muted'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PROGRESS_TONES = {
  brand: 'bg-brand-600',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  neutral: 'bg-ink-subtle',
};

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  size = 'md',
  label,
  showValue = false,
  className,
}) {
  const percentage = Math.max(0, Math.min(100, (Number(value) / max) * 100));
  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-2.5' };

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && <span className="text-xs font-medium text-ink-muted">{label}</span>}
          {showValue && (
            <span className="text-xs font-semibold tabular-nums text-ink">
              {Number(value).toFixed(percentage % 1 === 0 ? 0 : 1)}
              {max === 100 ? '%' : ` / ${max}`}
            </span>
          )}
        </div>
      )}

      <div
        className={cn('w-full overflow-hidden rounded-full bg-surface-sunken', heights[size])}
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', PROGRESS_TONES[tone])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/** Circular progress — for the single headline metric on a dashboard. */
export function ProgressRing({ value, size = 88, strokeWidth = 8, tone = 'brand', label, sublabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  const offset = circumference - (percentage / 100) * circumference;

  const colors = {
    brand: '#4f46e5',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    neutral: '#94a3b8',
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-line"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={colors[tone]}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none text-ink">{label ?? `${Math.round(percentage)}%`}</span>
        {sublabel && <span className="mt-0.5 text-[10px] text-ink-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight size={14} className="text-ink-subtle" aria-hidden="true" />
            )}
            {isLast || !item.to ? (
              <span className={cn(isLast ? 'font-medium text-ink' : 'text-ink-muted')} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="text-ink-muted transition hover:text-ink">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** CSS-only tooltip — no positioning library needed for short hints. */
export function Tooltip({ content, children, side = 'top', className }) {
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-popover transition-opacity duration-150',
          'group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          positions[side]
        )}
      >
        {content}
      </span>
    </span>
  );
}

/** Coloured left border + tinted background, for inline explanations. */
export function Callout({ tone = 'info', title, children, icon: Icon, className }) {
  const tones = {
    info: 'border-l-info-500 bg-info-50 text-info-900 dark:bg-info-500/10 dark:text-info-100',
    success: 'border-l-success-500 bg-success-50 text-success-900 dark:bg-success-500/10 dark:text-success-100',
    warning: 'border-l-warning-500 bg-warning-50 text-warning-900 dark:bg-warning-500/10 dark:text-warning-100',
    danger: 'border-l-danger-500 bg-danger-50 text-danger-900 dark:bg-danger-500/10 dark:text-danger-100',
    neutral: 'border-l-ink-subtle bg-surface-sunken text-ink',
  };

  return (
    <div className={cn('rounded-r-xl border-l-4 p-4', tones[tone], className)}>
      <div className="flex gap-3">
        {Icon && <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          {title && <p className="text-sm font-semibold">{title}</p>}
          <div className={cn('text-sm', title && 'mt-1')}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Divider({ label, className }) {
  if (!label) return <hr className={cn('border-line', className)} />;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <hr className="flex-1 border-line" />
      <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</span>
      <hr className="flex-1 border-line" />
    </div>
  );
}

export default Avatar;
