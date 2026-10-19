/**
 * worker/services/airing_cache.js
 * 
 * Shared Airing Cache & Shikimori Integration Service
 * Manages deduplicated released episode counts across all users.
 */

const USER_AGENT = 'AetherCodex/1.0 (contact: nadeempubgmobile@gmail.com)';
const SHIKIMORI_DOMAIN = 'shikimori.io';

/**
 * Pure calculation rule for released episodes.
 * Handles all edge cases:
 *  - Title in calendar: released = max(0, next_episode - 1)
 *  - Not in calendar, status 'released': max(episodes, episodes_aired) (handles Netflix batch ONAs)
 *  - Not in calendar, status 'ongoing': episodes_aired
 *  - status 'anons': 0
 *  - Clamps and handles invalid / episode-0 specials safely
 */
export function calculateReleasedCount({ inCalendar, status, nextEpisode, episodesAired, episodes }) {
  const normStatus = (status || '').toLowerCase().trim();
  const epAiredNum = Number.isFinite(Number(episodesAired)) ? Math.max(0, Number(episodesAired)) : 0;
  const epTotNum = Number.isFinite(Number(episodes)) ? Math.max(0, Number(episodes)) : 0;

  if (normStatus === 'anons') {
    return 0;
  }

  if (inCalendar) {
    const nextEpNum = Number(nextEpisode);
    if (Number.isFinite(nextEpNum) && nextEpNum > 0) {
      return Math.max(0, nextEpNum - 1);
    }
    // Fallback if next_episode is missing or 0 in calendar
    return epAiredNum;
  }

  if (normStatus === 'released') {
    // For batch-released ONAs, episodes_aired can be 0 while episodes has full count.
    return Math.max(epTotNum, epAiredNum);
  }

  if (normStatus === 'ongoing') {
    return epAiredNum;
  }

  return Math.max(epTotNum, epAiredNum);
}

/**
 * Calculates unseen episodes given released and user watched count.
 * Never negative, clamped to 0.
 */
export function calculateUnseenCount(releasedEps, watchedEps) {
  const rel = Number.isFinite(Number(releasedEps)) ? Math.max(0, Number(releasedEps)) : 0;
  const wat = Number.isFinite(Number(watchedEps)) ? Math.max(0, Number(watchedEps)) : 0;
  return Math.max(0, rel - wat);
}

/**
 * Parse an ISO-8601 string to unix seconds UTC.
 */
export function parseIsoToUnixSeconds(isoString) {
  if (!isoString) return null;
  const ms = new Date(isoString).getTime();
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/**
 * Fetch with strict timeout and descriptive User-Agent.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Executes a full or incremental airing sync against Shikimori.
 * Respects free tier limits (typically 1-3 subrequests total).
 */
export async function syncAiringCache(env, options = {}) {
  const startTime = Date.now();
  const { forceBatch = false, targetMalId = null } = options;

  console.log(`[Airing Sync] Starting sync run (forceBatch: ${forceBatch}, targetMalId: ${targetMalId})...`);

  // 1. Get all distinct MAL IDs for anime in Watching status across all users
  let malIdRows;
  if (targetMalId) {
    malIdRows = [{ mal_id: Number(targetMalId) }];
  } else {
    const res = await env.DB.prepare(`
      SELECT DISTINCT mal_id 
      FROM media 
      WHERE genre_id = 'anime' AND status = 'watching' AND mal_id IS NOT NULL;
    `).all();
    malIdRows = res.results || [];
  }

  const watchingMalIds = new Set(malIdRows.map(r => Number(r.mal_id)).filter(id => id > 0));
  if (watchingMalIds.size === 0) {
    console.log('[Airing Sync] No watching anime with MAL IDs found. Skipping.');
    return { success: true, checked: 0, updated: 0, durationMs: Date.now() - startTime };
  }

  let subrequestCount = 0;
  let calendarItems = [];
  const calendarMap = new Map();

  // 2. Step 1: ONE calendar request to Shikimori
  try {
    subrequestCount++;
    const calRes = await fetchWithTimeout(`https://${SHIKIMORI_DOMAIN}/api/calendar`);
    if (calRes.ok) {
      calendarItems = await calRes.json();
      if (Array.isArray(calendarItems)) {
        for (const item of calendarItems) {
          if (item && item.anime && item.anime.id) {
            calendarMap.set(Number(item.anime.id), item);
          }
        }
      } else {
        console.warn('[Airing Sync] Malformed calendar JSON (expected array). Keeping existing cache.');
      }
    } else {
      console.warn(`[Airing Sync] Calendar returned HTTP ${calRes.status}. Keeping existing cache.`);
    }
  } catch (err) {
    console.warn(`[Airing Sync] Calendar fetch failed: ${err.message}. Keeping existing cache.`);
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const upsertStatements = [];
  const missingFromCalendar = [];

  // Match calendar entries for watching titles
  for (const malId of watchingMalIds) {
    const calItem = calendarMap.get(malId);
    if (calItem) {
      const anime = calItem.anime;
      const releasedEps = calculateReleasedCount({
        inCalendar: true,
        status: anime.status,
        nextEpisode: calItem.next_episode,
        episodesAired: anime.episodes_aired,
        episodes: anime.episodes
      });
      const totalEps = Number(anime.episodes) || 0;
      const nextEpNo = calItem.next_episode || null;
      const nextEpAt = parseIsoToUnixSeconds(calItem.next_episode_at);
      const shikiStatus = anime.status || 'ongoing';

      upsertStatements.push(
        env.DB.prepare(`
          INSERT INTO airing_cache (mal_id, released_eps, total_eps, next_ep_no, next_ep_at, shiki_status, source, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, 'calendar', ?)
          ON CONFLICT(mal_id) DO UPDATE SET
            released_eps = excluded.released_eps,
            total_eps = excluded.total_eps,
            next_ep_no = excluded.next_ep_no,
            next_ep_at = excluded.next_ep_at,
            shiki_status = excluded.shiki_status,
            source = excluded.source,
            checked_at = excluded.checked_at;
        `).bind(malId, releasedEps, totalEps, nextEpNo, nextEpAt, shikiStatus, nowUnix)
      );
    } else {
      missingFromCalendar.push(malId);
    }
  }

  // 3. Step 2: Batch fetch for watching titles not found in the calendar
  // Run if forceBatch is true OR targetMalId was missing OR we have missing items
  if (missingFromCalendar.length > 0 && (forceBatch || targetMalId || missingFromCalendar.length > 0)) {
    // Chunk missing into batches of 50
    const chunks = [];
    for (let i = 0; i < missingFromCalendar.length; i += 50) {
      chunks.push(missingFromCalendar.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      try {
        subrequestCount++;
        const batchUrl = `https://${SHIKIMORI_DOMAIN}/api/animes?ids=${chunk.join(',')}&limit=50`;
        const batchRes = await fetchWithTimeout(batchUrl);
        if (batchRes.ok) {
          const batchData = await batchRes.json();
          if (Array.isArray(batchData)) {
            for (const item of batchData) {
              const mId = Number(item.id);
              const releasedEps = calculateReleasedCount({
                inCalendar: false,
                status: item.status,
                nextEpisode: null,
                episodesAired: item.episodes_aired,
                episodes: item.episodes
              });
              const totalEps = Number(item.episodes) || 0;
              const shikiStatus = item.status || 'released';

              upsertStatements.push(
                env.DB.prepare(`
                  INSERT INTO airing_cache (mal_id, released_eps, total_eps, next_ep_no, next_ep_at, shiki_status, source, checked_at)
                  VALUES (?, ?, ?, NULL, NULL, ?, 'batch', ?)
                  ON CONFLICT(mal_id) DO UPDATE SET
                    released_eps = excluded.released_eps,
                    total_eps = excluded.total_eps,
                    next_ep_no = NULL,
                    next_ep_at = NULL,
                    shiki_status = excluded.shiki_status,
                    source = excluded.source,
                    checked_at = excluded.checked_at;
                `).bind(mId, releasedEps, totalEps, shikiStatus, nowUnix)
              );
            }
          }
        } else {
          console.warn(`[Airing Sync] Batch fetch returned HTTP ${batchRes.status}. Keeping existing cache.`);
        }
      } catch (err) {
        console.warn(`[Airing Sync] Batch fetch failed: ${err.message}. Keeping existing cache.`);
      }
    }
  }

  // Execute DB upserts in batches if any
  let updatedCount = 0;
  if (upsertStatements.length > 0) {
    try {
      // D1 supports batching up to 100 statements
      for (let i = 0; i < upsertStatements.length; i += 80) {
        const batchSlice = upsertStatements.slice(i, i + 80);
        await env.DB.batch(batchSlice);
      }
      updatedCount = upsertStatements.length;
    } catch (dbErr) {
      console.error('[Airing Sync DB Error]', dbErr.message);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Airing Sync Completed] Watching titles: ${watchingMalIds.size}, In Calendar: ${calendarMap.size}, Cache Updates: ${updatedCount}, Subrequests: ${subrequestCount}, Duration: ${durationMs}ms`);

  return {
    success: true,
    totalWatching: watchingMalIds.size,
    matchedInCalendar: calendarItems.length,
    updatedRows: updatedCount,
    subrequests: subrequestCount,
    durationMs
  };
}

/**
 * Trigger immediate single-title refresh when anime is added or set to Watching.
 */
export async function refreshAiringCacheForMalId(env, malId) {
  if (!malId) return;
  try {
    await syncAiringCache(env, { forceBatch: true, targetMalId: Number(malId) });
  } catch (e) {
    console.warn(`[Airing Sync Single Error for MAL ${malId}]`, e.message);
  }
}
