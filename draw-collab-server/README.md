# Tchoff Collaborative Draw Server

Multi-user drawing server based on [3BlindMice](https://github.com/alexanderdfox/3BlindMice). Multiple users can draw together—their mouse movements are fused into one shared brush.

## Quick Start

```bash
cd draw-collab-server
npm install
npm start
```

Server runs on port **3001** (or `PORT` env var).

## Usage

1. Open `/draw/collab.html` on multiple devices
2. Click **Connect** (default: `http://127.0.0.1:3001` for localhost)
3. Move your mouse in the canvas — movements from all users are averaged
4. Click and drag to draw — the brush follows the fused cursor

## Rooms

Add `?room=xyz` to share a session:

- `/draw/collab.html?room=party` — everyone in "party" shares the same canvas
- Different rooms are isolated

## Config

- **Server URL**: `?socketServer=https://your-server.com` or localStorage `TCHOFF_COLLAB_SOCKET_URL`
- **Room**: `?room=roomname`

## Deploy

For production, run the server on a host (e.g. Render, Fly.io, Railway) and point clients to it via the URL param or localStorage.
