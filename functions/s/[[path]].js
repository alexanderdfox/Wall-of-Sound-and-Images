// Serves /s/* (audio by hash or num) - uploaded from KV, or generated 30s mono 8kHz WAV for any hash
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
      const sound = await db.prepare("SELECT hash FROM sounds WHERE num = ? AND (COALESCE(disabled,0) = 0) AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE COALESCE(disabled,0)=1))").bind(num).first();
      if (!sound) return json({ error: 'Not found', num }, 404);
      hash = sound.hash;
    } else {
      hash = String(pathSegments[0] || '').replace(/[^a-f0-9]/gi, '').replace(/\.(mp3|wav|ogg|webm)$/i, '');
      if (!hash || hash.length !== 64) return json({ error: 'Invalid hash (64 hex chars)' }, 400);
      const disabledCheck = await db.prepare("SELECT 1 FROM sounds WHERE hash = ? AND (COALESCE(disabled,0) = 1 OR user_id IN (SELECT id FROM users WHERE COALESCE(disabled,0)=1))").bind(hash).first();
      if (disabledCheck) return json({ error: 'Not found', hash }, 404);
    }

    // Prefer uploaded clip from KV (content-addressed)
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

    // Fallback: generate 30s mono 8kHz WAV so all possible clips are in the library
    const wav = generateWavFromHash(hash, 30, 8000);
    if (wav) {
      return new Response(wav, {
        headers: {
          'Content-Type': 'audio/wav',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    return json({ error: 'Invalid hash', hash }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

function generateWavFromHash(babelHash, durationSec = 30, sampleRate = 8000) {
  const h = String(babelHash || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (h.length !== 64) return null;
  const seed = new Uint32Array(4);
  for (let i = 0; i < 4; i++) seed[i] = parseInt(h.slice(i * 16, (i + 1) * 16), 16) >>> 0;
  const sfc32 = (a, b, c, d) => () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  const rng = sfc32(seed[0], seed[1], seed[2], seed[3]);
  const numChannels = 1;
  const bitsPerSample = 16;
  const numFrames = Math.floor(sampleRate * durationSec);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = numFrames * numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;
  const write = (val, fmt) => {
    if (fmt === 'str') {
      for (let i = 0; i < val.length; i++) view.setUint8(offset++, val.charCodeAt(i));
    } else if (fmt === 32) view.setUint32(offset, val, true), offset += 4;
    else if (fmt === 16) view.setUint16(offset, val, true), offset += 2;
  };
  write('RIFF', 'str');
  write(36 + dataSize, 32);
  write('WAVE', 'str');
  write('fmt ', 'str');
  write(16, 32);
  write(1, 16);
  write(numChannels, 16);
  write(sampleRate, 32);
  write(byteRate, 32);
  write(numChannels * (bitsPerSample / 8), 16);
  write(bitsPerSample, 16);
  write('data', 'str');
  write(dataSize, 32);
  const sampleOffset = 44;
  for (let i = 0; i < numFrames; i++) {
    const s = Math.floor((rng() * 65536) - 32768);
    view.setInt16(sampleOffset + i * 2, s, true);
  }
  return buffer;
}

function hashAudioContentType(buffer) {
  const arr = new Uint8Array(buffer);
  if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46) return 'audio/wav';
  if (arr[0] === 0xff && (arr[1] === 0xfb || arr[1] === 0xfa)) return 'audio/mpeg';
  if (arr[0] === 0x4f && arr[1] === 0x67 && arr[2] === 0x67) return 'audio/ogg';
  if (arr[0] === 0x1a && arr[1] === 0x45 && arr[2] === 0xdf && arr[3] === 0xa3) return 'audio/webm';
  if (arr.length >= 8 && arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) return 'audio/mp4';
  return 'audio/wav';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
