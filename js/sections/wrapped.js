// ═══════════════════════════════════════════════════════════════════
//  WRAPPED — SPOTIFY-STYLE MONTHLY, YEARLY & ALL-TIME CODEX SUMMARY
// ═══════════════════════════════════════════════════════════════════

import { esc, gbyid } from '../shared/utils.js';
import { toast } from '../shared/ui.js';

// ── Internal State ────────────────────────────────────────────────
const now = new Date();
let wrappedState = {
  mode: 'monthly',       // 'monthly' | 'yearly' | 'all_time'
  view: 'overview',      // 'overview' | 'story'
  selectedYear: now.getFullYear(),
  selectedMonth: now.getMonth(), // 0..11
  storyIndex: 0,
  isModal: false,
};

// ── Time & Timestamp Utilities ────────────────────────────────────
function toMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') {
    // If less than 1e11 (epoch year 1973 in ms; year 2026 in seconds ~1.75e9), it's in seconds
    return val < 1e11 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      return num < 1e11 ? num * 1000 : num;
    }
    const parsed = new Date(val).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function getSafeData(key, fallbackGlobal) {
  if (Array.isArray(window[fallbackGlobal])) return window[fallbackGlobal];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.tracks)) return parsed.tracks;
    }
  } catch {}
  return [];
}

// ── Compute Analytics Engine ──────────────────────────────────────
function computeStats(mode, selectedYear, selectedMonth) {
  let startMs = 0;
  let endMs = Infinity;
  let timeLabel = 'All Time';
  const isAllTime = mode === 'all_time';

  if (mode === 'monthly') {
    const startDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
    const endDate   = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
    startMs = startDate.getTime();
    endMs   = endDate.getTime();
    timeLabel = startDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  } else if (mode === 'yearly') {
    const startDate = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
    const endDate   = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    startMs = startDate.getTime();
    endMs   = endDate.getTime();
    timeLabel = String(selectedYear);
  }

  // 1. Ingest datasets with safe fallbacks
  const mediaAll = Array.isArray(window.DATA) ? window.DATA : getSafeData('ac_v4_data', 'DATA');
  const gamesAll = Array.isArray(window.GDATA) ? window.GDATA : getSafeData('ac_v4_games', 'GDATA');
  const booksAll = Array.isArray(window.BDATA) ? window.BDATA : getSafeData('ac_v4_books', 'BDATA');
  const musicAll = Array.isArray(window.MDATA) ? window.MDATA : getSafeData('ac_v4_music', 'MDATA');
  const notesAll = Array.isArray(window.NDATA) ? window.NDATA : getSafeData('ac_v4_notes', 'NDATA');
  const vaultAll = Array.isArray(window.VDATA_PUBLIC) ? window.VDATA_PUBLIC : getSafeData('ac_v4_vault_public', 'VDATA_PUBLIC');
  const logsAll  = Array.isArray(window.LDATA) ? window.LDATA : getSafeData('ac_v4_log', 'LDATA');

  // Helper: check if item had any timestamp inside range
  function isItemActive(item) {
    if (isAllTime) return true;
    const timestamps = [];
    if (item.updatedAt) timestamps.push(toMs(item.updatedAt));
    if (item.addedAt)   timestamps.push(toMs(item.addedAt));
    if (item.endDate) {
      const t = toMs(item.endDate);
      if (t) timestamps.push(t);
    }
    if (item.startDate) {
      const t = toMs(item.startDate);
      if (t) timestamps.push(t);
    }
    if (Array.isArray(item.rewatches)) {
      item.rewatches.forEach(r => {
        if (r.endDate) timestamps.push(toMs(r.endDate));
        if (r.startDate) timestamps.push(toMs(r.startDate));
        if (r.created_at) timestamps.push(toMs(r.created_at));
      });
    }
    if (!timestamps.length) return false;
    return timestamps.some(t => t >= startMs && t <= endMs);
  }

  // ── Media Analytics ──
  const mediaInRange = mediaAll.filter(isItemActive);
  const mediaCompleted = mediaInRange.filter(e => {
    if (e.status !== 'completed') return false;
    if (isAllTime) return true;
    const endT = toMs(e.endDate || e.updatedAt);
    return endT >= startMs && endT <= endMs;
  });
  const mediaNewAdded = mediaAll.filter(e => {
    const addT = toMs(e.addedAt || e.created_at);
    return isAllTime ? true : (addT >= startMs && addT <= endMs);
  });
  const mediaWatching = mediaInRange.filter(e => e.status === 'watching');

  let totalEps = 0;
  let totalWatchMin = 0;
  let rewatchCountInPeriod = 0;

  mediaInRange.forEach(e => {
    const dur = parseInt(e.epDuration || 24, 10) || 24;
    const tl = e.timeline || [];
    let eps = 0;
    if (tl.length) {
      eps = tl.filter(t => t.type === 'season').reduce((s, t) => s + parseInt(t.epWatched || 0, 10), 0);
    } else {
      eps = parseInt(e.epCur || 0, 10);
    }
    // Rewatches in range
    if (Array.isArray(e.rewatches)) {
      e.rewatches.forEach(r => {
        const rT = toMs(r.endDate || r.startDate || r.created_at);
        if (isAllTime || (rT >= startMs && rT <= endMs)) {
          const rEps = parseInt(r.epWatched || 0, 10);
          eps += rEps;
          rewatchCountInPeriod++;
        }
      });
    }
    totalEps += eps;
    totalWatchMin += eps * dur;
  });

  const totalWatchHours = Math.round(totalWatchMin / 60);
  const totalWatchDays  = (totalWatchMin / 1440).toFixed(1);

  // Top Genres
  const genreCount = {};
  mediaInRange.forEach(e => {
    const gid = e.genreId || 'all';
    genreCount[gid] = (genreCount[gid] || 0) + 1;
  });
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, cnt]) => {
      const g = (typeof gbyid === 'function') ? gbyid(id) : { name: id, color: '#38bdf8' };
      const pct = mediaInRange.length ? Math.round((cnt / mediaInRange.length) * 100) : 0;
      return { id, name: g?.name || id, color: g?.color || '#38bdf8', cnt, pct };
    });

  // Top Rated Media
  const topRatedMedia = [...mediaInRange]
    .filter(e => e.rating || e.score)
    .sort((a, b) => (parseFloat(b.rating || b.score) || 0) - (parseFloat(a.rating || a.score) || 0))
    .slice(0, 4);

  // ── Games Analytics ──
  const gamesInRange = gamesAll.filter(isItemActive);
  const gamesCompleted = gamesInRange.filter(g => g.status === 'completed');
  const gamesPlaying   = gamesInRange.filter(g => g.status === 'playing');
  const totalGameHours = gamesInRange.reduce((a, g) => a + (parseFloat(g.totalHours || g.hours_played || 0) || 0), 0);
  const platformCounts = {};
  gamesInRange.forEach(g => {
    const p = (g.platform || 'pc').toUpperCase();
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  });
  const topPlatform = Object.entries(platformCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'PC';
  const topRatedGames = [...gamesInRange]
    .filter(g => g.rating)
    .sort((a,b)=>(parseFloat(b.rating)||0)-(parseFloat(a.rating)||0))
    .slice(0, 3);

  // ── Books Analytics ──
  const booksInRange = booksAll.filter(isItemActive);
  const booksCompleted = booksInRange.filter(b => b.status === 'completed');
  const booksReading   = booksInRange.filter(b => b.status === 'reading');
  let totalPagesRead = 0;
  booksInRange.forEach(b => {
    if (typeof window.bookEntryStats === 'function') {
      try {
        const st = window.bookEntryStats(b);
        if (st && st.cur) totalPagesRead += st.cur;
        return;
      } catch {}
    }
    totalPagesRead += parseInt(b.currentPage || b.progress_cur || 0, 10);
  });
  const topRatedBooks = [...booksInRange]
    .filter(b => b.rating)
    .sort((a,b)=>(parseFloat(b.rating)||0)-(parseFloat(a.rating)||0))
    .slice(0, 3);

  // ── Music Analytics ──
  const musicInRange = musicAll.filter(isItemActive);
  const totalMusicSec = musicInRange.reduce((a, t) => a + (parseInt(t.duration_sec || 210, 10) || 210), 0);
  const totalMusicHours = (totalMusicSec / 3600).toFixed(1);
  const artistCounts = {};
  musicInRange.forEach(t => {
    const art = (t.artist || '').trim();
    if (art) artistCounts[art] = (artistCounts[art] || 0) + 1;
  });
  const topArtists = Object.entries(artistCounts).sort((a,b)=>b[1]-a[1]).slice(0, 3);

  // ── Notes & Vault ──
  const notesInRange = notesAll.filter(isItemActive);
  const vaultInRange = vaultAll.filter(isItemActive);

  // ── Codex Total Engagement Hours ──
  const totalCodexHours = Math.round(totalWatchHours + totalGameHours + (totalPagesRead / 60) + parseFloat(totalMusicHours));

  // ── Completion & Velocity Rate ──
  const totalCompletedAll = mediaCompleted.length + gamesCompleted.length + booksCompleted.length;
  const totalItemsTracked = mediaInRange.length + gamesInRange.length + booksInRange.length;
  const completionRate = totalItemsTracked > 0 ? Math.round((totalCompletedAll / totalItemsTracked) * 100) : 0;

  // ── Archetype & Persona Generation ──
  let archetype = {
    title: 'Omniverse Connoisseur',
    icon: '✦',
    tag: 'POLYMEDIA MASTER',
    description: 'A refined traveler balancing cinema, virtual worlds, and literary realms with celestial elegance.',
    color: '#38bdf8',
    bg: 'linear-gradient(135deg, rgba(56,189,248,.18), rgba(168,85,247,.18))',
    border: 'rgba(56,189,248,.35)',
  };

  const topGenreName = topGenres[0]?.name?.toLowerCase() || '';
  if (totalWatchHours >= 30 && (topGenreName.includes('anime') || topGenreName.includes('drama'))) {
    archetype = {
      title: 'Celestial Otaku',
      icon: '🌌',
      tag: 'IMMERSIVE STORY ARCHITECT',
      description: 'Your world moves to the cadence of legendary story arcs, breathtaking animation, and emotional finales.',
      color: '#f472b6',
      bg: 'linear-gradient(135deg, rgba(244,114,182,.2), rgba(129,140,248,.2))',
      border: 'rgba(244,114,182,.4)',
    };
  } else if (totalGameHours >= 20 && totalGameHours >= totalWatchHours) {
    archetype = {
      title: 'Apex Tactician',
      icon: '⚔️',
      tag: 'VIRTUAL REALM CONQUEROR',
      description: 'Campaigns cleared, trophies secured, and reflex perfection. No digital domain is safe from your conquest.',
      color: '#38bdf8',
      bg: 'linear-gradient(135deg, rgba(56,189,248,.2), rgba(34,197,94,.2))',
      border: 'rgba(56,189,248,.4)',
    };
  } else if (totalPagesRead >= 350 || booksCompleted.length >= 2) {
    archetype = {
      title: 'Grand Scribe & Scholar',
      icon: '📚',
      tag: 'LITERARY ASCENDANT',
      description: 'Devouring prose, turning pages at terminal velocity, and preserving wisdom across your codex.',
      color: '#fbbf24',
      bg: 'linear-gradient(135deg, rgba(251,191,36,.2), rgba(249,115,22,.2))',
      border: 'rgba(251,191,36,.4)',
    };
  } else if (totalWatchHours >= 45) {
    archetype = {
      title: 'Hyperspace Marathoner',
      icon: '⚡',
      tag: 'SEASON BINGE CHAMPION',
      description: '"Just one more episode" was not a question — it was a sacred promise kept across midnight skies.',
      color: '#a855f7',
      bg: 'linear-gradient(135deg, rgba(168,85,247,.22), rgba(236,72,153,.22))',
      border: 'rgba(168,85,247,.4)',
    };
  } else if (completionRate >= 70 && totalCompletedAll >= 3) {
    archetype = {
      title: 'The Absolute Finisher',
      icon: '🏆',
      tag: 'ZERO BACKLOG WARRIOR',
      description: 'Where others leave trails of unfinished quests, you deliver closure and victory to every title you touch.',
      color: '#4ade80',
      bg: 'linear-gradient(135deg, rgba(74,222,128,.2), rgba(56,189,248,.2))',
      border: 'rgba(74,222,128,.4)',
    };
  } else if (musicInRange.length >= 10) {
    archetype = {
      title: 'Sonic Orbit Curatist',
      icon: '🎧',
      tag: 'AUDIO HARMONIST',
      description: 'Life without the right melody is incomplete. Your audio archives resonate with pure aesthetic frequency.',
      color: '#818cf8',
      bg: 'linear-gradient(135deg, rgba(129,140,248,.2), rgba(236,72,153,.2))',
      border: 'rgba(129,140,248,.4)',
    };
  }

  // ── Highlights array ──
  const highlights = [];
  if (totalEps > 0) highlights.push(`Watched <b>${totalEps.toLocaleString()} episodes</b> (${totalWatchHours}h total screen time).`);
  if (mediaCompleted.length > 0) highlights.push(`Completed <b>${mediaCompleted.length} show${mediaCompleted.length!==1?'s':''} / movie${mediaCompleted.length!==1?'s':''}</b>.`);
  if (totalGameHours > 0) highlights.push(`Logged <b>${totalGameHours.toFixed(1)}h of gaming</b> across ${topPlatform}.`);
  if (gamesCompleted.length > 0) highlights.push(`Finished <b>${gamesCompleted.length} game title${gamesCompleted.length!==1?'s':''}</b>.`);
  if (totalPagesRead > 0) highlights.push(`Devoured <b>${totalPagesRead.toLocaleString()} book pages</b>.`);
  if (booksCompleted.length > 0) highlights.push(`Conquered <b>${booksCompleted.length} book${booksCompleted.length!==1?'s':''}</b>.`);
  if (musicInRange.length > 0) highlights.push(`Curated <b>${musicInRange.length} music track${musicInRange.length!==1?'s':''}</b>.`);
  if (rewatchCountInPeriod > 0) highlights.push(`Revisited favorite stories with <b>${rewatchCountInPeriod} rewatch session${rewatchCountInPeriod!==1?'s':''}</b>.`);
  if (!highlights.length) highlights.push('No activity recorded in this timeframe yet. Log some entries or check past periods!');

  return {
    timeLabel,
    isAllTime,
    totalCodexHours,
    media: {
      inRange: mediaInRange,
      totalEps,
      totalWatchHours,
      totalWatchDays,
      completed: mediaCompleted,
      watching: mediaWatching,
      newAdded: mediaNewAdded,
      topGenres,
      topRated: topRatedMedia,
      rewatches: rewatchCountInPeriod,
    },
    games: {
      inRange: gamesInRange,
      completed: gamesCompleted,
      playing: gamesPlaying,
      totalHours: totalGameHours,
      topPlatform,
      topRated: topRatedGames,
    },
    books: {
      inRange: booksInRange,
      completed: booksCompleted,
      reading: booksReading,
      totalPages: totalPagesRead,
      topRated: topRatedBooks,
    },
    music: {
      inRange: musicInRange,
      totalTracks: musicInRange.length,
      totalHours: totalMusicHours,
      topArtists,
    },
    notes: { count: notesInRange.length },
    vault: { count: vaultInRange.length },
    logs:  { count: logsAll.filter(isItemActive).length },
    completionRate,
    archetype,
    highlights,
  };
}

// ── Copy Shareable Summary Card ───────────────────────────────────
function copyShareableSummary(stats) {
  const lines = [
    `✦ THE AETHER CODEX WRAPPED ✦`,
    `📅 ${stats.timeLabel}`,
    ``,
    `✨ Archetype: ${stats.archetype.title} ${stats.archetype.icon}`,
    `⏱ Total Immersion: ${stats.totalCodexHours}h`,
    ``,
    stats.media.totalEps > 0 ? `📺 Media: ${stats.media.totalEps} Episodes (${stats.media.totalWatchHours}h) · ${stats.media.completed.length} Completed` : null,
    stats.media.topGenres[0] ? `🎭 Top Genre: ${stats.media.topGenres[0].name} (${stats.media.topGenres[0].pct}%)` : null,
    stats.media.topRated[0]  ? `⭐ Top Rated: ${stats.media.topRated[0].title} (★ ${stats.media.topRated[0].rating || stats.media.topRated[0].score})` : null,
    stats.games.totalHours > 0 ? `🎮 Games: ${stats.games.totalHours.toFixed(0)}h Played · ${stats.games.completed.length} Beaten (${stats.games.topPlatform})` : null,
    stats.books.totalPages > 0 ? `📚 Books: ${stats.books.totalPages} Pages Read · ${stats.books.completed.length} Completed` : null,
    stats.music.totalTracks > 0 ? `🎵 Music: ${stats.music.totalTracks} Tracks in Collection` : null,
    `🏆 Completion Velocity: ${stats.completionRate}%`,
    ``,
    `Curated with The Aether Codex 🌌`,
  ].filter(Boolean);

  const text = lines.join('\n');
  const safeToast = (msg, col) => {
    if (typeof toast === 'function') toast(msg, col);
    else if (typeof window.toast === 'function') window.toast(msg, col);
  };
  navigator.clipboard.writeText(text).then(() => {
    safeToast('✓ Wrapped summary copied to clipboard!');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    safeToast('✓ Wrapped summary copied!');
  });
}

// ── Month & Year Navigation Handlers ──────────────────────────────
function changePeriod(delta) {
  if (wrappedState.mode === 'monthly') {
    let m = wrappedState.selectedMonth + delta;
    let y = wrappedState.selectedYear;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    wrappedState.selectedMonth = m;
    wrappedState.selectedYear = y;
  } else if (wrappedState.mode === 'yearly') {
    wrappedState.selectedYear += delta;
  }
  updateWrappedDisplay();
}

function setMode(mode) {
  wrappedState.mode = mode;
  wrappedState.storyIndex = 0;
  updateWrappedDisplay();
}

function toggleStoryView(toStory) {
  wrappedState.view = toStory ? 'story' : 'overview';
  wrappedState.storyIndex = 0;
  updateWrappedDisplay();
}

function nextStorySlide(delta) {
  const totalSlides = 5;
  let next = wrappedState.storyIndex + delta;
  if (next < 0) next = 0;
  if (next >= totalSlides) {
    wrappedState.view = 'overview';
  } else {
    wrappedState.storyIndex = next;
  }
  updateWrappedDisplay();
}

// ── Master Render HTML Builder ────────────────────────────────────
function buildWrappedMarkup(stats, isModal) {
  const mode = wrappedState.mode;
  const view = wrappedState.view;

  // Embedded CSS styles for dynamic animations
  const styles = `
    <style>
      @keyframes wrappedFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes wrappedGlow { 0%,100% { box-shadow:0 0 25px rgba(56,189,248,.15); } 50% { box-shadow:0 0 45px rgba(168,85,247,.3); } }
      @keyframes storyBarFill { from { width:0; } to { width:100%; } }
      .wrap-btn-mode {
        padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;border:none;transition:all .2s ease;
      }
      .wrap-stat-card {
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;
        transition:all .25s ease;display:flex;flex-direction:column;justify-content:space-between;
      }
      .wrap-stat-card:hover {
        background:rgba(255,255,255,0.06);border-color:rgba(56,189,248,0.3);transform:translateY(-2px);
      }
      .wrap-story-touch-left, .wrap-story-touch-right {
        position:absolute;top:60px;bottom:0;width:45%;z-index:20;cursor:pointer;
      }
      .wrap-story-touch-left { left:0; }
      .wrap-story-touch-right { right:0; }
    </style>
  `;

  // Story Mode View
  if (view === 'story') {
    const sIdx = wrappedState.storyIndex;
    const slides = [
      // Slide 0: The Immersion Intro
      `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;position:relative;z-index:10;animation:wrappedFadeIn .3s ease">
        <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#38bdf8;margin-bottom:12px">✦ AETHER CODEX WRAPPED ✦</div>
        <div style="font-size:20px;color:rgba(255,255,255,.8);margin-bottom:20px;font-weight:500">In <b>${stats.timeLabel}</b>, you spent</div>
        <div style="font-family:'Outfit',sans-serif;font-size:68px;font-weight:900;color:#fff;line-height:1;margin-bottom:14px;background:linear-gradient(135deg,#38bdf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 0 35px rgba(56,189,248,.4)">
          ${stats.totalCodexHours}h
        </div>
        <div style="font-size:16px;color:rgba(255,255,255,.7);max-width:380px;line-height:1.6">
          immersed in stories, games, chronicles, and worlds across your personal codex.
        </div>
        <div style="display:flex;gap:12px;margin-top:32px;flex-wrap:wrap;justify-content:center">
          <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 16px;font-size:13px;color:#38bdf8">
            📺 ${stats.media.totalEps} Eps Watched
          </div>
          <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 16px;font-size:13px;color:#a855f7">
            🎮 ${stats.games.totalHours.toFixed(0)}h Games
          </div>
          <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 16px;font-size:13px;color:#fbbf24">
            📚 ${stats.books.totalPages} Pages Read
          </div>
        </div>
      </div>
      `,

      // Slide 1: Codex Archetype Reveal
      `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;position:relative;z-index:10;animation:wrappedFadeIn .3s ease">
        <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${stats.archetype.color};margin-bottom:12px">✦ YOUR CODEX IDENTITY ✦</div>
        <div style="width:100px;height:100px;border-radius:50%;background:${stats.archetype.bg};border:2px solid ${stats.archetype.border};display:flex;align-items:center;justify-content:center;font-size:46px;margin-bottom:20px;box-shadow:0 0 40px ${stats.archetype.border}">
          ${stats.archetype.icon}
        </div>
        <div style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:800;color:#fff;margin-bottom:6px">
          ${stats.archetype.title}
        </div>
        <div style="display:inline-block;padding:4px 12px;border-radius:20px;background:rgba(255,255,255,.08);font-size:11px;font-weight:800;letter-spacing:1px;color:${stats.archetype.color};margin-bottom:20px">
          ${stats.archetype.tag}
        </div>
        <div style="font-size:15px;color:rgba(255,255,255,.8);max-width:400px;line-height:1.7;font-style:italic">
          "${stats.archetype.description}"
        </div>
      </div>
      `,

      // Slide 2: Screen Odyssey
      `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;position:relative;z-index:10;animation:wrappedFadeIn .3s ease">
        <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#38bdf8;margin-bottom:10px">📺 CINEMA & ANIME ODYSSEY</div>
        <div style="font-family:'Outfit',sans-serif;font-size:44px;font-weight:800;color:#fff;margin-bottom:4px">
          ${stats.media.totalEps} Episodes
        </div>
        <div style="font-size:14px;color:rgba(255,255,255,.6);margin-bottom:24px">
          Across ${stats.media.completed.length} completed series (${stats.media.totalWatchHours} hours)
        </div>
        ${stats.media.topGenres.length ? `
          <div style="width:100%;max-width:380px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">
            <div style="font-size:11px;font-weight:800;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:10px">Favorite Genre</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:16px;font-weight:700;color:#fff">${stats.media.topGenres[0].name}</span>
              <span style="font-size:14px;font-weight:800;color:${stats.media.topGenres[0].color}">${stats.media.topGenres[0].pct}%</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${stats.media.topGenres[0].pct}%;background:${stats.media.topGenres[0].color};border-radius:3px"></div>
            </div>
          </div>
        ` : ''}
        ${stats.media.topRated[0] ? `
          <div style="font-size:13px;color:rgba(255,255,255,.7)">
            Crown Jewel: <b style="color:#fbbf24">★ ${stats.media.topRated[0].rating||stats.media.topRated[0].score}</b> — <span style="color:#fff">${esc(stats.media.topRated[0].title)}</span>
          </div>
        ` : ''}
      </div>
      `,

      // Slide 3: Gaming & Literary Realm
      `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;position:relative;z-index:10;animation:wrappedFadeIn .3s ease">
        <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#4ade80;margin-bottom:10px">🎮 GAMING & 📚 READING REALMS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:400px;margin-bottom:20px">
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:24px;margin-bottom:4px">🎮</div>
            <div style="font-family:'Outfit',sans-serif;font-size:26px;font-weight:800;color:#38bdf8">${stats.games.totalHours.toFixed(0)}h</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px;text-transform:uppercase">Hours Logged</div>
            <div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:8px">${stats.games.completed.length} Games Finished</div>
          </div>
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:24px;margin-bottom:4px">📖</div>
            <div style="font-family:'Outfit',sans-serif;font-size:26px;font-weight:800;color:#fbbf24">${stats.books.totalPages.toLocaleString()}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px;text-transform:uppercase">Pages Read</div>
            <div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:8px">${stats.books.completed.length} Books Finished</div>
          </div>
        </div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:10px 18px;border-radius:10px">
          Platform of Choice: <b style="color:#fff">${stats.games.topPlatform}</b> · Total Tracked Velocity: <b style="color:#4ade80">${stats.completionRate}%</b>
        </div>
      </div>
      `,

      // Slide 4: Grand Recap Card
      `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;position:relative;z-index:10;animation:wrappedFadeIn .3s ease">
        <div style="background:linear-gradient(145deg,rgba(22,22,22,0.95),rgba(14,14,14,0.95));border:1px solid ${stats.archetype.border};border-radius:16px;padding:24px;width:100%;max-width:380px;box-shadow:0 0 35px rgba(0,0,0,0.6);text-align:left;position:relative">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px">
            <div>
              <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:${stats.archetype.color}">AETHER CODEX</div>
              <div style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:#fff">${stats.timeLabel}</div>
            </div>
            <div style="font-size:28px">${stats.archetype.icon}</div>
          </div>
          <div style="margin-bottom:16px">
            <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Codex Persona</div>
            <div style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;color:#fff">${stats.archetype.title}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px">
              <div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase">Screen Time</div>
              <div style="font-size:15px;font-weight:700;color:#38bdf8">${stats.media.totalWatchHours}h <span style="font-size:11px;color:rgba(255,255,255,.6)">(${stats.media.totalEps} eps)</span></div>
            </div>
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px">
              <div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase">Gaming</div>
              <div style="font-size:15px;font-weight:700;color:#a855f7">${stats.games.totalHours.toFixed(0)}h <span style="font-size:11px;color:rgba(255,255,255,.6)">(${stats.games.completed.length} done)</span></div>
            </div>
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px">
              <div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase">Reading</div>
              <div style="font-size:15px;font-weight:700;color:#fbbf24">${stats.books.totalPages} <span style="font-size:11px;color:rgba(255,255,255,.6)">pages</span></div>
            </div>
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px">
              <div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase">Completion</div>
              <div style="font-size:15px;font-weight:700;color:#4ade80">${stats.completionRate}%</div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="copyWrappedSummary()" style="flex:1;height:36px;border-radius:8px;background:#38bdf8;color:#000;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
              📋 Share Recap
            </button>
            <button onclick="toggleStoryView(false)" style="padding:0 14px;height:36px;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,.1);cursor:pointer">
              Overview
            </button>
          </div>
        </div>
      </div>
      `,
    ];

    return `
      ${styles}
      <div style="position:relative;width:100%;height:100%;min-height:480px;display:flex;flex-direction:column;background:#0d0d0d;border-radius:14px;overflow:hidden">
        <!-- Story Progress Bars at Top -->
        <div style="position:absolute;top:16px;left:20px;right:20px;display:flex;gap:6px;z-index:30">
          ${[0,1,2,3,4].map(idx => `
            <div onclick="nextStorySlide(${idx - sIdx})" style="flex:1;height:3px;background:rgba(255,255,255,.2);border-radius:2px;overflow:hidden;cursor:pointer">
              <div style="height:100%;width:${idx < sIdx ? '100%' : (idx === sIdx ? '100%' : '0%')};background:#fff;border-radius:2px;transition:width ${idx === sIdx ? '0.3s' : '0.1s'}"></div>
            </div>
          `).join('')}
        </div>

        <!-- Exit story button -->
        <button onclick="toggleStoryView(false)" style="position:absolute;top:28px;right:20px;z-index:35;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:50%;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px">✕</button>

        <!-- Touch / Click areas for next & prev -->
        <div class="wrap-story-touch-left" onclick="nextStorySlide(-1)" title="Previous slide"></div>
        <div class="wrap-story-touch-right" onclick="nextStorySlide(1)" title="Next slide"></div>

        <!-- Current Slide View -->
        ${slides[sIdx]}

        <!-- Bottom controls -->
        <div style="position:relative;z-index:30;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,.06);background:rgba(12,12,12,.8);backdrop-filter:blur(10px)">
          <button onclick="nextStorySlide(-1)" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:12px;font-weight:600;padding:6px 10px" ${sIdx===0?'disabled style="opacity:0.2;cursor:default"':''}>‹ Previous</button>
          <span style="font-size:11px;color:rgba(255,255,255,.4)">Slide ${sIdx+1} of 5</span>
          <button onclick="nextStorySlide(1)" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-size:12px;font-weight:600;padding:6px 10px">${sIdx===4?'Done ›':'Next ›'}</button>
        </div>
      </div>
    `;
  }

  // ── Overview Mode View ──
  return `
    ${styles}
    <div style="display:flex;flex-direction:column;gap:18px;animation:wrappedFadeIn .3s ease">

      <!-- Period Filter & Controls Bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:14px 18px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
        <!-- Mode Switcher -->
        <div style="display:flex;gap:4px;background:#161616;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:3px">
          <button onclick="setMode('monthly')" class="wrap-btn-mode" style="background:${mode==='monthly'?'#38bdf8':'transparent'};color:${mode==='monthly'?'#000':'rgba(255,255,255,.6)'}">Monthly</button>
          <button onclick="setMode('yearly')" class="wrap-btn-mode" style="background:${mode==='yearly'?'#38bdf8':'transparent'};color:${mode==='yearly'?'#000':'rgba(255,255,255,.6)'}">Yearly</button>
          <button onclick="setMode('all_time')" class="wrap-btn-mode" style="background:${mode==='all_time'?'#38bdf8':'transparent'};color:${mode==='all_time'?'#000':'rgba(255,255,255,.6)'}">All Time</button>
        </div>

        <!-- Period Stepper (for Monthly / Yearly) -->
        ${mode !== 'all_time' ? `
          <div style="display:flex;align-items:center;gap:10px;background:#161616;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:4px 12px">
            <button onclick="changePeriod(-1)" style="background:none;border:none;color:#38bdf8;font-size:16px;font-weight:700;cursor:pointer;padding:2px 6px">‹</button>
            <span style="font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;color:#fff;min-width:110px;text-align:center">${stats.timeLabel}</span>
            <button onclick="changePeriod(1)" style="background:none;border:none;color:#38bdf8;font-size:16px;font-weight:700;cursor:pointer;padding:2px 6px">›</button>
          </div>
        ` : `
          <div style="font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;color:#38bdf8;padding:4px 12px;background:#161616;border:1px solid rgba(255,255,255,.08);border-radius:8px">
            ✦ All-Time Codex History
          </div>
        `}

        <!-- Actions -->
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="toggleStoryView(true)" style="height:34px;background:linear-gradient(135deg,#38bdf8,#a855f7);color:#000;border:none;border-radius:8px;padding:0 14px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 0 15px rgba(56,189,248,0.3);transition:all .2s ease" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
            ▶ Story Mode
          </button>
          <button onclick="copyWrappedSummary()" title="Copy shareable summary" style="height:34px;background:rgba(255,255,255,.05);color:var(--tx);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:0 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">
            📋 Copy Card
          </button>
          ${isModal ? `
            <button onclick="closeWrappedModal()" style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px">✕</button>
          ` : ''}
        </div>
      </div>

      <!-- Archetype Hero Banner -->
      <div style="background:${stats.archetype.bg};border:1px solid ${stats.archetype.border};border-radius:14px;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px;position:relative;overflow:hidden">
        <div style="position:relative;z-index:2;flex:1;min-width:260px">
          <div style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;background:rgba(0,0,0,0.3);font-size:10px;font-weight:800;letter-spacing:1.5px;color:${stats.archetype.color};margin-bottom:8px">
            ✦ ${stats.archetype.tag}
          </div>
          <div style="font-family:'Outfit',sans-serif;font-size:26px;font-weight:800;color:#fff;margin-bottom:6px">
            ${stats.archetype.title}
          </div>
          <div style="font-size:13px;color:rgba(255,255,255,.8);line-height:1.5;max-width:520px">
            "${stats.archetype.description}"
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;position:relative;z-index:2">
          <div style="text-align:right">
            <div style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:800;color:#fff;line-height:1">${stats.totalCodexHours}h</div>
            <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Total Codex Time</div>
          </div>
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,0.4);border:1.5px solid ${stats.archetype.border};display:flex;align-items:center;justify-content:center;font-size:32px">
            ${stats.archetype.icon}
          </div>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:10px">
        <div class="wrap-stat-card">
          <div style="font-size:20px;margin-bottom:4px">📺</div>
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#38bdf8">${stats.media.totalEps}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Episodes Watched</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${stats.media.totalWatchHours} Hours</div>
        </div>
        <div class="wrap-stat-card">
          <div style="font-size:20px;margin-bottom:4px">✓</div>
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#4ade80">${stats.media.completed.length}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Titles Finished</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${stats.media.inRange.length} Active</div>
        </div>
        <div class="wrap-stat-card">
          <div style="font-size:20px;margin-bottom:4px">🎮</div>
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#a855f7">${stats.games.totalHours.toFixed(0)}h</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Game Hours</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${stats.games.completed.length} Beaten</div>
        </div>
        <div class="wrap-stat-card">
          <div style="font-size:20px;margin-bottom:4px">📚</div>
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#fbbf24">${stats.books.totalPages.toLocaleString()}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Pages Read</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${stats.books.completed.length} Books Done</div>
        </div>
        <div class="wrap-stat-card">
          <div style="font-size:20px;margin-bottom:4px">🎵</div>
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#ec4899">${stats.music.totalTracks}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Music Tracks</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${stats.music.totalHours}h Audio</div>
        </div>
        <div class="wrap-stat-card">
          <div style="font-size:20px;margin-bottom:4px">⚡</div>
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#38bdf8">${stats.completionRate}%</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px">Completion Rate</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${stats.media.completed.length + stats.games.completed.length + stats.books.completed.length} Cleared</div>
        </div>
      </div>

      <!-- Two-Column Deep Dive Section -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px">

        <!-- Top Genres Visual Breakdown -->
        <div style="background:#161616;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <span style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.6)">🎭 Top Genres</span>
            <span style="font-size:11px;color:rgba(255,255,255,.4)">${stats.media.inRange.length} Entries</span>
          </div>
          ${stats.media.topGenres.length ? `
            <div style="display:flex;flex-direction:column;gap:12px">
              ${stats.media.topGenres.map(g => `
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
                    <span style="font-weight:600;color:rgba(255,255,255,.9);display:flex;align-items:center;gap:6px">
                      <span style="width:8px;height:8px;border-radius:50%;background:${g.color}"></span>
                      ${g.name}
                    </span>
                    <span style="font-weight:700;color:${g.color}">${g.cnt} <span style="font-size:11px;color:rgba(255,255,255,.4)">(${g.pct}%)</span></span>
                  </div>
                  <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${g.pct}%;background:${g.color};border-radius:3px;transition:width .4s ease"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.4);font-size:13px">
              No genre activity recorded for this period.
            </div>
          `}
        </div>

        <!-- Top Rated Hall of Fame -->
        <div style="background:#161616;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <span style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.6)">⭐ Top Rated Hall of Fame</span>
            <span style="font-size:11px;color:#fbbf24">Highest Scored</span>
          </div>
          ${stats.media.topRated.length ? `
            <div style="display:flex;flex-direction:column;gap:8px">
              ${stats.media.topRated.map((e, idx) => `
                <div style="display:flex;align-items:center;gap:12px;padding:8px 10px;background:rgba(255,255,255,.03);border-radius:8px">
                  <span style="font-size:13px;font-weight:800;color:${idx===0?'#fbbf24':(idx===1?'#94a3b8':'#b45309')};min-width:18px">#${idx+1}</span>
                  <div style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    <div style="font-size:13px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:capitalize">${e.status||'watching'} · ${e.epCur||0} eps</div>
                  </div>
                  <span style="font-size:13px;font-weight:800;color:#fbbf24;background:rgba(251,191,36,.1);padding:3px 8px;border-radius:6px;border:1px solid rgba(251,191,36,.2)">★ ${e.rating||e.score}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.4);font-size:13px">
              No rated media found in this period.
            </div>
          `}
        </div>

      </div>

      <!-- Highlights & Milestones Summary Box -->
      <div style="background:linear-gradient(135deg,rgba(56,189,248,.08),rgba(168,85,247,.05));border:1px solid rgba(56,189,248,.18);border-radius:12px;padding:18px">
        <div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#38bdf8;margin-bottom:12px">✨ Highlights & Milestones</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${stats.highlights.map(h => `
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:rgba(255,255,255,.9);line-height:1.5">
              <span style="color:#38bdf8;flex-shrink:0">•</span>
              <span>${h}</span>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;
}

// ── Global Render & Update Controllers ────────────────────────────
let activeWrappedStats = null;

function updateWrappedDisplay() {
  activeWrappedStats = computeStats(wrappedState.mode, wrappedState.selectedYear, wrappedState.selectedMonth);

  // If modal is active, update modal content
  const modalContent = document.getElementById('wrapped-modal-content');
  if (modalContent) {
    modalContent.innerHTML = buildWrappedMarkup(activeWrappedStats, true);
    return;
  }

  // If full page section is active, update section content
  const sectionContent = document.getElementById('wrapped-section-content');
  if (sectionContent) {
    sectionContent.innerHTML = buildWrappedMarkup(activeWrappedStats, false);
  }
}

// ── Modal Mode: openWrapped() ─────────────────────────────────────
function openWrapped() {
  const existing = document.getElementById('wrapped-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'wrapped-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9800;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);animation:wrappedFadeIn .2s ease';

  modal.innerHTML = `
    <div style="background:#111111;border:1px solid rgba(255,255,255,.1);border-radius:16px;width:100%;max-width:680px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.8);overflow:hidden">
      <div id="wrapped-modal-content" style="overflow-y:auto;flex:1;padding:20px"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeWrappedModal();
  });

  wrappedState.isModal = true;
  wrappedState.view = 'overview';
  updateWrappedDisplay();
}

function closeWrappedModal() {
  const modal = document.getElementById('wrapped-modal');
  if (modal) modal.remove();
}

// ── Full Section Mode: renderWrapped(container) ───────────────────
function renderWrapped(container) {
  if (!container) return;
  wrappedState.isModal = false;
  container.innerHTML = `
    <div style="padding:24px;max-width:960px;margin:0 auto">
      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-family:'Outfit',sans-serif;font-size:26px;font-weight:800;color:#fff;letter-spacing:-.5px">✦ Your Wrapped</div>
          <div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:2px">Cinematic analytics and memories from your journey in The Aether Codex</div>
        </div>
      </div>
      <div id="wrapped-section-content"></div>
    </div>
  `;
  updateWrappedDisplay();
}

function renderWrappedContent(type) {
  if (type === 'monthly' || type === 'yearly' || type === 'all_time') {
    setMode(type);
  } else {
    updateWrappedDisplay();
  }
}

function copyWrappedSummary() {
  if (!activeWrappedStats) {
    activeWrappedStats = computeStats(wrappedState.mode, wrappedState.selectedYear, wrappedState.selectedMonth);
  }
  copyShareableSummary(activeWrappedStats);
}

// ── Keyboard Navigation (Esc to close, Arrow keys in Story Mode) ──
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('wrapped-modal')) {
      closeWrappedModal();
    } else if (wrappedState.view === 'story') {
      toggleStoryView(false);
    }
  } else if (wrappedState.view === 'story') {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      nextStorySlide(1);
    } else if (e.key === 'ArrowLeft') {
      nextStorySlide(-1);
    }
  }
});

// ── Register on window & Export ───────────────────────────────────
Object.assign(window, {
  openWrapped,
  closeWrappedModal,
  renderWrapped,
  renderWrappedContent,
  setMode,
  changePeriod,
  toggleStoryView,
  nextStorySlide,
  copyWrappedSummary,
});

export {
  openWrapped,
  closeWrappedModal,
  renderWrapped,
  renderWrappedContent,
  setMode,
  changePeriod,
  toggleStoryView,
  nextStorySlide,
  copyWrappedSummary,
};
