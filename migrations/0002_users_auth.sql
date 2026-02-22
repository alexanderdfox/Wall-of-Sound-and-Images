-- Users table for email/password auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Link images to users (nullable for backward compat)
-- Ignore "duplicate column" if already exists
ALTER TABLE images ADD COLUMN user_id TEXT;
