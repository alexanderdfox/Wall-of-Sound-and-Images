-- Contact form submissions for admin (tchoff user)
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0013_contact_messages.sql

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  sender_name TEXT,
  sender_email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  user_id TEXT,
  sender_ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(created_at DESC);
