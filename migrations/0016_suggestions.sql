-- Public suggestion box (ideas visible to everyone)
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  idea TEXT NOT NULL,
  author TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON suggestions(created_at DESC);
