import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  _extractMalId,
  _normalizeWorkerAnime,
  _normalizeJikanAnime,
  fetchAnimeByMalId,
  _malSelect,
} from '../js/sections/media.js';

test('_extractMalId: correctly extracts numeric IDs from various formats', () => {
  // Pure digits
  assert.equal(_extractMalId('12345'), '12345');
  assert.equal(_extractMalId('16498'), '16498');
  assert.equal(_extractMalId('  52991  '), '52991');
  assert.equal(_extractMalId('1'), '1');

  // MAL URLs
  assert.equal(
    _extractMalId('https://myanimelist.net/anime/16498/shingeki_no_kyojin'),
    '16498'
  );
  assert.equal(
    _extractMalId('http://myanimelist.net/anime/52991'),
    '52991'
  );
  assert.equal(
    _extractMalId('myanimelist.net/anime/12345'),
    '12345'
  );
  assert.equal(
    _extractMalId('https://myanimelist.net/manga/13/one_piece'),
    '13'
  );
  assert.equal(
    _extractMalId('anime/16498'),
    '16498'
  );

  // Prefixed formats (#, id:, mal:)
  assert.equal(_extractMalId('#16498'), '16498');
  assert.equal(_extractMalId('# 16498'), '16498');
  assert.equal(_extractMalId('id:16498'), '16498');
  assert.equal(_extractMalId('id: 16498'), '16498');
  assert.equal(_extractMalId('mal:52991'), '52991');
  assert.equal(_extractMalId('mal 52991'), '52991');
});

test('_extractMalId: returns null for titles and non-ID queries', () => {
  assert.equal(_extractMalId('Attack on Titan'), null);
  assert.equal(_extractMalId('Mob Psycho 100'), null);
  assert.equal(_extractMalId('Bleach 2020'), null);
  assert.equal(_extractMalId('12345abc'), null);
  assert.equal(_extractMalId(''), null);
  assert.equal(_extractMalId(null), null);
  assert.equal(_extractMalId(undefined), null);
});

test('_normalizeWorkerAnime: properly structures raw Worker MAL response', () => {
  const rawWorker = {
    id: 16498,
    title: 'Shingeki no Kyojin',
    alternative_titles: {
      en: 'Attack on Titan',
      ja: '進撃の巨人'
    },
    main_picture: {
      medium: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',
      large: 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg'
    },
    num_episodes: 25,
    average_episode_duration: 1440,
    synopsis: 'Centuries ago, humanity was pushed to the brink...',
    mean: 8.54,
    status: 'finished_airing',
    media_type: 'tv',
    start_date: '2013-04-07',
    broadcast: {
      day_of_the_week: 'sunday',
      start_time: '01:58'
    }
  };

  const norm = _normalizeWorkerAnime(rawWorker);
  assert.equal(norm.id, 16498);
  assert.equal(norm.title, 'Shingeki no Kyojin');
  assert.equal(norm.title_en, 'Attack on Titan');
  assert.equal(norm.image, 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg');
  assert.equal(norm.episodes, 25);
  assert.equal(norm.duration_min, 24);
  assert.equal(norm.status, 'finished_airing');
  assert.equal(norm.score, 8.54);
  assert.equal(norm.media_type, 'tv');
  assert.equal(norm.start_date, '2013-04-07');
  assert.deepEqual(norm.broadcast, { day_of_the_week: 'sunday', start_time: '01:58' });
});

test('_normalizeJikanAnime: properly structures raw Jikan v4 response', () => {
  const rawJikan = {
    mal_id: 52991,
    title: 'Sousou no Frieren',
    title_english: "Frieren: Beyond Journey's End",
    images: {
      jpg: {
        image_url: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
        large_image_url: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg'
      }
    },
    episodes: 28,
    duration: '24 min per ep',
    synopsis: 'During their decade-long quest...',
    score: 9.32,
    status: 'Finished Airing',
    type: 'TV',
    aired: {
      from: '2023-09-29T14:00:00+00:00'
    },
    broadcast: {
      day: 'Fridays',
      time: '23:00',
      timezone: 'Asia/Tokyo'
    }
  };

  const norm = _normalizeJikanAnime(rawJikan);
  assert.equal(norm.id, 52991);
  assert.equal(norm.title, 'Sousou no Frieren');
  assert.equal(norm.title_en, "Frieren: Beyond Journey's End");
  assert.equal(norm.image, 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg');
  assert.equal(norm.episodes, 28);
  assert.equal(norm.duration_min, 24);
  assert.equal(norm.status, 'finished_airing');
  assert.equal(norm.score, 9.32);
  assert.equal(norm.media_type, 'tv');
  assert.equal(norm.start_date, '2023-09-29');
  assert.deepEqual(norm.broadcast, { day_of_the_week: 'friday', start_time: '23:00' });
});

test('fetchAnimeByMalId: successfully retrieves anime details for a valid MAL ID', async () => {
  const anime = await fetchAnimeByMalId(16498);
  assert.ok(anime);
  assert.equal(anime.id, 16498);
  assert.ok(anime.title.includes('Shingeki no Kyojin') || anime.title.includes('Attack on Titan'));
  assert.equal(anime.episodes, 25);
  assert.ok(anime.image);
});

test('fetchAnimeByMalId: throws user-friendly error for non-existent MAL ID', async () => {
  await assert.rejects(
    async () => {
      await fetchAnimeByMalId(12345);
    },
    (err) => {
      return err instanceof Error && (err.message.includes('not found') || err.message.includes('Could not find'));
    }
  );
});

function createMockDoc(elements) {
  return {
    getElementById: (id) => elements[id] || null,
    createElement: () => ({
      appendChild: () => {},
      setAttribute: () => {},
      classList: { add: () => {}, remove: () => {} },
      style: {},
      remove: () => {},
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };
}

test('_malSelect: does not overwrite status to finish/completed for finished anime, keeps watching', () => {
  const elements = {
    'f-status': { value: 'watching' },
    'f-airingday': { value: '' },
    'f-airingtime': { value: '' },
    'f-title': { value: '' },
    'f-malid': { value: '' },
    'f-malid-input': { value: '' },
    'f-malimg': { value: '' },
    'f-notes': { value: '' },
    'f-eptot': { value: '' },
    'f-epduration': { value: '' },
    'f-releasedate': { value: '' },
    'f-releasedate-source': { value: '' },
    'f-genre': { value: 'anime' },
    'mal-search-inp': { value: '' },
    'mal-search-clear-btn': { style: {} },
    'mal-dropdown': { style: {} },
    'mal-badge-container': { innerHTML: '' },
    'mal-cover-wrap': { style: {} },
    'mal-cover-img': { src: '', style: {} },
  };

  const origDocument = globalThis.document;
  globalThis.document = createMockDoc(elements);

  try {
    const finishedAnime = {
      id: 16498,
      title: 'Attack on Titan',
      status: 'finished_airing',
      episodes: 25,
      duration_min: 24,
    };

    _malSelect(JSON.stringify(finishedAnime));

    // Status MUST NOT be overwritten to completed!
    assert.equal(elements['f-status'].value, 'watching');
    // Airing day should be set to finished
    assert.equal(elements['f-airingday'].value, 'finished');
  } finally {
    globalThis.document = origDocument;
  }
});

test('_malSelect: autofills status to upcoming when anime is not yet aired', () => {
  const elements = {
    'f-status': { value: 'watching' },
    'f-airingday': { value: '' },
    'f-airingtime': { value: '' },
    'f-title': { value: '' },
    'f-malid': { value: '' },
    'f-malid-input': { value: '' },
    'f-malimg': { value: '' },
    'f-notes': { value: '' },
    'f-eptot': { value: '' },
    'f-epduration': { value: '' },
    'f-releasedate': { value: '2027-01-01' },
    'f-releasedate-source': { value: '' },
    'f-genre': { value: 'anime' },
    'mal-search-inp': { value: '' },
    'mal-search-clear-btn': { style: {} },
    'mal-dropdown': { style: {} },
    'mal-badge-container': { innerHTML: '' },
    'mal-cover-wrap': { style: {} },
    'mal-cover-img': { src: '', style: {} },
  };

  const origDocument = globalThis.document;
  globalThis.document = createMockDoc(elements);

  try {
    const upcomingAnime = {
      id: 99999,
      title: 'Upcoming Adventure S2',
      status: 'not_yet_aired',
      episodes: 12,
      duration_min: 24,
      start_date: '2027-01-01',
    };

    _malSelect(JSON.stringify(upcomingAnime));

    // Status MUST be autofilled to upcoming
    assert.equal(elements['f-status'].value, 'upcoming');
    // Airing day must NOT be set to finished
    assert.equal(elements['f-airingday'].value, '');
  } finally {
    globalThis.document = origDocument;
  }
});

test('_malSelect: preserves custom user status like plan-to-watch and defaults to watching if empty', () => {
  const elements = {
    'f-status': { value: 'plan' },
    'f-airingday': { value: '' },
    'f-airingtime': { value: '' },
    'f-title': { value: '' },
    'f-malid': { value: '' },
    'f-malid-input': { value: '' },
    'f-malimg': { value: '' },
    'f-notes': { value: '' },
    'f-eptot': { value: '' },
    'f-epduration': { value: '' },
    'f-releasedate': { value: '' },
    'f-releasedate-source': { value: '' },
    'f-genre': { value: 'anime' },
    'mal-search-inp': { value: '' },
    'mal-search-clear-btn': { style: {} },
    'mal-dropdown': { style: {} },
    'mal-badge-container': { innerHTML: '' },
    'mal-cover-wrap': { style: {} },
    'mal-cover-img': { src: '', style: {} },
  };

  const origDocument = globalThis.document;
  globalThis.document = createMockDoc(elements);

  try {
    const finishedAnime = {
      id: 52991,
      title: 'Frieren',
      status: 'finished_airing',
    };

    // 1. With existing 'plan' status
    _malSelect(JSON.stringify(finishedAnime));
    assert.equal(elements['f-status'].value, 'plan');

    // 2. With empty status, defaults to watching
    elements['f-status'].value = '';
    _malSelect(JSON.stringify(finishedAnime));
    assert.equal(elements['f-status'].value, 'watching');

    // 3. With 'not_started' status, defaults to watching
    elements['f-status'].value = 'not_started';
    _malSelect(JSON.stringify(finishedAnime));
    assert.equal(elements['f-status'].value, 'watching');
  } finally {
    globalThis.document = origDocument;
  }
});

