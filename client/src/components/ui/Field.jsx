import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff, Search, AlertCircle } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * Form controls (§63).
 *
 * Every control is label-associated and wires `aria-describedby` /
 * `aria-invalid` to its own error text, so validation failures are announced
 * rather than just coloured red.
 */

const baseControl = cn(
  'w-full rounded-xl border bg-surface-raised px-3.5 text-sm text-ink transition-colors',
  'placeholder:text-ink-subtle',
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle'
);

function FieldShell({ id, label, hint, error, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-xs text-danger-600" role="alert">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const Input = forwardRef(function Input(
  { label, hint, error, required, className, containerClassName, icon: Icon, type = 'text', ...props },
  ref
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            baseControl,
            'h-10',
            Icon && 'pl-9',
            error ? 'border-danger-400' : 'border-line',
            className
          )}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

/** Password field with a show/hide toggle (§4). */
export const PasswordInput = forwardRef(function PasswordInput(
  { label = 'Password', hint, error, required, className, containerClassName, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(baseControl, 'h-10 pr-10', error ? 'border-danger-400' : 'border-line', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </FieldShell>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, className, containerClassName, rows = 4, ...props },
  ref
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          baseControl,
          'resize-y py-2.5 leading-relaxed',
          error ? 'border-danger-400' : 'border-line',
          className
        )}
        {...props}
      />
    </FieldShell>
  );
});

export const Select = forwardRef(function Select(
  {
    label,
    hint,
    error,
    required,
    options = [],
    placeholder,
    className,
    containerClassName,
    children,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          baseControl,
          'h-10 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
          error ? 'border-danger-400' : 'border-line',
          className
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
    </FieldShell>
  );
});

/** Native date input — reliable, keyboard-accessible and localised for free. */
export const DatePicker = forwardRef(function DatePicker({ type = 'date', ...props }, ref) {
  return <Input ref={ref} type={type} {...props} />;
});

export const SearchInput = forwardRef(function SearchInput(
  { className, placeholder = 'Search…', ...props },
  ref
) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(baseControl, 'h-10 border-line pl-9', className)}
        {...props}
      />
    </div>
  );
});

export function Checkbox({ label, description, className, id: providedId, ...props }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand-600 focus:ring-2 focus:ring-brand-500/30"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer select-none text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
    </div>
  );
}

/** Accessible switch, used for the privacy toggles (§38). */
export function Toggle({ checked, onChange, label, description, disabled, id: providedId }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-ink-subtle/40',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}

export default Input;
