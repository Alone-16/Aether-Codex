import fs from 'fs';
import { execSync } from 'child_process';

const USER_ID = 'usr_bmFkZWVtcHViZ21vYmlsZUBnbWFpbC5jb20';

function getDbWatchingAnime() {
  const cmd = `npx wrangler d1 execute DB --env production --remote --command "SELECT id, title, status, ep_cur, ep_tot, airing_day, airing_time, mal_id FROM media WHERE user_id = '${USER_ID}' AND status = 'watching';" --json`;
  const out = execSync(cmd, { encoding: 'utf8', cwd: 'c:/Users/Blink/Documents/Aether Codex/Aether-Codex' });
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}

async function fetchJikan(malId) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (e) {
    return null;
  }
}

function parseIstBroadcast(broadcast) {
  if (!broadcast || !broadcast.day || !broadcast.time) return null;
  const dayMap = { sundays: 0, mondays: 1, tuesdays: 2, wednesdays: 3, thursdays: 4, fridays: 5, saturdays: 6 };
  let jstDay = dayMap[broadcast.day.toLowerCase()];
  if (jstDay === undefined) return null;

  const parts = broadcast.time.split(':');
  let jstHour = parseInt(parts[0], 10);
  let jstMin = parseInt(parts[1], 10);
  if (isNaN(jstHour) || isNaN(jstMin)) return null;

  let istMin = jstMin - 30;
  let istHour = jstHour - 3;
  let istDay = jstDay;

  if (istMin < 0) {
    istMin += 60;
    istHour -= 1;
  }
  if (istHour < 0) {
    istHour += 24;
    istDay = (istDay - 1 + 7) % 7;
  }

  const formattedHour = String(istHour).padStart(2, '0');
  const formattedMin = String(istMin).padStart(2, '0');

  return { day: istDay, time: `${formattedHour}:${formattedMin}` };
}

async function main() {
  console.log('Fetching watching anime list from D1...');
  const list = getDbWatchingAnime();
  console.log(`Found ${list.length} watching anime entries.`);

  const updates = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    console.log(`[${i + 1}/${list.length}] Checking MAL ID ${item.mal_id} (${item.title})...`);

    if (!item.mal_id) continue;

    const malData = await fetchJikan(item.mal_id);
    if (!malData) {
      console.log(`  -> Could not fetch MAL data for ${item.title}`);
      continue;
    }

    const isAiring = malData.airing === true;
    const malStatus = malData.status; // 'Currently Airing', 'Finished Airing', etc.
    const malEps = malData.episodes || 0;
    const istBroadcast = isAiring ? parseIstBroadcast(malData.broadcast) : null;

    let newStatus = item.status;
    let newAiringDay = item.airing_day;
    let newAiringTime = item.airing_time;
    let newEpTot = item.ep_tot || malEps || 0;

    const epCur = parseInt(item.ep_cur || 0, 10);
    const epTot = parseInt(newEpTot || 0, 10);

    if (!isAiring || malStatus === 'Finished Airing') {
      // Show is finished airing on MAL
      newAiringDay = null;
      newAiringTime = null;

      if (epTot > 0 && epCur >= epTot) {
        newStatus = 'completed';
      }
    } else if (isAiring) {
      // Currently airing on MAL
      if (istBroadcast) {
        newAiringDay = istBroadcast.day;
        newAiringTime = istBroadcast.time;
      }
    }

    const escTitle = item.title.replace(/'/g, "''");
    const aDayVal = newAiringDay !== null && newAiringDay !== undefined ? newAiringDay : 'NULL';
    const aTimeVal = newAiringTime ? `'${newAiringTime}'` : 'NULL';
    const epTotVal = newEpTot ? `'${newEpTot}'` : 'NULL';

    updates.push(
      `UPDATE media SET status = '${newStatus}', airing_day = ${aDayVal}, airing_time = ${aTimeVal}, ep_tot = ${epTotVal} WHERE id = '${item.id}';`
    );

    console.log(`  -> MAL status: "${malStatus}" (airing=${isAiring}) | New DB status: "${newStatus}" | AiringDay: ${aDayVal}`);

    // Throttle to respect Jikan API rate limit (1 sec per request)
    await new Promise(r => setTimeout(r, 1200));
  }

  if (updates.length > 0) {
    console.log(`\nExecuting ${updates.length} D1 updates...`);
    const sqlScript = updates.join('\n');
    fs.writeFileSync('anime_fix.sql', sqlScript, 'utf8');

    execSync(`npx wrangler d1 execute DB --env production --remote --file=anime_fix.sql`, {
      encoding: 'utf8',
      cwd: 'c:/Users/Blink/Documents/Aether Codex/Aether-Codex'
    });
    console.log('✅ All anime entries successfully audited and updated in D1 database!');
  }
}

main().catch(err => console.error(err));
