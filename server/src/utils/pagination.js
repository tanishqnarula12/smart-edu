import { config } from '../config/env.js';

/**
 * Read `page` / `limit` off the query string, clamped so a caller cannot ask
 * for an unbounded result set.
 */
export function getPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || config.academic.defaultPageSize;
  const limit = Math.min(Math.max(1, requested), config.academic.maxPageSize);

  return { page, limit, offset: (page - 1) * limit };
}

export function buildPaginationMeta({ page, limit }, totalItems) {
  const total = Number(totalItems) || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    page,
    limit,
    totalItems: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Whitelist-based ORDER BY. Column names can never come from user input
 * directly — the caller supplies the allowed map and anything else falls back
 * to the default.
 */
export function buildSort(query = {}, allowed = {}, fallback) {
  const requested = query.sortBy;
  const column = allowed[requested] || fallback;
  const direction = String(query.sortDir || query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}`;
}

export default { getPagination, buildPaginationMeta, buildSort };
