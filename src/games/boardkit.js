export function poly(g, color, alpha, pts) {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillPath();
}

// keep the part of a polygon on one side of the vertical line x
export function clipX(pts, x, keepRight) {
  const out = [];
  const inside = (p) => (keepRight ? p[0] >= x : p[0] <= x);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (x - a[0]) / (b[0] - a[0]);
      out.push([x, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

// a polygon with a base colour, light from the left, shade on the right, and an outline
export function shaded(g, pts, base, edge) {
  poly(g, base, 1, pts);
  const right = clipX(pts, 2, true);
  if (right.length > 2) poly(g, 0x000000, 0.2, right);
  const left = clipX(pts, -6, false);
  if (left.length > 2) poly(g, 0xffffff, 0.16, left);
  g.lineStyle(1.5, edge, 1);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.strokePath();
}

export function shadedCircle(g, cx, cy, r, base, edge) {
  g.fillStyle(base, 1);
  g.fillCircle(cx, cy, r);
  g.fillStyle(0x000000, 0.2);
  g.fillCircle(cx + r * 0.25, cy + r * 0.2, r * 0.72);
  g.fillStyle(0xffffff, 0.22);
  g.fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.32);
  g.lineStyle(1.5, edge, 1);
  g.strokeCircle(cx, cy, r);
}
