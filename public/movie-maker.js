/**
 * Movie Maker — Combine images and sounds from feed/user content
 */

const API = '/api';
const PIXELS_PER_SEC = 80;
const DEFAULT_IMAGE_DURATION = 3;
const EXPORT_FPS = 30;
const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 720;

let timeline = { images: [], sounds: [] };
let libraryData = { feed: [], me: [], sounds: [], meSounds: [] };
let currentSource = 'feed';
let currentType = 'image';
let playInterval = null;
let currentTime = 0;
let isPlaying = false;
let cachedImages = new Map();
let cachedAudioBuffers = new Map();

const authToken = localStorage.getItem('tchoff_token');
const headers = authToken ? { Authorization: 'Bearer ' + authToken } : {};

function getDuration() {
  let max = 0;
  timeline.images.forEach((c) => { max = Math.max(max, c.startTime + c.duration); });
  timeline.sounds.forEach((c) => { max = Math.max(max, c.startTime + (c.duration || 30)); });
  return Math.max(1, max);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Media library ─────────────────────────────────────────────────────────

async function loadFeedImages() {
  const res = await fetch(`${API}/feed?per=48`, { headers });
  const data = res.ok ? await res.json() : { items: [] };
  libraryData.feed = data.items || [];
}

async function loadMyImages() {
  if (!authToken) return;
  const meRes = await fetch(`${API}/auth/me`, { headers });
  const me = meRes.ok ? await meRes.json() : null;
  if (!me?.id) return;
  const res = await fetch(`${API}/user/${me.id}/images?per=48`, { headers });
  const data = res.ok ? await res.json() : { items: [] };
  libraryData.me = data.items || [];
}

async function loadPublicSounds() {
  const res = await fetch(`${API}/sounds?per=80`, { headers });
  const data = res.ok ? await res.json() : { items: [] };
  libraryData.sounds = data.items || [];
}

async function loadMySounds() {
  if (!authToken) return;
  const meRes = await fetch(`${API}/auth/me`, { headers });
  const me = meRes.ok ? await meRes.json() : null;
  if (!me?.id) return;
  const res = await fetch(`${API}/user/${me.id}/sounds?per=48`, { headers });
  const data = res.ok ? await res.json() : { items: [] };
  libraryData.meSounds = data.items || [];
}

function getImageUrl(item) {
  const hash = item.babeliaLocation || item.hash;
  return item.num ? `/i/n/${item.num}?w=400` : hash ? `/i/${hash}?w=400` : '';
}

function getSoundUrl(item) {
  return item.num ? `/s/n/${item.num}` : item.hash ? `/s/${item.hash}` : '';
}

function renderLibrary() {
  const grid = document.getElementById('library-grid');
  const loading = document.getElementById('library-loading');
  const signin = document.getElementById('library-signin');

  loading.style.display = 'none';
  signin.style.display = 'none';

  let items = [];
  if (currentType === 'image') {
    items = currentSource === 'feed' ? libraryData.feed : libraryData.me;
    if (currentSource === 'me' && !authToken) signin.style.display = 'block';
  } else {
    items = currentSource === 'sounds' ? libraryData.sounds : libraryData.meSounds;
    if (currentSource === 'me-sounds' && !authToken) signin.style.display = 'block';
  }

  if (items.length === 0 && signin.style.display !== 'block') {
    grid.innerHTML = '<div class="movie-empty-hint" style="grid-column:1/-1">No items</div>';
    return;
  }

  grid.innerHTML = items.map((item, i) => {
    const id = `lib-${currentSource}-${currentType}-${i}`;
    if (currentType === 'image') {
      const url = getImageUrl(item);
      return `<div class="movie-library-item" data-id="${id}" data-type="image" data-num="${item.num || ''}" data-hash="${(item.babeliaLocation || item.hash) || ''}">
        <img src="${url}" alt="" loading="lazy" onerror="this.parentElement.style.background='var(--bg)'">
      </div>`;
    }
    const dur = item.duration ?? 30;
    return `<div class="movie-library-item sound" data-id="${id}" data-type="sound" data-num="${item.num || ''}" data-hash="${item.hash || ''}" data-duration="${dur}">
      <span>#${item.num || '?'} · ${dur}s</span>
    </div>`;
  }).join('');

  grid.querySelectorAll('.movie-library-item').forEach((el) => {
    el.addEventListener('click', () => addToTimeline(el.dataset));
  });
}

async function switchLibraryTab(source, type) {
  currentSource = source;
  currentType = type;
  document.querySelectorAll('.movie-library-tab').forEach((t) => t.classList.toggle('active', t.dataset.source === source && t.dataset.type === type));

  const loading = document.getElementById('library-loading');
  if (
    (type === 'image' && ((source === 'feed' && libraryData.feed.length === 0) || (source === 'me' && libraryData.me.length === 0))) ||
    (type === 'sound' && ((source === 'sounds' && libraryData.sounds.length === 0) || (source === 'me-sounds' && libraryData.meSounds.length === 0)))
  ) {
    loading.style.display = 'block';
  }
  try {
    if (source === 'feed' && type === 'image') await loadFeedImages();
    else if (source === 'me' && type === 'image') await loadMyImages();
    else if (source === 'sounds' && type === 'sound') await loadPublicSounds();
    else if (source === 'me-sounds' && type === 'sound') await loadMySounds();
  } catch (_) {}
  loading.style.display = 'none';
  renderLibrary();
}

// ─── Timeline ──────────────────────────────────────────────────────────────

function addToTimeline(dataset) {
  const type = dataset.type;
  if (type === 'image') {
    const num = dataset.num ? parseInt(dataset.num, 10) : null;
    const hash = dataset.hash || '';
    const startTime = getDuration();
    timeline.images.push({ num, hash, startTime, duration: DEFAULT_IMAGE_DURATION });
  } else {
    const num = dataset.num ? parseInt(dataset.num, 10) : null;
    const hash = dataset.hash || '';
    const duration = dataset.duration ? parseFloat(dataset.duration) : 30;
    const startTime = getDuration();
    timeline.sounds.push({ num, hash, startTime, duration });
  }
  sortTimeline();
  renderTimeline();
  renderPreview();
  updateTimeDisplay();
}

function sortTimeline() {
  timeline.images.sort((a, b) => a.startTime - b.startTime);
  timeline.sounds.sort((a, b) => a.startTime - b.startTime);
}

function removeImageClip(index) {
  timeline.images.splice(index, 1);
  renderTimeline();
  renderPreview();
  updateTimeDisplay();
}

function removeSoundClip(index) {
  timeline.sounds.splice(index, 1);
  renderTimeline();
  renderPreview();
  updateTimeDisplay();
}

function getImageItem(num, hash) {
  const feed = libraryData.feed.find((p) => (num && p.num === num) || ((p.babeliaLocation || p.hash) === hash));
  const me = libraryData.me.find((p) => (num && p.num === num) || ((p.babeliaLocation || p.hash) === hash));
  return feed || me || { num, babeliaLocation: hash, hash };
}

function getSoundItem(num, hash) {
  const pub = libraryData.sounds.find((s) => (num && s.num === num) || s.hash === hash);
  const me = libraryData.meSounds.find((s) => (num && s.num === num) || s.hash === hash);
  return pub || me || { num, hash, duration: 30 };
}

function renderTimeline() {
  const imageTrack = document.getElementById('image-track');
  const soundTrack = document.getElementById('sound-track');
  const durEl = document.getElementById('timeline-duration');
  const dur = getDuration();

  durEl.textContent = `${Math.ceil(dur)}s`;

  const trackWidth = Math.max(200, dur * PIXELS_PER_SEC);
  imageTrack.style.width = trackWidth + 'px';
  soundTrack.style.width = trackWidth + 'px';

  if (timeline.images.length === 0) {
    imageTrack.innerHTML = '<span class="movie-empty-hint" style="padding:8px 0;margin:0">Click images from the library to add</span>';
  } else {
    imageTrack.innerHTML = timeline.images.map((c, i) => {
      const leftPx = c.startTime * PIXELS_PER_SEC;
      const widthPx = Math.max(40, c.duration * PIXELS_PER_SEC);
      return `<div class="movie-clip image" data-index="${i}" style="position:absolute;left:${leftPx}px;width:${widthPx}px">#${c.num || '?'} <span class="remove" data-action="remove-image" data-index="${i}">×</span></div>`;
    }).join('');
    imageTrack.style.position = 'relative';
    imageTrack.style.minHeight = '48px';
    imageTrack.querySelectorAll('.movie-clip').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'remove-image') removeImageClip(parseInt(e.target.dataset.index, 10));
      });
    });
  }

  if (timeline.sounds.length === 0) {
    soundTrack.innerHTML = '<span class="movie-empty-hint" style="padding:8px 0;margin:0">Click sounds from the library to add</span>';
  } else {
    soundTrack.innerHTML = timeline.sounds.map((c, i) => {
      const leftPx = c.startTime * PIXELS_PER_SEC;
      const widthPx = Math.max(40, (c.duration || 30) * PIXELS_PER_SEC);
      return `<div class="movie-clip sound" data-index="${i}" style="position:absolute;left:${leftPx}px;width:${widthPx}px">#${c.num || '?'} <span class="remove" data-action="remove-sound" data-index="${i}">×</span></div>`;
    }).join('');
    soundTrack.style.position = 'relative';
    soundTrack.style.minHeight = '48px';
    soundTrack.querySelectorAll('.movie-clip').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'remove-sound') removeSoundClip(parseInt(e.target.dataset.index, 10));
      });
    });
  }
}

// ─── Preview & playback ────────────────────────────────────────────────────

function getCurrentImageAt(t) {
  for (let i = timeline.images.length - 1; i >= 0; i--) {
    const c = timeline.images[i];
    if (t >= c.startTime && t < c.startTime + c.duration) return { clip: c, item: getImageItem(c.num, c.hash) };
  }
  return null;
}

async function loadImageForPreview(item) {
  const key = item.num ? `n${item.num}` : (item.babeliaLocation || item.hash) || 'x';
  if (cachedImages.has(key)) return cachedImages.get(key);
  const url = item.num ? `/i/n/${item.num}` : (item.babeliaLocation || item.hash) ? `/i/${item.babeliaLocation || item.hash}` : '';
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { cachedImages.set(key, img); resolve(img); };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function renderPreview(atTime) {
  const canvas = document.getElementById('preview-canvas');
  const placeholder = document.getElementById('preview-placeholder');
  const curr = getCurrentImageAt(atTime);

  if (!curr) {
    canvas.style.display = 'none';
    placeholder.style.display = 'block';
    placeholder.textContent = timeline.images.length ? 'No image at this time' : 'Add images to the timeline';
    return;
  }

  loadImageForPreview(curr.item).then((img) => {
    if (!img) return;
    canvas.style.display = 'block';
    placeholder.style.display = 'none';
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / img.width, ch / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
  });
}

function updateTimeDisplay() {
  const dur = getDuration();
  document.getElementById('time-display').textContent = `${formatTime(currentTime)} / ${formatTime(dur)}`;
}

function updatePlayhead() {
  const dur = getDuration();
  const leftPx = currentTime * PIXELS_PER_SEC;
  document.querySelectorAll('.movie-track-row').forEach((row) => {
    let ph = row.querySelector('.movie-playhead');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'movie-playhead';
      row.style.position = 'relative';
      row.appendChild(ph);
    }
    ph.style.left = leftPx + 'px';
  });
}

function play() {
  if (isPlaying) return;
  const dur = getDuration();
  if (dur <= 0) return;
  isPlaying = true;
  document.getElementById('btn-play').disabled = true;
  document.getElementById('btn-pause').disabled = false;

  const startReal = performance.now();
  const startTime = currentTime;

  playInterval = setInterval(() => {
    const elapsed = (performance.now() - startReal) / 1000;
    currentTime = Math.min(startTime + elapsed, dur);
    updateTimeDisplay();
    updatePlayhead();
    renderPreview(currentTime);

    // Play sounds (simple: fire when we cross startTime)
    timeline.sounds.forEach((c) => {
      if (currentTime >= c.startTime && currentTime - elapsed < c.startTime) {
        playSoundClip(c);
      }
    });

    if (currentTime >= dur) {
      pause();
    }
  }, 1000 / 30);
}

function playSoundClip(c) {
  const item = getSoundItem(c.num, c.hash);
  const url = getSoundUrl(item);
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = 1;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function pause() {
  isPlaying = false;
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
  document.getElementById('btn-play').disabled = false;
  document.getElementById('btn-pause').disabled = true;
}

// ─── Export ────────────────────────────────────────────────────────────────

async function exportVideo() {
  const btn = document.getElementById('btn-export');
  const status = document.getElementById('export-status');
  if (timeline.images.length === 0) {
    status.textContent = 'Add at least one image.';
    return;
  }

  btn.disabled = true;
  status.textContent = 'Preparing…';

  try {
    const duration = getDuration();
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;
    const ctx = canvas.getContext('2d');

    // Preload all images
    const imageClips = timeline.images.map((c) => ({ ...c, item: getImageItem(c.num, c.hash) }));
    const loaded = await Promise.all(imageClips.map((c) => loadImageForPreview(c.item)));
    const validClips = imageClips.filter((_, i) => loaded[i]);

    if (validClips.length === 0) {
      status.textContent = 'Failed to load images.';
      btn.disabled = false;
      return;
    }

    status.textContent = 'Mixing audio…';

    // Build mixed audio with OfflineAudioContext
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const mixedLength = duration * audioCtx.sampleRate;
    const mixedBuffer = audioCtx.createBuffer(2, mixedLength, audioCtx.sampleRate);
    const left = mixedBuffer.getChannelData(0);
    const right = mixedBuffer.getChannelData(1);

    for (const c of timeline.sounds) {
      const url = getSoundUrl(getSoundItem(c.num, c.hash));
      if (!url) continue;
      try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const buf = await audioCtx.decodeAudioData(arrayBuffer);
        const startSample = Math.floor(c.startTime * audioCtx.sampleRate);
        const copyLen = Math.min(buf.length, Math.floor((c.duration || 30) * audioCtx.sampleRate));
        const srcLeft = buf.getChannelData(0);
        const srcRight = buf.numberOfChannels > 1 ? buf.getChannelData(1) : srcLeft;
        for (let i = 0; i < copyLen && startSample + i < mixedLength; i++) {
          left[startSample + i] += srcLeft[Math.min(i, srcLeft.length - 1)];
          right[startSample + i] += srcRight[Math.min(i, srcRight.length - 1)];
        }
      } catch (_) {}
    }

    status.textContent = 'Rendering video…';

    const stream = canvas.captureStream(EXPORT_FPS);
    const audioCtxLive = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSource = audioCtxLive.createBufferSource();
    bufferSource.buffer = mixedBuffer;
    const dest = audioCtxLive.createMediaStreamDestination();
    bufferSource.connect(dest);
    bufferSource.start(0);

    const combinedStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeOptions = [
      'video/mp4',
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ];
    const mimeType = mimeOptions.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const isMp4 = mimeType.startsWith('video/mp4');
    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2500000 });
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const ext = isMp4 ? 'mp4' : 'webm';
      const blobType = isMp4 ? 'video/mp4' : 'video/webm';
      const blob = new Blob(chunks, { type: blobType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tchoff-movie-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      status.textContent = isMp4 ? 'MP4 download ready.' : 'WebM download ready. (Use Safari for MP4, or convert at cloudconvert.com)';
      btn.disabled = false;
    };

    recorder.start(100);

    const frameCount = Math.ceil(duration * EXPORT_FPS);
    const frameInterval = 1000 / EXPORT_FPS;

    for (let f = 0; f < frameCount; f++) {
      const t = f / EXPORT_FPS;
      const curr = imageClips.find((c) => t >= c.startTime && t < c.startTime + c.duration);
      const idx = curr ? imageClips.indexOf(curr) : -1;
      const img = idx >= 0 ? loaded[idx] : null;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (img) {
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
      }
      await new Promise((r) => setTimeout(r, frameInterval));
    }

    await new Promise((r) => setTimeout(r, 200));
    bufferSource.stop();
    recorder.stop();
  } catch (err) {
    status.textContent = 'Export failed: ' + err.message;
    btn.disabled = false;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.movie-library-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchLibraryTab(tab.dataset.source, tab.dataset.type));
});

document.getElementById('btn-play').addEventListener('click', play);
document.getElementById('btn-pause').addEventListener('click', pause);
document.getElementById('btn-export').addEventListener('click', exportVideo);

document.getElementById('btn-auth')?.addEventListener('click', () => {
  window.location.href = '/#auth';
});

switchLibraryTab('feed', 'image');
