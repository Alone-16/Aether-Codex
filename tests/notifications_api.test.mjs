import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNotificationsRoutes } from '../worker/routes/notifications.js';

// Simple mock D1 database
function createMockDb() {
  const notifications = new Map();
  const ignored = new Set();
  const media = new Map();

  return {
    notifications,
    ignored,
    media,
    prepare(sql) {
      const normSql = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...params) {
          return {
            async all() {
              if (normSql.includes('FROM notifications') && normSql.includes('WHERE user_id = ?')) {
                const userId = params[0];
                const list = Array.from(notifications.values()).filter(n => n.user_id === userId && !n.dismissed_at);
                return { results: list };
              }
              return { results: [] };
            },
            async first() {
              if (normSql.includes('COUNT(*) AS count FROM notifications')) {
                const userId = params[0];
                const count = Array.from(notifications.values()).filter(n => n.user_id === userId && !n.read_at && !n.dismissed_at).length;
                return { count };
              }
              if (normSql.includes('FROM notifications WHERE id = ? AND user_id = ?')) {
                const [id, userId] = params;
                const n = notifications.get(id);
                return (n && n.user_id === userId) ? n : null;
              }
              if (normSql.includes('SELECT id FROM media WHERE user_id = ? AND genre_id = \'anime\' AND mal_id = ?')) {
                const [userId, malId] = params;
                const item = Array.from(media.values()).find(m => m.user_id === userId && m.genre_id === 'anime' && m.mal_id === malId);
                return item || null;
              }
              return null;
            },
            async run() {
              if (normSql.includes('UPDATE notifications SET read_at = datetime(\'now\') WHERE id = ? AND user_id = ?')) {
                const [id, userId] = params;
                const n = notifications.get(id);
                if (n && n.user_id === userId) {
                  n.read_at = '2026-10-03T10:00:00Z';
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (normSql.includes('UPDATE notifications SET read_at = datetime(\'now\') WHERE user_id = ?')) {
                const [userId] = params;
                let count = 0;
                for (const n of notifications.values()) {
                  if (n.user_id === userId && !n.read_at) {
                    n.read_at = '2026-10-03T10:00:00Z';
                    count++;
                  }
                }
                return { meta: { changes: count } };
              }
              if (normSql.includes('UPDATE notifications SET dismissed_at = datetime(\'now\') WHERE user_id = ? AND read_at IS NOT NULL')) {
                const [userId] = params;
                let count = 0;
                for (const n of notifications.values()) {
                  if (n.user_id === userId && n.read_at && !n.dismissed_at) {
                    n.dismissed_at = '2026-10-03T10:00:00Z';
                    count++;
                  }
                }
                return { meta: { changes: count } };
              }
              if (normSql.includes('UPDATE notifications SET dismissed_at = datetime(\'now\') WHERE id = ? AND user_id = ?')) {
                const [id, userId] = params;
                const n = notifications.get(id);
                if (n && n.user_id === userId) {
                  n.dismissed_at = '2026-10-03T10:00:00Z';
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (normSql.includes('INSERT OR IGNORE INTO ignored_titles')) {
                const [userId, malId] = params;
                ignored.add(`${userId}:${malId}`);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) {
      for (const st of statements) {
        // execute mock statements
      }
      return [];
    },
  };
}

test('notifications_api: GET /v1/notifications lists unread and total', async () => {
  const db = createMockDb();
  db.notifications.set('n1', {
    id: 'n1',
    user_id: 'user1',
    type: 'sequel_discovery',
    mal_id: 12345,
    title: 'Frieren Season 2',
    message: 'New season announced',
    data_json: JSON.stringify({ release_date: '2026-10-15', poster: 'https://example.com/p.jpg' }),
    created_at: '2026-10-03T08:00:00Z',
    read_at: null,
    dismissed_at: null,
  });

  const req = new Request('http://localhost/v1/notifications', { method: 'GET' });
  const res = await handleNotificationsRoutes(req, { DB: db }, {}, 'req1', '/v1/notifications', { sub: 'user1' });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.notifications.length, 1);
  assert.equal(json.data.unreadCount, 1);
  assert.equal(json.data.notifications[0].title, 'Frieren Season 2');
  assert.equal(json.data.notifications[0].data.release_date, '2026-10-15');
});

test('notifications_api: POST /v1/notifications/:id/read marks read', async () => {
  const db = createMockDb();
  db.notifications.set('n1', {
    id: 'n1',
    user_id: 'user1',
    title: 'Frieren S2',
    read_at: null,
  });

  const req = new Request('http://localhost/v1/notifications/n1/read', { method: 'POST' });
  const res = await handleNotificationsRoutes(req, { DB: db }, {}, 'req2', '/v1/notifications/n1/read', { sub: 'user1' });

  assert.equal(res.status, 200);
  assert.ok(db.notifications.get('n1').read_at);
});

test('notifications_api: IDOR protection returns 404 when modifying another user notification', async () => {
  const db = createMockDb();
  db.notifications.set('n1', {
    id: 'n1',
    user_id: 'user_A',
    title: 'Private',
  });

  // User B tries to read/dismiss User A's notification
  const req = new Request('http://localhost/v1/notifications/n1/read', { method: 'POST' });
  const res = await handleNotificationsRoutes(req, { DB: db }, {}, 'req3', '/v1/notifications/n1/read', { sub: 'user_B' });

  assert.equal(res.status, 404);
});

test('notifications_api: POST /v1/notifications/:id/ignore ignores title and dismisses', async () => {
  const db = createMockDb();
  db.notifications.set('n2', {
    id: 'n2',
    user_id: 'user1',
    mal_id: 9999,
    title: 'Unwanted Sequel',
  });

  const req = new Request('http://localhost/v1/notifications/n2/ignore', { method: 'POST' });
  const res = await handleNotificationsRoutes(req, { DB: db }, {}, 'req4', '/v1/notifications/n2/ignore', { sub: 'user1' });

  assert.equal(res.status, 200);
  assert.ok(db.ignored.has('user1:9999'));
  assert.ok(db.notifications.get('n2').dismissed_at);
});

test('notifications_api: POST /v1/notifications/:id/add idempotently creates media entry', async () => {
  const db = createMockDb();
  db.notifications.set('n3', {
    id: 'n3',
    user_id: 'user1',
    mal_id: 8888,
    title: 'Attack on Titan Sequel',
    data_json: JSON.stringify({ release_date: '2027-01-10', episodes: 12, parent_title: 'Attack on Titan' }),
  });

  const req = new Request('http://localhost/v1/notifications/n3/add', { method: 'POST' });
  const res = await handleNotificationsRoutes(req, { DB: db }, {}, 'req5', '/v1/notifications/n3/add', { sub: 'user1' });

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.ok(json.data.mediaId);
  assert.equal(json.data.title, 'Attack on Titan Sequel');
  assert.equal(json.data.success, true);
});

test('notifications_api: POST /v1/notifications/clear-read deletes read notifications', async () => {
  const db = createMockDb();
  db.notifications.set('n1', { id: 'n1', user_id: 'user1', read_at: '2026-10-03', dismissed_at: null });
  db.notifications.set('n2', { id: 'n2', user_id: 'user1', read_at: null, dismissed_at: null });
  db.notifications.set('n3', { id: 'n3', user_id: 'user2', read_at: '2026-10-03', dismissed_at: null });

  const req = new Request('http://localhost/v1/notifications/clear-read', { method: 'POST' });
  const res = await handleNotificationsRoutes(req, { DB: db }, {}, 'req6', '/v1/notifications/clear-read', { sub: 'user1' });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.count, 1);
  assert.ok(db.notifications.get('n1').dismissed_at);
  assert.equal(db.notifications.get('n2').dismissed_at, null);
  assert.equal(db.notifications.get('n3').dismissed_at, null);
});

