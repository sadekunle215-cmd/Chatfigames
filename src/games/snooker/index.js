import Phaser from 'phaser';
import { SnookerScene } from './scene.js';
import { init, step, winner } from './engine.js';

export default {
  id: 'snooker',
  name: 'Snooker',
  tagline: 'Pot the reds, then the colours',
  tier: 'verified',
  color: '#1b8a54',
  orientation: 'landscape',
  ambient: 'lounge',
  bot: true,
  engine: { init, step, winner },

  mount(el, opts) {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      backgroundColor: '#100d0a',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: SnookerScene,
      callbacks: { preBoot: (g) => g.registry.set('opts', opts || {}) },
    });
    return { destroy: () => game.destroy(true) };
  },
};
