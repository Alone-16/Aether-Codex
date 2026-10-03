/**
 * worker/providers/anilist.js
 * 
 * AniList GraphQL provider:
 * - Batches up to 50 MAL IDs per request via `idMal_in`.
 * - Retrieves relations (sequels, movies, prequels, side-stories).
 * - Retrieves release dates and status info.
 */

const ANILIST_API_URL = 'https://graphql.anilist.co';

export function formatAniListDate(sd) {
  if (!sd || !sd.year) return null;
  const y = String(sd.year).padStart(4, '0');
  if (!sd.month) return y;
  const m = String(sd.month).padStart(2, '0');
  if (!sd.day) return `${y}-${m}`;
  const d = String(sd.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class AniListProvider {
  constructor() {
    this.name = 'anilist';
    this.lastError = null;
  }

  /**
   * Fetches relations for an array of MAL IDs.
   * Batches in chunks of up to 50 IDs.
   * 
   * @param {number[]} malIds 
   * @returns {Promise<Map<number, { malId: number, title: string, format: string, status: string, releaseDate: string|null, coverImage: string|null, relations: Array }>>}
   */
  async fetchRelations(malIds) {
    const results = new Map();
    if (!malIds || malIds.length === 0) return results;

    const uniqueIds = Array.from(new Set(malIds.map(Number).filter(n => Number.isInteger(n) && n > 0)));
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 50) {
      chunks.push(uniqueIds.slice(i, i + 50));
    }

    const query = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
          media(idMal_in: $ids, type: ANIME) {
            idMal
            title {
              romaji
              english
              native
            }
            status
            format
            episodes
            startDate {
              year
              month
              day
            }
            coverImage {
              large
              medium
            }
            relations {
              edges {
                relationType
                node {
                  idMal
                  title {
                    romaji
                    english
                    native
                  }
                  status
                  format
                  episodes
                  startDate {
                    year
                    month
                    day
                  }
                  coverImage {
                    large
                    medium
                  }
                }
              }
            }
          }
        }
      }
    `;

    for (const chunk of chunks) {
      try {
        const res = await fetch(ANILIST_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'AetherCodex/1.0.0',
          },
          body: JSON.stringify({
            query,
            variables: { ids: chunk },
          }),
        });

        if (res.status === 429) {
          console.warn('[AniList] Rate limited (429)');
          break;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          this.lastError = `GraphQL error HTTP ${res.status}: ${errText.slice(0, 200)}`;
          console.warn(`[AniList] ${this.lastError}`);
          continue;
        }

        const data = await res.json();
        const mediaList = data?.data?.Page?.media || [];

        for (const item of mediaList) {
          if (!item.idMal) continue;

          const title = item.title?.english || item.title?.romaji || item.title?.native || `Anime #${item.idMal}`;
          const edges = item.relations?.edges || [];
          const rels = [];

          for (const edge of edges) {
            const node = edge.node;
            if (!node || !node.idMal) continue;

            const relTitle = node.title?.english || node.title?.romaji || node.title?.native || `Anime #${node.idMal}`;
            rels.push({
              malId: node.idMal,
              relationType: edge.relationType, // 'SEQUEL', 'PREQUEL', 'SIDE_STORY', etc.
              title: relTitle,
              format: node.format || null,
              status: node.status || null,
              episodes: node.episodes || null,
              releaseDate: formatAniListDate(node.startDate),
              coverImage: node.coverImage?.large || node.coverImage?.medium || null,
            });
          }

          results.set(item.idMal, {
            malId: item.idMal,
            title,
            format: item.format || null,
            status: item.status || null,
            releaseDate: formatAniListDate(item.startDate),
            coverImage: item.coverImage?.large || item.coverImage?.medium || null,
            relations: rels,
          });
        }
      } catch (err) {
        this.lastError = err.message || String(err);
        console.error('[AniList] fetchRelations error:', err);
      }
    }

    return results;
  }

  /**
   * Fetches latest release dates and statuses for tracked upcoming MAL IDs.
   * Batches in chunks of up to 50 IDs.
   * 
   * @param {number[]} malIds 
   * @returns {Promise<Map<number, { malId: number, title: string, releaseDate: string|null, status: string|null, format: string|null, episodes: number|null, coverImage: string|null }>>}
   */
  async fetchDates(malIds) {
    const results = new Map();
    if (!malIds || malIds.length === 0) return results;

    const uniqueIds = Array.from(new Set(malIds.map(Number).filter(n => Number.isInteger(n) && n > 0)));
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 50) {
      chunks.push(uniqueIds.slice(i, i + 50));
    }

    const query = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
          media(idMal_in: $ids, type: ANIME) {
            idMal
            title {
              romaji
              english
            }
            status
            format
            episodes
            startDate {
              year
              month
              day
            }
            coverImage {
              large
            }
          }
        }
      }
    `;

    for (const chunk of chunks) {
      try {
        const res = await fetch(ANILIST_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'AetherCodex/1.0.0',
          },
          body: JSON.stringify({
            query,
            variables: { ids: chunk },
          }),
        });

        if (res.status === 429) {
          console.warn('[AniList] Rate limited (429)');
          break;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          this.lastError = `fetchDates GraphQL error HTTP ${res.status}: ${errText.slice(0, 200)}`;
          console.warn(`[AniList] ${this.lastError}`);
          continue;
        }

        const data = await res.json();
        const mediaList = data?.data?.Page?.media || [];

        for (const item of mediaList) {
          if (!item.idMal) continue;
          const title = item.title?.english || item.title?.romaji || `Anime #${item.idMal}`;
          results.set(item.idMal, {
            malId: item.idMal,
            title,
            releaseDate: formatAniListDate(item.startDate),
            status: item.status || null,
            format: item.format || null,
            episodes: item.episodes || null,
            coverImage: item.coverImage?.large || null,
          });
        }
      } catch (err) {
        this.lastError = err.message || String(err);
        console.error('[AniList] fetchDates error:', err);
      }
    }

    return results;
  }
}
