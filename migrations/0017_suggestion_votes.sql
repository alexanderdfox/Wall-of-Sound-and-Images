-- Upvotes for suggestions (one per user per suggestion)
CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (suggestion_id, user_id),
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_id ON suggestion_votes(suggestion_id);
