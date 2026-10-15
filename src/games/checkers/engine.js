const sideOf = (p) => (p === 'a' || p === 'A' ? 0 : 1);
const isKing = (p) => p === 'A' || p === 'B';
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

function dirsFor(p) {
  if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return sideOf(p) === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

// all capture sequences for one piece (a man stops when it is crowned)
function seq(b, at, p, caps, path, start, out) {
  let any = false;
  for (const [dr, dc] of dirsFor(p)) {
    const r = at >> 3, c = at & 7;
    const r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
    const mid = (r + dr) * 8 + (c + dc), land = r2 * 8 + c2;
    const mp = b[mid];
    if (mp === null || sideOf(mp) === sideOf(p) || caps.includes(mid)) continue;
    if (b[land] !== null && land !== start) continue;
    any = true;
    const crowned = !isKing(p) && r2 === (sideOf(p) === 0 ? 0 : 7);
    const np = path.concat([land]), nc = caps.concat([mid]);
    if (crowned) out.push({ from: start, path: np, caps: nc });
    else if (!seq(b, land, p, nc, np, start, out)) out.push({ from: start, path: np, caps: nc });
  }
  return any;
}

export function legalMoves(s) {
  const b = s.board, me = s.turn, jumps = [], steps = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === null || sideOf(p) !== me) continue;
    seq(b, i, p, [], [], i, jumps);
    for (const [dr, dc] of dirsFor(p)) {
      const r = (i >> 3) + dr, c = (i & 7) + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === null) steps.push({ from: i, path: [r * 8 + c], caps: [] });
    }
  }
  return jumps.length ? jumps : steps; // capturing is compulsory
}

export function applyMove(s, m) {
  const b = s.board.slice(), piece = b[m.from];
  b[m.from] = null;
  for (const c of m.caps) b[c] = null;
  const end = m.path[m.path.length - 1];
  let code = piece;
  if ((piece === 'a' || piece === 'b') && (end >> 3) === (sideOf(piece) === 0 ? 0 : 7)) code = piece.toUpperCase();
  b[end] = code;
  const man = piece === 'a' || piece === 'b';
  return { board: b, turn: 1 - s.turn, half: m.caps.length || man ? 0 : s.half + 1 };
}

export function init() {
  const board = new Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) board[r * 8 + c] = 'b';
      else if (r > 4) board[r * 8 + c] = 'a';
    }
  }
  return { board, turn: 0, half: 0, winner: null, over: false, reason: '', check: false, last: null };
}

export function step(s, move) {
  if (!move || s.winner !== null) return null;
  const m = legalMoves(s).find((x) => x.from === move.from && same(x.path, move.path));
  if (!m) return null;
  const a = applyMove(s, m);
  const end = m.path[m.path.length - 1];
  const next = { board: a.board, turn: a.turn, half: a.half, winner: null, over: false, reason: '', check: false, last: { from: m.from, to: end } };
  if (!legalMoves(next).length) { next.winner = s.turn; next.over = true; next.reason = 'no moves left'; }
  else if (next.half >= 80) { next.winner = 'draw'; next.over = true; next.reason = '40 moves without a capture'; }
  const crowned = a.board[end] !== s.board[m.from];
  const fx = {
    hops: m.path,
    captures: m.caps.map((sq, i) => ({ sq, hop: i })),
    extra: [],
    promoted: crowned ? { sq: end, code: a.board[end] } : null,
    sound: m.caps.length ? 'capture' : crowned ? 'promote' : 'move',
    check: false,
  };
  return { next, fx };
}

export const winner = (s) => s.winner;
