const API = '/api';

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function openPost(post, postModal, lightboxBody) {
  const modal = postModal || document.getElementById('post-modal');
  const body = lightboxBody || document.getElementById('lightbox-body');
  const babelHash = post.babeliaLocation || post.hash;
  const imgSrc = post.num ? `/i/n/${post.num}` : (babelHash ? `/i/${babelHash}` : post.imageUrl || '');
  const userEl = post.userId ? `<a href="/u/${post.userId}" class="post-user post-user-link">@${escapeHtml(post.username || '')}</a>` : `<div class="post-user">@${escapeHtml(post.username || '')}</div>`;
  const likeCount = post.likeCount ?? 0;
  const commentCount = post.commentCount ?? 0;
  const likedByMe = post.likedByMe ?? false;
  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;

  body.innerHTML = `
    <div class="lightbox-image-wrap">
      <img class="lightbox-image" src="${imgSrc}" alt="${escapeHtml(post.caption || '')}">
    </div>
    <div class="lightbox-meta">
      ${userEl}
      ${post.caption ? `<p>${escapeHtml(post.caption)}</p>` : ''}
      <div class="lightbox-actions">
        <button type="button" class="btn-like ${likedByMe ? 'liked' : ''}" data-num="${post.num}" aria-label="Like">
          👍 <span class="like-count">${likeCount}</span>
        </button>
        <span class="lightbox-comment-count">${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="lightbox-hash">#${post.num || '?'} · ${(post.babeliaLocation || post.hash || '').slice(0, 16)}…</div>
      ${(post.width && post.height) ? `<div class="lightbox-meta-extra">Original: ${post.width}×${post.height} px</div>` : ''}
      ${(post.createdAt || post.originIp) ? `<div class="lightbox-meta-extra">${post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}${post.createdAt && post.originIp ? ' · ' : ''}${post.originIp || ''}</div>` : ''}
    </div>
    <div class="lightbox-comments" id="lightbox-comments">
      <div class="comments-list" id="comments-list"></div>
      ${authToken ? `
        <div class="comment-form">
          <input type="text" id="comment-input" placeholder="Add a comment…" maxlength="500">
          <button type="button" class="btn btn-primary btn-comment-submit" data-num="${post.num}">Post</button>
        </div>
      ` : '<p class="comment-hint">Sign in to comment</p>'}
    </div>
  `;

  modal.showModal();

  const commentsList = body.querySelector('#comments-list');
  const loadComments = async () => {
    try {
      const res = await fetch(`${API}/post/n/${post.num}/comments`);
      const data = res.ok ? await res.json() : { comments: [] };
      commentsList.innerHTML = (data.comments || []).map((c) =>
        `<div class="comment"><span class="comment-user">@${escapeHtml(c.username || '')}</span> ${escapeHtml(c.text)}</div>`
      ).join('') || '<p class="no-comments">No comments yet</p>';
    } catch (_) {
      commentsList.innerHTML = '<p class="no-comments">No comments yet</p>';
    }
  };
  loadComments();

  body.querySelector('.btn-like')?.addEventListener('click', async () => {
    if (!authToken) return;
    const btn = body.querySelector('.btn-like');
    const countEl = btn?.querySelector('.like-count');
    try {
      const res = await fetch(`${API}/post/n/${post.num}/like`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + authToken },
      });
      const data = res.ok ? await res.json() : {};
      btn.classList.toggle('liked', data.liked);
      const newCount = (parseInt(countEl?.textContent || '0', 10) + (data.liked ? 1 : -1));
      if (countEl) countEl.textContent = Math.max(0, newCount);
      post.likedByMe = data.liked;
      post.likeCount = newCount;
    } catch (_) {}
  });

  const submitComment = async () => {
    const input = body.querySelector('#comment-input');
    const text = input?.value?.trim();
    if (!text || !authToken) return;
    try {
      const res = await fetch(`${API}/post/n/${post.num}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
        body: JSON.stringify({ text }),
      });
      const data = res.ok ? await res.json() : null;
      if (data) {
        input.value = '';
        loadComments();
      }
    } catch (_) {}
  };
  body.querySelector('.btn-comment-submit')?.addEventListener('click', submitComment);
  body.querySelector('#comment-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitComment(); }
  });
}
