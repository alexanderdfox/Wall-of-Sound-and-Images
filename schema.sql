CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  num INTEGER UNIQUE,
  image_hash TEXT,
  babel_hash TEXT,
  babelia_png BLOB,
  caption TEXT,
  username TEXT,
  created_at TEXT,
  origin_ip TEXT,
  width INTEGER,
  height INTEGER,
  exif BLOB
);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_hash ON images(image_hash);
CREATE INDEX IF NOT EXISTS idx_images_babel ON images(babel_hash);
