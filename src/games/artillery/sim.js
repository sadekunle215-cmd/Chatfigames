export const W = 800, H = 450, R = 45, G = 0.15;
export const LIVES = 5, TUBE = 30, PIVOT = 24;
const PI = 3.141592653589793;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sin/cos built from + - * / only, so every device gets identical results
function sin(x) {
  let term = x, sum = x;
  for (let i = 1; i < 12; i++) {
    term = (-term * x * x) / ((2 * i) * (2 * i + 1));
    sum += term;
  }
  return sum;
}
const cos = (x) => sin(PI / 2 - x);

function makeTerrain(seed) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i <= 16; i++) pts.push(240 + Math.floor(r() * 140));
  let h = [];
  for (let x = 0; x < W; x++) {
    const i = Math.floor(x / 50), f = x % 50;
    h.push(Math.floor(pts[i] + ((pts[i + 1] - pts[i]) * f) / 50));
  }
  for (let pass = 0; pass < 3; pass++) {
    const n = h.slice();
    for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let k = -10; k <= 10; k++) {
        const j = x + k;
        if (j >= 0 && j < W) { s += h[j]; c++; }
      }
      n[x] = Math.floor(s / c);
    }
    h = n;
  }
  return h;
}

export function makeState(seed) {
  return {
    seed,
    heights: makeTerrain(seed),
    tanks: [{ x: 80, lives: LIVES }, { x: 720, lives: LIVES }],
    turn: 0,
    winner: null,
  };
}

export const tankY = (s, i) => s.heights[s.tanks[i].x];

// move = { angle: 0..180 (int degrees), power: 10..100 (int) }
export function simulate(s, move) {
  const t = s.tanks[s.turn];
  const rad = (move.angle * PI) / 180;
  const sp = move.power * 0.1;
  let x = t.x + cos(rad) * TUBE, y = s.heights[t.x] - PIVOT - sin(rad) * TUBE;
  let vx = cos(rad) * sp, vy = -sin(rad) * sp;
  const path = [[x, y]];
  let impact = null;

  for (let i = 0; i < 3000; i++) {
    x += vx; y += vy; vy += G;
    path.push([x, y]);
    if (x < 0 || x >= W || y > H) break;
    const gy = s.heights[Math.floor(x)];
    if (y >= gy) { impact = [x, gy]; break; }
  }

  const next = {
    seed: s.seed,
    heights: s.heights.slice(),
    tanks: s.tanks.map((k) => ({ ...k })),
    turn: 1 - s.turn,
    winner: null,
  };

  if (impact) {
    const cx = Math.floor(impact[0]), cy = Math.floor(impact[1]);
    next.tanks.forEach((k, i) => {
      const ty = s.heights[k.x] - 16;
      const d = Math.sqrt((k.x - cx) * (k.x - cx) + (ty - cy) * (ty - cy));
      if (d < R) k.lives = Math.max(0, k.lives - (d < 28 ? 2 : 1));
    });
    for (let dx = -R; dx <= R; dx++) {
      const xx = cx + dx;
      if (xx < 0 || xx >= W) continue;
      const bottom = Math.min(cy + Math.floor(Math.sqrt(R * R - dx * dx)), H - 10);
      if (next.heights[xx] < bottom) next.heights[xx] = bottom;
    }
  }

  const dead = next.tanks.map((k) => k.lives <= 0);
  if (dead[0] || dead[1]) next.winner = dead[0] && dead[1] ? 'draw' : dead[0] ? 1 : 0;

  return { path, impact, next };
}
