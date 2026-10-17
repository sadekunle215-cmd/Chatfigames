import './platform/ui.css';
import { GAMES } from './registry.js';
import { getOnline, getTotal } from './presence.js';
import { connect, on, send, isOnline } from './platform/net.js';
import { mountChat } from './platform/chat.js';
import { audio } from './platform/audio.js';
import { themedCard, sheetBanner } from './platform/cards.js';
import { heroDecor } from './platform/hero.js';
import { wallet } from './platform/wallet.js';

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
  snooker:
    '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><rect x="7" y="18" width="50" height="28" rx="5"/><circle cx="20" cy="32" r="3.6" fill="#fff"/><circle cx="36" cy="27" r="3.6" fill="#fff" fill-opacity=".5"/><circle cx="42" cy="36" r="3.6" fill="#fff" fill-opacity=".5"/><path d="M4 52 30 33"/></svg>',
  chess:
    '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M32 7v9M27.5 11.5h9"/><path d="M22 30c0-6 4-10 10-10s10 4 10 10c0 4-2 6-4 8l3 10H23l3-10c-2-2-4-4-4-8z"/><path d="M19 53h26v4H19z" fill="#fff"/></svg>',
  checkers:
    '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"><ellipse cx="32" cy="41" rx="17" ry="8"/><path d="M15 41v7c0 4 8 8 17 8s17-4 17-8v-7"/><ellipse cx="32" cy="29" rx="17" ry="8" fill="#fff" fill-opacity=".25"/></svg>',
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
  audio.lounge(false);
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

const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);
let authNonce = null, authed = false, lastAddr = null;
on('challenge', (m) => { authNonce = m.nonce; authed = false; });
wallet.subscribe(() => {
  if (wallet.state.address !== lastAddr) { lastAddr = wallet.state.address; authed = false; }
});
setTimeout(() => wallet.restore(), 500);

function sheet(html) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = '<div class="sheet">' + html + '</div>';
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}

function showWalletInstall() {
  const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
  const st = 'display:block;text-align:center;text-decoration:none;';
  sheet('<h3>Connect a wallet</h3><p>Open ChatFi Play inside your wallet app to connect.</p>' +
    '<a class="btn primary" style="' + st + '" href="https://phantom.app/ul/browse/' + here + '?ref=' + ref + '">Open in Phantom</a>' +
    '<a class="btn ghost" style="' + st + '" href="https://solflare.com/ul/v1/browse/' + here + '?ref=' + ref + '">Open in Solflare</a>' +
    '<a class="btn ghost" style="' + st + '" href="https://chatfi.pro" target="_blank" rel="noopener">Open in ChatFi</a>');
}

function showWalletSheet() {
  const s = wallet.state;
  const bg = sheet('<h3>Wallet</h3><p>' + short(s.address) + ' · ' + wallet.network + '</p><p>' +
    (s.balance == null ? '' : s.balance.toFixed(2) + ' USDC') +
    '</p><button class="btn ghost" id="w-out">Disconnect</button>');
  bg.querySelector('#w-out').addEventListener('click', () => { wallet.disconnect(); bg.remove(); });
}

async function connectFlow() {
  try { await wallet.connect(); return true; }
  catch (e) {
    if (e && e.code === 'no-wallet') showWalletInstall();
    else toast('Wallet connection cancelled');
    return false;
  }
}

function ensureAuth() {
  if (authed) return Promise.resolve(true);
  if (!isOnline() || !authNonce) { toast('Server unreachable. Try again in a moment.'); return Promise.resolve(false); }
  return wallet.sign(authNonce).then((r) => new Promise((resolve) => {
    const off1 = on('auth_ok', () => { off1(); off2(); authed = true; resolve(true); });
    const off2 = on('auth_fail', () => { off1(); off2(); toast('Wallet verification failed'); resolve(false); });
    send('auth', { pubkey: r.pubkey, sig: r.sig });
  })).catch(() => { toast('Signature cancelled'); return false; });
}

async function showStakePicker(g) {
  if (!wallet.state.address && !(await connectFlow())) return;
  if (!(await ensureAuth())) return;
  const bg = sheet('<h3>' + g.name + '</h3><p>Pick a test stake (devnet, no real funds move yet)</p>' +
    '<button class="btn primary" data-s="1">1 USDC</button>' +
    '<button class="btn primary" data-s="5">5 USDC</button>' +
    '<button class="btn primary" data-s="10">10 USDC</button>');
  bg.querySelectorAll('[data-s]').forEach((b) =>
    b.addEventListener('click', () => { bg.remove(); startSearch(g, Number(b.dataset.s)); }));
}

function bindWallet() {
  const b = document.getElementById('wallet');
  const paint = () => {
    const s = wallet.state;
    b.textContent = s.address
      ? short(s.address) + (s.balance != null ? ' · ' + s.balance.toFixed(2) + ' USDC' : '')
      : 'Connect wallet';
  };
  paint();
  cleanups.push(wallet.subscribe(paint));
  b.addEventListener('click', () => {
    if (wallet.state.address) showWalletSheet();
    else connectFlow();
  });
}

function showLobby() {
  teardown();
  send('status', { game: null });
  app.innerHTML =
    '<div class="scroll">' +
    '<header class="top"><div class="brand"><span class="mark"></span>ChatFi <b>Play</b></div>' +
    '<div class="tools"><span id="snd-slot"></span><button class="pill dark" id="wallet">Connect wallet</button></div></header>' +
    '<section class="hero">' + heroDecor() +
    '<div class="eyebrow"><span class="live"></span><span id="total">' + totalText() + '</span></div>' +
    '<h1>Play. Stake.<br/><span class="gold">Win the pot.</span></h1>' +
    '<p>1v1 games where the winner takes it all. Every move verifiable.</p>' +
    '<div class="steps"><span><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg> Pick a game</span><span><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.84 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/></svg> Stake</span><span><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg> Win</span></div>' +
    '<button class="pill light" id="quick">Quick play <span>→</span></button>' +
    '<span class="soon">Free play now · test stakes on devnet, no real funds yet</span></section>' +
    '<h3 class="sec">Games</h3><div class="games">' + GAMES.map((g, i) => themedCard(g, getOnline(g.id), i)).join('') + '</div>' +
    '<h3 class="sec">Coming soon</h3>' +
    '<div class="chips"><span>Battleship</span><span>Reversi</span><span>Air Hockey</span><span>Pool</span><span>Your game?</span></div>' +
    '<section class="dev"><h4>Building a game?</h4>' +
    '<p>Bring it to ChatFi and plug into the 1v1 wager system. Developer access is coming.</p></section>' +
    '</div>';

  document.getElementById('snd-slot').replaceWith(soundButton());
  app.querySelectorAll('.card').forEach((el) =>
    el.addEventListener('click', () => showMode(GAMES.find((g) => g.id === el.dataset.id))));
  bindWallet();
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
    '<button class="btn ghost" id="m-stake">Play online · test stake</button>' +
    '<button class="btn ghost" id="m-bot">Play vs bot</button>' +
    '<button class="btn ghost" id="m-local">Play on this phone (2 players)</button></div>';
  bg.querySelector('.sheet').insertAdjacentHTML('afterbegin', sheetBanner(g));
  bg.querySelector('h3').remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  bg.querySelector('#m-online').addEventListener('click', () => { bg.remove(); startSearch(g); });
  bg.querySelector('#m-stake').addEventListener('click', () => { bg.remove(); showStakePicker(g); });
  if (g.local === false) bg.querySelector('#m-local').remove();
  else bg.querySelector('#m-local').addEventListener('click', () => { bg.remove(); openGame(g); });
  const botBtn = bg.querySelector('#m-bot');
  if (g.bot) botBtn.addEventListener('click', () => { bg.remove(); openGame(g, null, true); });
  else botBtn.remove();
}

function startSearch(g, stake = 0) {
  if (!isOnline()) { toast('Server unreachable. Starting a game vs the bot.'); openGame(g, null, true); return; }
  teardown();
  app.innerHTML =
    '<div class="search"><div class="spinner"></div><h2>Finding an opponent…</h2>' +
    '<p id="sp"></p><button class="pill dark" id="cancel">Cancel</button>' +
    '<button class="pill light" id="botbtn" style="display:none;border:1px solid #e3e3df">No one yet? Play vs bot</button></div>';
  const sp = document.getElementById('sp');
  const upd = () => { sp.textContent = g.name + (stake ? ' · ' + stake + ' USDC test stake' : '') + ' · ' + getOnline(g.id) + ' in this game right now'; };
  upd();
  cleanups.push(on('presence', upd));
  cleanups.push(on('matched', (m) => { audio.play('match'); openGame(g, m); }));
  send('queue', { game: g.id, stake });
  cleanups.push(on('stake_error', (m) => { toast(m.msg); showLobby(); }));
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
    vs.textContent = 'vs ' + match.opponent.name + (match.stake ? ' · pot ' + match.stake * 2 + ' USDC (test)' : '');
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
  if (g.ambient === 'lounge') audio.lounge(true);

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
