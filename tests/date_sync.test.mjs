import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDateUpdates } from '../worker/services/date_sync.js';

test('date_sync: emits update and notification when new date announced', () => {
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
    todayStr: '2026-10-03',
  });

  assert.equal(dbUpdates.length, 1);
  assert.equal(dbUpdates[0].id, 'm1');
  assert.equal(dbUpdates[0].releaseDate, '2026-11-20');
  assert.equal(dbUpdates[0].releaseDateSource, 'anilist');

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'date_change');
  assert.equal(notifications[0].dedupeKey, 'date_change:500:2026-11-20:20261003');
  assert.match(notifications[0].message, /confirmed for 2026-11-20/);
});

test('date_sync: respects manual date and emits date_kept notification', () => {
  const tracked = [
    {
      id: 'm2',
      userId: 'u1',
      malId: 600,
      title: 'Custom Premiere',
      releaseDate: '2026-12-01',
      releaseDateSource: 'manual',
    },
  ];

  const providerMap = new Map([
    [600, { releaseDate: '2026-12-15', status: 'NOT_YET_RELEASED', provider: 'anilist' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-03',
  });

  // DB must NOT be updated
  assert.equal(dbUpdates.length, 0);

  // Notification informing user manual date was kept
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].dedupeKey, 'date_kept:600:2026-12-15');
  assert.equal(notifications[0].data.kept_manual, true);
  assert.match(notifications[0].message, /Kept your manual date/);
});

test('date_sync: does nothing if date is identical', () => {
  const tracked = [
    {
      id: 'm3',
      userId: 'u1',
      malId: 700,
      title: 'Stable Anime',
      releaseDate: '2026-10-10',
      releaseDateSource: 'anilist',
    },
  ];

  const providerMap = new Map([
    [700, { releaseDate: '2026-10-10', status: 'NOT_YET_RELEASED', provider: 'anilist' }],
  ]);

  const { dbUpdates, notifications } = computeDateUpdates({
    trackedUpcomingItems: tracked,
    providerDatesMap: providerMap,
    todayStr: '2026-10-03',
  });

  assert.equal(dbUpdates.length, 0);
  assert.equal(notifications.length, 0);
});
