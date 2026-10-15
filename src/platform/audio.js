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
  ambient(v) { setAmbient(v); },
  lounge(v) { setLounge(v); },
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

// ---- war ambience: distant gunfire + faint wind (kept deliberately quiet) ----
const amb = { want: false, timer: null, bus: null, wind: null };

function ambBus() {
  if (amb.bus) return amb.bus;
  const input = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  input.connect(lp);
  lp.connect(out);
  out.connect(master);
  const d = ctx.createDelay(0.6);
  d.delayTime.value = 0.28;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  lp.connect(d);
  d.connect(fb);
  fb.connect(d);
  d.connect(out);
  amb.bus = input;
  return input;
}

function gunshot(vol, pan, delay) {
  const t0 = ctx.currentTime + delay;
  const dest = ambBus();
  let outNode = dest;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    outNode = p;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400 + Math.random() * 1200;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09 + Math.random() * 0.05);
  src.connect(bp);
  bp.connect(g);
  g.connect(outNode);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + 0.2);

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, t0);
  osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(vol * 0.9, t0);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
  osc.connect(og);
  og.connect(outNode);
  osc.start(t0);
  osc.stop(t0 + 0.2);
}

function ambTick() {
  amb.timer = null;
  if (!amb.want) return;
  if (on && ctx && ctx.state === 'running') {
    const r = Math.random(), pan = Math.random() * 1.6 - 0.8;
    const v = 0.22 + Math.random() * 0.14; // overall gunfire loudness: raise or lower these
    if (r < 0.55) {
      gunshot(v, pan, 0);
    } else if (r < 0.85) {
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) gunshot(v * (0.8 + Math.random() * 0.4), pan, i * (0.075 + Math.random() * 0.03));
    } else {
      gunshot(v * 1.2, pan, 0);
      gunshot(v * 0.7, -pan, 0.45);
      gunshot(v * 0.6, pan, 0.8);
    }
  }
  amb.timer = setTimeout(ambTick, 900 + Math.random() * 3800);
}

function windOn() {
  if (amb.wind || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lg = ctx.createGain();
  lg.gain.value = 0.03;
  lfo.connect(lg);
  lg.connect(g.gain);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start();
  lfo.start();
  amb.wind = { stop() { try { src.stop(); lfo.stop(); } catch (_) {} } };
}

function setAmbient(v) {
  amb.want = v;
  if (v) {
    if (!ensure()) return;
    windOn();
    if (!amb.timer) amb.timer = setTimeout(ambTick, 1200);
  } else {
    clearTimeout(amb.timer);
    amb.timer = null;
    if (amb.wind) { amb.wind.stop(); amb.wind = null; }
  }
}

// ---- board game sounds + soft lounge ambience ----
SOUNDS.move = () => {
  burst(0.07, 1800, 500, 0.5, { type: 'bandpass' });
  tone(170, 0.09, { vol: 0.4, to: 90 });
};
SOUNDS.capture = () => {
  burst(0.09, 2400, 400, 0.65, { type: 'bandpass' });
  tone(140, 0.12, { vol: 0.5, to: 70 });
  burst(0.07, 1600, 400, 0.4, { type: 'bandpass', delay: 0.07 });
  tone(120, 0.1, { vol: 0.35, to: 60, delay: 0.07 });
};
SOUNDS.castle = () => {
  SOUNDS.move();
  burst(0.07, 1800, 500, 0.5, { type: 'bandpass', delay: 0.16 });
  tone(170, 0.09, { vol: 0.4, to: 90, delay: 0.16 });
};
SOUNDS.check = () => {
  tone(740, 0.12, { type: 'triangle', vol: 0.25 });
  tone(988, 0.22, { type: 'triangle', vol: 0.25, delay: 0.12 });
};
SOUNDS.promote = () =>
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.2, delay: i * 0.07 }));
SOUNDS.select = () => tone(660, 0.04, { type: 'triangle', vol: 0.12 });
SOUNDS.illegal = () => tone(180, 0.12, { type: 'square', vol: 0.08, to: 120 });

const lounge = { nodes: null };

function setLounge(v) {
  if (!v) {
    if (lounge.nodes) { lounge.nodes.stop(); lounge.nodes = null; }
    return;
  }
  if (lounge.nodes || !ensure()) return;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(out);
  out.connect(master);
  const oscs = [110, 164.81, 220, 277.18, 329.63].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = (i - 2) * 4;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    o.connect(g);
    g.connect(lp);
    o.start();
    return o;
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 0.2;
  lfo.connect(lg);
  lg.connect(out.gain);
  lfo.start();
  lounge.nodes = {
    stop() { try { oscs.forEach((o) => o.stop()); lfo.stop(); out.disconnect(); } catch (_) {} },
  };
}
