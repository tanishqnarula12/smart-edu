import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * Button. Renders as `<button>`, `<a>` or react-router `<Link>` depending on
 * the props given, so a link that looks like a button is still a link — which
 * matters for middle-click, keyboard use and screen readers.
 */

const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 dark:disabled:bg-brand-900',
  secondary:
    'bg-surface-raised text-ink border border-line shadow-sm hover:bg-surface-sunken active:bg-surface-sunken',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink active:bg-line/50',
  danger: 'bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-700',
  success: 'bg-success-600 text-white shadow-sm hover:bg-success-700',
  outline: 'border border-brand-600 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-300',
  // For use on a permanently-dark surface (e.g. the landing hero) that
  // doesn't follow the light/dark theme toggle — never theme tokens.
  inverse: 'border border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/20 active:bg-white/25',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    isLoading = false,
    fullWidth = false,
    className,
    to,
    href,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  const classes = cn(
    'inline-flex items-center justify-center font-medium transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className
  );

  const content = (
    <>
      {isLoading ? (
        <Loader2 size={size === 'xs' ? 13 : 16} className="animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={size === 'xs' ? 13 : 16} aria-hidden="true" />
      )}
      {children}
      {IconRight && !isLoading && <IconRight size={size === 'xs' ? 13 : 16} aria-hidden="true" />}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a ref={ref} href={href} className={classes} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {content}
    </button>
  );
});

/** Square icon-only button. `label` is required — it becomes the accessible name. */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', className, ...props },
  ref
) {
  const sizes = { xs: 'h-7 w-7', sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-10 w-10' };
  const iconSizes = { xs: 14, sm: 16, md: 18, lg: 20 };

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      <Icon size={iconSizes[size]} aria-hidden="true" />
    </button>
  );
});

export default Button;
