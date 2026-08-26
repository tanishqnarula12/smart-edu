import { Avatar, Badge } from '../../components/ui/index.js';
import { cn } from '../../utils/cn.js';

/**
 * Child selector for parents with more than one linked student (§17).
 * Rendered as a radio group so arrow keys work and the selection is announced.
 *
 * The list prop is `students`, not `children` — `children` is React's own
 * prop for nested content, and reusing the name for domain data makes the
 * component read as if it takes JSX when it does not.
 */
export function ChildSelector({ students = [], selectedId, onSelect, className }) {
  if (students.length <= 1) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Select a child"
      className={cn('flex flex-wrap gap-2.5', className)}
    >
      {students.map((child) => {
        const isSelected = child.id === selectedId;
        const sharedCount = Object.values(child.permissions ?? {}).filter(Boolean).length;

        return (
          <button
            key={child.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(child.id)}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition',
              isSelected
                ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-950/40'
                : 'border-line bg-surface-raised hover:border-ink-subtle'
            )}
          >
            <Avatar name={child.name} src={child.avatarUrl} size="sm" />

            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{child.name}</span>
              <span className="block truncate text-xs text-ink-muted">
                {child.className ?? 'No class'}
              </span>
            </span>

            {!child.privacyEnabled ? (
              <Badge tone="warning" size="sm">
                Private
              </Badge>
            ) : sharedCount < 6 ? (
              <Badge tone="neutral" size="sm">
                {sharedCount}/6
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default ChildSelector;
