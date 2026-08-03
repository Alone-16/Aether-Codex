// ═══════════════════════════════════════════════════════════════════
//  worker/utils/validation.js — Input Validation Middleware & Helpers
// ═══════════════════════════════════════════════════════════════════

export const ALLOWED_MEDIA_STATUSES = ['watching', 'completed', 'plan', 'on_hold', 'dropped', 'upcoming'];
export const ALLOWED_GAME_PLATFORMS = ['pc', 'mobile', 'both'];
export const ALLOWED_BOOK_FORMATS = ['novel', 'manga', 'audiobook'];

export function sanitizeString(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

export function validateRating(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  return Math.min(10, Math.max(0, Math.round(num * 2) / 2)); // 0.0 to 10.0 in steps of 0.5
}

export function validateInt(val, min = 0, defaultVal = 0) {
  if (val === null || val === undefined || val === '') return defaultVal;
  const num = parseInt(val, 10);
  if (isNaN(num)) return defaultVal;
  return Math.max(min, num);
}

export function validateEnum(val, allowedArray, defaultVal) {
  if (typeof val !== 'string') return defaultVal;
  const cleaned = val.toLowerCase().trim();
  return allowedArray.includes(cleaned) ? cleaned : defaultVal;
}
