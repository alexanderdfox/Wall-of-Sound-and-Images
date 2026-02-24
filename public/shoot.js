/**
 * Shoot mode - click anywhere to add bullet holes or emoji stamps
 * All controls in a single Shoot dropdown menu
 */
(function () {
  let shootMode = false;
  let overlay = null;
  let dropdownWrap = null;
  let dropdown = null;
  let toggleBtn = null;
  let selectedEmoji = null;
  let cursorEl = null;

  function safeInsert(nav, node, ref) {
    try {
      if (ref && ref.parentNode === nav) {
        nav.insertBefore(node, ref);
        return;
      }
    } catch (_) {}
    nav.appendChild(node);
  }

  const CATEGORIES = window.SHOOT_EMOJI_CATEGORIES || {
    'Crosshair': [null],
    'Smileys': ['😀','😃','😄','😊','😎','💀','👻','🤖'],
    'Animals': ['🐶','🐱','🐭','🐸','🦊','🐻','🐼','🦄'],
    'Nature': ['🌸','🌹','⭐','🌟','✨','🔥','💥','🌈'],
  };

  function createStamp(x, y, emoji) {
    const el = document.createElement('div');
    el.className = 'bullet-hole';
    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 32px;
      height: 32px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      line-height: 1;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
    `;
    if (emoji) {
      el.textContent = emoji;
    } else {
      const uid = 'bh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      el.innerHTML = `
        <svg viewBox="0 0 40 40" width="24" height="24" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
          <defs>
            <radialGradient id="${uid}-g" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#1a1a1a"/>
              <stop offset="60%" stop-color="#2d2d2d"/>
              <stop offset="100%" stop-color="#0d0d0d"/>
            </radialGradient>
          </defs>
          <circle cx="20" cy="20" r="14" fill="url(#${uid}-g)" stroke="#0a0a0a" stroke-width="1"/>
          <circle cx="20" cy="20" r="5" fill="#000"/>
          <g stroke="#1a1a1a" stroke-width="0.8" fill="none" opacity="0.9">
            <line x1="20" y1="8" x2="20" y2="4"/><line x1="20" y1="32" x2="20" y2="36"/>
            <line x1="8" y1="20" x2="4" y2="20"/><line x1="32" y1="20" x2="36" y2="20"/>
            <line x1="12" y1="12" x2="9" y2="9"/><line x1="28" y1="28" x2="31" y2="31"/>
            <line x1="28" y1="12" x2="31" y2="9"/><line x1="12" y1="28" x2="9" y2="31"/>
          </g>
        </svg>
      `;
    }
    return el;
  }

  function initOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'shoot-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99997;
      cursor: crosshair;
      display: none;
    `;
    cursorEl = document.createElement('div');
    cursorEl.id = 'shoot-cursor';
    cursorEl.style.cssText = `
      position: fixed;
      width: 32px;
      height: 32px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      line-height: 1;
    `;
    overlay.appendChild(cursorEl);
    overlay.addEventListener('mousemove', (e) => {
      if (cursorEl && shootMode) {
        cursorEl.style.left = e.clientX + 'px';
        cursorEl.style.top = e.clientY + 'px';
        if (selectedEmoji) {
          cursorEl.textContent = selectedEmoji;
          cursorEl.style.display = 'flex';
          overlay.style.cursor = 'none';
        } else {
          cursorEl.style.display = 'none';
          overlay.style.cursor = 'crosshair';
        }
      }
    });
    overlay.addEventListener('mouseleave', () => {
      if (cursorEl) cursorEl.style.display = 'none';
      overlay.style.cursor = 'crosshair';
    });
    overlay.addEventListener('click', (e) => {
      if (!shootMode) return;
      const stamp = createStamp(e.clientX, e.clientY, selectedEmoji);
      overlay.appendChild(stamp);
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function toggleShootMode() {
    shootMode = !shootMode;
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', shootMode);
      toggleBtn.textContent = shootMode ? 'Shoot ON — click page' : 'Start shoot mode';
    }
    initOverlay();
    overlay.style.display = shootMode ? 'block' : 'none';
    if (cursorEl) cursorEl.style.display = (shootMode && selectedEmoji) ? 'flex' : 'none';
  }

  function updateEmojiSelection() {
    if (!dropdown) return;
    dropdown.querySelectorAll('.shoot-emoji-btn').forEach((b) => {
      const em = b.dataset.emoji;
      const isNull = em === '__null__';
      const match = (isNull && selectedEmoji === null) || (em === selectedEmoji);
      b.classList.toggle('selected', match);
    });
  }

  function buildDropdown() {
    dropdown.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'shoot-dropdown-header';
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'shoot-toggle-btn';
    toggleBtn.textContent = shootMode ? 'Shoot ON — click page' : 'Start shoot mode';
    toggleBtn.classList.toggle('active', shootMode);
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleShootMode();
    });
    header.appendChild(toggleBtn);
    dropdown.appendChild(header);

    Object.keys(CATEGORIES).forEach((catName) => {
      const cat = CATEGORIES[catName];
      const items = Array.isArray(cat) ? cat : [];
      if (items.length === 0) return;
      const section = document.createElement('div');
      section.className = 'shoot-emoji-category';
      const h4 = document.createElement('h4');
      h4.textContent = catName;
      section.appendChild(h4);
      const grid = document.createElement('div');
      grid.className = 'shoot-emoji-grid';
      items.forEach((emoji) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shoot-emoji-btn';
        b.dataset.emoji = emoji === null ? '__null__' : emoji;
        b.textContent = emoji === null ? '⊕' : emoji;
        b.title = emoji === null ? 'Crosshair (bullet hole)' : emoji;
        if ((emoji === null && selectedEmoji === null) || emoji === selectedEmoji) {
          b.classList.add('selected');
        }
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedEmoji = emoji;
          updateEmojiSelection();
          if (overlay && shootMode) {
            cursorEl.style.display = selectedEmoji ? 'flex' : 'none';
            cursorEl.textContent = selectedEmoji || '';
          }
        });
        grid.appendChild(b);
      });
      section.appendChild(grid);
      dropdown.appendChild(section);
    });
  }

  function initButton() {
    if (dropdownWrap) return dropdownWrap;
    const nav = document.querySelector('nav.nav');
    if (!nav) return null;

    dropdownWrap = document.createElement('div');
    dropdownWrap.className = 'shoot-dropdown-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.id = 'btn-shoot';
    btn.title = 'Shoot menu';
    btn.setAttribute('aria-label', 'Shoot');
    btn.setAttribute('aria-haspopup', 'true');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

    dropdown = document.createElement('div');
    dropdown.className = 'shoot-dropdown';
    dropdown.id = 'shoot-dropdown';
    dropdown.setAttribute('role', 'menu');
    buildDropdown();

    dropdownWrap.appendChild(btn);
    dropdownWrap.appendChild(dropdown);

    function open() {
      dropdown.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
      dropdown.classList.toggle('open');
      btn.setAttribute('aria-expanded', dropdown.classList.contains('open'));
      if (dropdown.classList.contains('open')) buildDropdown();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', (e) => {
      if (dropdownWrap && !dropdownWrap.contains(e.target)) close();
    });
    dropdown.addEventListener('click', (e) => {
      if (e.target.closest('.shoot-emoji-btn') || e.target.closest('.shoot-toggle-btn')) return;
      e.stopPropagation();
    });

    safeInsert(nav, dropdownWrap, nav.querySelector('#btn-upload, #btn-auth'));
    return dropdownWrap;
  }

  function init() {
    const run = (retries) => {
      retries = retries || 0;
      const nav = document.querySelector('nav.nav');
      if (!nav) {
        if (retries < 20) setTimeout(() => run(retries + 1), 100);
        return;
      }
      initButton();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => run(0));
    } else {
      run(0);
    }
  }
  init();
})();
