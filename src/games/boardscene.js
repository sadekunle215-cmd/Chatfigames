import Phaser from 'phaser';

export const W = 480, H = 760, CELL = 54, BX = 24, BY = 150;
const FONT = 'Space Grotesk, Inter, sans-serif';
const isPrefix = (hops, p) => hops.length >= p.length && p.every((v, i) => hops[i] === v);

export class BoardScene extends Phaser.Scene {
  create() {
    const opts = this.registry.get('opts') || {};
    this.ad = this.registry.get('adapter');
    this.online = opts.online || null;
    this.audio = opts.audio || null;
    this.bot = opts.bot ? { side: 1, pending: false } : null;
    this.mySide = this.online ? this.online.side : 0;
    this.flip = this.mySide === 1;
    this.state = this.ad.init();
    this.legal = this.ad.moves(this.state);
    this.sel = null;
    this.prefix = [];
    this.busy = false;
    this.promo = null;
    this.sprites = new Map();
    this.trayCodes = [[], []];
    this.trayObjs = [[], []];
    this.panelPos = [null, null];

    this.drawTable();
    this.drawBoard();
    this.hl = this.add.graphics().setDepth(2);
    this.hud = this.add.graphics().setDepth(7);
    this.makePanel(this.mySide, BX, BY + 8 * CELL + 32);
    this.makePanel(1 - this.mySide, BX, 36);
    this.statusT = this.add
      .text(W / 2, 12, '', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#e8dcc2' })
      .setOrigin(0.5, 0).setDepth(6);

    this.syncSprites();
    this.drawHighlights();
    this.refreshStatus();

    this.fit();
    this.onResize = () => this.fit();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));

    this.input.on('pointerdown', (p) => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.promo) { this.pickPromo(w); return; }
      const sq = this.sqAt(w.x, w.y);
      if (sq >= 0) this.onSquare(sq);
      else if (this.state.over && !this.online) this.scene.restart();
    });

    if (this.online) this.online.onMove((m) => this.remote(m));
    this.maybeBot();
  }

  fit() {
    const w = this.scale.width, h = this.scale.height;
    if (!w || !h) return;
    const cam = this.cameras.main;
    cam.setZoom(Math.min(w / W, h / H));
    cam.centerOn(W / 2, H / 2);
  }

  sfx(n) { if (this.audio) this.audio.play(n); }

  // ---------- geometry ----------
  pos(sq) {
    let r = sq >> 3, c = sq & 7;
    if (this.flip) { r = 7 - r; c = 7 - c; }
    return { x: BX + c * CELL + CELL / 2, y: BY + r * CELL + CELL / 2 };
  }

  sqAt(x, y) {
    let c = Math.floor((x - BX) / CELL), r = Math.floor((y - BY) / CELL);
    if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
    if (this.flip) { r = 7 - r; c = 7 - c; }
    return r * 8 + c;
  }

  // ---------- scenery ----------
  drawTable() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x16261d, 1);
    g.fillRect(-2500, -2500, 5500, 5800);
    [[520, 0.35, 0x1f3a2a], [360, 0.4, 0x27493a], [220, 0.4, 0x2f5a44]].forEach(([r, a, col]) => {
      g.fillStyle(col, a);
      g.fillCircle(W / 2, BY + 4 * CELL, r);
    });
  }

  drawBoard() {
    const g = this.add.graphics().setDepth(1);
    const S = 8 * CELL;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(BX - 10, BY - 6, S + 28, S + 28, 12);
    g.fillStyle(0x3b2616, 1);
    g.fillRoundedRect(BX - 14, BY - 14, S + 28, S + 28, 12);
    g.lineStyle(2, 0x5d3b22, 1);
    g.strokeRoundedRect(BX - 11, BY - 11, S + 22, S + 22, 9);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        const x = BX + c * CELL, y = BY + r * CELL;
        g.fillStyle(light ? 0xe8cfa3 : 0x8b5a33, 1);
        g.fillRect(x, y, CELL, CELL);
        g.lineStyle(1, 0x000000, light ? 0.05 : 0.12);
        for (let k = 0; k < 3; k++) {
          const yy = y + 10 + k * 16 + ((r * 7 + c * 3 + k) % 5);
          g.beginPath();
          g.moveTo(x + 3, yy);
          g.lineTo(x + CELL - 3, yy + ((c + k) % 3) - 1);
          g.strokePath();
        }
      }
    }
    g.lineStyle(2, 0x1f1209, 1);
    g.strokeRect(BX, BY, S, S);

    if (this.ad.labels) {
      const st = { fontFamily: FONT, fontSize: '11px', color: '#d9c39a' };
      for (let k = 0; k < 8; k++) {
        const file = 'abcdefgh'[this.flip ? 7 - k : k];
        const rank = this.flip ? k + 1 : 8 - k;
        this.add.text(BX + k * CELL + CELL / 2, BY + S + 7, file, st).setOrigin(0.5).setDepth(2);
        this.add.text(BX - 8, BY + k * CELL + CELL / 2, String(rank), st).setOrigin(0.5).setDepth(2);
      }
    }
  }

  nameOf(side) {
    if (this.bot) return side === 0 ? 'You' : 'Bot';
    if (this.online) return side === this.mySide ? 'You' : 'Opponent';
    return 'Player ' + (side + 1);
  }

  makePanel(side, x, y) {
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x0b1a14, 0.55);
    g.fillRoundedRect(x, y, 432, 80, 16);
    g.lineStyle(1.5, 0xffffff, 0.12);
    g.strokeRoundedRect(x, y, 432, 80, 16);
    g.fillStyle(0x24402f, 1);
    g.fillCircle(x + 42, y + 40, 30);
    g.lineStyle(2, this.ad.accent[side], 0.9);
    g.strokeCircle(x + 42, y + 40, 30);
    const icon = this.add.graphics().setDepth(6).setPosition(x + 42, y + 44).setScale(0.9);
    this.ad.drawPiece(icon, this.ad.avatarCode[side]);
    this.add.text(x + 90, y + 12, this.nameOf(side), { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f1e6cc' }).setDepth(6);
    this.add.text(x + 90, y + 34, this.ad.sideNames[side], { fontFamily: FONT, fontSize: '12px', color: '#a9b8a8' }).setDepth(6);
    this.panelPos[side] = { avX: x + 42, avY: y + 40, trayX: x + 100, trayY: y + 62 };
  }

  refreshTray() {
    for (let s = 0; s < 2; s++) {
      this.trayObjs[s].forEach((o) => o.destroy());
      const p = this.panelPos[s];
      this.trayObjs[s] = this.trayCodes[s].map((code, k) => {
        const g = this.add.graphics().setDepth(6).setScale(0.36).setPosition(p.trayX + k * 15, p.trayY);
        this.ad.drawPiece(g, code);
        return g;
      });
    }
  }

  syncSprites() {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();
    const pcs = this.ad.pieces(this.state);
    for (let sq = 0; sq < 64; sq++) {
      const code = pcs[sq];
      if (code === null) continue;
      const p = this.pos(sq);
      const g = this.add.graphics().setDepth(3).setPosition(p.x, p.y);
      this.ad.drawPiece(g, code);
      this.sprites.set(sq, g);
    }
  }

  drawHighlights() {
    const g = this.hl, s = this.state, ad = this.ad, pcs = ad.pieces(s);
    g.clear();
    const cell = (sq, color, a) => {
      const p = this.pos(sq);
      g.fillStyle(color, a);
      g.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
    };
    if (s.last) { cell(s.last.from, 0xf6e05e, 0.32); cell(s.last.to, 0xf6e05e, 0.42); }
    const cs = ad.checkSquare ? ad.checkSquare(s) : -1;
    if (cs >= 0) {
      const p = this.pos(cs);
      g.fillStyle(0xe53935, 0.35); g.fillCircle(p.x, p.y, 27);
      g.fillStyle(0xe53935, 0.35); g.fillCircle(p.x, p.y, 19);
    }
    if (this.sel !== null) {
      cell(this.sel, 0x6ec6ff, 0.45);
      this.prefix.forEach((h) => cell(h, 0x6ec6ff, 0.3));
      const nexts = new Set();
      for (const m of this.legal) {
        if (m.from === this.sel && m.hops.length > this.prefix.length && isPrefix(m.hops, this.prefix)) nexts.add(m.hops[this.prefix.length]);
      }
      for (const sq of nexts) {
        const p = this.pos(sq);
        if (pcs[sq] === null) { g.fillStyle(0x0b1a14, 0.5); g.fillCircle(p.x, p.y, 7); }
        else { g.lineStyle(4, 0xe53935, 0.7); g.strokeCircle(p.x, p.y, 23); }
      }
    }
  }

  refreshStatus() {
    const s = this.state, chk = s.check ? 'Check! ' : '';
    let t;
    if (s.over) t = this.result().title;
    else if (this.bot) t = s.turn === this.bot.side ? 'Bot is thinking…' : chk + 'Your move';
    else if (this.online) t = s.turn === this.mySide ? chk + 'Your move' : "Opponent's move…";
    else t = chk + this.ad.sideNames[s.turn] + ' to move';
    this.statusT.setText(t);
  }

  // ---------- input ----------
  canAct(side) {
    if (this.online) return side === this.mySide;
    if (this.bot) return side !== this.bot.side;
    return true;
  }

  onSquare(sq) {
    if (this.state.over) { if (!this.online) this.scene.restart(); return; }
    if (this.busy || !this.canAct(this.state.turn)) return;
    const pcs = this.ad.pieces(this.state);

    if (this.sel !== null) {
      const p2 = this.prefix.concat([sq]);
      const cands = this.legal.filter((m) => m.from === this.sel && isPrefix(m.hops, p2));
      if (cands.length) {
        const done = cands.filter((m) => m.hops.length === p2.length);
        if (cands.length === 1 || done.length === cands.length) { this.pick(cands); return; }
        this.prefix = p2;
        this.sfx('select');
        this.drawHighlights();
        return;
      }
    }

    const mine = pcs[sq] !== null && this.ad.sideOf(pcs[sq]) === this.state.turn;
    if (mine && this.legal.some((m) => m.from === sq)) {
      if (sq === this.sel && this.prefix.length === 0) this.sel = null;
      else { this.sel = sq; this.prefix = []; this.sfx('select'); }
    } else {
      if (mine) this.sfx('illegal');
      this.sel = null;
      this.prefix = [];
    }
    this.drawHighlights();
  }

  pick(cands) {
    if (cands.length > 1 && cands.every((c) => c.promo)) this.askPromo(cands);
    else this.commit(cands[0]);
  }

  askPromo(cands) {
    const side = this.state.turn;
    const x0 = W / 2 - 132, y0 = BY + 4 * CELL - 40;
    const box = this.add.graphics().setDepth(10);
    box.fillStyle(0x0b1a14, 0.94);
    box.fillRoundedRect(x0 - 12, y0 - 34, 288, 120, 16);
    box.lineStyle(2, 0xf6e05e, 0.7);
    box.strokeRoundedRect(x0 - 12, y0 - 34, 288, 120, 16);
    const label = this.add.text(W / 2, y0 - 24, 'Promote to', { fontFamily: FONT, fontSize: '14px', color: '#e8dcc2' }).setOrigin(0.5, 0).setDepth(11);
    const items = ['Q', 'R', 'B', 'N'].map((L, i) => {
      const g = this.add.graphics().setDepth(11).setPosition(x0 + i * 66 + 33, y0 + 34).setScale(1.25);
      this.ad.drawPiece(g, side === 0 ? L : L.toLowerCase());
      return g;
    });
    this.promo = { cands, box, label, items, x0, y0 };
  }

  pickPromo(w) {
    const p = this.promo, i = Math.floor((w.x - p.x0) / 66);
    const inside = w.y >= p.y0 - 30 && w.y <= p.y0 + 80 && i >= 0 && i < 4;
    const cands = p.cands;
    this.promoClear();
    if (!inside) return;
    const L = ['Q', 'R', 'B', 'N'][i];
    this.commit(cands.find((c) => c.promo === L) || cands[0]);
  }

  promoClear() {
    if (!this.promo) return;
    this.promo.box.destroy();
    this.promo.label.destroy();
    this.promo.items.forEach((g) => g.destroy());
    this.promo = null;
  }

  remote(m) {
    if (this.busy) { this.time.delayedCall(100, () => this.remote(m)); return; }
    if (this.state.over || this.state.turn === this.mySide) return;
    this.commit(m, true);
  }

  maybeBot() {
    const b = this.bot;
    if (!b || b.pending || this.state.over || this.state.turn !== b.side) return;
    b.pending = true;
    this.refreshStatus();
    this.time.delayedCall(500 + Math.random() * 400, () => {
      b.pending = false;
      if (this.state.over || this.state.turn !== b.side || this.busy) return;
      const m = this.ad.bot(this.state);
      if (m) this.commit(m, true);
    });
  }

  // ---------- making a move ----------
  commit(move, remote) {
    const res = this.ad.step(this.state, move);
    if (!res) return false;
    const prev = this.state, fx = res.fx, mover = prev.turn, pcs = this.ad.pieces(prev);
    if (this.online && !remote) this.online.send(this.ad.wire(move));
    this.busy = true;
    this.sel = null;
    this.prefix = [];
    this.promoClear();
    this.state = res.next;
    this.drawHighlights();
    fx.captures.forEach((c) => this.trayCodes[mover].push(pcs[c.sq]));

    const spr = this.sprites.get(move.from);
    if (spr) spr.setDepth(6);

    const done = () => {
      this.syncSprites();
      if (fx.promoted) this.puff(this.pos(fx.promoted.sq).x, this.pos(fx.promoted.sq).y);
      this.legal = this.ad.moves(this.state);
      this.refreshTray();
      this.drawHighlights();
      this.refreshStatus();
      this.busy = false;
      if (fx.check && !this.state.over) this.time.delayedCall(120, () => this.sfx('check'));
      if (this.state.over) this.finish();
      else this.maybeBot();
    };

    const hop = (i) => {
      if (!spr || i >= fx.hops.length) { done(); return; }
      const p = this.pos(fx.hops[i]);
      this.tweens.add({
        targets: spr, x: p.x, y: p.y, duration: 220, ease: 'Cubic.easeOut',
        onComplete: () => {
          fx.captures.filter((c) => c.hop === i).forEach((c) => this.killSprite(c.sq));
          if (i === 0) this.sfx(fx.sound);
          hop(i + 1);
        },
      });
    };

    fx.extra.forEach((e) => {
      const rs = this.sprites.get(e.from);
      if (!rs) return;
      const p = this.pos(e.to);
      this.tweens.add({ targets: rs, x: p.x, y: p.y, duration: 200, ease: 'Cubic.easeOut' });
    });
    hop(0);
    return true;
  }

  killSprite(sq) {
    const s = this.sprites.get(sq);
    if (!s) return;
    this.sprites.delete(sq);
    this.puff(s.x, s.y);
    this.tweens.add({ targets: s, scale: 1.4, alpha: 0, duration: 240, onComplete: () => s.destroy() });
  }

  puff(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283;
      const c = this.add.circle(x, y, 3 + Math.random() * 2, 0xf6e05e, 0.9).setDepth(7);
      this.tweens.add({
        targets: c, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 26, alpha: 0, scale: 0.3,
        duration: 380, onComplete: () => c.destroy(),
      });
    }
  }

  // ---------- end of game ----------
  result() {
    const s = this.state;
    if (s.winner === 'draw') return { title: 'Draw', sub: s.reason, mine: null };
    if (this.online || this.bot) {
      const mine = this.online ? s.winner === this.mySide : s.winner === 0;
      return { title: mine ? 'You win!' : this.bot ? 'Bot wins' : 'You lose', sub: s.reason, mine };
    }
    return { title: this.ad.sideNames[s.winner] + ' wins!', sub: s.reason, mine: true };
  }

  finish() {
    const r = this.result();
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(BX + 20, BY + 3 * CELL, 8 * CELL - 40, 2 * CELL, 20);
    this.add.text(W / 2, BY + 4 * CELL - 16, r.title, {
      fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#f6e05e', stroke: '#1a1208', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(9);
    const sub = (r.sub ? r.sub[0].toUpperCase() + r.sub.slice(1) : '') + (this.online ? '' : (r.sub ? ' · ' : '') + 'tap to play again');
    this.add.text(W / 2, BY + 4 * CELL + 22, sub, { fontFamily: FONT, fontSize: '14px', color: '#e8dcc2' }).setOrigin(0.5).setDepth(9);
    this.time.delayedCall(450, () => this.sfx(r.mine === null ? 'click' : r.mine ? 'win' : 'lose'));
  }

  update(time) {
    const g = this.hud;
    g.clear();
    if (this.state.over) return;
    const p = this.panelPos[this.state.turn];
    g.lineStyle(3, 0xf6e05e, 0.45 + 0.35 * Math.sin(time / 220));
    g.strokeCircle(p.avX, p.avY, 33);
  }
}

export function mountBoard(el, opts, adapter) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: el,
    backgroundColor: '#16261d',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: BoardScene,
    callbacks: {
      preBoot: (g) => {
        g.registry.set('opts', opts || {});
        g.registry.set('adapter', adapter);
      },
    },
  });
  return { destroy: () => game.destroy(true) };
}
