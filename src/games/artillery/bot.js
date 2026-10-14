import { simulate } from './sim.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const methods = {
  myTurn() {
    if (this.bot) return this.state.turn !== this.bot.side;
    return !this.online || this.state.turn === this.online.side;
  },

  endSound(w) {
    if (w === 'draw') return;
    if (this.bot) this.sfx(w === 0 ? 'win' : 'lose');
    else this.sfx(this.online ? (w === this.online.side ? 'win' : 'lose') : 'win');
  },

  refreshUi() {
    const s = this.state;
    let txt;
    if (s.winner !== null) {
      const tail = this.online ? '' : ' Tap to restart';
      if (s.winner === 'draw') txt = 'Draw!' + tail;
      else if (this.bot) txt = (s.winner === 0 ? 'You win!' : 'Bot wins!') + tail;
      else if (this.online) txt = s.winner === this.online.side ? 'You win!' : 'You lose';
      else txt = 'Player ' + (s.winner + 1) + ' wins!' + tail;
    } else if (this.bot) {
      txt = s.turn === this.bot.side ? 'Bot is aiming...' : 'Your turn · drag back to aim';
    } else if (this.online) {
      txt = s.turn === this.online.side ? 'Your turn · drag back to aim' : "Opponent's turn...";
    } else {
      txt = 'Player ' + (s.turn + 1) + ' · drag back to aim';
    }
    if (this.aim && this.aim.power >= 10 && s.winner === null) txt += '  ·  ' + this.aim.power + '%';
    this.ui.setText(txt);
  },

  stepBot(dt) {
    const b = this.bot;
    if (!b || this.busy || this.state.winner !== null || this.state.turn !== b.side) return;
    if (b.wait === null) {
      b.wait = 1.2;
      this.bubble[b.side] = { text: 'Locking on...', until: this.time.now + 1200 };
    }
    b.wait -= dt;
    if (b.wait > 0) return;
    b.wait = null;
    const m = this.botPick();
    this.barrel[b.side] = m.angle;
    this.fire(m.angle, m.power, true);
  },

  // Finds the best shot by simulating many, then adds a human-like error that
  // shrinks with every shot (the bot "ranges in" on you).
  botPick() {
    const b = this.bot, s = this.state;
    const me = s.tanks[b.side], foe = s.tanks[1 - b.side];
    const fy = s.heights[foe.x] - 16, my = s.heights[me.x] - 16;
    const dir = foe.x > me.x ? 1 : -1;
    let best = { score: 1e9, angle: dir > 0 ? 45 : 135, power: 60 };

    const score = (angle, power) => {
      const r = simulate(s, { angle, power });
      if (!r.impact) return 1e8 + Math.abs(r.path[r.path.length - 1][0] - foe.x);
      const dF = Math.hypot(r.impact[0] - foe.x, r.impact[1] - fy);
      const dM = Math.hypot(r.impact[0] - me.x, r.impact[1] - my);
      return dF + (dM < 55 ? 300 : 0);
    };

    const lo = dir > 0 ? 15 : 100, hi = dir > 0 ? 80 : 165;
    for (let a = lo; a <= hi; a += 6) {
      for (let p = 25; p <= 100; p += 8) {
        const sc = score(a, p);
        if (sc < best.score) best = { score: sc, angle: a, power: p };
      }
    }
    for (let a = best.angle - 5; a <= best.angle + 5; a++) {
      for (let p = best.power - 8; p <= best.power + 8; p += 2) {
        if (a < 0 || a > 180 || p < 10 || p > 100) continue;
        const sc = score(a, p);
        if (sc < best.score) best = { score: sc, angle: a, power: p };
      }
    }

    const k = Math.max(0.25, 1 - 0.22 * b.shots); // lower = more accurate
    b.shots++;
    return {
      angle: clamp(Math.round(best.angle + (Math.random() * 2 - 1) * 7 * k), 0, 180),
      power: clamp(Math.round(best.power + (Math.random() * 2 - 1) * 9 * k), 10, 100),
    };
  },
};

export function installBot(Scene) {
  Object.assign(Scene.prototype, methods);
}
