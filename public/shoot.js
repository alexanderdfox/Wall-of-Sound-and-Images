/**
 * Shoot mode - click anywhere to create bullet holes on the page
 */
(function () {
  let shootMode = false;
  let overlay = null;
  let btn = null;

  function createBulletHole(x, y) {
    const uid = 'bh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const hole = document.createElement('div');
    hole.className = 'bullet-hole';
    hole.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 24px;
      height: 24px;
      margin-left: -12px;
      margin-top: -12px;
      pointer-events: none;
      z-index: 99998;
    `;
    hole.innerHTML = `
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
          <line x1="20" y1="8" x2="20" y2="4"/>
          <line x1="20" y1="32" x2="20" y2="36"/>
          <line x1="8" y1="20" x2="4" y2="20"/>
          <line x1="32" y1="20" x2="36" y2="20"/>
          <line x1="12" y1="12" x2="9" y2="9"/>
          <line x1="28" y1="28" x2="31" y2="31"/>
          <line x1="28" y1="12" x2="31" y2="9"/>
          <line x1="12" y1="28" x2="9" y2="31"/>
        </g>
      </svg>
    `;
    return hole;
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
    overlay.addEventListener('click', (e) => {
      if (!shootMode) return;
      const hole = createBulletHole(e.clientX, e.clientY);
      overlay.appendChild(hole);
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function initButton() {
    if (btn) return btn;
    const nav = document.querySelector('nav.nav');
    if (!nav) return null;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.id = 'btn-shoot';
    btn.title = 'Shoot (click page to add bullet holes)';
    btn.setAttribute('aria-label', 'Shoot');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
    const firstIcon = nav.querySelector('#btn-upload, #btn-auth, .btn-icon');
    nav.insertBefore(btn, firstIcon || null);
    btn.addEventListener('click', () => {
      shootMode = !shootMode;
      btn.classList.toggle('active', shootMode);
      btn.title = shootMode ? 'Shoot mode ON — click page to add bullet holes' : 'Shoot (click page to add bullet holes)';
      initOverlay();
      overlay.style.display = shootMode ? 'block' : 'none';
    });
    return btn;
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initButton);
    } else {
      initButton();
    }
  }
  init();
})();
