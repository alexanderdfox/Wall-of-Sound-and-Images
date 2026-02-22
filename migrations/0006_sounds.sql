-- Sounds table for uploaded audio clips (up to 30 sec)
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0006_sounds.sql
-- KV: wrangler kv:namespace create BABEL_SOUNDS (add preview id to wrangler.toml)

CREATE TABLE IF NOT EXISTS sounds (
  id TEXT PRIMARY KEY,
  num INTEGER UNIQUE,
  hash TEXT UNIQUE NOT NULL,
  user_id TEXT,
  caption TEXT,
  duration INTEGER,
  created_at TEXT,
  visibility TEXT DEFAULT 'public',
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sounds_hash ON sounds(hash);
CREATE INDEX IF NOT EXISTS idx_sounds_created ON sounds(created_at DESC);
