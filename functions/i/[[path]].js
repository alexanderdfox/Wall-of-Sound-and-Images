// Cloudflare Pages Function: serves /i/* (images by num or hash)
// Full-size: prefer origin (<2hr) else Babel. Thumbnails (?w=): always Babel (no resize in Worker).

const ORIGIN_TTL_MS = 2 * 60 * 60 * 1000;

async function tryOrigin(bucket, babelHash, wantThumb) {
  if (wantThumb || !bucket) return null;
  const list = await bucket.list({ prefix: `origin/${babelHash}` });
  const objs = list.objects || [];
  if (!objs.length) return null;
  const o = objs[0];
  const uploaded = o.uploaded ? new Date(o.uploaded).getTime() : 0;
  if (!uploaded || Date.now() - uploaded > ORIGIN_TTL_MS) return null;
  const obj = await bucket.get(o.key);
  const ct = obj?.httpMetadata?.contentType || 'image/jpeg';
  return new Response(obj.body, { headers: { 'Content-Type': ct } });
}

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const pathSegments = context.params.path || [];
  const db = env.DB;
  const bucket = env.BUCKET;
  const width = parseInt(url.searchParams.get('w') || url.searchParams.get('size'), 10);
  const wantThumb = !isNaN(width) && width > 0;

  if (!db) return json({ error: 'Database not configured' }, 500);

  try {
    // /i/n/:num
    if (pathSegments[0] === 'n' && pathSegments[1]) {
      const num = parseInt(String(pathSegments[1]).replace(/\.png$/, ''), 10);
      if (isNaN(num) || num < 1) return json({ error: 'Invalid number' }, 400);

      const post = await db.prepare(
        'SELECT num, image_hash as hash, babel_hash as babeliaLocation, babelia_png FROM images WHERE num = ?'
      ).bind(num).first();
      if (!post) return json({ error: 'Not found', num }, 404);

      if (url.searchParams.get('format') === 'json') {
        return json({ num: post.num, hash: post.hash, babeliaLocation: post.babeliaLocation });
      }

      const babelHash = post.babeliaLocation || post.hash;
      const originRes = await tryOrigin(bucket, babelHash, wantThumb);
      if (originRes) return originRes;

      const kvPng = env.BABEL_IMAGES ? await env.BABEL_IMAGES.get(`babel:${babelHash}`, { type: 'arrayBuffer' }) : null;
      if (kvPng) {
        return new Response(kvPng, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' },
        });
      }

      const png = bucket ? await bucket.get(`babel/${babelHash}.png`) : null;
      if (png) {
        return new Response(png.body, {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      if (post.babelia_png) {
        try {
          const b64 = typeof post.babelia_png === 'string' ? post.babelia_png : String.fromCharCode.apply(null, new Uint8Array(post.babelia_png || []));
          const imgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const ct = imgBytes[0] === 0xff && imgBytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
          return new Response(imgBytes, { headers: { 'Content-Type': ct } });
        } catch (e) { /* fall through */ }
      }
      return new Response(placeholderSvg(post.num, babelHash), {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }

    // /i/:id (64-char hash)
    if (pathSegments.length === 1) {
      const id = String(pathSegments[0]).replace(/[^a-f0-9]/gi, '').replace(/\.png$/, '');
      if (!id || id.length !== 64) return json({ error: 'Invalid hash (64 hex chars)' }, 400);

      const post = await db.prepare(
        'SELECT num, image_hash as hash, babel_hash as babeliaLocation, babelia_png FROM images WHERE image_hash = ? OR babel_hash = ?'
      ).bind(id, id).first();
      if (!post) return json({ error: 'Not found', id }, 404);

      if (url.searchParams.get('format') === 'json') {
        return json({ num: post.num, hash: post.hash, babeliaLocation: post.babeliaLocation });
      }

      const babelHash = post.babeliaLocation || post.hash;
      const originRes = await tryOrigin(bucket, babelHash, wantThumb);
      if (originRes) return originRes;

      const kvPng = env.BABEL_IMAGES ? await env.BABEL_IMAGES.get(`babel:${babelHash}`, { type: 'arrayBuffer' }) : null;
      if (kvPng) {
        return new Response(kvPng, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' },
        });
      }

      const png = bucket ? await bucket.get(`babel/${babelHash}.png`) : null;
      if (png) {
        return new Response(png.body, {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      if (post.babelia_png) {
        try {
          const b64 = typeof post.babelia_png === 'string' ? post.babelia_png : String.fromCharCode.apply(null, new Uint8Array(post.babelia_png || []));
          const imgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const ct = imgBytes[0] === 0xff && imgBytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
          return new Response(imgBytes, { headers: { 'Content-Type': ct } });
        } catch (e) { /* fall through */ }
      }
      return new Response(placeholderSvg(post.num, babelHash || id), {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

function placeholderSvg(num, babelHash) {
  const short = babelHash ? String(babelHash).replace(/[<>"&]/g, '') : '';
  const safe = short.slice(0, 16) + (short.length > 16 ? '…' : '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
  <rect width="1600" height="1600" fill="#1a1a2e"/>
  <text x="800" y="580" font-family="system-ui,sans-serif" font-size="320" font-weight="bold" fill="#eee" text-anchor="middle">#${num}</text>
  <text x="800" y="820" font-family="monospace" font-size="24" fill="#6c7a89" text-anchor="middle">babelia: ${safe}</text>
  <text x="800" y="920" font-family="system-ui,sans-serif" font-size="18" fill="#4a5568" text-anchor="middle">babelia.libraryofbabel.info</text>
</svg>`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
