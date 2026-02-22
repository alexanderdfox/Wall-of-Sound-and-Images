-- Comments, likes, friends, visibility
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0004_comments_likes_friends_visibility.sql

-- Comments on images
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  image_num INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (image_num) REFERENCES images(num),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_image ON comments(image_num);

-- Likes on images (one like per user per image)
CREATE TABLE IF NOT EXISTS likes (
  image_num INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (image_num, user_id),
  FOREIGN KEY (image_num) REFERENCES images(num),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Friends: requester -> target, status: pending | accepted
-- A and B are friends when (A,B,accepted) OR (B,A,accepted) exists
CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT,
  UNIQUE(requester_id, target_id),
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (target_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_target ON friends(target_id);

-- Visibility: public (all) | friends (friends of owner only)
ALTER TABLE images ADD COLUMN visibility TEXT DEFAULT 'public';
