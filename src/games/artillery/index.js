import Phaser from 'phaser';
import { W, H, makeState, simulate } from './sim.js';
import { Duel } from './scene.js';

export default {
  id: 'artillery',
  name: 'Artillery Duel',
  tagline: 'Aim, fire, reshape the battlefield',
  tier: 'verified',
  orientation: 'landscape',
  color: '#a3e635',

  // Pure rules: same seed + same moves = same result on every device
  engine: {
    init: (seed) => makeState(seed),
    step: (state, move) => {
      if (state.winner !== null) return null;
      const ok = move && Number.isInteger(move.angle) && Number.isInteger(move.power) &&
        move.angle >= 0 && move.angle <= 180 && move.power >= 10 && move.power <= 100;
      if (!ok) return null;
      const r = simulate(state, move);
      return { next: r.next, fx: r };
    },
    winner: (state) => state.winner,
  },

  mount(el, opts) {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      width: W,
      height: H,
      transparent: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: Duel,
      callbacks: { preBoot: (g) => g.registry.set('opts', opts || {}) },
    });
    return { destroy: () => game.destroy(true) };
  },
};
