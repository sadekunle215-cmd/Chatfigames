const KEY = 'chatfi-sound';
let ctx = null, master = null, noiseBuf = null;
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch (_) {}
const subs = [];

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.7 : 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise() {
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tone(freq, dur, o = {}) {
  const t0 = ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  const v = o.vol == null ? 0.3 : o.vol;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function burst(dur, f0, f1, vol, o = {}) {
  const t0 = ctx.currentTime + (o.delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const flt = ctx.createBiquadFilter();
  flt.type = o.type || 'lowpass';
  flt.frequency.setValueAtTime(f0, t0);
  flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  click: () => tone(520, 0.06, { type: 'triangle', vol: 0.18, to: 380 }),
  match: () => {
    tone(523, 0.14, { vol: 0.25 });
    tone(659, 0.14, { vol: 0.25, delay: 0.12 });
    tone(784, 0.22, { vol: 0.25, delay: 0.24 });
  },
  launch: () => {
    burst(0.7, 2200, 200, 0.45, { type: 'bandpass' });
    tone(140, 0.5, { type: 'sawtooth', vol: 0.1, to: 60 });
  },
  boom: () => {
    burst(1.1, 1400, 60, 0.7);
    tone(90, 0.7, { type: 'sine', vol: 0.45, to: 30 });
    burst(0.25, 5000, 800, 0.25);
  },
  hit: () => {
    tone(300, 0.22, { type: 'square', vol: 0.1, to: 120 });
    tone(220, 0.3, { type: 'sawtooth', vol: 0.08, to: 90, delay: 0.05 });
  },
  drop: () => {
    tone(220, 0.09, { type: 'triangle', vol: 0.3, to: 120 });
    burst(0.06, 3000, 600, 0.15);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.28, delay: i * 0.13 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.34, { type: 'sawtooth', vol: 0.12, delay: i * 0.16 })),
  chat: () => {
    tone(880, 0.09, { vol: 0.2 });
    tone(1175, 0.12, { vol: 0.2, delay: 0.09 });
  },
};

export const audio = {
  get enabled() { return on; },
  unlock() { ensure(); },
  play(name) {
    if (!on || !SOUNDS[name]) return;
    if (!ctx || ctx.state !== 'running') { ensure(); return; }
    SOUNDS[name]();
  },
  toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (_) {}
    if (master) master.gain.value = on ? 0.7 : 0;
    if (on) ensure();
    subs.forEach((f) => f(on));
    return on;
  },
  subscribe(cb) {
    subs.push(cb);
    return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
  },
};
