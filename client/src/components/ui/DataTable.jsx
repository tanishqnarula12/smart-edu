import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Inbox } from 'lucide-react';
import { Button } from './Button.jsx';
import { EmptyState, ErrorState, TableSkeleton } from './States.jsx';
import { cn } from '../../utils/cn.js';

/**
 * DataTable (§47).
 *
 * On a narrow screen the table is replaced by stacked cards rather than being
 * squeezed or side-scrolled — a 320px phone cannot usefully render six
 * columns, so it renders one record at a time instead.
 *
 * Column shape:
 *   { key, header, render?, align?, sortable?, className?, hideOnMobile?, primary? }
 */
export function DataTable({
  columns,
  rows,
  keyField = 'id',
  isLoading = false,
  error = null,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyMessage,
  emptyAction,
  emptyIcon = Inbox,
  onRowClick,
  rowHref,
  pagination,
  onPageChange,
  sortBy,
  sortDir,
  onSort,
  className,
  compact = false,
}) {
  if (isLoading) return <TableSkeleton rows={6} columns={Math.min(columns.length, 5)} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (!rows?.length) {
    return (
      <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />
    );
  }

  const alignClass = (align) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  const cellValue = (row, column) => (column.render ? column.render(row) : row[column.key]);

  const interactive = Boolean(onRowClick || rowHref);

  return (
    <div className={className}>
      {/* ── Desktop / tablet: a real table ─────────────────────────────── */}
      <div className="hidden overflow-hidden rounded-xl border border-line md:block">
        <div className="scrollbar-slim overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-sunken/60">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted',
                      alignClass(column.align),
                      column.className
                    )}
                  >
                    {column.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(column.key)}
                        className="inline-flex items-center gap-1 transition hover:text-ink"
                        aria-label={`Sort by ${column.header}`}
                        // Announce the active direction to screen readers.
                        aria-sort={
                          sortBy === column.key
                            ? sortDir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        {column.header}
                        {sortBy === column.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp size={12} className="text-brand-600" aria-hidden="true" />
                          ) : (
                            <ArrowDown size={12} className="text-brand-600" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown size={12} className="opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr
                  key={row[keyField]}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'bg-surface-raised transition-colors',
                    interactive && 'cursor-pointer hover:bg-surface-sunken/70'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 text-ink',
                        compact ? 'py-2.5' : 'py-3.5',
                        alignClass(column.align),
                        column.className
                      )}
                    >
                      {cellValue(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile: one card per record ────────────────────────────────── */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => {
          const primaryColumn = columns.find((column) => column.primary) ?? columns[0];
          const detailColumns = columns.filter(
            (column) => column !== primaryColumn && !column.hideOnMobile
          );

          return (
            <div
              key={row[keyField]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'rounded-xl border border-line bg-surface-raised p-4 shadow-card',
                interactive && 'cursor-pointer active:bg-surface-sunken'
              )}
            >
              <div className="mb-3 font-medium text-ink">{cellValue(row, primaryColumn)}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {detailColumns.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                      {column.header}
                    </dt>
                    <dd className="mt-0.5 truncate text-sm text-ink">{cellValue(row, column)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <Pagination pagination={pagination} onPageChange={onPageChange} />
      )}
    </div>
  );
}

export function Pagination({ pagination, onPageChange, className }) {
  const { page, totalPages, totalItems, limit } = pagination;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, totalItems);

  // Show a window around the current page rather than every page number.
  const pages = [];
  const window = 1;
  for (let candidate = 1; candidate <= totalPages; candidate += 1) {
    if (
      candidate === 1 ||
      candidate === totalPages ||
      (candidate >= page - window && candidate <= page + window)
    ) {
      pages.push(candidate);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  return (
    <nav
      className={cn('mt-4 flex flex-wrap items-center justify-between gap-3', className)}
      aria-label="Pagination"
    >
      <p className="text-sm text-ink-muted">
        Showing <span className="font-medium text-ink">{from}</span>–
        <span className="font-medium text-ink">{to}</span> of{' '}
        <span className="font-medium text-ink">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={!pagination.hasPrevPage}
          onClick={() => onPageChange(page - 1)}
        >
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Button>

        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((candidate, index) =>
            candidate === '…' ? (
              <span key={`gap-${index}`} className="px-1.5 text-sm text-ink-subtle">
                …
              </span>
            ) : (
              <button
                key={candidate}
                type="button"
                onClick={() => onPageChange(candidate)}
                aria-current={candidate === page ? 'page' : undefined}
                className={cn(
                  'h-9 min-w-9 rounded-lg px-2.5 text-sm font-medium transition',
                  candidate === page
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                )}
              >
                {candidate}
              </button>
            )
          )}
        </div>

        <span className="px-2 text-sm text-ink-muted sm:hidden">
          {page} / {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          iconRight={ChevronRight}
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="sr-only sm:not-sr-only">Next</span>
        </Button>
      </div>
    </nav>
  );
}

export default DataTable;
