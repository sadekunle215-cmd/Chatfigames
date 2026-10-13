export const COLS = 7, ROWS = 6;

export function init() {
  return { board: new Array(COLS * ROWS).fill(null), turn: 0, winner: null, line: null };
}

function check(b, r, c, p) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const cells = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr * COLS + cc] === p) {
        cells.push([rr, cc]);
        rr += dr * s; cc += dc * s;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// move = { col: 0..6 }. Returns null if the move is illegal.
export function step(s, move) {
  if (s.winner !== null) return null;
  const col = move && move.col;
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return null;
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (s.board[r * COLS + col] === null) { row = r; break; }
  }
  if (row < 0) return null;
  const board = s.board.slice();
  board[row * COLS + col] = s.turn;
  const line = check(board, row, col, s.turn);
  const full = board.every((v) => v !== null);
  return {
    next: { board, turn: 1 - s.turn, winner: line ? s.turn : full ? 'draw' : null, line },
    fx: { row, col },
  };
}

export const winner = (s) => s.winner;
