-- Migration 0006: Add release_date fields and notifications schema
ALTER TABLE media ADD COLUMN release_date TEXT;        -- 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | NULL
ALTER TABLE media ADD COLUMN release_date_source TEXT; -- 'anilist' | 'mal' | 'manual' | NULL
ALTER TABLE media ADD COLUMN release_date_updated_at TEXT;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'sequel_discovery' | 'date_change'
  mal_id INTEGER,
  media_id TEXT,                 -- set once added to library
  title TEXT NOT NULL,
  message TEXT,
  data_json TEXT,                -- JSON: {match:{method:'relation'}, old_date, new_date, kept_manual, poster, format, parent_media_id, parent_title, status_hint}
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, read_at, dismissed_at);

CREATE TABLE IF NOT EXISTS ignored_titles (
  user_id TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  ignored_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mal_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Global relation cache (cross-user):
CREATE TABLE IF NOT EXISTS relation_cache (
  mal_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (mal_id, provider)
);
