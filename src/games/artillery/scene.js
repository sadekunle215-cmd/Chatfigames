import Phaser from 'phaser';
import { W, H, R, makeState, simulate, tankY } from './sim.js';

const COLORS = [0x111111, 0x8a8a84];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Duel extends Phaser.Scene {
  create() {
    this.online = this.registry.get('opts').online || null;
    this.state = makeState(this.online ? this.online.seed : (Math.random() * 4294967296) >>> 0);
    if (this.online) this.online.onMove((m) => this.remoteMove(m));
    this.barrel = [60, 120];
    this.busy = false;
    this.aim = null;
    this.trail = null;
    this.g = this.add.graphics();
    this.fx = this.add.graphics();
    this.ui = this.add
      .text(W / 2, 12, '', { fontFamily: 'Space Grotesk, Inter, sans-serif', fontSize: '20px', color: '#111111' })
      .setOrigin(0.5, 0);

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
      if (a.power < 10) { this.render(); return; }
      this.fire(a.angle, a.power);
    });
    this.render();
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
    this.render();
  }

  fire(angle, power, remote) {
    this.busy = true;
    if (this.online && !remote) this.online.send({ angle, power });
    const res = simulate(this.state, { angle, power });
    const last = res.path.length - 1;
    this.tweens.addCounter({
      from: 0,
      to: last,
      duration: clamp(res.path.length * 9, 300, 2200),
      onUpdate: (tw) => {
        const i = Math.floor(tw.getValue());
        this.trail = res.path.slice(Math.max(0, i - 14), i + 1);
        this.render();
      },
      onComplete: () => {
        this.trail = null;
        if (res.impact) this.explode(res.impact[0], res.impact[1]);
        this.state = res.next;
        this.busy = false;
        this.render();
      },
    });
  }

  myTurn() {
    return !this.online || this.state.turn === this.online.side;
  }

  remoteMove(m) {
    if (this.busy) { this.time.delayedCall(100, () => this.remoteMove(m)); return; }
    if (!m || !Number.isInteger(m.angle) || !Number.isInteger(m.power)) return;
    if (m.angle < 0 || m.angle > 180 || m.power < 10 || m.power > 100) return;
    if (this.state.winner !== null || this.myTurn()) return;
    this.barrel[this.state.turn] = m.angle;
    this.fire(m.angle, m.power, true);
  }

  explode(x, y) {
    const c = this.add.circle(x, y, 6, 0x111111);
    this.tweens.add({ targets: c, scale: R / 6, alpha: 0, duration: 350, onComplete: () => c.destroy() });
    this.cameras.main.shake(180, 0.012);
  }

  render() {
    const s = this.state, g = this.g, fx = this.fx;
    g.clear(); fx.clear();

    // terrain
    g.fillStyle(0xe6e6e1, 1);
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x < W; x += 2) g.lineTo(x, s.heights[x]);
    g.lineTo(W, s.heights[W - 1]);
    g.lineTo(W, H);
    g.closePath();
    g.fillPath();
    g.lineStyle(3, 0x111111, 1);
    g.beginPath();
    g.moveTo(0, s.heights[0]);
    for (let x = 2; x < W; x += 2) g.lineTo(x, s.heights[x]);
    g.strokePath();

    // tanks
    s.tanks.forEach((k, i) => {
      const y = tankY(s, i);
      const rad = (this.barrel[i] * Math.PI) / 180;
      g.lineStyle(5, COLORS[i], 1);
      g.beginPath();
      g.moveTo(k.x, y - 12);
      g.lineTo(k.x + Math.cos(rad) * 20, y - 12 - Math.sin(rad) * 20);
      g.strokePath();
      g.fillStyle(COLORS[i], 1);
      g.fillRoundedRect(k.x - 13, y - 10, 26, 10, 3);
      g.fillCircle(k.x, y - 11, 7);
      g.fillStyle(0xcfcfca, 1);
      g.fillRect(k.x - 16, y - 26, 32, 4);
      g.fillStyle(0x111111, 1);
      g.fillRect(k.x - 16, y - 26, (32 * k.hp) / 100, 4);
    });

    // aim preview (short dotted arc)
    if (this.aim && this.aim.power >= 10) {
      const pv = simulate(s, { angle: this.aim.angle, power: this.aim.power }).path;
      fx.fillStyle(0x111111, 0.5);
      for (let i = 3; i < Math.min(pv.length, 60); i += 4) fx.fillCircle(pv[i][0], pv[i][1], 2);
    }

    // shell trail
    if (this.trail) {
      this.trail.forEach((p, i) => {
        fx.fillStyle(0x111111, (i + 1) / this.trail.length);
        fx.fillCircle(p[0], p[1], 2 + (i / this.trail.length) * 2);
      });
    }

    // status text
    if (s.winner !== null) {
      const tail = this.online ? '' : ' Tap to restart';
      this.ui.setText(s.winner === 'draw' ? 'Draw!' + tail
        : this.online ? (s.winner === this.online.side ? 'You win!' : 'You lose')
        : 'Player ' + (s.winner + 1) + ' wins!' + tail);
    } else {
      const power = this.aim ? '  Power ' + this.aim.power : '';
      this.ui.setText(this.online
        ? (s.turn === this.online.side ? 'Your turn — drag back to aim' + power : "Opponent's turn…")
        : 'Player ' + (s.turn + 1) + ' — drag back to aim, release to fire' + power);
    }
    this.ui.setColor(s.winner === null && s.turn === 1 ? '#8a8a84' : '#111111');
  }
}

export { Duel };
