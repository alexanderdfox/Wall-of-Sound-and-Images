/**
 * Tchoff Collaborative Draw - Multi-user drawing via 3BlindMice cursor fusion
 * Connect multiple devices; movements are fused into one brush.
 */
(function () {
  const config = window.TCHOFF_COLLAB_CONFIG || {};
  const serverUrl = config.socketServer || 'http://127.0.0.1:3001';
  const room = config.room || 'default';

  let socket = null;
  let hostPosition = { x: 0, y: 0 };
  let collabDrawing = false;
  let strokePoints = [];
  let cursorEl = null;
  let statusEl = null;

  const canvas = document.getElementById('drawing-canvas');
  if (!canvas) return;

  function getCanvasRect() {
    return canvas.getBoundingClientRect();
  }

  const SERVER_W = 1920;
  const SERVER_H = 1080;

  function hostToCanvas(host) {
    return {
      x: (host.x / SERVER_W) * canvas.width,
      y: (host.y / SERVER_H) * canvas.height,
    };
  }

  function canvasToHost(canvasX, canvasY) {
    return {
      x: (canvasX / canvas.width) * SERVER_W,
      y: (canvasY / canvas.height) * SERVER_H,
    };
  }

  function sendScreenDimensions() {
    if (socket?.connected) {
      socket.emit('screenDimensions', { width: canvas.width, height: canvas.height });
    }
  }

  function updateCursor() {
    if (!cursorEl) return;
    const c = hostToCanvas(hostPosition);
    const rect = getCanvasRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    cursorEl.style.left = (rect.left + c.x * scaleX - 8) + 'px';
    cursorEl.style.top = (rect.top + c.y * scaleY - 8) + 'px';
    cursorEl.style.display = socket?.connected ? 'block' : 'none';
  }

  function setStatus(msg, isError) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = isError ? 'var(--error, #c00)' : '';
    }
  }

  function connect() {
    if (typeof io === 'undefined') {
      setStatus('Socket.IO not loaded', true);
      return;
    }
    setStatus('Connecting…');
    socket = io(serverUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      query: { room },
    });

    socket.on('connect', () => {
      setStatus('Connected — move mouse in canvas to draw together');
      sendScreenDimensions();
      hostPosition = { x: SERVER_W / 2, y: SERVER_H / 2 };
    });

    socket.on('config', () => {});

    socket.on('mouseData', (data) => {
      if (data.hostPosition) hostPosition = data.hostPosition;
      updateCursor();
    });

    socket.on('mouseUpdate', (data) => {
      if (data.hostPosition) hostPosition = data.hostPosition;
      updateCursor();
      if (collabDrawing && strokePoints.length > 0) {
        const last = strokePoints[strokePoints.length - 1];
        const cur = [hostPosition.x, hostPosition.y];
        if (Math.hypot(cur[0] - last[0], cur[1] - last[1]) > 1) {
          strokePoints.push(cur);
          const c = hostToCanvas(hostPosition);
          if (typeof drawPencil === 'function') {
            drawPencil(c.x, c.y);
          }
        }
      }
    });

    socket.on('drawStroke', (payload) => {
      if (payload.clientId === socket?.id) return;
      const pts = (payload.points || []).map((p) => [
        (p[0] / SERVER_W) * canvas.width,
        (p[1] / SERVER_H) * canvas.height,
      ]);
      const stroke = {
        type: payload.type || 'pencil',
        points: pts,
        color: payload.color || '#000000',
        size: payload.size || 5,
        tool: payload.tool || 'pencil',
      };
      if (typeof window.replayCollabStroke === 'function') {
        window.replayCollabStroke(stroke);
      }
    });

    socket.on('drawClear', () => {
      if (typeof clearCanvasWithAnimation === 'function') {
        clearCanvasWithAnimation();
      }
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected', true);
      collabDrawing = false;
      if (cursorEl) cursorEl.style.display = 'none';
    });

    socket.on('connect_error', () => {
      setStatus('Connection failed — run collab server: npm start in draw-collab-server/', true);
    });
  }

  function sendMouseDelta(deltaX, deltaY) {
    if (socket?.connected) {
      socket.emit('mouseMove', { deltaX, deltaY, timestamp: Date.now() });
    }
  }

  function setupUI() {
    const header = document.querySelector('.draw-page-header') || document.querySelector('.draw-header-links')?.parentElement;
    if (!header) return;

    statusEl = document.getElementById('draw-status') || document.createElement('p');
    statusEl.id = 'draw-status';
    if (!statusEl.parentElement) header.appendChild(statusEl);

    const wrap = document.createElement('div');
    wrap.className = 'draw-header-links';
    wrap.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;';
    wrap.innerHTML = `
      <button type="button" class="btn btn-ghost" id="collab-connect-btn" title="Connect to collaborative draw server">🐭 Connect</button>
      <input type="text" id="collab-server-input" placeholder="Server URL" value="${serverUrl}" style="width:180px;padding:6px 10px;font-size:0.9rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
      <span id="collab-room-display" style="font-size:0.9rem;color:var(--text-muted);">Room: ${room}</span>
    `;
    header.appendChild(wrap);

    const connectBtn = document.getElementById('collab-connect-btn');
    const serverInput = document.getElementById('collab-server-input');
    connectBtn?.addEventListener('click', () => {
      const url = (serverInput?.value || '').trim() || serverUrl;
      try {
        localStorage.setItem('TCHOFF_COLLAB_SOCKET_URL', url);
      } catch (_) {}
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      window.TCHOFF_COLLAB_CONFIG.socketServer = url;
      connect();
    });

    cursorEl = document.createElement('div');
    cursorEl.id = 'collab-cursor';
    cursorEl.style.cssText = 'position:fixed;width:16px;height:16px;border:2px solid rgba(255,87,34,0.9);border-radius:50%;background:rgba(255,87,34,0.3);pointer-events:none;z-index:9999;display:none;';
    document.body.appendChild(cursorEl);
  }

  function setupCanvasHandlers() {
    let lastPos = null;

    canvas.addEventListener('mousemove', (e) => {
      if (!socket?.connected) return;
      const rect = getCanvasRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const cur = { x, y };
      if (lastPos) {
        const deltaX = cur.x - lastPos.x;
        const deltaY = cur.y - lastPos.y;
        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          const dx = deltaX * (SERVER_W / canvas.width);
          const dy = deltaY * (SERVER_H / canvas.height);
          sendMouseDelta(dx, dy);
        }
      }
      lastPos = cur;
    });

    canvas.addEventListener('mouseenter', () => { lastPos = null; });
    canvas.addEventListener('mouseleave', () => { lastPos = null; });

    canvas.addEventListener('mousedown', (e) => {
      if (!socket?.connected || e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      collabDrawing = true;
      strokePoints = [[hostPosition.x, hostPosition.y]];
      const c = hostToCanvas(hostPosition);
      if (typeof getActiveContext === 'function') {
        getActiveContext().beginPath();
        getActiveContext().moveTo(c.x, c.y);
      }
      if (typeof drawPencil === 'function') {
        drawPencil(c.x, c.y);
      }
    }, true);

    canvas.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (collabDrawing && socket?.connected && strokePoints.length >= 1) {
        e.stopImmediatePropagation();
        socket.emit('drawStroke', {
          type: 'pencil',
          tool: typeof currentTool !== 'undefined' ? currentTool : 'pencil',
          points: strokePoints,
          color: typeof currentColor !== 'undefined' ? currentColor : '#000000',
          size: typeof brushSize !== 'undefined' ? brushSize : 5,
        });
      }
      collabDrawing = false;
      strokePoints = [];
    }, true);

    canvas.addEventListener('mouseleave', () => {
      if (collabDrawing && socket?.connected && strokePoints.length >= 1) {
        socket.emit('drawStroke', {
          type: 'pencil',
          tool: typeof currentTool !== 'undefined' ? currentTool : 'pencil',
          points: strokePoints,
          color: typeof currentColor !== 'undefined' ? currentColor : '#000000',
          size: typeof brushSize !== 'undefined' ? brushSize : 5,
        });
      }
      collabDrawing = false;
      strokePoints = [];
    });
  }

  setupUI();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupCanvasHandlers();
      connect();
    });
  } else {
    setupCanvasHandlers();
    connect();
  }
})();
