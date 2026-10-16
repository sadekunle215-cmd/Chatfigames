import { TW, TH, R, FRIC, POCKETS } from './physics.js';
import { step, legalTargets, validCue, XB } from './engine.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const quant = (a) => Math.round(a * 20) / 20;
const deg = (r) => (r * 180) / Math.PI;

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  let t = l2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / l2;
  t = clamp(t, 0, 1);
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return Math.sqrt(dx * dx + dy * dy);
}

// aim the cue ball at the "ghost ball" so the object ball goes into pocket p
function plan(s, cue, id, p) {
  const b = s.balls[id], P = POCKETS[p];
  let ux = P[0] - b.x, uy = P[1] - b.y;
  const L2 = Math.sqrt(ux * ux + uy * uy);
  if (L2 < 1) return null;
  ux /= L2;
  uy /= L2;
  const gx = b.x - ux * 2 * R, gy = b.y - uy * 2 * R;
  if (gx < R || gx > TW - R || gy < R || gy > TH - R) return null;
  let dx = gx - cue[0], dy = gy - cue[1];
  const L1 = Math.sqrt(dx * dx + dy * dy);
  if (L1 < 2) return null;
  dx /= L1;
  dy /= L1;
  const cut = dx * ux + dy * uy;
  if (cut < 0.3) return null;
  for (let k = 1; k < s.balls.length; k++) {
    const o = s.balls[k];
    if (!o.on || k === id) continue;
    if (segDist(o.x, o.y, cue[0], cue[1], gx, gy) < 2 * R + 0.3) return null;
    if (segDist(o.x, o.y, b.x, b.y, P[0], P[1]) < 2 * R + 0.3) return null;
  }
  const vBall = Math.sqrt(2 * FRIC * L2) + 25;
  const vContact = vBall / (0.98 * cut);
  const vStart = Math.sqrt(vContact * vContact + 2 * FRIC * L1);
  return {
    angle: quant(deg(Math.atan2(dy, dx))),
    power: clamp(Math.round(vStart / 5.2), 12, 100),
    quality: cut * 100 - L1 * 0.05 - L2 * 0.08,
    dist: L1,
    cue,
  };
}

function dCandidates(s) {
  const out = [[XB - 25, TH / 2]];
  for (let a = -75; a <= 75; a += 25) {
    for (const r of [24, 46]) {
      const x = Math.round((XB - r * Math.cos((a * Math.PI) / 180)) * 10) / 10;
      const y = Math.round((TH / 2 + r * Math.sin((a * Math.PI) / 180)) * 10) / 10;
      if (validCue(s.balls, x, y)) out.push([x, y]);
    }
  }
  return out;
}

const build = (c, s) => {
  const shot = { angle: c.angle, power: c.power };
  if (s.inHand) shot.cue = c.cue;
  return shot;
};

function noisy(shot, c) {
  const err = (Math.random() * 2 - 1) * (0.25 + c.dist / 1500);
  return Object.assign({}, shot, {
    angle: quant(shot.angle + err),
    power: clamp(Math.round(shot.power + (Math.random() * 2 - 1) * 4), 5, 100),
  });
}

// nothing to pot: tap the nearest legal ball gently
function safety(s, tg, cues) {
  const cue = cues[0];
  const dist = (id) => Math.hypot(s.balls[id].x - cue[0], s.balls[id].y - cue[1]);
  const sorted = tg.slice().sort((a, b) => dist(a) - dist(b));
  let fallback = null;
  for (const id of sorted) {
    const ang = quant(deg(Math.atan2(s.balls[id].y - cue[1], s.balls[id].x - cue[0])));
    for (const power of [26, 38]) {
      const shot = { angle: ang, power };
      if (s.inHand) shot.cue = cue;
      if (!fallback) fallback = shot;
      const r = step(s, shot);
      if (r && !r.fx.foul) return shot;
    }
  }
  return fallback || (s.inHand ? { angle: 0, power: 30, cue } : { angle: 0, power: 30 });
}

export function pickShot(s) {
  const me = s.turn, tg = legalTargets(s);
  const cues = s.inHand ? dCandidates(s) : [[s.balls[0].x, s.balls[0].y]];
  const cands = [];
  for (const cue of cues) {
    for (const id of tg) {
      for (let p = 0; p < 6; p++) {
        const c = plan(s, cue, id, p);
        if (c) cands.push(c);
      }
    }
  }
  cands.sort((a, b) => b.quality - a.quality);
  let best = null;
  for (const c of cands.slice(0, 6)) {
    const shot = build(c, s);
    const r = step(s, shot);
    if (!r) continue;
    const gain = (r.next.scores[me] - s.scores[me]) - (r.next.scores[1 - me] - s.scores[1 - me]) +
      (r.next.turn === me && !r.fx.foul ? 1.5 : 0);
    if (!best || gain > best.gain) best = { gain, shot, c };
  }
  if (best && best.gain > 0.5) return noisy(best.shot, best.c);
  return safety(s, tg, cues);
}
