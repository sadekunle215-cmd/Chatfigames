import Phaser from 'phaser';
import { COLS, ROWS, init, step, winner } from './engine.js';
import { pickMove } from './bot.js';
import { poly } from '../boardkit.js';

const W = 480, H = 760, CELL = 60, BX = 30, BY = 190, HR = 26, DR = 25;
const FONT = 'Space Grotesk, Inter, sans-serif';
const SIDE = [
  { name: 'Red', top: 0xe53935, dark: 0x8e1b18, ring: 0xb52a26 },
  { name: 'Yellow', top: 0xfbc531, dark: 0x9a7410, ring: 0xd9a21b },
];

function drawDisc(g, side, r) {
  const c = SIDE[side];
  g.fillStyle(c.dark, 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(c.top, 1);
  g.fillCircle(0, -0.5, r - 2.5);
  g.fillStyle(c.ring, 0.35);
  g.fillCircle(0, 0, r * 0.55);
  g.lineStyle(2.2, c.ring, 0.9);
  g.strokeCircle(0, 0, r * 0.64);
  g.fillStyle(0xffffff, 0.28);
  g.fillCircle(-r * 0.32, -r * 0.34, r * 0.22);
}

class C4 extends Phaser.Scene {
  create() {
    const opts = this.registry.get('opts') || {};
    this.online = opts.online || null;
    this.audio = opts.audio || null;
    this.bot = opts.bot ? { side: 1, pending: false } : null;
    this.mySide = this.online ? this.online.side : 0;
    this.state = init();
    this.busy = false;
    this.hover = -1;
    this.lastCell = null;
    this.discs = [];
    this.panelPos = [null, null];

    this.drawTable();
    this.drawBoardBack();
    this.hov = this.add.graphics().setDepth(1.6);
    this.drawFace();
    this.fxg = this.add.graphics().setDepth(7);
    this.makePanel(this.mySide, BY + ROWS * CELL + 44);
    this.makePanel(1 - this.mySide, 36);
    this.statusT = this.add
      .text(W / 2, 12, '', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#e8dcc2' })
      .setOrigin(0.5, 0).setDepth(6);
    this.refreshStatus();

    this.fit();
    this.onResize = () => this.fit();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));

    this.input.on('pointermove', (p) => this.setHover(this.colAt(this.cameras.main.getWorldPoint(p.x, p.y))));
    this.input.on('pointerdown', (p) => {
      if (this.state.over) { if (!this.online) this.scene.restart(); return; }
      const col = this.colAt(this.cameras.main.getWorldPoint(p.x, p.y));
      this.setHover(col);
      if (col >= 0) this.tap(col);
    });
    if (this.online) this.online.onMove((m) => this.remote(m));
  }

  fit() {
    const w = this.scale.width, h = this.scale.height;
    if (!w || !h) return;
    const cam = this.cameras.main;
    cam.setZoom(Math.min(w / W, h / H));
    cam.centerOn(W / 2, H / 2);
  }

  sfx(n) { if (this.audio) this.audio.play(n); }

  // ---------- scenery ----------
  drawTable() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x16261d, 1);
    g.fillRect(-2500, -2500, 5500, 5800);
    [[520, 0.35, 0x1f3a2a], [360, 0.4, 0x27493a], [220, 0.4, 0x2f5a44]].forEach(([r, a, col]) => {
      g.fillStyle(col, a);
      g.fillCircle(W / 2, BY + 3 * CELL, r);
    });
  }

  drawBoardBack() {
    const bw = COLS * CELL, bh = ROWS * CELL;
    const g = this.add.graphics().setDepth(1.2);
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(BX - 10, BY - 6, bw + 28, bh + 28, 18);
    g.fillStyle(0x143a86, 1);
    g.fillRoundedRect(BX - 6, BY + bh + 12, 34, 22, 6);
    g.fillRoundedRect(BX + bw - 28, BY + bh + 12, 34, 22, 6);
    g.fillStyle(0x1b4aa8, 1);
    g.fillRoundedRect(BX - 14, BY - 14, bw + 28, bh + 28, 18);
    const back = this.add.graphics().setDepth(1.5);
    back.fillStyle(0x0b1f4d, 1);
    back.fillRect(BX, BY, bw, bh);
  }

  // the front plate: every cell is a square with a round hole, so discs show through behind it
  drawFace() {
    const g = this.add.graphics().setDepth(3);
    const blue = 0x2457c5, h = CELL / 2, bw = COLS * CELL, bh = ROWS * CELL;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = BX + c * CELL + h, cy = BY + r * CELL + h;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const pts = [[cx + sx * h, cy + sy * h], [cx, cy + sy * h]];
            for (let k = 0; k <= 8; k++) {
              const a = (k / 8) * (Math.PI / 2);
              pts.push([cx + sx * HR * Math.sin(a), cy + sy * HR * Math.cos(a)]);
            }
            pts.push([cx + sx * h, cy]);
            poly(g, blue, 1, pts);
          }
        }
      }
    }
    g.lineStyle(3, 0x163f94, 0.9);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) g.strokeCircle(BX + c * CELL + h, BY + r * CELL + h, HR);
    }
    g.fillStyle(blue, 1);
    g.fillRoundedRect(BX - 14, BY - 14, bw + 28, 14, 6);
    g.fillRoundedRect(BX - 14, BY + bh, bw + 28, 14, 6);
    g.fillRoundedRect(BX - 14, BY - 14, 14, bh + 28, 6);
    g.fillRoundedRect(BX + bw, BY - 14, 14, bh + 28, 6);
    g.lineStyle(2, 0x6f9cf0, 0.7);
    g.beginPath();
    g.moveTo(BX - 8, BY - 12);
    g.lineTo(BX + bw + 8, BY - 12);
    g.strokePath();
    g.lineStyle(2, 0x0e2c6c, 0.9);
    g.strokeRoundedRect(BX - 14, BY - 14, bw + 28, bh + 28, 18);
  }

  nameOf(side) {
    if (this.bot) return side === 0 ? 'You' : 'Bot';
    if (this.online) return side === this.mySide ? 'You' : 'Opponent';
    return 'Player ' + (side + 1);
  }

  makePanel(side, y) {
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x0b1a14, 0.55);
    g.fillRoundedRect(24, y, 432, 80, 16);
    g.lineStyle(1.5, 0xffffff, 0.12);
    g.strokeRoundedRect(24, y, 432, 80, 16);
    g.fillStyle(0x24402f, 1);
    g.fillCircle(66, y + 40, 30);
    g.lineStyle(2, SIDE[side].top, 0.9);
    g.strokeCircle(66, y + 40, 30);
    const d = this.add.graphics().setDepth(6).setPosition(66, y + 40);
    drawDisc(d, side, 21);
    this.add.text(114, y + 16, this.nameOf(side), { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f1e6cc' }).setDepth(6);
    this.add.text(114, y + 40, SIDE[side].name + ' discs', { fontFamily: FONT, fontSize: '12px', color: '#a9b8a8' }).setDepth(6);
    this.panelPos[side] = { x: 66, y: y + 40 };
  }

  // ---------- state ----------
  syncDiscs() {
    this.discs.forEach((d) => d.destroy());
    this.discs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.state.board[r * COLS + c];
        if (v === null) continue;
        const g = this.add.graphics().setDepth(2).setPosition(BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2);
        drawDisc(g, v, DR);
        this.discs.push(g);
      }
    }
  }

  landing(col) {
    for (let r = ROWS - 1; r >= 0; r--) if (this.state.board[r * COLS + col] === null) return r;
    return -1;
  }

  colAt(w) {
    if (w.y < BY - 100 || w.y > BY + ROWS * CELL + 30) return -1;
    const c = Math.floor((w.x - BX) / CELL);
    return c >= 0 && c < COLS ? c : -1;
  }

  setHover(col) {
    if (col === this.hover) return;
    this.hover = col;
    this.hov.clear();
    if (col >= 0) {
      this.hov.fillStyle(0xffffff, 0.1);
      this.hov.fillRect(BX + col * CELL, BY, CELL, ROWS * CELL);
    }
  }

  canAct(side) {
    if (this.online) return side === this.mySide;
    if (this.bot) return side !== this.bot.side;
    return true;
  }

  refreshStatus() {
    const s = this.state;
    let t;
    if (s.over) t = this.result().title;
    else if (this.bot) t = s.turn === this.bot.side ? 'Bot is thinking…' : 'Your turn';
    else if (this.online) t = s.turn === this.mySide ? 'Your turn' : "Opponent's turn…";
    else t = SIDE[s.turn].name + "'s turn";
    this.statusT.setText(t);
  }

  tap(col) {
    if (this.busy || !this.canAct(this.state.turn)) return;
    if (this.play(col) && this.online) this.online.send({ col });
  }

  remote(m) {
    if (this.busy) { this.time.delayedCall(100, () => this.remote(m)); return; }
    if (this.state.over || this.state.turn === this.mySide) return;
    this.play(m && m.col);
  }

  play(col) {
    const res = step(this.state, { col });
    if (!res) return false;
    this.busy = true;
    const who = this.state.turn, row = res.fx.row;
    const g = this.add.graphics().setDepth(2).setPosition(BX + col * CELL + CELL / 2, BY - 40);
    drawDisc(g, who, DR);
    this.tweens.add({
      targets: g,
      y: BY + row * CELL + CELL / 2,
      duration: 380 + row * 70,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        g.destroy();
        this.state = res.next;
        this.lastCell = { r: row, c: col };
        this.syncDiscs();
        this.sfx('drop');
        this.cameras.main.shake(70, 0.0015);
        this.busy = false;
        this.refreshStatus();
        if (this.state.over) this.finish();
        else this.maybeBot();
      },
    });
    return true;
  }

  maybeBot() {
    const b = this.bot;
    if (!b || b.pending || this.state.over || this.state.turn !== b.side) return;
    b.pending = true;
    this.refreshStatus();
    this.time.delayedCall(650 + Math.random() * 450, () => {
      b.pending = false;
      if (this.state.over || this.state.turn !== b.side || this.busy) return;
      const col = pickMove(this.state, 4);
      if (col !== null) this.play(col);
    });
  }

  // ---------- end of game ----------
  result() {
    const s = this.state;
    const sub = s.line ? 'Four in a row' : 'The board is full';
    if (s.winner === 'draw') return { title: 'Draw', sub, mine: null };
    if (this.online || this.bot) {
      const mine = this.online ? s.winner === this.mySide : s.winner === 0;
      return { title: mine ? 'You win!' : this.bot ? 'Bot wins' : 'You lose', sub, mine };
    }
    return { title: SIDE[s.winner].name + ' wins!', sub, mine: true };
  }

  finish() {
    const r = this.result();
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(BX + 30, BY + 2 * CELL + 10, COLS * CELL - 60, 2 * CELL, 20);
    this.add.text(W / 2, BY + 3 * CELL - 14, r.title, {
      fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#f6e05e', stroke: '#1a1208', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(9);
    this.add.text(W / 2, BY + 3 * CELL + 22, r.sub + (this.online ? '' : ' · tap to play again'), {
      fontFamily: FONT, fontSize: '14px', color: '#e8dcc2',
    }).setOrigin(0.5).setDepth(9);
    this.time.delayedCall(450, () => this.sfx(r.mine === null ? 'click' : r.mine ? 'win' : 'lose'));
  }

  update(time) {
    const g = this.fxg, s = this.state;
    g.clear();
    const cell = (r, c) => ({ x: BX + c * CELL + CELL / 2, y: BY + r * CELL + CELL / 2 });
    if (!s.over) {
      const p = this.panelPos[s.turn];
      g.lineStyle(3, 0xf6e05e, 0.45 + 0.35 * Math.sin(time / 220));
      g.strokeCircle(p.x, p.y, 33);
    }
    if (s.line) {
      g.lineStyle(4, 0xffffff, 0.5 + 0.5 * Math.sin(time / 180));
      s.line.forEach(([r, c]) => { const p = cell(r, c); g.strokeCircle(p.x, p.y, DR + 4); });
    } else if (this.lastCell && !this.busy) {
      const p = cell(this.lastCell.r, this.lastCell.c);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeCircle(p.x, p.y, DR + 3);
    }
    if (!this.busy && !s.over && this.hover >= 0 && this.canAct(s.turn)) {
      const x = BX + this.hover * CELL + CELL / 2;
      g.fillStyle(SIDE[s.turn].top, 0.5);
      g.fillCircle(x, BY - 34, DR);
      const row = this.landing(this.hover);
      if (row >= 0) {
        g.lineStyle(3, 0xffffff, 0.45);
        g.strokeCircle(x, BY + row * CELL + CELL / 2, DR - 2);
      }
    }
  }
}

export default {
  id: 'connect4',
  name: 'Connect 4',
  tagline: 'Drop discs, line up four',
  tier: 'verified',
  color: '#38bdf8',
  orientation: 'portrait',
  ambient: 'lounge',
  bot: true,
  engine: { init, step, winner },

  mount(el, opts) {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      backgroundColor: '#16261d',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: C4,
      callbacks: { preBoot: (g) => g.registry.set('opts', opts || {}) },
    });
    return { destroy: () => game.destroy(true) };
  },
};
