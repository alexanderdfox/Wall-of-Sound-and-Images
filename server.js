require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const exifReader = require('exif-reader');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'storage', 'tchoff.db');

// Image hash: scale to fit inside 4096×4096 (iPhone/iPad HEIC up to ~12MP)
const IMAGE_MAX = 4096;
// Babelia: 1600×1600, 24-bit RGB
const BABELIA_WIDTH = 1600;
const BABELIA_HEIGHT = 1600;
const BABELIA_PIXELS = BABELIA_WIDTH * BABELIA_HEIGHT; // 2,560,000
const ORIGIN_TTL_SEC = 2 * 60 * 60; // 2 hours

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const ORIGIN_DIR = path.join(__dirname, 'storage', 'origin');
fs.mkdirSync(ORIGIN_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    num INTEGER UNIQUE,
    image_hash TEXT,
    babel_hash TEXT,
    caption TEXT,
    username TEXT,
    created_at TEXT,
    exif BLOB
  );
  CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC);
`);
try { db.exec(`ALTER TABLE images ADD COLUMN hash TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN babelia_location TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN image_hash TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN babel_hash TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN num INTEGER`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN exif BLOB`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN origin_ip TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN width INTEGER`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN height INTEGER`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`ALTER TABLE images ADD COLUMN babelia_pixels BLOB`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_images_hash ON images(image_hash)`); } catch (e) { /* ignore */ }
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_images_babel ON images(babel_hash)`); } catch (e) { /* ignore */ }
try {
  const cols = db.prepare("PRAGMA table_info(images)").all().map((c) => c.name);
  if (cols.includes('hash')) db.prepare('UPDATE images SET image_hash = hash WHERE image_hash IS NULL').run();
  if (cols.includes('babelia_location')) db.prepare('UPDATE images SET babel_hash = babelia_location WHERE babel_hash IS NULL').run();
} catch (e) { /* ignore */ }
const hasNum = db.prepare("PRAGMA table_info(images)").all().some((c) => c.name === 'num');
if (hasNum) {
  const nullNums = db.prepare('SELECT id FROM images WHERE num IS NULL').all();
  if (nullNums.length) {
    const maxRow = db.prepare('SELECT COALESCE(MAX(num), 0) as m FROM images').get();
    let last = maxRow?.m ?? 0;
    const upd = db.prepare('UPDATE images SET num = ? WHERE id = ?');
    nullNums.forEach((r) => { last++; upd.run(last, r.id); });
  }
}

// Image hash: scale to fit inside 1600×1600, preserve aspect ratio; SHA-256 of raw RGBA
async function computeImageHash(imageBuf) {
  const { data } = await sharp(imageBuf)
    .resize(IMAGE_MAX, IMAGE_MAX, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Babelia: 1600×1600, 24-bit RGB. Returns { location, pixels }.
async function computeBabelia(imageBuf) {
  const { data } = await sharp(imageBuf)
    .resize(BABELIA_WIDTH, BABELIA_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelBuf = Buffer.from(data); // raw RGB, 3 bytes per pixel
  const location = crypto.createHash('sha256').update(pixelBuf).digest('hex');
  return { location, pixels: pixelBuf };
}

// Recreate PNG from stored Babelia pixels. Supports legacy 12-bit (640×416) and 24-bit (1280×832 or 1600×1600).
function recreateBabeliaImage(pixelsBuffer) {
  const bytes = pixelsBuffer.byteLength;
  const LEGACY_PIXELS = 640 * 416;
  const LEGACY_SIZE = LEGACY_PIXELS * 2;

  if (bytes === LEGACY_SIZE) {
    const arr = new Uint16Array(pixelsBuffer.buffer, pixelsBuffer.byteOffset, LEGACY_PIXELS);
    const rgb = Buffer.alloc(LEGACY_PIXELS * 3);
    for (let i = 0; i < LEGACY_PIXELS; i++) {
      const p = arr[i];
      rgb[i * 3] = ((p >> 8) & 0xF) * 17;
      rgb[i * 3 + 1] = ((p >> 4) & 0xF) * 17;
      rgb[i * 3 + 2] = (p & 0xF) * 17;
    }
    return sharp(rgb, { raw: { width: 640, height: 416, channels: 3 } }).png().toBuffer();
  }
  // 24-bit RGB: known formats
  const formats = [
    [1600, 1600],
    [1280, 832],
  ];
  for (const [w, h] of formats) {
    if (bytes === w * h * 3) {
      return sharp(pixelsBuffer, { raw: { width: w, height: h, channels: 3 } })
        .png()
        .toBuffer();
    }
  }
  // fallback: assume square
  const dim = Math.sqrt(bytes / 3) | 0;
  return sharp(pixelsBuffer, { raw: { width: dim, height: dim, channels: 3 } })
    .png()
    .toBuffer();
}

// Get next numeric id (babel-like: assign number by upload order)
function nextNum() {
  const row = db.prepare('SELECT COALESCE(MAX(num), 0) as m FROM images').get();
  return (row?.m ?? 0) + 1;
}

// Serialize post for JSON (exclude Buffers from babeliaPixels)
function serializePost(p) {
  if (!p) return p;
  const { exif, babeliaPixels, ...rest } = p;
  let exifOut = null;
  if (exif) {
    try {
      const str = Buffer.isBuffer(exif) ? exif.toString('utf8') : exif;
      exifOut = typeof str === 'string' && (str.startsWith('{') || str.startsWith('['))
        ? JSON.parse(str)
        : (Buffer.isBuffer(exif) ? exif.toString('base64') : exif);
    } catch {
      exifOut = Buffer.isBuffer(exif) ? exif.toString('base64') : exif;
    }
  }
  return { ...rest, exif: exifOut };
}

// Extract original EXIF from image buffer (before any processing)
async function extractExif(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    return meta.exif || null;
  } catch {
    return null;
  }
}

// Parse EXIF to displayable object. Handles raw EXIF buffer (legacy) or JSON (client flow).
function parseExifForDisplay(exifBuf) {
  if (!exifBuf) return null;
  try {
    const str = Buffer.isBuffer(exifBuf) ? exifBuf.toString('utf8') : String(exifBuf);
    if (str.startsWith('{') || str.startsWith('[')) {
      return JSON.parse(str);
    }
    if (Buffer.isBuffer(exifBuf) && exifBuf.length >= 12) {
      const parsed = exifReader(exifBuf);
      const out = {};
      const flatten = (obj, prefix = '') => {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
          if (Buffer.isBuffer(v) || (Array.isArray(v) && v.some((x) => Buffer.isBuffer(x)))) continue;
          if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            flatten(v, `${prefix}${k}.`);
          } else {
            out[prefix + k] = Array.isArray(v) ? v.join(', ') : v;
          }
        }
      };
      flatten(parsed);
      return Object.keys(out).length ? out : null;
    }
    return null;
  } catch {
    return null;
  }
}

function insertImage(id, num, imageHash, babelHash, babeliaPixels, caption, username, exif = null, originIp = null, width = null, height = null) {
  db.prepare(
    'INSERT INTO images (id, num, image_hash, babel_hash, babelia_pixels, caption, username, created_at, origin_ip, width, height, exif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, num, imageHash, babelHash, babeliaPixels, caption || '', username || 'anonymous', new Date().toISOString(), originIp || null, width, height, exif);
}

function getAllImages() {
  return db.prepare(
    'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images ORDER BY num DESC'
  ).all();
}

function getImageByBabeliaLocation(loc) {
  return db.prepare(
    'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, babelia_pixels as babeliaPixels, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images WHERE babel_hash = ?'
  ).get(loc);
}

function getImageByNum(num) {
  return db.prepare(
    'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, babelia_pixels as babeliaPixels, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images WHERE num = ?'
  ).get(num);
}

function getImageByHash(hash) {
  return db.prepare(
    'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, babelia_pixels as babeliaPixels, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images WHERE image_hash = ?'
  ).get(hash);
}

function getImageByHashOrBabelia(hash, babeliaLocation) {
  return getImageByHash(hash) || getImageByBabeliaLocation(babeliaLocation);
}

async function generateCatalogImage(num, babeliaLocation) {
  const short = babeliaLocation ? String(babeliaLocation).slice(0, 16) + '…' : '';
  const svg = `
    <svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#1a1a2e"/>
      <text x="800" y="580" font-family="system-ui,sans-serif" font-size="320" font-weight="bold" fill="#eee" text-anchor="middle">#${num}</text>
      <text x="800" y="820" font-family="monospace" font-size="24" fill="#6c7a89" text-anchor="middle">babelia: ${short}</text>
      <text x="800" y="920" font-family="system-ui,sans-serif" font-size="18" fill="#4a5568" text-anchor="middle">babelia.libraryofbabel.info</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).resize(1600, 1600).png().toBuffer();
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.ip || req.connection?.remoteAddress || null;
}

function cleanupOriginStorage() {
  try {
    const files = fs.readdirSync(ORIGIN_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(ORIGIN_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.isFile() && (now - stat.mtimeMs) / 1000 > ORIGIN_TTL_SEC) {
        fs.unlinkSync(fp);
      }
    }
  } catch (e) {
    console.error('Cleanup origin storage:', e);
  }
}

// Multer: memory only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files allowed (incl. HEIC from iPhone/iPad)'));
  },
});

app.use(express.json({ limit: '60mb' }));
app.use(express.static('public'));

function findOriginFile(babelHash) {
  try {
    const files = fs.readdirSync(ORIGIN_DIR).filter((f) => f.startsWith(babelHash) && f.length > babelHash.length);
    if (files.length) return path.join(ORIGIN_DIR, files[0]);
  } catch {}
  return null;
}

// Image routes: thumbnails use Babel lookup; full-size prefers origin (<2hr) else Babel.
app.get('/i/n/:num', async (req, res) => {
  const raw = String(req.params.num).replace(/\.png$/, '');
  const num = parseInt(raw, 10);
  if (isNaN(num) || num < 1) return res.status(400).json({ error: 'Invalid number' });
  const post = getImageByNum(num);
  if (!post) return res.status(404).json({ error: 'Not found', num });
  if (req.query.format === 'json') return res.json({ num: post.num, hash: post.hash, babeliaLocation: post.babeliaLocation });

  const babelHash = post.babeliaLocation || post.hash;
  const width = parseInt(req.query.w || req.query.size, 10);
  const wantThumb = !isNaN(width) && width > 0;

  let sourceBuf = null;
  let contentType = 'image/png';

  if (wantThumb) {
    // Thumbnails: always use Babel lookup (recreate from stored pixels or file)
    const pngPath = path.join(__dirname, 'storage', 'babel', `${babelHash}.png`);
    if (fs.existsSync(pngPath)) sourceBuf = fs.readFileSync(pngPath);
    else if (post.babeliaPixels) sourceBuf = await recreateBabeliaImage(post.babeliaPixels);
    else sourceBuf = await generateCatalogImage(post.num, post.babeliaLocation);
    const resized = await sharp(sourceBuf).resize(width, null, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    return res.send(resized);
  }

  // Full-size: prefer origin if exists (< 2hr), else Babel
  const originPath = findOriginFile(babelHash);
  if (originPath) {
    const stat = fs.statSync(originPath);
    if ((Date.now() - stat.mtimeMs) / 1000 <= ORIGIN_TTL_SEC) {
      const ext = path.extname(originPath).toLowerCase();
      if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.webp') contentType = 'image/webp';
      return res.setHeader('Content-Type', contentType).sendFile(originPath);
    }
  }

  const pngPath = path.join(__dirname, 'storage', 'babel', `${babelHash}.png`);
  if (fs.existsSync(pngPath)) return res.sendFile(pngPath);
  const png = post.babeliaPixels
    ? await recreateBabeliaImage(post.babeliaPixels)
    : await generateCatalogImage(post.num, post.babeliaLocation);
  res.setHeader('Content-Type', 'image/png');
  return res.send(png);
});

// Lookup by image hash or Babelia location (both 64-char hex)
app.get('/i/:id', async (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9]/gi, '').replace(/\.png$/, '');
  if (!id || id.length !== 64) return res.status(400).json({ error: 'Invalid hash or location (64 hex chars)' });
  const post = getImageByHash(id) || getImageByBabeliaLocation(id);
  if (!post) return res.status(404).json({ error: 'Not found', id });
  if (req.query.format === 'json') return res.json({ num: post.num, hash: post.hash, babeliaLocation: post.babeliaLocation });

  const babelHash = post.babeliaLocation || post.hash;
  const width = parseInt(req.query.w || req.query.size, 10);
  const wantThumb = !isNaN(width) && width > 0;

  if (wantThumb) {
    const pngPath = path.join(__dirname, 'storage', 'babel', `${babelHash}.png`);
    let sourceBuf = fs.existsSync(pngPath) ? fs.readFileSync(pngPath) : null;
    if (!sourceBuf && post.babeliaPixels) sourceBuf = await recreateBabeliaImage(post.babeliaPixels);
    if (!sourceBuf) sourceBuf = await generateCatalogImage(post.num, post.babeliaLocation || post.hash);
    const resized = await sharp(sourceBuf).resize(width, null, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    return res.send(resized);
  }

  const originPath = findOriginFile(babelHash);
  if (originPath) {
    const stat = fs.statSync(originPath);
    if ((Date.now() - stat.mtimeMs) / 1000 <= ORIGIN_TTL_SEC) {
      const ext = path.extname(originPath).toLowerCase();
      let ct = 'image/png';
      if (['.jpg', '.jpeg'].includes(ext)) ct = 'image/jpeg';
      else if (ext === '.gif') ct = 'image/gif';
      else if (ext === '.webp') ct = 'image/webp';
      return res.setHeader('Content-Type', ct).sendFile(originPath);
    }
  }

  const pngPath = path.join(__dirname, 'storage', 'babel', `${babelHash}.png`);
  if (fs.existsSync(pngPath)) return res.sendFile(pngPath);
  const png = post.babeliaPixels
    ? await recreateBabeliaImage(post.babeliaPixels)
    : await generateCatalogImage(post.num, post.babeliaLocation || post.hash);
  res.setHeader('Content-Type', 'image/png');
  return res.send(png);
});

// Upload: supports (1) JSON from client (Cloudflare flow), (2) FormData with image+metadata, (3) FormData legacy
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    // FormData with image file + client-computed metadata: store original for 2hr
    if (req.file && req.body?.imageHash && req.body?.babelHash && req.body?.babeliaPng) {
      const { imageHash, babelHash, babeliaPng, exif: clientExif, caption, username, width, height } = req.body;
      const existing = getImageByHashOrBabelia(imageHash, babelHash);
      if (existing) {
        const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
        const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        if (allowedExt.includes(ext)) fs.writeFileSync(path.join(ORIGIN_DIR, `${babelHash}${ext}`), req.file.buffer);
        return res.json({ success: true, hash: imageHash, babeliaLocation: babelHash, num: existing.num, post: serializePost(existing), url: `/i/${babelHash}`, urlNum: `/i/n/${existing.num}`, found: true });
      }
      const id = crypto.randomUUID();
      const num = nextNum();
      const exifBuf = (await extractExif(req.file.buffer)) ?? (clientExif ? Buffer.from(atob(clientExif), 'binary') : null);
      const pngBuf = Buffer.from(atob(babeliaPng), 'base64');
      const originIp = getClientIp(req);
      const babelDir = path.join(__dirname, 'storage', 'babel');
      fs.mkdirSync(babelDir, { recursive: true });
      fs.writeFileSync(path.join(babelDir, `${babelHash}.png`), pngBuf);
      const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
      const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
      const originExt = allowedExt.includes(ext) ? ext : '.jpg';
      fs.writeFileSync(path.join(ORIGIN_DIR, `${babelHash}${originExt}`), req.file.buffer);
      db.prepare(
        'INSERT INTO images (id, num, image_hash, babel_hash, caption, username, created_at, origin_ip, width, height, exif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, num, imageHash, babelHash, caption || '', username || 'anonymous', new Date().toISOString(), originIp, width || null, height || null, exifBuf);
      const post = { id, num, hash: imageHash, babeliaLocation: babelHash, caption: caption || '', username: username || 'anonymous', createdAt: new Date().toISOString(), originIp, width: width || null, height: height || null, exif: exifBuf };
      return res.json({ success: true, hash: imageHash, babeliaLocation: babelHash, num, post: serializePost(post), url: `/i/${babelHash}`, urlNum: `/i/n/${num}` });
    }

    // JSON body (client-side compute, Cloudflare-compatible, no original stored)
    if (req.is('application/json') && req.body?.imageHash && req.body?.babelHash && req.body?.babeliaPng) {
      const { imageHash, babelHash, babeliaPng, exif: clientExif, caption, username, width, height } = req.body;
      const existing = getImageByHashOrBabelia(imageHash, babelHash);

      if (existing) {
        return res.json({
          success: true,
          hash: imageHash,
          babeliaLocation: babelHash,
          num: existing.num,
          post: serializePost(existing),
          url: `/i/${babelHash}`,
          urlNum: `/i/n/${existing.num}`,
          found: true,
        });
      }

      const id = crypto.randomUUID();
      const num = nextNum();
      const exifBuf = clientExif ? Buffer.from(atob(clientExif), 'binary') : null;
      const pngBuf = Buffer.from(atob(babeliaPng), 'base64');
      const originIp = getClientIp(req);
      const babelDir = path.join(__dirname, 'storage', 'babel');
      fs.mkdirSync(babelDir, { recursive: true });
      fs.writeFileSync(path.join(babelDir, `${babelHash}.png`), pngBuf);

      db.prepare(
        'INSERT INTO images (id, num, image_hash, babel_hash, caption, username, created_at, origin_ip, width, height, exif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, num, imageHash, babelHash, caption || '', username || 'anonymous', new Date().toISOString(), originIp, width || null, height || null, exifBuf);

      const post = { id, num, hash: imageHash, babeliaLocation: babelHash, caption: caption || '', username: username || 'anonymous', createdAt: new Date().toISOString(), originIp, width: width || null, height: height || null, exif: exifBuf };
      return res.json({
        success: true,
        hash: imageHash,
        babeliaLocation: babelHash,
        num,
        post: serializePost(post),
        url: `/i/${babelHash}`,
        urlNum: `/i/n/${num}`,
      });
    }

    // FormData (server-side compute, legacy)
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const meta = await sharp(req.file.buffer).metadata();
    const [hash, babelia] = await Promise.all([
      computeImageHash(req.file.buffer),
      computeBabelia(req.file.buffer),
    ]);
    const { location: babeliaLocation, pixels: babeliaPixels } = babelia;
    const origWidth = meta.width || null;
    const origHeight = meta.height || null;
    const existing = getImageByHashOrBabelia(hash, babeliaLocation);

    if (existing) {
      return res.json({
        success: true,
        hash,
        babeliaLocation,
        num: existing.num,
        post: serializePost(existing),
        url: `/i/${babeliaLocation}`,
        urlNum: `/i/n/${existing.num}`,
        found: true,
      });
    }

    const exif = await extractExif(req.file.buffer);
    const id = crypto.randomUUID();
    const num = nextNum();
    insertImage(id, num, hash, babeliaLocation, babeliaPixels, req.body.caption || '', req.body.username || 'anonymous', exif, getClientIp(req), origWidth, origHeight);

    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
    const originExt = allowedExt.includes(ext) ? ext : '.jpg';
    fs.writeFileSync(path.join(ORIGIN_DIR, `${babeliaLocation}${originExt}`), req.file.buffer);

    const post = { id, num, hash, babeliaLocation, caption: req.body.caption || '', username: req.body.username || 'anonymous', createdAt: new Date().toISOString(), width: origWidth, height: origHeight, exif };
    res.json({
      success: true,
      hash,
      babeliaLocation,
      num,
      post: serializePost(post),
      url: `/i/${babeliaLocation}`,
      urlNum: `/i/n/${num}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/feed', (req, res) => {
  const rows = db.prepare(
    'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images ORDER BY babel_hash ASC'
  ).all();
  const posts = rows.map((p) => {
    const babelHash = p.babeliaLocation || p.hash;
    return serializePost({
      ...p,
      imageUrl: `/i/${babelHash}`,
      imageUrlNum: `/i/n/${p.num}`,
      imageUrlThumb: `/i/${babelHash}?w=400`,
    });
  });
  res.json(posts);
});

app.get('/api/catalog', (req, res) => {
  const rows = db.prepare('SELECT num, image_hash as hash, babel_hash as babeliaLocation FROM images ORDER BY num ASC').all();
  res.json({ items: rows, count: rows.length });
});

app.get('/api/hashes', (req, res) => {
  const rows = db.prepare('SELECT num, image_hash as imageHash, babel_hash as babelHash, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images ORDER BY num ASC').all();
  res.json({
    items: rows.map((r) => ({
      num: r.num,
      imageHash: r.imageHash,
      babelHash: r.babelHash,
      hash: r.babelHash,
      createdAt: r.createdAt,
      originIp: r.originIp,
      width: r.width,
      height: r.height,
      exif: r.exif ? parseExifForDisplay(r.exif) : null,
    })),
    count: rows.length,
  });
});

app.get('/api/post/n/:num', (req, res) => {
  const num = parseInt(req.params.num, 10);
  const post = getImageByNum(num);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const babelHash = post.babeliaLocation || post.hash;
  res.json(serializePost({ ...post, imageUrl: `/i/${babelHash}`, imageUrlNum: `/i/n/${post.num}`, imageUrlThumb: `/i/${babelHash}?w=400` }));
});

app.get('/api/post/:id', (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9]/gi, '');
  if (!id || id.length !== 64) return res.status(400).json({ error: 'Invalid hash or location (64 hex chars)' });
  const post = getImageByHash(id) || getImageByBabeliaLocation(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const babelHash = post.babeliaLocation || post.hash;
  res.json(serializePost({ ...post, imageUrl: `/i/${babelHash}`, imageUrlNum: `/i/n/${post.num}`, imageUrlThumb: `/i/${babelHash}?w=400` }));
});

app.get('/api/exists/:id', (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9]/gi, '');
  const post = getImageByHash(id) || getImageByBabeliaLocation(id);
  res.json({
    hash: id,
    num: post?.num,
    exists: !!post,
    post: serializePost(post) || null,
  });
});

cleanupOriginStorage();
setInterval(cleanupOriginStorage, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Tchoff running at http://localhost:${PORT}`);
});
