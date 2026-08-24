/** Shared formatting. Keeping it in one place stops dates and numbers drifting. */

const DATE_STYLE = { day: 'numeric', month: 'short', year: 'numeric' };

export function formatDate(value, options = DATE_STYLE) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', options).format(date);
}

export function formatDateTime(value) {
  return formatDate(value, { ...DATE_STYLE, hour: '2-digit', minute: '2-digit' });
}

export function formatDayMonth(value) {
  return formatDate(value, { day: 'numeric', month: 'short' });
}

/** "HH:MM:SS" or "HH:MM" → "9:00 AM". */
export function formatTime(value) {
  if (!value) return '—';
  const [hours, minutes] = String(value).split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display}:${minutes} ${suffix}`;
}

/** "3 days ago", "in 2 hours" — for activity feeds and deadlines. */
export function formatRelative(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);

  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const [unit, secondsInUnit] of units) {
    if (absolute >= secondsInUnit) {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return 'just now';
}

/** Whole days between now and a date; negative when past. */
export function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.round((date - today) / 86_400_000);
}

export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(decimals)}%`;
}

export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
}

export function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

/** Initials for an avatar fallback. */
export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** "under_review" → "Under review". */
export function humanise(value) {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (character) => character.toUpperCase());
}

export function truncate(text, length = 120) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/** Time-of-day greeting for dashboard headers (§15). */
export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const firstName = (name) => (name ? name.split(' ')[0] : '');

/** Today as YYYY-MM-DD in local time (not UTC — that shifts the date). */
export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
