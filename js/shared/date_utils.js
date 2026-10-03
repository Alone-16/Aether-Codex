// ═══════════════════════════════════════════════════════════════════
//  date_utils.js — Dependency-free Date Utilities for Releases
//
//  NOTE: v1 treats release_date as the source calendar date (JST).
//  A time/broadcast timezone-conversion field is reserved for a future phase.
// ═══════════════════════════════════════════════════════════════════

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Parses a release date string into derived precision and components.
 * Precision is strictly DERIVED from the string format; it is never stored.
 *
 * @param {string|null|undefined} s - 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | null
 * @returns {{ precision: 'day'|'month'|'year'|'none', y: number|null, m: number|null, d: number|null, str: string|null }}
 */
export function parseReleaseDate(s) {
  if (!s || typeof s !== 'string') {
    return { precision: 'none', y: null, m: null, d: null, str: null };
  }

  const str = s.trim();
  if (!str) {
    return { precision: 'none', y: null, m: null, d: null, str: null };
  }

  // Exact Day: YYYY-MM-DD
  const dayMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    const y = parseInt(dayMatch[1], 10);
    const m = parseInt(dayMatch[2], 10);
    const d = parseInt(dayMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { precision: 'day', y, m, d, str };
    }
  }

  // Month: YYYY-MM
  const monthMatch = str.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = parseInt(monthMatch[1], 10);
    const m = parseInt(monthMatch[2], 10);
    if (m >= 1 && m <= 12) {
      return { precision: 'month', y, m, d: null, str };
    }
  }

  // Year: YYYY
  const yearMatch = str.match(/^(\d{4})$/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return { precision: 'year', y, m: null, d: null, str };
  }

  return { precision: 'none', y: null, m: null, d: null, str: null };
}

/**
 * Returns formatted YYYY-MM-DD string for a given Date/timestamp in a specified timezone.
 * Uses Intl.DateTimeFormat to avoid any dependency on the host process's local timezone.
 *
 * @param {Date|number|string} now - Current time instance or timestamp
 * @param {string} [tz='UTC'] - IANA timezone identifier (e.g. 'Asia/Kolkata', 'America/Los_Angeles')
 * @returns {string} 'YYYY-MM-DD'
 */
export function localDay(now = new Date(), tz = 'UTC') {
  const d = now instanceof Date ? now : new Date(now);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Computes calendar day difference between target date and current day.
 * NEVER uses new Date('YYYY-MM-DD'). Uses UTC timestamps for reliable calendar day diff.
 *
 * @param {string} targetDateStr - 'YYYY-MM-DD'
 * @param {string} nowDateStr - 'YYYY-MM-DD'
 * @returns {number|null} number of days (positive = future, 0 = today, negative = past)
 */
export function daysUntil(targetDateStr, nowDateStr) {
  const target = parseReleaseDate(targetDateStr);
  const current = parseReleaseDate(nowDateStr);

  if (target.precision !== 'day' || current.precision !== 'day') {
    return null;
  }

  const targetUtc = Date.UTC(target.y, target.m - 1, target.d);
  const currentUtc = Date.UTC(current.y, current.m - 1, current.d);

  return Math.round((targetUtc - currentUtc) / 86400000);
}

/**
 * Formats a release date for user display according to its precision.
 *
 * @param {string|null} dateStr
 * @returns {string} e.g. "Oct 20, 2026" | "Oct 2026" | "2026" | "TBA"
 */
export function formatReleaseDate(dateStr) {
  const parsed = parseReleaseDate(dateStr);
  if (parsed.precision === 'day') {
    const mon = MONTH_NAMES_SHORT[parsed.m - 1];
    return `${mon} ${parsed.d}, ${parsed.y}`;
  }
  if (parsed.precision === 'month') {
    const mon = MONTH_NAMES_SHORT[parsed.m - 1];
    return `${mon} ${parsed.y}`;
  }
  if (parsed.precision === 'year') {
    return `${parsed.y}`;
  }
  return 'TBA';
}
