import { poly } from '../boardkit.js';

export function drawCheckersPiece(g, code) {
  const king = code === 'A' || code === 'B';
  const red = code === 'a' || code === 'A';
  const top = red ? 0xc8402f : 0xf2e8d4, side = red ? 0x7d2216 : 0x9c8a66, ring = red ? 0x9e2f20 : 0xc9b88f;

  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(0, 14, 44, 14);

  const disc = (y) => {
    g.fillStyle(side, 1);
    g.fillRect(-20, y, 40, 6);
    g.fillEllipse(0, y + 6, 40, 20);
    g.fillStyle(top, 1);
    g.fillEllipse(0, y, 40, 20);
    g.lineStyle(1.5, ring, 1);
    g.strokeEllipse(0, y, 30, 14);
    g.strokeEllipse(0, y, 20, 9);
    g.lineStyle(1.2, 0x000000, 0.35);
    g.strokeEllipse(0, y, 40, 20);
    g.fillStyle(0xffffff, 0.25);
    g.fillEllipse(-8, y - 4, 12, 5);
  };

  if (king) {
    disc(4);
    disc(-4);
    const crown = [[-9, -3], [-9, -11], [-4, -7], [0, -14], [4, -7], [9, -11], [9, -3]];
    poly(g, 0xf5c542, 1, crown);
    g.lineStyle(1.3, 0x8a6a10, 1);
    g.beginPath();
    g.moveTo(crown[0][0], crown[0][1]);
    for (let i = 1; i < crown.length; i++) g.lineTo(crown[i][0], crown[i][1]);
    g.closePath();
    g.strokePath();
  } else {
    disc(0);
  }
}
