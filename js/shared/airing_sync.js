// ═══════════════════════════════════════════════════════════════════
//  airing_sync.js — Automatic Airing Anime MAL Sync & Midnight Scheduler
// ═══════════════════════════════════════════════════════════════════

import { DATA, ls, saveData } from './utils.js';
import { API_BASE, mediaApi } from './api.js';
import { toast } from './ui.js';

/**
 * Checks if a media entry is actively broadcasting weekly episodes.
 * Returns false if finished, not airing, or not in watching status.
 */
export function isMediaAiring(e) {
  if (!e || e.status !== 'watching') return false;
  if (e.airingDay == null || e.airingDay === '' || e.airingDay === 'finished') return false;
  const d = parseInt(e.airingDay, 10);
  return !isNaN(d) && d >= 0 && d <= 6;
}

/**
 * Returns formatted YYYY-MM-DD string for a Date in local time.
 */
export function getLocalDateStr(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Determines whether an airing check is due for an entry.
 *
 * Designed to handle:
 *  - Scheduled release day checks (at midnight or post-air)
 *  - Delayed broadcasts (episode aired late or aired tomorrow)
 *  - Moderator lag on MyAnimeList (MAL marking finished 12-24h after finale)
 *  - Daily midnight reconciliation without redundant intra-day polling
 */
export function isAiringCheckDue(e, force = false, now = new Date()) {
  if (force) return true;

  const todayStr = getLocalDateStr(now);
  const lastCheckDate = ls.str(`ac_airing_last_check_${e.id}`);
  const lastCheckTimestamp = parseInt(ls.str(`ac_airing_last_ts_${e.id}`) || '0', 10);

  // 1. Never checked before -> immediate check due
  if (!lastCheckDate) return true;

  // 2. New day reached (midnight rollover or next-day check) -> check due!
  // This ensures that if an episode was supposed to end yesterday but aired late / tomorrow,
  // it checks today without waiting for next week!
  if (lastCheckDate !== todayStr) return true;

  // 3. Post-air window check on the release day:
  // If today is the episode release day, and scheduled airingTime has passed,
  // but the previous check today occurred before the episode aired -> check due!
  const airingDayNum = parseInt(e.airingDay, 10);
  if (!isNaN(airingDayNum) && now.getDay() === airingDayNum && e.airingTime) {
    const parts = e.airingTime.split(':');
    if (parts.length >= 2) {
      const airH = parseInt(parts[0], 10);
      const airM = parseInt(parts[1], 10);
      if (!isNaN(airH) && !isNaN(airM)) {
        const airTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), airH, airM, 0).getTime();
        if (now.getTime() >= airTimeToday && lastCheckTimestamp < airTimeToday) {
          return true;
        }
      }
    }
  }

  // Already checked today and no post-air window triggered
  return false;
}

/**
 * Fetches anime airing status from MyAnimeList v2 API proxy with Jikan fallback.
 */
export async function fetchAnimeMalStatus(malId) {
  const numericId = String(malId || '').replace(/\D/g, '');
  if (!numericId) return null;

  // 1. Try Primary Cloudflare Worker MAL v2 API Proxy
  try {
    const workerUrl = window._WORKER || API_BASE || '';
    const res = await fetch(`${workerUrl}/mal/anime/${numericId}`);
    if (res.ok) {
      const json = await res.json();
      const d = json.data || json;
      if (d && d.status) {
        const isFinished = d.status === 'finished_airing';
        const isAiring = d.status === 'currently_airing';
        return {
          source: 'mal_proxy',
          status: d.status,
          isFinished,
          isAiring,
          episodes: d.num_episodes || null,
          endDate: d.end_date || null,
          broadcast: d.broadcast || null,
          title: d.title || null,
        };
      }
    }
  } catch (err) {
    console.warn(`[AiringSync] Worker MAL fetch failed for ID ${numericId}, trying Jikan fallback...`, err);
  }

  // 2. Fallback to Jikan v4 API
  try {
    const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${numericId}`);
    if (jikanRes.ok) {
      const jikanJson = await jikanRes.json();
      const d = jikanJson.data;
      if (d) {
        const isFinished = d.airing === false || d.status === 'Finished Airing';
        const isAiring = d.airing === true || d.status === 'Currently Airing';
        return {
          source: 'jikan',
          status: isFinished ? 'finished_airing' : (isAiring ? 'currently_airing' : 'other'),
          isFinished,
          isAiring,
          episodes: d.episodes || null,
          endDate: d.aired?.to ? d.aired.to.split('T')[0] : null,
          broadcast: d.broadcast || null,
          title: d.title || null,
        };
      }
    }
  } catch (err) {
    console.warn(`[AiringSync] Jikan fetch failed for ID ${numericId}:`, err);
  }

  return null;
}

let _isCheckingAiring = false;

/**
 * Checks currently airing anime against MyAnimeList.
 * If an anime is finished:
 *   - airingDay is set to 'finished'
 *   - airingTime is reset to null
 *   - DB & DATA are updated
 *   - Anime will no longer appear in the calendar widget
 * If still airing:
 *   - Marked as checked for today.
 *   - If the episode was delayed to tomorrow, tomorrow's check will re-verify immediately.
 */
export async function checkAiringAnime(force = false) {
  if (_isCheckingAiring) return;
  _isCheckingAiring = true;

  try {
    const mediaList = window.DATA || DATA;
    if (!Array.isArray(mediaList) || !mediaList.length) return;

    // Filter anime that are set to airing (have a valid day 0..6 and not finished)
    const airingList = mediaList.filter(isMediaAiring);
    if (!airingList.length) return;

    const now = new Date();
    const todayStr = getLocalDateStr(now);
    const updatedAnime = [];

    for (let i = 0; i < airingList.length; i++) {
      const e = airingList[i];
      if (!e.malId) continue;

      if (!isAiringCheckDue(e, force, now)) {
        continue;
      }

      // Throttle slightly between requests (350ms) to respect rate limits
      if (i > 0) {
        await new Promise(r => setTimeout(r, 350));
      }

      const info = await fetchAnimeMalStatus(e.malId);
      if (!info) continue;

      // Always record that this anime was checked today
      ls.setStr(`ac_airing_last_check_${e.id}`, todayStr);
      ls.setStr(`ac_airing_last_ts_${e.id}`, String(Date.now()));

      if (info.isFinished) {
        // Anime has finished airing!
        e.airingDay = 'finished';
        e.airingTime = null;
        if (info.episodes && (!e.epTot || e.epTot === 0 || e.epTot === '0')) {
          e.epTot = String(info.episodes);
        }
        if (info.endDate && !e.endDate) {
          e.endDate = info.endDate;
        }

        e.updatedAt = Date.now();
        updatedAnime.push(e);

        // Update Cloudflare D1
        mediaApi.patch(e.id, {
          airing_day: 'finished',
          airingDay: 'finished',
          airing_time: null,
          airingTime: null,
          ep_tot: e.epTot,
          epTot: e.epTot,
          end_date: e.endDate,
          endDate: e.endDate,
        }).catch(err => console.warn(`[AiringSync] D1 patch failed for ${e.id}:`, err));
      } else if (info.isAiring) {
        // Still airing — update total episodes or end date if newly announced
        let changed = false;
        if (info.episodes && (!e.epTot || e.epTot === 0 || e.epTot === '0')) {
          e.epTot = String(info.episodes);
          changed = true;
        }
        if (info.endDate && !e.endDate) {
          e.endDate = info.endDate;
          changed = true;
        }

        if (changed) {
          mediaApi.patch(e.id, {
            ep_tot: e.epTot,
            epTot: e.epTot,
            end_date: e.endDate,
            endDate: e.endDate,
          }).catch(() => {});
        }
      }
    }

    if (updatedAnime.length > 0) {
      saveData(mediaList);

      // Re-render UI elements (Airing Widget, Calendar Pills, Media List)
      if (typeof window.renderAiringWidget === 'function') {
        const curAiringDay = typeof window.AIRING_DAY !== 'undefined' ? window.AIRING_DAY : new Date().getDay();
        if (typeof window.selectAiringDay === 'function') {
          window.selectAiringDay(curAiringDay);
        }
      }
      if (typeof window.renderMediaBody === 'function') {
        window.renderMediaBody();
      }
      if (typeof window.render === 'function') {
        window.render();
      }

      const msg = updatedAnime.length === 1
        ? `📺 "${updatedAnime[0].title}" finished airing — calendar schedule updated!`
        : `📺 Airing update: ${updatedAnime.length} anime finished airing!`;
      toast(msg, '#38bdf8');
    } else if (force) {
      toast('✓ All airing anime checked — schedules up to date', '#4ade80');
    }
  } catch (err) {
    console.error('[AiringSync] Execution error:', err);
  } finally {
    _isCheckingAiring = false;
  }
}

/**
 * Schedules midnight timer and day-rollover listeners.
 */
export function initAiringSync() {
  // 1. Initial check on startup after data loads
  setTimeout(() => {
    checkAiringAnime(false);
  }, 2000);

  // 2. Schedule precise midnight callback
  scheduleMidnightTimer();

  // 3. Periodic day-change detection & tab visibility check
  let lastSeenDate = new Date().toDateString();

  setInterval(() => {
    const today = new Date().toDateString();
    if (today !== lastSeenDate) {
      lastSeenDate = today;
      console.info('[AiringSync] Date change detected — checking airing anime...');
      checkAiringAnime(false);
    }
  }, 10 * 60 * 1000); // Check every 10 minutes

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const today = new Date().toDateString();
        if (today !== lastSeenDate) {
          lastSeenDate = today;
          console.info('[AiringSync] Tab active on new day — checking airing anime...');
          checkAiringAnime(false);
        }
      }
    });
  }
}

function scheduleMidnightTimer() {
  const now = new Date();
  // Next midnight: 00:00:05 (5 seconds past midnight for clean date rollover)
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = Math.max(1000, nextMidnight.getTime() - now.getTime());

  setTimeout(() => {
    try {
      console.info('[AiringSync] Midnight reached — executing episode release check...');
      checkAiringAnime(false);
    } finally {
      scheduleMidnightTimer();
    }
  }, ms);
}
