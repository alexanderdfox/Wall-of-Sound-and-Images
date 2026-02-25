const PER_PAGE = 16;

// DOM
const feedGrid = document.getElementById('feed-grid');
const emptyState = document.getElementById('empty-state');
const paginationEl = document.getElementById('pagination');
const uploadModal = document.getElementById('upload-modal');
const hashModal = document.getElementById('hash-modal');
const authModal = document.getElementById('auth-modal');
const postModal = document.getElementById('post-modal');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const captionInput = document.getElementById('caption-input');
const usernameInput = document.getElementById('username-input');
const submitUpload = document.getElementById('submit-upload');
const hashInput = document.getElementById('hash-input');
const hashResult = document.getElementById('hash-result');
const lightboxBody = document.getElementById('lightbox-body');
const soundDropzone = document.getElementById('sound-dropzone');
const soundFileInput = document.getElementById('sound-file-input');
const soundDropzoneText = document.getElementById('sound-dropzone-text');
const usernameWrap = document.getElementById('username-wrap');

function updateSourceCodeCount() {
  const el = document.getElementById('source-code-input');
  const countEl = document.getElementById('source-code-count');
  if (el && countEl) countEl.textContent = `${(el.value || '').length} / 4096`;
}

document.getElementById('source-code-input')?.addEventListener('input', updateSourceCodeCount);

let selectedFile = null;
let selectedSoundFile = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordTimerId = null;
const MAX_RECORD_SEC = 30;
let currentUser = null;
let authToken = localStorage.getItem('tchoff_token');

function userLink(post) {
  const un = post.username || '';
  if (post.userId) return `<a href="/u/${encodeURIComponent(post.userId)}" class="post-user-link">@${escapeHtml(un)}</a>`;
  return `<span class="post-user">@${escapeHtml(un)}</span>`;
}

// Load feed
async function loadFeed(page = 1) {
  const headers = authToken ? { Authorization: 'Bearer ' + authToken } : {};
  try {
    const res = await fetch(`${API}/feed?page=${page}&per=${PER_PAGE}`, { headers });
    const data = res.ok ? await res.json() : { items: [], total: 0, page: 1, per: PER_PAGE };
    const posts = data.items || data;
    const total = data.total ?? posts.length;
    renderFeed(Array.isArray(posts) ? posts : []);
    renderPagination(total, data.page || page);
  } catch (err) {
    console.error(err);
    feedGrid.innerHTML = '<p class="loading">Failed to load feed.</p>';
  }
}

function renderFeed(posts) {
  feedGrid.innerHTML = '';
  if (!posts.length) return;

  posts.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'post-card';
    const babelHash = post.babeliaLocation || post.hash;
    const imgSrc = post.num ? `/i/n/${post.num}` : (babelHash ? `/i/${babelHash}` : (post.imageUrlThumb || post.imageUrlNum || post.imageUrl));
    card.innerHTML = `
      <div class="post-image-wrap">
        <img class="post-image" src="${imgSrc}" alt="${post.caption || 'Post'}" loading="lazy">
      </div>
      <div class="post-info">
        <div class="post-user-wrap">${userLink(post)}</div>
        ${post.caption ? `<div class="post-caption">${escapeHtml(post.caption)}</div>` : ''}
        ${(post.sourceCode || post.source_code) ? (typeof renderCodeComic === 'function' ? renderCodeComic(post.sourceCode || post.source_code, true, post.sourceCodeType || post.source_code_type) : '') : ''}
        <div class="post-stats">👍 ${post.likeCount ?? 0} · 💬 ${post.commentCount ?? 0}</div>
        <div class="post-hash" title="${post.babeliaLocation || post.hash || ''}">#${post.num || '?'} · ${(post.babeliaLocation || post.hash || '').slice(0, 12)}…</div>
        ${(post.width && post.height) ? `<div class="post-meta-small">${post.width}×${post.height}</div>` : ''}
        ${(post.createdAt || post.originIp) ? `<div class="post-meta-small">${post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}${post.createdAt && post.originIp ? ' · ' : ''}${post.originIp || ''}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => openPost(post, postModal, lightboxBody));
    feedGrid.appendChild(card);
    const wrap = card.querySelector('.post-image-wrap');
    if (wrap && typeof window.initScratchOff === 'function') {
      const img = wrap.querySelector('.post-image');
      if (img) {
        const init = () => requestAnimationFrame(() => window.initScratchOff(wrap));
        if (img.complete) setTimeout(init, 50);
        else img.addEventListener('load', init);
      }
    }
  });
}

function renderPagination(total, page) {
  paginationEl.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (totalPages <= 1) return;

  const prev = document.createElement('a');
  prev.href = page > 1 ? `?page=${page - 1}` : '#';
  prev.className = 'btn btn-ghost pagination-btn' + (page <= 1 ? ' disabled' : '');
  prev.textContent = '← Previous';
  if (page > 1) prev.onclick = (e) => { e.preventDefault(); loadFeed(page - 1); };
  paginationEl.appendChild(prev);

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `Page ${page} of ${totalPages}`;
  paginationEl.appendChild(info);

  const next = document.createElement('a');
  next.href = page < totalPages ? `?page=${page + 1}` : '#';
  next.className = 'btn btn-ghost pagination-btn' + (page >= totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  if (page < totalPages) next.onclick = (e) => { e.preventDefault(); loadFeed(page + 1); };
  paginationEl.appendChild(next);
}

// escapeHtml and openPost are provided by app-common.js

// Upload
function isImageTabActive() {
  return document.querySelector('.upload-media-tab[data-type="image"]')?.classList.contains('active');
}

document.getElementById('btn-upload').addEventListener('click', () => {
  if (!authToken) {
    authModal.showModal();
    document.getElementById('auth-logged-in').style.display = 'none';
    document.getElementById('auth-forms').style.display = 'block';
    return;
  }
  switchUploadMediaTab('image');
  uploadModal.showModal();
  resetUploadForm();
});

document.getElementById('cancel-upload').addEventListener('click', () => {
  stopCamera();
  stopRecording();
  uploadModal.close();
});
document.getElementById('close-upload')?.addEventListener('click', () => {
  stopCamera();
  stopRecording();
  uploadModal.close();
});

// Media tabs: Image | Audio
document.querySelectorAll('.upload-media-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    switchUploadMediaTab(tab.dataset.type);
    resetUploadForm();
  });
});

function switchUploadMediaTab(type) {
  document.querySelectorAll('.upload-media-tab').forEach((t) => t.classList.toggle('active', t.dataset.type === type));
  const imagePanel = document.getElementById('upload-image-panel');
  const audioPanel = document.getElementById('upload-audio-panel');
  if (imagePanel) imagePanel.style.display = type === 'image' ? '' : 'none';
  if (audioPanel) audioPanel.style.display = type === 'audio' ? '' : 'none';
  const sourceCodeWrap = document.getElementById('source-code-wrap');
  if (sourceCodeWrap) sourceCodeWrap.style.display = type === 'image' ? '' : 'none';
  // Username: show for Image when not logged in (anonymous); always hide for Audio (uses auth)
  if (usernameWrap) usernameWrap.style.display = type === 'image' && !currentUser ? '' : 'none';
  submitUpload.disabled = true;
}

dropzone.addEventListener('click', (e) => {
  if (e.target.closest('#camera-container')) return;
  if (document.getElementById('camera-container')?.style.display === 'block') return;
  fileInput.click();
});

const isMobileDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

document.querySelectorAll('.upload-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const panel = tab.closest('#upload-image-panel') || tab.closest('#upload-audio-panel');
    if (!panel) return;
    const isImage = !!tab.closest('#upload-image-panel');
    const tabsInPanel = panel.querySelectorAll('.upload-tab');
    tabsInPanel.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    if (isImage) {
      const source = tab.dataset.source;
      const dropzoneText = document.getElementById('dropzone-text');
      const cameraContainer = document.getElementById('camera-container');
      const cameraInput = document.getElementById('camera-input');
      if (source === 'camera') {
        if (isMobileDevice() && cameraInput) {
          stopCamera();
          if (cameraContainer) cameraContainer.style.display = 'none';
          if (dropzoneText) { dropzoneText.style.display = 'block'; dropzoneText.textContent = 'Tap Take Photo to open camera…'; }
          cameraInput?.click();
        } else {
          if (dropzoneText) dropzoneText.style.display = 'none';
          if (cameraContainer) cameraContainer.style.display = 'block';
          startCamera();
        }
      } else {
        stopCamera();
        if (cameraContainer) cameraContainer.style.display = 'none';
        if (dropzoneText) { dropzoneText.style.display = 'block'; dropzoneText.textContent = 'Drop image here or click to browse'; }
      }
    } else {
      stopRecording();
      const uploadPanel = document.getElementById('sound-upload-panel');
      const recordPanel = document.getElementById('sound-record-panel');
      const recordStatus = document.getElementById('record-status');
      const src = tab.dataset.source;
      if (uploadPanel) uploadPanel.style.display = src === 'upload' ? '' : 'none';
      if (recordPanel) recordPanel.style.display = src === 'record' ? '' : 'none';
      selectedSoundFile = null;
      submitUpload.disabled = true;
      if (recordStatus) recordStatus.textContent = src === 'record' ? 'Allow microphone access to record.' : '';
    }
  });
});

document.getElementById('camera-input')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file && isImageFile(file)) {
    setFile(file);
    document.querySelector('.upload-tab[data-source="browse"]')?.click();
  }
  e.target.value = '';
});

let cameraStream = null;
async function startCamera() {
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.getElementById('camera-preview');
    if (video) video.srcObject = cameraStream;
  } catch (e) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.getElementById('camera-preview');
      if (video) video.srcObject = cameraStream;
    } catch (err) {
      alert('Camera not available. Use Browse to select an image.');
      document.querySelector('.upload-tab[data-source="browse"]')?.click();
    }
  }
}
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-preview');
  if (video) video.srcObject = null;
}

function stopRecording() {
  if (recordTimerId) { clearInterval(recordTimerId); recordTimerId = null; }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.requestData(); } catch (_) {}
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  const btnStart = document.getElementById('btn-record-start');
  const btnStop = document.getElementById('btn-record-stop');
  const timer = document.getElementById('record-timer');
  if (btnStart) { btnStart.disabled = false; btnStart.textContent = 'Start recording'; }
  if (btnStop) btnStop.style.display = 'none';
  if (timer) { timer.textContent = '0:00 / 0:30'; timer.classList.remove('recording'); }
}

document.getElementById('capture-btn')?.addEventListener('click', async () => {
  const video = document.getElementById('camera-preview');
  const canvas = document.getElementById('camera-canvas');
  if (!video?.videoWidth || !canvas) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
    setFile(file);
    stopCamera();
    document.getElementById('camera-container').style.display = 'none';
    document.getElementById('dropzone-text').style.display = 'block';
    document.querySelector('.upload-tab[data-source="browse"]')?.click();
  }, 'image/jpeg', 0.92);
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

function isImageFile(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type.startsWith('image/') || /\.(heic|heif)$/.test(name);
}

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && isImageFile(file)) setFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) setFile(file);
});

// Sound dropzone & file input
if (soundDropzone) {
  soundDropzone.addEventListener('click', () => soundFileInput?.click());
  soundDropzone.addEventListener('dragover', (e) => { e.preventDefault(); soundDropzone.classList.add('dragover'); });
  soundDropzone.addEventListener('dragleave', () => soundDropzone.classList.remove('dragover'));
  soundDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    soundDropzone.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && (f.type.startsWith('audio/') || f.type.startsWith('video/') || /\.(mp3|wav|ogg|webm|m4a|mp4|webm)$/i.test(f.name))) setSoundFile(f);
  });
}
if (soundFileInput) {
  soundFileInput.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) setSoundFile(f);
  });
}

function setSoundFile(file) {
  selectedSoundFile = file;
  if (soundDropzoneText) soundDropzoneText.textContent = file.name;
  submitUpload.disabled = false;
}

// Record button
document.getElementById('btn-record-start')?.addEventListener('click', async () => {
  try {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } }); }
    catch (_) { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a'].find((m) => MediaRecorder.isTypeSupported(m)) || 'audio/webm';
    try { mediaRecorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 }); }
    catch (_) {
      try { mediaRecorder = new MediaRecorder(stream, { mimeType: mime }); }
      catch (_) { mediaRecorder = new MediaRecorder(stream); }
    }
    const blobType = mediaRecorder.mimeType || mime;
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recordedChunks.length) {
        const blob = new Blob(recordedChunks, { type: blobType });
        const ext = blobType.includes('webm') ? 'webm' : blobType.includes('mp4') ? 'm4a' : 'ogg';
        selectedSoundFile = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
        submitUpload.disabled = false;
        const recordStatus = document.getElementById('record-status');
        if (recordStatus) recordStatus.textContent = 'Recording ready. Click Upload to save.';
      } else {
        const recordStatus = document.getElementById('record-status');
        if (recordStatus) recordStatus.textContent = 'Recording too short. Try again.';
      }
    };
    mediaRecorder.start(1000);
    const btnStart = document.getElementById('btn-record-start');
    const btnStop = document.getElementById('btn-record-stop');
    const recordStatus = document.getElementById('record-status');
    const timer = document.getElementById('record-timer');
    if (btnStart) { btnStart.disabled = true; btnStart.textContent = 'Recording…'; }
    if (btnStop) { btnStop.style.display = ''; btnStop.disabled = false; }
    if (recordStatus) recordStatus.textContent = 'Recording…';
    if (timer) { timer.classList.add('recording'); }
    let elapsed = 0;
    recordTimerId = setInterval(() => {
      elapsed++;
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      if (timer) timer.textContent = `${m}:${s.toString().padStart(2, '0')} / 0:${MAX_RECORD_SEC}`;
      if (elapsed >= MAX_RECORD_SEC) stopRecording();
    }, 1000);
  } catch (err) {
    const recordStatus = document.getElementById('record-status');
    if (recordStatus) recordStatus.textContent = 'Microphone access denied.';
    alert('Could not access microphone. Please allow access and try again.');
  }
});

document.getElementById('btn-record-stop')?.addEventListener('click', stopRecording);

function setFile(file) {
  selectedFile = file;
  dropzone.querySelector('.dropzone-text').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  submitUpload.disabled = false;
}

function resetUploadForm() {
  selectedFile = null;
  selectedSoundFile = null;
  if (fileInput) fileInput.value = '';
  if (soundFileInput) soundFileInput.value = '';
  captionInput.value = '';
  const sourceCodeInput = document.getElementById('source-code-input');
  if (sourceCodeInput) { sourceCodeInput.value = ''; updateSourceCodeCount(); }
  const sourceCodeType = document.getElementById('source-code-type');
  if (sourceCodeType) sourceCodeType.value = 'plain';
  usernameInput.value = 'anonymous';
  const visSelect = document.getElementById('visibility-select');
  if (visSelect) visSelect.value = 'public';
  stopCamera();
  stopRecording();
  const cameraContainer = document.getElementById('camera-container');
  const dropzoneText = document.getElementById('dropzone-text');
  if (cameraContainer) cameraContainer.style.display = 'none';
  if (dropzoneText) { dropzoneText.style.display = 'block'; dropzoneText.textContent = 'Drop image here or click to browse'; }
  document.querySelector('#upload-image-panel .upload-tab[data-source="browse"]')?.classList.add('active');
  document.querySelector('#upload-image-panel .upload-tab[data-source="camera"]')?.classList.remove('active');
  document.getElementById('sound-upload-panel')?.style.setProperty('display', '');
  document.getElementById('sound-record-panel')?.style.setProperty('display', 'none');
  document.querySelector('#upload-audio-panel .upload-tab[data-source="upload"]')?.classList.add('active');
  document.querySelector('#upload-audio-panel .upload-tab[data-source="record"]')?.classList.remove('active');
  if (soundDropzoneText) soundDropzoneText.textContent = 'Drop audio or video here or click to browse';
  const recordStatus = document.getElementById('record-status');
  if (recordStatus) recordStatus.textContent = 'Allow microphone access to record.';
  submitUpload.disabled = true;
  submitUpload.textContent = 'Upload';
}

document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const isImage = isImageTabActive();
  if (isImage && !selectedFile) return;
  if (!isImage && !selectedSoundFile) return;

  submitUpload.disabled = true;
  if (isImage) {
    submitUpload.textContent = 'Computing hash…';
  } else {
    submitUpload.textContent = 'Uploading…';
  }

  if (!isImage) {
    try {
      const objectUrl = URL.createObjectURL(selectedSoundFile);
      const duration = await new Promise((res) => {
        const a = new Audio();
        a.onloadedmetadata = () => res(a.duration);
        a.onerror = () => res(0);
        a.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      if (duration > 30) {
        alert('Audio must be 30 seconds or less');
        submitUpload.disabled = false;
        submitUpload.textContent = 'Upload';
        return;
      }
      const form = new FormData();
      form.append('audio', selectedSoundFile);
      form.append('caption', captionInput.value || '');
      form.append('visibility', document.getElementById('visibility-select')?.value || 'public');
      form.append('duration', Math.round(duration));
      const res = await fetch(`${API}/upload-sound`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + authToken },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      uploadModal.close();
      resetUploadForm();
      if (data.hash) window.location.href = `/sound.html#${data.hash}`;
      else loadFeed();
    } catch (err) {
      alert(err.message);
    }
    submitUpload.disabled = false;
    submitUpload.textContent = 'Upload';
    return;
  }

  try {
    submitUpload.textContent = 'Computing hash & Babelia…';
    const imageForHash = await (typeof ensureCanvasCompatible === 'function' ? ensureCanvasCompatible(selectedFile) : Promise.resolve(selectedFile));
    const [imageHash, babelia, exifData] = await Promise.all([
      hashImageAtSize(imageForHash),
      computeBabelia(imageForHash),
      typeof exifr !== 'undefined' ? exifr.parse(selectedFile).catch(() => null) : null,
    ]);
    const { babelHash, pngBlob, width: babelW, height: babelH } = babelia;
    const width = (babelW && babelW > 0) ? babelW : (exifData?.ImageWidth ?? exifData?.['Image.ImageWidth']);
    const height = (babelH && babelH > 0) ? babelH : (exifData?.ImageHeight ?? exifData?.['Image.ImageHeight']);

    submitUpload.textContent = 'Uploading…';
    const exifBase64 = exifData ? btoa(JSON.stringify(exifData, (k, v) => (typeof v === 'bigint' ? String(v) : v))) : null;
    const pngBase64 = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result?.split(',')[1] || null);
      r.readAsDataURL(pngBlob);
    });

    const form = new FormData();
    form.append('image', selectedFile);
    form.append('imageHash', imageHash);
    form.append('babelHash', babelHash);
    form.append('babeliaPng', pngBase64 || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    if (exifBase64) form.append('exif', exifBase64);
    form.append('width', String(width || ''));
    form.append('height', String(height || ''));
    form.append('caption', captionInput.value || '');
    const sc = document.getElementById('source-code-input')?.value?.trim();
    if (sc) {
      form.append('sourceCode', sc);
      const codeType = document.getElementById('source-code-type')?.value || 'plain';
      form.append('sourceCodeType', codeType);
    }
    form.append('username', usernameInput.value || 'anonymous');
    form.append('visibility', document.getElementById('visibility-select')?.value || 'public');

    const headers = {};
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    const res = await fetch(`${API}/upload`, { method: 'POST', body: form, headers });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) data = { ...data, error: data.error || res.statusText || 'Upload failed' };
    if (res.status === 401) {
      authModal.showModal();
      document.getElementById('auth-logged-in').style.display = 'none';
      document.getElementById('auth-forms').style.display = 'block';
    }
    if (data.success) {
      uploadModal.close();
      loadFeed();
    } else {
      alert(data.error || 'Upload failed');
    }
  } catch (err) {
    alert('Upload failed: ' + err.message);
  } finally {
    submitUpload.disabled = false;
    submitUpload.textContent = 'Upload';
  }
});

// View by hash (button may be absent if using nav dropdown link)
document.getElementById('btn-view-hash')?.addEventListener('click', () => {
  hashModal.showModal();
  hashInput.value = '';
  hashResult.innerHTML = '';
  hashInput.focus();
});

// Babelia lookup: compute location via API
const hashDropzone = document.getElementById('hash-dropzone');
hashDropzone.addEventListener('dragover', (e) => { e.preventDefault(); hashDropzone.classList.add('dragover'); });
hashDropzone.addEventListener('dragleave', () => hashDropzone.classList.remove('dragover'));
hashDropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  hashDropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (!file || !isImageFile(file)) return;
  hashResult.innerHTML = '<p class="loading">Computing hash + Babelia location…</p>';
  try {
    const [imageHash, babelia] = await Promise.all([
      hashImageAtSize(file),
      computeBabelia(file),
    ]);
    const babelHash = babelia.babelHash;
    hashInput.value = babelHash;

    const existsRes = await fetch(`${API}/exists/${imageHash}`);
    const existsData = existsRes.ok ? await existsRes.json() : null;
    const byBabel = existsData?.exists
      ? existsData
      : await fetch(`${API}/exists/${babelHash}`).then((r) => (r.ok ? r.json() : null));
    const data = byBabel?.exists ? byBabel : existsData || { exists: false, num: null, post: null };

    const thumbSrc = (typeof generateImageFromBabelHash === 'function' && babelHash)
      ? generateImageFromBabelHash(babelHash, 120)
      : (data.exists && babelHash ? `/i/${babelHash}?w=120` : null);
    hashResult.innerHTML = `
      ${thumbSrc ? `<img src="${thumbSrc}" alt="Thumbnail" style="max-width:120px;max-height:120px;border-radius:8px;margin-bottom:12px">` : ''}
      <p class="success">Image hash: ${(imageHash || '').slice(0, 16)}…</p>
      <p class="success">Babelia: ${(babelHash || '').slice(0, 16)}…</p>
      <p>${data.exists ? 'Found in database.' : 'Not in database.'}</p>
      ${data.post ? `<p>#${data.post.num} · ${(data.post.userId || data.post.username) ? `<a href="/u/${encodeURIComponent(data.post.userId || data.post.username)}">@${escapeHtml(data.post.username || '')}</a>` : `@${escapeHtml(data.post.username || '')}`} · <a href="/i/n/${data.post.num}">View</a></p>` : ''}
    `;
  } catch (err) {
    hashResult.innerHTML = '<p class="error">Failed to compute location.</p>';
  }
});

document.getElementById('cancel-hash').addEventListener('click', () => hashModal.close());
document.getElementById('close-hash')?.addEventListener('click', () => hashModal.close());

document.getElementById('hash-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = hashInput.value.trim().toLowerCase();
  const byNum = /^\d+$/.test(input);
  const byHash = input.length === 64 && /^[a-f0-9]+$/.test(input);

  if (!byNum && !byHash) {
    hashResult.innerHTML = '<p class="error">Enter a number (#) or 64-char hex hash.</p>';
    return;
  }

  hashResult.innerHTML = '<p class="loading">Loading…</p>';

  try {
    const postUrl = byNum ? `${API}/post/n/${input}` : `${API}/post/${input}`;
    const postRes = await fetch(postUrl);
    const postResData = postRes.ok ? (await postRes.json().catch(() => null)) : null;
    const babelHash = postResData?.babeliaLocation || postResData?.hash || (byHash ? input : null);

    const img = document.createElement('img');
    img.src = postResData?.num ? `/i/n/${postResData.num}` : (babelHash ? `/i/${babelHash}` : (byNum ? `/i/n/${input}` : `/i/${input}`));
    img.alt = 'Image';
    img.onload = () => hashResult.querySelector('.loading')?.remove();
    img.onerror = () => {
      const el = hashResult.querySelector('.loading');
      if (el) el.textContent = 'Image not found.';
    };

    const meta = document.createElement('div');
    meta.innerHTML = `
      <p class="success">#${postResData?.num ?? '?'} · ${(babelHash || input)?.slice(0, 16) ?? input}…</p>
      ${postResData ? `<p>${(postResData.userId || postResData.username) ? `<a href="/u/${encodeURIComponent(postResData.userId || postResData.username)}">@${escapeHtml(postResData.username || '')}</a>` : `@${escapeHtml(postResData.username || '')}`} — ${escapeHtml(postResData.caption || '')}</p>` : ''}
    `;

    hashResult.appendChild(img);
    hashResult.appendChild(meta);
  } catch (err) {
    hashResult.innerHTML = '<p class="error">Failed to retrieve image.</p>';
  }
});

// Close post modal
document.getElementById('close-post').addEventListener('click', () => postModal.close());
postModal.addEventListener('click', (e) => {
  if (e.target === postModal) postModal.close();
});

// Auth
async function checkAuth() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: 'Bearer ' + authToken } });
    const data = res.ok ? await res.json() : {};
    currentUser = data.user || null;
    if (!currentUser) {
      authToken = null;
      localStorage.removeItem('tchoff_token');
    }
    document.getElementById('btn-auth').title = currentUser ? '@' + currentUser.username : 'Sign in / Account';
    if (currentUser && window.ThemeLoader?.syncFromServer) ThemeLoader.syncFromServer();
  } catch {
    authToken = null;
  }
}

function updateDisableAccountUI() {
  const pendingWrap = document.getElementById('disable-pending-wrap');
  const requestWrap = document.getElementById('disable-request-wrap');
  const pendingMsg = document.getElementById('disable-pending-msg');
  if (!pendingWrap || !requestWrap) return;
  const at = currentUser?.disableRequestedAt;
  if (at) {
    const d = new Date(at);
    d.setDate(d.getDate() + 30);
    pendingMsg.textContent = 'Account will be disabled on ' + d.toLocaleDateString() + '. Your content will be hidden. Cancel before then to keep your account active.';
    pendingWrap.style.display = 'block';
    requestWrap.style.display = 'none';
  } else {
    pendingWrap.style.display = 'none';
    requestWrap.style.display = 'block';
  }
}

document.getElementById('btn-auth').addEventListener('click', () => {
  if (currentUser) {
    document.getElementById('auth-logged-in').style.display = 'block';
    document.getElementById('auth-forms').style.display = 'none';
    document.getElementById('auth-username-display').textContent = '@' + (currentUser.username || 'user');
    document.getElementById('auth-username-edit').style.display = 'none';
    updateDisableAccountUI();
    loadFriends();
  } else {
    document.getElementById('auth-logged-in').style.display = 'none';
    document.getElementById('auth-forms').style.display = 'block';
  }
  authModal.showModal();
});
document.getElementById('btn-logout').addEventListener('click', () => {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('tchoff_token');
  authModal.close();
  document.getElementById('btn-auth').title = 'Sign in / Account';
});
document.getElementById('btn-edit-username').addEventListener('click', () => {
  document.getElementById('auth-username-edit').style.display = 'block';
  document.getElementById('auth-username-input').value = currentUser?.username || '';
});
document.getElementById('auth-username-cancel').addEventListener('click', () => {
  document.getElementById('auth-username-edit').style.display = 'none';
});

document.getElementById('btn-change-password').addEventListener('click', () => {
  document.getElementById('auth-password-edit').style.display = 'block';
  document.getElementById('auth-old-password').value = '';
  document.getElementById('auth-new-password').value = '';
  document.getElementById('auth-new-password-confirm').value = '';
});
document.getElementById('auth-password-cancel').addEventListener('click', () => {
  document.getElementById('auth-password-edit').style.display = 'none';
});
document.getElementById('auth-password-save').addEventListener('click', async () => {
  const oldPw = document.getElementById('auth-old-password').value;
  const newPw = document.getElementById('auth-new-password').value;
  const confirmPw = document.getElementById('auth-new-password-confirm').value;
  if (!oldPw) { alert('Enter your current password'); return; }
  if (!newPw) { alert('Enter a new password'); return; }
  if (newPw !== confirmPw) { alert('New passwords do not match'); return; }
  if (newPw.length < 10) { alert('New password must be at least 10 characters'); return; }
  if (!/[a-zA-Z]/.test(newPw)) { alert('New password must contain at least one letter'); return; }
  if (!/[0-9]/.test(newPw)) { alert('New password must contain at least one number'); return; }
  try {
    const res = await fetch(`${API}/auth/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
      body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    document.getElementById('auth-password-edit').style.display = 'none';
    document.getElementById('auth-old-password').value = '';
    document.getElementById('auth-new-password').value = '';
    document.getElementById('auth-new-password-confirm').value = '';
    alert('Password updated.');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('btn-disable-account').addEventListener('click', async () => {
  if (!confirm('Your account will be disabled in 30 days. Your content will be hidden from everyone. Data is retained. Cancel before the date to keep your account. Continue?')) return;
  try {
    const res = await fetch(`${API}/auth/me/disable-request`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + authToken } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    await checkAuth();
    updateDisableAccountUI();
    alert(data.message || 'Account will be disabled in 30 days.');
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById('btn-cancel-disable')?.addEventListener('click', async () => {
  try {
    const res = await fetch(`${API}/auth/me/cancel-disable`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + authToken } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    await checkAuth();
    updateDisableAccountUI();
    alert(data.message || 'Account disable cancelled.');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('auth-username-save').addEventListener('click', async () => {
  const username = document.getElementById('auth-username-input').value.trim().replace(/\s/g, '_');
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    alert('Username must be 3–30 chars, letters, numbers, underscores only');
    return;
  }
  try {
    const res = await fetch(`${API}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update');
    currentUser = { ...currentUser, username };
    document.getElementById('auth-username-display').textContent = '@' + username;
    document.getElementById('auth-username-edit').style.display = 'none';
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById('cancel-auth').addEventListener('click', () => authModal.close());
    document.getElementById('cancel-auth-signup').addEventListener('click', () => authModal.close());
    document.getElementById('close-auth')?.addEventListener('click', () => authModal.close());

async function loadFriends() {
  if (!authToken) return;
  const listEl = document.getElementById('friends-list');
  const pendingEl = document.getElementById('pending-requests');
  if (!listEl || !pendingEl) return;
  try {
    const res = await fetch(`${API}/friends`, { headers: { Authorization: 'Bearer ' + authToken } });
    const data = res.ok ? await res.json() : { friends: [], pending: [] };
    listEl.innerHTML = (data.friends || []).map((f) =>
      `<div class="friend-item"><a href="/u/${encodeURIComponent(f.username || f.userId)}" class="friend-profile">@${escapeHtml(f.username)}</a> <a href="#" class="friend-remove" data-user-id="${f.userId}">Remove</a></div>`
    ).join('') || '<p class="friends-empty">No friends yet</p>';
    pendingEl.innerHTML = (data.pending || []).map((p) =>
      `<div class="friend-item"><a href="/u/${encodeURIComponent(p.fromUsername)}" class="friend-profile">@${escapeHtml(p.fromUsername)}</a> requested · <a href="#" class="friend-accept" data-from-id="${p.fromUserId}">Accept</a> <a href="#" class="friend-decline" data-from-id="${p.fromUserId}">Decline</a></div>`
    ).join('') || '';
    listEl.querySelectorAll('.friend-remove').forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await fetch(`${API}/friends/${a.dataset.userId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + authToken } });
          loadFriends();
        } catch (_) {}
      });
    });
    pendingEl.querySelectorAll('.friend-accept').forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await fetch(`${API}/friends/request/${a.dataset.fromId}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + authToken } });
          loadFriends();
        } catch (_) {}
      });
    });
    pendingEl.querySelectorAll('.friend-decline').forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await fetch(`${API}/friends/${a.dataset.fromId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + authToken } });
          loadFriends();
        } catch (_) {}
      });
    });
  } catch (_) {
    listEl.innerHTML = '<p class="friends-empty">Failed to load</p>';
  }
}

let friendSearchTimeout = null;
document.getElementById('add-friend-username')?.addEventListener('input', () => {
  const input = document.getElementById('add-friend-username');
  const resultsEl = document.getElementById('friend-search-results');
  const q = (input?.value || '').trim().replace(/^@/, '');
  clearTimeout(friendSearchTimeout);
  if (!q || q.length < 2) {
    resultsEl.style.display = 'none';
    return;
  }
  friendSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/users/search?q=${encodeURIComponent(q)}`);
      const data = res.ok ? await res.json() : { users: [] };
      const users = data.users || [];
      if (users.length === 0) {
        resultsEl.innerHTML = '<div class="friend-search-result-item" style="color:var(--text-muted)">No users found</div>';
      } else {
        resultsEl.innerHTML = users.map((u) =>
          `<button type="button" class="friend-search-result-item" data-username="${escapeHtml(u.username)}">@${escapeHtml(u.username)}</button>`
        ).join('');
        resultsEl.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            input.value = '@' + btn.dataset.username;
            resultsEl.style.display = 'none';
          });
        });
      }
      resultsEl.style.display = 'block';
    } catch (_) {
      resultsEl.style.display = 'none';
    }
  }, 250);
});
document.getElementById('add-friend-username')?.addEventListener('blur', () => {
  setTimeout(() => {
    document.getElementById('friend-search-results').style.display = 'none';
  }, 150);
});

document.getElementById('btn-add-friend')?.addEventListener('click', async () => {
  const input = document.getElementById('add-friend-username');
  const username = (input?.value || '').trim().replace(/^@/, '');
  if (!username || !authToken) return;
  try {
    const res = await fetch(`${API}/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    input.value = '';
    document.getElementById('friend-search-results').style.display = 'none';
    loadFriends();
    alert(data.status === 'accepted' ? 'You are now friends!' : 'Friend request sent');
  } catch (err) {
    alert(err.message);
  }
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const errEl = document.getElementById('auth-signup-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
    tab.classList.add('active');
    const form = document.getElementById('auth-' + tab.dataset.tab + '-form');
    if (form) form.classList.add('active');
  });
});

document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const password = document.getElementById('auth-password').value;
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
    if (!data.token) throw new Error('Session could not be established. Please try again.');
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('tchoff_token', authToken);
    authModal.close();
    document.getElementById('btn-auth').title = '@' + (currentUser.username || '');
    if (window.ThemeLoader?.syncFromServer) ThemeLoader.syncFromServer();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('auth-signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  let username = document.getElementById('signup-username').value.trim().replace(/\s/g, '_') || (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  if (username.length < 3) username = ((username || 'u') + '00').slice(0, 3);
  const password = document.getElementById('signup-password').value;
  if (password.length < 6) { alert('Password must be at least 6 characters'); return; }
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    alert('Username must be 3–30 chars, letters, numbers, underscores only');
    return;
  }
  const errEl = document.getElementById('auth-signup-error');
  if (errEl) errEl.style.display = 'none';
  try {
    const res = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || `Signup failed (${res.status})`;
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      if (msg.includes('already registered')) {
        document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
        document.querySelector('.auth-tab[data-tab="login"]')?.classList.add('active');
        document.getElementById('auth-login-form')?.classList.add('active');
        document.getElementById('auth-email').value = email;
        document.getElementById('auth-password').value = '';
        if (errEl) errEl.textContent = 'That email is already registered. Switch to Log in to sign in.';
      }
      alert(msg);
      return;
    }
    if (!data.token) {
      const msg = 'Account created but sessions are not configured. Please log in.';
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
      document.querySelector('.auth-tab[data-tab="login"]')?.classList.add('active');
      document.getElementById('auth-login-form')?.classList.add('active');
      document.getElementById('auth-email').value = email;
      alert(msg);
      return;
    }
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('tchoff_token', authToken);
    authModal.close();
    document.getElementById('btn-auth').title = '@' + (currentUser.username || '');
    if (window.ThemeLoader?.syncFromServer) ThemeLoader.syncFromServer();
  } catch (err) {
    alert(err.message || 'Something went wrong. Please try again.');
  }
});

// Passkey login
document.getElementById('btn-login-passkey')?.addEventListener('click', async () => {
  if (typeof SimpleWebAuthnBrowser === 'undefined' || !SimpleWebAuthnBrowser?.startAuthentication) {
    alert('Passkeys are not supported in this browser.');
    return;
  }
  const email = document.getElementById('auth-email')?.value?.trim().toLowerCase() || '';
  try {
    const optsRes = await fetch(`${API}/auth/passkey/login/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email ? { email } : {}),
    });
    const options = await optsRes.json();
    if (!optsRes.ok) throw new Error(options.error || 'Could not get passkey options');
    const credential = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
    const verifyRes = await fetch(`${API}/auth/passkey/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response: credential,
        expectedChallenge: options.challenge,
      }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Passkey verification failed');
    if (!data.token) throw new Error('Session could not be established');
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('tchoff_token', authToken);
    authModal.close();
    document.getElementById('btn-auth').title = '@' + (currentUser.username || '');
    if (window.ThemeLoader?.syncFromServer) ThemeLoader.syncFromServer();
    loadFeed(1);
  } catch (err) {
    if (err?.code === 'ERROR_CEREMONY_ABORTED') return;
    alert(err.message || 'Passkey sign-in failed');
  }
});

// Add passkey (when logged in)
document.getElementById('btn-add-passkey')?.addEventListener('click', async () => {
  if (!authToken) return;
  if (typeof SimpleWebAuthnBrowser === 'undefined' || !SimpleWebAuthnBrowser?.startRegistration) {
    alert('Passkeys are not supported in this browser.');
    return;
  }
  try {
    const optsRes = await fetch(`${API}/auth/passkey/register/options`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
    });
    const options = await optsRes.json();
    if (!optsRes.ok) throw new Error(options.error || 'Could not get passkey options');
    const credential = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
    const verifyRes = await fetch(`${API}/auth/passkey/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
      body: JSON.stringify({
        response: credential,
        expectedChallenge: options.challenge,
      }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Passkey registration failed');
    alert('Passkey added! You can now sign in with it.');
  } catch (err) {
    if (err?.code === 'ERROR_CEREMONY_ABORTED') return;
    alert(err.message || 'Could not add passkey');
  }
});

// Init
const pageParam = parseInt(new URLSearchParams(window.location.search).get('page'), 10) || 1;
loadFeed(pageParam);
checkAuth().then(() => {
  if (currentUser) {
    document.getElementById('username-wrap').style.display = 'none';
  } else {
    document.getElementById('username-wrap').style.display = 'block';
  }
});

uploadModal.addEventListener('close', () => {
  stopCamera();
  stopRecording();
  resetUploadForm();
});

function openUploadModalFromHash() {
  const hash = window.location.hash.slice(1).toLowerCase();
  if (hash === 'upload' || hash === 'upload-audio') {
    if (!authToken) {
      authModal.showModal();
      document.getElementById('auth-logged-in').style.display = 'none';
      document.getElementById('auth-forms').style.display = 'block';
    } else {
      switchUploadMediaTab(hash === 'upload-audio' ? 'audio' : 'image');
      uploadModal.showModal();
      resetUploadForm();
    }
  }
}

// Loading screen: 5s splash then fade out, then show modals
function runAfterLoadingScreen(callback) {
  const el = document.getElementById('loading-screen');
  if (!el) { callback(); return; }
  setTimeout(() => {
    el.classList.add('hidden');
    setTimeout(() => {
      el.remove();
      callback();
    }, 1200);
  }, 5000);
}

function openModalFromHashOrAuth() {
  const hash = window.location.hash.slice(1).toLowerCase();
  if (hash === 'upload' || hash === 'upload-audio') {
    if (!authToken) {
      authModal.showModal();
      document.getElementById('auth-logged-in').style.display = 'none';
      document.getElementById('auth-forms').style.display = 'block';
    } else {
      switchUploadMediaTab(hash === 'upload-audio' ? 'audio' : 'image');
      uploadModal.showModal();
      resetUploadForm();
    }
    history.replaceState(null, '', window.location.pathname);
  } else if (hash === 'hash') {
    hashModal.showModal();
    hashInput.value = '';
    hashResult.innerHTML = '';
    hashInput.focus();
    history.replaceState(null, '', window.location.pathname);
  } else if (hash === 'auth') {
    authModal.showModal();
    history.replaceState(null, '', window.location.pathname);
  } else if (!authToken) {
    authModal.showModal();
    document.getElementById('auth-logged-in').style.display = 'none';
    document.getElementById('auth-forms').style.display = 'block';
  }
}

runAfterLoadingScreen(openModalFromHashOrAuth);

window.addEventListener('hashchange', () => {
  const h = window.location.hash.slice(1).toLowerCase();
  if (h === 'upload' || h === 'upload-audio') openUploadModalFromHash();
});
