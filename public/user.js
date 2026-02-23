const PER_PAGE = 40;
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
      fetch(`${API}/user/${userId}/sounds?page=1&per=${PER_PAGE}`, { headers }),
    ]);

    const userData = userRes.ok ? await userRes.json() : null;
    const imagesData = imagesRes.ok ? await imagesRes.json() : { items: [], total: 0 };
    const soundsData = soundsRes.ok ? await soundsRes.json() : { items: [], total: 0 };
    const sounds = soundsData.items || [];
    const soundsTotal = soundsData.total ?? sounds.length;

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
        <span>${soundsTotal} sounds</span>
        <button type="button" class="user-stat-link" data-type="followers">${userData.followerCount ?? 0} followers</button>
        <button type="button" class="user-stat-link" data-type="following">${userData.followingCount ?? 0} following</button>
      </div>
    `;

    renderSoundsGrid(document.getElementById('sounds-grid'), sounds, userData.username);
    const soundsEmptyState = document.getElementById('sounds-empty-state');
    const soundsPaginationEl = document.getElementById('sounds-pagination');
    if (soundsEmptyState) soundsEmptyState.style.display = sounds.length ? 'none' : 'block';
    renderSoundsPagination(soundsPaginationEl, soundsTotal, 1, userId);

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
    document.getElementById('empty-state').style.display = (data.items?.length || 0) === 0 ? 'block' : 'none';
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
  }
}

async function loadSoundsPage(page) {
  const userId = getUserIdFromPath();
  if (!userId) return;

  const grid = document.getElementById('sounds-grid');
  const paginationEl = document.getElementById('sounds-pagination');
  const emptyState = document.getElementById('sounds-empty-state');
  const userInfoEl = document.getElementById('user-info');
  const username = userInfoEl?.querySelector('.user-username')?.textContent?.replace('@', '') || 'user';

  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;
  const headers = authToken ? { Authorization: 'Bearer ' + authToken } : {};
  try {
    const res = await fetch(`${API}/user/${userId}/sounds?page=${page}&per=${PER_PAGE}`, { headers });
    const data = res.ok ? await res.json() : { items: [], total: 0 };

    renderSoundsGrid(grid, data.items || [], username);
    renderSoundsPagination(paginationEl, data.total || 0, page, userId);
    if (emptyState) emptyState.style.display = (data.items?.length || 0) === 0 ? 'block' : 'none';
    const soundsStat = userInfoEl?.querySelector('.user-stats span:nth-of-type(2)');
    if (soundsStat) soundsStat.textContent = (data.total || 0) + ' sounds';
    window.scrollTo(0, document.getElementById('sounds-section')?.offsetTop || 0);
  } catch (err) {
    console.error(err);
  }
}

function renderSoundsPagination(el, total, page, userId) {
  if (!el) return;
  el.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (totalPages <= 1) return;

  const prev = document.createElement('a');
  prev.href = page > 1 ? `/u/${userId}?soundsPage=${page - 1}` : '#';
  prev.className = 'btn btn-ghost pagination-btn' + (page <= 1 ? ' disabled' : '');
  prev.textContent = '← Previous';
  if (page <= 1) prev.onclick = (e) => e.preventDefault();
  else prev.onclick = (e) => { e.preventDefault(); loadSoundsPage(page - 1); };
  el.appendChild(prev);

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `Page ${page} of ${totalPages}`;
  el.appendChild(info);

  const next = document.createElement('a');
  next.href = page < totalPages ? `/u/${userId}?soundsPage=${page + 1}` : '#';
  next.className = 'btn btn-ghost pagination-btn' + (page >= totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  if (page >= totalPages) next.onclick = (e) => e.preventDefault();
  else next.onclick = (e) => { e.preventDefault(); loadSoundsPage(page + 1); };
  el.appendChild(next);
}

const soundModal = document.getElementById('sound-modal');
const soundModalBody = document.getElementById('sound-modal-body');

function renderSoundsGrid(gridEl, sounds, profileUsername) {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  if (!sounds.length) return;

  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;

  sounds.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'sound-card sound-card-clickable';
    const dur = s.duration ? `${s.duration}s` : '';
    card.innerHTML = `
      <div class="sound-card-wave" aria-hidden="true">🔊</div>
      <div class="sound-card-info">
        <span class="sound-card-caption">${escapeHtml(s.caption || 'Sound')}</span>
        <div class="sound-card-meta-row">
          <span class="sound-card-meta">#${s.num || '?'} ${dur ? '· ' + dur : ''}</span>
          <span class="sound-card-stats">👍 ${s.likeCount ?? 0} · 💬 ${s.commentCount ?? 0}</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openSoundModal(s, profileUsername));
    gridEl.appendChild(card);
  });
}

async function openSoundModal(sound, profileUsername) {
  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;
  soundModalBody.innerHTML = `
    <div class="sound-modal-audio">
      <audio controls src="/s/${sound.hash}" style="width:100%;max-width:480px"></audio>
    </div>
    <div class="sound-modal-meta">
      <div class="lightbox-hash">@${escapeHtml(profileUsername || 'user')} · #${sound.num || '?'}</div>
      ${sound.caption ? `<p>${escapeHtml(sound.caption)}</p>` : ''}
      <div class="lightbox-actions">
        <button type="button" class="btn-like ${sound.likedByMe ? 'liked' : ''}" data-num="${sound.num}" aria-label="Like">
          👍 <span class="like-count">${sound.likeCount ?? 0}</span>
        </button>
        <span class="lightbox-comment-count"><span class="comment-count">${sound.commentCount ?? 0}</span> comment(s)</span>
        <button type="button" class="btn-ghost btn-report" data-type="sound" data-num="${sound.num || ''}" data-hash="${escapeHtml(sound.hash || '')}" title="Report">🚩 Report</button>
      </div>
    </div>
    <div class="lightbox-comments" id="sound-comments">
      <div class="comments-list" id="sound-comments-list"></div>
      ${authToken ? `
        <div class="comment-form">
          <input type="text" id="sound-comment-input" placeholder="Add a comment…" maxlength="500">
          <button type="button" class="btn btn-primary btn-sound-comment-submit" data-num="${sound.num}">Post</button>
        </div>
      ` : '<p class="comment-hint">Sign in to comment</p>'}
    </div>
  `;
  soundModal.showModal();

  const loadSoundComments = async () => {
    try {
      const res = await fetch(`${API}/sound/n/${sound.num}/comments`);
      const data = res.ok ? await res.json() : { comments: [] };
      const list = soundModalBody.querySelector('#sound-comments-list');
      list.innerHTML = (data.comments || []).map((c) =>
        `<div class="comment">${(c.userId || c.username) ? `<a href="/u/${encodeURIComponent(c.userId || c.username || '')}" class="comment-user">@${escapeHtml(c.username || '')}</a>` : `<span class="comment-user">@${escapeHtml(c.username || '')}</span>`} ${typeof renderCommentText === 'function' ? renderCommentText(c.text) : escapeHtml(c.text)}</div>`
      ).join('') || '<p class="no-comments">No comments yet</p>';
    } catch (_) {
      soundModalBody.querySelector('#sound-comments-list').innerHTML = '<p class="no-comments">Failed to load</p>';
    }
  };
  loadSoundComments();

  soundModalBody.querySelector('.btn-like')?.addEventListener('click', async () => {
    if (!authToken) return;
    const btn = soundModalBody.querySelector('.btn-like');
    const countEl = btn?.querySelector('.like-count');
    try {
      const res = await fetch(`${API}/sound/n/${sound.num}/like`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + authToken },
      });
      const data = await res.json();
      btn.classList.toggle('liked', data.liked);
      countEl.textContent = parseInt(countEl?.textContent || '0', 10) + (data.liked ? 1 : -1);
    } catch (_) {}
  });

  const submitSoundComment = async () => {
    const input = soundModalBody.querySelector('#sound-comment-input');
    const text = input?.value?.trim();
    if (!text || !authToken) return;
    try {
      const res = await fetch(`${API}/sound/n/${sound.num}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.comments) {
        input.value = '';
        const list = soundModalBody.querySelector('#sound-comments-list');
        list.innerHTML = data.comments.map((c) =>
          `<div class="comment">${(c.userId || c.username) ? `<a href="/u/${encodeURIComponent(c.userId || c.username || '')}" class="comment-user">@${escapeHtml(c.username || '')}</a>` : `<span class="comment-user">@${escapeHtml(c.username || '')}</span>`} ${typeof renderCommentText === 'function' ? renderCommentText(c.text) : escapeHtml(c.text)}</div>`
        ).join('') || '<p class="no-comments">No comments yet</p>';
        const cc = soundModalBody.querySelector('.comment-count');
        if (cc) cc.textContent = data.comments.length;
      }
    } catch (_) {}
  };
  soundModalBody.querySelector('.btn-sound-comment-submit')?.addEventListener('click', submitSoundComment);
  soundModalBody.querySelector('#sound-comment-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitSoundComment(); }
  });

  soundModalBody.querySelector('.btn-report')?.addEventListener('click', () => {
    if (typeof openReportModal === 'function') openReportModal('sound', sound.num, sound.hash);
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
        ${(post.sourceCode || post.source_code) ? (typeof renderCodeComic === 'function' ? renderCodeComic(post.sourceCode || post.source_code, true, post.sourceCodeType || post.source_code_type) : '') : ''}
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

document.getElementById('close-sound')?.addEventListener('click', () => soundModal?.close());
soundModal?.addEventListener('click', (e) => { if (e.target === soundModal) soundModal.close(); });

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

const urlParams = new URLSearchParams(window.location.search);
const pageParam = urlParams.get('page');
const soundsPageParam = urlParams.get('soundsPage');
loadUserPage().then(() => {
  if (pageParam) loadPage(parseInt(pageParam, 10) || 1);
  if (soundsPageParam) loadSoundsPage(parseInt(soundsPageParam, 10) || 1);
});
