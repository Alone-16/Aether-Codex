import { readFileSync, writeFileSync } from 'fs';

const BACKUP_DIR = 'C:/Users/Blink/Documents/Aether Codex/Aether Codex-20260803T134857Z-1-001/Aether Codex';

const TARGET_USER = {
  id: 'usr_bmFkZWVtcHViZ21vYmlsZUBnbWFpbC5jb20',
  email: 'nadeempubgmobile@gmail.com',
  name: 'Nadeem'
};

const mediaData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_media.json`, 'utf8'));
const gamesData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_games.json`, 'utf8'));
const booksData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_books.json`, 'utf8'));
const musicData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_music.json`, 'utf8'));
const notesData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_notes.json`, 'utf8'));
const vaultData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_vault.json`, 'utf8'));
const settsData = JSON.parse(readFileSync(`${BACKUP_DIR}/ac_settings.json`, 'utf8'));

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  return `'${String(val).replace(/'/g, "''")}'`;
}

const sqlLines = [
  '-- Auto-generated Full Database Import Script for nadeempubgmobile@gmail.com',
  `INSERT INTO users (id, email, name) VALUES (${esc(TARGET_USER.id)}, ${esc(TARGET_USER.email)}, ${esc(TARGET_USER.name)}) ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name;`
];

// 1. Media
const mediaItems = mediaData.data || [];
for (const m of mediaItems) {
  const id = m.id || crypto.randomUUID();
  const genreId = m.genreId || m.genre_id || 'anime';
  const title = m.title || 'Untitled';
  const titleEn = m.titleEn || m.title_en || null;
  const titleJp = m.titleJp || m.title_jp || null;
  const status = m.status || 'watching';
  const score = m.score !== undefined ? m.score : (m.rating !== undefined ? m.rating : null);
  const epCur = m.epCur || m.ep_cur || 0;
  const epTot = m.epTot || m.ep_tot || 0;
  const epDuration = m.epDuration || m.ep_duration || 24;
  const startDate = m.startDate || m.start_date || null;
  const endDate = m.endDate || m.end_date || null;
  const airingDay = m.airingDay !== undefined ? m.airingDay : (m.airing_day !== undefined ? m.airing_day : null);
  const airingTime = m.airingTime || m.airing_time || null;
  const coverImage = m.coverImage || m.cover_image || null;
  const watchUrl = m.watchUrl || m.watch_url || null;
  const malId = m.malId || m.mal_id || null;
  const linkedGroupId = m.linkedGroupId || m.linked_group_id || null;
  const linkedGroupOrder = m.linkedGroupOrder || m.linked_group_order || null;
  const pinned = m.pinned ? 1 : 0;
  const notes = m.notes || null;

  sqlLines.push(
    `INSERT OR REPLACE INTO media (id, user_id, genre_id, title, title_en, title_jp, status, score, ep_cur, ep_tot, ep_duration, start_date, end_date, airing_day, airing_time, cover_image, watch_url, mal_id, linked_group_id, linked_group_order, pinned, notes) ` +
    `VALUES (${esc(id)}, ${esc(TARGET_USER.id)}, ${esc(genreId)}, ${esc(title)}, ${esc(titleEn)}, ${esc(titleJp)}, ${esc(status)}, ${esc(score)}, ${esc(epCur)}, ${esc(epTot)}, ${esc(epDuration)}, ${esc(startDate)}, ${esc(endDate)}, ${esc(airingDay)}, ${esc(airingTime)}, ${esc(coverImage)}, ${esc(watchUrl)}, ${esc(malId)}, ${esc(linkedGroupId)}, ${esc(linkedGroupOrder)}, ${esc(pinned)}, ${esc(notes)});`
  );
}

// 2. Games
const gamesList = gamesData.games || [];
for (const g of gamesList) {
  const id = g.id || crypto.randomUUID();
  const title = g.title || 'Untitled Game';
  const platform = g.platform || 'pc';
  const status = g.status || 'playing';
  const rating = g.rating !== undefined ? g.rating : null;
  const hours = g.hoursPlayed || g.hours_played || g.totalHours || 0;
  const saveFolderId = g.saveFileId || g.save_folder_id || null;
  const notes = g.notes || null;

  sqlLines.push(
    `INSERT OR REPLACE INTO games (id, user_id, title, platform, status, rating, hours_played, save_folder_id, notes) ` +
    `VALUES (${esc(id)}, ${esc(TARGET_USER.id)}, ${esc(title)}, ${esc(platform)}, ${esc(status)}, ${esc(rating)}, ${esc(hours)}, ${esc(saveFolderId)}, ${esc(notes)});`
  );
}

// 3. Books
const booksList = booksData.books || [];
for (const b of booksList) {
  const id = b.id || crypto.randomUUID();
  const title = b.title || 'Untitled Book';
  const author = b.author || null;
  const format = b.format || 'novel';
  const status = b.status || 'reading';
  const rating = b.rating || null;
  const pCur = b.progressCur || b.progress_cur || 0;
  const pTot = b.progressTot || b.progress_tot || 0;
  const notes = b.notes || null;

  sqlLines.push(
    `INSERT OR REPLACE INTO books (id, user_id, title, author, format, status, rating, progress_cur, progress_tot, notes) ` +
    `VALUES (${esc(id)}, ${esc(TARGET_USER.id)}, ${esc(title)}, ${esc(author)}, ${esc(format)}, ${esc(status)}, ${esc(rating)}, ${esc(pCur)}, ${esc(pTot)}, ${esc(notes)});`
  );
}

// 4. Music & Playlists
const musicList = musicData.music || [];
const playlistsSet = new Set();
for (const s of musicList) {
  const id = s.id || crypto.randomUUID();
  const title = s.title || 'Untitled Song';
  const artist = s.artist || null;
  const album = s.album || null;
  const duration = s.durationSec || s.duration_sec || s.duration || null;
  const ytId = s.youtubeId || s.youtube_id || s.videoId || null;
  const plId = s.playlistId || s.playlist_id || null;

  if (plId && !playlistsSet.has(plId)) {
    playlistsSet.add(plId);
    sqlLines.push(
      `INSERT OR REPLACE INTO playlists (id, user_id, title, description) ` +
      `VALUES (${esc(plId)}, ${esc(TARGET_USER.id)}, ${esc('Playlist ' + plId.slice(0, 8))}, 'Imported Playlist');`
    );
  }

  sqlLines.push(
    `INSERT OR REPLACE INTO music (id, user_id, title, artist, album, duration_sec, youtube_id, playlist_id) ` +
    `VALUES (${esc(id)}, ${esc(TARGET_USER.id)}, ${esc(title)}, ${esc(artist)}, ${esc(album)}, ${esc(duration)}, ${esc(ytId)}, ${esc(plId)});`
  );
}

// 5. Notes
const notesList = notesData.notes || [];
for (const n of notesList) {
  const id = n.id || crypto.randomUUID();
  const title = n.title || 'Untitled Note';
  const content = n.content || n.body || JSON.stringify(n.items || []);
  sqlLines.push(
    `INSERT OR REPLACE INTO notes (id, user_id, title, content, is_encrypted) ` +
    `VALUES (${esc(id)}, ${esc(TARGET_USER.id)}, ${esc(title)}, ${esc(content)}, 0);`
  );
}

// 6. Vault
const vaultList = vaultData.vault_public || [];
for (const v of vaultList) {
  const id = v.id || crypto.randomUUID();
  const title = v.title || v.desc || 'Untitled Link';
  const url = v.url || '#';
  const category = v.category || 'General';
  sqlLines.push(
    `INSERT OR REPLACE INTO vault (id, user_id, title, url, category, is_encrypted) ` +
    `VALUES (${esc(id)}, ${esc(TARGET_USER.id)}, ${esc(title)}, ${esc(url)}, ${esc(category)}, 0);`
  );
}

// 7. Settings & Genres
const prefsJson = JSON.stringify(settsData.settings || {});
const genresJson = JSON.stringify(mediaData.genres || []);
sqlLines.push(
  `INSERT OR REPLACE INTO settings (user_id, preferences_json, genres_json) ` +
  `VALUES (${esc(TARGET_USER.id)}, ${esc(prefsJson)}, ${esc(genresJson)});`
);

writeFileSync('import_full_backup.sql', sqlLines.join('\n'), 'utf8');
console.log(`✅ Generated import_full_backup.sql for ${TARGET_USER.email} (${sqlLines.length} statements, ${(readFileSync('import_full_backup.sql').length / 1024).toFixed(0)} KB)`);
