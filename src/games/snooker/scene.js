import Phaser from 'phaser';
import { TW, TH, R, POCKETS } from './physics.js';
import { init, step, validCue, XB, DR, SPOTS } from './engine.js';
import { pickShot } from './bot.js';
import { poly } from '../boardkit.js';

const W = 900, H = 540, TX = 60, TY = 100;
const FONT = 'Space Grotesk, Inter, sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BALL = {
  cue: [0xf4f1ea, 0x9a968c], red: [0xd21a22, 0x5a0a0d], 16: [0xf7cb08, 0x7a6200], 17: [0x1f9a43, 0x0b3d17],
  18: [0x8a5424, 0x341d09], 19: [0x2468c9, 0x0c2a55], 20: [0xf59ab4, 0x8a3f55], 21: [0x232323, 0x000000],
};
const colOf = (id) => (id === 0 ? BALL.cue : id <= 15 ? BALL.red : BALL[id]);
const NAMES = { 16: 'yellow', 17: 'green', 18: 'brown', 19: 'blue', 20: 'pink', 21: 'black' };

// Control layouts, in screen-pixel-sized units. Landscape: a side panel. Portrait: a bar under the table.
function sideLayout() {
  return {
    mode: 'side', w: 80, h: 430,
    nl: { x: 21, y: 48, r: 17 }, nr: { x: 59, y: 48, r: 17 },
    tFine: { x: 40, y: 18 }, ang: { x: 40, y: 82 }, tPow: { x: 40, y: 110 },
    slider: { vertical: true, x: 40, y1: 130, y2: 334, t: 18 },
    powV: { x: 40, y: 358 },
    shoot: { x: 40, y: 396, r: 30 },
    f: { fine: 11, ang: 13, pow: 11, val: 20, shoot: 12 },
  };
}

function barLayout(wp) {
  return {
    mode: 'bar', w: wp, h: 190,
    nl: { x: 34, y: 32, r: 26 }, nr: { x: 180, y: 32, r: 26 },
    tFine: { x: 107, y: 10 }, ang: { x: 107, y: 38 },
    tPow: { x: wp - 70, y: 10 }, powV: { x: wp - 70, y: 40 },
    slider: { vertical: false, y: 92, x1: 28, x2: wp - 28, t: 20 },
    shoot: { x: 16, y: 126, w: wp - 32, h: 58 },
    f: { fine: 10, ang: 16, pow: 10, val: 24, shoot: 20 },
  };
}

function drawBall(g, id) {
  const c = colOf(id), r = R * 1.12;
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(r * 0.35, r * 0.6, r * 2.4, r * 1.8);
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(r * 0.25, r * 0.45, r * 2.0, r * 1.5);
  g.fillStyle(c[1], 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(c[0], 1);
  g.fillCircle(-r * 0.1, -r * 0.12, r * 0.88);
  g.fillStyle(0xffffff, 0.16);
  g.fillCircle(-r * 0.28, -r * 0.32, r * 0.55);
  g.fillStyle(0xffffff, 0.3);
  g.fillCircle(-r * 0.36, -r * 0.4, r * 0.34);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(-r * 0.36, -r * 0.4, r * 0.18);
}

export class SnookerScene extends Phaser.Scene {
  create() {
    const opts = this.registry.get('opts') || {};
    this.online = opts.online || null;
    this.audio = opts.audio || null;
    this.bot = opts.bot ? { side: 1, pending: false } : null;
    this.mySide = this.online ? this.online.side : 0;
    this.state = init();
    this.playback = null;
    this.pending = null;
    this.shooter = 0;
    this.brk = 0;
    this.aim = { angle: 0, power: 55 };
    this.cuePos = [this.state.balls[0].x, this.state.balls[0].y];
    this.drag = null;
    this.nudge = null;
    this.botAim = null;
    this.note = '';
    this.noteUntil = 0;
    this.lastSnd = {};
    this.cmode = null;
    this.cl = sideLayout();

    this.drawRoom();
    this.drawTable();
    this.balls = this.state.balls.map((b, id) => {
      const g = this.add.graphics().setDepth(3);
      drawBall(g, id);
      return g;
    });
    this.gd = this.add.graphics().setDepth(4);

    const mk = (x, y, s, size, color, bold) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', fontStyle: bold ? 'bold' : 'normal', color, resolution: 2 });

    // scoreboard (its own group so it can be scaled for portrait)
    this.topC = this.add.container(W / 2, 8).setDepth(7);
    this.sbG = this.add.graphics();
    this.nameT = [0, 1].map((i) => mk(i === 0 ? -294 : 66, 8, this.nameOf(i), 18, '#f1e6cc', true));
    this.scoreT = [0, 1].map((i) => mk(i === 0 ? -62 : 298, 4, '0', 38, '#f6e05e', true).setOrigin(1, 0));
    this.brkT = mk(0, 45, '', 12, '#e8dcc2', true).setOrigin(0.5, 0);
    this.topC.add([this.sbG, ...this.nameT, ...this.scoreT, this.brkT]);

    this.statusT = mk(W / 2, 512, '', 16, '#e8dcc2', true).setOrigin(0.5, 0).setDepth(7).setAlign('center');

    // controls
    this.ctlC = this.add.container(818, 70).setDepth(7);
    this.cG = this.add.graphics();
    this.tFine = mk(0, 0, 'FINE AIM', 11, '#b7c8b8', true).setOrigin(0.5);
    this.angT = mk(0, 0, '', 13, '#ffffff', true).setOrigin(0.5);
    this.tPow = mk(0, 0, 'POWER', 11, '#b7c8b8', true).setOrigin(0.5);
    this.powV = mk(0, 0, '55', 20, '#ffffff', true).setOrigin(0.5);
    this.shootT = mk(0, 0, 'SHOOT', 12, '#1a1208', true).setOrigin(0.5);
    this.ctlC.add([this.cG, this.tFine, this.angT, this.tPow, this.powV, this.shootT]);

    this.syncBalls();

    this.fit();
    this.layout();
    this.onResize = () => { this.fit(); this.layout(); };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));

    this.input.addPointer(1);
    this.input.on('pointerdown', (p) => this.down(p));
    this.input.on('pointermove', (p) => this.move(p));
    this.input.on('pointerup', (p) => this.up(p));

    if (this.online) this.online.onMove((m) => this.remote(m));
    this.maybeBot();
  }

  fit() {
    const w = this.scale.width, h = this.scale.height;
    if (!w || !h) return;
    const cam = this.cameras.main;
    cam.setZoom(Math.min(w / W, h / H));
    cam.centerOn(W / 2, H / 2 + (h > w ? 70 : 0));
  }

  // place the scoreboard, status line and controls for the current screen shape
  layout() {
    const z = this.cameras.main.zoom, wpx = this.scale.width, hpx = this.scale.height;
    if (!z || !wpx || !hpx) return;
    const portrait = hpx > wpx, u = 1 / z;
    const st = portrait ? (wpx / z - 24) / 640 : 1;
    this.topC.setScale(st).setPosition(W / 2, portrait ? TY - 54 - 60 * st : 8);
    this.statusT.setScale(portrait ? u : 1).setPosition(W / 2, portrait ? 498 : 512);
    this.statusT.setWordWrapWidth(portrait ? wpx - 24 : 700, true);

    const L = portrait ? barLayout(wpx) : sideLayout();
    this.cl = L;
    if (portrait) this.ctlC.setScale(u).setPosition(W / 2 - (wpx * u) / 2, 552);
    else this.ctlC.setScale(1).setPosition(818, 70);
    if (this.cmode !== L.mode) {
      this.cmode = L.mode;
      this.tFine.setFontSize(L.f.fine);
      this.angT.setFontSize(L.f.ang);
      this.tPow.setFontSize(L.f.pow);
      this.powV.setFontSize(L.f.val);
      this.shootT.setFontSize(L.f.shoot);
    }
    this.tFine.setPosition(L.tFine.x, L.tFine.y);
    this.angT.setPosition(L.ang.x, L.ang.y);
    this.tPow.setPosition(L.tPow.x, L.tPow.y);
    this.powV.setPosition(L.powV.x, L.powV.y);
    if (L.mode === 'side') this.shootT.setPosition(L.shoot.x, L.shoot.y);
    else this.shootT.setPosition(L.shoot.x + L.shoot.w / 2, L.shoot.y + L.shoot.h / 2);
  }

  sfx(n, arg) { if (this.audio) this.audio.play(n, arg); }

  snd(n, arg) {
    const now = this.time.now;
    if (now - (this.lastSnd[n] || 0) < 35) return;
    this.lastSnd[n] = now;
    this.sfx(n, arg);
  }

  nameOf(i) {
    if (this.bot) return i === 0 ? 'You' : 'Bot';
    if (this.online) return i === this.mySide ? 'You' : 'Opponent';
    return 'Player ' + (i + 1);
  }

  canAct(side) {
    if (this.online) return side === this.mySide;
    if (this.bot) return side !== this.bot.side;
    return true;
  }

  myTurnNow() { return this.canAct(this.state.turn); }

  // ---------- scenery ----------
  drawRoom() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x100d0a, 1);
    g.fillRect(-2500, -2500, 5900, 5600);
    [[640, 0.35, 0x1d1712], [450, 0.4, 0x2a2018], [280, 0.35, 0x3a2b1e], [160, 0.25, 0x4b3826]].forEach(([r, a, col]) => {
      g.fillStyle(col, a);
      g.fillCircle(W / 2, 300, r);
    });
  }

  drawTable() {
    const g = this.add.graphics().setDepth(1);
    const fx = TX - 30, fy = TY - 30, fw = TW + 60, fh = TH + 60;

    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(fx + 6, fy + 12, fw, fh, 26);
    g.fillStyle(0x3c1c0e, 1);
    g.fillRoundedRect(fx, fy, fw, fh, 26);
    g.fillStyle(0x4f2713, 1);
    g.fillRoundedRect(fx + 3, fy + 3, fw - 6, fh - 6, 24);
    g.fillStyle(0x5e3018, 1);
    g.fillRoundedRect(fx + 7, fy + 7, fw - 14, fh - 14, 21);
    for (let k = 0; k < 14; k++) {
      const yy = fy + 9 + k * 1.6, yb = fy + fh - 9 - k * 1.6;
      g.lineStyle(1, k % 2 ? 0x000000 : 0xb07a4a, 0.07);
      g.beginPath(); g.moveTo(fx + 30, yy); g.lineTo(fx + fw - 30, yy + (k % 3) - 1); g.strokePath();
      g.beginPath(); g.moveTo(fx + 30, yb); g.lineTo(fx + fw - 30, yb + (k % 3) - 1); g.strokePath();
      const xx = fx + 9 + k * 1.6, xr = fx + fw - 9 - k * 1.6;
      g.beginPath(); g.moveTo(xx, fy + 30); g.lineTo(xx + (k % 3) - 1, fy + fh - 30); g.strokePath();
      g.beginPath(); g.moveTo(xr, fy + 30); g.lineTo(xr + (k % 3) - 1, fy + fh - 30); g.strokePath();
    }
    g.lineStyle(2, 0x9a6a3c, 0.55);
    g.strokeRoundedRect(fx + 3, fy + 3, fw - 6, fh - 6, 24);
    g.lineStyle(2, 0x1f0d05, 1);
    g.strokeRoundedRect(fx, fy, fw, fh, 26);

    const diamond = (x, y) => poly(g, 0xf1e6c8, 0.9, [[x, y - 4], [x + 3, y], [x, y + 4], [x - 3, y]]);
    for (const k of [1, 2, 3, 5, 6, 7]) {
      diamond(TX + (k * TW) / 8, TY - 24);
      diamond(TX + (k * TW) / 8, TY + TH + 24);
    }
    for (const k of [1, 2, 3]) {
      diamond(TX - 24, TY + (k * TH) / 4);
      diamond(TX + TW + 24, TY + (k * TH) / 4);
    }

    g.fillStyle(0x07351f, 1);
    g.fillRoundedRect(TX - 15, TY - 15, TW + 30, TH + 30, 12);
    g.fillStyle(0x167a49, 1);
    g.fillRect(TX, TY, TW, TH);
    for (let k = 0; k < 9; k++) {
      g.fillStyle(0x3cc080, 0.055);
      g.fillEllipse(TX + TW / 2, TY + TH / 2, TW * (0.35 + k * 0.08), TH * (0.35 + k * 0.08));
    }
    let sd = 12345;
    const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 900; i++) {
      g.fillStyle(rnd() < 0.5 ? 0xffffff : 0x000000, 0.05);
      g.fillRect(TX + rnd() * TW, TY + rnd() * TH, 1.2, 1.2);
    }

    g.lineStyle(1.5, 0xe8f2ea, 0.5);
    g.beginPath();
    g.moveTo(TX + XB, TY);
    g.lineTo(TX + XB, TY + TH);
    g.strokePath();
    g.beginPath();
    for (let k = 0; k <= 28; k++) {
      const a = Math.PI / 2 + (k / 28) * Math.PI;
      const x = TX + XB + DR * Math.cos(a), y = TY + TH / 2 + DR * Math.sin(a);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    g.fillStyle(0xe8f2ea, 0.75);
    Object.keys(SPOTS).forEach((id) => g.fillCircle(TX + SPOTS[id][0], TY + SPOTS[id][1], 1.8));

    const cg = 22, mg = 20, th = 15;
    const cushion = (pts, nose) => {
      poly(g, 0x0e7a47, 1, pts);
      g.lineStyle(2, 0x45c98f, 0.75);
      g.beginPath(); g.moveTo(nose[0][0], nose[0][1]); g.lineTo(nose[1][0], nose[1][1]); g.strokePath();
      g.lineStyle(1.5, 0x052d1a, 0.8);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.strokePath();
    };
    [[TX + cg, TX + TW / 2 - mg], [TX + TW / 2 + mg, TX + TW - cg]].forEach(([a1, a2]) => {
      cushion([[a1, TY - th], [a2, TY - th], [a2 - 11, TY], [a1 + 11, TY]], [[a1 + 11, TY], [a2 - 11, TY]]);
      cushion([[a1, TY + TH + th], [a2, TY + TH + th], [a2 - 11, TY + TH], [a1 + 11, TY + TH]], [[a1 + 11, TY + TH], [a2 - 11, TY + TH]]);
    });
    cushion([[TX - th, TY + cg], [TX - th, TY + TH - cg], [TX, TY + TH - cg - 11], [TX, TY + cg + 11]], [[TX, TY + cg + 11], [TX, TY + TH - cg - 11]]);
    cushion([[TX + TW + th, TY + cg], [TX + TW + th, TY + TH - cg], [TX + TW, TY + TH - cg - 11], [TX + TW, TY + cg + 11]], [[TX + TW, TY + cg + 11], [TX + TW, TY + TH - cg - 11]]);

    POCKETS.forEach((p, i) => {
      const r = i === 1 || i === 4 ? 14.5 : 17;
      g.lineStyle(3, 0xc9a24a, 0.95);
      g.strokeCircle(TX + p[0], TY + p[1], r + 6);
      g.lineStyle(1.5, 0x6e5518, 0.9);
      g.strokeCircle(TX + p[0], TY + p[1], r + 7.5);
      g.fillStyle(0x4a2a12, 1);
      g.fillCircle(TX + p[0], TY + p[1], r + 4);
      g.fillStyle(0x050505, 1);
      g.fillCircle(TX + p[0], TY + p[1], r);
      g.fillStyle(0x2a2a2a, 0.55);
      g.fillCircle(TX + p[0] - r * 0.25, TY + p[1] - r * 0.3, r * 0.55);
      g.fillStyle(0x050505, 1);
      g.fillCircle(TX + p[0] + r * 0.1, TY + p[1] + r * 0.1, r * 0.8);
    });
  }

  syncBalls() {
    const s = this.state;
    s.balls.forEach((b, i) => {
      const g = this.balls[i];
      if (i === 0 && s.inHand) g.setVisible(true).setPosition(TX + this.cuePos[0], TY + this.cuePos[1]);
      else g.setVisible(b.on).setPosition(TX + b.x, TY + b.y);
    });
  }

  // ---------- controls: hit testing ----------
  ctlLocal(w) {
    return { x: (w.x - this.ctlC.x) / this.ctlC.scaleX, y: (w.y - this.ctlC.y) / this.ctlC.scaleY };
  }

  hitCtl(lp) {
    const L = this.cl;
    const inC = (c, k) => (lp.x - c.x) * (lp.x - c.x) + (lp.y - c.y) * (lp.y - c.y) <= c.r * k * c.r * k;
    if (L.mode === 'side') {
      if (inC(L.shoot, 1.1)) return 'shoot';
    } else if (lp.x >= L.shoot.x && lp.x <= L.shoot.x + L.shoot.w && lp.y >= L.shoot.y && lp.y <= L.shoot.y + L.shoot.h) {
      return 'shoot';
    }
    if (inC(L.nl, 1.25)) return 'nl';
    if (inC(L.nr, 1.25)) return 'nr';
    const s = L.slider;
    const onSlider = s.vertical
      ? Math.abs(lp.x - s.x) <= 30 && lp.y >= s.y1 - 16 && lp.y <= s.y2 + 16
      : Math.abs(lp.y - s.y) <= 30 && lp.x >= s.x1 - 16 && lp.x <= s.x2 + 16;
    if (onSlider) return 'slider';
    if (lp.x >= 0 && lp.x <= L.w && lp.y >= 0 && lp.y <= L.h) return 'panel';
    return null;
  }

  // ---------- input ----------
  down(p) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y), s = this.state;
    if (s.over) { if (!this.online) this.scene.restart(); return; }
    if (this.playback || this.botAim || !this.myTurnNow()) return;
    const lp = this.ctlLocal(w), hit = this.hitCtl(lp);
    if (hit === 'shoot') { this.sfx('select'); this.shoot(); return; }
    if (hit === 'nl' || hit === 'nr') {
      this.nudge = { id: p.id, dir: hit === 'nl' ? -1 : 1, next: 0, first: true };
      this.sfx('select');
      return;
    }
    if (hit === 'slider') {
      this.drag = { id: p.id, mode: 'power' };
      this.setPower(lp);
      return;
    }
    if (hit === 'panel') return;
    if (s.inHand) {
      const tx = w.x - TX, ty = w.y - TY;
      const inD = tx <= XB + 4 && (tx - XB) * (tx - XB) + (ty - TH / 2) * (ty - TH / 2) <= (DR + 6) * (DR + 6);
      if (inD) { this.drag = { id: p.id, mode: 'place' }; this.place(w); return; }
    }
    this.drag = { id: p.id, mode: 'aim' };
    this.setAim(w);
  }

  move(p) {
    if (!this.drag || p.id !== this.drag.id) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.drag.mode === 'power') this.setPower(this.ctlLocal(w));
    else if (this.drag.mode === 'place') this.place(w);
    else this.setAim(w);
  }

  up(p) {
    if (this.drag && p.id === this.drag.id) this.drag = null;
    if (this.nudge && p.id === this.nudge.id) this.nudge = null;
  }

  cueBall() { return this.state.inHand ? this.cuePos : [this.state.balls[0].x, this.state.balls[0].y]; }

  setAim(w) {
    const c = this.cueBall();
    const dx = w.x - (TX + c[0]), dy = w.y - (TY + c[1]);
    if (dx * dx + dy * dy < 100) return;
    this.aim.angle = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 20) / 20;
  }

  setPower(lp) {
    const s = this.cl.slider;
    const f = s.vertical ? (s.y2 - lp.y) / (s.y2 - s.y1) : (lp.x - s.x1) / (s.x2 - s.x1);
    this.aim.power = clamp(Math.round(f * 100), 1, 100);
  }

  place(w) {
    const tx = Math.min(w.x - TX, XB);
    let dx = tx - XB, dy = w.y - TY - TH / 2;
    const d = Math.sqrt(dx * dx + dy * dy), lim = DR - 0.5;
    if (d > lim) { dx *= lim / d; dy *= lim / d; }
    const x = Math.max(Math.round((XB + dx) * 10) / 10, R), y = Math.round((TH / 2 + dy) * 10) / 10;
    if (validCue(this.state.balls, x, y)) { this.cuePos = [x, y]; this.syncBalls(); }
  }

  stepNudge(time) {
    const n = this.nudge;
    if (!n || time < n.next) return;
    let a = this.aim.angle + n.dir * 0.1;
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    this.aim.angle = Math.round(a * 20) / 20;
    n.next = time + (n.first ? 300 : 70);
    n.first = false;
  }

  // ---------- shots ----------
  shoot() {
    if (this.playback || this.state.over || !this.myTurnNow()) return;
    const shot = { angle: this.aim.angle, power: this.aim.power };
    if (this.state.inHand) shot.cue = this.cuePos.slice();
    this.drag = null;
    this.fire(shot, false);
  }

  wire(shot) {
    const o = { angle: shot.angle, power: shot.power };
    if (shot.cue) o.cue = shot.cue;
    return o;
  }

  fire(shot, remote) {
    const res = step(this.state, shot);
    if (!res) { if (!remote) this.sfx('illegal'); return false; }
    if (this.online && !remote) this.online.send(this.wire(shot));
    this.shooter = this.state.turn;
    this.pending = res;
    this.playback = { frames: res.fx.frames, events: res.fx.events, t: 0, ei: 0 };
    this.sfx('cue', shot.power / 100);
    return true;
  }

  remote(m) {
    if (this.playback) { this.time.delayedCall(100, () => this.remote(m)); return; }
    if (this.state.over || this.state.turn === this.mySide) return;
    this.fire(m, true);
  }

  maybeBot() {
    const b = this.bot;
    if (!b || b.pending || this.playback || this.state.over || this.state.turn !== b.side) return;
    b.pending = true;
    this.time.delayedCall(600, () => {
      const shot = pickShot(this.state);
      this.botAim = shot;
      if (shot.cue) this.balls[0].setVisible(true).setPosition(TX + shot.cue[0], TY + shot.cue[1]);
      this.time.delayedCall(900, () => {
        this.botAim = null;
        b.pending = false;
        if (!this.fire(shot, true)) {
          this.fire({ angle: 0, power: 30, cue: this.state.inHand ? [XB - 20, TH / 2] : undefined }, true);
        }
      });
    });
  }

  stepPlayback(dt) {
    const pb = this.playback;
    if (!pb) return;
    pb.t += dt * 60;
    const last = pb.frames.length - 1;
    const idx = Math.min(Math.floor(pb.t), last), nxt = Math.min(idx + 1, last), fr = Math.min(pb.t - idx, 1);
    const A = pb.frames[idx], B = pb.frames[nxt];
    for (let i = 0; i < this.balls.length; i++) {
      const ax = A[2 * i];
      if (Number.isNaN(ax)) { this.balls[i].setVisible(false); continue; }
      const bx = B[2 * i];
      const x = Number.isNaN(bx) ? ax : ax + (bx - ax) * fr;
      const y = Number.isNaN(bx) ? A[2 * i + 1] : A[2 * i + 1] + (B[2 * i + 1] - A[2 * i + 1]) * fr;
      this.balls[i].setVisible(true).setPosition(TX + x, TY + y);
    }
    while (pb.ei < pb.events.length && pb.events[pb.ei].f <= idx) {
      this.onEvent(pb.events[pb.ei]);
      pb.ei++;
    }
    if (pb.t >= last) this.endPlayback();
  }

  onEvent(e) {
    if (e.k === 'hit') this.snd('ball', clamp(e.s / 260, 0.1, 1));
    else if (e.k === 'cush') this.snd('cushion', clamp(e.s / 220, 0.1, 1));
    else if (e.k === 'pot') {
      this.sfx('pocket');
      const P = POCKETS[e.p];
      const g = this.add.graphics().setDepth(5).setPosition(TX + P[0], TY + P[1]);
      drawBall(g, e.id);
      this.tweens.add({ targets: g, scale: 0.2, alpha: 0, duration: 280, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
    }
  }

  setNote(t) {
    this.note = t;
    this.noteUntil = this.time.now + 3000;
  }

  endPlayback() {
    const res = this.pending, fx = res.fx;
    this.playback = null;
    this.pending = null;
    this.state = res.next;
    this.cuePos = [this.state.balls[0].x, this.state.balls[0].y];
    this.syncBalls();
    const who = this.shooter;
    if (!fx.foul && fx.pts > 0 && this.state.turn === who) this.brk += fx.pts;
    else this.brk = 0;
    if (fx.foul) {
      this.setNote('Foul · ' + fx.why + ' · ' + fx.pen + ' to ' + this.nameOf(1 - who));
      this.sfx('foul');
    } else if (fx.pots.length) {
      this.setNote(this.nameOf(who) + ' +' + fx.pts);
    }
    if (this.state.over) this.finish();
    else this.maybeBot();
  }

  // ---------- end of frame ----------
  result() {
    const s = this.state, sub = s.scores[0] + ' – ' + s.scores[1];
    if (s.winner === 'draw') return { title: 'Frame drawn', sub, mine: null };
    if (this.online || this.bot) {
      const mine = this.online ? s.winner === this.mySide : s.winner === 0;
      return { title: mine ? 'You win!' : this.bot ? 'Bot wins' : 'You lose', sub, mine };
    }
    return { title: 'Player ' + (s.winner + 1) + ' wins!', sub, mine: true };
  }

  finish() {
    const r = this.result();
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(W / 2 - 190, TY + TH / 2 - 60, 380, 120, 22);
    this.add.text(W / 2, TY + TH / 2 - 22, r.title, {
      fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#f6e05e', stroke: '#1a1208', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(9);
    this.add.text(W / 2, TY + TH / 2 + 24, r.sub + (this.online ? '' : ' · tap to play again'), {
      fontFamily: FONT, fontSize: '15px', color: '#e8dcc2',
    }).setOrigin(0.5).setDepth(9);
    this.time.delayedCall(450, () => this.sfx(r.mine === null ? 'click' : r.mine ? 'win' : 'lose'));
  }

  // ---------- drawing ----------
  ray(cx, cy, dx, dy) {
    const balls = this.state.balls;
    let best = Infinity, hit = -1;
    for (let i = 1; i < balls.length; i++) {
      const b = balls[i];
      if (!b.on) continue;
      const vx = b.x - cx, vy = b.y - cy, proj = vx * dx + vy * dy;
      if (proj <= 0) continue;
      const perp2 = vx * vx + vy * vy - proj * proj;
      if (perp2 > 4 * R * R) continue;
      const t = proj - Math.sqrt(4 * R * R - perp2);
      if (t > 0 && t < best) { best = t; hit = i; }
    }
    let tc = Infinity;
    if (dx > 1e-9) tc = Math.min(tc, (TW - R - cx) / dx); else if (dx < -1e-9) tc = Math.min(tc, (R - cx) / dx);
    if (dy > 1e-9) tc = Math.min(tc, (TH - R - cy) / dy); else if (dy < -1e-9) tc = Math.min(tc, (R - cy) / dy);
    if (hit >= 0 && best <= tc) {
      const gx = cx + dx * best, gy = cy + dy * best, b = balls[hit];
      let ox = b.x - gx, oy = b.y - gy;
      const ol = Math.sqrt(ox * ox + oy * oy) || 1;
      ox /= ol; oy /= ol;
      const dot = dx * ox + dy * oy;
      const tx = dx - ox * dot, ty = dy - oy * dot;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      return { x: gx, y: gy, ball: hit, bx: b.x, by: b.y, ox, oy, tx: tx / tl, ty: ty / tl };
    }
    return { x: cx + dx * tc, y: cy + dy * tc, ball: -1 };
  }

  drawCue(g, cx, cy, dx, dy, power) {
    const pull = 8 + power * 0.45, start = R + 3 + pull, len = 200;
    const px = -dy, py = dx;
    const at = (d, w) => [cx - dx * (start + d) + px * w, cy - dy * (start + d) + py * w];
    const sh = (d, w) => [cx - dx * (start + d) + px * w + 3, cy - dy * (start + d) + py * w + 5];
    poly(g, 0x000000, 0.22, [sh(0, -1.6), sh(len, -3.6), sh(len, 3.6), sh(0, 1.6)]);
    poly(g, 0x1f120a, 1, [at(len * 0.55, -2.9), at(len, -3.7), at(len, 3.7), at(len * 0.55, 2.9)]);
    poly(g, 0x6b3b1d, 1, [at(len * 0.55, -2.9), at(len * 0.66, -3.05), at(len * 0.66, 3.05), at(len * 0.55, 2.9)]);
    poly(g, 0xd4af37, 1, [at(len * 0.53, -3), at(len * 0.55, -2.9), at(len * 0.55, 2.9), at(len * 0.53, 3)]);
    poly(g, 0xd8b073, 1, [at(7, -1.6), at(len * 0.53, -3), at(len * 0.53, 3), at(7, 1.6)]);
    poly(g, 0xffffff, 0.2, [at(7, -1.6), at(len * 0.53, -3), at(len * 0.53, -1.2), at(7, -0.5)]);
    poly(g, 0xf3ead4, 1, [at(1.5, -1.4), at(7, -1.6), at(7, 1.6), at(1.5, 1.4)]);
    poly(g, 0x5aa6e6, 1, [at(0, -1.3), at(1.5, -1.4), at(1.5, 1.4), at(0, 1.3)]);
  }

  drawGuide(time) {
    const g = this.gd, s = this.state;
    g.clear();
    if (this.playback || s.over) return;
    let a, power, cue;
    if (this.botAim) {
      a = this.botAim.angle;
      power = this.botAim.power;
      cue = this.botAim.cue || [s.balls[0].x, s.balls[0].y];
    } else if (this.myTurnNow()) {
      a = this.aim.angle;
      power = this.aim.power;
      cue = this.cueBall();
      if (s.inHand) {
        g.lineStyle(2, 0xf6e05e, 0.4 + 0.3 * Math.sin(time / 200));
        g.strokeCircle(TX + cue[0], TY + cue[1], R + 5);
      }
    } else return;
    const rad = (a * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    const cx = TX + cue[0], cy = TY + cue[1];
    const gr = this.ray(cue[0], cue[1], dx, dy);
    const ex = TX + gr.x, ey = TY + gr.y;
    const len = Math.sqrt((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy));
    for (const [w, al] of [[4.5, 0.1], [1.7, 0.75]]) {
      g.lineStyle(w, 0xffffff, al);
      for (let t = R + 2; t < len; t += 14) {
        const t2 = Math.min(t + 8, len);
        g.beginPath();
        g.moveTo(cx + dx * t, cy + dy * t);
        g.lineTo(cx + dx * t2, cy + dy * t2);
        g.strokePath();
      }
    }
    g.fillStyle(0xffffff, 0.14);
    g.fillCircle(ex, ey, R);
    g.lineStyle(1.6, 0xffffff, 0.85);
    g.strokeCircle(ex, ey, R);
    if (gr.ball >= 0) {
      g.lineStyle(2.4, colOf(gr.ball)[0] === BALL.red[0] ? 0xff8a8a : colOf(gr.ball)[0], 0.9);
      g.beginPath();
      g.moveTo(TX + gr.bx, TY + gr.by);
      g.lineTo(TX + gr.bx + gr.ox * 70, TY + gr.by + gr.oy * 70);
      g.strokePath();
      g.lineStyle(1.6, 0xffffff, 0.5);
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex + gr.tx * 40, ey + gr.ty * 40);
      g.strokePath();
    }
    this.drawCue(g, cx, cy, dx, dy, power);
  }

  onLabel() {
    const s = this.state;
    return s.phase === 'red' ? 'a red' : s.phase === 'colour' ? 'any colour' : NAMES[s.target];
  }

  refreshStatus() {
    const s = this.state;
    let t;
    if (this.noteUntil > this.time.now) t = this.note;
    else if (s.over) t = this.result().title;
    else if (this.playback) t = '';
    else if (this.bot && s.turn === this.bot.side) t = 'Bot is thinking…';
    else if (this.online && s.turn !== this.mySide) t = "Opponent's shot…";
    else t = (s.inHand ? 'Place the cue ball in the D · ' : '') + 'Ball on: ' + this.onLabel();
    this.statusT.setText(t);
  }

  drawScore(time) {
    const g = this.sbG, s = this.state;
    g.clear();
    [0, 1].forEach((i) => {
      const x = i === 0 ? -310 : 50, active = s.turn === i && !s.over;
      g.fillStyle(0x0b1a14, 0.8);
      g.fillRoundedRect(x, 0, 260, 60, 14);
      g.fillStyle(0xffffff, 0.05);
      g.fillRoundedRect(x + 2, 1, 256, 20, 12);
      g.lineStyle(2.5, active ? 0xf6e05e : 0xffffff, active ? 0.55 + 0.4 * Math.sin(time / 220) : 0.16);
      g.strokeRoundedRect(x, 0, 260, 60, 14);
      this.scoreT[i].setText(String(s.scores[i]));
    });
    if (!s.over) {
      if (s.phase === 'colour') {
        [16, 17, 18, 19, 20, 21].forEach((id, k) => {
          g.fillStyle(colOf(id)[0], 1);
          g.fillCircle(-32.5 + k * 13, 26, 5.5);
        });
      } else {
        const c = colOf(s.phase === 'red' ? 1 : s.target);
        g.fillStyle(c[1], 1);
        g.fillCircle(0, 24, 11);
        g.fillStyle(c[0], 1);
        g.fillCircle(-1, 23, 9.5);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(-4, 20, 2.4);
      }
    }
    this.brkT.setText(!s.over && this.brk > 0 ? 'Break ' + this.brk : '');
  }

  drawCtl(time) {
    const g = this.cG, L = this.cl, s = this.state;
    g.clear();
    const live = this.myTurnNow() && !this.playback && !this.botAim && !s.over, dim = live ? 1 : 0.4;
    const pw = this.aim.power, col = pw < 40 ? 0x4caf50 : pw < 75 ? 0xffb300 : 0xe53935;
    const rad = L.mode === 'side' ? 18 : 20;

    g.fillStyle(0x0b1a14, 0.84);
    g.fillRoundedRect(0, 0, L.w, L.h, rad);
    g.lineStyle(2, 0xffffff, 0.22);
    g.strokeRoundedRect(0, 0, L.w, L.h, rad);

    [['nl', -1], ['nr', 1]].forEach(([k, sign]) => {
      const b = L[k], down = this.nudge && this.nudge.dir === sign;
      g.fillStyle(down ? 0x3f8f63 : 0x1d4a33, dim);
      g.fillCircle(b.x, b.y, b.r);
      g.lineStyle(2, 0xffffff, 0.6 * dim);
      g.strokeCircle(b.x, b.y, b.r);
      g.fillStyle(0xffffff, dim);
      const a = b.r * 0.45;
      g.fillTriangle(b.x + sign * a, b.y, b.x - sign * a * 0.8, b.y - a, b.x - sign * a * 0.8, b.y + a);
    });

    const sl = L.slider;
    if (sl.vertical) {
      const len = sl.y2 - sl.y1, fh = (len * pw) / 100, hy = sl.y2 - fh;
      g.fillStyle(0x000000, 0.6);
      g.fillRoundedRect(sl.x - sl.t / 2, sl.y1, sl.t, len, sl.t / 2);
      g.fillStyle(col, dim);
      g.fillRoundedRect(sl.x - sl.t / 2, hy, sl.t, Math.max(fh, 1), Math.min(sl.t / 2, Math.max(fh, 1) / 2));
      g.lineStyle(2, 0xffffff, 0.35 * dim);
      for (let k = 0; k <= 4; k++) {
        const y = sl.y2 - (len * k) / 4;
        g.beginPath(); g.moveTo(sl.x - sl.t / 2 - 9, y); g.lineTo(sl.x - sl.t / 2 - 3, y); g.strokePath();
      }
      g.fillStyle(0xffffff, dim);
      g.fillCircle(sl.x, hy, 14);
      g.lineStyle(2, 0x000000, 0.3 * dim);
      g.strokeCircle(sl.x, hy, 14);
    } else {
      const len = sl.x2 - sl.x1, fw = (len * pw) / 100, hx = sl.x1 + fw;
      g.fillStyle(0x000000, 0.6);
      g.fillRoundedRect(sl.x1, sl.y - sl.t / 2, len, sl.t, sl.t / 2);
      g.fillStyle(col, dim);
      g.fillRoundedRect(sl.x1, sl.y - sl.t / 2, Math.max(fw, 1), sl.t, Math.min(sl.t / 2, Math.max(fw, 1) / 2));
      g.lineStyle(2, 0xffffff, 0.35 * dim);
      for (let k = 0; k <= 4; k++) {
        const x = sl.x1 + (len * k) / 4;
        g.beginPath(); g.moveTo(x, sl.y + sl.t / 2 + 3); g.lineTo(x, sl.y + sl.t / 2 + 9); g.strokePath();
      }
      g.fillStyle(0xffffff, dim);
      g.fillCircle(hx, sl.y, 17);
      g.lineStyle(2, 0x000000, 0.3 * dim);
      g.strokeCircle(hx, sl.y, 17);
    }

    const b = L.shoot, base = live ? 0xf6e05e : 0x6b6b5a, rim = live ? 0xc9a227 : 0x4a4a3d;
    if (L.mode === 'side') {
      g.fillStyle(base, 1);
      g.fillCircle(b.x, b.y, b.r);
      g.lineStyle(3, rim, 1);
      g.strokeCircle(b.x, b.y, b.r - 3);
      if (live) {
        g.lineStyle(2, 0xf6e05e, 0.5 + 0.4 * Math.sin(time / 260));
        g.strokeCircle(b.x, b.y, b.r + 4);
      }
    } else {
      g.fillStyle(base, 1);
      g.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
      g.lineStyle(3, rim, 1);
      g.strokeRoundedRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, b.h / 2 - 2);
      if (live) {
        g.lineStyle(2, 0xf6e05e, 0.5 + 0.4 * Math.sin(time / 260));
        g.strokeRoundedRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, b.h / 2 + 3);
      }
    }
    this.powV.setText(String(pw));
    this.angT.setText(this.aim.angle.toFixed(2) + '°');
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.layout();
    this.stepPlayback(dt);
    this.stepNudge(time);
    this.drawGuide(time);
    this.drawScore(time);
    this.drawCtl(time);
    this.refreshStatus();
  }
}
