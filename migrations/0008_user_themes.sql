-- Per-user themes (stored in DB, synced when signed in)
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0008_user_themes.sql

CREATE TABLE IF NOT EXISTS user_themes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  colors TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at TEXT,
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_user_themes_user ON user_themes(user_id);
