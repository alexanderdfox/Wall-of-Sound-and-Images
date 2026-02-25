/**
 * Scratch-off ticket effect for images
 * Scratch to reveal the image underneath
 */
(function () {
  const BRUSH_RADIUS = 24;
  const BRUSH_RADIUS_TOUCH = 32;

  function drawScratchTexture(ctx, w, h) {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#c0c0c5');
    gradient.addColorStop(0.3, '#a8a8ae');
    gradient.addColorStop(0.5, '#98989e');
    gradient.addColorStop(0.7, '#a8a8ae');
    gradient.addColorStop(1, '#b8b8be');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 25;
      d[i] = Math.max(0, Math.min(255, d[i] + noise));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
  }

  function initScratchOff(wrapEl) {
    const img = wrapEl.querySelector('.lightbox-image, .post-image, img');
    if (!img || !wrapEl) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'scratch-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none;pointer-events:auto;';

    function resize() {
      const rect = wrapEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        drawScratchTexture(ctx, w, h);
      }
    }

    wrapEl.style.position = 'relative';
    wrapEl.appendChild(canvas);
    resize();

    const ctx = canvas.getContext('2d');
    let isScratching = false;
    let didScratch = false;
    let lastX = 0, lastY = 0;

    function scratch(x, y, radius) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function scratchLine(x1, y1, x2, y2, radius) {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.ceil(dist / (radius * 0.5)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        scratch(x, y, radius);
      }
    }

    function pointerDown(e) {
      e.preventDefault();
      isScratching = true;
      didScratch = false;
      const rect = wrapEl.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      lastX = (clientX - rect.left) * scaleX;
      lastY = (clientY - rect.top) * scaleY;
      const r = e.touches ? BRUSH_RADIUS_TOUCH : BRUSH_RADIUS;
      scratch(lastX, lastY, r * (canvas.width / rect.width));
    }

    function pointerMove(e) {
      if (!isScratching) return;
      e.preventDefault();
      didScratch = true;
      const rect = wrapEl.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      const r = e.touches ? BRUSH_RADIUS_TOUCH : BRUSH_RADIUS;
      scratchLine(lastX, lastY, x, y, r * (canvas.width / rect.width));
      lastX = x;
      lastY = y;
    }

    function pointerUp() {
      isScratching = false;
    }

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mousemove', pointerMove);
    canvas.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('mouseleave', pointerUp);
    canvas.addEventListener('touchstart', pointerDown, { passive: false });
    canvas.addEventListener('touchmove', pointerMove, { passive: false });
    canvas.addEventListener('touchend', pointerUp);
    canvas.addEventListener('touchcancel', pointerUp);
    canvas.addEventListener('click', (e) => {
      if (didScratch) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    window.addEventListener('resize', resize);
    const obs = new ResizeObserver(resize);
    obs.observe(wrapEl);

    return () => {
      obs.disconnect();
      window.removeEventListener('resize', resize);
      canvas.remove();
    };
  }

  window.initScratchOff = initScratchOff;
})();
