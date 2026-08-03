// ═══════════════════════════════════════════════════════════════════
//  seed-data.js — Paste this into your browser console at localhost:3000
//  to populate the app with sample data for testing.
// ═══════════════════════════════════════════════════════════════════

(function seedAllSections() {
  const uid = () => crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  // ── GENRES ──
  const genres = [
    { id: 'anime',   name: 'Anime',   color: '#e879a0' },
    { id: 'kdrama',  name: 'K-Drama', color: '#7dd3fc' },
    { id: 'movie',   name: 'Movie',   color: '#fbbf24' },
    { id: 'series',  name: 'Series',  color: '#4ade80' },
  ];
  localStorage.setItem('ac_v4_genres', JSON.stringify(genres));
  localStorage.setItem('ac_v4_genre', 'anime');

  // ── MEDIA (anime / shows) ──
  const media = [
    {
      id: uid(), title: 'Solo Leveling', genreId: 'anime', status: 'watching',
      score: 9.2, epCur: 18, epTot: 25, epDuration: 24,
      dateAdded: '2024-12-01', dateUpdated: today,
      airingDay: 6, airingTime: '23:00',
      notes: 'Season 2 — Jeju Island arc incoming',
      favorite: true, pinned: true,
      timeline: [
        { type: 'season', num: 1, name: 'Arise from the Shadow', eps: 12, epWatched: 12 },
        { type: 'season', num: 2, name: 'Arise from the Shadow S2', eps: 13, epWatched: 6 },
      ],
    },
    {
      id: uid(), title: 'Frieren: Beyond Journey\'s End', genreId: 'anime', status: 'completed',
      score: 9.8, epCur: 28, epTot: 28, epDuration: 24,
      dateAdded: '2023-10-01', dateUpdated: '2024-03-22',
      notes: 'Masterpiece. Rewatch material.',
      favorite: true,
      timeline: [
        { type: 'season', num: 1, name: 'Season 1', eps: 28, epWatched: 28 },
      ],
    },
    {
      id: uid(), title: 'Oshi no Ko', genreId: 'anime', status: 'watching',
      score: 8.5, epCur: 20, epTot: null, epDuration: 24,
      dateAdded: '2023-04-12', dateUpdated: today,
      airingDay: 3, airingTime: '23:00',
      timeline: [
        { type: 'season', num: 1, name: 'Season 1', eps: 11, epWatched: 11 },
        { type: 'season', num: 2, name: 'Season 2', eps: 13, epWatched: 9 },
      ],
    },
    {
      id: uid(), title: 'Naruto Shippuden', genreId: 'anime', status: 'completed',
      score: 8.0, epCur: 500, epTot: 500, epDuration: 24,
      dateAdded: '2020-01-15', dateUpdated: '2022-06-10',
      notes: 'Pain arc is peak fiction',
      timeline: [
        { type: 'season', num: 1, name: 'Naruto Shippuden', eps: 500, epWatched: 500 },
      ],
    },
    {
      id: uid(), title: 'Vinland Saga', genreId: 'anime', status: 'completed',
      score: 9.5, epCur: 48, epTot: 48, epDuration: 24,
      dateAdded: '2023-01-10', dateUpdated: '2023-07-01',
      favorite: true,
      timeline: [
        { type: 'season', num: 1, name: 'Season 1', eps: 24, epWatched: 24 },
        { type: 'season', num: 2, name: 'Season 2', eps: 24, epWatched: 24 },
      ],
    },
    {
      id: uid(), title: 'Dandadan', genreId: 'anime', status: 'plan',
      score: null, epCur: 0, epTot: 12, epDuration: 24,
      dateAdded: today,
      notes: 'Heard it\'s wild',
    },
    {
      id: uid(), title: 'Squid Game', genreId: 'kdrama', status: 'completed',
      score: 8.8, epCur: 9, epTot: 9, epDuration: 55,
      dateAdded: '2021-09-17', dateUpdated: '2021-10-01',
    },
    {
      id: uid(), title: 'Interstellar', genreId: 'movie', status: 'completed',
      score: 10, epCur: 1, epTot: 1, epDuration: 169,
      dateAdded: '2020-03-01',
      notes: 'Greatest movie ever made. The docking scene.',
      favorite: true,
    },
  ];
  localStorage.setItem('ac_v4_media', JSON.stringify(media));

  // ── GAMES ──
  const games = [
    {
      id: uid(), title: 'Cyberpunk 2077', platform: 'PC', status: 'playing',
      rating: 9, hoursPlayed: 85, dateAdded: '2024-01-15',
      notes: 'Phantom Liberty DLC is incredible', favorite: true,
    },
    {
      id: uid(), title: 'Elden Ring', platform: 'PC', status: 'completed',
      rating: 10, hoursPlayed: 220, dateAdded: '2022-02-25',
      notes: 'Let me solo her', favorite: true,
    },
    {
      id: uid(), title: 'Hollow Knight', platform: 'PC', status: 'completed',
      rating: 9.5, hoursPlayed: 65, dateAdded: '2023-06-01',
      notes: 'Silksong when?',
    },
    {
      id: uid(), title: 'Baldur\'s Gate 3', platform: 'PC', status: 'playing',
      rating: 9.5, hoursPlayed: 120, dateAdded: '2023-08-03',
      notes: 'Honour mode run',
    },
    {
      id: uid(), title: 'Sekiro: Shadows Die Twice', platform: 'PC', status: 'completed',
      rating: 9.2, hoursPlayed: 50, dateAdded: '2023-03-15',
    },
  ];
  localStorage.setItem('ac_v4_games', JSON.stringify(games));

  // ── BOOKS ──
  const books = [
    {
      id: uid(), title: 'Dune', author: 'Frank Herbert', format: 'novel',
      status: 'completed', rating: 9.5, progressCur: 688, progressTot: 688,
      dateAdded: '2024-02-01', notes: 'The spice must flow',
    },
    {
      id: uid(), title: 'Project Hail Mary', author: 'Andy Weir', format: 'novel',
      status: 'reading', rating: 9.8, progressCur: 200, progressTot: 476,
      dateAdded: '2024-08-10', notes: 'Rocky is the best character ever written',
    },
    {
      id: uid(), title: 'Solo Leveling', author: 'Chugong', format: 'light_novel',
      status: 'completed', rating: 8.5, progressCur: 270, progressTot: 270,
      dateAdded: '2023-05-20',
    },
  ];
  localStorage.setItem('ac_v4_books', JSON.stringify(books));

  // ── MUSIC ──
  const music = [
    {
      id: uid(), title: 'Blinding Lights', artist: 'The Weeknd',
      genre: 'Synthwave', rating: 9, favorite: true, dateAdded: '2024-01-01',
    },
    {
      id: uid(), title: 'Glimpse of Us', artist: 'Joji',
      genre: 'R&B', rating: 9.5, favorite: true, dateAdded: '2024-03-15',
    },
    {
      id: uid(), title: 'Unravel', artist: 'TK from Ling Tosite Sigure',
      genre: 'J-Rock', rating: 10, favorite: true, dateAdded: '2023-11-01',
      notes: 'Tokyo Ghoul OP - absolute masterpiece',
    },
    {
      id: uid(), title: 'Blue Bird', artist: 'Ikimonogakari',
      genre: 'J-Pop', rating: 8.5, dateAdded: '2023-06-10',
      notes: 'Naruto Shippuden OP3',
    },
  ];
  localStorage.setItem('ac_v4_music', JSON.stringify(music));

  // ── NOTES ──
  const notes = [
    {
      id: uid(), title: 'Arch Linux Setup', content: '# Arch Linux Setup\n\n1. Boot from USB\n2. `iwctl station wlan0 connect SSID`\n3. `archinstall`\n4. Select BTRFS with encryption\n5. Install KDE Plasma',
      tags: ['linux', 'setup', 'coding'], pinned: true, dateAdded: '2024-06-01',
    },
    {
      id: uid(), title: 'VS Code Extensions', content: '- GitLens\n- Prettier\n- ESLint\n- Thunder Client\n- Material Icon Theme\n- One Dark Pro',
      tags: ['coding', 'tools'], dateAdded: '2024-07-15',
    },
    {
      id: uid(), title: 'Anime Watchlist Priority', content: '1. Dandadan\n2. Blue Lock S2\n3. Mushoku Tensei S3\n4. Re:Zero S3',
      tags: ['anime', 'watchlist'], dateAdded: today,
    },
  ];
  localStorage.setItem('ac_v4_notes', JSON.stringify(notes));

  // ── LOG ──
  const log = [
    { id: uid(), type: 'media', action: 'Watched Solo Leveling S2 Ep 6', date: today, section: 'media' },
    { id: uid(), type: 'game',  action: 'Played Cyberpunk 2077 for 3 hours', date: today, section: 'games' },
    { id: uid(), type: 'book',  action: 'Read 30 pages of Project Hail Mary', date: today, section: 'books' },
  ];
  localStorage.setItem('ac_v4_log', JSON.stringify(log));

  // ── SETTINGS ──
  localStorage.setItem('ac_v4_theme', 'dark');
  localStorage.setItem('ac_v4_ver', '4.0');
  localStorage.setItem('ac_v4_saved', String(Date.now()));

  console.log('🎉 Seed data loaded! Refresh the page (Ctrl+F5) to see it.');
  console.log(`   📺 ${media.length} media entries`);
  console.log(`   🎮 ${games.length} games`);
  console.log(`   📚 ${books.length} books`);
  console.log(`   🎵 ${music.length} music tracks`);
  console.log(`   📝 ${notes.length} notes`);
  console.log(`   📋 ${log.length} log entries`);
  console.log(`   🏷️  ${genres.length} genres`);
})();
