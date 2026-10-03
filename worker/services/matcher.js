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
  userLibraryMalIds,
  ignoredMalIds = new Set(),
  relationsMap,
}) {
  const librarySet = userLibraryMalIds instanceof Set 
    ? userLibraryMalIds 
    : new Set((userLibraryMalIds || []).map(Number));

  const ignoredSet = ignoredMalIds instanceof Set 
    ? ignoredMalIds 
    : new Set((ignoredMalIds || []).map(Number));

  const candidatesByMalId = new Map();

  const entries = relationsMap instanceof Map 
    ? Array.from(relationsMap.entries()) 
    : Object.entries(relationsMap || {}).map(([k, v]) => [Number(k), v]);

  for (const [parentMalId, parentData] of entries) {
    if (!parentData || !Array.isArray(parentData.relations)) continue;

    const parentTitle = parentData.title || `Anime #${parentMalId}`;

    for (const rel of parentData.relations) {
      if (!rel || !rel.malId) continue;
      const targetMalId = Number(rel.malId);
      if (!Number.isInteger(targetMalId) || targetMalId <= 0) continue;

      // Skip if already in library or ignored
      if (librarySet.has(targetMalId) || ignoredSet.has(targetMalId)) continue;

      const relType = String(rel.relationType || '').toUpperCase().trim();
      if (!ALLOWED_RELATION_TYPES.has(relType)) continue;

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
