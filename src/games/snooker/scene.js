import Phaser from 'phaser';
import { TW, TH, R, POCKETS } from './physics.js';
import { init, step, validCue, XB, DR, SPOTS } from './engine.js';
import { pickShot } from './bot.js';
import { shadedCircle, poly } from '../boardkit.js';

const W = 900, H = 540, TX = 60, TY = 100;
const FONT = 'Space Grotesk, Inter, sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BALL = {
  cue: [0xf4f1ea, 0x8a8780], red: [0xc4161c, 0x5a0a0d], 16: [0xf2c400, 0x7a6200], 17: [0x1f8a3a, 0x0b3d17],
  18: [0x7a4a1e, 0x341d09], 19: [0x1f5fbf, 0x0c2a55], 20: [0xf08aa8, 0x8a3f55], 21: [0x1c1c1c, 0x000000],
};
const colOf = (id) => (id === 0 ? BALL.cue : id <= 15 ? BALL.red : BALL[id]);
const NAMES = { 16: 'yellow', 17: 'green', 18: 'brown', 19: 'blue', 20: 'pink', 21: 'black' };
const SL = { x: 858, top: 150, bot: 400 };
const BTN = { shoot: { x: 858, y: 446, r: 28 }, nl: { x: 836, y: 108, r: 16 }, nr: { x: 880, y: 108, r: 16 } };

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
    this.aim = { angle: 0, power: 55 };
    this.cuePos = [this.state.balls[0].x, this.state.balls[0].y];
    this.drag = null;
    this.nudge = null;
    this.botAim = null;
    this.note = '';
    this.noteUntil = 0;
    this.lastSnd = {};

    this.drawRoom();
    this.drawTable();
    this.balls = this.state.balls.map((b, id) => {
      const g = this.add.graphics().setDepth(3);
      const c = colOf(id);
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(1.5, 2.5, R * 2.1, R * 1.5);
      shadedCircle(g, 0, 0, R, c[0], c[1]);
      return g;
    });
    this.gd = this.add.graphics().setDepth(4);
    this.ui = this.add.graphics().setDepth(6);

    const t = (x, y, s, size, color, bold) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', fontStyle: bold ? 'bold' : 'normal', color }).setDepth(7);
    this.nameT = [0, 1].map((i) => t(i === 0 ? 156 : 516, 16, this.nameOf(i), 15, '#f1e6cc', true));
    this.scoreT = [0, 1].map((i) => t(i === 0 ? 388 : 748, 12, '0', 34, '#f6e05e', true).setOrigin(1, 0));
    this.statusT = t(W / 2, 510, '', 16, '#e8dcc2', true).setOrigin(0.5, 0);
    t(SL.x, SL.top - 24, 'POWER', 11, '#a9b8a8', true).setOrigin(0.5);
    this.powerV = t(SL.x, SL.bot + 22, '55', 16, '#ffffff', true).setOrigin(0.5);
    t(BTN.shoot.x, BTN.shoot.y, 'SHOOT', 11, '#1a1208', true).setOrigin(0.5);
    t(858, 84, 'FINE AIM', 10, '#a9b8a8', true).setOrigin(0.5);
    t(BTN.nl.x, BTN.nl.y - 1, '‹', 24, '#ffffff', true).setOrigin(0.5);
    t(BTN.nr.x, BTN.nr.y - 1, '›', 24, '#ffffff', true).setOrigin(0.5);
    this.angT = t(858, 134, '', 11, '#e8dcc2', false).setOrigin(0.5);

    this.syncBalls();

    this.fit();
    this.onResize = () => this.fit();
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
    cam.centerOn(W / 2, H / 2);
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
    [[620, 0.35, 0x1d1712], [430, 0.4, 0x2a2018], [260, 0.35, 0x3a2b1e]].forEach(([r, a, col]) => {
      g.fillStyle(col, a);
      g.fillCircle(W / 2, 300, r);
    });
  }

  drawTable() {
    const g = this.add.graphics().setDepth(1);
    const fx = TX - 30, fy = TY - 30, fw = TW + 60, fh = TH + 60;
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(fx + 6, fy + 10, fw, fh, 26);
    g.fillStyle(0x4a2412, 1);
    g.fillRoundedRect(fx, fy, fw, fh, 26);
    g.lineStyle(3, 0x7a4a2a, 1);
    g.strokeRoundedRect(fx + 3, fy + 3, fw - 6, fh - 6, 23);
    g.lineStyle(2, 0x2a1209, 1);
    g.strokeRoundedRect(fx, fy, fw, fh, 26);
    g.fillStyle(0xe8d3a8, 0.5);
    for (let k = 1; k < 8; k++) {
      g.fillCircle(TX + (k * TW) / 8, TY - 22, 1.8);
      g.fillCircle(TX + (k * TW) / 8, TY + TH + 22, 1.8);
    }
    g.fillStyle(0x0c6a3f, 1);
    g.fillRoundedRect(TX - 15, TY - 15, TW + 30, TH + 30, 12);
    g.lineStyle(2, 0x084a2c, 1);
    g.strokeRoundedRect(TX - 15, TY - 15, TW + 30, TH + 30, 12);
    for (let k = 0; k < 8; k++) {
      g.fillStyle(k % 2 ? 0x1b8a54 : 0x1e9259, 1);
      g.fillRect(TX, TY + (k * TH) / 8, TW, TH / 8 + 1);
    }
    g.fillStyle(0x2fae72, 0.12);
    g.fillEllipse(TX + TW / 2, TY + TH / 2, TW * 0.8, TH * 0.7);
    g.lineStyle(1.5, 0xe8f2ea, 0.55);
    g.beginPath();
    g.moveTo(TX + XB, TY);
    g.lineTo(TX + XB, TY + TH);
    g.strokePath();
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = Math.PI / 2 + (k / 24) * Math.PI;
      const x = TX + XB + DR * Math.cos(a), y = TY + TH / 2 + DR * Math.sin(a);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    g.fillStyle(0xe8f2ea, 0.7);
    Object.keys(SPOTS).forEach((id) => g.fillCircle(TX + SPOTS[id][0], TY + SPOTS[id][1], 1.6));
    POCKETS.forEach((p, i) => {
      const r = i === 1 || i === 4 ? 14 : 16;
      g.fillStyle(0x5a3a1a, 1);
      g.fillCircle(TX + p[0], TY + p[1], r + 2.5);
      g.fillStyle(0x050505, 1);
      g.fillCircle(TX + p[0], TY + p[1], r);
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

  // ---------- input ----------
  down(p) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y), s = this.state;
    if (s.over) { if (!this.online) this.scene.restart(); return; }
    if (this.playback || this.botAim || !this.myTurnNow()) return;
    const d2 = (a, b) => (w.x - a) * (w.x - a) + (w.y - b) * (w.y - b);
    if (d2(BTN.shoot.x, BTN.shoot.y) <= BTN.shoot.r * BTN.shoot.r) { this.shoot(); return; }
    for (const k of ['nl', 'nr']) {
      if (d2(BTN[k].x, BTN[k].y) <= BTN[k].r * BTN[k].r * 1.6) {
        this.nudge = { id: p.id, dir: k === 'nl' ? -1 : 1, next: 0, first: true };
        return;
      }
    }
    if (Math.abs(w.x - SL.x) <= 26 && w.y >= SL.top - 14 && w.y <= SL.bot + 14) {
      this.drag = { id: p.id, mode: 'power' };
      this.setPower(w);
      return;
    }
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
    if (this.drag.mode === 'power') this.setPower(w);
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

  setPower(w) {
    this.aim.power = clamp(Math.round(((SL.bot - w.y) / (SL.bot - SL.top)) * 100), 1, 100);
  }

  place(w) {
    let tx = Math.min(w.x - TX, XB);
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
      const p = POCKETS[e.p];
      const c = this.add.circle(TX + p[0], TY + p[1], 8, 0xffffff, 0.5).setDepth(5);
      this.tweens.add({ targets: c, scale: 2.4, alpha: 0, duration: 320, onComplete: () => c.destroy() });
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
      let tx = dx - ox * dot, ty = dy - oy * dot;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      return { x: gx, y: gy, ball: hit, bx: b.x, by: b.y, ox, oy, tx: tx / tl, ty: ty / tl };
    }
    return { x: cx + dx * tc, y: cy + dy * tc, ball: -1 };
  }

  drawCue(g, cx, cy, dx, dy, power) {
    const pull = 8 + power * 0.45, start = R + 3 + pull, len = 190;
    const px = -dy, py = dx;
    const at = (d, w) => [cx - dx * (start + d) + px * w, cy - dy * (start + d) + py * w];
    poly(g, 0x2a1810, 1, [at(len * 0.45, -2.8), at(len, -3.4), at(len, 3.4), at(len * 0.45, 2.8)]);
    poly(g, 0xb88b4a, 1, [at(7, -1.6), at(len * 0.45, -2.8), at(len * 0.45, 2.8), at(7, 1.6)]);
    poly(g, 0xefe3c4, 1, [at(0, -1.4), at(7, -1.6), at(7, 1.6), at(0, 1.4)]);
  }

  drawGuide() {
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
    } else return;
    const rad = (a * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    const cx = TX + cue[0], cy = TY + cue[1];
    const gr = this.ray(cue[0], cue[1], dx, dy);
    const ex = TX + gr.x, ey = TY + gr.y;
    const len = Math.sqrt((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy));
    g.lineStyle(1.6, 0xffffff, 0.7);
    for (let t = R + 2; t < len; t += 14) {
      const t2 = Math.min(t + 8, len);
      g.beginPath();
      g.moveTo(cx + dx * t, cy + dy * t);
      g.lineTo(cx + dx * t2, cy + dy * t2);
      g.strokePath();
    }
    g.lineStyle(1.6, 0xffffff, 0.85);
    g.strokeCircle(ex, ey, R);
    if (gr.ball >= 0) {
      g.lineStyle(2, 0xffe08a, 0.85);
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

  drawUi(time) {
    const g = this.ui, s = this.state;
    g.clear();
    [0, 1].forEach((i) => {
      const x = i === 0 ? 140 : 500, active = s.turn === i && !s.over;
      g.fillStyle(0x0b1a14, 0.6);
      g.fillRoundedRect(x, 8, 260, 56, 14);
      g.lineStyle(2, active ? 0xf6e05e : 0xffffff, active ? 0.5 + 0.4 * Math.sin(time / 220) : 0.12);
      g.strokeRoundedRect(x, 8, 260, 56, 14);
      this.scoreT[i].setText(String(s.scores[i]));
    });
    if (!s.over) {
      if (s.phase === 'colour') {
        [16, 17, 18, 19, 20, 21].forEach((id, k) => {
          g.fillStyle(colOf(id)[0], 1);
          g.fillCircle(417 + k * 13, 36, 5.5);
        });
      } else {
        const c = colOf(s.phase === 'red' ? 1 : s.target);
        g.fillStyle(c[0], 1);
        g.fillCircle(450, 36, 11);
        g.lineStyle(1.5, 0xffffff, 0.5);
        g.strokeCircle(450, 36, 11);
      }
    }

    const live = this.myTurnNow() && !this.playback && !this.botAim && !s.over, dim = live ? 1 : 0.35;
    g.fillStyle(0x0b1a14, 0.55);
    g.fillRoundedRect(SL.x - 30, 74, 60, 420, 16);
    g.lineStyle(1.5, 0xffffff, 0.12);
    g.strokeRoundedRect(SL.x - 30, 74, 60, 420, 16);
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(SL.x - 6, SL.top, 12, SL.bot - SL.top, 6);
    const pw = this.aim.power, fh = (pw / 100) * (SL.bot - SL.top);
    g.fillStyle(pw < 40 ? 0x4caf50 : pw < 75 ? 0xffb300 : 0xe53935, dim);
    g.fillRoundedRect(SL.x - 6, SL.bot - fh, 12, fh, 6);
    g.fillStyle(0xffffff, dim);
    g.fillCircle(SL.x, SL.bot - fh, 11);
    g.fillStyle(live ? 0xf6e05e : 0x6b6b5a, 1);
    g.fillCircle(BTN.shoot.x, BTN.shoot.y, BTN.shoot.r);
    g.lineStyle(2, 0x000000, 0.35);
    g.strokeCircle(BTN.shoot.x, BTN.shoot.y, BTN.shoot.r);
    for (const k of ['nl', 'nr']) {
      g.fillStyle(0x24402f, dim);
      g.fillCircle(BTN[k].x, BTN[k].y, BTN[k].r);
      g.lineStyle(1.5, 0xffffff, 0.3 * dim);
      g.strokeCircle(BTN[k].x, BTN[k].y, BTN[k].r);
    }
    this.powerV.setText(String(pw));
    this.angT.setText(this.aim.angle.toFixed(2) + '°');
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.stepPlayback(dt);
    this.stepNudge(time);
    this.drawGuide();
    this.drawUi(time);
    this.refreshStatus();
  }
}
