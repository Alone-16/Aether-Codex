import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSequelCandidates } from '../worker/services/matcher.js';

test('matcher: finds sequel candidates when parent is in library', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Solo Leveling Season 1',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Solo Leveling Season 2', releaseDate: '2026-01-05', format: 'TV' },
        { malId: 101, relationType: 'PREQUEL', title: 'Solo Leveling Prologue' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userLibraryMalIds: new Set([100]),
    ignoredMalIds: new Set(),
    relationsMap,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].malId, 200);
  assert.equal(candidates[0].title, 'Solo Leveling Season 2');
  assert.equal(candidates[0].parentMalId, 100);
  assert.equal(candidates[0].dedupeKey, 'sequel:200');
  assert.equal(candidates[0].releaseDate, '2026-01-05');
});

test('matcher: excludes sequels that are already in library', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Attack on Titan S1',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Attack on Titan S2' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userLibraryMalIds: new Set([100, 200]),
    ignoredMalIds: new Set(),
    relationsMap,
  });

  assert.equal(candidates.length, 0);
});

test('matcher: excludes ignored titles', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Some Anime',
      relations: [
        { malId: 200, relationType: 'SEQUEL', title: 'Some Anime S2' },
      ],
    }],
  ]);

  const candidates = findSequelCandidates({
    userLibraryMalIds: new Set([100]),
    ignoredMalIds: new Set([200]),
    relationsMap,
  });

  assert.equal(candidates.length, 0);
});

test('matcher: deduplicates across multiple library entries linking to same sequel', () => {
  const relationsMap = new Map([
    [100, {
      title: 'Season 1',
      relations: [{ malId: 300, relationType: 'SEQUEL', title: 'Season 3' }],
    }],
    [200, {
      title: 'Season 2',
      relations: [{ malId: 300, relationType: 'SEQUEL', title: 'Season 3' }],
    }],
  ]);

  const candidates = findSequelCandidates({
    userLibraryMalIds: new Set([100, 200]),
    ignoredMalIds: new Set(),
    relationsMap,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].malId, 300);
});
