const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const RD = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const colorOf = (p) => (p === null ? -1 : p === p.toUpperCase() ? 0 : 1);
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

function fromFen(fen) {
  const b = [];
  for (const ch of fen) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') for (let i = 0; i < +ch; i++) b.push(null);
    else b.push(ch);
  }
  return b;
}

const keyOf = (b, turn, castle, ep) => b.map((x) => x || '.').join('') + turn + castle + ep;

export const kingSq = (b, color) => b.indexOf(color === 0 ? 'K' : 'k');

export function attacked(b, sq, by) {
  const r = sq >> 3, c = sq & 7;
  const P = by === 0 ? 'P' : 'p', N = by === 0 ? 'N' : 'n', B = by === 0 ? 'B' : 'b';
  const R = by === 0 ? 'R' : 'r', Q = by === 0 ? 'Q' : 'q', K = by === 0 ? 'K' : 'k';
  const pr = by === 0 ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inb(pr, c + dc) && b[pr * 8 + c + dc] === P) return true;
  for (const [dr, dc] of KN) if (inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === N) return true;
  for (const [dr, dc] of KG) if (inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === K) return true;
  for (const [dr, dc] of BD) {
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc)) {
      const p = b[rr * 8 + cc];
      if (p !== null) { if (p === B || p === Q) return true; break; }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of RD) {
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc)) {
      const p = b[rr * 8 + cc];
      if (p !== null) { if (p === R || p === Q) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

function pseudo(s) {
  const b = s.board, me = s.turn, out = [];
  for (let from = 0; from < 64; from++) {
    const p = b[from];
    if (p === null || colorOf(p) !== me) continue;
    const r = from >> 3, c = from & 7, t = p.toLowerCase();
    if (t === 'p') {
      const dir = me === 0 ? -1 : 1, start = me === 0 ? 6 : 1, last = me === 0 ? 0 : 7;
      const add = (to) => {
        if ((to >> 3) === last) for (const pr of ['Q', 'R', 'B', 'N']) out.push({ from, to, promo: pr });
        else out.push({ from, to });
      };
      if (inb(r + dir, c) && b[(r + dir) * 8 + c] === null) {
        add((r + dir) * 8 + c);
        if (r === start && b[(r + 2 * dir) * 8 + c] === null) out.push({ from, to: (r + 2 * dir) * 8 + c });
      }
      for (const dc of [-1, 1]) {
        const rr = r + dir, cc = c + dc;
        if (!inb(rr, cc)) continue;
        const to = rr * 8 + cc;
        if ((b[to] !== null && colorOf(b[to]) !== me) || to === s.ep) add(to);
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KN : KG) {
        const rr = r + dr, cc = c + dc;
        if (!inb(rr, cc)) continue;
        const to = rr * 8 + cc;
        if (colorOf(b[to]) !== me) out.push({ from, to });
      }
      if (t === 'k' && from === (me === 0 ? 60 : 4)) {
        const rights = s.castle, enemy = 1 - me, row = me === 0 ? 56 : 0;
        const rook = me === 0 ? 'R' : 'r';
        if (rights.includes(me === 0 ? 'K' : 'k') && b[row + 5] === null && b[row + 6] === null && b[row + 7] === rook &&
          !attacked(b, from, enemy) && !attacked(b, row + 5, enemy) && !attacked(b, row + 6, enemy)) {
          out.push({ from, to: row + 6 });
        }
        if (rights.includes(me === 0 ? 'Q' : 'q') && b[row + 1] === null && b[row + 2] === null && b[row + 3] === null && b[row] === rook &&
          !attacked(b, from, enemy) && !attacked(b, row + 3, enemy) && !attacked(b, row + 2, enemy)) {
          out.push({ from, to: row + 2 });
        }
      }
    } else {
      const dirs = t === 'b' ? BD : t === 'r' ? RD : BD.concat(RD);
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (inb(rr, cc)) {
          const to = rr * 8 + cc;
          if (b[to] === null) out.push({ from, to });
          else { if (colorOf(b[to]) !== me) out.push({ from, to }); break; }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

export function apply(s, m) {
  const b = s.board.slice(), piece = b[m.from], me = s.turn;
  const pawn = piece === 'P' || piece === 'p';
  let cap = b[m.to], ep = -1, epCap = false, promoted = false, castled = null;
  if (pawn && m.to === s.ep && cap === null && (m.to & 7) !== (m.from & 7)) {
    const cs = me === 0 ? m.to + 8 : m.to - 8;
    cap = b[cs];
    b[cs] = null;
    epCap = true;
  }
  b[m.to] = piece;
  b[m.from] = null;
  if (pawn && (m.to < 8 || m.to >= 56)) {
    const pc = m.promo || 'Q';
    b[m.to] = me === 0 ? pc : pc.toLowerCase();
    promoted = true;
  }
  if (pawn && Math.abs(m.to - m.from) === 16) ep = (m.from + m.to) >> 1;
  if ((piece === 'K' || piece === 'k') && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; castled = { from: m.to + 1, to: m.to - 1 }; }
    else { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; castled = { from: m.to - 2, to: m.to + 1 }; }
  }
  let cr = s.castle;
  const strip = (chars) => { for (const ch of chars) cr = cr.replace(ch, ''); };
  if (piece === 'K') strip('KQ');
  if (piece === 'k') strip('kq');
  for (const sq of [m.from, m.to]) {
    if (sq === 63) strip('K');
    if (sq === 56) strip('Q');
    if (sq === 7) strip('k');
    if (sq === 0) strip('q');
  }
  return {
    board: b, turn: 1 - me, castle: cr, ep,
    half: pawn || cap !== null ? 0 : s.half + 1,
    full: s.full + (me === 1 ? 1 : 0),
    cap, epCap, promoted, castled,
  };
}

export function legalMoves(s) {
  const out = [];
  for (const m of pseudo(s)) {
    const n = apply(s, m);
    const ks = kingSq(n.board, s.turn);
    if (ks >= 0 && !attacked(n.board, ks, 1 - s.turn)) out.push(m);
  }
  return out;
}

function insufficient(b) {
  const rest = b.filter((p) => p !== null && p.toLowerCase() !== 'k');
  if (rest.length === 0) return true;
  return rest.length === 1 && 'bn'.includes(rest[0].toLowerCase());
}

export function init() {
  const board = fromFen(START);
  const rep = {};
  rep[keyOf(board, 0, 'KQkq', -1)] = 1;
  return { board, turn: 0, castle: 'KQkq', ep: -1, half: 0, full: 1, rep, winner: null, over: false, reason: '', check: false, last: null };
}

export function step(s, move) {
  if (!move || s.winner !== null) return null;
  const cands = legalMoves(s).filter((m) => m.from === move.from && m.to === move.to);
  if (!cands.length) return null;
  let m = cands[0];
  if (cands.length > 1) m = cands.find((c) => c.promo === (move.promo || 'Q')) || cands.find((c) => c.promo === 'Q');
  const a = apply(s, m);
  const rep = Object.assign({}, s.rep);
  const key = keyOf(a.board, a.turn, a.castle, a.ep);
  rep[key] = (rep[key] || 0) + 1;

  const moves = legalMoves(a), ks = kingSq(a.board, a.turn);
  const check = ks >= 0 && attacked(a.board, ks, 1 - a.turn);
  let over = false, win = null, reason = '';
  if (!moves.length) { over = true; win = check ? 1 - a.turn : 'draw'; reason = check ? 'checkmate' : 'stalemate'; }
  else if (a.half >= 100) { over = true; win = 'draw'; reason = 'fifty-move rule'; }
  else if (insufficient(a.board)) { over = true; win = 'draw'; reason = 'not enough pieces to win'; }
  else if (rep[key] >= 3) { over = true; win = 'draw'; reason = 'threefold repetition'; }

  const next = {
    board: a.board, turn: a.turn, castle: a.castle, ep: a.ep, half: a.half, full: a.full, rep,
    winner: win, over, reason, check, last: { from: m.from, to: m.to },
  };
  const capSq = a.cap === null ? -1 : a.epCap ? (s.turn === 0 ? m.to + 8 : m.to - 8) : m.to;
  const fx = {
    hops: [m.to],
    captures: capSq >= 0 ? [{ sq: capSq, hop: 0 }] : [],
    extra: a.castled ? [a.castled] : [],
    promoted: a.promoted ? { sq: m.to, code: a.board[m.to] } : null,
    sound: a.castled ? 'castle' : a.cap !== null ? 'capture' : a.promoted ? 'promote' : 'move',
    check,
  };
  return { next, fx };
}

export const winner = (s) => s.winner;
