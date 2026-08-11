-- ═══════════════════════════════════════════════════════════════════
--  Aether Codex D1 Relational Schema (v1.0)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,               -- User ID
    email TEXT NOT NULL,
    name TEXT,
    picture TEXT,
    password_hash TEXT,                -- PBKDF2 hashed password (salt:hash)
    created_at INTEGER DEFAULT (unixepoch())
);

-- 2. Hashed Refresh Tokens (Session & Device Security)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,          -- SHA-256 hash of refresh token
    device_name TEXT,
    ip_address TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    last_used_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refreshtok_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refreshtok_hash ON refresh_tokens(token_hash);

-- 3. Media Items (Anime, Drama, TV Shows, Movies, Cartoons, etc.)
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    genre_id TEXT NOT NULL,
    title TEXT NOT NULL,
    title_en TEXT,
    title_jp TEXT,
    status TEXT NOT NULL,             -- 'watching', 'completed', 'plan', 'on_hold', 'dropped', 'upcoming'
    score REAL,
    ep_cur INTEGER DEFAULT 0,
    ep_tot INTEGER DEFAULT 0,
    ep_duration INTEGER DEFAULT 24,
    rewatch_count INTEGER DEFAULT 0,
    mal_id INTEGER,
    linked_group_id TEXT,
    linked_group_order INTEGER,
    pinned INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id);
CREATE INDEX IF NOT EXISTS idx_media_status ON media(user_id, status);

-- 4. Media Rewatches (Normalized)
CREATE TABLE IF NOT EXISTS rewatches (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    ep_watched INTEGER DEFAULT 0,
    rating REAL,
    start_date TEXT,
    end_date TEXT,
    notes TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rewatches_media ON rewatches(media_id);

-- 5. Games Items
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,           -- 'pc', 'mobile', 'both'
    status TEXT NOT NULL,
    rating REAL,
    hours_played REAL DEFAULT 0,
    save_folder_id TEXT,
    notes TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id);

-- 6. Books Items
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    format TEXT NOT NULL,             -- 'novel', 'manga', 'audiobook'
    status TEXT NOT NULL,
    rating REAL,
    progress_cur INTEGER DEFAULT 0,
    progress_tot INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);

-- 7. Music Songs
CREATE TABLE IF NOT EXISTS music (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    duration_sec INTEGER,
    youtube_id TEXT,
    playlist_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_music_user ON music(user_id);

-- 8. Music Playlists
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail TEXT,
    item_count INTEGER DEFAULT 0,
    synced INTEGER DEFAULT 0,
    playlist_url TEXT,
    sync_interval_days INTEGER DEFAULT 7,
    last_synced_at INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);

-- 9. Notes
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    is_encrypted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

-- 10. Note Tags (Normalized)
CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notetags_tag ON note_tags(user_id, tag);

-- 11. Vault Links
CREATE TABLE IF NOT EXISTS vault (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT,
    is_encrypted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vault_user ON vault(user_id);

-- 12. Vault Tags (Normalized)
CREATE TABLE IF NOT EXISTS vault_tags (
    vault_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (vault_id, tag),
    FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vaulttags_tag ON vault_tags(user_id, tag);

-- 13. Activity Logs
CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    section TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);

-- 14. Settings & Genres (JSON configuration)
CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    genres_json TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 15. Game Save Files & Folder Tree Metadata (R2 Object Storage)
CREATE TABLE IF NOT EXISTS user_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    game_title TEXT NOT NULL,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,       -- Preserves nested folders e.g. 'saves/slot1/data.bin'
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,             -- SHA-256 hash
    r2_key TEXT NOT NULL,               -- Key in R2 bucket
    uploaded_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_files_user ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_game ON user_files(user_id, game_title);

-- 16. Full-Text Search Virtual Table (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    user_id UNINDEXED,
    item_id UNINDEXED,
    section UNINDEXED,
    title,
    content,
    tokenize = 'porter unicode61'
);
