import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReleaseDate,
  localDay,
  daysUntil,
  formatReleaseDate,
} from '../js/shared/date_utils.js';

test('parseReleaseDate: derives day precision', () => {
  const res = parseReleaseDate('2026-10-20');
  assert.equal(res.precision, 'day');
  assert.equal(res.y, 2026);
  assert.equal(res.m, 10);
  assert.equal(res.d, 20);
  assert.equal(res.str, '2026-10-20');
});

test('parseReleaseDate: derives month precision', () => {
  const res = parseReleaseDate('2026-10');
  assert.equal(res.precision, 'month');
  assert.equal(res.y, 2026);
  assert.equal(res.m, 10);
  assert.equal(res.d, null);
  assert.equal(res.str, '2026-10');
});

test('parseReleaseDate: derives year precision', () => {
  const res = parseReleaseDate('2027');
  assert.equal(res.precision, 'year');
  assert.equal(res.y, 2027);
  assert.equal(res.m, null);
  assert.equal(res.d, null);
  assert.equal(res.str, '2027');
});

test('parseReleaseDate: handles null, undefined, empty, and malformed strings as none', () => {
  assert.equal(parseReleaseDate(null).precision, 'none');
  assert.equal(parseReleaseDate(undefined).precision, 'none');
  assert.equal(parseReleaseDate('').precision, 'none');
  assert.equal(parseReleaseDate('   ').precision, 'none');
  assert.equal(parseReleaseDate('TBA').precision, 'none');
  assert.equal(parseReleaseDate('2026-99-99').precision, 'none');
});

test('localDay: returns correct YYYY-MM-DD for fixed instant across timezones', () => {
  // 2026-10-20T02:00:00Z:
  // In UTC: 2026-10-20
  // In Los Angeles (UTC-7): 2026-10-19
  // In Tokyo (UTC+9): 2026-10-20
  // In Kolkata (UTC+5:30): 2026-10-20
  const fixedInstant = new Date('2026-10-20T02:00:00Z');

  assert.equal(localDay(fixedInstant, 'UTC'), '2026-10-20');
  assert.equal(localDay(fixedInstant, 'America/Los_Angeles'), '2026-10-19');
  assert.equal(localDay(fixedInstant, 'Asia/Tokyo'), '2026-10-20');
  assert.equal(localDay(fixedInstant, 'Asia/Kolkata'), '2026-10-20');
});

test('daysUntil: computes calendar day differences without local TZ skew', () => {
  assert.equal(daysUntil('2026-10-20', '2026-10-20'), 0);
  assert.equal(daysUntil('2026-10-25', '2026-10-20'), 5);
  assert.equal(daysUntil('2026-10-15', '2026-10-20'), -5);
  // Returns null if target or current is not day precision
  assert.equal(daysUntil('2026-10', '2026-10-20'), null);
  assert.equal(daysUntil('2026-10-20', '2026-10'), null);
  assert.equal(daysUntil(null, '2026-10-20'), null);
});

test('formatReleaseDate: formats according to precision', () => {
  assert.equal(formatReleaseDate('2026-10-20'), 'Oct 20, 2026');
  assert.equal(formatReleaseDate('2026-10'), 'Oct 2026');
  assert.equal(formatReleaseDate('2027'), '2027');
  assert.equal(formatReleaseDate(null), 'TBA');
  assert.equal(formatReleaseDate(''), 'TBA');
});
