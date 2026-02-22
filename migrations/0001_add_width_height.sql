-- Add width and height columns for original image dimensions (legacy DBs only)
-- Run: npm run cf:d1:migrate
-- Ignore "duplicate column name" errors if columns already exist from schema.sql
ALTER TABLE images ADD COLUMN width INTEGER;
ALTER TABLE images ADD COLUMN height INTEGER;
