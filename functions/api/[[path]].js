// Cloudflare Pages Function: handles all /api/* routes

import { hashPassword, verifyPassword, signJwt, verifyJwt, getBearerToken } from '../_auth.js';

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const path = (context.params.path || []).join('/');
  const method = request.method;

  const db = env.DB;
  if (!db) return json({ error: 'Database not configured' }, 500);

  try {
    // POST /api/auth/signup
    if (path === 'auth/signup' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = (body?.email || '').toString().trim().toLowerCase();
      const password = body?.password;
      let username = (body?.username || '').toString().trim().replace(/\s+/g, '_').slice(0, 30) || (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
      if (username.length < 3) username = (username + 'xx').slice(0, 3) || 'user';
      if (!email || !password || password.length < 6) {
        return json({ error: 'Email and password (min 6 chars) required' }, 400);
      }
      if (!/^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/.test(email)) {
        return json({ error: 'Invalid email format' }, 400);
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return json({ error: 'Username must be 3–30 chars, letters, numbers, underscores only' }, 400);
      }
      const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) return json({ error: 'Email already registered' }, 400);
      try {
        const existingUser = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existingUser) return json({ error: 'Username already taken' }, 400);
      } catch (_) { /* username column may not exist */ }
      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      try {
        await db.prepare('INSERT INTO users (id, email, password_hash, username, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, email, passwordHash, username, new Date().toISOString()).run();
      } catch (e) {
        if (/no column named username/i.test(e?.message)) {
          await db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
            .bind(id, email, passwordHash, new Date().toISOString()).run();
          username = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
        } else throw e;
      }
      const jwt = env.JWT_SECRET ? await signJwt({ sub: id, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }, String(env.JWT_SECRET || '').trim()) : null;
      return json({ success: true, user: { id, username }, token: jwt });
    }

    // POST /api/auth/login
    if (path === 'auth/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = (body?.email || '').toString().trim().toLowerCase();
      const password = body?.password;
      if (!email || !password) return json({ error: 'Email and password required' }, 400);
      const user = await db.prepare('SELECT id, email, password_hash, username FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: 'Invalid email or password' }, 401);
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return json({ error: 'Invalid email or password' }, 401);
      const displayName = user.username || user.email?.split('@')[0] || 'user';
      const jwt = env.JWT_SECRET ? await signJwt({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }, String(env.JWT_SECRET || '').trim()) : null;
      return json({ success: true, user: { id: user.id, username: displayName }, token: jwt });
    }

    // GET /api/auth/me
    if (path === 'auth/me' && method === 'GET') {
      const token = getBearerToken(request);
      const secret = env.JWT_SECRET;
      if (!token || !secret) return json({ user: null });
      const payload = await verifyJwt(token, secret);
      if (!payload?.sub) return json({ user: null });
      const user = await db.prepare('SELECT id, email, username FROM users WHERE id = ?').bind(payload.sub).first();
      const displayName = user?.username || user?.email?.split('@')[0] || 'user';
      return json({ user: user ? { id: user.id, username: displayName } : null });
    }

    // PATCH /api/auth/me (update username)
    if (path === 'auth/me' && method === 'PATCH') {
      const token = getBearerToken(request);
      const secret = env.JWT_SECRET;
      if (!token || !secret) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(secret || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      const body = await request.json().catch(() => ({}));
      let username = (body?.username || '').toString().trim().replace(/\s+/g, '_').slice(0, 30);
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return json({ error: 'Username must be 3–30 chars, letters, numbers, underscores only' }, 400);
      }
      const existing = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, payload.sub).first();
      if (existing) return json({ error: 'Username already taken' }, 400);
      try {
        await db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, payload.sub).run();
      } catch (e) {
        if (/no column named username/i.test(e?.message)) return json({ error: 'Username not supported yet' }, 500);
        throw e;
      }
      return json({ success: true, user: { id: payload.sub, username } });
    }

    // GET /api/feed
    if (path === 'feed' && method === 'GET') {
      const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
      const per = Math.min(24, Math.max(1, parseInt(url.searchParams.get('per'), 10) || 16));
      const offset = (page - 1) * per;
      const token = getBearerToken(request);
      let viewerId = null;
      if (token && env.JWT_SECRET) {
        const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
        if (payload?.sub) viewerId = payload.sub;
      }
      const feedWhere = buildVisibilityWhere(viewerId);
      const feedParams = feedWhere.params.concat(per, offset);
      let countRow, rows;
      try {
        countRow = await db.prepare(`SELECT COUNT(*) as c FROM (SELECT 1 FROM images ${feedWhere.sql} ORDER BY num DESC LIMIT 100)`).bind(...feedWhere.params).first();
        rows = await db.prepare(
          `SELECT * FROM (SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif, user_id as userId, visibility FROM images ${feedWhere.sql} ORDER BY num DESC LIMIT 100) LIMIT ? OFFSET ?`
        ).bind(...feedWhere.params, per, offset).all();
      } catch (e) {
        if (/no column named user_id|no column named visibility|no such table: friends|subquery|syntax error/i.test(e?.message)) {
          countRow = await db.prepare('SELECT COUNT(*) as c FROM (SELECT 1 FROM images ORDER BY num DESC LIMIT 100)').first();
          rows = await db.prepare(
            'SELECT * FROM (SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif, user_id as userId FROM images ORDER BY num DESC LIMIT 100) LIMIT ? OFFSET ?'
          ).bind(per, offset).all();
        } else throw e;
      }
      const total = countRow?.c ?? 0;
      const posts = await enrichPostsWithLikesComments(db, rows.results || [], viewerId);
      return json({ items: posts, total, page, per });
    }

    // GET /api/user/:id/sounds
    if (path.startsWith('user/') && path.endsWith('/sounds') && method === 'GET') {
      const identifier = path.slice('user/'.length, -7).replace(/[^a-zA-Z0-9-_]/g, '');
      if (!identifier) return json({ error: 'User required' }, 400);
      const user = await resolveUser(db, identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      const id = user.id;
      const token = getBearerToken(request);
      let viewerId = null;
      if (token && env.JWT_SECRET) {
        const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
        if (payload?.sub) viewerId = payload.sub;
      }
      const canViewOwn = viewerId === id;
      const where = buildUserSoundsWhere(id, viewerId, canViewOwn);
      const sounds = await db.prepare(
        `SELECT num, hash, caption, duration, created_at as createdAt FROM sounds ${where.sql} ORDER BY num DESC LIMIT 24`
      ).bind(...where.params).all().catch(() => ({ results: [] }));
      return json({ items: sounds.results || [], user: { id: user.id, username: user.username || 'user' } });
    }

    // GET /api/user/:id/images (must be before /api/user/:id)
    if (path.startsWith('user/') && path.endsWith('/images') && method === 'GET') {
      const identifier = path.slice('user/'.length, -7).replace(/[^a-zA-Z0-9-_]/g, '');
      if (!identifier) return json({ error: 'User required' }, 400);
      const user = await resolveUser(db, identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      const id = user.id;
      const token = getBearerToken(request);
      let viewerId = null;
      if (token && env.JWT_SECRET) {
        const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
        if (payload?.sub) viewerId = payload.sub;
      }
      const canViewOwn = viewerId === id;
      const userImagesWhere = buildUserImagesWhere(id, viewerId, canViewOwn);
      const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
      const per = Math.min(24, Math.max(1, parseInt(url.searchParams.get('per'), 10) || 16));
      const offset = (page - 1) * per;
      let countRow, rows;
      try {
        countRow = await db.prepare(`SELECT COUNT(*) as c FROM images ${userImagesWhere.sql}`).bind(...userImagesWhere.params).first();
        rows = await db.prepare(
          `SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif, user_id as userId, visibility FROM images ${userImagesWhere.sql} ORDER BY num DESC LIMIT ? OFFSET ?`
        ).bind(...userImagesWhere.params, per, offset).all();
      } catch (e) {
        if (/no column named visibility/i.test(e?.message)) {
          countRow = await db.prepare('SELECT COUNT(*) as c FROM images WHERE user_id = ?').bind(id).first();
          rows = await db.prepare(
            'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif, user_id as userId FROM images WHERE user_id = ? ORDER BY num DESC LIMIT ? OFFSET ?'
          ).bind(id, per, offset).all();
        } else throw e;
      }
      const total = countRow?.c ?? 0;
      const items = await enrichPostsWithLikesComments(db, rows.results || [], viewerId);
      const disp = user.username || 'user';
      return json({ items, total, page, per, user: { id: user.id, username: disp } });
    }

    // GET /api/user/by-email?email=xxx (before user/:id)
    if (path.startsWith('user/by-email') && method === 'GET') {
      const email = url.searchParams.get('email')?.trim()?.toLowerCase();
      if (!email) return json({ error: 'Email required' }, 400);
      const user = await db.prepare('SELECT id, username FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: 'User not found' }, 404);
      const disp = user.username || 'user';
      return json({ id: user.id, username: disp });
    }

    // GET /api/user/by-username?username=xxx
    if (path.startsWith('user/by-username') && method === 'GET') {
      const username = url.searchParams.get('username')?.trim()?.replace(/^@/, '');
      if (!username) return json({ error: 'Username required' }, 400);
      const user = await db.prepare('SELECT id, username FROM users WHERE username = ?').bind(username).first();
      if (!user) return json({ error: 'User not found' }, 404);
      return json({ id: user.id, username: user.username });
    }

    // GET /api/user/:id (supports id or username)
    if (path.startsWith('user/') && !path.includes('/images') && !path.includes('by-email') && !path.includes('by-username') && !path.includes('/followers') && !path.includes('/following') && method === 'GET') {
      const identifier = path.slice('user/'.length).replace(/[^a-zA-Z0-9-_]/g, '');
      if (!identifier) return json({ error: 'User required' }, 400);
      const user = await resolveUser(db, identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      const id = user.id;
      const countRow = await db.prepare('SELECT COUNT(*) as c FROM images WHERE user_id = ?').bind(id).first();
      let followerCount = 0, followingCount = 0, following = false;
      try {
        const fc = await db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').bind(id).first();
        const fg = await db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').bind(id).first();
        followerCount = fc?.c ?? 0;
        followingCount = fg?.c ?? 0;
      } catch (_) {}
      const token = getBearerToken(request);
      if (token && env.JWT_SECRET) {
        const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
        if (payload?.sub && payload.sub !== id) {
          const fl = await db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').bind(payload.sub, id).first().catch(() => null);
          following = !!fl;
        }
      }
      const disp = user.username || 'user';
      return json({ id: user.id, username: disp, imageCount: countRow?.c ?? 0, followerCount, followingCount, following });
    }

    // POST /api/follow/:userId - follow user (supports id or username)
    if (path.match(/^follow\/[a-zA-Z0-9_-]+$/) && method === 'POST') {
      const identifier = path.split('/')[1];
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      const target = await resolveUser(db, identifier);
      if (!target) return json({ error: 'User not found' }, 404);
      const targetId = target.id;
      if (payload.sub === targetId) return json({ error: 'Cannot follow yourself' }, 400);
      try {
        await db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)')
          .bind(payload.sub, targetId, new Date().toISOString()).run();
      } catch (e) {
        if (/no such table: follows/i.test(e?.message)) return json({ error: 'Follows not available' }, 500);
        throw e;
      }
      return json({ success: true });
    }

    // DELETE /api/follow/:userId - unfollow
    if (path.match(/^follow\/[a-zA-Z0-9_-]+$/) && method === 'DELETE') {
      const identifier = path.split('/')[1];
      const target = await resolveUser(db, identifier);
      const targetId = target ? target.id : identifier;
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      try {
        await db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').bind(payload.sub, targetId).run();
      } catch (_) {}
      return json({ success: true });
    }

    // GET /api/user/:id/followers, GET /api/user/:id/following
    if (path.match(/^user\/[a-zA-Z0-9_-]+\/(followers|following)$/) && method === 'GET') {
      const parts = path.split('/');
      const identifier = parts[1];
      const type = parts[2];
      const user = await resolveUser(db, identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      const id = user.id;
      try {
        const rows = type === 'followers'
          ? await db.prepare('SELECT f.follower_id as userId, u.username FROM follows f LEFT JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? ORDER BY f.created_at DESC')
            .bind(id).all()
          : await db.prepare('SELECT f.following_id as userId, u.username FROM follows f LEFT JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? ORDER BY f.created_at DESC')
            .bind(id).all();
        const list = (rows.results || []).map((r) => ({ userId: r.userId, username: r.username || 'user' }));
        return json({ [type]: list });
      } catch (e) {
        if (/no such table: follows/i.test(e?.message)) return json({ [type]: [] });
        throw e;
      }
    }

    // POST /api/upload-sound
    if (path === 'upload-sound' && method === 'POST') {
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required to upload' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required to upload' }, 401);
      const user = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(payload.sub).first();
      if (!user) return json({ error: 'Sign in required to upload' }, 401);

      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) return json({ error: 'Multipart form required' }, 400);
      const form = await request.formData();
      const audioFile = form.get('audio');
      const caption = (form.get('caption') || '').toString().trim().slice(0, 500);
      const visibility = (form.get('visibility') || 'public').toString() === 'friends' ? 'friends' : 'public';

      if (!audioFile || typeof audioFile.arrayBuffer !== 'function') return json({ error: 'Audio file required' }, 400);
      const arrayBuffer = await audioFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.length > 4 * 1024 * 1024) return json({ error: 'Audio file too large (max 4MB)' }, 400);

      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      const existing = await db.prepare('SELECT num, hash FROM sounds WHERE hash = ?').bind(hash).first().catch(() => null);
      if (existing && env.BABEL_SOUNDS) {
        const kvAudio = await env.BABEL_SOUNDS.get(`sound:${hash}`, { type: 'arrayBuffer' });
        if (kvAudio) {
          return json({
            success: true,
            hash,
            num: existing.num,
            found: true,
            url: `/s/${hash}`,
            urlNum: `/s/n/${existing.num}`,
          });
        }
      }

      const duration = Math.min(30, Math.max(0, parseInt(form.get('duration') || '0', 10)));

      const id = crypto.randomUUID();
      const maxRow = await db.prepare('SELECT COALESCE(MAX(num), 0) as m FROM sounds').first().catch(() => ({ m: 0 }));
      const num = (maxRow?.m ?? 0) + 1;
      const createdAt = new Date().toISOString();

      try {
        await db.prepare(
          'INSERT INTO sounds (id, num, hash, user_id, caption, duration, created_at, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, num, hash, user.id, caption || '', duration || 0, createdAt, visibility).run();
      } catch (e) {
        if (/no such table: sounds/i.test(e?.message)) return json({ error: 'Sounds not configured' }, 500);
        throw e;
      }

      if (env.BABEL_SOUNDS) {
        try {
          await env.BABEL_SOUNDS.put(`sound:${hash}`, bytes, { metadata: { contentType: audioFile.type || 'audio/wav' } });
        } catch (e) { console.error('KV put failed:', e); }
      }

      return json({
        success: true,
        hash,
        num,
        url: `/s/${hash}`,
        urlNum: `/s/n/${num}`,
      });
    }

    // GET /api/exists-sound/:hash
    if (path.startsWith('exists-sound/') && method === 'GET') {
      const hash = path.slice('exists-sound/'.length).replace(/[^a-f0-9]/gi, '');
      if (!hash || hash.length !== 64) return json({ error: 'Invalid hash' }, 400);
      const sound = await db.prepare(
        'SELECT num, hash, user_id, caption, duration, created_at FROM sounds WHERE hash = ?'
      ).bind(hash).first().catch(() => null);
      return json({
        hash: hash,
        num: sound?.num ?? null,
        exists: !!sound,
        sound: sound ? { num: sound.num, hash: sound.hash, caption: sound.caption, duration: sound.duration } : null,
      });
    }

    // GET /api/catalog
    if (path === 'catalog' && method === 'GET') {
      const rows = await db.prepare(
        'SELECT num, image_hash as hash, babel_hash as babeliaLocation FROM images ORDER BY num ASC'
      ).all();
      return json({ items: rows.results || [], count: (rows.results || []).length });
    }

    // GET /api/hashes
    if (path === 'hashes' && method === 'GET') {
      const rows = await db.prepare(
        'SELECT num, image_hash as imageHash, babel_hash as babelHash, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images ORDER BY num ASC'
      ).all();
      const items = (rows.results || []).map((r) => ({
        num: r.num,
        imageHash: r.imageHash,
        babelHash: r.babelHash,
        hash: r.babelHash,
        createdAt: r.createdAt,
        originIp: r.originIp,
        width: r.width,
        height: r.height,
        exif: parseExifForApi(r.exif),
      }));
      return json({ items, count: items.length });
    }

    // POST /api/upload
    if (path === 'upload' && method === 'POST') {
      let imageHash, babelHash, babeliaPng, exif, caption, username, width, height, visibility = 'public';
      let imageFile = null;

      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        imageFile = form.get('image');
        if (imageFile && typeof imageFile.arrayBuffer === 'function') imageFile = await imageFile.arrayBuffer();
        else imageFile = null;
        imageHash = form.get('imageHash')?.toString?.();
        babelHash = form.get('babelHash')?.toString?.();
        babeliaPng = form.get('babeliaPng')?.toString?.();
        exif = form.get('exif')?.toString?.();
        caption = form.get('caption')?.toString?.();
        username = form.get('username')?.toString?.();
        width = form.get('width')?.toString?.() || null;
        height = form.get('height')?.toString?.() || null;
        visibility = form.get('visibility')?.toString?.() || 'public';
      } else {
        const body = await request.json();
        const b = body || {};
        imageHash = b.imageHash;
        babelHash = b.babelHash;
        babeliaPng = b.babeliaPng;
        exif = b.exif;
        caption = b.caption;
        username = b.username;
        width = b.width;
        height = b.height;
        visibility = b.visibility || 'public';
      }

      if (!imageHash || !babelHash) {
        return json({ error: 'Missing imageHash or babelHash' }, 400);
      }

      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) {
        return json({ error: 'Sign in required to upload' }, 401);
      }
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) {
        return json({ error: 'Sign in required to upload' }, 401);
      }
      const user = await db.prepare('SELECT id, username, email FROM users WHERE id = ?').bind(payload.sub).first();
      if (!user) {
        return json({ error: 'Sign in required to upload' }, 401);
      }
      const userId = user.id;
      const displayName = user.username || user.email?.split('@')[0] || 'user';

      const existingByHash = await db.prepare('SELECT * FROM images WHERE image_hash = ?').bind(imageHash).first();
      const existingByBabel = await db.prepare('SELECT * FROM images WHERE babel_hash = ?').bind(babelHash).first();
      const existing = existingByHash || existingByBabel;

      if (existing) {
        return json({
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
      const maxRow = await db.prepare('SELECT COALESCE(MAX(num), 0) as m FROM images').first();
      const num = (maxRow?.m ?? 0) + 1;
      const createdAt = new Date().toISOString();
      const exifBlob = exif ? atob(exif) : null;
      const originIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

      const parseDim = (v) => {
        if (v == null || v === '') return null;
        const n = typeof v === 'number' ? v : parseInt(String(v), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const widthInt = parseDim(width);
      const heightInt = parseDim(height);

      const insertUsername = displayName;
      const vis = (visibility === 'friends') ? 'friends' : 'public';
      try {
        await db.prepare(
          'INSERT INTO images (id, num, image_hash, babel_hash, caption, username, created_at, origin_ip, width, height, exif, user_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, num, imageHash, babelHash, caption || '', insertUsername, createdAt, originIp, widthInt, heightInt, exifBlob, userId, vis).run();
      } catch (e) {
        if (/no column named user_id/i.test(e?.message)) {
          await db.prepare(
            'INSERT INTO images (id, num, image_hash, babel_hash, caption, username, created_at, origin_ip, width, height, exif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(id, num, imageHash, babelHash, caption || '', insertUsername, createdAt, originIp, widthInt, heightInt, exifBlob).run();
        } else if (/no column named visibility/i.test(e?.message)) {
          await db.prepare(
            'INSERT INTO images (id, num, image_hash, babel_hash, caption, username, created_at, origin_ip, width, height, exif, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(id, num, imageHash, babelHash, caption || '', insertUsername, createdAt, originIp, widthInt, heightInt, exifBlob, userId).run();
        } else throw e;
      }

      if (env.BABEL_IMAGES && babeliaPng && babeliaPng.length > 100) {
        try {
          const binary = Uint8Array.from(atob(babeliaPng), (c) => c.charCodeAt(0));
          await env.BABEL_IMAGES.put(`babel:${babelHash}`, binary, { metadata: { contentType: 'image/png' } });
        } catch (e) {
          console.error('KV put failed:', e);
        }
      }

      const post = {
        id,
        num,
        hash: imageHash,
        babeliaLocation: babelHash,
        caption: caption || '',
        username: insertUsername,
        createdAt,
        width: widthInt,
        height: heightInt,
        exif: exifBlob,
      };
      return json({
        success: true,
        hash: imageHash,
        babeliaLocation: babelHash,
        num,
        post: serializePost(post),
        url: `/i/${babelHash}`,
        urlNum: `/i/n/${num}`,
      });
    }

    // GET /api/cron/cleanup - delete R2 origin objects older than 2 hours (call via cron; protect with CRON_SECRET)
    if (path === 'cron/cleanup' && method === 'GET') {
      const secret = url.searchParams.get('secret');
      if (env.CRON_SECRET && secret !== env.CRON_SECRET) return json({ error: 'Unauthorized' }, 401);
      if (!env.BUCKET) return json({ ok: true, deleted: 0, message: 'No bucket configured' });
      const ORIGIN_TTL_MS = 2 * 60 * 60 * 1000;
      const list = await env.BUCKET.list({ prefix: 'origin/' });
      const now = Date.now();
      let deleted = 0;
      for (const o of list.objects || []) {
        const uploaded = o.uploaded ? new Date(o.uploaded).getTime() : 0;
        if (uploaded && now - uploaded > ORIGIN_TTL_MS) {
          await env.BUCKET.delete(o.key);
          deleted++;
        }
      }
      return json({ ok: true, deleted });
    }

    // GET /api/post/n/:num (must not match post/n/:num/comments or post/n/:num/like)
    if (path.match(/^post\/n\/\d+$/) && method === 'GET') {
      const num = parseInt(path.split('/')[2], 10);
      const token = getBearerToken(request);
      let viewerId = null;
      if (token && env.JWT_SECRET) {
        const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
        if (payload?.sub) viewerId = payload.sub;
      }
      const post = await db.prepare(
        'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif, user_id as userId, visibility FROM images WHERE num = ?'
      ).bind(num).first();
      if (!post) return json({ error: 'Post not found' }, 404);
      try {
        if (!(await canViewImage(db, post, viewerId))) return json({ error: 'Post not found' }, 404);
      } catch (_) {}
      const enriched = await enrichPostsWithLikesComments(db, [post], viewerId);
      const babelHash = post.babeliaLocation || post.hash;
      return json(serializePost({
        ...enriched[0],
        imageUrl: `/i/${babelHash}`,
        imageUrlNum: `/i/n/${post.num}`,
        imageUrlThumb: `/i/${babelHash}?w=400`,
      }));
    }

    // GET /api/post/:id (64-char hash; must not match post/n/)
    if (path.startsWith('post/') && !path.startsWith('post/n/') && method === 'GET') {
      const id = path.slice('post/'.length).replace(/[^a-f0-9]/gi, '');
      if (!id || id.length !== 64) return json({ error: 'Invalid hash (64 hex chars)' }, 400);
      const post = await db.prepare(
        'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images WHERE image_hash = ? OR babel_hash = ?'
      ).bind(id, id).first();
      if (!post) return json({ error: 'Post not found' }, 404);
      const babelHash = post.babeliaLocation || post.hash;
      return json(serializePost({
        ...post,
        imageUrl: `/i/${babelHash}`,
        imageUrlNum: `/i/n/${post.num}`,
        imageUrlThumb: `/i/${babelHash}?w=400`,
      }));
    }

    // GET /api/post/n/:num/comments
    if (path.match(/^post\/n\/\d+\/comments$/) && method === 'GET') {
      const num = parseInt(path.split('/')[2], 10);
      const token = getBearerToken(request);
      let viewerId = null;
      if (token && env.JWT_SECRET) {
        const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
        if (payload?.sub) viewerId = payload.sub;
      }
      const img = await db.prepare('SELECT num, user_id, visibility FROM images WHERE num = ?').bind(num).first();
      if (!img) return json({ error: 'Post not found' }, 404);
      if (!(await canViewImage(db, img, viewerId))) return json({ error: 'Post not found' }, 404);
      const rows = await db.prepare(
        `SELECT c.id, c.text, c.created_at as createdAt, c.user_id as userId, u.username FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.image_num = ? ORDER BY c.created_at ASC`
      ).bind(num).all();
      const comments = (rows.results || []).map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt, userId: r.userId, username: r.username || 'user' }));
      return json({ comments });
    }

    // POST /api/post/n/:num/comments
    if (path.match(/^post\/n\/\d+\/comments$/) && method === 'POST') {
      const num = parseInt(path.split('/')[2], 10);
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in to comment' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in to comment' }, 401);
      const body = await request.json().catch(() => ({}));
      const text = (body?.text || '').toString().trim().slice(0, 500);
      if (!text) return json({ error: 'Comment text required' }, 400);
      const img = await db.prepare('SELECT num, user_id, visibility FROM images WHERE num = ?').bind(num).first();
      if (!img) return json({ error: 'Post not found' }, 404);
      if (!(await canViewImage(db, img, payload.sub))) return json({ error: 'Post not found' }, 404);
      const id = crypto.randomUUID();
      await db.prepare('INSERT INTO comments (id, image_num, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, num, payload.sub, text, new Date().toISOString()).run();
      const user = await db.prepare('SELECT username FROM users WHERE id = ?').bind(payload.sub).first();
      return json({ id, text, createdAt: new Date().toISOString(), userId: payload.sub, username: user?.username || 'user' });
    }

    // POST /api/post/n/:num/like - toggle like
    if (path.match(/^post\/n\/\d+\/like$/) && method === 'POST') {
      const num = parseInt(path.split('/')[2], 10);
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in to like' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in to like' }, 401);
      const img = await db.prepare('SELECT num, user_id, visibility FROM images WHERE num = ?').bind(num).first();
      if (!img) return json({ error: 'Post not found' }, 404);
      if (!(await canViewImage(db, img, payload.sub))) return json({ error: 'Post not found' }, 404);
      const existing = await db.prepare('SELECT 1 FROM likes WHERE image_num = ? AND user_id = ?').bind(num, payload.sub).first();
      if (existing) {
        await db.prepare('DELETE FROM likes WHERE image_num = ? AND user_id = ?').bind(num, payload.sub).run();
        return json({ liked: false });
      } else {
        await db.prepare('INSERT INTO likes (image_num, user_id, created_at) VALUES (?, ?, ?)')
          .bind(num, payload.sub, new Date().toISOString()).run();
        return json({ liked: true });
      }
    }

    // GET /api/friends
    if (path === 'friends' && method === 'GET') {
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      const accepted = await db.prepare(
        `SELECT f.id, f.requester_id, f.target_id, f.status, f.created_at,
         u1.username as requester_username, u2.username as target_username
         FROM friends f
         LEFT JOIN users u1 ON u1.id = f.requester_id
         LEFT JOIN users u2 ON u2.id = f.target_id
         WHERE (f.requester_id = ? OR f.target_id = ?) AND f.status = 'accepted'`
      ).bind(payload.sub, payload.sub).all();
      const pendingIn = await db.prepare(
        `SELECT f.id, f.requester_id, f.target_id, f.status, f.created_at, u.username as requester_username
         FROM friends f LEFT JOIN users u ON u.id = f.requester_id
         WHERE f.target_id = ? AND f.status = 'pending'`
      ).bind(payload.sub).all();
      const friends = (accepted.results || []).map((r) => {
        const otherId = r.requester_id === payload.sub ? r.target_id : r.requester_id;
        const otherName = r.requester_id === payload.sub ? r.target_username : r.requester_username;
        return { id: r.id, userId: otherId, username: otherName || 'user', status: 'accepted' };
      });
      const pending = (pendingIn.results || []).map((r) => ({
        id: r.id, fromUserId: r.requester_id, fromUsername: r.requester_username || 'user', status: 'pending',
      }));
      return json({ friends, pending });
    }

    // POST /api/friends - add friend by username
    if (path === 'friends' && method === 'POST') {
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      const body = await request.json().catch(() => ({}));
      const username = (body?.username || '').toString().trim().replace(/^@/, '');
      if (!username) return json({ error: 'Username required' }, 400);
      const target = await db.prepare('SELECT id, username FROM users WHERE username = ?').bind(username).first();
      if (!target || target.id === payload.sub) return json({ error: 'User not found' }, 404);
      const existing = await db.prepare('SELECT id, status FROM friends WHERE requester_id = ? AND target_id = ?')
        .bind(payload.sub, target.id).first();
      if (existing) return json({ error: existing.status === 'pending' ? 'Request already sent' : 'Already friends' }, 400);
      const existingRev = await db.prepare('SELECT id, status FROM friends WHERE requester_id = ? AND target_id = ?')
        .bind(target.id, payload.sub).first();
      if (existingRev?.status === 'pending') {
        await db.prepare('UPDATE friends SET status = ? WHERE id = ?').bind('accepted', existingRev.id).run();
        const newId = crypto.randomUUID();
        await db.prepare('INSERT INTO friends (id, requester_id, target_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(newId, payload.sub, target.id, 'accepted', new Date().toISOString()).run();
        return json({ success: true, status: 'accepted' });
      }
      const id = crypto.randomUUID();
      await db.prepare('INSERT INTO friends (id, requester_id, target_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, payload.sub, target.id, 'pending', new Date().toISOString()).run();
      return json({ success: true, status: 'pending' });
    }

    // PATCH /api/friends/request/:fromUserId - accept request
    if (path.match(/^friends\/request\/[a-zA-Z0-9-]+$/) && method === 'PATCH') {
      const fromId = path.split('/')[2];
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      const row = await db.prepare('SELECT id FROM friends WHERE requester_id = ? AND target_id = ? AND status = ?')
        .bind(fromId, payload.sub, 'pending').first();
      if (!row) return json({ error: 'Request not found' }, 404);
      await db.prepare('UPDATE friends SET status = ? WHERE id = ?').bind('accepted', row.id).run();
      const id = crypto.randomUUID();
      await db.prepare('INSERT INTO friends (id, requester_id, target_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, payload.sub, fromId, 'accepted', new Date().toISOString()).run();
      return json({ success: true });
    }

    // DELETE /api/friends/:userId - remove friend or decline request
    if (path.match(/^friends\/[a-zA-Z0-9-]+$/) && method === 'DELETE') {
      const targetId = path.split('/')[1];
      const token = getBearerToken(request);
      if (!token || !env.JWT_SECRET) return json({ error: 'Sign in required' }, 401);
      const payload = await verifyJwt(token, String(env.JWT_SECRET || '').trim());
      if (!payload?.sub) return json({ error: 'Sign in required' }, 401);
      await db.prepare('DELETE FROM friends WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)')
        .bind(payload.sub, targetId, targetId, payload.sub).run();
      return json({ success: true });
    }

    // GET /api/exists/:id
    if (path.startsWith('exists/') && method === 'GET') {
      const id = path.slice('exists/'.length).replace(/[^a-f0-9]/gi, '');
      if (!id || id.length !== 64) return json({ error: 'Invalid hash' }, 400);
      const post = await db.prepare(
        'SELECT id, num, image_hash as hash, babel_hash as babeliaLocation, caption, username, created_at as createdAt, origin_ip as originIp, width, height, exif FROM images WHERE image_hash = ? OR babel_hash = ?'
      ).bind(id, id).first();
      return json({
        hash: id,
        num: post?.num ?? null,
        exists: !!post,
        post: post ? serializePost(post) : null,
      });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

async function resolveUser(db, identifier) {
  if (!identifier) return null;
  let user = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(identifier).first();
  if (!user) {
    user = await db.prepare('SELECT id, username FROM users WHERE username = ?').bind(identifier).first();
  }
  return user;
}

function parseExifForApi(exif) {
  if (!exif) return null;
  try {
    let str = exif;
    if (typeof exif === 'object' && exif.byteLength != null) {
      str = new TextDecoder().decode(exif);
    } else if (ArrayBuffer.isView(exif)) {
      str = new TextDecoder().decode(exif);
    }
    return typeof str === 'string' ? JSON.parse(str) : exif;
  } catch {
    return null;
  }
}

function buildVisibilityWhere(viewerId) {
  if (!viewerId) {
    return { sql: "WHERE (visibility = 'public' OR visibility IS NULL OR visibility = '')", params: [] };
  }
  return {
    sql: `WHERE (visibility = 'public' OR visibility IS NULL OR visibility = '' OR user_id = ? OR (visibility = 'friends' AND (user_id IN (SELECT target_id FROM friends WHERE requester_id = ? AND status = 'accepted') OR user_id IN (SELECT requester_id FROM friends WHERE target_id = ? AND status = 'accepted'))))`,
    params: [viewerId, viewerId, viewerId],
  };
}

function buildUserImagesWhere(ownerId, viewerId, canViewOwn) {
  if (canViewOwn) {
    return { sql: 'WHERE user_id = ?', params: [ownerId] };
  }
  try {
    if (!viewerId) {
      return { sql: "WHERE user_id = ? AND (visibility = 'public' OR visibility IS NULL)", params: [ownerId] };
    }
    return {
      sql: `WHERE user_id = ? AND (visibility = 'public' OR visibility IS NULL OR (visibility = 'friends' AND (user_id IN (SELECT target_id FROM friends WHERE requester_id = ? AND target_id = ? AND status = 'accepted') OR user_id IN (SELECT requester_id FROM friends WHERE requester_id = ? AND target_id = ? AND status = 'accepted'))))`,
      params: [ownerId, viewerId, ownerId, ownerId, viewerId],
    };
  } catch (e) {
    if (/no such table: friends|no column named visibility/i.test(e?.message)) {
      return { sql: 'WHERE user_id = ?', params: [ownerId] };
    }
    throw e;
  }
}

function buildUserSoundsWhere(ownerId, viewerId, canViewOwn) {
  if (canViewOwn) {
    return { sql: 'WHERE user_id = ?', params: [ownerId] };
  }
  try {
    if (!viewerId) {
      return { sql: "WHERE user_id = ? AND (visibility = 'public' OR visibility IS NULL OR visibility = '')", params: [ownerId] };
    }
    return {
      sql: `WHERE user_id = ? AND (visibility = 'public' OR visibility IS NULL OR visibility = '' OR (visibility = 'friends' AND (user_id IN (SELECT target_id FROM friends WHERE requester_id = ? AND target_id = ? AND status = 'accepted') OR user_id IN (SELECT requester_id FROM friends WHERE requester_id = ? AND target_id = ? AND status = 'accepted'))))`,
      params: [ownerId, viewerId, ownerId, ownerId, viewerId],
    };
  } catch (e) {
    if (/no such table: friends|no column named visibility/i.test(e?.message)) {
      return { sql: 'WHERE user_id = ?', params: [ownerId] };
    }
    throw e;
  }
}

async function canViewImage(db, img, viewerId) {
  const vis = img.visibility || 'public' || '';
  if (!vis || vis === 'public') return true;
  if (img.user_id === viewerId) return true;
  if (!viewerId) return false;
  try {
    const friend = await db.prepare(
      `SELECT 1 FROM friends WHERE status = 'accepted' AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))`
    ).bind(viewerId, img.user_id, img.user_id, viewerId).first();
    return !!friend;
  } catch (_) {
    return false;
  }
}

async function enrichPostsWithLikesComments(db, posts, viewerId) {
  const nums = (posts || []).map((p) => p.num).filter(Boolean);
  if (nums.length === 0) return posts;
  let likeCounts = {}, commentCounts = {}, likedByMe = {};
  try {
    const likeRows = await db.prepare(
      'SELECT image_num, COUNT(*) as c FROM likes WHERE image_num IN (' + nums.map(() => '?').join(',') + ') GROUP BY image_num'
    ).bind(...nums).all();
    (likeRows.results || []).forEach((r) => { likeCounts[r.image_num] = r.c; });
    const commentRows = await db.prepare(
      'SELECT image_num, COUNT(*) as c FROM comments WHERE image_num IN (' + nums.map(() => '?').join(',') + ') GROUP BY image_num'
    ).bind(...nums).all();
    (commentRows.results || []).forEach((r) => { commentCounts[r.image_num] = r.c; });
    if (viewerId) {
      const myLikes = await db.prepare(
        'SELECT image_num FROM likes WHERE image_num IN (' + nums.map(() => '?').join(',') + ') AND user_id = ?'
      ).bind(...nums, viewerId).all();
      (myLikes.results || []).forEach((r) => { likedByMe[r.image_num] = true; });
    }
  } catch (_) { /* tables may not exist */ }
  return posts.map((p) => {
    const babelHash = p.babeliaLocation || p.hash;
    return {
      ...p,
      userId: p.userId || null,
      imageUrl: `/i/${babelHash}`,
      imageUrlNum: `/i/n/${p.num}`,
      imageUrlThumb: `/i/${babelHash}?w=400`,
      exif: parseExifForApi(p.exif),
      likeCount: likeCounts[p.num] || 0,
      commentCount: commentCounts[p.num] || 0,
      likedByMe: !!likedByMe[p.num],
    };
  });
}

function serializePost(p) {
  if (!p) return p;
  const { exif, ...rest } = p;
  return { ...rest, exif: parseExifForApi(exif) };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
