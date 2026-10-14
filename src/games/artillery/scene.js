import Phaser from 'phaser';
import { W, H, R, LIVES, TUBE, PIVOT, makeState, simulate } from './sim.js';

const K = 1.5; // unit scale
const FONT = 'Space Grotesk, Inter, sans-serif';
const HURT = ['Ouch!', 'Medic!', 'That hurt!', 'Incoming!', 'Not again...'];
const TEAM = [
  { hull: 0x4f6b2f, dark: 0x34471e, light: 0x6f8f45, accent: 0xa6c36f, skin: 0xe0ac82 },
  { hull: 0x9a7b4f, dark: 0x6e5636, light: 0xb9986a, accent: 0xe0b46a, skin: 0x8d5a3b, scar: true },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ch = (c, s) => (c >> s) & 255;
const lerpC = (a, b, t) =>
  (Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t) << 16) |
  (Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t) << 8) |
  Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);

function poly(g, color, alpha, pts) {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillPath();
}

function arcPts(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function heart(g, x, y, s, color) {
  g.fillStyle(color, 1);
  g.fillCircle(x - s * 0.5, y - s * 0.3, s * 0.55);
  g.fillCircle(x + s * 0.5, y - s * 0.3, s * 0.55);
  poly(g, color, 1, [[x - s * 1.03, y - s * 0.1], [x + s * 1.03, y - s * 0.1], [x, y + s]]);
}

// Soldier face. mood: neutral | focus | hurt | dead
function drawFace(g, cx, cy, s, tm, mood) {
  const dead = mood === 'dead', hurt = mood === 'hurt', focus = mood === 'focus';
  const skinD = lerpC(tm.skin, 0x000000, 0.25);

  // shoulders + neck
  poly(g, tm.hull, 1, [[cx - s * 1.3, cy + s * 1.7], [cx - s * 0.8, cy + s * 0.85], [cx + s * 0.8, cy + s * 0.85], [cx + s * 1.3, cy + s * 1.7]]);
  g.fillStyle(skinD, 1);
  g.fillRect(cx - s * 0.32, cy + s * 0.55, s * 0.64, s * 0.4);

  // ears + face
  g.fillStyle(tm.skin, 1);
  g.fillCircle(cx - s * 0.88, cy + s * 0.1, s * 0.2);
  g.fillCircle(cx + s * 0.88, cy + s * 0.1, s * 0.2);
  g.fillEllipse(cx, cy + s * 0.05, s * 1.7, s * 2.0);
  g.fillStyle(skinD, 0.35);
  g.fillEllipse(cx, cy + s * 0.75, s * 1.2, s * 0.5);

  // helmet
  poly(g, tm.hull, 1, arcPts(cx, cy - s * 0.2, s * 1.02, s * 0.95, Math.PI, Math.PI * 2, 14));
  poly(g, tm.dark, 1, [[cx - s * 1.1, cy - s * 0.22], [cx + s * 1.1, cy - s * 0.22], [cx + s * 1.1, cy - s * 0.06], [cx - s * 1.1, cy - s * 0.06]]);
  g.fillStyle(0xffffff, 0.14);
  g.fillEllipse(cx - s * 0.35, cy - s * 0.85, s * 0.5, s * 0.22);

  // chin strap
  g.lineStyle(Math.max(1, s * 0.08), 0x1c1c1c, 0.8);
  g.beginPath(); g.moveTo(cx - s * 0.86, cy - s * 0.05); g.lineTo(cx - s * 0.55, cy + s * 0.85); g.strokePath();
  g.beginPath(); g.moveTo(cx + s * 0.86, cy - s * 0.05); g.lineTo(cx + s * 0.55, cy + s * 0.85); g.strokePath();

  // eyes
  const ey = cy + s * 0.16, ex = s * 0.4, lw = Math.max(1, s * 0.1);
  if (dead) {
    g.lineStyle(lw, 0x222222, 1);
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex;
      g.beginPath(); g.moveTo(x - s * 0.16, ey - s * 0.14); g.lineTo(x + s * 0.16, ey + s * 0.14); g.strokePath();
      g.beginPath(); g.moveTo(x + s * 0.16, ey - s * 0.14); g.lineTo(x - s * 0.16, ey + s * 0.14); g.strokePath();
    }
  } else if (hurt) {
    g.lineStyle(lw, 0x222222, 1);
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex;
      g.beginPath();
      g.moveTo(x + sx * s * 0.18, ey - s * 0.14);
      g.lineTo(x - sx * s * 0.14, ey);
      g.lineTo(x + sx * s * 0.18, ey + s * 0.14);
      g.strokePath();
    }
  } else {
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex;
      g.fillStyle(0xffffff, 1); g.fillEllipse(x, ey, s * 0.38, s * 0.24);
      g.fillStyle(0x2b1b12, 1); g.fillCircle(x, ey, s * 0.095);
    }
  }

  // brows
  if (!dead) {
    g.lineStyle(Math.max(1, s * 0.12), 0x2a1a10, 1);
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex;
      const oy = focus ? ey - s * 0.3 : hurt ? ey - s * 0.2 : ey - s * 0.26;
      const iy = focus ? ey - s * 0.12 : hurt ? ey - s * 0.36 : ey - s * 0.27;
      g.beginPath();
      g.moveTo(x + sx * s * 0.24, oy);
      g.lineTo(x - sx * s * 0.24, iy);
      g.strokePath();
    }
  }

  // nose
  g.lineStyle(Math.max(1, s * 0.07), skinD, 0.9);
  g.beginPath(); g.moveTo(cx, ey + s * 0.05); g.lineTo(cx - s * 0.1, cy + s * 0.5); g.lineTo(cx + s * 0.07, cy + s * 0.52); g.strokePath();

  // mouth
  const my = cy + s * 0.72;
  if (hurt) {
    g.fillStyle(0x4a1414, 1); g.fillEllipse(cx, my, s * 0.42, s * 0.36);
  } else {
    g.lineStyle(Math.max(1, s * 0.09), 0x4a1e1a, 1);
    g.beginPath();
    g.moveTo(cx - s * 0.26, my + (focus ? s * 0.05 : 0));
    g.lineTo(cx, my + (focus ? 0 : s * 0.02));
    g.lineTo(cx + s * 0.26, my + (focus ? s * 0.05 : 0));
    g.strokePath();
  }

  // soot when hurt, scar for character
  if (hurt || dead) {
    g.fillStyle(0x1a1a1a, 0.3);
    g.fillCircle(cx - s * 0.45, cy + s * 0.4, s * 0.26);
    g.fillCircle(cx + s * 0.4, cy + s * 0.2, s * 0.2);
  }
  if (tm.scar) {
    g.lineStyle(Math.max(1, s * 0.06), 0x8a3d2e, 0.9);
    g.beginPath(); g.moveTo(cx + s * 0.3, cy + s * 0.02); g.lineTo(cx + s * 0.58, cy + s * 0.45); g.strokePath();
  }
}

class Duel extends Phaser.Scene {
  create() {
    const opts = this.registry.get('opts') || {};
    this.online = opts.online || null;
    this.audio = opts.audio || null;
    this.state = makeState(this.online ? this.online.seed : (Math.random() * 4294967296) >>> 0);
    this.barrel = [60, 120];
    this.busy = false;
    this.aim = null;
    this.preview = null;
    this.rocket = null;
    this.rocketOwner = -1;
    this.parts = [];
    this.hurtUntil = [0, 0];
    this.bubble = [null, null];
    this.clouds = [
      { x: 80, y: 60, s: 1, v: 6 }, { x: 300, y: 110, s: 0.8, v: 4 }, { x: 520, y: 50, s: 1.2, v: 7 },
      { x: 700, y: 130, s: 0.9, v: 5 }, { x: 180, y: 150, s: 0.7, v: 3 },
    ];

    this.sky = this.add.graphics().setDepth(0);
    this.cloudG = this.add.graphics().setDepth(1);
    this.ter = this.add.graphics().setDepth(2);
    this.unitG = this.add.graphics().setDepth(3);
    this.fx = this.add.graphics().setDepth(4);
    this.hud = this.add.graphics().setDepth(5);

    this.drawSky();
    this.drawTerrain();

    this.ui = this.add
      .text(W / 2, 14, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b1a2b', strokeThickness: 4 })
      .setOrigin(0.5, 0).setDepth(10);
    this.names = [0, 1].map((i) => {
      const label = this.online ? (i === this.online.side ? 'YOU' : 'ENEMY') : 'P' + (i + 1);
      return this.add
        .text(i === 0 ? 80 : W - 90, 16, label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff' })
        .setDepth(10);
    });
    this.btxt = [0, 1].map(() =>
      this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#111111' })
        .setOrigin(0.5).setDepth(10).setVisible(false));

    this.input.on('pointerdown', (p) => {
      if (this.state.winner !== null) { if (!this.online) this.scene.restart(); return; }
      if (this.busy || !this.myTurn()) return;
      this.aim = { sx: p.x, sy: p.y, angle: this.barrel[this.state.turn], power: 0 };
    });
    this.input.on('pointermove', (p) => this.updateAim(p));
    this.input.on('pointerup', (p) => {
      if (!this.aim) return;
      this.updateAim(p);
      const a = this.aim;
      this.aim = null;
      this.preview = null;
      if (a.power < 10) { this.refreshUi(); return; }
      this.fire(a.angle, a.power);
    });

    if (this.online) this.online.onMove((m) => this.remoteMove(m));
    this.refreshUi();
  }

  sfx(n) {
    if (this.audio) this.audio.play(n);
  }

  endSound(w) {
    if (w === 'draw') return;
    this.sfx(this.online ? (w === this.online.side ? 'win' : 'lose') : 'win');
  }

  myTurn() {
    return !this.online || this.state.turn === this.online.side;
  }

  mood(i) {
    const k = this.state.tanks[i];
    if (k.lives <= 0) return 'dead';
    if (this.hurtUntil[i] > this.time.now) return 'hurt';
    if (this.aim && this.state.turn === i && this.aim.power >= 10) return 'focus';
    return 'neutral';
  }

  updateAim(p) {
    if (!this.aim) return;
    const dx = this.aim.sx - p.x, dy = this.aim.sy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let ang = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
    if (ang < 0) ang = dx >= 0 ? 0 : 180;
    this.aim.angle = clamp(ang, 0, 180);
    this.aim.power = clamp(Math.round(dist / 1.5), 0, 100);
    this.barrel[this.state.turn] = this.aim.angle;
    this.preview = this.aim.power >= 10
      ? simulate(this.state, { angle: this.aim.angle, power: this.aim.power }).path.slice(0, 70)
      : null;
    this.refreshUi();
  }

  remoteMove(m) {
    if (this.busy) { this.time.delayedCall(100, () => this.remoteMove(m)); return; }
    if (!m || !Number.isInteger(m.angle) || !Number.isInteger(m.power)) return;
    if (m.angle < 0 || m.angle > 180 || m.power < 10 || m.power > 100) return;
    if (this.state.winner !== null || this.myTurn()) return;
    this.barrel[this.state.turn] = m.angle;
    this.fire(m.angle, m.power, true);
  }

  fire(angle, power, remote) {
    this.busy = true;
    if (this.online && !remote) this.online.send({ angle, power });
    const prev = this.state, who = prev.turn;
    this.rocketOwner = who;
    this.sfx('launch');
    const rad = (angle * Math.PI) / 180, k = prev.tanks[who];
    const tx = k.x + Math.cos(rad) * TUBE, ty = prev.heights[k.x] - PIVOT - Math.sin(rad) * TUBE;
    this.emit('fire', tx, ty, 8);
    this.emit('smoke', tx, ty, 6);
    this.emit('spark', tx, ty, 8);

    const res = simulate(prev, { angle, power });
    const path = res.path, last = path.length - 1;
    this.tweens.addCounter({
      from: 0,
      to: last,
      duration: clamp(path.length * 9, 400, 2400),
      onUpdate: (tw) => {
        const i = Math.max(1, Math.floor(tw.getValue()));
        const p = path[i], q = path[i - 1];
        const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
        this.rocket = { x: p[0], y: p[1], ang };
        this.emit('trail', p[0] - Math.cos(ang) * 10, p[1] - Math.sin(ang) * 10, 2);
      },
      onComplete: () => {
        this.rocket = null;
        if (res.impact) this.blast(res.impact[0], res.impact[1]);
        this.state = res.next;
        this.drawTerrain();
        this.hitCheck(prev, res.next);
        if (res.next.winner !== null) this.time.delayedCall(700, () => this.endSound(res.next.winner));
        this.busy = false;
        this.refreshUi();
      },
    });
  }

  blast(x, y) {
    this.emit('fire', x, y, 26);
    this.emit('smoke', x, y, 16);
    this.emit('debris', x, y, 22);
    this.emit('spark', x, y, 14);
    this.emit('ring', x, y, 1);
    this.sfx('boom');
    this.cameras.main.shake(280, 0.015);
    this.cameras.main.flash(90, 255, 235, 180);
  }

  hitCheck(prev, next) {
    for (let i = 0; i < 2; i++) {
      const lost = prev.tanks[i].lives - next.tanks[i].lives;
      if (lost <= 0) continue;
      const k = next.tanks[i], gy = next.heights[k.x];
      this.hurtUntil[i] = this.time.now + 1700;
      this.time.delayedCall(180, () => this.sfx('hit'));
      if (k.lives > 0) {
        this.bubble[i] = { text: HURT[Math.floor(Math.random() * HURT.length)], until: this.time.now + 1900 };
      } else {
        this.emit('fire', k.x, gy - 24, 24);
        this.emit('blacksmoke', k.x, gy - 24, 10);
        this.emit('debris', k.x, gy - 24, 14);
      }
      const t = this.add
        .text(k.x, gy - 70, '-' + lost + ' ❤', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#b3261e', strokeThickness: 4 })
        .setOrigin(0.5).setDepth(11);
      this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
    }
  }

  refreshUi() {
    const s = this.state;
    let txt;
    if (s.winner !== null) {
      const tail = this.online ? '' : ' Tap to restart';
      txt = s.winner === 'draw' ? 'Draw!' + tail
        : this.online ? (s.winner === this.online.side ? 'You win!' : 'You lose')
        : 'Player ' + (s.winner + 1) + ' wins!' + tail;
    } else if (this.online) {
      txt = s.turn === this.online.side ? 'Your turn · drag back to aim' : "Opponent's turn...";
    } else {
      txt = 'Player ' + (s.turn + 1) + ' · drag back to aim';
    }
    if (this.aim && this.aim.power >= 10 && s.winner === null) txt += '  ·  ' + this.aim.power + '%';
    this.ui.setText(txt);
  }

  // ---------- particles ----------
  emit(kind, x, y, n) {
    for (let q = 0; q < n; q++) {
      const a = Math.random() * 6.2832, r = Math.random();
      const base = { x, y, vx: 0, vy: 0, g: 0, t: 0, a0: 1, a1: 0, shape: 'c' };
      let o;
      switch (kind) {
        case 'fire':
          o = { vx: Math.cos(a) * (60 + r * 160), vy: Math.sin(a) * (60 + r * 160) - 30, life: 0.35 + r * 0.35, r0: 10 + r * 10, r1: 2, c0: 0xfff2a8, c1: 0xd9480f, a0: 0.95 }; break;
        case 'smoke':
          o = { vx: (Math.random() - 0.5) * 50, vy: -20 - r * 40, g: -10, life: 1 + r * 0.9, r0: 6, r1: 22 + r * 14, c0: 0x6b6b6b, c1: 0xbdbdbd, a0: 0.55 }; break;
        case 'debris':
          o = { vx: Math.cos(a) * (40 + r * 200), vy: -Math.abs(Math.sin(a)) * (120 + r * 220), g: 520, life: 0.9 + r * 0.6, r0: 2.5 + r * 2, r1: 1.5, c0: 0x5b4426, c1: 0x3a2a18, a1: 0.2, shape: 'r' }; break;
        case 'spark':
          o = { vx: Math.cos(a) * (100 + r * 220), vy: Math.sin(a) * (100 + r * 220) - 60, g: 300, life: 0.5, r0: 2.2, r1: 0.5, c0: 0xffe08a, c1: 0xff7a18 }; break;
        case 'trail':
          o = { vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, life: 0.7, r0: 3, r1: 9, c0: 0xe0e0e0, c1: 0x8a8a8a, a0: 0.6 }; break;
        case 'blacksmoke':
          o = { vx: (Math.random() - 0.5) * 24, vy: -30 - r * 30, g: -6, life: 1.4, r0: 5, r1: 18, c0: 0x2a2a2a, c1: 0x666666, a0: 0.6 }; break;
        case 'flame':
          o = { vx: (Math.random() - 0.5) * 16, vy: -40 - r * 40, life: 0.4, r0: 6, r1: 1, c0: 0xffd54a, c1: 0xd9480f, a0: 0.9 }; break;
        default:
          o = { life: 0.45, r0: 6, r1: R * 1.5, c0: 0xfff1c9, c1: 0xffffff, a0: 0.8, shape: 'o' };
      }
      this.parts.push(Object.assign(base, o));
    }
  }

  stepParticles(dt, g) {
    const keep = [];
    for (const p of this.parts) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const u = p.t / p.life;
      const col = lerpC(p.c0, p.c1, u), a = p.a0 + (p.a1 - p.a0) * u, r = p.r0 + (p.r1 - p.r0) * u;
      if (p.shape === 'r') { g.fillStyle(col, a); g.fillRect(p.x - r, p.y - r, r * 2, r * 2); }
      else if (p.shape === 'o') { g.lineStyle(3, col, a); g.strokeCircle(p.x, p.y, r); }
      else { g.fillStyle(col, a); g.fillCircle(p.x, p.y, r); }
      keep.push(p);
    }
    this.parts = keep.length > 450 ? keep.slice(keep.length - 450) : keep;
  }

  // ---------- scenery ----------
  drawSky() {
    const g = this.sky, n = 40;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const c = t < 0.55 ? lerpC(0x2a5c96, 0x78aad3, t / 0.55) : lerpC(0x78aad3, 0xf3d9ab, (t - 0.55) / 0.45);
      g.fillStyle(c, 1);
      g.fillRect(0, i * (H / n), W, Math.ceil(H / n) + 1);
    }
    [[78, 0.08], [54, 0.14], [34, 0.3], [22, 1]].forEach(([r, a]) => {
      g.fillStyle(0xfff4cc, a);
      g.fillCircle(610, 125, r);
    });
    this.ridge(g, 0x86a3bb, 215, 30, 0.011, 0);
    this.ridge(g, 0x647f93, 255, 24, 0.017, 2);
  }

  ridge(g, color, base, amp, f, ph) {
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      g.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 2) * amp * 0.4);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillPath();
  }

  drawTerrain() {
    const g = this.ter, h = this.state.heights;
    g.clear();
    g.fillStyle(0x6b5436, 1);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x < W; x += 2) g.lineTo(x, h[x]);
    g.lineTo(W, h[W - 1]); g.lineTo(W, H);
    g.closePath(); g.fillPath();
    g.fillStyle(0x4e3b26, 1);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x < W; x += 2) g.lineTo(x, Math.min(H, h[x] + 34));
    g.lineTo(W, H);
    g.closePath(); g.fillPath();
    g.lineStyle(7, 0x5f7a3a, 1);
    g.beginPath(); g.moveTo(0, h[0] + 2);
    for (let x = 2; x < W; x += 2) g.lineTo(x, h[x] + 2);
    g.strokePath();
    g.lineStyle(2, 0x93b25c, 1);
    g.beginPath(); g.moveTo(0, h[0] - 1);
    for (let x = 2; x < W; x += 2) g.lineTo(x, h[x] - 1);
    g.strokePath();
  }

  stepClouds(dt) {
    const g = this.cloudG;
    g.clear();
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 90) c.x = -90;
      [[0, 0, 26], [24, -8, 22], [-24, -4, 20], [46, 2, 17], [-44, 4, 15]].forEach(([px, py, r]) => {
        g.fillStyle(0xdbe6f0, 0.5);
        g.fillEllipse(c.x + px * c.s, c.y + py * c.s + 5, r * 2.1 * c.s, r * 1.3 * c.s);
        g.fillStyle(0xffffff, 0.85);
        g.fillEllipse(c.x + px * c.s, c.y + py * c.s, r * 2 * c.s, r * 1.3 * c.s);
      });
    }
  }

  // ---------- units ----------
  drawUnit(g, i) {
    const s = this.state, k = s.tanks[i], tm = TEAM[i];
    const gx = k.x, gy = s.heights[k.x], dead = k.lives <= 0;
    const slope = Math.atan2(s.heights[Math.min(W - 1, gx + 12)] - s.heights[Math.max(0, gx - 12)], 24);
    const tl = clamp(slope * 0.7, -0.2, 0.2), c = Math.cos(tl), sn = Math.sin(tl);
    const T = (u, v) => [gx + (u * c - v * sn) * K, gy + (u * sn + v * c) * K];
    const hull = dead ? 0x2c2c2a : tm.hull, dark = dead ? 0x1c1c1a : tm.dark, light = dead ? 0x3a3a38 : tm.light;

    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(gx, gy + 2, 64, 9);

    // tracks + wheels
    poly(g, 0x1d1f1c, 1, [T(-19, 0), T(19, 0), T(16, -8), T(-16, -8)]);
    for (const u of [-12, -6, 0, 6, 12]) {
      const p = T(u, -4);
      g.fillStyle(0x3b3e39, 1); g.fillCircle(p[0], p[1], 3.4 * K * 0.8);
      g.fillStyle(0x8a8d86, 1); g.fillCircle(p[0], p[1], 1.2 * K * 0.8);
    }

    // hull
    poly(g, hull, 1, [T(-17, -7), T(17, -7), T(13, -15), T(-13, -15)]);
    poly(g, light, 1, [T(-13, -15), T(13, -15), T(12, -13.2), T(-12, -13.2)]);
    poly(g, dark, 1, [T(-17, -7), T(17, -7), T(16.4, -9), T(-16.4, -9)]);
    if (!dead) {
      const e = T(0, -11);
      g.fillStyle(0xffffff, 0.85); g.fillCircle(e[0], e[1], 2.3 * K * 0.7);
      g.fillStyle(tm.accent, 1); g.fillCircle(e[0], e[1], 1.2 * K * 0.7);
      const a = T(-15, -15), b = T(-15, -33), w = Math.sin(this.time.now / 160 + i) * 2;
      g.lineStyle(1.6, 0x222222, 1);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokePath();
      poly(g, tm.accent, 1, [[b[0], b[1]], [b[0] + 13 + w, b[1] + 3], [b[0], b[1] + 8]]);
    }

    // soldier in the hatch
    if (!dead) drawFace(g, gx - 6 * K, gy - 26 * K, 5.2 * K, tm, this.mood(i));

    // turret dome
    const dx = gx + 3 * K, dy = gy - 15 * K;
    poly(g, hull, 1, arcPts(dx, dy, 11 * K, 8 * K, Math.PI, Math.PI * 2, 16));
    poly(g, dark, 1, [[dx - 11 * K, dy], [dx + 11 * K, dy], [dx + 10.5 * K, dy + 2 * K], [dx - 10.5 * K, dy + 2 * K]]);

    // rocket launcher tube
    const ang = ((dead ? 150 : this.barrel[i]) * Math.PI) / 180;
    const d = [Math.cos(ang), -Math.sin(ang)], nr = [Math.sin(ang), Math.cos(ang)];
    const px = gx, py = gy - PIVOT, th = 3.4;
    const q = (l, off) => [px + d[0] * l + nr[0] * off, py + d[1] * l + nr[1] * off];
    poly(g, 0x3d4046, 1, [q(-4, -th), q(TUBE, -th), q(TUBE, th), q(-4, th)]);
    poly(g, 0x5a5f66, 1, [q(TUBE - 7, -th - 1.2), q(TUBE, -th - 1.2), q(TUBE, th + 1.2), q(TUBE - 7, th + 1.2)]);
    g.fillStyle(dark, 1); g.fillCircle(px, py, 5.5);
    if (!dead && !(this.rocket && this.rocketOwner === i)) {
      poly(g, 0xd9322a, 1, [q(TUBE - 2, -2.6), q(TUBE + 9, 0), q(TUBE - 2, 2.6)]);
    }
  }

  drawBubble(g, i) {
    const b = this.bubble[i], t = this.btxt[i];
    if (!b || this.time.now > b.until) { t.setVisible(false); return; }
    const k = this.state.tanks[i], gy = this.state.heights[k.x];
    const hx = k.x - 6 * K, hy = gy - 26 * K;
    const w = Math.max(60, b.text.length * 9 + 24), h = 28;
    const cx = clamp(k.x, w / 2 + 6, W - w / 2 - 6), cy = hy - 56;
    [[0x2a2a2a, 2], [0xffffff, 0]].forEach(([col, e]) => {
      g.fillStyle(col, 1);
      g.fillCircle(cx - w / 2 + h / 2, cy, h / 2 + e);
      g.fillCircle(cx + w / 2 - h / 2, cy, h / 2 + e);
      g.fillRect(cx - w / 2 + h / 2, cy - h / 2 - e, w - h, h + 2 * e);
      g.fillCircle(cx - w * 0.2, cy - h / 2 - 2, 9 + e);
      g.fillCircle(cx + w * 0.1, cy - h / 2 - 4, 11 + e);
    });
    [[hx + 3, hy - 16, 3], [hx + 6, hy - 27, 4.5]].forEach(([x, y, r]) => {
      g.fillStyle(0x2a2a2a, 1); g.fillCircle(x, y, r + 1.6);
      g.fillStyle(0xffffff, 1); g.fillCircle(x, y, r);
    });
    t.setText(b.text).setPosition(cx, cy).setVisible(true);
  }

  drawRocket(g, r) {
    const c = Math.cos(r.ang), s = Math.sin(r.ang), S = 1.25;
    const P = (u, v) => [r.x + (u * c - v * s) * S, r.y + (u * s + v * c) * S];
    const f = 10 + Math.random() * 7;
    const gp = P(-12, 0);
    g.fillStyle(0xffa530, 0.25); g.fillCircle(gp[0], gp[1], 12);
    poly(g, 0xff6a00, 0.9, [P(-8, 3.4), P(-8 - f, 0), P(-8, -3.4)]);
    poly(g, 0xffd54a, 1, [P(-8, 2.2), P(-8 - f * 0.65, 0), P(-8, -2.2)]);
    poly(g, 0xffffff, 1, [P(-8, 1.1), P(-8 - f * 0.3, 0), P(-8, -1.1)]);
    poly(g, 0x3a3f3a, 1, [P(-8, 3), P(-14, 8), P(-3, 3)]);
    poly(g, 0x3a3f3a, 1, [P(-8, -3), P(-14, -8), P(-3, -3)]);
    poly(g, 0xbcc2bb, 1, [P(-8, -3), P(8, -3), P(8, 3), P(-8, 3)]);
    poly(g, 0xc0392b, 1, [P(0, -3), P(3.5, -3), P(3.5, 3), P(0, 3)]);
    poly(g, 0xd9322a, 1, [P(8, -3), P(16, 0), P(8, 3)]);
  }

  drawHud() {
    const g = this.hud, s = this.state;
    g.clear();
    for (let i = 0; i < 2; i++) {
      const tm = TEAM[i], bx = i === 0 ? 10 : W - 160, by = 8, k = s.tanks[i];
      g.fillStyle(0x0b1a2b, 0.62);
      g.fillRoundedRect(bx, by, 150, 62, 14);
      if (s.winner === null && s.turn === i) {
        g.lineStyle(2.5, tm.accent, 0.6 + 0.4 * Math.sin(this.time.now / 200));
        g.strokeRoundedRect(bx, by, 150, 62, 14);
      }
      g.fillStyle(lerpC(tm.dark, 0x0b1a2b, 0.3), 1);
      g.fillCircle(bx + 32, by + 31, 26);
      drawFace(g, bx + 32, by + 34, 14, tm, this.mood(i));
      for (let j = 0; j < LIVES; j++) heart(g, bx + 70 + j * 15, by + 42, 5.2, j < k.lives ? 0xe53935 : 0x4a4f57);
    }
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.stepClouds(dt);

    this.state.tanks.forEach((k) => {
      if (k.lives > 0) return;
      const gy = this.state.heights[k.x];
      if (Math.random() < 0.5) this.emit('blacksmoke', k.x + (Math.random() - 0.5) * 20, gy - 26 * K, 1);
      if (Math.random() < 0.25) this.emit('flame', k.x + (Math.random() - 0.5) * 24, gy - 18 * K, 1);
    });

    const ug = this.unitG;
    ug.clear();
    for (let i = 0; i < 2; i++) this.drawUnit(ug, i);
    for (let i = 0; i < 2; i++) this.drawBubble(ug, i);

    const g = this.fx;
    g.clear();
    this.stepParticles(dt, g);
    if (this.rocket) this.drawRocket(g, this.rocket);
    if (this.preview) {
      g.fillStyle(0xffffff, 0.75);
      for (let i = 3; i < Math.min(this.preview.length, 60); i += 4) g.fillCircle(this.preview[i][0], this.preview[i][1], 2.2);
    }
    this.drawHud();
  }
}

export { Duel };
