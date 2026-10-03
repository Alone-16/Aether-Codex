-- Migration 0007: Scoped uniqueness for MAL IDs per user and genre (applied only post-backfill)
CREATE UNIQUE INDEX IF NOT EXISTS ux_media_user_genre_mal
  ON media(user_id, genre_id, mal_id) WHERE mal_id IS NOT NULL;
