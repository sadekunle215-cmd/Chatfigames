import { W, R } from './sim.js';

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

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROP_TYPES = ['house', 'car', 'tree', 'trap', 'sandbags', 'barrel', 'house', 'wire', 'car', 'tree', 'sandbags', 'barrel'];

const methods = {
  initScenery() {
    this.bgG = this.add.graphics().setDepth(1.4);
    this.propG = this.add.graphics().setDepth(1.9);
    this.runG = this.add.graphics().setDepth(2.5);
    this.farSmoke = [];
    this.farFires = [];
    this.farAcc = 0;

    const rnd = mulberry((this.state.seed ^ 0x9e3779b1) >>> 0);
    const h = this.state.heights;
    const placed = [];
    this.props = [];
    for (let i = 0; i < PROP_TYPES.length; i++) {
      let x = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = 40 + Math.floor(rnd() * (W - 80));
        const flat = Math.abs(h[Math.min(W - 1, x + 18)] - h[Math.max(0, x - 18)]) <= 16;
        const clear = Math.abs(x - 80) > 70 && Math.abs(x - 720) > 70 && placed.every((v) => Math.abs(v - x) > 50);
        if (flat && clear) break;
      }
      placed.push(x);
      this.props.push({ x, type: PROP_TYPES[i], v: rnd(), alive: true, burn: rnd() < 0.45, flip: rnd() < 0.5 ? -1 : 1 });
    }

    this.runners = [];
    const cols = [0x3b6ea8, 0x9c4a3c, 0x6b6b6b, 0x4f7a4a];
    for (let i = 0; i < 7; i++) {
      this.runners.push({
        x: 120 + rnd() * 560, dir: rnd() < 0.5 ? -1 : 1, v: 24 + rnd() * 26,
        sol: i % 3 !== 0, col: cols[i % 4], phase: rnd() * 6, scared: 0,
        lo: 50 + rnd() * 120, hi: 630 + rnd() * 120,
      });
    }
  },

  // Ruined town on the distant hills, with fires
  skyline(g) {
    const rnd = mulberry((this.state.seed ^ 0x51ed270b) >>> 0);
    const ridgeY = (x) => 255 + Math.sin(x * 0.017 + 2) * 24 + Math.sin(x * 0.017 * 2.7 + 4) * 24 * 0.4;
    for (let x = 12; x < W - 40; x += 46 + Math.floor(rnd() * 30)) {
      const w = 26 + rnd() * 26, hgt = 26 + rnd() * 52, base = ridgeY(x) + 8, top = base - hgt;
      poly(g, 0x4b6074, 1, [
        [x, base], [x, top + rnd() * 10], [x + w * 0.3, top - rnd() * 6], [x + w * 0.5, top + 8 + rnd() * 14],
        [x + w * 0.75, top + rnd() * 8], [x + w, top + 10 + rnd() * 10], [x + w, base],
      ]);
      g.fillStyle(0x2d3b49, 0.8);
      for (let wy = top + 16; wy < base - 8; wy += 12) {
        for (let wx = x + 5; wx < x + w - 6; wx += 10) if (rnd() > 0.35) g.fillRect(wx, wy, 4, 6);
      }
      if (rnd() < 0.4) this.farFires.push([x + w * 0.5, top + 8]);
    }
    if (!this.farFires.length) this.farFires.push([400, 215]);
  },

  sceneryBlast(x, y) {
    for (const p of this.props) {
      if (!p.alive || Math.abs(p.x - x) > R * 0.9) continue;
      p.alive = false;
      const gy = this.state.heights[p.x];
      this.emit('debris', p.x, gy - 12, 12);
      this.emit('fire', p.x, gy - 12, 6);
      this.emit('blacksmoke', p.x, gy - 14, 4);
    }
    for (const r of this.runners) {
      if (Math.abs(r.x - x) < 160) { r.scared = 3.2; r.dir = r.x < x ? -1 : 1; }
    }
  },

  stepScenery(dt) {
    const h = this.state.heights, t = this.time.now;
    const pg = this.propG, rg = this.runG, bg = this.bgG;
    pg.clear(); rg.clear(); bg.clear();

    // distant smoke columns + fire glow
    this.farAcc += dt;
    if (this.farAcc > 0.22) {
      this.farAcc = 0;
      for (const f of this.farFires) {
        this.farSmoke.push({ x: f[0], y: f[1], t: 0, life: 4 + Math.random() * 2, r1: 14 + Math.random() * 6 });
      }
    }
    this.farSmoke = this.farSmoke.filter((s) => (s.t += dt) < s.life);
    for (const s of this.farSmoke) {
      const u = s.t / s.life;
      s.x += 6 * dt;
      s.y -= 16 * dt;
      bg.fillStyle(lerpC(0x2f2f2f, 0x8a8a8a, u), 0.38 * (1 - u));
      bg.fillCircle(s.x, s.y, 3 + (s.r1 - 3) * u);
    }
    for (const f of this.farFires) {
      const fl = 0.7 + 0.3 * Math.sin(t / 90 + f[0]);
      bg.fillStyle(0xff8a1f, 0.5 * fl); bg.fillCircle(f[0], f[1] + 2, 3.5);
      bg.fillStyle(0xffd54a, 0.8 * fl); bg.fillCircle(f[0], f[1] + 3, 1.8);
    }

    // people running
    for (const r of this.runners) {
      const xi = clamp(Math.floor(r.x), 0, W - 1);
      r.x += r.dir * (r.scared > 0 ? r.v * 2.2 : r.v) * dt;
      if (r.scared > 0) r.scared -= dt;
      if (r.x < r.lo) { r.x = r.lo; r.dir = 1; }
      else if (r.x > r.hi) { r.x = r.hi; r.dir = -1; }
      const nx = clamp(Math.floor(r.x + r.dir * 6), 0, W - 1);
      if (Math.abs(h[nx] - h[xi]) > 22) r.dir = -r.dir;
    }

    for (const p of this.props) if (p.alive) this.drawProp(pg, p);
    for (const r of this.runners) this.drawRunner(rg, r, t);
  },

  flame(g, x, y, s, f) {
    g.fillStyle(0xffa530, 0.18);
    g.fillCircle(x, y - s * 0.4, s * 1.8);
    poly(g, 0xff6a00, 0.9, [[x - s * 0.5, y], [x, y - s * 1.6 * f], [x + s * 0.5, y]]);
    poly(g, 0xffd54a, 0.95, [[x - s * 0.28, y], [x + s * 0.02, y - s * f], [x + s * 0.3, y]]);
  },

  drawRunner(g, r, t) {
    const h = this.state.heights;
    const gy = h[clamp(Math.floor(r.x), 0, W - 1)];
    const sc = 1.15, ph = r.phase + t / (r.scared > 0 ? 60 : 105);
    const leg = Math.sin(ph) * 5 * sc, arm = Math.sin(ph + Math.PI) * 5 * sc;
    const x = r.x, base = gy - 1;
    const cloth = r.sol ? 0x4f6b2f : r.col;
    g.lineStyle(2, 0x2b2b2b, 1);
    g.beginPath(); g.moveTo(x, base - 8 * sc); g.lineTo(x + leg, base); g.strokePath();
    g.beginPath(); g.moveTo(x, base - 8 * sc); g.lineTo(x - leg, base); g.strokePath();
    g.fillStyle(cloth, 1);
    g.fillRoundedRect(x - 3 * sc, base - 17 * sc, 6 * sc, 10 * sc, 2);
    g.lineStyle(2, cloth, 1);
    g.beginPath(); g.moveTo(x, base - 15 * sc); g.lineTo(x + arm * r.dir * 0.8, base - 10 * sc); g.strokePath();
    g.beginPath(); g.moveTo(x, base - 15 * sc); g.lineTo(x - arm * r.dir * 0.8, base - 10 * sc); g.strokePath();
    g.fillStyle(0xe0b48a, 1);
    g.fillCircle(x, base - 20 * sc, 3 * sc);
    poly(g, r.sol ? 0x3d5226 : 0x3a2a1e, 1, arcPts(x, base - 20.5 * sc, 3.4 * sc, 3.2 * sc, Math.PI, Math.PI * 2, 6));
    if (r.scared > 0) {
      g.fillStyle(0xe53935, 1);
      g.fillRect(x - 0.9, base - 33 * sc, 1.8, 5);
      g.fillCircle(x, base - 26 * sc, 1.1);
    }
  },

  drawProp(g, p) {
    const h = this.state.heights, now = this.time.now;
    const gx = p.x, gy = h[gx], b = gy + 12, s = p.flip, v = p.v;
    const slope = Math.atan2(h[Math.min(W - 1, gx + 10)] - h[Math.max(0, gx - 10)], 20);
    const f = 0.85 + 0.25 * Math.sin(now / 70 + gx) * Math.sin(now / 110 + gx * 2);

    switch (p.type) {
      case 'house': {
        const w = 54, hh = 38 + v * 16;
        poly(g, 0x6f655a, 1, [
          [gx - w / 2, b], [gx + w / 2, b], [gx + w / 2, gy - hh * 0.72], [gx + w * 0.2, gy - hh],
          [gx + w * 0.02, gy - hh * 0.62], [gx - w * 0.22, gy - hh * 0.92], [gx - w / 2, gy - hh * 0.5],
        ]);
        poly(g, 0x4e463d, 1, [[gx + w * 0.2, gy - hh], [gx + w / 2, gy - hh * 0.72], [gx + w / 2, gy - hh * 0.6], [gx + w * 0.3, gy - hh * 0.8]]);
        g.fillStyle(0x2a2520, 1);
        g.fillRect(gx - w * 0.34, gy - hh * 0.62, 9, 11);
        g.fillRect(gx + w * 0.08, gy - hh * 0.55, 9, 11);
        g.fillRect(gx - 6, gy - 19, 12, 21);
        g.lineStyle(3, 0x3d2f22, 1);
        g.beginPath(); g.moveTo(gx - w * 0.5, gy - hh * 0.5); g.lineTo(gx - w * 0.1, gy - hh * 1.12); g.strokePath();
        g.fillStyle(0x5a5148, 1);
        g.fillCircle(gx - w * 0.55, gy - 2, 4);
        g.fillCircle(gx + w * 0.58, gy - 3, 5);
        g.fillCircle(gx + w * 0.4, gy - 2, 3);
        if (p.burn) {
          this.flame(g, gx - w * 0.05, gy - hh * 0.62, 8, f);
          this.flame(g, gx + w * 0.3, gy - hh * 0.75, 6, f);
          if (Math.random() < 0.08) this.emit('blacksmoke', gx, gy - hh, 1);
        }
        break;
      }

      case 'car': {
        const c = Math.cos(slope), sn = Math.sin(slope);
        const T = (u, w) => [gx + u * s * c - w * sn, gy + u * s * sn + w * c];
        const col = [0x6a4a3a, 0x4a5560, 0x6b6b57][Math.floor(v * 3)];
        poly(g, col, 1, [T(-22, -4), T(22, -4), T(21, -11), T(-21, -11)]);
        poly(g, col, 1, [T(-12, -11), T(-7, -19), T(7, -17), T(13, -11)]);
        poly(g, 0x7f8fa0, 0.85, [T(-9, -11), T(-6, -17), T(5, -16), T(9, -11)]);
        g.lineStyle(1, 0xe8e8e8, 0.8);
        let a = T(-6, -17), e = T(0, -12);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.strokePath();
        a = T(5, -16); e = T(-1, -12);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.strokePath();
        poly(g, 0x111111, 0.45, [T(2, -11), T(13, -11), T(7, -17), T(2, -15)]);
        poly(g, lerpC(col, 0x000000, 0.5), 1, [T(14, -11), T(22, -11), T(21, -5), T(15, -7)]);
        const w1 = T(-13, -3), w2 = T(15, -1.5);
        g.fillStyle(0x1b1b1b, 1); g.fillCircle(w1[0], w1[1], 5);
        g.fillStyle(0x6a6a6a, 1); g.fillCircle(w1[0], w1[1], 1.8);
        g.fillStyle(0x1b1b1b, 1); g.fillEllipse(w2[0], w2[1], 10, 5);
        if (p.burn) {
          const fe = T(8, -14);
          this.flame(g, fe[0], fe[1], 6, f);
          if (Math.random() < 0.08) this.emit('blacksmoke', fe[0], fe[1] - 8, 1);
        }
        break;
      }

      case 'tree': {
        const th = 34 + v * 20;
        poly(g, 0x2d2219, 1, [[gx - 3.5, b], [gx + 3.5, b], [gx + 2, gy - th], [gx - 1.5, gy - th * 0.95]]);
        g.lineStyle(2.2, 0x2d2219, 1);
        [[0.45, -1, 14], [0.62, 1, 17], [0.8, -1, 11], [0.9, 1, 8]].forEach(([fr, d, l]) => {
          const by = gy - th * fr;
          g.beginPath();
          g.moveTo(gx, by);
          g.lineTo(gx + d * l, by - l * 0.7);
          g.lineTo(gx + d * (l + 5), by - l * 1.05);
          g.strokePath();
        });
        break;
      }

      case 'trap': {
        const cy = gy - 9;
        g.lineStyle(3.2, 0x3a3f3a, 1);
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3 + Math.PI / 6 + (v - 0.5) * 0.3;
          g.beginPath();
          g.moveTo(gx - Math.cos(a) * 12, cy - Math.sin(a) * 12);
          g.lineTo(gx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
          g.strokePath();
        }
        break;
      }

      case 'sandbags': {
        [[4, 0], [3, 7], [2, 14]].forEach(([n, up]) => {
          for (let i = 0; i < n; i++) {
            const bx = gx - (n * 14) / 2 + i * 14;
            g.fillStyle(0xb09a6b, 1);
            g.fillRoundedRect(bx, gy - up - 7, 14, 8, 3);
            g.lineStyle(1, 0x8c7a52, 1);
            g.strokeRoundedRect(bx, gy - up - 7, 14, 8, 3);
          }
        });
        break;
      }

      case 'barrel': {
        const c1 = v < 0.5 ? 0x3f5a3a : 0x7a3b2a;
        g.fillStyle(c1, 1);
        g.fillRoundedRect(gx - 6, gy - 16, 12, 18, 2);
        g.lineStyle(1.2, 0x111111, 0.5);
        g.beginPath(); g.moveTo(gx - 6, gy - 11); g.lineTo(gx + 6, gy - 11); g.strokePath();
        g.beginPath(); g.moveTo(gx - 6, gy - 5); g.lineTo(gx + 6, gy - 5); g.strokePath();
        poly(g, c1, 1, [[gx + 11, gy + 1], [gx + 27, gy - 1], [gx + 27, gy - 9], [gx + 11, gy - 7]]);
        if (p.burn) {
          this.flame(g, gx, gy - 16, 7, f);
          if (Math.random() < 0.08) this.emit('blacksmoke', gx, gy - 22, 1);
        }
        break;
      }

      case 'wire': {
        const sp = 18;
        const gh = (px) => h[clamp(Math.floor(px), 0, W - 1)];
        g.lineStyle(2, 0x3a2f24, 1);
        for (let i = 0; i < 3; i++) {
          const px = gx - sp + i * sp;
          g.beginPath(); g.moveTo(px, gh(px) + 4); g.lineTo(px, gh(px) - 15); g.strokePath();
        }
        g.lineStyle(1, 0x222222, 1);
        for (const yy of [-12, -6]) {
          g.beginPath();
          g.moveTo(gx - sp, gh(gx - sp) + yy);
          for (let k = 1; k <= 8; k++) {
            const px = gx - sp + (k * sp * 2) / 8;
            g.lineTo(px, gh(px) + yy + (k % 2 ? -2.5 : 2.5));
          }
          g.strokePath();
        }
        break;
      }
    }
  },
};

export function installScenery(Scene) {
  Object.assign(Scene.prototype, methods);
}
