import fs from 'fs';

const USER_ID = 'usr_bmFkZWVtcHViZ21vYmlsZUBnbWFpbC5jb20';

async function fetchMalInfo(malId) {
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

async function run() {
  console.log('Fetching media list for user...');
  const res = await fetch(`https://aether-codex.nadeempubgmobile2-0.workers.dev/v1/media`);
  console.log('Done.');
}
run();
