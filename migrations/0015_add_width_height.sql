-- Add width and height to images (split from 0001 to avoid duplicate column errors)
-- If this fails with "duplicate column name", the columns exist already.
-- Mark as applied: wrangler d1 execute tchoff-db --remote --command "INSERT INTO d1_migrations (name) VALUES ('0015_add_width_height.sql');"
ALTER TABLE images ADD COLUMN width INTEGER;
ALTER TABLE images ADD COLUMN height INTEGER;
