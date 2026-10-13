const listeners = {};
let ws = null, up = false, name = 'Player';

const wsUrl = () =>
  (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':8787';

export function on(type, cb) {
  (listeners[type] = listeners[type] || []).push(cb);
  return () => { listeners[type] = (listeners[type] || []).filter((f) => f !== cb); };
}

function emit(type, data) {
  (listeners[type] || []).slice().forEach((f) => f(data));
}

export const isOnline = () => up;

export function send(type, extra) {
  if (!up) return false;
  ws.send(JSON.stringify(Object.assign({ type }, extra || {})));
  return true;
}

function open() {
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    up = true;
    send('hello', { name });
    emit('connection', { online: true });
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m && m.type) emit(m.type, m);
  };
  ws.onclose = () => {
    const was = up;
    up = false;
    if (was) emit('connection', { online: false });
    setTimeout(open, 2000);
  };
  ws.onerror = () => {};
}

export function connect(playerName) {
  name = playerName;
  open();
}
