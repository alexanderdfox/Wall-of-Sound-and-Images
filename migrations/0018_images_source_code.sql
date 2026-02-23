-- Add source_code column to images (up to 4096 chars, optional)
ALTER TABLE images ADD COLUMN source_code TEXT;
