-- Account disable: user can request disable, takes effect after 30 days. Data retained.
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0012_user_disable_account.sql

ALTER TABLE users ADD COLUMN disable_requested_at TEXT;
ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0;
