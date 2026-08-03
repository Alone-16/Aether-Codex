import { readFileSync, writeFileSync } from 'fs';

const B = 'C:/Users/Blink/Documents/Aether Codex/Aether Codex-20260803T134857Z-1-001/Aether Codex';

const media    = JSON.parse(readFileSync(`${B}/ac_media.json`, 'utf8'));
const games    = JSON.parse(readFileSync(`${B}/ac_games.json`, 'utf8'));
const books    = JSON.parse(readFileSync(`${B}/ac_books.json`, 'utf8'));
const music    = JSON.parse(readFileSync(`${B}/ac_music.json`, 'utf8'));
const notes    = JSON.parse(readFileSync(`${B}/ac_notes.json`, 'utf8'));
const vault    = JSON.parse(readFileSync(`${B}/ac_vault.json`, 'utf8'));
const log      = JSON.parse(readFileSync(`${B}/ac_log.json`, 'utf8'));
const settings = JSON.parse(readFileSync(`${B}/ac_settings.json`, 'utf8'));

// Map to correct localStorage keys
const lsData = {
  'ac_v4_media':   media.data   || [],
  'ac_v4_genres':  media.genres || [],
  'ac_v4_genre':   'anime',
  'ac_v4_games':   games.games  || [],
  'ac_v4_books':   books.books  || [],
  'ac_v4_music':   music.music  || [],
  'ac_v4_music_playlists': music.playlists || [],
  'ac_v4_notes':   notes.notes  || [],
  'ac_v4_vault':   vault.vault_enc || vault.vault_public || [],
  'ac_v4_log':     log.log      || [],
  'ac_v4_theme':   settings.settings?.theme || 'dark',
  'ac_v4_ver':     '4.0',
  'ac_v4_saved':   String(Date.now()),
};

// Settings layout fields
const s = settings.settings || {};
if (s.sectionOrder)   lsData['_ac_section_order']   = s.sectionOrder;
if (s.sectionEnabled) lsData['_ac_section_enabled'] = s.sectionEnabled;
if (s.density)        lsData['_ac_density']         = s.density;
if (s.fontSize)       lsData['_ac_fontsize']        = s.fontSize;

// MAL tokens
if (s.malAccessToken)  lsData['ac_v4_mal_token']   = s.malAccessToken;
if (s.malRefreshToken) lsData['ac_v4_mal_refresh']  = s.malRefreshToken;
if (s.malTokenExpiry)  lsData['ac_v4_mal_expiry']   = s.malTokenExpiry;

// Print stats
const counts = {
  media:  (media.data || []).length,
  genres: (media.genres || []).length,
  games:  (games.games || []).length,
  books:  (books.books || []).length,
  music:  (music.music || []).length,
  notes:  (notes.notes || []).length,
  log:    (log.log || []).length,
};
console.log('═══════════════════════════════════════════════');
console.log(' Aether Codex — Full Backup Import');
console.log('═══════════════════════════════════════════════');
console.log(`  📺 Media:  ${counts.media}`);
console.log(`  🏷️  Genres: ${counts.genres}`);
console.log(`  🎮 Games:  ${counts.games}`);
console.log(`  📚 Books:  ${counts.books}`);
console.log(`  🎵 Music:  ${counts.music}`);
console.log(`  📝 Notes:  ${counts.notes}`);
console.log(`  📋 Log:    ${counts.log}`);

// Generate browser script
let script = '// Auto-generated from your Google Drive backup\n(function(){\n';
for (const [key, value] of Object.entries(lsData)) {
  const json = JSON.stringify(value);
  script += `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(json)});\n`;
}
script += `console.log("🎉 Full backup imported! ${counts.media} media, ${counts.games} games, ${counts.music} music, ${counts.notes} notes, ${counts.genres} genres");\n`;
script += `console.log("Refresh the page (Ctrl+F5) to see your data.");\n`;
script += '})();\n';

writeFileSync('import-data.js', script, 'utf8');
console.log(`\n✅ Generated import-data.js (${(script.length / 1024).toFixed(0)} KB)`);
console.log('   In your browser console at localhost:3000, run:');
console.log('   fetch("/import-data.js").then(r=>r.text()).then(eval)');
