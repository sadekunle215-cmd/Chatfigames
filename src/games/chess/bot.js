import { legalMoves, apply, kingSq, attacked } from './engine.js';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const TIMEOUT = { timeout: true };
let nodes = 0, t0 = 0, budget = 0;

// score from the point of view of the side to move
function evaluate(s) {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (p === null) continue;
    const white = p === p.toUpperCase(), t = p.toLowerCase();
    const r = i >> 3, c = i & 7;
    const cen = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5));
    let x = VAL[t];
    if (t === 'n' || t === 'b') x += cen * 8;
    if (t === 'p') x += (white ? 6 - r : r - 1) * 6 + cen * 2;
    if (t === 'q') x += cen * 2;
    if (t === 'k') x += white ? (r - 3) * 6 : (4 - r) * 6;
    v += white ? x : -x;
  }
  return s.turn === 0 ? v : -v;
}

function order(s, moves) {
  const score = (m) => {
    const victim = s.board[m.to];
    return (victim ? VAL[victim.toLowerCase()] * 10 - VAL[s.board[m.from].toLowerCase()] : 0) + (m.promo ? 800 : 0);
  };
  moves.sort((a, b) => score(b) - score(a));
}

function nega(s, depth, alpha, beta) {
  if ((++nodes & 255) === 0 && Date.now() - t0 > budget) throw TIMEOUT;
  const moves = legalMoves(s);
  if (!moves.length) {
    const k = kingSq(s.board, s.turn);
    return k >= 0 && attacked(s.board, k, 1 - s.turn) ? -90000 - depth : 0;
  }
  if (depth === 0) return evaluate(s);
  order(s, moves);
  let best = -Infinity;
  for (const m of moves) {
    const v = -nega(apply(s, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Thinks a few moves ahead within a time limit. `slip` = chance of a human-like inaccuracy.
export function pickMove(s, opts = {}) {
  const maxDepth = opts.depth || 3;
  budget = opts.ms || 1100;
  t0 = Date.now();
  nodes = 0;
  const roots = legalMoves(s);
  if (!roots.length) return null;
  order(s, roots);
  const scored = roots.map((m) => ({ m, v: 0 }));
  let best = roots[0], shallow = null;
  for (let d = 1; d <= maxDepth; d++) {
    try {
      let alpha = -Infinity, bm = null;
      for (const e of scored) {
        const v = -nega(apply(s, e.m), d - 1, -Infinity, -alpha);
        e.v = v;
        if (v > alpha) { alpha = v; bm = e.m; }
      }
      if (bm) best = bm;
      if (d === 1) shallow = scored.slice().sort((a, b) => b.v - a.v);
      scored.sort((a, b) => b.v - a.v);
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
  }
  if (shallow && Math.random() < (opts.slip || 0)) {
    const pool = shallow.slice(0, 3);
    return pool[Math.floor(Math.random() * pool.length)].m;
  }
  return best;
}
