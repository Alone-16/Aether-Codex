-- Migration 0008: Shared Airing Cache for Released & Airing Episodes
-- Keyed by MAL ID for multi-user deduplicated background syncing

CREATE TABLE IF NOT EXISTS airing_cache (
    mal_id INTEGER PRIMARY KEY,
    released_eps INTEGER NOT NULL DEFAULT 0,
    total_eps INTEGER DEFAULT 0,
    next_ep_no INTEGER,
    next_ep_at INTEGER,                        -- Unix timestamp in seconds (UTC)
    shiki_status TEXT,                         -- 'ongoing' | 'released' | 'anons'
    source TEXT,                               -- 'calendar' | 'batch'
    checked_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_airing_cache_checked ON airing_cache(checked_at);
