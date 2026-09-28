// ═══════════════════════════════════════════════════════════════════
//  run-airing-check-live.mjs — Live Airing Sync Execution Against Production D1
// ═══════════════════════════════════════════════════════════════════

import { execSync } from 'child_process';

const USER_ID = 'usr_bmFkZWVtcHViZ21vYmlsZUBnbWFpbC5jb20';
const MAL_CLIENT_ID = '97959fe7356ea8135f3b19db28cb941f';

async function fetchMalStatus(malId) {
  const numericId = String(malId).replace(/\D/g, '');
  if (!numericId) return null;

  // 1. Try MAL API directly with client ID
  try {
    const res = await fetch(`https://api.myanimelist.net/v2/anime/${numericId}?fields=id,title,status,num_episodes,end_date,broadcast`, {
      headers: { 'X-MAL-CLIENT-ID': MAL_CLIENT_ID }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        source: 'MAL API',
        status: data.status, // 'finished_airing', 'currently_airing', 'not_yet_aired'
        isFinished: data.status === 'finished_airing',
        isAiring: data.status === 'currently_airing',
        episodes: data.num_episodes,
        endDate: data.end_date,
        broadcast: data.broadcast
      };
    }
  } catch (e) {}

  // 2. Fallback to Jikan
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${numericId}`);
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      if (d) {
        const isFinished = d.airing === false || d.status === 'Finished Airing';
        const isAiring = d.airing === true || d.status === 'Currently Airing';
        return {
          source: 'Jikan',
          status: isFinished ? 'finished_airing' : (isAiring ? 'currently_airing' : 'other'),
          isFinished,
          isAiring,
          episodes: d.episodes,
          endDate: d.aired?.to ? d.aired.to.split('T')[0] : null,
          broadcast: d.broadcast
        };
      }
    }
  } catch (e) {}

  return null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Live Airing Check & Production D1 Update');
  console.log(' User ID:', USER_ID);
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Querying current airing anime from remote production D1...');
  const queryCmd = `npx wrangler d1 execute DB --env production --remote --command "SELECT id, title, status, airing_day, airing_time, mal_id FROM media WHERE user_id = '${USER_ID}' AND airing_day IS NOT NULL AND airing_day != 'finished';" --json`;
  const raw = execSync(queryCmd, { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  const items = parsed[0]?.results || [];

  console.log(`Found ${items.length} anime entries with active airing schedule:\n`);

  const updates = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    process.stdout.write(`[${i + 1}/${items.length}] Checking "${item.title}" (MAL ID: ${item.mal_id})... `);

    if (!item.mal_id) {
      console.log('Skipped (no MAL ID)');
      continue;
    }

    const info = await fetchMalStatus(item.mal_id);
    if (!info) {
      console.log('Could not fetch MAL status');
      continue;
    }

    if (info.isFinished) {
      console.log(`FINISHED AIRING (${info.source})`);
      console.log(`   -> Setting airing_day = 'finished', airing_time = NULL`);
      const escId = item.id.replace(/'/g, "''");
      updates.push(`UPDATE media SET airing_day = 'finished', airing_time = NULL, updated_at = unixepoch() WHERE id = '${escId}' AND user_id = '${USER_ID}';`);
    } else if (info.isAiring) {
      console.log(`STILL AIRING (Day ${item.airing_day} ${item.airing_time || ''})`);
    } else {
      console.log(`Status: ${info.status}`);
    }

    // Throttle slightly between requests
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n───────────────────────────────────────────────────────');
  if (updates.length > 0) {
    console.log(`Applying ${updates.length} updates to remote production D1...`);
    const updateSql = updates.join(' ');
    // Escape double quotes in SQL for command line
    const escapedSql = updateSql.replace(/"/g, '\\"');
    const execCmd = `npx wrangler d1 execute DB --env production --remote --command "${escapedSql}" --json`;
    const res = execSync(execCmd, { encoding: 'utf8' });
    console.log('✓ Successfully updated in production D1!');
    console.log(`✓ ${updates.length} anime marked as 'finished' and removed from calendar!`);
  } else {
    console.log('All checked anime are actively currently airing — no changes needed.');
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
