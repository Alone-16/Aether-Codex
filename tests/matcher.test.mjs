import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSequelCandidates } from '../worker/services/matcher.js';

test('matcher: finds sequel candidates when parent is watched and target is upcoming', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Solo Leveling Season 1',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Solo Leveling Season 2', releaseDate: '2026-12-05', status: 'NOT_YET_RELEASED', format: 'TV' },
        { malId: 101, relationType: 'PREQUEL', title: 'Solo Leveling Prologue' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([100]),
    userLibraryMalIds: new Set([100]),
    ignoredMalIds: new Set(),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].malId, 200);
  assert.equal(candidates[0].title, 'Solo Leveling Season 2');
  assert.equal(candidates[0].parentMalId, 100);
  assert.equal(candidates[0].dedupeKey, 'sequel:200');
  assert.equal(candidates[0].releaseDate, '2026-12-05');
});

test('matcher: strictly ignores parent anime that are NOT watched/completed by the user', () => {
  const relationsMap = new Map([
    [999, {
      title: 'Anime User Never Watched',
      relations: [
        { malId: 1000, relationType: 'SEQUEL', title: 'Unwanted Sequel', status: 'NOT_YET_RELEASED' },
      ],
    }],
    [100, {
      title: 'Watched Anime',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Wanted Sequel', status: 'NOT_YET_RELEASED' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([100]), // user only watched 100
    userLibraryMalIds: new Set([100]),
    ignoredMalIds: new Set(),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].malId, 200);
  assert.equal(candidates[0].title, 'Wanted Sequel');
  // Anime 1000 is NEVER suggested
  assert.ok(!candidates.some(c => c.malId === 1000));
});

test('matcher: excludes finished anime and historical releases', () => {
  const relationsMap = new Map([
    [21, {
      title: 'One Piece',
      relations: [
        // 20-year old movie
        { malId: 459, relationType: 'SIDE_STORY', title: 'One Piece Movie 01', releaseDate: '2000-03-04', status: 'FINISHED' },
        // Past movie in current year
        { malId: 460, relationType: 'SEQUEL', title: 'Old Sequel', releaseDate: '2025-01-01', status: 'FINISHED' },
        // Genuine upcoming
        { malId: 9999, relationType: 'SEQUEL', title: 'Future Arc', status: 'NOT_YET_RELEASED', releaseDate: '2027-01-01' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([21]),
    userLibraryMalIds: new Set([21]),
    ignoredMalIds: new Set(),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].malId, 9999);
  assert.equal(candidates[0].title, 'Future Arc');
});

test('matcher: excludes unverified relations with null date and null status', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Some Anime',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Unconfirmed Old Title', releaseDate: null, status: null },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([100]),
    userLibraryMalIds: new Set([100]),
    ignoredMalIds: new Set(),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 0);
});

test('matcher: excludes sequels that are already in user library (any status)', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Attack on Titan S1',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Attack on Titan S2', status: 'NOT_YET_RELEASED' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([100]),
    userLibraryMalIds: new Set([100, 200]), // 200 is in library
    ignoredMalIds: new Set(),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 0);
});

test('matcher: excludes ignored titles', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Some Anime',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Some Anime S2', status: 'NOT_YET_RELEASED' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([100]),
    userLibraryMalIds: new Set([100]),
    ignoredMalIds: new Set([200]),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 0);
});

test('matcher: deduplicates across multiple library entries linking to same sequel', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Season 1',
      relations: [{ malId: 300, relationType: 'SEQUEL', title: 'Season 3', status: 'NOT_YET_RELEASED' }],
    }],
    [200, {
      title: 'Season 2',
      relations: [{ malId: 300, relationType: 'SEQUEL', title: 'Season 3', status: 'NOT_YET_RELEASED' }],
    }],
  ]);

  const candidates = findSequelCandidates({
    userWatchedMalIds: new Set([100, 200]),
    userLibraryMalIds: new Set([100, 200]),
    ignoredMalIds: new Set(),
    relationsMap,
    todayStr: '2026-10-03',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].malId, 300);
});
