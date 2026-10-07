import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDateUpdates } from '../worker/services/date_sync.js';

test('date_sync: emits update and notification when future premiere date announced', () => {
  const tracked = [
    {
      id: 'm1',
      userId: 'u1',
      malId: 500,
      title: 'Chainsaw Man Movie',
      releaseDate: null,
      releaseDateSource: null,
    },
  ];

  const providerMap = new Map([
    [500, { releaseDate: '2026-11-20', status: 'NOT_YET_RELEASED', provider: 'anilist' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-04',
  });

  assert.equal(dbUpdates.length, 1);
  assert.equal(dbUpdates[0].id, 'm1');
  assert.equal(dbUpdates[0].releaseDate, '2026-11-20');
  assert.equal(dbUpdates[0].releaseDateSource, 'anilist');

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'date_change');
  assert.equal(notifications[0].dedupeKey, 'date_change:500:2026-11-20:20261004');
  assert.match(notifications[0].message, /confirmed for 2026-11-20/);
});

test('date_sync: supports SQLite snake_case fields (mal_id, user_id, release_date)', () => {
  const tracked = [
    {
      id: 'm_bc',
      user_id: 'usr_nadeem',
      mal_id: 61967,
      title: 'Black Clover Season 2',
      release_date: null,
      release_date_source: null,
    },
  ];

  const providerMap = new Map([
    [61967, { releaseDate: '2026-10-03', status: 'currently_airing', provider: 'mal' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-04',
  });

  assert.equal(dbUpdates.length, 1);
  assert.equal(dbUpdates[0].id, 'm_bc');
  assert.equal(dbUpdates[0].userId, 'usr_nadeem');
  assert.equal(dbUpdates[0].releaseDate, '2026-10-03');

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'episode_release');
  assert.equal(notifications[0].dedupeKey, 'premiere:61967');
  assert.match(notifications[0].message, /Episode 1 released/);
  assert.equal(notifications[0].data.is_released, true);
});

test('date_sync: emits episode_release notification when show starts airing', () => {
  const tracked = [
    {
      id: 'm10',
      user_id: 'u1',
      mal_id: 61967,
      title: 'Black Clover Season 2',
      release_date: '2026-10-03',
      release_date_source: 'mal',
    },
  ];

  const providerMap = new Map([
    [61967, { releaseDate: '2026-10-03', status: 'RELEASING', provider: 'anilist' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-04',
  });

  // Date is already 2026-10-03, so no DB date update required
  assert.equal(dbUpdates.length, 0);

  // But notification must be emitted so user knows Episode 1 is released!
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'episode_release');
  assert.equal(notifications[0].dedupeKey, 'premiere:61967');
  assert.match(notifications[0].message, /Episode 1 released/);
});

test('date_sync: respects manual date and emits date_kept notification', () => {
  const tracked = [
    {
      id: 'm2',
      user_id: 'u1',
      mal_id: 600,
      title: 'Custom Premiere',
      release_date: '2026-12-01',
      release_date_source: 'manual',
    },
  ];

  const providerMap = new Map([
    [600, { releaseDate: '2026-12-15', status: 'NOT_YET_RELEASED', provider: 'anilist' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-04',
  });

  // DB must NOT be updated
  assert.equal(dbUpdates.length, 0);

  // Notification informing user manual date was kept
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].dedupeKey, 'date_kept:600:2026-12-15');
  assert.equal(notifications[0].data.kept_manual, true);
  assert.match(notifications[0].message, /Kept your manual date/);
});

test('date_sync: does nothing if future date is identical and not airing', () => {
  const tracked = [
    {
      id: 'm3',
      user_id: 'u1',
      mal_id: 700,
      title: 'Stable Future Anime',
      release_date: '2026-12-10',
      release_date_source: 'anilist',
    },
  ];

  const providerMap = new Map([
    [700, { releaseDate: '2026-12-10', status: 'NOT_YET_RELEASED', provider: 'anilist' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-04',
  });

  assert.equal(dbUpdates.length, 0);
  assert.equal(notifications.length, 0);
});

test('date_sync: emits episode_release notification when stored date has arrived even if provider slice is missing', () => {
  const tracked = [
    {
      id: 'm-tanmoshi',
      user_id: 'u1',
      mal_id: 52480,
      title: 'The Detective Is Already Dead Season 2',
      release_date: '2026-10-07',
      release_date_source: 'anilist',
    },
  ];

  const emptyProviderMap = new Map();

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: emptyProviderMap,
    todayStr: '2026-10-07',
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'episode_release');
  assert.equal(notifications[0].dedupeKey, 'premiere:52480');
  assert.match(notifications[0].message, /Episode 1 released! Season premiere aired on 2026-10-07/);
});
