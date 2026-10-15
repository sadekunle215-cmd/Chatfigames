import { legalMoves, applyMove } from './engine.js';

const TIMEOUT = { timeout: true };
let nodes = 0, t0 = 0, budget = 0;

// score from the point of view of the side to move
function evaluate(s) {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (p === null) continue;
    const mine = p === 'a' || p === 'A' ? 0 : 1, king = p === 'A' || p === 'B';
    const r = i >> 3, c = i & 7;
    let val = king ? 170 : 100;
    if (!king) val += mine === 0 ? (7 - r) * 4 : r * 4;
    if (!king && ((mine === 0 && r === 7) || (mine === 1 && r === 0))) val += 8;
    if (c === 0 || c === 7) val += 2;
    v += mine === s.turn ? val : -val;
  }
  return v;
}

function nega(s, depth, alpha, beta) {
  if ((++nodes & 255) === 0 && Date.now() - t0 > budget) throw TIMEOUT;
  const moves = legalMoves(s);
  if (!moves.length) return -9999 - depth;
  if (depth === 0) return evaluate(s);
  let best = -Infinity;
  for (const m of moves) {
    const v = -nega(applyMove(s, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function pickMove(s, opts = {}) {
  const maxDepth = opts.depth || 6;
  budget = opts.ms || 1000;
  t0 = Date.now();
  nodes = 0;
  const roots = legalMoves(s);
  if (!roots.length) return null;
  if (roots.length === 1) return roots[0];
  const scored = roots.map((m) => ({ m, v: 0 }));
  let best = roots[0], shallow = null;
  for (let d = 2; d <= maxDepth; d++) {
    try {
      let alpha = -Infinity, bm = null;
      for (const e of scored) {
        const v = -nega(applyMove(s, e.m), d - 1, -Infinity, -alpha) + Math.random() * 0.5;
        e.v = v;
        if (v > alpha) { alpha = v; bm = e.m; }
      }
      if (bm) best = bm;
      if (d === 2) shallow = scored.slice().sort((a, b) => b.v - a.v);
      scored.sort((a, b) => b.v - a.v);
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
  }
  if (shallow && Math.random() < (opts.slip || 0)) {
    const pool = shallow.slice(0, 2);
    return pool[Math.floor(Math.random() * pool.length)].m;
  }
  return best;
}
