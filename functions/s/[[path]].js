// Serves /s/* (audio by hash or num) - uploaded clips from KV, like /i/* for images
export async function onRequest(context) {
  const { env } = context;
  const pathSegments = context.params.path || [];
  const db = env.DB;
  const kv = env.BABEL_SOUNDS;

  if (!db) return json({ error: 'Database not configured' }, 500);

  try {
    let hash;
    if (pathSegments[0] === 'n' && pathSegments[1]) {
      const num = parseInt(String(pathSegments[1]), 10);
      if (isNaN(num) || num < 1) return json({ error: 'Invalid number' }, 400);
      const sound = await db.prepare('SELECT hash FROM sounds WHERE num = ?').bind(num).first();
      if (!sound) return json({ error: 'Not found', num }, 404);
      hash = sound.hash;
    } else {
      hash = String(pathSegments[0] || '').replace(/[^a-f0-9]/gi, '').replace(/\.(mp3|wav|ogg|webm)$/i, '');
      if (!hash || hash.length !== 64) return json({ error: 'Invalid hash (64 hex chars)' }, 400);
    }

    const sound = await db.prepare(
      'SELECT num, hash, user_id, caption, duration, created_at FROM sounds WHERE hash = ?'
    ).bind(hash).first();

    if (!sound) return json({ error: 'Not found', hash }, 404);

    if (kv) {
      const audio = await kv.get(`sound:${hash}`, { type: 'arrayBuffer' });
      if (audio) {
        const contentType = hashAudioContentType(audio);
        return new Response(audio, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      }
    }

    return json({ error: 'Audio not found in storage', hash }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

function hashAudioContentType(buffer) {
  const arr = new Uint8Array(buffer);
  if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46) return 'audio/wav';
  if (arr[0] === 0xff && (arr[1] === 0xfb || arr[1] === 0xfa)) return 'audio/mpeg';
  if (arr[0] === 0x4f && arr[1] === 0x67 && arr[2] === 0x67) return 'audio/ogg';
  return 'audio/wav';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
