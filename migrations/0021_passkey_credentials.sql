-- Passkey credentials for WebAuthn
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credentials(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_cred_id ON passkey_credentials(credential_id);
