// ═══════════════════════════════════════════════════════════════════════════
//  MIGRATION V1 — Flatten timeline parent/child → independent flat entries
//
//  NEW fields added to every entry:
//    malId            {string|null}  — MyAnimeList numeric ID (stored as string)
//    linkedGroupId    {string|null}  — groups related seasons/movies together
//    linkedGroupOrder {number|null}  — sort order inside a linked group
//
//  OLD shape (parent + timeline[]):
//  ─────────────────────────────────────────────────────────────────────────
//  { id, title, genreId, status,
//    timeline: [
//      { id, type:'season', name, num, eps, epWatched, status, rating,
//        startDate, endDate, epDuration, upcomingDate, upcomingTime },
//      { id, type:'movie', movieTitle, watched, status }
//    ],
//    epCur, epTot, epDuration, rating, watchUrl, airingDay, airingTime,
//    favorite, pinned, rewatches, rewatchCount, addedAt, updatedAt }
//
//  NEW shape (one flat entry per season/movie):
//  ─────────────────────────────────────────────────────────────────────────
//  { id, title, genreId, status,
//    malId: null,            // ← NEW (populate later via MAL search)
//    linkedGroupId: null,    // ← NEW
//    linkedGroupOrder: null, // ← NEW
//    epCur, epTot, epDuration, rating, notes, watchUrl,
//    airingDay, airingTime, favorite, pinned,
//    rewatches, rewatchCount,
//    startDate, endDate, upcomingDate, upcomingTime,
//    addedAt, updatedAt }    // NO timeline array
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/* ── Migration identity ─────────────────────────────────────────────────── */
const MIGRATION_V1_KEY   = 'ac_migration_v1_flat_entries';
const MIGRATION_V1_STAMP = '2024-v1';

// ─────────────────────────────────────────────────────────────────────────
//  runMigrationV1()
//
//  Call once at startup, after DATA is loaded and before the first render.
//  Safe to call multiple times — returns immediately when already migrated.
//
//  Returns: { ran: bool, entriesBefore, entriesAfter, groups }
// ─────────────────────────────────────────────────────────────────────────
async function runMigrationV1() {
  /* Already stamped → skip */
  if (ls.str(MIGRATION_V1_KEY) === MIGRATION_V1_STAMP) {
    return { ran: false };
  }

  const hasLegacy = DATA.some(
    e => Array.isArray(e.timeline) && e.timeline.length > 0
  );

  if (!hasLegacy) {
    /* No legacy entries — just backfill the three new fields and stamp */
    _backfillNewFields();
    saveData(DATA);
    _stampMigration();
    return { ran: false };
  }

  /* ── Run ── */
  console.info('[Migration V1] Starting flat-entry migration…');
  const before     = DATA.length;
  const flatEntries = [];
  let   groups      = 0;

  for (const entry of DATA) {
    const tl = Array.isArray(entry.timeline) ? entry.timeline : [];

    if (!tl.length) {
      /* Standalone — just backfill new fields, strip timeline key */
      flatEntries.push(_backfillEntry(entry, null, null));
      continue;
    }

    /* Entry has a timeline → explode each item into its own record */
    groups++;
    const groupId = entry.id; // parent id becomes the shared linkedGroupId
    let   order   = 0;

    for (const item of tl) {
      flatEntries.push(
        _timelineItemToEntry(entry, item, groupId, order)
      );
      order++;
    }
    /* The parent franchise record is fully replaced by its children.
       linkedGroupId on each child provides the "franchise" link. */
  }

  /* Commit to memory + localStorage */
  DATA = flatEntries;
  saveData(DATA);          // → localStorage + schedules Drive sync
  _stampMigration();

  const after = DATA.length;
  console.info(
    `[Migration V1] Done. ${before} → ${after} entries ` +
    `across ${groups} group${groups !== 1 ? 's' : ''}.`
  );

  /* Push to Drive immediately — don't wait for the 3-second debounce */
  await _pushAfterMigration();

  return { ran: true, entriesBefore: before, entriesAfter: after, groups };
}

// ─────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert one timeline item (season or movie) into a top-level entry.
 *
 * @param {Object} parent   Original parent entry
 * @param {Object} item     Timeline item (season or movie node)
 * @param {string} groupId  Shared linkedGroupId (= parent.id)
 * @param {number} order    0-based position inside the group
 */
function _timelineItemToEntry(parent, item, groupId, order) {
  const isMovie = item.type === 'movie';

  /* Episode counts */
  const epTot = isMovie ? 1 : _parseInt(item.eps, 0);
  const epCur = isMovie
    ? (item.watched || item.status === 'completed' ? 1 : 0)
    : _parseInt(item.epWatched, 0);

  /* Status */
  const status = item.status
    || (isMovie && item.watched ? 'completed' : 'not_started');

  /* Rating: season-level beats parent-level */
  const rating = _coerce(item.rating) || _coerce(parent.rating) || null;

  return {
    /* Identity */
    id:              item.id || uid(),
    title:           _deriveTitle(parent.title, item, order),
    genreId:         parent.genreId,

    /* ── NEW FIELDS ── */
    malId:            null,       // user populates later via MAL lookup
    linkedGroupId:    groupId,
    linkedGroupOrder: order,

    /* Progress */
    status,
    epCur:           String(epCur),
    epTot:           epTot ? String(epTot) : null,
    epDuration:      item.epDuration || parent.epDuration || null,

    /* Dates */
    startDate:       item.startDate    || null,
    endDate:         item.endDate      || null,
    upcomingDate:    item.upcomingDate || null,
    upcomingTime:    item.upcomingTime || null,

    /* Metadata */
    rating,
    notes:           null,            // season-level notes were not stored
    watchUrl:        parent.watchUrl  || null,
    airingDay:       parent.airingDay  ?? null,
    airingTime:      parent.airingTime || null,
    favorite:        parent.favorite   || false,
    pinned:          false,

    /* Carry rewatches only on the first part of a group */
    rewatches:       order === 0 ? (parent.rewatches || [])    : [],
    rewatchCount:    order === 0 ? (parent.rewatchCount || null) : null,

    /* Timestamps */
    addedAt:         parent.addedAt || Date.now(),
    updatedAt:       Date.now(),
  };
}

/** Backfill the three new fields onto a standalone entry; remove timeline. */
function _backfillEntry(entry, linkedGroupId, linkedGroupOrder) {
  const out = {
    ...entry,
    malId:            entry.malId            ?? null,
    linkedGroupId:    entry.linkedGroupId    ?? linkedGroupId,
    linkedGroupOrder: entry.linkedGroupOrder ?? linkedGroupOrder,
  };
  delete out.timeline;
  return out;
}

/** Fast in-place backfill when no timeline entries exist. */
function _backfillNewFields() {
  for (let i = 0; i < DATA.length; i++) {
    if (DATA[i].malId            === undefined) DATA[i].malId            = null;
    if (DATA[i].linkedGroupId    === undefined) DATA[i].linkedGroupId    = null;
    if (DATA[i].linkedGroupOrder === undefined) DATA[i].linkedGroupOrder = null;
    delete DATA[i].timeline;
  }
}

/**
 * Build the best human-readable title for a flattened entry.
 *
 * Priority:
 *   1. item.name   (e.g. "Attack on Titan: The Final Season")
 *   2. item.movieTitle
 *   3. "ParentTitle Season N" / "ParentTitle — Movie"
 */
function _deriveTitle(parentTitle, item, order) {
  const isMovie = item.type === 'movie';

  if (item.name && item.name.trim())
    return item.name.trim();

  if (isMovie && item.movieTitle && item.movieTitle.trim())
    return item.movieTitle.trim();

  if (isMovie)
    return `${parentTitle} — Movie`;

  const num = item.num != null ? item.num : order + 1;
  return `${parentTitle} Season ${num}`;
}

function _stampMigration() {
  ls.setStr(MIGRATION_V1_KEY, MIGRATION_V1_STAMP);
}

/** Push immediately after migration instead of waiting for the debounce. */
async function _pushAfterMigration() {
  try {
    if (typeof _isConnected === 'function' && _isConnected() &&
        typeof _pushToDrive === 'function') {
      await _pushToDrive();
      console.info('[Migration V1] Data pushed to Google Drive successfully.');
    } else {
      console.info('[Migration V1] Drive not connected — sync will happen on next change.');
    }
  } catch (e) {
    console.warn('[Migration V1] Drive push failed (will retry on next change):', e.message);
  }
}

function _parseInt(val, fallback = 0) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function _coerce(val) {
  if (val === null || val === undefined || val === '') return null;
  return val;
}

// ─────────────────────────────────────────────────────────────────────────
//  Public utilities usable anywhere in the app after migration
// ─────────────────────────────────────────────────────────────────────────

/**
 * getLinkedGroup(entry)
 * Returns all DATA entries sharing entry.linkedGroupId, sorted by order.
 * Returns [] for standalone entries (linkedGroupId === null).
 */
function getLinkedGroup(entry) {
  if (!entry || !entry.linkedGroupId) return [];
  return DATA
    .filter(e => e.linkedGroupId === entry.linkedGroupId)
    .sort((a, b) => (a.linkedGroupOrder ?? 0) - (b.linkedGroupOrder ?? 0));
}

/**
 * linkedGroupLabel(entry)
 * Returns "Part 2 of 4" style string, or null for standalone entries.
 */
function linkedGroupLabel(entry) {
  if (!entry || !entry.linkedGroupId) return null;
  const group = getLinkedGroup(entry);
  if (group.length <= 1) return null;
  const pos = (entry.linkedGroupOrder ?? 0) + 1;
  return `Part ${pos}\u202fof\u202f${group.length}`;
}

/**
 * resetMigrationV1Stamp()
 * DEV ONLY — clears the stamp so migration re-runs on next load.
 * Does NOT restore original data; export a backup before calling this.
 */
function resetMigrationV1Stamp() {
  ls.del(MIGRATION_V1_KEY);
  console.warn('[Migration V1] Stamp cleared. Reload to re-run migration.');
}