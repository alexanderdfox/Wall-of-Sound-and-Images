-- Add disabled flag to hide content from all users (admin can disable via reports)
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0011_disabled_content.sql

ALTER TABLE images ADD COLUMN disabled INTEGER DEFAULT 0;
ALTER TABLE sounds ADD COLUMN disabled INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN disabled INTEGER DEFAULT 0;
ALTER TABLE sound_comments ADD COLUMN disabled INTEGER DEFAULT 0;
