/**
 * dateUtils.js
 *
 * Utilities for formatting and parsing date strings consistently.
 * Treats API datetime strings (e.g. "2026-10-23T17:58:05") as the exact date & time
 * as stored without unwanted UTC shifts that cause dates to roll over past midnight.
 */

/**
 * Parse an API datetime string cleanly into a Date object without timezone shifting.
 * @param {string|null|undefined} str
 * @returns {Date|null}
 */
export function toLocalDate(str) {
  if (!str) return null;
  // Strip any trailing Z and ensure T separator so Date parses as local time
  const cleanStr = String(str).replace('Z', '').replace(' ', 'T');
  const d = new Date(cleanStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format date + time in 24-hour format matching stored time.
 * Example: "Oct 23, 17:58"
 * @param {string|null|undefined} str
 * @param {object} options  Intl.DateTimeFormat options to merge
 * @returns {string}
 */
export function formatLocalDateTime(str, options = {}) {
  const d = toLocalDate(str);
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  });
}

/**
 * Format only the time portion in 24-hour format.
 * Example: "17:58"
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function formatLocalTime(str) {
  const d = toLocalDate(str);
  if (!d) return 'N/A';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}
