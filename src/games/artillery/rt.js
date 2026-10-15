import { W, H, R, G, LIVES, TUBE, PIVOT, makeState } from './sim.js';

export const TICK_MS = 1000 / 60;
export const RELOAD = 80; // ticks between shots (about 1.3 s)
const SPEED = 0.6;        // tank drive speed, px per tick
const MAX_AIR = 3;        // rockets one player can have in the air at once
const INV = 30;           // brief protection after being hit
const PI = 3.141592653589793;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// sin/cos from + - * / only, so every device gets identical results
function sin(x) {
  let term = x, sum = x;
  for (let i = 1; i < 12; i++) {
    term = (-term * x * x) / ((2 * i) * (2 * i + 1));
    sum += term;
  }
  return sum;
}
const cos = (x) => sin(PI / 2 - x);

export function makeRT(seed) {
  const base = makeState(seed);
  const tank = (x, angle) => ({ x, fx: x, lives: LIVES, dir: 0, cd: 60, inv: 0, angle });
  return { seed, heights: base.heights, tanks: [tank(80, 60), tank(720, 120)], rockets: [], tick: 0, winner: null };
}

function explode(s, x, y, air, ev) {
  const cx = clamp(Math.floor(x), 0, W - 1), cy = Math.floor(y);
  const gy = s.heights[cx];
  const low = !air || cy > gy - 22; // airbursts high above the ground leave no crater
  const rad = low ? R : 30;
  ev.push({ t: 'boom', x, y, air: !low });

  s.tanks.forEach((t, i) => {
    if (t.lives <= 0 || t.inv > 0) return;
    const dx = t.x - cx, dy = s.heights[t.x] - 16 - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < rad) {
      const lost = Math.min(t.lives, d < 28 ? 2 : 1);
      t.lives -= lost;
      t.inv = INV;
      ev.push({ t: 'hit', side: i, lost });
    }
  });

  if (low) {
    for (let dx = -R; dx <= R; dx++) {
      const xx = cx + dx;
      if (xx < 0 || xx >= W) continue;
      const bottom = Math.min(gy + Math.floor(Math.sqrt(R * R - dx * dx)), H - 10);
      if (s.heights[xx] < bottom) s.heights[xx] = bottom;
    }
    ev.push({ t: 'crater', x: cx });
  }
}

// One simulation tick. `inputs` are { side, k: 'drive', dir } or { side, k: 'fire', angle, power }.
export function stepTick(s, inputs) {
  const ev = [];
  if (s.winner !== null) return ev;

  for (const inp of inputs) {
    const t = s.tanks[inp.side];
    if (!t || t.lives <= 0) continue;
    if (inp.k === 'drive') {
      t.dir = inp.dir === -1 || inp.dir === 1 ? inp.dir : 0;
    } else if (inp.k === 'fire') {
      const ok = Number.isInteger(inp.angle) && Number.isInteger(inp.power) &&
        inp.angle >= 0 && inp.angle <= 180 && inp.power >= 10 && inp.power <= 100;
      if (!ok || t.cd > 0) continue;
      if (s.rockets.filter((r) => r.side === inp.side).length >= MAX_AIR) continue;
      const rad = (inp.angle * PI) / 180, sp = inp.power * 0.1;
      const x = t.x + cos(rad) * TUBE, y = s.heights[t.x] - PIVOT - sin(rad) * TUBE;
      s.rockets.push({ x, y, vx: cos(rad) * sp, vy: -sin(rad) * sp, side: inp.side, age: 0 });
      t.cd = RELOAD;
      t.angle = inp.angle;
      ev.push({ t: 'launch', side: inp.side, x, y });
    }
  }

  // tanks: reload, protection timer, driving
  for (const t of s.tanks) {
    if (t.lives <= 0) continue;
    if (t.cd > 0) t.cd--;
    if (t.inv > 0) t.inv--;
    if (t.dir) {
      const nfx = clamp(t.fx + t.dir * SPEED, 24, W - 25);
      const nx = Math.round(nfx);
      if (nx === t.x || s.heights[nx] - s.heights[t.x] >= -7) { t.fx = nfx; t.x = nx; }
    }
  }

  // rockets fly
  const live = [];
  for (const r of s.rockets) {
    r.age++;
    r.x += r.vx;
    r.y += r.vy;
    r.vy += G;
    if (r.x < 0 || r.x >= W || r.y > H) {
      ev.push({ t: 'miss', x: clamp(r.x, 0, W), y: Math.min(r.y, H) });
      continue;
    }
    live.push(r);
  }

  // rockets meeting in the air
  const gone = new Set();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.side === b.side || gone.has(a) || gone.has(b)) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < 144) {
        gone.add(a);
        gone.add(b);
        explode(s, (a.x + b.x) / 2, (a.y + b.y) / 2, true, ev);
      }
    }
  }

  // rockets hitting a tank or the ground
  for (const r of live) {
    if (gone.has(r)) continue;
    let boom = null;
    for (let i = 0; i < 2 && !boom; i++) {
      const t = s.tanks[i];
      if (t.lives <= 0 || (i === r.side && r.age < 20)) continue;
      const dx = r.x - t.x, dy = r.y - (s.heights[t.x] - 16);
      if (dx * dx + dy * dy < 289) boom = [r.x, r.y];
    }
    if (!boom) {
      const gy = s.heights[Math.floor(r.x)];
      if (r.y >= gy) boom = [r.x, gy];
    }
    if (boom) {
      gone.add(r);
      explode(s, boom[0], boom[1], false, ev);
    }
  }
  s.rockets = live.filter((r) => !gone.has(r));

  const d0 = s.tanks[0].lives <= 0, d1 = s.tanks[1].lives <= 0;
  if (d0 || d1) {
    s.winner = d0 && d1 ? 'draw' : d0 ? 1 : 0;
    ev.push({ t: 'end', winner: s.winner });
  }
  s.tick++;
  return ev;
}

// Where a rocket will come down if nothing interferes (used by the bot to dodge)
export function predictImpact(s, r) {
  let x = r.x, y = r.y, vx = r.vx, vy = r.vy;
  for (let i = 0; i < 1500; i++) {
    x += vx;
    y += vy;
    vy += G;
    if (x < 0 || x >= W || y > H) return null;
    if (y >= s.heights[Math.floor(x)]) return { x, y, ticks: i + 1 };
  }
  return null;
}
