import { GraduationCap } from 'lucide-react';

/**
 * A letterhead that only exists on paper — invisible on screen, shown at the
 * top of a report's printed output. Pairs with the `.print-full` /
 * `.no-print` rules in index.css, which strip the dashboard chrome around it.
 */
export function PrintMasthead({ title, subtitle, meta }) {
  return (
    <div className="hidden print:block">
      <div className="flex items-center justify-between border-b-2 border-ink pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap size={18} aria-hidden="true" />
          </span>
          <span className="text-lg font-bold text-ink">Smart Edu</span>
        </div>
        <p className="text-xs text-ink-muted">
          Generated {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>

      <h1 className="mt-5 text-2xl font-bold text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      {meta && <p className="mt-0.5 text-xs text-ink-subtle">{meta}</p>}
    </div>
  );
}

/** Repeats at the foot of every printed page (fixed positioning survives pagination). */
export function PrintFooter({ label = 'Smart Edu — Confidential' }) {
  return (
    <div className="fixed inset-x-0 bottom-0 hidden items-center justify-between border-t border-line pt-2 text-[10px] text-ink-subtle print:flex">
      <span>{label}</span>
      <span>Not valid without an institutional seal or signature where required</span>
    </div>
  );
}

export default PrintMasthead;
