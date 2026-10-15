import './platform/ui.css';
import { GAMES } from './registry.js';
import { getOnline, getTotal } from './presence.js';
import { connect, on, send, isOnline } from './platform/net.js';
import { mountChat } from './platform/chat.js';
import { audio } from './platform/audio.js';

const app = document.getElementById('app');
const me = {
  id: Math.random().toString(36).slice(2, 8),
  name: 'Player ' + Math.floor(1000 + Math.random() * 9000),
};
let current = null, chat = null, cleanups = [], rotDismissed = false;

connect(me.name);

const SVG = (inner) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
const ICON_ON = SVG('<path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/>');
const ICON_OFF = SVG('<path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor"/><path d="M16 9l5 6"/><path d="M21 9l-5 6"/>');
const ICON_FS = SVG('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');

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

// Sound unlock + click sounds
['pointerdown', 'touchend', 'click'].forEach((ev) =>
  window.addEventListener(ev, () => audio.unlock(), { passive: true }));
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('button')) audio.play('click');
});

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function leaveFullscreen() {
  if (!document.fullscreenElement) return;
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
  document.exitFullscreen().catch(() => {});
}

function teardown() {
  if (current) { current.destroy(); current = null; }
  if (chat) { chat.destroy(); chat = null; }
  cleanups.forEach((f) => f());
  audio.ambient(false);
  cleanups = [];
  leaveFullscreen();
}

async function toggleLandscape() {
  if (document.fullscreenElement) { leaveFullscreen(); return; }
  try {
    await document.documentElement.requestFullscreen();
  } catch (_) {
    toast('Fullscreen is not supported here. Rotate your phone instead.');
    return;
  }
  try { await screen.orientation.lock('landscape'); } catch (_) { /* rotate manually */ }
}

function soundButton() {
  const b = document.createElement('button');
  b.className = 'iconbtn';
  b.setAttribute('aria-label', 'Sound');
  const paint = (v) => { b.innerHTML = v ? ICON_ON : ICON_OFF; b.classList.toggle('off', !v); };
  paint(audio.enabled);
  b.addEventListener('click', () => audio.toggle());
  cleanups.push(audio.subscribe(paint));
  return b;
}

const totalText = () => (isOnline() ? getTotal() + ' players online' : 'Offline · reconnecting...');

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
    '<div class="tools"><span id="snd-slot"></span><button class="pill dark" id="wallet">Connect wallet</button></div></header>' +
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

  document.getElementById('snd-slot').replaceWith(soundButton());
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
    '<button class="btn ghost" id="m-bot">Play vs bot</button>' +
    '<button class="btn ghost" id="m-local">Play on this phone (2 players)</button></div>';
  bg.querySelector('h3').textContent = g.name;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  bg.querySelector('#m-online').addEventListener('click', () => { bg.remove(); startSearch(g); });
  if (g.local === false) bg.querySelector('#m-local').remove();
  else bg.querySelector('#m-local').addEventListener('click', () => { bg.remove(); openGame(g); });
  const botBtn = bg.querySelector('#m-bot');
  if (g.bot) botBtn.addEventListener('click', () => { bg.remove(); openGame(g, null, true); });
  else botBtn.remove();
}

function startSearch(g) {
  if (!isOnline()) { toast('Server unreachable. Starting a game vs the bot.'); openGame(g, null, true); return; }
  teardown();
  app.innerHTML =
    '<div class="search"><div class="spinner"></div><h2>Finding an opponent…</h2>' +
    '<p id="sp"></p><button class="pill dark" id="cancel">Cancel</button>' +
    '<button class="pill light" id="botbtn" style="display:none;border:1px solid #e3e3df">No one yet? Play vs bot</button></div>';
  const sp = document.getElementById('sp');
  const upd = () => { sp.textContent = g.name + ' · ' + getOnline(g.id) + ' in this game right now'; };
  upd();
  cleanups.push(on('presence', upd));
  cleanups.push(on('matched', (m) => { audio.play('match'); openGame(g, m); }));
  send('queue', { game: g.id });
  const botTimer = setTimeout(() => {
    const bb = document.getElementById('botbtn');
    if (bb) bb.style.display = '';
  }, 12000);
  cleanups.push(() => clearTimeout(botTimer));
  document.getElementById('botbtn').addEventListener('click', () => { send('cancel'); openGame(g, null, true); });
  document.getElementById('cancel').addEventListener('click', () => { send('cancel'); showLobby(); });
}

// Real-time channel: buffers server messages until the game scene is ready for them
function rtChannel() {
  const buf = { rt_in: [], rt_sync: [] }, subs = {};
  ['rt_in', 'rt_sync'].forEach((t) =>
    cleanups.push(on(t, (m) => { if (subs[t]) subs[t](m); else buf[t].push(m); })));
  return {
    send: (data) => send('rt_in', { data }),
    on: (t, cb) => { subs[t] = cb; buf[t].forEach(cb); buf[t].length = 0; },
  };
}

function openGame(g, match, vsBot) {
  teardown();
  app.innerHTML =
    '<div class="stage"><button class="back" id="back">‹ Lobby</button><div id="host"></div></div>';
  const stage = app.querySelector('.stage');
  const opts = { audio };
  if (vsBot) opts.bot = { side: 1 };

  if (match) {
    opts.online = {
      side: match.side,
      seed: match.seed,
      send: (move) => send('move', { data: move }),
      onMove: (cb) => { cleanups.push(on('move', (m) => cb(m.data))); },
      rt: rtChannel(),
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

  // Bottom-left controls: sound + landscape
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.appendChild(soundButton());
  if (g.orientation === 'landscape' && document.fullscreenEnabled) {
    const fs = document.createElement('button');
    fs.className = 'iconbtn';
    fs.setAttribute('aria-label', 'Landscape fullscreen');
    fs.innerHTML = ICON_FS;
    fs.addEventListener('click', toggleLandscape);
    dock.appendChild(fs);
  }
  stage.appendChild(dock);

  // Rotate hint for landscape games while the phone is upright
  if (g.orientation === 'landscape' && window.matchMedia) {
    const mq = window.matchMedia('(orientation: portrait)');
    const hint = document.createElement('div');
    hint.className = 'rot';
    hint.innerHTML = '<span>↻</span>Rotate your phone for a bigger battlefield';
    hint.addEventListener('click', () => { rotDismissed = true; hint.remove(); });
    const upd = () => {
      if (mq.matches && !rotDismissed) { if (!hint.isConnected) stage.appendChild(hint); }
      else hint.remove();
    };
    upd();
    mq.addEventListener('change', upd);
    cleanups.push(() => mq.removeEventListener('change', upd));
  }

  current = g.mount(document.getElementById('host'), opts);
  if (g.ambient === 'war') audio.ambient(true);

  if (match) {
    chat = mountChat(stage, {
      roomId: match.room,
      me,
      onIncoming: () => audio.play('chat'),
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
