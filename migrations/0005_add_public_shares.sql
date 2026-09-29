-- Migration 0005: Add public_shares table
CREATE TABLE IF NOT EXISTS public_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_publicshares_user ON public_shares(user_id);
