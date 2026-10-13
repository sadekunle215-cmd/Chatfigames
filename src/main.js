import './platform/ui.css';
import { GAMES } from './registry.js';
import { getOnline, getTotal } from './presence.js';
import { connect, on, send, isOnline } from './platform/net.js';
import { mountChat } from './platform/chat.js';

const app = document.getElementById('app');
const me = {
  id: Math.random().toString(36).slice(2, 8),
  name: 'Player ' + Math.floor(1000 + Math.random() * 9000),
};
let current = null, chat = null, cleanups = [];

connect(me.name);

const ART = {
  artillery:
    '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 50 Q16 36 28 46 T60 44"/><path d="M12 40 Q30 6 52 38" stroke-dasharray="1 5"/>' +
    '<circle cx="52" cy="38" r="3" fill="#fff"/></svg>',
  connect4:
    '<svg viewBox="0 0 64 64" stroke="#fff" stroke-width="2">' +
    '<g fill="none" opacity=".45"><circle cx="16" cy="16" r="6"/><circle cx="32" cy="16" r="6"/>' +
    '<circle cx="16" cy="32" r="6"/><circle cx="32" cy="48" r="6"/><circle cx="48" cy="32" r="6"/></g>' +
    '<g fill="#fff"><circle cx="48" cy="16" r="6"/><circle cx="32" cy="32" r="6"/><circle cx="16" cy="48" r="6"/></g></svg>',
};

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function teardown() {
  if (current) { current.destroy(); current = null; }
  if (chat) { chat.destroy(); chat = null; }
  cleanups.forEach((f) => f());
  cleanups = [];
}

const totalText = () => (isOnline() ? getTotal() + ' players online' : 'Offline · start the server');

function refreshPresence() {
  const t = document.getElementById('total');
  if (t) t.textContent = totalText();
  GAMES.forEach((g) => {
    const el = document.getElementById('on-' + g.id);
    if (el) el.textContent = getOnline(g.id);
  });
}

function cardHtml(g) {
  return (
    '<button class="card" data-id="' + g.id + '">' +
    '<div class="art">' + (ART[g.id] || '<span class="initial">' + g.name[0] + '</span>') + '</div>' +
    '<div class="info"><h2>' + g.name + '</h2><p>' + g.tagline + '</p>' +
    '<div class="meta"><span class="badge">' +
    (g.tier === 'verified' ? 'Fully verified' : 'Referee-settled') + '</span>' +
    '<span class="on"><i class="dot"></i><b id="on-' + g.id + '">' + getOnline(g.id) + '</b>&nbsp;playing</span></div></div>' +
    '<span class="go">→</span></button>'
  );
}

function showLobby() {
  teardown();
  send('status', { game: null });
  app.innerHTML =
    '<div class="scroll">' +
    '<header class="top"><div class="brand"><span class="mark"></span>ChatFi <b>Play</b></div>' +
    '<button class="pill dark" id="wallet">Connect wallet</button></header>' +
    '<section class="hero">' +
    '<div class="eyebrow"><span class="live"></span><span id="total">' + totalText() + '</span></div>' +
    '<h1>Play. Stake.<br/>Win the pot.</h1>' +
    '<p>1v1 games where the winner takes it all. Every move verifiable.</p>' +
    '<button class="pill light" id="quick">Quick play <span>→</span></button></section>' +
    '<h3 class="sec">Games</h3><div class="games">' + GAMES.map(cardHtml).join('') + '</div>' +
    '<h3 class="sec">Coming soon</h3>' +
    '<div class="chips"><span>Chess</span><span>Battleship</span><span>Pool</span><span>Your game?</span></div>' +
    '<section class="dev"><h4>Building a game?</h4>' +
    '<p>Bring it to ChatFi and plug into the 1v1 wager system. Developer access is coming.</p></section>' +
    '</div>';

  app.querySelectorAll('.card').forEach((el) =>
    el.addEventListener('click', () => showMode(GAMES.find((g) => g.id === el.dataset.id))));
  document.getElementById('wallet').addEventListener('click', () => toast('Wallet connect is coming next'));
  document.getElementById('quick').addEventListener('click', () =>
    startSearch(GAMES[Math.floor(Math.random() * GAMES.length)]));

  cleanups.push(on('presence', refreshPresence));
  cleanups.push(on('connection', refreshPresence));
}

function showMode(g) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML =
    '<div class="sheet"><h3></h3><p>Choose how to play</p>' +
    '<button class="btn primary" id="m-online">Play online</button>' +
    '<button class="btn ghost" id="m-local">Play on this phone</button></div>';
  bg.querySelector('h3').textContent = g.name;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  bg.querySelector('#m-online').addEventListener('click', () => { bg.remove(); startSearch(g); });
  bg.querySelector('#m-local').addEventListener('click', () => { bg.remove(); openGame(g); });
}

function startSearch(g) {
  if (!isOnline()) { toast('Server not reachable. Run: npm run server'); return; }
  teardown();
  app.innerHTML =
    '<div class="search"><div class="spinner"></div><h2>Finding an opponent…</h2>' +
    '<p id="sp"></p><button class="pill dark" id="cancel">Cancel</button></div>';
  const sp = document.getElementById('sp');
  const upd = () => { sp.textContent = g.name + ' · ' + getOnline(g.id) + ' in this game right now'; };
  upd();
  cleanups.push(on('presence', upd));
  cleanups.push(on('matched', (m) => openGame(g, m)));
  send('queue', { game: g.id });
  document.getElementById('cancel').addEventListener('click', () => { send('cancel'); showLobby(); });
}

function openGame(g, match) {
  teardown();
  app.innerHTML =
    '<div class="stage"><button class="back" id="back">‹ Lobby</button><div id="host"></div></div>';
  const stage = app.querySelector('.stage');
  const opts = {};

  if (match) {
    opts.online = {
      side: match.side,
      seed: match.seed,
      send: (move) => send('move', { data: move }),
      onMove: (cb) => { cleanups.push(on('move', (m) => cb(m.data))); },
    };
    const vs = document.createElement('div');
    vs.className = 'vs';
    vs.textContent = 'vs ' + match.opponent.name;
    stage.appendChild(vs);
    cleanups.push(on('opponent_left', () => {
      vs.textContent = 'Opponent left';
      toast('Opponent left the match');
    }));
  } else {
    send('status', { game: g.id });
  }

  current = g.mount(document.getElementById('host'), opts);

  if (match) {
    chat = mountChat(stage, {
      roomId: match.room,
      me,
      transport: {
        send: (msg) => send('chat', { data: msg }),
        onMessage: (cb) => { cleanups.push(on('chat', (m) => cb(m.data))); },
        close: () => {},
      },
    });
  }

  document.getElementById('back').addEventListener('click', showLobby);
}

showLobby();
