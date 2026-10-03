/**
 * worker/providers/mal.js
 * 
 * MyAnimeList v2 REST API provider (fallback):
 * - Calls MAL v2 endpoints with X-MAL-CLIENT-ID.
 * - Handles individual ID requests with budget limits.
 */

export class MalProvider {
  constructor(clientId = '97959fe7356ea8135f3b19db28cb941f') {
    this.name = 'mal';
    this.clientId = clientId;
  }

  /**
   * Fetches relations for an array of MAL IDs.
   * 
   * @param {number[]} malIds 
   * @param {number} [maxBudget=10]
   * @returns {Promise<Map<number, object>>}
   */
  async fetchRelations(malIds, maxBudget = 10) {
    const results = new Map();
    if (!malIds || malIds.length === 0) return results;

    const uniqueIds = Array.from(new Set(malIds.map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, maxBudget);

    for (const id of uniqueIds) {
      try {
        const url = `https://api.myanimelist.net/v2/anime/${id}?fields=id,title,status,media_type,num_episodes,start_date,main_picture,related_anime`;
        const res = await fetch(url, {
          headers: { 'X-MAL-CLIENT-ID': this.clientId }
        });

        if (!res.ok) {
          console.warn(`[MAL] HTTP ${res.status} for anime ${id}`);
          continue;
        }

        const data = await res.json();
        const rels = [];

        for (const item of (data.related_anime || [])) {
          const node = item.node;
          if (!node || !node.id) continue;

          // Normalize relation type to uppercase like AniList
          const rawType = (item.relation_type || item.relation_type_formatted || '').toUpperCase();
          const relType = rawType.replace(/\s+/g, '_');

          rels.push({
            malId: node.id,
            relationType: relType, // 'SEQUEL', 'PREQUEL', etc.
            title: node.title || `Anime #${node.id}`,
            format: null,
            status: null,
            episodes: null,
            releaseDate: null,
            coverImage: node.main_picture?.large || node.main_picture?.medium || null,
          });
        }

        results.set(id, {
          malId: id,
          title: data.title || `Anime #${id}`,
          format: data.media_type || null,
          status: data.status || null,
          releaseDate: data.start_date || null,
          coverImage: data.main_picture?.large || data.main_picture?.medium || null,
          relations: rels,
        });
      } catch (err) {
        console.error(`[MAL] Error fetching relations for ${id}:`, err);
      }
    }

    return results;
  }

  /**
   * Fetches latest dates for an array of MAL IDs.
   * 
   * @param {number[]} malIds 
   * @param {number} [maxBudget=10]
   * @returns {Promise<Map<number, object>>}
   */
  async fetchDates(malIds, maxBudget = 10) {
    const results = new Map();
    if (!malIds || malIds.length === 0) return results;

    const uniqueIds = Array.from(new Set(malIds.map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, maxBudget);

    for (const id of uniqueIds) {
      try {
        const url = `https://api.myanimelist.net/v2/anime/${id}?fields=id,title,status,media_type,num_episodes,start_date,main_picture`;
        const res = await fetch(url, {
          headers: { 'X-MAL-CLIENT-ID': this.clientId }
        });

        if (!res.ok) continue;

        const data = await res.json();
        results.set(id, {
          malId: id,
          title: data.title || `Anime #${id}`,
          releaseDate: data.start_date || null,
          status: data.status || null,
          format: data.media_type || null,
          episodes: data.num_episodes || null,
          coverImage: data.main_picture?.large || data.main_picture?.medium || null,
        });
      } catch (err) {
        console.error(`[MAL] Error fetching dates for ${id}:`, err);
      }
    }

    return results;
  }
}
