-- Migration: Reassign all data from test-user-001 to actual Google user ID
DELETE FROM users WHERE id = 'test-user-001';
UPDATE media SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE rewatches SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE games SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE books SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE music SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE playlists SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE notes SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE vault SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE logs SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE settings SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
UPDATE refresh_tokens SET user_id = '102162217390277277420' WHERE user_id = 'test-user-001';
