import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8787;
const GAME_IDS = new Set(['artillery', 'connect4']);
const server = http.createServer((req, res) => { res.writeHead(200); res.end('ChatFi matchmaking server'); });
const wss = new WebSocketServer({ server });
server.listen(PORT, '0.0.0.0');

const clients = new Map(); // ws -> { name, game, room, side, lastChat }
const queues = {};         // gameId -> [ws]
const rooms = new Map();   // roomId -> [ws, ws]

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastPresence() {
  const games = {};
  for (const c of clients.values()) if (c.game) games[c.game] = (games[c.game] || 0) + 1;
  const msg = { type: 'presence', total: clients.size, games };
  for (const ws of clients.keys()) send(ws, msg);
}

function dequeue(ws) {
  for (const g of Object.keys(queues)) queues[g] = queues[g].filter((w) => w !== ws);
}

function leaveRoom(ws) {
  const c = clients.get(ws);
  if (!c || !c.room) return;
  const pair = rooms.get(c.room);
  if (pair) {
    for (const w of pair) {
      if (w === ws) continue;
      send(w, { type: 'opponent_left' });
      const oc = clients.get(w);
      if (oc) { oc.room = null; oc.side = null; }
    }
    rooms.delete(c.room);
  }
  c.room = null;
  c.side = null;
}

function tryMatch(gameId) {
  const q = queues[gameId] || [];
  while (q.length >= 2) {
    let a = q.shift();
    let b = q.shift();
    if (Math.random() < 0.5) [a, b] = [b, a];
    const room = Math.random().toString(36).slice(2, 10);
    const seed = Math.floor(Math.random() * 4294967296);
    const ca = clients.get(a), cb = clients.get(b);
    rooms.set(room, [a, b]);
    ca.room = cb.room = room;
    ca.side = 0; cb.side = 1;
    send(a, { type: 'matched', room, side: 0, seed, game: gameId, opponent: { name: cb.name } });
    send(b, { type: 'matched', room, side: 1, seed, game: gameId, opponent: { name: ca.name } });
    console.log('matched', gameId, ca.name, 'vs', cb.name);
  }
}

wss.on('connection', (ws) => {
  clients.set(ws, { name: 'Player', game: null, room: null, side: null, lastChat: 0 });
  broadcastPresence();

  ws.on('message', (raw) => {
    const text = raw.toString();
    if (text.length > 2048) return;
    let m;
    try { m = JSON.parse(text); } catch (_) { return; }
    const c = clients.get(ws);
    if (!c || !m) return;

    switch (m.type) {
      case 'hello':
        c.name = String(m.name || 'Player').slice(0, 24);
        break;

      case 'status':
        leaveRoom(ws);
        dequeue(ws);
        c.game = GAME_IDS.has(m.game) ? m.game : null;
        broadcastPresence();
        break;

      case 'queue':
        leaveRoom(ws);
        dequeue(ws);
        if (GAME_IDS.has(m.game)) {
          c.game = m.game;
          (queues[m.game] = queues[m.game] || []).push(ws);
          broadcastPresence();
          tryMatch(m.game);
        }
        break;

      case 'cancel':
        dequeue(ws);
        c.game = null;
        broadcastPresence();
        break;

      case 'move':
      case 'chat': {
        if (!c.room) break;
        if (m.type === 'chat') {
          const now = Date.now();
          if (now - c.lastChat < 300) break;
          c.lastChat = now;
        }
        const pair = rooms.get(c.room);
        const other = pair && pair.find((w) => w !== ws);
        if (other) send(other, { type: m.type, data: m.data });
        break;
      }
    }
  });

  ws.on('close', () => {
    dequeue(ws);
    leaveRoom(ws);
    clients.delete(ws);
    broadcastPresence();
  });

  ws.on('error', () => {});
});

console.log('ChatFi matchmaking server on ws://0.0.0.0:' + PORT);
