import { W, H, R, EX, VX } from './sim.js';

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

// the distant hills the ruined town and the far road sit on
const ridgeY = (x) => 255 + Math.sin(x * 0.017 + 2) * 24 + Math.sin(x * 0.017 * 2.7 + 4) * 24 * 0.4;

const PROP_TYPES = ['house', 'car', 'tree', 'trap', 'sandbags', 'barrel', 'house', 'wire', 'car', 'tree', 'sandbags', 'barrel'];
const PALETTE = [0xa2523a, 0x93442f, 0xb4603f, 0x8a3f2c, 0x9c4b36];
const MAT = {
  dry: { c: 0x8c9340, hi: 0xb4bb5c },
  mud: { c: 0x6e5538, hi: 0x8e7149 },
  gravel: { c: 0x8f8d87, hi: 0xb8b6b0 },
  path: { c: 0x9a7b52, hi: 0xb89a6e },
};

function makeHouse(rnd) {
  const cols = 6 + (rnd() < 0.5 ? 1 : 0);
  const rows = 8 + Math.floor(rnd() * 3);
  const colH = [];
  for (let c = 0; c < cols; c++) {
    const edge = c === 0 || c === cols - 1;
    colH.push(Math.max(3, Math.floor(rows - (edge ? rnd() * 2 : rnd() * 5))));
  }
  if (rnd() < 0.5) colH[0] = rows; else colH[cols - 1] = rows;
  const win = [1, cols - 2].map((c) => ({ c, r: Math.max(1, Math.min(4, colH[c] - 3)), w: 1, h: 2 }));
  const door = { c: 2 + Math.floor(rnd() * 2), r: 0, w: 1, h: 3 };
  return { cols, rows, colH, win, door, seed: Math.floor(rnd() * 1000) };
}

const methods = {
  initScenery() {
    this.bgG = this.add.graphics().setDepth(1.4);
    this.propG = this.add.graphics().setDepth(1.9);
    this.farSmoke = [];
    this.farFires = [];
    this.farAcc = 0;
    this.scorch = [];
    for (let i = 0; i < 6; i++) {
      this.clouds.push({ x: -EX + i * 70, y: 50 + ((i * 37) % 120), s: 0.7 + (i % 3) * 0.25, v: 3 + (i % 4) });
      this.clouds.push({ x: W + 40 + i * 70, y: 60 + ((i * 53) % 110), s: 0.7 + (i % 3) * 0.25, v: 3 + (i % 4) });
    }

    const rnd = mulberry((this.state.seed ^ 0x9e3779b1) >>> 0);
    const h = this.state.heights;

    // ground materials that blend into each other, plus two roads and a dirt path
    const mats = [];
    let mx = 0;
    while (mx < W) {
      const len = 80 + rnd() * 90, roll = rnd();
      const kind = roll < 0.45 ? null : roll < 0.7 ? 'dry' : roll < 0.88 ? 'mud' : 'gravel';
      if (kind) mats.push({ kind, a: Math.floor(mx), b: Math.floor(Math.min(W - 1, mx + len)) });
      mx += len;
    }
    const ra = 150 + Math.floor(rnd() * 200);
    mats.push({ kind: 'road', a: ra, b: ra + 130 });
    mats.push({ kind: 'path', a: ra + 124, b: Math.min(W - 40, ra + 240) });
    const r2 = 520 + Math.floor(rnd() * 30);
    mats.push({ kind: 'road', a: r2, b: r2 + 120 });
    this.mats = mats;
    const matAt = (x) => {
      let hit = null;
      for (const m of mats) if (x >= m.a && x <= m.b) hit = m;
      return hit;
    };

    // grass blades and wildflowers
    this.blades = [];
    const fcols = [0xfff3a0, 0xffffff, 0xffb3d1];
    for (let x = -EX + 2; x < W + EX - 2; x += 3) {
      const bx = x + Math.floor(rnd() * 2), m = matAt(bx);
      this.blades.push({
        x: bx, len: 3 + rnd() * 5, tilt: (rnd() - 0.5) * 3, alt: rnd() < 0.5 ? 1 : 0,
        ok: !m || m.kind === 'dry', flower: rnd() < 0.06, fc: fcols[Math.floor(rnd() * 3)],
      });
    }

    // stones buried in the soil
    this.stones = [];
    const stoneCols = [0x6e6a64, 0x7c776f, 0x5d5955, 0x8a8379];
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd() * (W + 2 * EX)) - EX;
      this.stones.push({ x, y: h[clamp(x, 0, W - 1)] + 24 + rnd() * 150, r: 2.5 + rnd() * 4.5, c: stoneCols[Math.floor(rnd() * 4)] });
    }

    // scenery props on the field
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
      const pr = { x, type: PROP_TYPES[i], v: rnd(), alive: true, burn: rnd() < 0.45, flip: rnd() < 0.5 ? -1 : 1 };
      if (pr.type === 'house') pr.hd = makeHouse(rnd);
      this.props.push(pr);
    }

    // people running along the distant road (never in the firing lane)
    this.runners = [];
    const cols = [0x3b6ea8, 0x9c4a3c, 0x6b6b6b, 0x4f7a4a];
    for (let i = 0; i < 7; i++) {
      this.runners.push({
        x: 40 + rnd() * 720, dir: rnd() < 0.5 ? -1 : 1, v: 14 + rnd() * 16,
        sol: i % 3 !== 0, col: cols[i % 4], phase: rnd() * 6, scared: 0,
      });
    }
  },

  // Ruined town on the distant hills, with a road and fires
  skyline(g) {
    const rnd = mulberry((this.state.seed ^ 0x51ed270b) >>> 0);
    for (let x = -EX + 12; x < W + EX - 40; x += 46 + Math.floor(rnd() * 30)) {
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
    g.lineStyle(3, 0x3a4654, 1);
    g.beginPath();
    g.moveTo(-EX, ridgeY(-EX) + 11);
    for (let x = -EX + 8; x <= W + EX; x += 8) g.lineTo(x, ridgeY(x) + 11);
    g.strokePath();
  },

  // Layered soil, stones, blended grass / mud / gravel patches, roads, blades, scorch marks
  drawTerrain() {
    const g = this.ter, h = this.state.heights;
    g.clear();

    [[0, 0x7a5c3a], [14, 0x6d5136], [40, 0x5e4630], [84, 0x524a45]].forEach(([off, col], k) => {
      g.fillStyle(col, 1);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W - 2; x += 2) {
        g.lineTo(x, Math.min(H, h[x] + off + (off ? 5 * Math.sin(x * 0.045 + k * 2) : 0)));
      }
      g.lineTo(W, Math.min(H, h[W - 1] + off));
      g.lineTo(W, H);
      g.closePath();
      g.fillPath();
    });

    for (const s of this.stones) {
      if (s.y - s.r <= h[s.x] + 6 || s.y > H) continue;
      g.fillStyle(s.c, 1);
      g.fillEllipse(s.x, s.y, s.r * 2.2, s.r * 1.5);
      g.fillStyle(0xffffff, 0.12);
      g.fillEllipse(s.x - s.r * 0.25, s.y - s.r * 0.25, s.r * 1.1, s.r * 0.6);
    }

    const line = (x0, x1, off, width, color, alpha) => {
      const a = Math.max(0, Math.floor(x0)), b = Math.min(W - 1, Math.floor(x1));
      if (b - a < 2) return;
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(a, h[a] + off);
      for (let x = a + 2; x <= b; x += 2) g.lineTo(x, h[x] + off);
      g.strokePath();
    };

    // base grass, then the other materials overlapping it so the edges blend
    line(0, W - 1, 3, 9, 0x4f8a34, 1);
    line(0, W - 1, 0, 2.5, 0x86c24f, 1);
    for (const m of this.mats) {
      if (m.kind === 'road') {
        line(m.a - 6, m.b + 6, 3, 10, 0x3f4247, 1);
        line(m.a, m.b, -1.5, 1.6, 0x6a6e75, 1);
        g.lineStyle(1.8, 0xe8d27a, 1);
        for (let x = m.a + 6; x < m.b - 10; x += 16) {
          g.beginPath();
          g.moveTo(x, h[x] + 3);
          g.lineTo(x + 8, h[Math.min(W - 1, x + 8)] + 3);
          g.strokePath();
        }
      } else {
        const t = MAT[m.kind];
        line(m.a - 14, m.b + 14, 3, 9, t.c, 0.5);
        line(m.a, m.b, 3, 9, t.c, 1);
        line(m.a, m.b, 0, 2.5, t.hi, 1);
      }
    }
    // zebra crossing where the path meets the road
    const path = this.mats.find((m) => m.kind === 'path');
    if (path) {
      g.fillStyle(0xffffff, 0.85);
      for (let k = 0; k < 5; k++) {
        const zx = Math.min(W - 1, path.a - 10 + k * 5);
        g.fillRect(zx, h[zx] + 0.5, 2.5, 5);
      }
    }

    // grass blades
    [0, 1].forEach((alt) => {
      g.lineStyle(1.2, alt ? 0x9fd35c : 0x6bb043, 0.95);
      g.beginPath();
      for (const b of this.blades) {
        if (!b.ok || b.alt !== alt) continue;
        g.moveTo(b.x, h[b.x] + 1);
        g.lineTo(b.x + b.tilt, h[b.x] - b.len);
      }
      g.strokePath();
    });
    for (const b of this.blades) {
      if (!b.ok || !b.flower) continue;
      g.fillStyle(b.fc, 1);
      g.fillCircle(b.x, h[b.x] - b.len - 1, 1.6);
    }

    // burnt ground around impacts
    for (const sx of this.scorch) {
      line(sx - R, sx + R, 3, 9, 0x1d1a17, 0.4);
      line(sx - R * 0.6, sx + R * 0.6, 3, 9, 0x0f0d0b, 0.35);
    }
  },

  sceneryBlast(x, y) {
    this.scorch.push(x);
    if (this.scorch.length > 14) this.scorch.shift();
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
    const t = this.time.now;
    const pg = this.propG, bg = this.bgG;
    pg.clear();
    bg.clear();

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

    // people on the far road
    for (const r of this.runners) {
      r.x += r.dir * (r.scared > 0 ? r.v * 2.4 : r.v) * dt;
      if (r.scared > 0) r.scared -= dt;
      if (r.x < 20) { r.x = 20; r.dir = 1; }
      else if (r.x > 780) { r.x = 780; r.dir = -1; }
      this.drawRunner(bg, r, t);
    }

    for (const p of this.props) if (p.alive) this.drawProp(pg, p);
  },

  flame(g, x, y, s, f) {
    g.fillStyle(0xffa530, 0.18);
    g.fillCircle(x, y - s * 0.4, s * 1.8);
    poly(g, 0xff6a00, 0.9, [[x - s * 0.5, y], [x, y - s * 1.6 * f], [x + s * 0.5, y]]);
    poly(g, 0xffd54a, 0.95, [[x - s * 0.28, y], [x + s * 0.02, y - s * f], [x + s * 0.3, y]]);
  },

  drawRunner(g, r, t) {
    const gy = ridgeY(r.x) + 10;
    const sc = 0.62, ph = r.phase + t / (r.scared > 0 ? 60 : 105);
    const leg = Math.sin(ph) * 5 * sc, arm = Math.sin(ph + Math.PI) * 5 * sc;
    const x = r.x, base = gy - 1;
    const cloth = r.sol ? 0x3b4e24 : r.col;
    g.lineStyle(1.6, 0x232a31, 1);
    g.beginPath(); g.moveTo(x, base - 8 * sc); g.lineTo(x + leg, base); g.strokePath();
    g.beginPath(); g.moveTo(x, base - 8 * sc); g.lineTo(x - leg, base); g.strokePath();
    g.fillStyle(cloth, 1);
    g.fillRect(x - 3 * sc, base - 17 * sc, 6 * sc, 10 * sc);
    g.lineStyle(1.6, cloth, 1);
    g.beginPath(); g.moveTo(x, base - 15 * sc); g.lineTo(x + arm * r.dir * 0.8, base - 10 * sc); g.strokePath();
    g.beginPath(); g.moveTo(x, base - 15 * sc); g.lineTo(x - arm * r.dir * 0.8, base - 10 * sc); g.strokePath();
    g.fillStyle(0xd9ad84, 1);
    g.fillCircle(x, base - 20 * sc, 3 * sc);
    poly(g, r.sol ? 0x2f3f1c : 0x2a1e15, 1, arcPts(x, base - 20.5 * sc, 3.4 * sc, 3.2 * sc, Math.PI, Math.PI * 2, 6));
    if (r.scared > 0) {
      g.fillStyle(0xe53935, 1);
      g.fillRect(x - 0.8, base - 30 * sc, 1.6, 4);
      g.fillCircle(x, base - 24 * sc, 1);
    }
  },

  // Brick house: staggered bricks, mortar, windows, door, broken top, beams, rubble
  drawHouse(g, p, f) {
    const hd = p.hd, gx = p.x, gy = this.state.heights[gx];
    const BW = 9, BH = 5.5, wallW = hd.cols * BW, x0 = gx - wallW / 2, yb = gy + 4;
    const holes = hd.win.concat([hd.door]);
    const inHole = (c, r) => holes.some((q) => c >= q.c && c < q.c + q.w && r >= q.r && r < q.r + q.h);

    g.fillStyle(0x8c857b, 1);
    for (let c = 0; c < hd.cols; c++) g.fillRect(x0 + c * BW, yb - hd.colH[c] * BH, BW, hd.colH[c] * BH + 8);

    for (let r = 0; r < hd.rows; r++) {
      const off = (r % 2) * (BW / 2);
      for (let k = -1; k <= hd.cols; k++) {
        const bx = x0 + off + k * BW;
        const left = Math.max(bx, x0), right = Math.min(bx + BW, x0 + wallW);
        if (right - left < 2) continue;
        const c = Math.floor(((left + right) / 2 - x0) / BW);
        if (c < 0 || c >= hd.cols || r >= hd.colH[c] || inHole(c, r)) continue;
        const soot = Math.min(0.55, (r / hd.rows) * 0.4 + (p.burn ? 0.12 : 0));
        g.fillStyle(lerpC(PALETTE[Math.abs(r * 7 + k * 13 + hd.seed) % 5], 0x1d1612, soot), 1);
        g.fillRect(left, yb - (r + 1) * BH + 0.5, right - left - 1, BH - 1);
      }
    }

    for (const w of hd.win) {
      const x = x0 + w.c * BW, y = yb - (w.r + w.h) * BH, ww = w.w * BW, wh = w.h * BH;
      g.fillStyle(0x1f1b18, 1); g.fillRect(x, y, ww, wh);
      g.lineStyle(2, 0x6b4a2f, 1); g.strokeRect(x, y, ww, wh);
      g.lineStyle(1, 0x6b4a2f, 1);
      g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + wh); g.strokePath();
      g.fillStyle(0xb5aea3, 1); g.fillRect(x - 1, y + wh, ww + 2, 2.5);
    }
    const d = hd.door, dx = x0 + d.c * BW, dy = yb - d.h * BH;
    g.fillStyle(0x1a1613, 1); g.fillRect(dx, dy, BW, d.h * BH);
    g.fillStyle(0xb5aea3, 1); g.fillRect(dx - 1, dy - 2, BW + 2, 3);

    const topY = yb - Math.max.apply(null, hd.colH) * BH;
    g.lineStyle(3.2, 0x4a3524, 1);
    g.beginPath(); g.moveTo(x0 - 4, topY + 8); g.lineTo(gx + 2, topY - 14); g.strokePath();
    g.beginPath(); g.moveTo(x0 + wallW + 4, topY + 10); g.lineTo(gx + 8, topY - 8); g.strokePath();
    poly(g, 0xb5532f, 1, [[x0 - 6, topY + 9], [x0 + 4, topY + 4], [x0 + 3, topY + 10]]);
    poly(g, 0xa4472a, 1, [[x0 + wallW + 6, topY + 11], [x0 + wallW - 4, topY + 6], [x0 + wallW - 3, topY + 12]]);

    for (let i = 0; i < 8; i++) {
      const rx = x0 - 10 + (i * (wallW + 20)) / 7, ry = yb - 1 - (i % 3) * 2;
      g.fillStyle(PALETTE[(i + hd.seed) % 5], 1);
      g.fillRect(rx, ry - 3, 5 + (i % 2) * 2, 3.5);
    }

    if (p.burn) {
      const c1 = hd.colH.indexOf(Math.min.apply(null, hd.colH));
      this.flame(g, x0 + c1 * BW + BW / 2, yb - hd.colH[c1] * BH, 7, f);
      this.flame(g, gx + 6, topY + 4, 6, f);
      if (Math.random() < 0.08) this.emit('blacksmoke', gx, topY, 1);
    }
  },

  drawProp(g, p) {
    const h = this.state.heights, now = this.time.now;
    const gx = p.x, gy = h[gx], b = gy + 12, s = p.flip, v = p.v;
    const slope = Math.atan2(h[Math.min(W - 1, gx + 10)] - h[Math.max(0, gx - 10)], 20);
    const f = 0.85 + 0.25 * Math.sin(now / 70 + gx) * Math.sin(now / 110 + gx * 2);

    switch (p.type) {
      case 'house':
        this.drawHouse(g, p, f);
        break;

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
