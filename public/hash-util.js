const BABELIA_SIZE = 1600;
const IMAGE_MAX = 4096;

/** Convert HEIC/HEIF to JPEG blob for canvas (browsers can't read HEIC natively) */
async function ensureCanvasCompatible(fileOrBlob) {
  if (!fileOrBlob) throw new Error('No file');
  const type = (fileOrBlob.type || '').toLowerCase();
  const name = (fileOrBlob.name || '').toLowerCase();
  const isHeic = type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
  if (!isHeic) return fileOrBlob;
  if (typeof heic2any !== 'undefined') {
    const result = await heic2any({ blob: fileOrBlob, toType: 'image/jpeg', quality: 1 });
    return Array.isArray(result) ? result[0] : result;
  }
  throw new Error('HEIC files need heic2any. Add script: https://unpkg.com/heic2any');
}

/**
 * Hash raw RGBA pixels (matches server: sharp ensureAlpha().raw() → SHA-256)
 * Use with canvas getImageData().data
 */
async function hashRawPixels(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash raw RGB bytes (for Babelia)
 */
async function hashRawRgb(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute hash of image scaled to fit inside maxSize×maxSize (matches server)
 * @param {HTMLImageElement|File|Blob} source - image source
 * @param {number} maxSize - max width/height (default 4096 for iPhone/iPad)
 * @returns {Promise<string>} hex hash
 */
async function hashImageAtSize(source, maxSize = IMAGE_MAX) {
  const compatible = source instanceof File || source instanceof Blob ? await ensureCanvasCompatible(source) : source;
  const img = document.createElement('img');
  const objectUrl =
    compatible instanceof HTMLImageElement
      ? compatible.src
      : compatible instanceof File || compatible instanceof Blob
        ? URL.createObjectURL(compatible)
        : null;
  if (!objectUrl) throw new Error('Invalid source');

  img.src = objectUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.min(maxSize / iw, maxSize / ih); // fit inside, up to maxSize×maxSize
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, iw, ih, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const hash = await hashRawPixels(imageData.data);

  if (compatible instanceof File || compatible instanceof Blob) URL.revokeObjectURL(objectUrl);
  return hash;
}

/**
 * Babelia: 1600×1600, 24-bit RGB. Resize to fill (crop). Returns { babelHash, pngBlob }.
 * For Cloudflare: client computes, sends PNG to store in R2.
 */
async function computeBabelia(source) {
  const compatible = source instanceof File || source instanceof Blob ? await ensureCanvasCompatible(source) : source;
  const img = document.createElement('img');
  const objectUrl =
    compatible instanceof HTMLImageElement
      ? compatible.src
      : compatible instanceof File || compatible instanceof Blob
        ? URL.createObjectURL(compatible)
        : null;
  if (!objectUrl) throw new Error('Invalid source');

  img.src = objectUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(BABELIA_SIZE / iw, BABELIA_SIZE / ih);
  const sWidth = iw / scale;
  const sHeight = ih / scale;
  const sx = (iw - sWidth) / 2;
  const sy = (ih - sHeight) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = BABELIA_SIZE;
  canvas.height = BABELIA_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, BABELIA_SIZE, BABELIA_SIZE);

  const imageData = ctx.getImageData(0, 0, BABELIA_SIZE, BABELIA_SIZE);
  const rgba = imageData.data;
  const rgb = new Uint8ClampedArray(BABELIA_SIZE * BABELIA_SIZE * 3);
  for (let i = 0; i < BABELIA_SIZE * BABELIA_SIZE; i++) {
    rgb[i * 3] = rgba[i * 4];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }

  const babelHash = await hashRawRgb(rgb);
  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));

  if (compatible instanceof File || compatible instanceof Blob) URL.revokeObjectURL(objectUrl);
  return { babelHash, pngBlob, width: iw, height: ih };
}

/**
 * Generate deterministic image from Babel hash (64 hex chars).
 * Uses hash as seed for pixel generation - same hash always yields same image.
 */
function generateImageFromBabelHash(babelHash, size = 1600) {
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
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let i = 0; i < size * size * 4; i += 4) {
    data[i] = rng() * 256;
    data[i + 1] = rng() * 256;
    data[i + 2] = rng() * 256;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Increment a 64-char hex hash (walk forward in Babel space)
 */
function incrementBabelHash(hash) {
  const h = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '').padStart(64, '0').slice(-64);
  if (h.length !== 64) return null;
  const max = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  let n = BigInt('0x' + h);
  n = n === max ? 0n : n + 1n;
  return n.toString(16).padStart(64, '0');
}

/**
 * Decrement a 64-char hex hash (walk backward in Babel space)
 */
function decrementBabelHash(hash) {
  const h = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '').padStart(64, '0').slice(-64);
  if (h.length !== 64) return null;
  const max = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  let n = BigInt('0x' + h);
  n = n === 0n ? max : n - 1n;
  return n.toString(16).padStart(64, '0');
}

/**
 * Generate deterministic audio from Babel hash (64 hex chars).
 * Wall of Sound: every possible 30-second sample at 8kHz 16-bit mono.
 * Same hash always yields same sound. Returns WAV blob URL.
 */
function generateSoundFromBabelHash(babelHash, durationSec = 1, sampleRate = 8000) {
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
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/**
 * Random 64-char hex hash
 */
function randomBabelHash() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if an image exists in storage by computing its hash
 */
async function findImageByHash(source, size = 1600) {
  const hash = await hashImageAtSize(source, size);
  const res = await fetch(`/api/exists/${hash}`);
  const data = await res.json();
  return { hash, ...data, url: `/i/${hash}` };
}

// Expose for console / dropzone lookup
window.ensureCanvasCompatible = ensureCanvasCompatible;
window.hashImageAtSize = hashImageAtSize;
window.hashRawPixels = hashRawPixels;
window.hashRawRgb = hashRawRgb;
window.computeBabelia = computeBabelia;
window.findImageByHash = findImageByHash;
window.generateImageFromBabelHash = generateImageFromBabelHash;
window.generateSoundFromBabelHash = generateSoundFromBabelHash;
window.incrementBabelHash = incrementBabelHash;
window.decrementBabelHash = decrementBabelHash;
window.randomBabelHash = randomBabelHash;
