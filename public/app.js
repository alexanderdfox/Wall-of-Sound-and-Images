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

let selectedFile = null;
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
        <div class="post-stats">👍 ${post.likeCount ?? 0} · 💬 ${post.commentCount ?? 0}</div>
        <div class="post-hash" title="${post.babeliaLocation || post.hash || ''}">#${post.num || '?'} · ${(post.babeliaLocation || post.hash || '').slice(0, 12)}…</div>
        ${(post.width && post.height) ? `<div class="post-meta-small">${post.width}×${post.height}</div>` : ''}
        ${(post.createdAt || post.originIp) ? `<div class="post-meta-small">${post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}${post.createdAt && post.originIp ? ' · ' : ''}${post.originIp || ''}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => openPost(post, postModal, lightboxBody));
    feedGrid.appendChild(card);
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
document.getElementById('btn-upload').addEventListener('click', () => {
  if (!authToken) {
    authModal.showModal();
    document.getElementById('auth-logged-in').style.display = 'none';
    document.getElementById('auth-forms').style.display = 'block';
    return;
  }
  uploadModal.showModal();
  resetUploadForm();
});

document.getElementById('cancel-upload').addEventListener('click', () => {
  stopCamera();
  uploadModal.close();
});

dropzone.addEventListener('click', (e) => {
  if (e.target.closest('#camera-container')) return;
  if (document.getElementById('camera-container')?.style.display === 'block') return;
  fileInput.click();
});

const isMobileDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

document.querySelectorAll('.upload-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.upload-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const source = tab.dataset.source;
    const dropzoneText = document.getElementById('dropzone-text');
    const cameraContainer = document.getElementById('camera-container');
    const cameraInput = document.getElementById('camera-input');
    if (source === 'camera') {
      if (isMobileDevice() && cameraInput) {
        stopCamera();
        cameraContainer.style.display = 'none';
        dropzoneText.style.display = 'block';
        dropzoneText.textContent = 'Tap Take Photo to open camera…';
        cameraInput.click();
      } else {
        dropzoneText.style.display = 'none';
        cameraContainer.style.display = 'block';
        startCamera();
      }
    } else {
      stopCamera();
      cameraContainer.style.display = 'none';
      dropzoneText.style.display = 'block';
      dropzoneText.textContent = 'Drop image here or click to browse';
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

function setFile(file) {
  selectedFile = file;
  dropzone.querySelector('.dropzone-text').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  submitUpload.disabled = false;
}

function resetUploadForm() {
  selectedFile = null;
  fileInput.value = '';
  captionInput.value = '';
  usernameInput.value = 'anonymous';
  const visSelect = document.getElementById('visibility-select');
  if (visSelect) visSelect.value = 'public';
  stopCamera();
  document.getElementById('camera-container').style.display = 'none';
  document.getElementById('dropzone-text').style.display = 'block';
  document.querySelector('.upload-tab[data-source="browse"]')?.classList.add('active');
  document.querySelector('.upload-tab[data-source="camera"]')?.classList.remove('active');
  dropzone.querySelector('.dropzone-text').textContent = 'Drop image here or click to browse';
  submitUpload.disabled = true;
}

document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return;

  submitUpload.disabled = true;
  submitUpload.textContent = 'Computing hash…';

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

// View by hash
document.getElementById('btn-view-hash').addEventListener('click', () => {
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
      ${data.post ? `<p>#${data.post.num} · @${data.post.username} · <a href="/i/n/${data.post.num}">View</a></p>` : ''}
    `;
  } catch (err) {
    hashResult.innerHTML = '<p class="error">Failed to compute location.</p>';
  }
});

document.getElementById('cancel-hash').addEventListener('click', () => hashModal.close());

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
      ${postResData ? `<p>@${postResData.username} — ${escapeHtml(postResData.caption || '')}</p>` : ''}
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
  } catch {
    authToken = null;
  }
}

document.getElementById('btn-auth').addEventListener('click', () => {
  if (currentUser) {
    document.getElementById('auth-logged-in').style.display = 'block';
    document.getElementById('auth-forms').style.display = 'none';
    document.getElementById('auth-username-display').textContent = '@' + (currentUser.username || 'user');
    document.getElementById('auth-username-edit').style.display = 'none';
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
  } catch (err) {
    alert(err.message || 'Something went wrong. Please try again.');
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

// Open modal from hash link (e.g. /#upload, /#hash)
const hash = window.location.hash.slice(1);
if (hash === 'upload') {
  uploadModal.showModal();
  resetUploadForm();
  history.replaceState(null, '', window.location.pathname);
} else if (hash === 'hash') {
  hashModal.showModal();
  hashInput.value = '';
  hashResult.innerHTML = '';
  hashInput.focus();
  history.replaceState(null, '', window.location.pathname);
}
