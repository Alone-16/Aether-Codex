/**
 * worker/providers/index.js
 * 
 * Provider factory and registry.
 * Reads RELATION_PROVIDERS from env (defaults to 'anilist,mal').
 */

import { AniListProvider } from './anilist.js';
import { MalProvider } from './mal.js';

export { AniListProvider, MalProvider };

/**
 * Returns an array of provider instances ordered by priority.
 * 
 * @param {object} env Worker environment bindings
 * @returns {Array<AniListProvider|MalProvider>}
 */
export function getRelationProviders(env = {}) {
  const providerConfig = env.RELATION_PROVIDERS || 'anilist,mal';
  const names = providerConfig.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const providers = [];
  for (const name of names) {
    if (name === 'anilist') {
      providers.push(new AniListProvider());
    } else if (name === 'mal') {
      providers.push(new MalProvider(env.MAL_CLIENT_ID));
    }
  }

  // Fallback to AniList if none recognized
  if (providers.length === 0) {
    providers.push(new AniListProvider());
  }

  return providers;
}
