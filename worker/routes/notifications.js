// ═══════════════════════════════════════════════════════════════════
//  worker/routes/notifications.js — In-App Notifications Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';

export async function handleNotificationsRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  // ── GET /v1/notifications — List notifications for user ──
  if (method === 'GET' && pathname === '/v1/notifications') {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    let query = `
      SELECT id, user_id, type, mal_id, media_id, title, message, data_json, dedupe_key, created_at, read_at, dismissed_at
      FROM notifications
      WHERE user_id = ? AND dismissed_at IS NULL
    `;
    if (unreadOnly) {
      query += ` AND read_at IS NULL`;
    }
    query += ` ORDER BY created_at DESC LIMIT 50;`;

    const { results } = await env.DB.prepare(query).bind(userId).all();

    // Also get total unread count
    const unreadCountRow = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL;
    `).bind(userId).first();

    const items = (results || []).map(row => {
      let data = {};
      try {
        if (row.data_json) data = JSON.parse(row.data_json);
      } catch (e) {}

      return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        malId: row.mal_id,
        mediaId: row.media_id,
        title: row.title,
        message: row.message,
        data,
        dedupeKey: row.dedupe_key,
        createdAt: row.created_at,
        readAt: row.read_at,
        dismissedAt: row.dismissed_at,
        isRead: Boolean(row.read_at),
      };
    });

    return successResponse({
      notifications: items,
      unreadCount: unreadCountRow?.count || 0,
    }, requestId);
  }

  // ── POST /v1/notifications/read-all — Mark all as read ──
  if (method === 'POST' && pathname === '/v1/notifications/read-all') {
    await env.DB.prepare(`
      UPDATE notifications
      SET read_at = datetime('now')
      WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL;
    `).bind(userId).run();

    return successResponse({ success: true }, requestId);
  }

  // ── Actions on specific notification /v1/notifications/:id/... ──
  if (pathname.startsWith('/v1/notifications/')) {
    const parts = pathname.split('/');
    const notifId = parts[3];
    const action = parts[4]; // 'read', 'dismiss', 'ignore', 'add'

    if (!notifId) {
      return errorResponse('INVALID_INPUT', 'Notification ID is required', requestId, 400);
    }

    // ── POST /v1/notifications/:id/read ──
    if (method === 'POST' && action === 'read') {
      const res = await env.DB.prepare(`
        UPDATE notifications
        SET read_at = datetime('now')
        WHERE id = ? AND user_id = ?;
      `).bind(notifId, userId).run();

      if (res.meta.changes === 0) {
        return errorResponse('NOT_FOUND', 'Notification not found', requestId, 404);
      }
      return successResponse({ success: true }, requestId);
    }

    // ── POST /v1/notifications/:id/dismiss ──
    if (method === 'POST' && action === 'dismiss') {
      const res = await env.DB.prepare(`
        UPDATE notifications
        SET dismissed_at = datetime('now')
        WHERE id = ? AND user_id = ?;
      `).bind(notifId, userId).run();

      if (res.meta.changes === 0) {
        return errorResponse('NOT_FOUND', 'Notification not found', requestId, 404);
      }
      return successResponse({ success: true }, requestId);
    }

    // ── POST /v1/notifications/:id/ignore ──
    if (method === 'POST' && action === 'ignore') {
      const notif = await env.DB.prepare(`
        SELECT id, mal_id FROM notifications WHERE id = ? AND user_id = ?;
      `).bind(notifId, userId).first();

      if (!notif) {
        return errorResponse('NOT_FOUND', 'Notification not found', requestId, 404);
      }

      if (notif.mal_id) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO ignored_titles (user_id, mal_id, ignored_at)
          VALUES (?, ?, datetime('now'));
        `).bind(userId, notif.mal_id).run();
      }

      await env.DB.prepare(`
        UPDATE notifications
        SET dismissed_at = datetime('now')
        WHERE id = ? AND user_id = ?;
      `).bind(notifId, userId).run();

      return successResponse({ success: true }, requestId);
    }

    // ── POST /v1/notifications/:id/add — 1-Click Add to Library (Idempotent) ──
    if (method === 'POST' && action === 'add') {
      const notif = await env.DB.prepare(`
        SELECT * FROM notifications WHERE id = ? AND user_id = ?;
      `).bind(notifId, userId).first();

      if (!notif) {
        return errorResponse('NOT_FOUND', 'Notification not found', requestId, 404);
      }

      let data = {};
      try {
        if (notif.data_json) data = JSON.parse(notif.data_json);
      } catch (e) {}

      // If notification already has media_id linked
      if (notif.media_id) {
        return successResponse({
          success: true,
          mediaId: notif.media_id,
          alreadyAdded: true,
        }, requestId);
      }

      // Check if item already exists in media for (user_id, genre_id = 'anime', mal_id)
      if (notif.mal_id) {
        const existing = await env.DB.prepare(`
          SELECT id FROM media WHERE user_id = ? AND genre_id = 'anime' AND mal_id = ? LIMIT 1;
        `).bind(userId, notif.mal_id).first();

        if (existing) {
          await env.DB.prepare(`
            UPDATE notifications
            SET media_id = ?, read_at = coalesce(read_at, datetime('now'))
            WHERE id = ? AND user_id = ?;
          `).bind(existing.id, notifId, userId).run();

          return successResponse({
            success: true,
            mediaId: existing.id,
            alreadyAdded: true,
          }, requestId);
        }
      }

      // Insert new upcoming entry into library
      const newMediaId = crypto.randomUUID();
      const title = notif.title;
      const releaseDate = data.new_date || data.release_date || null;
      const releaseDateSource = data.provider || 'anilist';
      const releaseDateUpdatedAt = releaseDate ? new Date().toISOString() : null;
      const coverImage = data.poster || null;
      const epTot = data.episodes ? String(data.episodes) : null;
      const notes = data.parent_title ? `Sequel to ${data.parent_title}` : null;

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO media (
            id, user_id, genre_id, title, status, mal_id,
            release_date, release_date_source, release_date_updated_at,
            cover_image, ep_tot, notes, created_at, updated_at
          ) VALUES (?, ?, 'anime', ?, 'upcoming', ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
        `).bind(
          newMediaId, userId, title, notif.mal_id || null,
          releaseDate, releaseDateSource, releaseDateUpdatedAt,
          coverImage, epTot, notes
        ),
        env.DB.prepare(`
          UPDATE notifications
          SET media_id = ?, read_at = coalesce(read_at, datetime('now'))
          WHERE id = ? AND user_id = ?;
        `).bind(newMediaId, notifId, userId),
      ]);

      return successResponse({
        success: true,
        mediaId: newMediaId,
        title,
      }, requestId, 201);
    }
  }

  return null; // Not handled by notifications router
}
