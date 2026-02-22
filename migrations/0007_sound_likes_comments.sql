-- Sound likes and comments (like images)
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0007_sound_likes_comments.sql

CREATE TABLE IF NOT EXISTS sound_likes (
  sound_num INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (sound_num, user_id),
  FOREIGN KEY (sound_num) REFERENCES sounds(num),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sound_likes_num ON sound_likes(sound_num);

CREATE TABLE IF NOT EXISTS sound_comments (
  id TEXT PRIMARY KEY,
  sound_num INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sound_num) REFERENCES sounds(num),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sound_comments_num ON sound_comments(sound_num);
