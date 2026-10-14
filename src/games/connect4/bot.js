import { COLS, ROWS, step } from './engine.js';

const ORDER = [3, 2, 4, 1, 5, 0, 6];

const WINS = (() => {
  const out = [];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) { cells.length = 0; break; }
          cells.push(rr * COLS + cc);
        }
        if (cells.length === 4) out.push(cells);
      }
    }
  }
  return out;
})();

function evaluate(board, me) {
  let s = 0;
  for (const w of WINS) {
    let m = 0, o = 0;
    for (const i of w) {
      const v = board[i];
      if (v === me) m++;
      else if (v !== null) o++;
    }
    if (m && o) continue;
    if (m === 3) s += 6; else if (m === 2) s += 2;
    if (o === 3) s -= 7; else if (o === 2) s -= 2;
  }
  for (let r = 0; r < ROWS; r++) if (board[r * COLS + 3] === me) s += 3;
  return s;
}

function search(state, depth, alpha, beta, me) {
  if (state.winner !== null) {
    return state.winner === 'draw' ? 0 : state.winner === me ? 1000 + depth : -1000 - depth;
  }
  if (depth === 0) return evaluate(state.board, me);
  const maximizing = state.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const col of ORDER) {
    const r = step(state, { col });
    if (!r) continue;
    const v = search(r.next, depth - 1, alpha, beta, me);
    if (maximizing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return best;
}

// Looks `depth` moves ahead. Takes wins, blocks yours, and sometimes slips so it can be beaten.
export function pickMove(state, depth = 4) {
  const me = state.turn;
  const moves = ORDER.filter((c) => step(state, { col: c }));
  if (!moves.length) return null;
  let bestV = -Infinity, bestC = moves[0];
  for (const col of moves) {
    const r = step(state, { col });
    const v = search(r.next, depth - 1, -Infinity, Infinity, me);
    if (v > bestV) { bestV = v; bestC = col; }
  }
  if (Math.abs(bestV) < 900 && Math.random() < 0.08) return moves[Math.floor(Math.random() * moves.length)];
  return bestC;
}
