import { TW, TH, R, runShot } from './physics.js';

const PI = 3.141592653589793;
function sin(x) {
  x = x % (2 * PI);
  if (x > PI) x -= 2 * PI;
  if (x < -PI) x += 2 * PI;
  let term = x, sum = x;
  for (let i = 1; i < 15; i++) {
    term = (-term * x * x) / ((2 * i) * (2 * i + 1));
    sum += term;
  }
  return sum;
}
const cos = (x) => sin(x + PI / 2);

// ball ids: 0 cue, 1-15 reds, 16 yellow, 17 green, 18 brown, 19 blue, 20 pink, 21 black
export const POINTS = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7];
export const COLOURS = [16, 17, 18, 19, 20, 21];
export const XB = TW * 0.2; // baulk line
export const DR = TH / 6;   // radius of the D
export const SPOTS = {
  16: [XB, TH / 2 + DR], 17: [XB, TH / 2 - DR], 18: [XB, TH / 2],
  19: [TW / 2, TH / 2], 20: [TW * 0.75, TH / 2], 21: [TW * 0.9115, TH / 2],
};

const isRed = (id) => id >= 1 && id <= 15;
const redsOn = (balls) => { let n = 0; for (let i = 1; i <= 15; i++) if (balls[i].on) n++; return n; };
const lowestColour = (balls) => COLOURS.find((id) => balls[id].on) || 21;

function legalContact(s, id) {
  if (s.phase === 'red') return isRed(id);
  if (s.phase === 'colour') return id >= 16;
  return id === s.target;
}
const valueOn = (s) => (s.phase === 'red' ? 1 : s.phase === 'colour' ? 7 : POINTS[s.target]);

export function legalTargets(s) {
  const out = [];
  if (s.phase === 'red') { for (let i = 1; i <= 15; i++) if (s.balls[i].on) out.push(i); }
  else if (s.phase === 'colour') { for (const id of COLOURS) if (s.balls[id].on) out.push(id); }
  else out.push(s.target);
  return out;
}

export function validCue(balls, x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return false;
  if (x < R || x > XB) return false;
  const dx = x - XB, dy = y - TH / 2;
  if (dx * dx + dy * dy > DR * DR) return false;
  for (let i = 1; i < balls.length; i++) {
    if (!balls[i].on) continue;
    const ex = balls[i].x - x, ey = balls[i].y - y;
    if (ex * ex + ey * ey < (2 * R + 0.5) * (2 * R + 0.5)) return false;
  }
  return true;
}

// put a colour back on its spot (or the next free spot, highest first)
function respot(balls, id) {
  const free = (x, y) => {
    for (let i = 0; i < balls.length; i++) {
      if (i === id || !balls[i].on) continue;
      const dx = balls[i].x - x, dy = balls[i].y - y;
      if (dx * dx + dy * dy < (2 * R + 0.2) * (2 * R + 0.2)) return false;
    }
    return true;
  };
  for (const c of [id, 21, 20, 19, 18, 17, 16]) {
    const sp = SPOTS[c];
    if (free(sp[0], sp[1])) { balls[id].x = sp[0]; balls[id].y = sp[1]; balls[id].on = true; return; }
  }
  const sp = SPOTS[id];
  for (let dx = 0; dx < TW; dx += 2) {
    for (const sg of [1, -1]) {
      const x = sp[0] + sg * dx;
      if (x >= R && x <= TW - R && free(x, sp[1])) { balls[id].x = x; balls[id].y = sp[1]; balls[id].on = true; return; }
    }
  }
}

export function init() {
  const balls = [{ x: XB - 25, y: TH / 2, on: true }];
  const apexX = SPOTS[20][0] + 2 * R + 0.1;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      balls.push({ x: apexX + row * (Math.sqrt(3) * R + 0.05), y: TH / 2 + (k - row / 2) * (2 * R + 0.1), on: true });
    }
  }
  for (const id of COLOURS) balls.push({ x: SPOTS[id][0], y: SPOTS[id][1], on: true });
  return {
    balls, turn: 0, scores: [0, 0], phase: 'red', target: 16, inHand: true,
    over: false, winner: null, reason: '', last: null, check: false,
  };
}

// shot = { angle (degrees), power (1-100), cue: [x, y] (only when the cue ball is in hand) }
export function step(s, shot) {
  if (!shot || s.over) return null;
  const angle = Number(shot.angle), power = Number(shot.power);
  if (!isFinite(angle) || !isFinite(power) || power < 1 || power > 100 || Math.abs(angle) > 720) return null;
  const balls = s.balls.map((b) => ({ x: b.x, y: b.y, on: b.on, vx: 0, vy: 0 }));
  if (s.inHand) {
    const c = shot.cue;
    if (!Array.isArray(c) || !validCue(balls, c[0], c[1])) return null;
    balls[0].x = c[0];
    balls[0].y = c[1];
    balls[0].on = true;
  }
  if (!balls[0].on) return null;
  const rad = (angle * PI) / 180, v = power * 5.2;
  balls[0].vx = cos(rad) * v;
  balls[0].vy = sin(rad) * v;

  const sim = runShot(balls);
  const me = s.turn, opp = 1 - me;
  let first = -1;
  for (const e of sim.events) {
    if (e.k === 'hit' && (e.a === 0 || e.b === 0)) { first = e.a === 0 ? e.b : e.a; break; }
  }
  const potted = sim.events.filter((e) => e.k === 'pot').map((e) => e.id);
  const pots = potted.filter((id) => id !== 0);
  const cuePotted = potted.includes(0);

  let foul = false, why = '';
  if (first === -1) { foul = true; why = 'no ball hit'; }
  else if (!legalContact(s, first)) { foul = true; why = 'wrong ball first'; }
  if (cuePotted) { foul = true; why = why || 'cue ball potted'; }
  if (s.phase === 'red') {
    if (pots.some((id) => !isRed(id))) { foul = true; why = why || 'potted a colour'; }
  } else if (s.phase === 'colour') {
    if (pots.length > 1 || (pots.length === 1 && pots[0] !== first)) { foul = true; why = why || 'wrong ball potted'; }
  } else if (pots.some((id) => id !== s.target)) { foul = true; why = why || 'wrong ball potted'; }

  const scores = s.scores.slice();
  let turn = me, phase = s.phase, inHand = false, over = false, pen = 0, pts = 0;

  if (foul) {
    pen = Math.max(4, valueOn(s), first >= 0 ? POINTS[first] : 0);
    for (const id of pots) pen = Math.max(pen, POINTS[id]);
    scores[opp] += pen;
    turn = opp;
    inHand = cuePotted;
    if (s.phase === 'clearance' && pots.includes(21)) over = true;
    else for (const id of pots) if (id >= 16) respot(balls, id);
    if (s.phase === 'colour') phase = redsOn(balls) > 0 ? 'red' : 'clearance';
  } else if (s.phase === 'red') {
    if (pots.length) { scores[me] += pots.length; pts = pots.length; phase = 'colour'; }
    else turn = opp;
  } else if (s.phase === 'colour') {
    if (pots.length) { pts = POINTS[pots[0]]; scores[me] += pts; respot(balls, pots[0]); }
    else turn = opp;
    phase = redsOn(balls) > 0 ? 'red' : 'clearance';
  } else if (pots.length) {
    pts = POINTS[s.target];
    scores[me] += pts;
    if (s.target === 21) over = true;
  } else turn = opp;

  const target = phase === 'clearance' ? lowestColour(balls) : s.target;
  let winnerSide = null;
  if (over) winnerSide = scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;

  const nb = balls.map((b) => ({ x: b.x, y: b.y, on: b.on }));
  if (inHand) nb[0] = { x: XB - 25, y: TH / 2, on: true };

  const next = {
    balls: nb, turn, scores, phase, target, inHand, over,
    winner: winnerSide, reason: over ? 'frame complete' : '', last: { first, pots, foul }, check: false,
  };
  const fx = { frames: sim.frames, events: sim.events, first, pots, foul, why, pen, pts, cuePotted };
  return { next, fx };
}

export const winner = (s) => s.winner;
