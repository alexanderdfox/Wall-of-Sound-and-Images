const PER_PAGE = 16;
const postModal = document.getElementById('post-modal');
const lightboxBody = document.getElementById('lightbox-body');

function getUserIdFromPath() {
  const m = window.location.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function loadUserPage() {
  const userId = getUserIdFromPath();
  if (!userId) {
    document.getElementById('user-info').innerHTML = '<p class="error">Invalid user</p>';
    return;
  }

  const grid = document.getElementById('feed-grid');
  const emptyState = document.getElementById('empty-state');
  const paginationEl = document.getElementById('pagination');
  const userInfoEl = document.getElementById('user-info');

  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;
  const headers = authToken ? { Authorization: 'Bearer ' + authToken } : {};
  try {
    const [userRes, imagesRes, soundsRes] = await Promise.all([
      fetch(`${API}/user/${userId}`),
      fetch(`${API}/user/${userId}/images?page=1&per=${PER_PAGE}`, { headers }),
      fetch(`${API}/user/${userId}/sounds`, { headers }),
    ]);

    const userData = userRes.ok ? await userRes.json() : null;
    const imagesData = imagesRes.ok ? await imagesRes.json() : { items: [], total: 0 };
    const soundsData = soundsRes.ok ? await soundsRes.json() : { items: [] };
    const sounds = soundsData.items || [];

    if (!userData) {
      userInfoEl.innerHTML = '<p class="error">User not found</p>';
      return;
    }

    let me = null;
    if (authToken) {
      const meRes = await fetch(`${API}/auth/me`, { headers: { Authorization: 'Bearer ' + authToken } });
      me = meRes.ok ? (await meRes.json())?.user : null;
    }
    const followBtn = authToken && userData.id && me?.id && me.id !== userData.id
      ? `<button type="button" class="btn btn-follow ${userData.following ? 'following' : ''}" id="follow-btn" data-user-id="${userData.id}">${userData.following ? 'Following' : 'Follow'}</button>`
      : '';
    userInfoEl.innerHTML = `
      <div class="user-header">
        <h1 class="user-username">@${escapeHtml(userData.username || 'user')}</h1>
        ${followBtn}
      </div>
      <div class="user-stats">
        <span>${imagesData.total || 0} images</span>
        <span>${sounds.length} sounds</span>
        <button type="button" class="user-stat-link" data-type="followers">${userData.followerCount ?? 0} followers</button>
        <button type="button" class="user-stat-link" data-type="following">${userData.followingCount ?? 0} following</button>
      </div>
    `;

    renderSoundsGrid(document.getElementById('sounds-grid'), sounds);
    const soundsSection = document.getElementById('sounds-section');
    if (soundsSection) soundsSection.style.display = sounds.length ? 'block' : 'none';

    renderGrid(grid, imagesData.items || []);
    emptyState.style.display = (imagesData.items?.length || 0) === 0 ? 'block' : 'none';
    renderPagination(paginationEl, imagesData.total || 0, 1, userId);
    attachUserPageListeners(userId, userData);
  } catch (err) {
    console.error(err);
    userInfoEl.innerHTML = '<p class="error">Failed to load user</p>';
  }
}

async function loadPage(page) {
  const userId = getUserIdFromPath();
  if (!userId) return;

  const grid = document.getElementById('feed-grid');
  const paginationEl = document.getElementById('pagination');

  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;
  const headers = authToken ? { Authorization: 'Bearer ' + authToken } : {};
  try {
    const res = await fetch(`${API}/user/${userId}/images?page=${page}&per=${PER_PAGE}`, { headers });
    const data = res.ok ? await res.json() : { items: [], total: 0 };

    renderGrid(grid, data.items || []);
    renderPagination(paginationEl, data.total || 0, page, userId);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
  }
}

function renderSoundsGrid(gridEl, sounds) {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  if (!sounds.length) return;

  sounds.forEach((s) => {
    const card = document.createElement('a');
    card.className = 'sound-card';
    card.href = `/sound.html#${s.hash}`;
    const dur = s.duration ? `${s.duration}s` : '';
    card.innerHTML = `
      <div class="sound-card-wave" aria-hidden="true">🔊</div>
      <div class="sound-card-info">
        <span class="sound-card-caption">${escapeHtml(s.caption || 'Sound')}</span>
        <span class="sound-card-meta">#${s.num || '?'} ${dur ? '· ' + dur : ''}</span>
      </div>
    `;
    gridEl.appendChild(card);
  });
}

function renderGrid(grid, posts) {
  grid.innerHTML = '';
  if (!posts.length) return;

  posts.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'post-card';
    const babelHash = post.babeliaLocation || post.hash;
    const imgSrc = post.num ? `/i/n/${post.num}` : (babelHash ? `/i/${babelHash}` : '');
    card.innerHTML = `
      <div class="post-image-wrap">
        <img class="post-image" src="${imgSrc}" alt="${escapeHtml(post.caption || 'Post')}" loading="lazy">
      </div>
      <div class="post-info">
        ${post.caption ? `<div class="post-caption">${escapeHtml(post.caption)}</div>` : ''}
        <div class="post-stats">👍 ${post.likeCount ?? 0} · 💬 ${post.commentCount ?? 0}</div>
        <div class="post-hash">#${post.num || '?'}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (typeof openPost === 'function') openPost(post, postModal, lightboxBody);
    });
    grid.appendChild(card);
  });
}

function renderPagination(el, total, page, userId) {
  el.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (totalPages <= 1) return;

  const prev = document.createElement('a');
  prev.href = page > 1 ? `/u/${userId}?page=${page - 1}` : '#';
  prev.className = 'btn btn-ghost pagination-btn' + (page <= 1 ? ' disabled' : '');
  prev.textContent = '← Previous';
  if (page <= 1) prev.onclick = (e) => e.preventDefault();
  else prev.onclick = (e) => { e.preventDefault(); loadPage(page - 1); };
  el.appendChild(prev);

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `Page ${page} of ${totalPages}`;
  el.appendChild(info);

  const next = document.createElement('a');
  next.href = page < totalPages ? `/u/${userId}?page=${page + 1}` : '#';
  next.className = 'btn btn-ghost pagination-btn' + (page >= totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  if (page >= totalPages) next.onclick = (e) => e.preventDefault();
  else next.onclick = (e) => { e.preventDefault(); loadPage(page + 1); };
  el.appendChild(next);
}

document.getElementById('close-post').addEventListener('click', () => postModal.close());
postModal.addEventListener('click', (e) => { if (e.target === postModal) postModal.close(); });

document.getElementById('close-follow-modal')?.addEventListener('click', () => {
  document.getElementById('follow-modal')?.close();
});

function attachUserPageListeners(userId, userData) {
  document.getElementById('follow-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('follow-btn');
    const token = localStorage.getItem('tchoff_token');
    if (!token || !btn) return;
    const isFollowing = btn.classList.contains('following');
    try {
      const res = await fetch(`${API}/follow/${userId}`, {
        method: isFollowing ? 'DELETE' : 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) throw new Error('Failed');
      btn.classList.toggle('following');
      btn.textContent = isFollowing ? 'Follow' : 'Following';
      userData.following = !isFollowing;
      const stats = document.querySelector('.user-stats');
      if (stats) {
        const followersEl = stats.querySelector('[data-type="followers"]');
        if (followersEl) {
          const n = parseInt(followersEl.textContent, 10) || 0;
          followersEl.textContent = (n + (isFollowing ? -1 : 1)) + ' followers';
        }
      }
    } catch (_) {}
  });

  document.querySelectorAll('.user-stat-link').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const modal = document.getElementById('follow-modal');
      const titleEl = document.getElementById('follow-modal-title');
      const listEl = document.getElementById('follow-modal-list');
      if (!modal || !titleEl || !listEl) return;
      titleEl.textContent = type === 'followers' ? 'Followers' : 'Following';
      listEl.innerHTML = '<p class="loading">Loading…</p>';
      modal.showModal();
      try {
        const res = await fetch(`${API}/user/${userId}/${type}`);
        const data = res.ok ? await res.json() : { [type]: [] };
        const items = data[type] || [];
        listEl.innerHTML = items.length
          ? items.map((u) => `<a href="/u/${encodeURIComponent(u.username || u.userId)}" class="follow-list-item">@${escapeHtml(u.username)}</a>`).join('')
          : '<p class="no-comments">No ' + type + ' yet</p>';
      } catch (_) {
        listEl.innerHTML = '<p class="error">Failed to load</p>';
      }
    });
  });
}

const pageParam = new URLSearchParams(window.location.search).get('page');
loadUserPage().then(() => {
  if (pageParam) loadPage(parseInt(pageParam, 10) || 1);
});
