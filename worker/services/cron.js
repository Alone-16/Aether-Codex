/**
 * worker/services/cron.js
 * 
 * Multi-user automated sequel detection and date sync cron handler.
 * Respects Cloudflare Workers Free budget (<= 10 external subrequests per run).
 */

import { getRelationProviders } from '../providers/index.js';
import { findSequelCandidates } from './matcher.js';
import { computeDateUpdates } from './date_sync.js';

export async function runUpcomingSyncCron(env) {
  const startTime = Date.now();
  console.log('[Upcoming Cron] Starting automated sync run...');

  const providers = getRelationProviders(env);
  const primaryProvider = providers[0];
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── Step 1: In-memory bulk load from D1 (4 queries total) ──
  const [
    { results: upcomingRows },
    { results: allLibraryRows },
    { results: ignoredRows },
    { results: cacheRows },
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT id, user_id, mal_id, title, release_date, release_date_source, release_date_updated_at
      FROM media
      WHERE genre_id = 'anime' AND status = 'upcoming' AND mal_id IS NOT NULL;
    `).all(),
    env.DB.prepare(`
      SELECT id, user_id, mal_id, title, status
      FROM media
      WHERE genre_id = 'anime' AND mal_id IS NOT NULL;
    `).all(),
    env.DB.prepare(`SELECT user_id, mal_id FROM ignored_titles;`).all(),
    env.DB.prepare(`SELECT mal_id, provider, fetched_at, payload_json FROM relation_cache;`).all(),
  ]);

  // Group user libraries and ignored titles in memory
  const userLibraryMap = new Map(); // userId -> Set<malId>
  const userIgnoredMap = new Map(); // userId -> Set<malId>
  const allUpcomingMalIds = new Set();
  const allLibraryMalIds = new Set();

  for (const row of (allLibraryRows || [])) {
    if (!row.mal_id) continue;
    const numId = Number(row.mal_id);
    if (!userLibraryMap.has(row.user_id)) {
      userLibraryMap.set(row.user_id, new Set());
    }
    userLibraryMap.get(row.user_id).add(numId);
    allLibraryMalIds.add(numId);
  }

  for (const row of (upcomingRows || [])) {
    if (row.mal_id) allUpcomingMalIds.add(Number(row.mal_id));
  }

  for (const row of (ignoredRows || [])) {
    if (!userIgnoredMap.has(row.user_id)) {
      userIgnoredMap.set(row.user_id, new Set());
    }
    userIgnoredMap.get(row.user_id).add(Number(row.mal_id));
  }

  // Load relation cache into map
  const cachedRelationsMap = new Map(); // malId -> { fetchedAt, data }
  for (const row of (cacheRows || [])) {
    try {
      cachedRelationsMap.set(Number(row.mal_id), {
        fetchedAt: new Date(row.fetched_at).getTime(),
        provider: row.provider,
        data: JSON.parse(row.payload_json),
      });
    } catch (e) {}
  }

  let subrequestCount = 0;
  const maxSubrequests = 10; // Free tier safe ceiling

  // ── Step 2 (Priority A): Release Date Sync for Upcoming Anime ──
  const upcomingIdArray = Array.from(allUpcomingMalIds);
  let providerDatesMap = new Map();
  let activeDatesProvider = null;

  if (upcomingIdArray.length > 0 && subrequestCount < maxSubrequests) {
    for (const provider of providers) {
      const budget = Math.min(Math.max(1, maxSubrequests - subrequestCount - 4), 5);
      const dates = await provider.fetchDates(upcomingIdArray, budget);
      if (dates && dates.size > 0) {
        providerDatesMap = dates;
        activeDatesProvider = provider;
        subrequestCount += Math.min(dates.size, budget);
        break;
      }
    }
  }

  const { dbUpdates: dateUpdates, notifications: dateNotifications } = computeDateUpdates({
    trackedUpcomingItems: upcomingRows || [],
    providerDatesMap,
    todayStr,
  });

  // ── Step 3 (Priority B): Relations refresh for watched entries ──
  const now = Date.now();
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const idsNeedingRelations = [];
  for (const malId of allLibraryMalIds) {
    const cached = cachedRelationsMap.get(malId);
    if (!cached || (now - cached.fetchedAt) > CACHE_TTL_MS) {
      idsNeedingRelations.push(malId);
    }
  }

  // Sort stalest first
  idsNeedingRelations.sort((a, b) => {
    const tA = cachedRelationsMap.get(a)?.fetchedAt || 0;
    const tB = cachedRelationsMap.get(b)?.fetchedAt || 0;
    return tA - tB;
  });

  let newRelationsMap = new Map();
  let activeRelationProvider = activeDatesProvider || providers[0];
  const remainingBudget = Math.max(1, maxSubrequests - subrequestCount);

  if (idsNeedingRelations.length > 0 && remainingBudget > 0) {
    for (const provider of providers) {
      const relations = await provider.fetchRelations(idsNeedingRelations, remainingBudget);
      if (relations && relations.size > 0) {
        newRelationsMap = relations;
        activeRelationProvider = provider;
        subrequestCount += Math.min(relations.size, remainingBudget);
        break;
      }
    }
  }

  // Combine fresh relations with active cache
  const fullRelationsMap = new Map();
  for (const [malId, entry] of cachedRelationsMap.entries()) {
    fullRelationsMap.set(malId, entry.data);
  }
  for (const [malId, data] of newRelationsMap.entries()) {
    fullRelationsMap.set(malId, data);
  }

  // ── Step 4: Sequel Matching per User ──
  const sequelNotifications = [];
  for (const [userId, userLibrary] of userLibraryMap.entries()) {
    const userIgnored = userIgnoredMap.get(userId) || new Set();
    const candidates = findSequelCandidates({
      userLibraryMalIds: userLibrary,
      ignoredMalIds: userIgnored,
      relationsMap: fullRelationsMap,
    });

    for (const c of candidates) {
      sequelNotifications.push({
        userId,
        type: 'sequel_discovery',
        malId: c.malId,
        title: c.title,
        message: `New continuation announced for ${c.parentTitle}`,
        dedupeKey: c.dedupeKey,
        data: {
          match: { method: 'relation' },
          parent_title: c.parentTitle,
          parent_mal_id: c.parentMalId,
          release_date: c.releaseDate,
          format: c.format,
          poster: c.poster,
          status_hint: c.status,
          episodes: c.episodes,
        },
      });
    }
  }

  // ── Step 5: Atomically persist cache, updates, and notifications ──
  const batchStatements = [];

  // Save new relation cache items
  for (const [malId, data] of newRelationsMap.entries()) {
    batchStatements.push(
      env.DB.prepare(`
        INSERT OR REPLACE INTO relation_cache (mal_id, provider, fetched_at, payload_json)
        VALUES (?, ?, datetime('now'), ?);
      `).bind(malId, activeRelationProvider?.name || 'mal', JSON.stringify(data))
    );
  }

  // Save release date updates to media table
  for (const u of dateUpdates) {
    batchStatements.push(
      env.DB.prepare(`
        UPDATE media
        SET release_date = ?, release_date_source = ?, release_date_updated_at = ?
        WHERE id = ? AND user_id = ?;
      `).bind(u.releaseDate, u.releaseDateSource, u.releaseDateUpdatedAt, u.id, u.userId)
    );
  }

  // Save notifications (both date changes and sequel discoveries)
  const allNotifications = [...dateNotifications, ...sequelNotifications];
  for (const n of allNotifications) {
    batchStatements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO notifications (
          id, user_id, type, mal_id, media_id, title, message, data_json, dedupe_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
      `).bind(
        crypto.randomUUID(),
        n.userId,
        n.type,
        n.malId || null,
        n.mediaId || null,
        n.title,
        n.message,
        JSON.stringify(n.data || {}),
        n.dedupeKey
      )
    );
  }

  // Execute in batches of 50 statements (well under Cloudflare D1 batch limits)
  for (let i = 0; i < batchStatements.length; i += 50) {
    const chunk = batchStatements.slice(i, i + 50);
    await env.DB.batch(chunk);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Upcoming Cron] Finished in ${durationMs}ms: ${subrequestCount} subrequests, ${dateUpdates.length} dates updated, ${allNotifications.length} notifications queued, ${newRelationsMap.size} cache entries stored.`);

  return {
    success: true,
    durationMs,
    subrequestCount,
    upcomingCount: (upcomingRows || []).length,
    libraryCount: (allLibraryRows || []).length,
    idsNeedingRelationsCount: idsNeedingRelations.length,
    relationsIdsToFetchCount: relationsIdsToFetch.length,
    providerDatesMapSize: providerDatesMap.size,
    newRelationsMapSize: newRelationsMap.size,
    datesUpdated: dateUpdates.length,
    notificationsQueued: allNotifications.length,
    cacheEntriesStored: newRelationsMap.size,
    primaryProviderError: primaryProvider?.lastError || null,
  };
}
