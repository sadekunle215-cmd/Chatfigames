export const TW = 720, TH = 360, R = 7;
export const FRIC = 55; // rolling slow-down, units per second squared
export const POCKETS = [[0, 0], [TW / 2, 0], [TW, 0], [0, TH], [TW / 2, TH], [TW, TH]];
const POCKET_R = [13, 12, 13, 13, 12, 13];
const DT = 1 / 240, E_BALL = 0.96, E_CUSH = 0.78, MAX_STEPS = 240 * 30;

// Same result on every device: only + - * / and sqrt, a fixed time step and a fixed order.
export function runShot(balls) {
  const n = balls.length, frames = [], events = [];
  const snap = () => {
    const f = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      f[2 * i] = balls[i].on ? balls[i].x : NaN;
      f[2 * i + 1] = balls[i].y;
    }
    frames.push(f);
  };
  snap();

  for (let step = 0; step < MAX_STEPS; step++) {
    // friction and movement
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on || (b.vx === 0 && b.vy === 0)) continue;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy), ns = sp - FRIC * DT;
      if (ns <= 2) { b.vx = 0; b.vy = 0; continue; }
      const k = ns / sp;
      b.vx *= k;
      b.vy *= k;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
    }

    // ball against ball
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (!b.on) continue;
        if (a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const ov = (2 * R - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov;
        b.x += nx * ov; b.y += ny * ov;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn > 0) {
          const imp = ((1 + E_BALL) * vn) / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          events.push({ f: frames.length, k: 'hit', a: i, b: j, s: vn });
        }
      }
    }

    // pockets and cushions
    let moving = false;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on || (b.vx === 0 && b.vy === 0)) continue;
      let potted = false;
      for (let p = 0; p < 6; p++) {
        const dx = b.x - POCKETS[p][0], dy = b.y - POCKETS[p][1];
        if (dx * dx + dy * dy < POCKET_R[p] * POCKET_R[p]) {
          b.on = false; b.vx = 0; b.vy = 0; potted = true;
          events.push({ f: frames.length, k: 'pot', id: i, p });
          break;
        }
      }
      if (potted) continue;
      if (b.x < R) {
        b.x = R;
        if (b.vx < 0) { events.push({ f: frames.length, k: 'cush', s: -b.vx }); b.vx = -b.vx * E_CUSH; b.vy *= 0.97; }
      } else if (b.x > TW - R) {
        b.x = TW - R;
        if (b.vx > 0) { events.push({ f: frames.length, k: 'cush', s: b.vx }); b.vx = -b.vx * E_CUSH; b.vy *= 0.97; }
      }
      if (b.y < R) {
        b.y = R;
        if (b.vy < 0) { events.push({ f: frames.length, k: 'cush', s: -b.vy }); b.vy = -b.vy * E_CUSH; b.vx *= 0.97; }
      } else if (b.y > TH - R) {
        b.y = TH - R;
        if (b.vy > 0) { events.push({ f: frames.length, k: 'cush', s: b.vy }); b.vy = -b.vy * E_CUSH; b.vx *= 0.97; }
      }
      if (b.vx !== 0 || b.vy !== 0) moving = true;
    }

    if ((step & 3) === 3) snap();
    if (!moving) break;
  }
  snap();
  return { frames, events };
}
