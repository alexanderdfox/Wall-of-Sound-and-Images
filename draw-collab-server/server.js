/**
 * Tchoff Collaborative Draw Server
 * Based on 3BlindMice (https://github.com/alexanderdfox/3BlindMice)
 * Multi-user cursor fusion + stroke broadcasting for shared drawing
 */
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io',
});

app.use(cors());
app.use(express.json());

// Store connected clients and mouse data
const clients = new Map();
const mouseData = new Map();
const mouseWeights = new Map();
const mouseActivity = new Map();
const mousePositions = new Map();

const config = {
  port: process.env.PORT || 3001,
  maxClients: 50,
  activityTimeout: 2000,
  smoothingFactor: 0.7,
};

let hostCursorPosition = { x: 960, y: 540 };
let hostVelocity = { x: 0, y: 0 };
let usePhysics = false;
let useIndividualMode = false;
let activeMouseIds = new Set();
let currentHostId = null;
let screenDimensions = { width: 1920, height: 1080 };

const EVENT_THROTTLE_MS = 16;
const lastEventTime = new Map();
const eventQueue = new Map();
const MAX_QUEUE_SIZE = 50;

// Rooms: ?room=xyz - clients in same room share cursor and strokes
function getRoom(socket) {
  const q = socket.handshake?.query || {};
  const fromQuery = q.room || q.Room;
  if (fromQuery && typeof fromQuery === 'string') return fromQuery;
  const url = socket.handshake?.headers?.referer || '';
  try {
    const u = new URL(url);
    return u.searchParams.get('room') || 'default';
  } catch {
    return 'default';
  }
}

function processMouseMove(clientId, deltaX, deltaY, room) {
  const currentTime = Date.now();
  const clientInfo = clients.get(clientId);
  if (clientInfo) clientInfo.lastActivity = currentTime;

  mouseData.set(clientId, {
    deltaX: (mouseData.get(clientId)?.deltaX || 0) + deltaX,
    deltaY: (mouseData.get(clientId)?.deltaY || 0) + deltaY,
    timestamp: currentTime,
  });
  mouseActivity.set(clientId, currentTime);
  updateMouseWeights();

  const pos = mousePositions.get(clientId) || { x: screenDimensions.width / 2, y: screenDimensions.height / 2 };
  const newX = ((pos.x + deltaX) % screenDimensions.width + screenDimensions.width) % screenDimensions.width;
  const newY = ((pos.y + deltaY) % screenDimensions.height + screenDimensions.height) % screenDimensions.height;
  mousePositions.set(clientId, { x: newX, y: newY });

  if (useIndividualMode) {
    activeMouseIds.add(clientId);
    if (activeMouseIds.size > 0) {
      let tx = 0, ty = 0, n = 0;
      for (const id of activeMouseIds) {
        const p = mousePositions.get(id);
        if (p) { tx += p.x; ty += p.y; n++; }
      }
      if (n > 0) hostCursorPosition = { x: tx / n, y: ty / n };
    }
  } else {
    fuseAndMoveCursor();
  }

  broadcastMouseUpdate(room);
}

function updateMouseWeights() {
  const now = Date.now();
  for (const [clientId, lastActivity] of mouseActivity.entries()) {
    const elapsed = now - lastActivity;
    const w = mouseWeights.get(clientId) || 1.0;
    mouseWeights.set(clientId, elapsed > config.activityTimeout
      ? Math.max(0.1, w * 0.9)
      : Math.min(2.0, w * 1.1));
  }
}

function fuseAndMoveCursor() {
  if (mouseData.size === 0) return;
  let tx = 0, ty = 0, tw = 0;
  for (const [cid, mouse] of mouseData.entries()) {
    const w = mouseWeights.get(cid) || 1.0;
    tx += mouse.deltaX * w;
    ty += mouse.deltaY * w;
    tw += w;
  }
  if (tw === 0) return;
  const avgX = tx / tw;
  const avgY = ty / tw;

  if (usePhysics) {
    const damping = 0.12;
    hostVelocity.x = (1 - damping) * hostVelocity.x + avgX;
    hostVelocity.y = (1 - damping) * hostVelocity.y + avgY;
    const speed = Math.hypot(hostVelocity.x, hostVelocity.y);
    const maxSpeed = 50;
    if (speed > maxSpeed) {
      hostVelocity.x *= maxSpeed / speed;
      hostVelocity.y *= maxSpeed / speed;
    }
    hostCursorPosition.x += hostVelocity.x;
    hostCursorPosition.y += hostVelocity.y;
  } else {
    const s = config.smoothingFactor;
    hostCursorPosition.x = hostCursorPosition.x * (1 - s) + (hostCursorPosition.x + avgX) * s;
    hostCursorPosition.y = hostCursorPosition.y * (1 - s) + (hostCursorPosition.y + avgY) * s;
  }
  hostCursorPosition.x = ((hostCursorPosition.x % screenDimensions.width) + screenDimensions.width) % screenDimensions.width;
  hostCursorPosition.y = ((hostCursorPosition.y % screenDimensions.height) + screenDimensions.height) % screenDimensions.height;

  for (const mouse of mouseData.values()) {
    mouse.deltaX = 0;
    mouse.deltaY = 0;
  }
}

function broadcastMouseUpdate(room) {
  const mice = Array.from(mouseData.entries()).map(([id, data]) => ({
    id,
    position: mousePositions.get(id) || { x: 0, y: 0 },
    weight: mouseWeights.get(id) || 1.0,
    lastActivity: mouseActivity.get(id) || null,
    isActive: activeMouseIds.has(id),
  }));
  io.to(room).emit('mouseUpdate', {
    mice,
    hostPosition: { ...hostCursorPosition },
    mode: useIndividualMode ? 'individual' : 'fused',
    activeMice: Array.from(activeMouseIds),
    hostId: currentHostId,
  });
}

io.on('connection', (socket) => {
  const room = getRoom(socket);
  socket.join(room);

  const clientId = uuidv4();
  const clientInfo = {
    id: clientId,
    socket,
    connectedAt: new Date(),
    lastActivity: new Date(),
    isHost: false,
    room,
  };

  if (!currentHostId) {
    clientInfo.isHost = true;
    currentHostId = clientId;
  }
  clients.set(clientId, clientInfo);

  socket.emit('config', {
    clientId,
    isHost: clientInfo.isHost,
    mode: useIndividualMode ? 'individual' : 'fused',
    hostId: currentHostId,
    physicsEnabled: usePhysics,
  });

  const mice = Array.from(mouseData.entries()).map(([id, data]) => ({
    id,
    position: mousePositions.get(id) || { x: 0, y: 0 },
    weight: mouseWeights.get(id) || 1.0,
    lastActivity: mouseActivity.get(id) || null,
    isActive: activeMouseIds.has(id),
  }));
  socket.emit('mouseData', {
    mice,
    hostPosition: { ...hostCursorPosition },
    mode: useIndividualMode ? 'individual' : 'fused',
    activeMice: Array.from(activeMouseIds),
    hostId: currentHostId,
  });

  socket.on('requestHost', () => {
    const info = clients.get(clientId);
    if (!info) return;
    if (currentHostId && clients.has(currentHostId)) {
      clients.get(currentHostId).isHost = false;
    }
    info.isHost = true;
    currentHostId = clientId;
    io.to(room).emit('hostChanged', { hostId: currentHostId });
  });

  socket.on('screenDimensions', (data) => {
    const { width, height } = data;
    if (width > 0 && height > 0) {
      screenDimensions = { width, height };
    }
  });

  socket.on('mouseMove', (data) => {
    const { deltaX, deltaY } = data;
    const now = Date.now();
    const last = lastEventTime.get(clientId) || 0;
    if (now - last < EVENT_THROTTLE_MS) {
      const q = eventQueue.get(clientId) || [];
      if (q.length < MAX_QUEUE_SIZE) q.push({ deltaX, deltaY, timestamp: now });
      eventQueue.set(clientId, q);
      return;
    }
    lastEventTime.set(clientId, now);
    const q = eventQueue.get(clientId);
    if (q?.length) {
      eventQueue.set(clientId, []);
      q.forEach((e) => processMouseMove(clientId, e.deltaX, e.deltaY, room));
    }
    processMouseMove(clientId, deltaX, deltaY, room);
  });

  socket.on('toggleMode', () => {
    if (clientId === currentHostId) {
      useIndividualMode = !useIndividualMode;
      activeMouseIds.clear();
      io.to(room).emit('modeChanged', {
        mode: useIndividualMode ? 'individual' : 'fused',
        activeMice: Array.from(activeMouseIds),
      });
    }
  });

  socket.on('togglePhysics', () => {
    if (clientId === currentHostId) {
      usePhysics = !usePhysics;
      hostVelocity = { x: 0, y: 0 };
      io.to(room).emit('physicsChanged', { physicsEnabled: usePhysics });
    }
  });

  // Stroke sync - broadcast drawing strokes to all in room
  socket.on('drawStroke', (stroke) => {
    if (stroke && typeof stroke === 'object') {
      io.to(room).emit('drawStroke', { ...stroke, clientId });
    }
  });

  socket.on('drawClear', () => {
    io.to(room).emit('drawClear', { clientId });
  });

  socket.on('disconnect', () => {
    clients.delete(clientId);
    mouseData.delete(clientId);
    mouseWeights.delete(clientId);
    mouseActivity.delete(clientId);
    mousePositions.delete(clientId);
    activeMouseIds.delete(clientId);
    lastEventTime.delete(clientId);
    eventQueue.delete(clientId);

    if (currentHostId === clientId) {
      currentHostId = null;
      const next = Array.from(clients.values()).find((c) => c.room === room);
      if (next) {
        next.isHost = true;
        currentHostId = next.id;
        io.to(room).emit('hostChanged', { hostId: currentHostId });
      }
    }
    broadcastMouseUpdate(room);
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🐭 Tchoff Draw Collab Server on port ${config.port}`);
  console.log(`   Open /draw/collab.html?room=abc to draw together`);
});
