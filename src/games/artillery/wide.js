import { W, H, R, EX, VX } from './sim.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ch = (c, s) => (c >> s) & 255;
const lerpC = (a, b, t) =>
  (Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t) << 16) |
  (Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t) << 8) |
  Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);

const MAT = {
  dry: { c: 0x8c9340, hi: 0xb4bb5c },
  mud: { c: 0x6e5538, hi: 0x8e7149 },
  gravel: { c: 0x8f8d87, hi: 0xb8b6b0 },
  path: { c: 0x9a7b52, hi: 0xb89a6e },
};

const methods = {
  // The 800x450 play area is fitted to the screen; wider screens simply see more scenery.
  bindResize() {
    this.hudL = 10;
    this.hudR = W - 160;
    this.hudT = 8;
    this.fitCamera();
    this.onResize = () => this.fitCamera();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));
  },

  fitCamera() {
    const w = this.scale.width, h = this.scale.height;
    if (!w || !h) return;
    const cam = this.cameras.main;
    cam.setZoom(Math.min(w / W, h / H));
    cam.centerOn(W / 2, H / 2);
  },

  // pointer position in game units (accounts for zoom)
  wp(p) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  },

  // keep the HUD at the real screen corners, clear of the Lobby button and the "vs" tag
  updateView() {
    const cam = this.cameras.main, v = cam.worldView;
    const l = Math.max(v.x, -EX), r = Math.min(v.right, W + EX), t = Math.max(v.y, -VX);
    const land = this.scale.width > this.scale.height;
    const padL = land ? 120 / cam.zoom : 0;
    const padR = land && this.online ? 150 / cam.zoom : 0;
    this.hudL = l + 10 + padL;
    this.hudR = r - 160 - padR;
    this.hudT = t + 8;
    this.names[0].setPosition(this.hudL + 70, this.hudT + 8);
    this.names[1].setPosition(this.hudR + 70, this.hudT + 8);
    this.ui.setPosition((this.hudL + 150 + this.hudR) / 2, this.hudT + 6);
  },

  drawSky() {
    const g = this.sky, n = 40, bh = H / n;
    const col = (t) => (t < 0.55 ? lerpC(0x2a5c96, 0x78aad3, t / 0.55) : lerpC(0x78aad3, 0xf3d9ab, (t - 0.55) / 0.45));
    g.fillStyle(col(0), 1);
    g.fillRect(-EX, -VX, W + 2 * EX, VX + 1);
    for (let i = 0; i < n; i++) {
      g.fillStyle(col(i / (n - 1)), 1);
      g.fillRect(-EX, i * bh, W + 2 * EX, Math.ceil(bh) + 1);
    }
    g.fillStyle(col(1), 1);
    g.fillRect(-EX, H, W + 2 * EX, VX);
    [[78, 0.08], [54, 0.14], [34, 0.3], [22, 1]].forEach(([r, a]) => {
      g.fillStyle(0xfff4cc, a);
      g.fillCircle(610, 125, r);
    });
    this.ridge(g, 0x86a3bb, 215, 30, 0.011, 0);
    this.ridge(g, 0x647f93, 255, 24, 0.017, 2);
    this.skyline(g);
  },

  ridge(g, color, base, amp, f, ph) {
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(-EX, H + VX);
    for (let x = -EX; x <= W + EX; x += 8) {
      g.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 2) * amp * 0.4);
    }
    g.lineTo(W + EX, H + VX);
    g.closePath();
    g.fillPath();
  },

  drawTerrain() {
    const g = this.ter, h = this.state.heights;
    const hh = (x) => h[clamp(Math.round(x), 0, W - 1)];
    const BOT = H + VX;
    g.clear();

    [[0, 0x7a5c3a], [14, 0x6d5136], [40, 0x5e4630], [84, 0x524a45]].forEach(([off, col], k) => {
      g.fillStyle(col, 1);
      g.beginPath();
      g.moveTo(-EX, BOT);
      for (let x = -EX; x <= W + EX; x += 2) {
        g.lineTo(x, Math.min(BOT, hh(x) + off + (off ? 5 * Math.sin(x * 0.045 + k * 2) : 0)));
      }
      g.lineTo(W + EX, BOT);
      g.closePath();
      g.fillPath();
    });

    for (const s of this.stones) {
      if (s.y - s.r <= hh(s.x) + 6 || s.y > BOT) continue;
      g.fillStyle(s.c, 1);
      g.fillEllipse(s.x, s.y, s.r * 2.2, s.r * 1.5);
      g.fillStyle(0xffffff, 0.12);
      g.fillEllipse(s.x - s.r * 0.25, s.y - s.r * 0.25, s.r * 1.1, s.r * 0.6);
    }

    const line = (x0, x1, off, width, color, alpha) => {
      const a = Math.max(-EX, Math.floor(x0)), b = Math.min(W + EX, Math.floor(x1));
      if (b - a < 2) return;
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(a, hh(a) + off);
      for (let x = a + 2; x <= b; x += 2) g.lineTo(x, hh(x) + off);
      g.strokePath();
    };

    line(-EX, W + EX, 3, 9, 0x4f8a34, 1);
    line(-EX, W + EX, 0, 2.5, 0x86c24f, 1);
    for (const m of this.mats) {
      if (m.kind === 'road') {
        line(m.a - 6, m.b + 6, 3, 10, 0x3f4247, 1);
        line(m.a, m.b, -1.5, 1.6, 0x6a6e75, 1);
        g.lineStyle(1.8, 0xe8d27a, 1);
        for (let x = m.a + 6; x < m.b - 10; x += 16) {
          g.beginPath();
          g.moveTo(x, hh(x) + 3);
          g.lineTo(x + 8, hh(x + 8) + 3);
          g.strokePath();
        }
      } else {
        const t = MAT[m.kind];
        line(m.a - 14, m.b + 14, 3, 9, t.c, 0.5);
        line(m.a, m.b, 3, 9, t.c, 1);
        line(m.a, m.b, 0, 2.5, t.hi, 1);
      }
    }
    const path = this.mats.find((m) => m.kind === 'path');
    if (path) {
      g.fillStyle(0xffffff, 0.85);
      for (let k = 0; k < 5; k++) {
        const zx = path.a - 10 + k * 5;
        g.fillRect(zx, hh(zx) + 0.5, 2.5, 5);
      }
    }

    [0, 1].forEach((alt) => {
      g.lineStyle(1.2, alt ? 0x9fd35c : 0x6bb043, 0.95);
      g.beginPath();
      for (const b of this.blades) {
        if (!b.ok || b.alt !== alt) continue;
        g.moveTo(b.x, hh(b.x) + 1);
        g.lineTo(b.x + b.tilt, hh(b.x) - b.len);
      }
      g.strokePath();
    });
    for (const b of this.blades) {
      if (!b.ok || !b.flower) continue;
      g.fillStyle(b.fc, 1);
      g.fillCircle(b.x, hh(b.x) - b.len - 1, 1.6);
    }

    for (const sx of this.scorch) {
      line(sx - R, sx + R, 3, 9, 0x1d1a17, 0.4);
      line(sx - R * 0.6, sx + R * 0.6, 3, 9, 0x0f0d0b, 0.35);
    }
  },
};

export function installWide(Scene) {
  Object.assign(Scene.prototype, methods);
}
