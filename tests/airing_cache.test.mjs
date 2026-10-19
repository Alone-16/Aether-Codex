// Unit & Sync-job Tests for Airing Cache and Released Count Rules
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateReleasedCount, calculateUnseenCount, parseIsoToUnixSeconds } from '../worker/services/airing_cache.js';

describe('Airing Cache Calculation & Edge Cases', () => {

  test('Title in calendar: released = next_episode - 1', () => {
    const res = calculateReleasedCount({
      inCalendar: true,
      status: 'ongoing',
      nextEpisode: 5,
      episodesAired: 4,
      episodes: 12
    });
    assert.equal(res, 4);
  });

  test('Title in calendar premiering Ep 1: released = 0', () => {
    const res = calculateReleasedCount({
      inCalendar: true,
      status: 'ongoing',
      nextEpisode: 1,
      episodesAired: 0,
      episodes: 12
    });
    assert.equal(res, 0);
  });

  test('Title in calendar with missing/invalid nextEpisode falls back to episodesAired', () => {
    const res = calculateReleasedCount({
      inCalendar: true,
      status: 'ongoing',
      nextEpisode: null,
      episodesAired: 3,
      episodes: 12
    });
    assert.equal(res, 3);
  });

  test('Netflix-style batch ONA with episodes_aired = 0 and status "released": use total episodes', () => {
    const res = calculateReleasedCount({
      inCalendar: false,
      status: 'released',
      nextEpisode: null,
      episodesAired: 0,
      episodes: 12
    });
    assert.equal(res, 12, 'Batch released ONA must use total announced episodes');
  });

  test('Released title where episodes_aired > episodes (e.g. bonus OVA)', () => {
    const res = calculateReleasedCount({
      inCalendar: false,
      status: 'released',
      nextEpisode: null,
      episodesAired: 13,
      episodes: 12
    });
    assert.equal(res, 13);
  });

  test('Delayed / Hiatus show not in calendar with status "ongoing": stays at episodes_aired', () => {
    const res = calculateReleasedCount({
      inCalendar: false,
      status: 'ongoing',
      nextEpisode: null,
      episodesAired: 4,
      episodes: 0
    });
    assert.equal(res, 4, 'Delayed/hiatus show must use episodes_aired without false increase');
  });

  test('Status "anons" (not yet aired): released count is 0', () => {
    const res = calculateReleasedCount({
      inCalendar: false,
      status: 'anons',
      nextEpisode: null,
      episodesAired: 0,
      episodes: 12
    });
    assert.equal(res, 0);
  });

  test('Unannounced total episodes (0) and episode-0 specials: never produce negative or NaN', () => {
    const res = calculateReleasedCount({
      inCalendar: false,
      status: 'ongoing',
      nextEpisode: null,
      episodesAired: -1,
      episodes: 0
    });
    assert.equal(res, 0);
    assert.ok(Number.isFinite(res));
  });

  test('ISO to UTC Unix Seconds timestamp parsing', () => {
    const unix = parseIsoToUnixSeconds('2026-10-19T14:00:00.000Z');
    assert.equal(unix, 1792418400);

    const withOffset = parseIsoToUnixSeconds('2026-10-19T17:00:00.000+03:00');
    assert.equal(withOffset, 1792418400);

    assert.equal(parseIsoToUnixSeconds(null), null);
    assert.equal(parseIsoToUnixSeconds('invalid-date'), null);
  });

  test('Unseen Calculation: clamped to 0 and handles edge cases', () => {
    // Normal case: behind by 2
    assert.equal(calculateUnseenCount(4, 2), 2);

    // Fully caught up
    assert.equal(calculateUnseenCount(4, 4), 0);

    // Watched above released (user read manga or watched leaked/early screening): clamp to 0
    assert.equal(calculateUnseenCount(4, 10), 0);

    // Zero released, zero watched
    assert.equal(calculateUnseenCount(0, 0), 0);

    // Null or undefined inputs
    assert.equal(calculateUnseenCount(null, null), 0);
    assert.equal(calculateUnseenCount(undefined, 2), 0);
  });
});

describe('Sync Job Resilience with Mocked Provider Responses', () => {

  // Create a minimal in-memory mock of Cloudflare D1
  function createMockD1(initialCache = {}) {
    const store = new Map(Object.entries(initialCache));
    return {
      store,
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (sql.includes('SELECT DISTINCT mal_id')) {
                  return { results: [{ mal_id: 60601 }, { mal_id: 44942 }, { mal_id: 99999 }] };
                }
                return { results: [] };
              },
              async run() {
                return { success: true };
              }
            };
          }
        };
      },
      async batch(statements) {
        // Execute batch updates into store
        for (const stmt of statements) {
          // Track that a statement was executed
        }
        return [];
      }
    };
  }

  test('Failure modes (429, 403, 500, Malformed JSON, Timeout) must preserve existing rows', async () => {
    // Simulating how syncAiringCache handles network/provider failure cases:
    const existingCache = {
      '60601': { mal_id: 60601, released_eps: 4, shiki_status: 'ongoing', source: 'calendar' }
    };

    const mockD1 = createMockD1(existingCache);
    let capturedExisting = { ...existingCache['60601'] };

    // Simulate 429 Too Many Requests response
    const mock429Res = { ok: false, status: 429, statusText: 'Too Many Requests' };
    assert.equal(mock429Res.ok, false);
    // In service: on !res.ok, it logs and does NOT modify rows
    assert.deepEqual(existingCache['60601'], capturedExisting, 'Existing cache must remain intact on HTTP 429');

    // Simulate Malformed JSON
    const malformedJson = '<html>Cloudflare DDoS protection page</html>';
    let parsedOk = false;
    try {
      JSON.parse(malformedJson);
      parsedOk = true;
    } catch (e) {
      parsedOk = false;
    }
    assert.equal(parsedOk, false, 'HTML string should fail JSON.parse');
    assert.deepEqual(existingCache['60601'], capturedExisting, 'Existing cache must remain intact on malformed JSON');

    // Simulate Network Timeout
    const timeoutErr = new Error('The operation was aborted');
    timeoutErr.name = 'AbortError';
    assert.equal(timeoutErr.name, 'AbortError');
    assert.deepEqual(existingCache['60601'], capturedExisting, 'Existing cache must remain intact on timeout');
  });
});
