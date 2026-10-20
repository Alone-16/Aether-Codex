import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMediaRoutes } from '../worker/routes/media.js';
import { askDel } from '../js/sections/media.js';
import { DATA, setDATA, ls, K } from '../js/shared/utils.js';

function createMockD1(initialMedia = []) {
  const media = new Map(initialMedia.map(m => [m.id, { ...m }]));
  const rewatches = new Map();

  return {
    media,
    rewatches,
    prepare(sql) {
      const normSql = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...params) {
          return {
            async first() {
              if (normSql.includes('FROM media WHERE id = ? AND user_id = ?')) {
                const [id, userId] = params;
                const m = media.get(id);
                return (m && m.user_id === userId) ? m : null;
              }
              return null;
            },
            async all() {
              if (normSql.includes('FROM media') && normSql.includes('user_id = ?')) {
                const [userId] = params;
                const results = Array.from(media.values()).filter(m => m.user_id === userId);
                return { results };
              }
              if (normSql.includes('FROM rewatches WHERE user_id = ?')) {
                const [userId] = params;
                const results = Array.from(rewatches.values()).filter(r => r.user_id === userId);
                return { results };
              }
              return { results: [] };
            },
            async run() {
              if (normSql.includes('DELETE FROM rewatches WHERE media_id = ? AND user_id = ?')) {
                const [mediaId, userId] = params;
                let count = 0;
                for (const [k, v] of rewatches.entries()) {
                  if (v.media_id === mediaId && v.user_id === userId) {
                    rewatches.delete(k);
                    count++;
                  }
                }
                return { meta: { changes: count } };
              }
              if (normSql.includes('DELETE FROM media WHERE id = ? AND user_id = ?')) {
                const [id, userId] = params;
                const m = media.get(id);
                if (m && m.user_id === userId) {
                  media.delete(id);
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (normSql.includes('INSERT INTO media')) {
                const [id, userId, genreId, title, title_en, title_jp, status] = params;
                media.set(id, { id, user_id: userId, genre_id: genreId, title, status });
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

test('DELETE /v1/media/:id permanently deletes item from D1 database and cleans rewatches', async () => {
  const db = createMockD1([
    { id: 'entry-123', user_id: 'user-001', genre_id: 'anime', title: 'Frieren: Beyond Journey\'s End', status: 'completed' },
    { id: 'entry-456', user_id: 'user-001', genre_id: 'anime', title: 'Steins;Gate', status: 'completed' }
  ]);
  db.rewatches.set('rw-1', { id: 'rw-1', media_id: 'entry-123', user_id: 'user-001' });

  const env = { DB: db };
  const claims = { sub: 'user-001' };

  // 1. Send DELETE request
  const req = new Request('https://api.aethercodex.dev/v1/media/entry-123', { method: 'DELETE' });
  const res = await handleMediaRoutes(req, env, {}, 'req-del-1', '/v1/media/entry-123', claims);
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.deleted, true);
  assert.equal(json.data.id, 'entry-123');

  // Verify item is removed from database
  assert.equal(db.media.has('entry-123'), false);
  assert.equal(db.media.has('entry-456'), true);
  assert.equal(db.rewatches.has('rw-1'), false);

  // 2. Fetch list (simulating reload) - entry-123 must not be returned
  const getReq = new Request('https://api.aethercodex.dev/v1/media', { method: 'GET' });
  const getRes = await handleMediaRoutes(getReq, env, {}, 'req-get-1', '/v1/media', claims);
  const getJson = await getRes.json();

  assert.equal(getJson.success, true);
  assert.equal(getJson.data.length, 1);
  assert.equal(getJson.data[0].id, 'entry-456');
  assert.equal(getJson.data[0].title, 'Steins;Gate');
});

test('askDel: removes entry, logs deletion, updates localStorage, and calls mediaApi.delete', async () => {
  let deletedApiId = null;
  let createdApiItem = null;
  let loggedAction = null;
  let undoCallback = null;

  const okBtn = { onclick: null, focus: () => {} };
  const cancelBtn = { onclick: null, focus: () => {} };

  globalThis.document = {
    createElement: () => ({
      className: '',
      innerHTML: '',
      style: {},
      remove: () => {},
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel === '#modal-ok') return okBtn;
        if (sel === '#modal-cancel') return cancelBtn;
        return { onclick: null, focus: () => {} };
      }
    }),
    getElementById: () => ({
      classList: { remove: () => {}, add: () => {} },
      style: {},
      innerHTML: '',
    }),
    querySelectorAll: () => [],
    body: {
      appendChild: () => {}
    }
  };

  globalThis.GACTIVE = 'anime';
  globalThis.SEARCH = '';
  globalThis.CURRENT = 'media';
  globalThis.GENRES = [{ id: 'anime', name: 'Anime' }];

  globalThis.window = {
    DATA: [],
    closePanel: () => {},
    renderMediaBody: () => {},
    mediaApi: {
      delete: async (id) => { deletedApiId = id; return { success: true }; },
      create: async (item) => { createdApiItem = item; return { success: true }; },
    }
  };
  globalThis.closePanel = () => {};
  globalThis.renderMediaBody = () => {};
  globalThis.addLog = (section, action, title) => {
    loggedAction = { section, action, title };
  };
  globalThis.toastWithUndo = (title, onUndo) => {
    undoCallback = onUndo;
  };

  const initialData = [
    { id: 'media-del-1', title: 'Attack on Titan', status: 'completed' },
    { id: 'media-del-2', title: 'Vinland Saga', status: 'watching' }
  ];
  setDATA(initialData);
  ls.set(K.DATA, initialData);

  // Call askDel
  askDel('media-del-1');

  // Trigger modal confirmation
  assert.ok(typeof okBtn.onclick === 'function', 'showConfirm should set okBtn.onclick');
  okBtn.onclick();

  // 1. Removed from in-memory DATA
  assert.equal(DATA.length, 1);
  assert.equal(DATA[0].id, 'media-del-2');

  // 2. Logged to Activity Log
  assert.deepEqual(loggedAction, { section: 'media', action: 'Deleted', title: 'Attack on Titan' });

  // 3. Saved to localStorage
  const savedInLs = ls.get(K.DATA);
  assert.equal(savedInLs.length, 1);
  assert.equal(savedInLs[0].id, 'media-del-2');

  // 4. mediaApi.delete called with correct ID
  assert.equal(deletedApiId, 'media-del-1');

  // 5. Simulating browser reload:
  // Both localStorage and API now have only media-del-2
  assert.equal(ls.get(K.DATA).some(x => x.id === 'media-del-1'), false);

  // 6. Test undo functionality
  assert.ok(undoCallback, 'toastWithUndo should provide an undo callback');
  undoCallback();

  assert.equal(DATA.length, 2);
  assert.equal(createdApiItem?.id, 'media-del-1');
  assert.equal(ls.get(K.DATA).some(x => x.id === 'media-del-1'), true);
});

test('askDel: automatically triggers MAL list deletion when entry has malId and MAL is connected', async () => {
  let malDeletedId = null;
  let malSyncedEntry = null;
  let deletedApiId = null;
  let undoCallback = null;

  const okBtn = { onclick: null, focus: () => {} };
  globalThis.document = {
    createElement: () => ({
      className: '',
      innerHTML: '',
      style: {},
      remove: () => {},
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel === '#modal-ok') return okBtn;
        return { onclick: null, focus: () => {} };
      },
    }),
    getElementById: () => ({
      classList: { remove: () => {}, add: () => {} },
      style: {},
      innerHTML: '',
      querySelectorAll: () => [],
    }),
    querySelectorAll: () => [],
    body: { appendChild: () => {} }
  };

  globalThis.GACTIVE = 'anime';
  globalThis.SEARCH = '';
  globalThis.CURRENT = 'media';
  globalThis.GENRES = [{ id: 'anime', name: 'Anime' }];
  globalThis.SETTINGS = {
    malAccessToken: 'mock-mal-token',
    malRefreshToken: 'mock-mal-refresh',
  };

  globalThis.window = {
    DATA: [],
    SETTINGS: globalThis.SETTINGS,
    closePanel: () => {},
    renderMediaBody: () => {},
    mediaApi: {
      delete: async (id) => { deletedApiId = id; return { success: true }; },
      create: async (item) => ({ success: true }),
    },
    _WORKER: 'https://api.test',
  };

  globalThis.closePanel = () => {};
  globalThis.renderMediaBody = () => {};
  globalThis.addLog = () => {};
  globalThis.toastWithUndo = (title, onUndo) => { undoCallback = onUndo; };

  // Intercept fetch for Worker /mal/list/16498 calls
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (url.includes('/mal/list/')) {
      const id = url.split('/mal/list/')[1];
      if (opts.method === 'DELETE') {
        malDeletedId = id;
        return new Response(JSON.stringify({ success: true, data: { deleted: true } }), { status: 200 });
      }
      if (opts.method === 'PATCH' || opts.method === 'PUT') {
        malSyncedEntry = id;
        return new Response(JSON.stringify({ success: true, data: { updated: true } }), { status: 200 });
      }
    }
    return origFetch(url, opts);
  };

  const animeList = [
    { id: 'anime-mal-1', malId: '16498', genreId: 'anime', title: 'Attack on Titan', status: 'completed' },
  ];
  setDATA(animeList);
  ls.set(K.DATA, animeList);

  try {
    // Call askDel
    askDel('anime-mal-1');

    // Confirm modal
    assert.ok(typeof okBtn.onclick === 'function');
    okBtn.onclick();

    // Wait a tick for async MAL deletion
    await new Promise(r => setTimeout(r, 50));

    // Verify removed locally, deleted in D1, and deleted on MAL
    assert.equal(DATA.length, 0);
    assert.equal(deletedApiId, 'anime-mal-1');
    assert.equal(malDeletedId, '16498');

    // Verify undo restores to MAL
    assert.ok(undoCallback);
    undoCallback();
    await new Promise(r => setTimeout(r, 50));

    assert.equal(DATA.length, 1);
    assert.equal(malSyncedEntry, '16498');
  } finally {
    globalThis.fetch = origFetch;
  }
});
