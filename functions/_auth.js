// Auth utilities for Cloudflare Workers (Web Crypto only, no deps)

const PBKDF2_ITERATIONS = 100000;
const SALT_LEN = 16;
const HASH_LEN = 32;

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_LEN * 8
  );
  const hash = new Uint8Array(bits);
  const toHex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
  return toHex(salt) + ':' + toHex(hash);
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_LEN * 8
  );
  const hash = new Uint8Array(bits);
  const toHex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
  return toHex(hash) === hashHex;
}

function base64UrlEncode(data) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signJwt(payload, secret) {
  if (!secret || typeof secret !== 'string') return null;
  secret = String(secret).trim();
  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const msg = headerB64 + '.' + payloadB64;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(msg));
  return msg + '.' + base64UrlEncode(sig);
}

export async function verifyJwt(token, secret) {
  if (!token || !secret) return null;
  secret = String(secret).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const encoder = new TextEncoder();
    const [headerB64, payloadB64, sigB64] = parts;
    const msg = headerB64 + '.' + payloadB64;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigPadded = sigB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (sigB64.length % 4)) % 4);
    const sig = Uint8Array.from(atob(sigPadded), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(msg));
    if (!ok) return null;
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}
