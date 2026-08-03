import { readFileSync, writeFileSync } from 'fs';

const B = 'C:/Users/Blink/Documents/Aether Codex/Aether Codex-20260803T134857Z-1-001/Aether Codex';

const mediaData  = JSON.parse(readFileSync(`${B}/ac_media.json`, 'utf8'));
const gamesData  = JSON.parse(readFileSync(`${B}/ac_games.json`, 'utf8'));
const booksData  = JSON.parse(readFileSync(`${B}/ac_books.json`, 'utf8'));
const musicData  = JSON.parse(readFileSync(`${B}/ac_music.json`, 'utf8'));
const notesData  = JSON.parse(readFileSync(`${B}/ac_notes.json`, 'utf8'));
const vaultData  = JSON.parse(readFileSync(`${B}/ac_vault.json`, 'utf8'));
const logData    = JSON.parse(readFileSync(`${B}/ac_log.json`, 'utf8'));
const settsData  = JSON.parse(readFileSync(`${B}/ac_settings.json`, 'utf8'));

const USER_ID = 'test-user-001'; // Default test user ID for local & cloud DB

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  return `'${String(val).replace(/'/g, "''")}'`;
}

const sqlLines = [
  `-- Auto-generated SQL import from backup`,
  `INSERT OR IGNORE INTO users (id, email, name) VALUES (${esc(USER_ID)}, 'user@aethercodex.dev', 'Aether User');`
];

// Media
const items = mediaData.data || [];
for (const m of items) {
  const id = m.id || crypto.randomUUID();
  const genreId = m.genreId || m.genre_id || 'anime';
  const title = m.title || 'Untitled';
  const status = m.status || 'watching';
  const score = m.score !== undefined ? m.score : null;
  const epCur = m.epCur || m.ep_cur || 0;
  const epTot = m.epTot || m.ep_tot || 0;
  const notes = m.notes || null;
  sqlLines.push(
    `INSERT OR REPLACE INTO media (id, user_id, genre_id, title, status, score, ep_cur, ep_tot, notes) ` +
    `VALUES (${esc(id)}, ${esc(USER_ID)}, ${esc(genreId)}, ${esc(title)}, ${esc(status)}, ${esc(score)}, ${esc(epCur)}, ${esc(epTot)}, ${esc(notes)});`
  );
}

// Games
const games = gamesData.games || [];
for (const g of games) {
  const id = g.id || crypto.randomUUID();
  const title = g.title || 'Untitled Game';
  const platform = g.platform || 'pc';
  const status = g.status || 'playing';
  const rating = g.rating || g.score || null;
  const hours = g.hoursPlayed || g.hours_played || 0;
  const notes = g.notes || null;
  sqlLines.push(
    `INSERT OR REPLACE INTO games (id, user_id, title, platform, status, rating, hours_played, notes) ` +
    `VALUES (${esc(id)}, ${esc(USER_ID)}, ${esc(title)}, ${esc(platform)}, ${esc(status)}, ${esc(rating)}, ${esc(hours)}, ${esc(notes)});`
  );
}

// Books
const books = booksData.books || [];
for (const b of books) {
  const id = b.id || crypto.randomUUID();
  const title = b.title || 'Untitled Book';
  const author = b.author || null;
  const format = b.format || 'novel';
  const status = b.status || 'reading';
  const rating = b.rating || b.score || null;
  const pCur = b.progressCur || b.progress_cur || 0;
  const pTot = b.progressTot || b.progress_tot || 0;
  const notes = b.notes || null;
  sqlLines.push(
    `INSERT OR REPLACE INTO books (id, user_id, title, author, format, status, rating, progress_cur, progress_tot, notes) ` +
    `VALUES (${esc(id)}, ${esc(USER_ID)}, ${esc(title)}, ${esc(author)}, ${esc(format)}, ${esc(status)}, ${esc(rating)}, ${esc(pCur)}, ${esc(pTot)}, ${esc(notes)});`
  );
}

// Music
const songs = musicData.music || [];
for (const s of songs) {
  const id = s.id || crypto.randomUUID();
  const title = s.title || 'Untitled Song';
  const artist = s.artist || null;
  const album = s.album || null;
  const duration = s.durationSec || s.duration_sec || null;
  const ytId = s.youtubeId || s.youtube_id || null;
  sqlLines.push(
    `INSERT OR REPLACE INTO music (id, user_id, title, artist, album, duration_sec, youtube_id) ` +
    `VALUES (${esc(id)}, ${esc(USER_ID)}, ${esc(title)}, ${esc(artist)}, ${esc(album)}, ${esc(duration)}, ${esc(ytId)});`
  );
}

// Notes
const notes = notesData.notes || [];
for (const n of notes) {
  const id = n.id || crypto.randomUUID();
  const title = n.title || 'Untitled Note';
  const content = n.content || '';
  sqlLines.push(
    `INSERT OR REPLACE INTO notes (id, user_id, title, content) ` +
    `VALUES (${esc(id)}, ${esc(USER_ID)}, ${esc(title)}, ${esc(content)});`
  );
}

// Settings
const prefsJson = JSON.stringify(settsData.settings || {});
const genresJson = JSON.stringify(mediaData.genres || []);
sqlLines.push(
  `INSERT OR REPLACE INTO settings (user_id, preferences_json, genres_json) ` +
  `VALUES (${esc(USER_ID)}, ${esc(prefsJson)}, ${esc(genresJson)});`
);

writeFileSync('import_data.sql', sqlLines.join('\n'), 'utf8');
console.log(`✅ Generated import_data.sql (${sqlLines.length} statements, ${(readFileSync('import_data.sql').length / 1024).toFixed(0)} KB)`);
