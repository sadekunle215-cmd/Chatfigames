import { mountBoard } from '../boardscene.js';
import { init, step, winner, legalMoves, kingSq } from './engine.js';
import { drawChessPiece } from './art.js';
import { pickMove } from './bot.js';

const adapter = {
  labels: true,
  sideNames: ['White', 'Black'],
  avatarCode: ['K', 'k'],
  accent: [0xf2eadb, 0x8a817a],
  init,
  step,
  moves: (s) => legalMoves(s).map((m) => Object.assign({ hops: [m.to] }, m)),
  pieces: (s) => s.board,
  sideOf: (code) => (code === code.toUpperCase() ? 0 : 1),
  drawPiece: drawChessPiece,
  wire: (m) => ({ from: m.from, to: m.to, promo: m.promo }),
  checkSquare: (s) => (s.check ? kingSq(s.board, s.turn) : -1),
  bot: (s) => pickMove(s, { depth: 3, ms: 1100, slip: 0.08 }),
};

export default {
  id: 'chess',
  name: 'Chess',
  tagline: 'The classic game of kings',
  tier: 'verified',
  color: '#c9a66b',
  orientation: 'portrait',
  ambient: 'lounge',
  bot: true,
  engine: { init, step, winner },
  mount: (el, opts) => mountBoard(el, opts, adapter),
};
