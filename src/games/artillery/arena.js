import { Duel } from './scene.js';
import { simulate, W, R } from './sim.js';
import { makeRT, stepTick, predictImpact, TICK_MS, RELOAD } from './rt.js';

const FONT = 'Space Grotesk, Inter, sans-serif';
const HURT = ['Ouch!', 'Medic!', 'That hurt!', 'Incoming!', 'Not again...'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inRect = (p, r) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Where inputs come from. Local games apply them on the next tick.
function localBus() {
  let q = [];
  return {
    limit: () => Infinity,
    take: () => { const a = q; q = []; return a; },
    submit: (inp, side) => { q.push(Object.assign({}, inp, { side })); },
  };
}

// Online games: the server stamps every input with a tick and says how far we may simulate.
function onlineBus(api) {
  const inputs = new Map();
  let limit = -1;
  api.on('rt_in', (m) => {
    const a = inputs.get(m.tick) || [];
    a.push(Object.assign({}, m.data, { side: m.side }));
    inputs.set(m.tick, a);
  });
  api.on('rt_sync', (m) => { if (m.limit > limit) limit = m.limit; });
  return {
    limit: () => limit,
    take: (t) => { const a = inputs.get(t) || []; inputs.delete(t); return a; },
    submit: (inp) => api.send(inp),
  };
}

class Arena extends Duel {
  create() {
    const opts = this.registry.get('opts') || {};
    this.online = opts.online || null;
    this.audio = opts.audio || null;
    this.bot = opts.bot ? { side: 1, shots: 0, nextFire: null, dir: 0 } : null;
    this.mySide = this.online ? this.online.side : 0;

    this.rt = makeRT(this.online ? this.online.seed : (Math.random() * 4294967296) >>> 0);
    this.state = this.rt;
    this.bus = this.online ? onlineBus(this.online.rt) : localBus();
    this.acc = 0;
    this.driveDir = 0;
    this.barrel = [60, 120];
    this.aim = null;
    this.preview = null;
    this.rocket = null;
    this.rocketOwner = -1;
    this.unloaded = [false, false];
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

    this.initScenery();
    this.drawSky();
    this.drawTerrain();

    this.ui = this.add
      .text(W / 2, 14, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b1a2b', strokeThickness: 4 })
      .setOrigin(0.5, 0).setDepth(10);
    this.names = [0, 1].map((i) => {
      const label = this.bot ? (i === 0 ? 'YOU' : 'BOT') : (i === this.mySide ? 'YOU' : 'ENEMY');
      return this.add
        .text(i === 0 ? 80 : W - 90, 16, label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff' })
        .setDepth(10);
    });
    this.btxt = [0, 1].map(() =>
      this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#111111' })
        .setOrigin(0.5).setDepth(10).setVisible(false));

    this.input.addPointer(2); // several fingers at once: drive + aim
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('A,D');
    }

    this.input.on('pointerdown', (p) => {
      const w = this.wp(p);
      if (this.rt.winner !== null) { if (!this.online) this.scene.restart(); return; }
      if (this.aim || inRect(w, this.btnL) || inRect(w, this.btnR)) return;
      if (this.rt.tanks[this.mySide].lives <= 0) return;
      this.aim = { id: p.id, sx: w.x, sy: w.y, angle: this.barrel[this.mySide], power: 0 };
    });
    this.input.on('pointermove', (p) => {
      if (this.aim && p.id === this.aim.id) this.updateAim(p);
    });
    this.input.on('pointerup', (p) => {
      if (!this.aim || p.id !== this.aim.id) return;
      this.updateAim(p);
      const a = this.aim;
      this.aim = null;
      this.preview = null;
      if (a.power >= 10 && this.rt.tanks[this.mySide].cd === 0) {
        this.submit({ k: 'fire', angle: a.angle, power: a.power });
      }
    });

    this.bindResize();
    this.refreshUi();
  }

  myTurn() { return true; }

  mood(i) {
    const k = this.rt.tanks[i];
    if (k.lives <= 0) return 'dead';
    if (this.hurtUntil[i] > this.time.now) return 'hurt';
    if (i === this.mySide && this.aim && this.aim.power >= 10) return 'focus';
    return 'neutral';
  }

  refreshUi() {
    const s = this.rt, me = s.tanks[this.mySide];
    let txt;
    if (s.winner !== null) {
      const tail = this.online ? '' : ' Tap to restart';
      if (s.winner === 'draw') txt = 'Draw!' + tail;
      else if (s.winner === this.mySide) txt = 'You win!' + tail;
      else txt = (this.bot ? 'Bot wins!' : 'You lose') + tail;
    } else {
      txt = me.cd > 0 ? 'Reloading...' : 'Drag back to aim · release to fire';
      if (this.aim && this.aim.power >= 10) txt += '  ·  ' + this.aim.power + '%';
    }
    this.ui.setText(txt);
  }

  submit(inp) { this.bus.submit(inp, this.mySide); }

  updateAim(p) {
    if (!this.aim) return;
    const q = this.wp(p), dx = this.aim.sx - q.x, dy = this.aim.sy - q.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let ang = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
    if (ang < 0) ang = dx >= 0 ? 0 : 180;
    this.aim.angle = clamp(ang, 0, 180);
    this.aim.power = clamp(Math.round(dist / 1.5), 0, 100);
    this.barrel[this.mySide] = this.aim.angle;
    this.preview = this.aim.power >= 10
      ? simulate({ heights: this.rt.heights, tanks: this.rt.tanks, turn: this.mySide, seed: this.rt.seed, winner: null },
        { angle: this.aim.angle, power: this.aim.power }).path.slice(0, 70)
      : null;
  }

  // drive buttons (touch) and arrow keys / A-D (computer)
  pollControls() {
    const cam = this.cameras.main, v = cam.worldView, z = cam.zoom;
    const s = 64 / z, gap = 12 / z;
    this.btnL = { x: v.x + 18 / z, y: v.y + v.height - 140 / z, w: s, h: s };
    this.btnR = { x: this.btnL.x + s + gap, y: this.btnL.y, w: s, h: s };
    let l = false, r = false;
    for (const p of this.input.manager.pointers) {
      if (!p || !p.isDown) continue;
      const w = this.wp(p);
      if (inRect(w, this.btnL)) l = true;
      else if (inRect(w, this.btnR)) r = true;
    }
    if (this.cursors) {
      if (this.cursors.left.isDown || this.keys.A.isDown) l = true;
      if (this.cursors.right.isDown || this.keys.D.isDown) r = true;
    }
    this.pressL = l;
    this.pressR = r;
    const alive = this.rt.winner === null && this.rt.tanks[this.mySide].lives > 0;
    const dir = alive ? (r ? 1 : 0) - (l ? 1 : 0) : 0;
    if (dir !== this.driveDir) {
      this.driveDir = dir;
      this.submit({ k: 'drive', dir });
    }
  }

  // ---------- simulation ----------
  stepSim(dt) {
    this.acc = Math.min(this.acc + dt * 1000, 250);
    let n = 0;
    while (this.acc >= TICK_MS && n < 6) {
      if (this.rt.winner !== null || this.rt.tick > this.bus.limit()) break;
      const ev = stepTick(this.rt, this.bus.take(this.rt.tick));
      this.acc -= TICK_MS;
      n++;
      if (ev.length) this.handle(ev);
    }
  }

  handle(events) {
    for (const e of events) {
      if (e.t === 'launch') {
        this.sfx('launch');
        this.barrel[e.side] = this.rt.tanks[e.side].angle;
        this.emit('fire', e.x, e.y, 6);
        this.emit('smoke', e.x, e.y, 5);
        this.emit('spark', e.x, e.y, 6);
      } else if (e.t === 'boom') {
        if (e.air) {
          this.emit('fire', e.x, e.y, 22);
          this.emit('smoke', e.x, e.y, 14);
          this.emit('spark', e.x, e.y, 18);
          this.emit('ring', e.x, e.y, 1);
          this.sfx('boom');
          this.cameras.main.shake(160, 0.008);
        } else {
          this.blast(e.x, e.y);
        }
      } else if (e.t === 'crater') {
        this.drawTerrain();
      } else if (e.t === 'miss') {
        this.emit('smoke', e.x, e.y, 3);
      } else if (e.t === 'hit') {
        const k = this.rt.tanks[e.side], gy = this.rt.heights[k.x];
        this.hurtUntil[e.side] = this.time.now + 1700;
        this.time.delayedCall(180, () => this.sfx('hit'));
        if (k.lives > 0) {
          this.bubble[e.side] = { text: HURT[Math.floor(Math.random() * HURT.length)], until: this.time.now + 1900 };
        } else {
          this.emit('fire', k.x, gy - 24, 24);
          this.emit('blacksmoke', k.x, gy - 24, 10);
          this.emit('debris', k.x, gy - 24, 14);
        }
        const t = this.add
          .text(k.x, gy - 70, '-' + e.lost + ' ❤', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#b3261e', strokeThickness: 4 })
          .setOrigin(0.5).setDepth(11);
        this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
      } else if (e.t === 'end') {
        this.time.delayedCall(700, () => this.endSound(e.winner));
      }
    }
  }

  // ---------- bot ----------
  stepBotRT() {
    const b = this.bot, s = this.rt;
    if (!b || s.winner !== null) return;
    const me = s.tanks[b.side];
    if (me.lives <= 0) return;
    const now = this.time.now;
    if (b.nextFire === null) b.nextFire = now + 1800;

    // dodge incoming rockets (it notices a moment late, and misses some)
    let dir = 0;
    for (const r of s.rockets) {
      if (r.side === b.side) continue;
      if (r._seen === undefined) { r._seen = now + 250 + Math.random() * 300; r._dodge = Math.random() < 0.8; }
      if (!r._dodge || now < r._seen) continue;
      const p = predictImpact(s, r);
      if (!p || p.ticks < 8) continue;
      if (Math.abs(p.x - me.x) < R + 24) dir = me.x >= p.x ? 1 : -1;
    }
    if (dir !== b.dir) {
      b.dir = dir;
      this.bus.submit({ k: 'drive', dir }, b.side);
    }

    // return fire
    if (me.cd === 0 && now >= b.nextFire) {
      const m = this.botShot();
      this.bus.submit({ k: 'fire', angle: m.angle, power: m.power }, b.side);
      b.nextFire = now + 1100 + Math.random() * 1700;
    }
  }

  botShot() {
    const b = this.bot, s = this.rt, me = s.tanks[b.side], foe = s.tanks[1 - b.side];
    const tmp = { heights: s.heights, tanks: s.tanks, turn: b.side, seed: s.seed, winner: null };
    const tx = clamp(foe.x + foe.dir * 35, 20, W - 20); // aims a little ahead of where you're driving
    const ty = s.heights[Math.round(tx)] - 16, my = s.heights[me.x] - 16;
    const dir = tx > me.x ? 1 : -1;
    let best = { score: 1e9, angle: dir > 0 ? 45 : 135, power: 60 };

    const score = (angle, power) => {
      const r = simulate(tmp, { angle, power });
      if (!r.impact) return 1e8 + Math.abs(r.path[r.path.length - 1][0] - tx);
      const dF = Math.hypot(r.impact[0] - tx, r.impact[1] - ty);
      const dM = Math.hypot(r.impact[0] - me.x, r.impact[1] - my);
      return dF + (dM < 55 ? 300 : 0);
    };

    const lo = dir > 0 ? 15 : 100, hi = dir > 0 ? 80 : 165;
    for (let a = lo; a <= hi; a += 6) {
      for (let p = 25; p <= 100; p += 8) {
        const sc = score(a, p);
        if (sc < best.score) best = { score: sc, angle: a, power: p };
      }
    }
    for (let a = best.angle - 5; a <= best.angle + 5; a++) {
      for (let p = best.power - 8; p <= best.power + 8; p += 2) {
        if (a < 0 || a > 180 || p < 10 || p > 100) continue;
        const sc = score(a, p);
        if (sc < best.score) best = { score: sc, angle: a, power: p };
      }
    }
    const k = Math.max(0.3, 1 - 0.18 * b.shots); // gets more accurate as the match goes on
    b.shots++;
    return {
      angle: clamp(Math.round(best.angle + (Math.random() * 2 - 1) * 7 * k), 0, 180),
      power: clamp(Math.round(best.power + (Math.random() * 2 - 1) * 9 * k), 10, 100),
    };
  }

  // ---------- drawing ----------
  drawReload() {
    const g = this.hud;
    for (let i = 0; i < 2; i++) {
      const bx = i === 0 ? this.hudL : this.hudR, by = this.hudT, p = 1 - this.rt.tanks[i].cd / RELOAD;
      g.fillStyle(0x000000, 0.35);
      g.fillRect(bx + 66, by + 52, 76, 4);
      g.fillStyle(p >= 1 ? 0xa6c36f : 0xffb74d, 1);
      g.fillRect(bx + 66, by + 52, 76 * p, 4);
    }
  }

  drawControls() {
    if (this.rt.winner !== null) return;
    const g = this.hud;
    [[this.btnL, this.pressL, -1], [this.btnR, this.pressR, 1]].forEach(([b, pressed, sign]) => {
      if (!b) return;
      g.fillStyle(0x0b1a2b, pressed ? 0.85 : 0.5);
      g.fillRoundedRect(b.x, b.y, b.w, b.h, b.w * 0.22);
      g.lineStyle(b.w * 0.03, 0xffffff, 0.35);
      g.strokeRoundedRect(b.x, b.y, b.w, b.h, b.w * 0.22);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = b.w * 0.22;
      g.fillStyle(0xffffff, pressed ? 1 : 0.85);
      g.fillTriangle(cx + sign * a, cy, cx - sign * a * 0.7, cy - a, cx - sign * a * 0.7, cy + a);
    });
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.updateView();
    this.stepClouds(dt);
    this.stepScenery(dt);
    this.pollControls();
    this.stepBotRT();
    this.stepSim(dt);
    this.refreshUi();

    this.unloaded = [this.rt.tanks[0].cd > 0, this.rt.tanks[1].cd > 0];
    this.rt.tanks.forEach((k) => {
      if (k.lives > 0) return;
      const gy = this.rt.heights[k.x];
      if (Math.random() < 0.5) this.emit('blacksmoke', k.x + (Math.random() - 0.5) * 20, gy - 39, 1);
      if (Math.random() < 0.25) this.emit('flame', k.x + (Math.random() - 0.5) * 24, gy - 27, 1);
    });

    const ug = this.unitG;
    ug.clear();
    for (let i = 0; i < 2; i++) this.drawUnit(ug, i);
    for (let i = 0; i < 2; i++) this.drawBubble(ug, i);

    const g = this.fx;
    g.clear();
    this.stepParticles(dt, g);
    for (const r of this.rt.rockets) {
      const ang = Math.atan2(r.vy, r.vx);
      this.emit('trail', r.x - Math.cos(ang) * 10, r.y - Math.sin(ang) * 10, 1);
      this.drawRocket(g, { x: r.x, y: r.y, ang });
    }
    if (this.preview) {
      g.fillStyle(0xffffff, 0.75);
      for (let i = 3; i < Math.min(this.preview.length, 60); i += 4) g.fillCircle(this.preview[i][0], this.preview[i][1], 2.2);
    }
    this.drawHud();
    this.drawReload();
    this.drawControls();
  }
}

export { Arena };
