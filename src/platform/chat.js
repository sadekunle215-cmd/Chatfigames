import './chat.css';

const QUICK = ['GG', '👏', '😂', 'Nice shot', 'Rematch?'];
const MAX_LEN = 200;

// Prototype transport: BroadcastChannel only links tabs on the same device.
// Swap this for WebRTC data channels or a relay server for real matches.
function transport(roomId) {
  const ch = new BroadcastChannel('chatfi-chat-' + roomId);
  return {
    send: (msg) => ch.postMessage(msg),
    onMessage: (cb) => { ch.onmessage = (e) => cb(e.data); },
    close: () => ch.close(),
  };
}

export function mountChat(parent, { roomId, me, transport: custom, onIncoming }) {
  const t = custom || transport(roomId);
  const root = document.createElement('div');
  root.innerHTML =
    '<button class="chat-fab" aria-label="Chat">💬<span class="chat-badge"></span></button>' +
    '<div class="chat-sheet"><div class="chat-head"><span>Match chat</span><button class="chat-x">✕</button></div>' +
    '<div class="chat-log"><div class="chat-hint"></div></div>' +
    '<div class="chat-quick"></div>' +
    '<div class="chat-input"><input maxlength="' + MAX_LEN + '" placeholder="Message your opponent" />' +
    '<button>Send</button></div></div>';
  parent.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const fab = $('.chat-fab'), badge = $('.chat-badge'), sheet = $('.chat-sheet');
  const log = $('.chat-log'), input = $('input'), sendBtn = $('.chat-input button');
  $('.chat-hint').textContent = 'You are ' + me.name + '. Open this page in a second tab to test.';

  let open = false, unread = 0, last = 0;

  function add(m) {
    const hint = log.querySelector('.chat-hint');
    if (hint) hint.remove();
    const mine = m.from.id === me.id;
    if (!mine && onIncoming) onIncoming();
    const el = document.createElement('div');
    el.className = 'msg' + (mine ? ' mine' : '');
    if (!mine) {
      const n = document.createElement('small');
      n.textContent = m.from.name;
      el.appendChild(n);
    }
    el.appendChild(document.createTextNode(m.text));
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (!mine && !open) {
      unread++;
      badge.textContent = unread;
      badge.style.display = 'grid';
    }
  }

  function send(text) {
    text = String(text).trim().slice(0, MAX_LEN);
    const now = Date.now();
    if (!text || now - last < 600) return;
    last = now;
    const m = { from: { id: me.id, name: me.name }, text, ts: now };
    add(m);
    t.send(m);
  }

  // Incoming messages are untrusted: validate, trim, and render as plain text only
  t.onMessage((m) => {
    if (!m || typeof m.text !== 'string' || !m.from || typeof m.from.id !== 'string') return;
    add({
      from: { id: m.from.id, name: String(m.from.name || 'Player').slice(0, 24) },
      text: m.text.slice(0, MAX_LEN),
      ts: m.ts,
    });
  });

  function setOpen(v) {
    open = v;
    sheet.classList.toggle('open', v);
    if (v) {
      unread = 0;
      badge.style.display = 'none';
      log.scrollTop = log.scrollHeight;
    }
  }

  QUICK.forEach((q) => {
    const b = document.createElement('button');
    b.textContent = q;
    b.addEventListener('click', () => send(q));
    $('.chat-quick').appendChild(b);
  });

  fab.addEventListener('click', () => setOpen(!open));
  $('.chat-x').addEventListener('click', () => setOpen(false));
  sendBtn.addEventListener('click', () => { send(input.value); input.value = ''; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { send(input.value); input.value = ''; }
  });

  return { destroy: () => { t.close(); root.remove(); } };
}
