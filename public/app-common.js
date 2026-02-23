const API = '/api';

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCodeComic(code, compact = false, codeType = null) {
  if (!code || typeof code !== 'string') return '';
  const raw = code.trim();
  let inner = escapeHtml(raw);
  const lang = (codeType || '').toLowerCase();
  const langLabel = lang && lang !== 'plain' ? lang.toUpperCase().slice(0, 6) : 'CODE';
  if (lang && lang !== 'plain' && typeof hljs !== 'undefined') {
    const hljsLang = lang === 'html' ? 'xml' : lang;
    try {
      const result = hljs.highlight(raw, { language: hljsLang, ignoreIllegals: true });
      inner = result.value;
    } catch (_) { /* fallback to escaped */ }
  }
  const cls = compact ? 'code-comic compact' : 'code-comic';
  const badge = lang && lang !== 'plain' ? langLabel : 'CODE';
  return `<div class="${cls}"><span class="code-comic-badge">${escapeHtml(badge)}</span><code class="hljs">${inner}</code></div>`;
}

function renderCommentText(text) {
  if (!text) return '';
  const re = /\[sound:#(\d+)\]/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    out += '<span class="comment-sound-embed"><audio src="/s/n/' + m[1] + '" controls preload="metadata" style="height:28px;max-width:160px;vertical-align:middle"></audio></span>';
    last = re.lastIndex;
  }
  out += escapeHtml(text.slice(last));
  return out || escapeHtml(text);
}

async function openPost(post, postModal, lightboxBody) {
  const modal = postModal || document.getElementById('post-modal');
  const body = lightboxBody || document.getElementById('lightbox-body');
  const babelHash = post.babeliaLocation || post.hash;
  const imgSrc = post.num ? `/i/n/${post.num}` : (babelHash ? `/i/${babelHash}` : post.imageUrl || '');
  const userEl = post.userId ? `<a href="/u/${encodeURIComponent(post.userId)}" class="post-user post-user-link">@${escapeHtml(post.username || '')}</a>` : `<div class="post-user">@${escapeHtml(post.username || '')}</div>`;
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
      ${(post.sourceCode || post.source_code) ? renderCodeComic(post.sourceCode || post.source_code, false, post.sourceCodeType || post.source_code_type) : ''}
      <div class="lightbox-actions">
        <button type="button" class="btn-like ${likedByMe ? 'liked' : ''}" data-num="${post.num}" aria-label="Like">
          👍 <span class="like-count">${likeCount}</span>
        </button>
        <span class="lightbox-comment-count">${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>
        <button type="button" class="btn-ghost btn-report" data-type="image" data-num="${post.num || ''}" data-hash="${escapeHtml((post.babeliaLocation || post.hash) || '')}" title="Report">🚩 Report</button>
      </div>
      <div class="lightbox-hash">#${post.num || '?'} · ${(post.babeliaLocation || post.hash || '').slice(0, 16)}…</div>
      ${(post.width && post.height) ? `<div class="lightbox-meta-extra">Original: ${post.width}×${post.height} px</div>` : ''}
      ${(post.createdAt || post.originIp) ? `<div class="lightbox-meta-extra">${post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}${post.createdAt && post.originIp ? ' · ' : ''}${post.originIp || ''}</div>` : ''}
    </div>
    <div class="lightbox-comments" id="lightbox-comments">
      <div class="comments-list" id="comments-list"></div>
      ${authToken ? `
        <div class="comment-form-wrap">
          <div class="comment-form-row">
            <div class="comment-add-btns">
              <button type="button" class="btn-icon comment-add-btn" id="comment-emoji-btn" title="Add emoji" aria-label="Add emoji">😀</button>
              <div class="comment-emoji-dropdown" id="comment-emoji-dropdown" role="menu">
                ${['😀','😃','😄','😁','😅','😂','🤣','😊','🥰','😍','🤩','😘','😋','😜','🤪','😎','👍','👎','❤️','🔥','✨','🎉','🎵','🔊','😢','😭','🙏','👏','🤔','💯'].map(e => `<button type="button" class="comment-emoji-item" data-emoji="${e}" role="menuitem">${e}</button>`).join('')}
              </div>
              <button type="button" class="btn-icon comment-add-btn" id="comment-sound-btn" title="Add sound" aria-label="Add sound">🔊</button>
              <div class="comment-sound-dropdown" id="comment-sound-dropdown" role="menu">
                <div class="comment-sound-loading" id="comment-sound-loading">Loading…</div>
                <div class="comment-sound-list" id="comment-sound-list" style="display:none"></div>
              </div>
            </div>
            <div class="comment-form">
              <input type="text" id="comment-input" placeholder="Add a comment…" maxlength="500">
              <button type="button" class="btn btn-primary btn-comment-submit" data-num="${post.num}">Post</button>
            </div>
          </div>
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
        `<div class="comment">${(c.userId || c.username) ? `<a href="/u/${encodeURIComponent(c.userId || c.username || '')}" class="comment-user">@${escapeHtml(c.username || '')}</a>` : `<span class="comment-user">@${escapeHtml(c.username || '')}</span>`} ${renderCommentText(c.text)}</div>`
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

  if (authToken) {
    const commentInput = body.querySelector('#comment-input');
    const emojiBtn = body.querySelector('#comment-emoji-btn');
    const emojiDrop = body.querySelector('#comment-emoji-dropdown');
    const soundBtn = body.querySelector('#comment-sound-btn');
    const soundDrop = body.querySelector('#comment-sound-dropdown');
    const soundList = body.querySelector('#comment-sound-list');
    const soundLoading = body.querySelector('#comment-sound-loading');

    function insertAtCursor(el, s) {
      const start = el.selectionStart, end = el.selectionEnd, val = el.value;
      el.value = val.slice(0, start) + s + val.slice(end);
      el.selectionStart = el.selectionEnd = start + s.length;
      el.focus();
    }

    function closeAllDrops() {
      emojiDrop?.classList.remove('open');
      soundDrop?.classList.remove('open');
    }

    emojiBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      soundDrop?.classList.remove('open');
      emojiDrop?.classList.toggle('open');
    });
    emojiDrop?.addEventListener('click', (e) => e.stopPropagation());
    emojiDrop?.querySelectorAll('.comment-emoji-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        insertAtCursor(commentInput, btn.dataset.emoji);
        emojiDrop?.classList.remove('open');
      });
    });

    soundDrop?.addEventListener('click', (e) => e.stopPropagation());
    soundBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiDrop?.classList.remove('open');
      soundDrop?.classList.toggle('open');
      if (soundDrop?.classList.contains('open') && soundList?.innerHTML === '') {
        fetch(API + '/sounds?per=40')
          .then((r) => r.json())
          .then((d) => {
            soundLoading.style.display = 'none';
            soundList.style.display = 'block';
            soundList.innerHTML = (d.items || []).map((s) =>
              `<button type="button" class="comment-sound-item" data-num="${s.num}" data-caption="${escapeHtml((s.caption || '').slice(0, 30))}" role="menuitem">#${s.num} ${escapeHtml((s.caption || '').slice(0, 25)) || '…'}</button>`
            ).join('') || '<span class="comment-sound-empty">No sounds yet</span>';
            soundList.querySelectorAll('.comment-sound-item').forEach((btn) => {
              btn.addEventListener('click', () => {
                insertAtCursor(commentInput, '[sound:#' + btn.dataset.num + ']');
                soundDrop?.classList.remove('open');
              });
            });
          })
          .catch(() => { soundLoading.textContent = 'Failed to load'; soundList.style.display = 'block'; });
      }
    });

    document.addEventListener('click', closeAllDrops);
  }

  body.querySelector('.btn-report')?.addEventListener('click', () => {
    if (typeof openReportModal === 'function') {
      openReportModal('image', post.num, post.babeliaLocation || post.hash);
    }
  });
}

function openReportModal(contentType, num, hash) {
  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;
  if (!authToken) {
    alert('Sign in to report content.');
    if (window.location.pathname === '/') window.location.hash = 'auth';
    return;
  }

  let el = document.getElementById('report-modal');
  if (!el) {
    el = document.createElement('dialog');
    el.id = 'report-modal';
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-content">
        <button type="button" class="btn-close" id="report-modal-close" aria-label="Close">×</button>
        <h2>Report Content</h2>
        <p class="modal-hint">Report images or sounds that violate copyright, contain illegal content, or otherwise break our terms.</p>
        <form id="report-form">
          <input type="hidden" id="report-type" name="type">
          <input type="hidden" id="report-num" name="num">
          <input type="hidden" id="report-hash" name="hash">
          <div class="visibility-wrap">
            <label for="report-reason">Reason</label>
            <select id="report-reason" required>
              <option value="">Select…</option>
              <option value="copyright">Copyright infringement</option>
              <option value="illegal">Illegal content</option>
              <option value="other">Other violation</option>
            </select>
          </div>
          <textarea id="report-details" placeholder="Additional details (optional)" rows="3" maxlength="1000" style="width:100%;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font-sans);margin-bottom:12px;resize:vertical"></textarea>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="report-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit Report</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#report-modal-close')?.addEventListener('click', () => el.close());
    el.querySelector('#report-cancel')?.addEventListener('click', () => el.close());
    el.querySelector('#report-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const typeInput = document.getElementById('report-type');
      const numInput = document.getElementById('report-num');
      const hashInput = document.getElementById('report-hash');
      const reason = document.getElementById('report-reason')?.value;
      const details = document.getElementById('report-details')?.value?.trim() || '';
      if (!reason || !typeInput) return;
      const btn = el.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
      try {
        const res = await fetch(API + '/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
          body: JSON.stringify({
            type: typeInput.value,
            num: numInput?.value || null,
            hash: hashInput?.value || null,
            reason,
            details,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          alert('Report submitted. We will review it.');
          el.close();
        } else {
          alert(data.error || 'Failed to submit report.');
        }
      } catch (err) {
        alert('Failed to submit report.');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Report'; }
    });
  }

  document.getElementById('report-type').value = contentType;
  document.getElementById('report-num').value = num || '';
  document.getElementById('report-hash').value = hash || '';
  document.getElementById('report-reason').value = '';
  document.getElementById('report-details').value = '';
  el.showModal();
}
