/**
 * worker/services/matcher.js
 * 
 * Pure function: Discovers sequel/continuation candidates for a user.
 * Zero I/O — fully unit-testable.
 */

const ALLOWED_RELATION_TYPES = new Set(['SEQUEL', 'SIDE_STORY', 'ALTERNATIVE']);

/**
 * Finds sequel candidates for a user from their watched/tracked media relations.
 * 
 * @param {object} params
 * @param {Set<number>|number[]} params.userLibraryMalIds - Set or array of MAL IDs already in user's library
 * @param {Set<number>|number[]} [params.ignoredMalIds] - Set or array of MAL IDs explicitly ignored by user
 * @param {Map<number, object>|Record<number, object>} params.relationsMap - Map of parent MAL ID -> media entry with relations[]
 * @returns {Array<object>} Deduplicated candidate sequel objects
 */
export function findSequelCandidates({
  userWatchedMalIds,
  userLibraryMalIds,
  ignoredMalIds = new Set(),
  relationsMap,
  todayStr = new Date().toISOString().slice(0, 10),
}) {
  const librarySet = userLibraryMalIds instanceof Set 
    ? userLibraryMalIds 
    : new Set((userLibraryMalIds || []).map(Number));

  // If userWatchedMalIds is provided, only discover sequels for watched/completed anime.
  // Otherwise fall back to librarySet for backwards compatibility.
  const watchedSet = userWatchedMalIds instanceof Set
    ? userWatchedMalIds
    : userWatchedMalIds 
      ? new Set((userWatchedMalIds || []).map(Number))
      : librarySet;

  const ignoredSet = ignoredMalIds instanceof Set 
    ? ignoredMalIds 
    : new Set((ignoredMalIds || []).map(Number));

  const candidatesByMalId = new Map();

  // ONLY iterate over parent anime the user has actually watched/completed!
  for (const parentMalId of watchedSet) {
    const parentData = relationsMap instanceof Map 
      ? relationsMap.get(parentMalId) 
      : relationsMap?.[parentMalId];

    if (!parentData || !Array.isArray(parentData.relations)) continue;

    const parentTitle = parentData.title || `Anime #${parentMalId}`;

    for (const rel of parentData.relations) {
      if (!rel || !rel.malId) continue;
      const targetMalId = Number(rel.malId);
      if (!Number.isInteger(targetMalId) || targetMalId <= 0) continue;

      // 1. Skip if already anywhere in user's library (watching, plan, completed, upcoming, etc.)
      if (librarySet.has(targetMalId)) continue;

      // 2. Skip if explicitly ignored
      if (ignoredSet.has(targetMalId)) continue;

      // 3. Check relation type
      const relType = String(rel.relationType || '').toUpperCase().trim();
      if (!ALLOWED_RELATION_TYPES.has(relType)) continue;

      // 4. Must be a genuine UPCOMING / UNRELEASED anime!
      const statusUpper = String(rel.status || '').toUpperCase().trim();

      // If definitely finished or cancelled -> NOT upcoming!
      if (statusUpper === 'FINISHED' || statusUpper === 'FINISHED_AIRING' || statusUpper === 'CANCELLED') {
        continue;
      }

      const relDate = rel.releaseDate ? String(rel.releaseDate).trim() : null;
      if (relDate) {
        const relYear = parseInt(relDate.slice(0, 4), 10);
        const todayYear = parseInt(todayStr.slice(0, 4), 10);
        if (relYear < todayYear) {
          // Definitely in the past (e.g. 2000, 2010, 2024 when today is 2026)
          continue;
        }
        if (relDate.length >= 10 && relDate < todayStr && statusUpper !== 'NOT_YET_RELEASED' && statusUpper !== 'NOT_YET_AIRED') {
          // Release date in current year has already passed and status is not marked unreleased
          continue;
        }
      } else {
        // No release date provided.
        // MUST have explicit upcoming status indicator (e.g. AniList NOT_YET_RELEASED).
        // If status is unknown/null, we cannot assume it's upcoming (avoids leaking old MAL titles).
        if (statusUpper !== 'NOT_YET_RELEASED' && statusUpper !== 'NOT_YET_AIRED') {
          continue;
        }
      }

      // Prefer SEQUEL over SIDE_STORY or ALTERNATIVE if multiple parents link to it
      if (candidatesByMalId.has(targetMalId)) {
        const existing = candidatesByMalId.get(targetMalId);
        if (relType === 'SEQUEL' && existing.relationType !== 'SEQUEL') {
          existing.relationType = relType;
          existing.parentMalId = Number(parentMalId);
          existing.parentTitle = parentTitle;
        }
        continue;
      }

      candidatesByMalId.set(targetMalId, {
        parentMalId: Number(parentMalId),
        parentTitle,
        malId: targetMalId,
        title: rel.title || `Anime #${targetMalId}`,
        format: rel.format || null,
        status: rel.status || null,
        episodes: rel.episodes || null,
        releaseDate: rel.releaseDate || null,
        poster: rel.coverImage || null,
        relationType: relType,
        matchMethod: 'relation',
        dedupeKey: `sequel:${targetMalId}`,
      });
    }
  }

  return Array.from(candidatesByMalId.values());
}
