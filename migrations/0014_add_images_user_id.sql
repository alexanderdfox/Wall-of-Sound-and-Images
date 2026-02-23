-- Add user_id to images (split from 0002 to avoid duplicate column errors on partially-migrated DBs)
-- If this fails with "duplicate column name: user_id", the column exists already.
-- Mark as applied: wrangler d1 execute tchoff-db --remote --command "INSERT INTO d1_migrations (name) VALUES ('0014_add_images_user_id.sql');"
ALTER TABLE images ADD COLUMN user_id TEXT;
