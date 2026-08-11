-- Migration 0004: Add playlist_url, sync_interval_days, and last_synced_at columns to playlists table
ALTER TABLE playlists ADD COLUMN playlist_url TEXT;
ALTER TABLE playlists ADD COLUMN sync_interval_days INTEGER DEFAULT 7;
ALTER TABLE playlists ADD COLUMN last_synced_at INTEGER DEFAULT 0;
