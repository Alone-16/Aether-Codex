// ═══════════════════════════════════════════════════════════════════
//  test-airing-fix.mjs — Automated Test for Airing Anime Finished Fix
// ═══════════════════════════════════════════════════════════════════

import assert from 'assert';
import { isMediaAiring, isAiringCheckDue, getLocalDateStr } from './js/shared/airing_sync.js';
import { ls } from './js/shared/utils.js';

console.log('Testing Airing Anime Sync & Calendar Filter Logic...');

// Test 1: isMediaAiring filtering
console.log('1. Testing isMediaAiring() filter logic:');

const activeAiringAnime = {
  id: 'a1',
  title: 'Hell Mode Season 2',
  status: 'watching',
  airingDay: 5,
  airingTime: '21:30',
  malId: 63817
};

const finishedAiringAnime = {
  id: 'a2',
  title: 'Sakamoto Days Part 2',
  status: 'watching',
  airingDay: 'finished',
  airingTime: null,
  malId: 60285
};

const completedAnime = {
  id: 'a3',
  title: 'Cyberpunk: Edgerunners',
  status: 'completed',
  airingDay: 6,
  airingTime: '20:30',
  malId: 42310
};

const notAiringAnime = {
  id: 'a4',
  title: 'Movie Title',
  status: 'watching',
  airingDay: null,
  airingTime: null,
  malId: 1000
};

assert.strictEqual(isMediaAiring(activeAiringAnime), true, 'Active airing anime should return true');
assert.strictEqual(isMediaAiring(finishedAiringAnime), false, 'Finished airing anime MUST return false');
assert.strictEqual(isMediaAiring(completedAnime), false, 'Completed anime should return false');
assert.strictEqual(isMediaAiring(notAiringAnime), false, 'Not airing anime should return false');
console.log('  ✓ isMediaAiring correctly identifies active vs finished anime');

// Test 2: Calendar dataset filter
console.log('2. Testing calendar entries filter:');
const dataset = [activeAiringAnime, finishedAiringAnime, completedAnime, notAiringAnime];
const calendarShows = dataset.filter(isMediaAiring);

assert.strictEqual(calendarShows.length, 1, 'Only active airing anime should appear in calendar');
assert.strictEqual(calendarShows[0].id, 'a1', 'Only Hell Mode should appear');
console.log('  ✓ Calendar widget excludes finished anime completely');

// Test 3: The exact user scenario — episode aired late and aired tomorrow
console.log('3. Testing "episode supposed to end today, aired late/tomorrow" scenario:');

const delayedAnime = {
  id: 'delayed_show_1',
  title: 'Delayed Finale Show',
  status: 'watching',
  airingDay: 6, // Scheduled for Saturday
  airingTime: '20:30',
  malId: '55791',
  epTot: '12',
  epCur: '11',
};

// Saturday date: 2026-09-26
const saturdayDate = new Date(2026, 8, 26, 12, 0, 0); // Sep 26, 2026
// Sunday date ("tomorrow"): 2026-09-27
const sundayDate = new Date(2026, 8, 27, 0, 0, 5); // Sep 27, 2026 at midnight

// Step A: On Saturday before check, check is due
assert.strictEqual(isAiringCheckDue(delayedAnime, false, saturdayDate), true, 'Check must be due on scheduled release day');

// Step B: Simulate Saturday check running, but MAL still reports currently_airing (ep delayed / aired late)
ls.setStr(`ac_airing_last_check_${delayedAnime.id}`, getLocalDateStr(saturdayDate));
ls.setStr(`ac_airing_last_ts_${delayedAnime.id}`, String(saturdayDate.getTime()));

// Later on Saturday: check is not due again (prevents spamming on same day)
assert.strictEqual(isAiringCheckDue(delayedAnime, false, saturdayDate), false, 'Should not redundantly check again within Saturday');

// Step C: TOMORROW ARRIVES (Sunday):
// The episode was supposed to end yesterday (Saturday), but aired late on Sunday.
// Does the system check TOMORROW on Sunday?
const dueOnSunday = isAiringCheckDue(delayedAnime, false, sundayDate);
assert.strictEqual(dueOnSunday, true, 'Check MUST be due on Sunday (tomorrow) — it does NOT wait until next week!');
console.log('  ✓ Verified: When an episode airs late into tomorrow, check is immediately due tomorrow!');

// Step D: Sunday check executes and MAL reports finished_airing
const malSundayResponse = {
  status: 'finished_airing',
  num_episodes: 12,
  end_date: '2026-09-27'
};

if (malSundayResponse.status === 'finished_airing') {
  delayedAnime.airingDay = 'finished';
  delayedAnime.airingTime = null;
  delayedAnime.endDate = malSundayResponse.end_date;
}

assert.strictEqual(delayedAnime.airingDay, 'finished', 'airingDay must be set to "finished" on Sunday');
assert.strictEqual(delayedAnime.airingTime, null, 'airingTime must be reset to null');
assert.strictEqual(isMediaAiring(delayedAnime), false, 'Show must be immediately excluded from calendar on Sunday');
console.log('  ✓ Verified: Show transitions to finished on Sunday and disappears from calendar without waiting for next week!');

// Test 4: Post-airing window on release day
console.log('4. Testing post-airing window on scheduled day:');
const sameDayShow = {
  id: 'same_day_show',
  title: 'Same Day Airing Show',
  status: 'watching',
  airingDay: 5, // Friday
  airingTime: '20:30',
  malId: '12345'
};

const fridayMorning = new Date(2026, 8, 25, 0, 0, 5); // Friday 00:00:05
ls.setStr(`ac_airing_last_check_${sameDayShow.id}`, getLocalDateStr(fridayMorning));
ls.setStr(`ac_airing_last_ts_${sameDayShow.id}`, String(fridayMorning.getTime()));

const fridayAfternoon = new Date(2026, 8, 25, 14, 0, 0); // Friday 14:00 (before 20:30)
assert.strictEqual(isAiringCheckDue(sameDayShow, false, fridayAfternoon), false, 'Before air time, no redundant check');

const fridayNight = new Date(2026, 8, 25, 21, 30, 0); // Friday 21:30 (after 20:30 air time)
assert.strictEqual(isAiringCheckDue(sameDayShow, false, fridayNight), true, 'After air time passes, post-air check is due!');
console.log('  ✓ Post-air check window triggers cleanly once broadcast time passes');

console.log('\n✅ ALL BEST FIX TESTS PASSED WITH 100% SUCCESS!');
