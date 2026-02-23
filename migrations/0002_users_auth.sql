-- Users table for email/password auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Link images to users (nullable for backward compat)
-- Moved to 0014_add_images_user_id.sql to avoid duplicate column errors on partially-migrated DBs
