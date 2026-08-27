import { useMemo } from 'react';
import { GraduationCap } from 'lucide-react';

/**
 * A letterhead that only exists on paper — invisible on screen, shown at the
 * top of a report's printed output. Pairs with the `.print-full` /
 * `.no-print` rules in index.css, which strip the dashboard chrome around it.
 */
export function PrintMasthead({ title, subtitle, meta }) {
  // Cosmetic only — gives each printed document a distinct-looking reference,
  // the way a real institutional letterhead would, without meaning anything
  // to the backend.
  const reference = useMemo(() => `SE-${Date.now().toString(36).toUpperCase()}`, []);

  return (
    <div className="hidden print:block">
      {/* A thin brand strip repeats at the very top of every printed page. */}
      <div
        className="fixed inset-x-0 top-0 hidden h-1.5 bg-gradient-to-r from-brand-600 via-violet-600 to-brand-600 print:block"
        aria-hidden="true"
      />

      <div className="flex items-start justify-between border-b-2 border-ink pb-4 pt-2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xl font-bold leading-tight text-ink">Smart Edu</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
              AI-powered academic management
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">
            {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">Ref {reference}</p>
        </div>
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
    <div className="fixed inset-x-0 bottom-0 hidden items-center justify-between gap-3 border-t border-line pt-2 text-[10px] text-ink-subtle print:flex">
      <span className="flex items-center gap-1.5 font-medium">
        <GraduationCap size={11} aria-hidden="true" />
        {label}
      </span>
      <span>Not valid without an institutional seal or signature where required</span>
    </div>
  );
}

export default PrintMasthead;
