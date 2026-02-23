-- Content reports (images/sounds) for copyright, illegal content, etc.
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0009_reports.sql

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT,
  content_type TEXT NOT NULL,
  content_num INTEGER,
  content_hash TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_type, content_num);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
