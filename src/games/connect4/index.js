import Phaser from 'phaser';
import { COLS, ROWS, init, step, winner } from './engine.js';
import { pickMove } from './bot.js';

const CELL = 64, W = 480, H = 560;
const X0 = (W - COLS * CELL) / 2, Y0 = 120;
const COLORS = [0x111111, 0xb0b0aa];

class C4 extends Phaser.Scene {
  create() {
    const opts = this.registry.get('opts');
    this.online = opts.online || null;
    this.audio = opts.audio || null;
    this.bot = opts.bot ? { side: 1, wait: null } : null;
    this.state = init();
    this.busy = false;
    this.hover = -1;
    this.g = this.add.graphics();
    const font = { fontFamily: 'Space Grotesk, Inter, sans-serif', color: '#111111' };
    this.ui = this.add.text(W / 2, 48, '', Object.assign({ fontSize: '22px' }, font)).setOrigin(0.5);
    this.sub = this.add.text(W / 2, 80, '', Object.assign({ fontSize: '14px' }, font)).setOrigin(0.5).setAlpha(0.6);
    if (this.bot) this.sub.setText('You play black · Bot plays gray');
    else if (this.online) this.sub.setText('You play ' + (this.online.side === 0 ? 'black' : 'gray'));
    this.input.on('pointermove', (p) => { this.hover = this.colAt(p.x); this.render(); });
    this.input.on('pointerdown', (p) => this.tap(p));
    if (this.online) this.online.onMove((m) => this.remoteMove(m));
    this.render();
  }

  colAt(x) {
    const c = Math.floor((x - X0) / CELL);
    return c >= 0 && c < COLS ? c : -1;
  }

  sfx(n) {
    if (this.audio) this.audio.play(n);
  }

  endSound(w) {
    if (w === 'draw') return;
    this.sfx(this.bot ? (w === 0 ? 'win' : 'lose') : this.online ? (w === this.online.side ? 'win' : 'lose') : 'win');
  }

  update(time, delta) {
    const b = this.bot;
    if (!b || this.busy || this.state.winner !== null || this.state.turn !== b.side) return;
    if (b.wait === null) b.wait = 0.7;
    b.wait -= delta / 1000;
    if (b.wait > 0) return;
    b.wait = null;
    const col = pickMove(this.state, 4);
    if (col !== null) this.play(col);
  }

  myTurn() {
    if (this.bot) return this.state.turn !== this.bot.side;
    return !this.online || this.state.turn === this.online.side;
  }

  tap(p) {
    if (this.state.winner !== null) {
      if (!this.online) { this.state = init(); this.render(); }
      return;
    }
    if (this.busy || !this.myTurn()) return;
    const col = this.colAt(p.x);
    if (col < 0) return;
    if (this.play(col) && this.online) this.online.send({ col });
  }

  // Moves from the opponent are checked by the same rules engine before being applied
  remoteMove(m) {
    if (this.busy) { this.time.delayedCall(100, () => this.remoteMove(m)); return; }
    if (!m || this.myTurn()) return;
    this.play(m.col);
  }

  play(col) {
    const res = step(this.state, { col });
    if (!res) return false;
    this.busy = true;
    const who = this.state.turn;
    this.render();
    const disc = this.add.circle(X0 + col * CELL + CELL / 2, Y0 - 30, CELL / 2 - 6, COLORS[who]);
    this.tweens.add({
      targets: disc,
      y: Y0 + res.fx.row * CELL + CELL / 2,
      duration: 120 + res.fx.row * 70,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        disc.destroy();
        if (this.audio) this.audio.play('drop');
        this.state = res.next;
        if (res.next.winner !== null) this.endSound(res.next.winner);
        this.busy = false;
        this.render();
      },
    });
    return true;
  }

  render() {
    const s = this.state, g = this.g;
    g.clear();
    g.fillStyle(0xd9d9d3, 1);
    g.fillRoundedRect(X0 - 10, Y0 - 5, COLS * CELL + 20, ROWS * CELL + 20, 16);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(X0 - 10, Y0 - 10, COLS * CELL + 20, ROWS * CELL + 20, 16);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = s.board[r * COLS + c];
        g.fillStyle(v === null ? 0xeeeeea : COLORS[v], 1);
        g.fillCircle(X0 + c * CELL + CELL / 2, Y0 + r * CELL + CELL / 2, CELL / 2 - 6);
      }
    }
    if (s.line) {
      g.lineStyle(3, 0x111111, 1);
      s.line.forEach(([r, c]) =>
        g.strokeCircle(X0 + c * CELL + CELL / 2, Y0 + r * CELL + CELL / 2, CELL / 2 - 1));
    }
    if (!this.busy && s.winner === null && this.hover >= 0 && this.myTurn()) {
      g.fillStyle(COLORS[s.turn], 0.5);
      g.fillCircle(X0 + this.hover * CELL + CELL / 2, Y0 - 30, CELL / 2 - 6);
    }
    const w = winner(s);
    if (w === null) {
      if (this.bot) this.ui.setText(this.myTurn() ? 'Your turn' : 'Bot is thinking...');
      else if (this.online) this.ui.setText(this.myTurn() ? 'Your turn' : "Opponent's turn…");
      else this.ui.setText('Player ' + (s.turn + 1) + "'s turn");
      this.ui.setColor(s.turn === 0 ? '#111111' : '#8a8a84');
    } else {
      const tail = this.online ? '' : ' Tap to restart';
      this.ui.setText(
        w === 'draw' ? 'Draw!' + tail
          : this.bot ? (w === 0 ? 'You win!' : 'Bot wins!') + ' Tap to restart'
          : this.online ? (w === this.online.side ? 'You win!' : 'You lose')
          : 'Player ' + (w + 1) + ' wins!' + tail);
      this.ui.setColor('#111111');
    }
  }
}

export default {
  id: 'connect4',
  name: 'Connect 4',
  tagline: 'Drop discs, line up four',
  tier: 'verified',
  orientation: 'portrait',
  bot: true,
  color: '#38bdf8',
  engine: { init, step, winner },

  mount(el, opts) {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      width: W,
      height: H,
      transparent: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: C4,
      callbacks: { preBoot: (g) => g.registry.set('opts', opts || {}) },
    });
    return { destroy: () => game.destroy(true) };
  },
};
