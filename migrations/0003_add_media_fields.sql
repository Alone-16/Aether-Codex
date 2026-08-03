-- Migration 0003: Add start_date, end_date, airing_day, airing_time, cover_image, watch_url to media table
ALTER TABLE media ADD COLUMN start_date TEXT;
ALTER TABLE media ADD COLUMN end_date TEXT;
ALTER TABLE media ADD COLUMN airing_day INTEGER;
ALTER TABLE media ADD COLUMN airing_time TEXT;
ALTER TABLE media ADD COLUMN cover_image TEXT;
ALTER TABLE media ADD COLUMN watch_url TEXT;
