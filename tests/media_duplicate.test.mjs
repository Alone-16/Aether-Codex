import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMediaRoutes } from '../worker/routes/media.js';
import { _malSelect } from '../js/sections/media.js';

function createMockD1() {
  const media = new Map();

  return {
    media,
    prepare(sql) {
      const normSql = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...params) {
          return {
            async first() {
              if (normSql.includes('SELECT id, title FROM media WHERE user_id = ? AND genre_id = ? AND mal_id = ? LIMIT 1')) {
                const [userId, genreId, malId] = params;
                const found = Array.from(media.values()).find(
                  m => m.user_id === userId && m.genre_id === genreId && m.mal_id === malId
                );
                return found ? { id: found.id, title: found.title } : null;
              }
              if (normSql.includes('SELECT id, title FROM media WHERE user_id = ? AND genre_id = (SELECT genre_id FROM media WHERE id = ? AND user_id = ?) AND mal_id = ? AND id != ? LIMIT 1')) {
                const [userId, targetId, targetUserId, malId, excludeId] = params;
                const target = media.get(targetId);
                const genreId = target?.genre_id || 'anime';
                const found = Array.from(media.values()).find(
                  m => m.user_id === userId && m.genre_id === genreId && m.mal_id === malId && m.id !== excludeId
                );
                return found ? { id: found.id, title: found.title } : null;
              }
              if (normSql.includes('SELECT * FROM media WHERE id = ? AND user_id = ?')) {
                const [id, userId] = params;
                const m = media.get(id);
                return (m && m.user_id === userId) ? m : null;
              }
              return null;
            },
            async run() {
              if (normSql.includes('INSERT INTO media')) {
                const [id, userId, genreId, title, title_en, title_jp, status, score, ep_cur, ep_tot, ep_duration, start_date, end_date, airing_day, airing_time, release_date, release_date_source, release_date_updated_at, cover_image, watch_url, mal_id] = params;
                // Check unique constraint violation simulation
                const duplicate = Array.from(media.values()).some(
                  m => m.user_id === userId && m.genre_id === genreId && m.mal_id === mal_id && mal_id != null
                );
                if (duplicate) {
                  throw new Error('UNIQUE constraint failed: media.user_id, media.genre_id, media.mal_id');
                }
                const row = { id, user_id: userId, genre_id: genreId, title, status, mal_id };
                media.set(id, row);
                return { meta: { changes: 1 } };
              }
              if (normSql.includes('UPDATE media SET')) {
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            }
          };
        }
      };
    }
  };
}

test('POST /v1/media: prevents duplicate entry by MAL ID and returns 409 DUPLICATE_ENTRY', async () => {
  const db = createMockD1();
  const userId = 'usr_test123';
  db.media.set('item_existing', {
    id: 'item_existing',
    user_id: userId,
    genre_id: 'anime',
    title: "I'm Dating a Dark Summoner",
    status: 'watching',
    mal_id: 63509,
  });

  const req = new Request('https://api.test/v1/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: "I'm Dating a Dark Summoner",
      genre_id: 'anime',
      status: 'watching',
      mal_id: 63509,
    }),
  });

  const res = await handleMediaRoutes(req, { DB: db }, {}, 'req-1', '/v1/media', { sub: userId });
  assert.equal(res.status, 409);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'DUPLICATE_ENTRY');
  assert.ok(json.error.message.includes('already exists in your library'));
});

test('POST /v1/media: allows inserting anime with unique MAL ID', async () => {
  const db = createMockD1();
  const userId = 'usr_test123';
  db.media.set('item_existing', {
    id: 'item_existing',
    user_id: userId,
    genre_id: 'anime',
    title: 'Gachiakuta',
    status: 'watching',
    mal_id: 58895,
  });

  const req = new Request('https://api.test/v1/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Grandpa and Grandma Turn Young Again',
      genre_id: 'anime',
      status: 'watching',
      mal_id: 56230,
    }),
  });

  const res = await handleMediaRoutes(req, { DB: db }, {}, 'req-2', '/v1/media', { sub: userId });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.success, true);
});

test('PATCH /v1/media/:id: prevents updating mal_id to an existing duplicate in user library', async () => {
  const db = createMockD1();
  const userId = 'usr_test123';
  db.media.set('item_1', {
    id: 'item_1',
    user_id: userId,
    genre_id: 'anime',
    title: "I'm Dating a Dark Summoner",
    status: 'watching',
    mal_id: 63509,
  });
  db.media.set('item_2', {
    id: 'item_2',
    user_id: userId,
    genre_id: 'anime',
    title: 'Random Untitled',
    status: 'watching',
    mal_id: null,
  });

  const req = new Request('https://api.test/v1/media/item_2', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mal_id: 63509,
    }),
  });

  const res = await handleMediaRoutes(req, { DB: db }, {}, 'req-3', '/v1/media/item_2', { sub: userId });
  assert.equal(res.status, 409);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'DUPLICATE_ENTRY');
});

test('_malSelect: alerts and blocks autofill when anime is already in library', () => {
  let alertMessage = null;
  let alertOptions = null;
  globalThis.showAlert = (msg, opts) => {
    alertMessage = msg;
    alertOptions = opts;
  };

  const elements = {
    'f-status': { value: 'watching' },
    'f-airingday': { value: '' },
    'f-airingtime': { value: '' },
    'f-title': { value: 'Draft Title' },
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

  const appended = [];
  const origDocument = globalThis.document;
  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    createElement: () => ({
      appendChild: () => {},
      querySelector: () => ({ focus: () => {}, onclick: null }),
      addEventListener: () => {},
      remove: () => {},
      style: {},
      className: '',
      innerHTML: '',
    }),
    body: {
      appendChild: (el) => appended.push(el),
      removeChild: () => {},
    },
  };

  globalThis.DATA = [
    {
      id: 'existing_anime_1',
      title: "I'm Dating a Dark Summoner",
      genreId: 'anime',
      status: 'watching',
      malId: '63509',
    }
  ];
  globalThis.PEDIT = null; // Adding new anime

  try {
    const duplicateAnime = {
      id: 63509,
      title: "I'm Dating a Dark Summoner",
      title_en: "I'm Dating a Dark Summoner",
      episodes: 12,
      duration_min: 24,
    };

    _malSelect(JSON.stringify(duplicateAnime));

    // Form title MUST NOT have been overwritten
    assert.equal(elements['f-title'].value, 'Draft Title');
    assert.equal(elements['f-malid'].value, '');
    // Alert was shown via DOM modal
    assert.ok(appended.length > 0);
    const modalHtml = appended[0].innerHTML;
    assert.ok(modalHtml.includes('Anime Already Exists'));
    assert.ok(modalHtml.includes("I&#39;m Dating a Dark Summoner") || modalHtml.includes("I'm Dating a Dark Summoner"));
    assert.ok(modalHtml.includes('#63509'));
  } finally {
    globalThis.document = origDocument;
    delete globalThis.DATA;
    delete globalThis.PEDIT;
  }
});

test('_malSelect: allows selecting when editing the same anime (PEDIT matches)', () => {
  let alertMessage = null;
  globalThis.showAlert = (msg) => {
    alertMessage = msg;
  };

  const elements = {
    'f-status': { value: 'watching' },
    'f-airingday': { value: '' },
    'f-airingtime': { value: '' },
    'f-title': { value: 'Existing Title' },
    'f-malid': { value: '63509' },
    'f-malid-input': { value: '63509' },
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
  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    createElement: () => ({
      appendChild: () => {},
      querySelector: () => ({ focus: () => {}, onclick: null }),
      addEventListener: () => {},
      remove: () => {},
      style: {},
      className: '',
      innerHTML: '',
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };

  globalThis.DATA = [
    {
      id: 'existing_anime_1',
      title: "I'm Dating a Dark Summoner",
      genreId: 'anime',
      status: 'watching',
      malId: '63509',
    }
  ];
  globalThis.PEDIT = 'existing_anime_1'; // Editing THIS anime

  try {
    const sameAnime = {
      id: 63509,
      title: "I'm Dating a Dark Summoner",
      title_en: "I'm Dating a Dark Summoner",
      episodes: 12,
      duration_min: 24,
    };

    _malSelect(JSON.stringify(sameAnime));

    // Alert was NOT shown
    assert.equal(alertMessage, null);
    assert.equal(elements['f-malid'].value, '63509');
  } finally {
    globalThis.document = origDocument;
    delete globalThis.showAlert;
    delete globalThis.DATA;
    delete globalThis.PEDIT;
  }
});
