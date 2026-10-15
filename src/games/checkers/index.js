import { mountBoard } from '../boardscene.js';
import { init, step, winner, legalMoves } from './engine.js';
import { drawCheckersPiece } from './art.js';
import { pickMove } from './bot.js';

const adapter = {
  labels: false,
  sideNames: ['Crimson', 'Ivory'],
  avatarCode: ['A', 'B'],
  accent: [0xc8402f, 0xf2e8d4],
  init,
  step,
  moves: (s) => legalMoves(s).map((m) => Object.assign({ hops: m.path }, m)),
  pieces: (s) => s.board,
  sideOf: (code) => (code === 'a' || code === 'A' ? 0 : 1),
  drawPiece: drawCheckersPiece,
  wire: (m) => ({ from: m.from, path: m.path }),
  bot: (s) => pickMove(s, { depth: 6, ms: 1000, slip: 0.08 }),
};

export default {
  id: 'checkers',
  name: 'Checkers',
  tagline: 'Jump, capture and crown your kings',
  tier: 'verified',
  color: '#c8402f',
  orientation: 'portrait',
  ambient: 'lounge',
  bot: true,
  engine: { init, step, winner },
  mount: (el, opts) => mountBoard(el, opts, adapter),
};
