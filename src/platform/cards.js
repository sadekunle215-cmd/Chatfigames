const wide = (inner) => '<svg viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">' + inner + '</svg>';
const sq = (inner) => '<svg viewBox="0 0 120 120">' + inner + '</svg>';

const THEME = {
  artillery: {
    grad: 'linear-gradient(160deg,#27508a 0%,#6f9fd0 52%,#f3c98a 100%)',
    accent: '#ffb347',
    bg: wide(
      '<circle cx="270" cy="38" r="44" fill="#fff4cc" opacity=".18"/>' +
      '<circle cx="270" cy="38" r="26" fill="#fff4cc" opacity=".85"/>' +
      '<path d="M0 110 L50 78 L95 104 L150 70 L210 108 L260 84 L310 106 L360 80 V150 H0Z" fill="#355a82" opacity=".75"/>' +
      '<path d="M0 130 L60 108 L120 128 L190 104 L260 128 L330 110 L360 122 V150 H0Z" fill="#1d3552"/>' +
      '<g stroke="#fff" opacity=".35" stroke-width="3" stroke-linecap="round" fill="none"><path d="M70 100 Q74 80 70 62"/><path d="M200 104 Q206 84 200 66"/></g>'),
    art: sq(
      '<path d="M8 52 Q50 4 102 40" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 6" stroke-linecap="round" opacity=".8"/>' +
      '<g transform="translate(88 30) rotate(25)"><path d="M-14 -3 L-28 0 L-14 3Z" fill="#ff9a1f"/><path d="M-14 -2 L-22 0 L-14 2Z" fill="#ffe08a"/><rect x="-14" y="-4" width="22" height="8" rx="2" fill="#d9dfd9"/><rect x="-6" y="-4" width="5" height="8" fill="#c0392b"/><path d="M8 -4 L18 0 L8 4Z" fill="#e0392d"/></g>' +
      '<rect x="12" y="94" width="64" height="13" rx="6.5" fill="#1d1f1c"/>' +
      '<path d="M20 94 L27 78 H61 L68 94Z" fill="#4f6b2f"/>' +
      '<path d="M32 78 Q44 63 57 78Z" fill="#6f8f45"/>' +
      '<rect x="46" y="60" width="28" height="6" rx="3" transform="rotate(-28 46 66)" fill="#3d4046"/>' +
      '<circle cx="27" cy="100" r="4" fill="#8a8d86"/><circle cx="44" cy="100" r="4" fill="#8a8d86"/><circle cx="61" cy="100" r="4" fill="#8a8d86"/>'),
  },
  connect4: {
    grad: 'linear-gradient(150deg,#2457c5 0%,#0b2a6a 100%)',
    accent: '#fbc531',
    bg: wide(
      '<defs><pattern id="c4p" width="36" height="36" patternUnits="userSpaceOnUse">' +
      '<circle cx="18" cy="18" r="11" fill="#000" opacity=".22"/>' +
      '<circle cx="18" cy="18" r="11" fill="none" stroke="#7aa6ff" stroke-opacity=".25" stroke-width="2"/></pattern></defs>' +
      '<rect width="360" height="150" fill="url(#c4p)"/>'),
    art: sq(
      '<rect x="14" y="30" width="92" height="84" rx="12" fill="#2457c5" stroke="#0e2c6c" stroke-width="3"/>' +
      '<circle cx="38" cy="54" r="10" fill="#0b1f4d"/><circle cx="60" cy="54" r="10" fill="#0b1f4d"/><circle cx="82" cy="54" r="10" fill="#e53935"/>' +
      '<circle cx="38" cy="76" r="10" fill="#fbc531"/><circle cx="60" cy="76" r="10" fill="#e53935"/><circle cx="82" cy="76" r="10" fill="#fbc531"/>' +
      '<circle cx="38" cy="98" r="10" fill="#e53935"/><circle cx="60" cy="98" r="10" fill="#fbc531"/><circle cx="82" cy="98" r="10" fill="#0b1f4d"/>' +
      '<circle cx="60" cy="14" r="10" fill="#e53935"/><circle cx="57" cy="11" r="3" fill="#fff" opacity=".5"/>' +
      '<path d="M60 26 V36" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-dasharray="2 4"/>'),
  },
  chess: {
    grad: 'linear-gradient(150deg,#6a3f1f 0%,#1f120a 100%)',
    accent: '#e8cfa3',
    bg: wide(
      '<defs><pattern id="chp" width="48" height="48" patternUnits="userSpaceOnUse">' +
      '<rect width="24" height="24" fill="#fff" opacity=".08"/><rect x="24" y="24" width="24" height="24" fill="#fff" opacity=".08"/></pattern></defs>' +
      '<rect width="360" height="150" fill="url(#chp)"/>'),
    art: sq(
      '<g fill="#f2eadb" stroke="#3a2a1a" stroke-width="2.5" stroke-linejoin="round">' +
      '<path d="M44 106 H94 L90 95 H48Z"/><path d="M50 95 L54 58 H86 L90 95Z"/><path d="M52 58 Q70 38 88 58Z"/>' +
      '<rect x="67" y="20" width="6" height="22"/><rect x="59" y="27" width="22" height="6"/></g>' +
      '<g fill="#2f2a28" stroke="#0d0b0a" stroke-width="2" stroke-linejoin="round">' +
      '<path d="M12 106 H40 L38 97 H14Z"/><path d="M18 97 L22 80 H32 L36 97Z"/><circle cx="27" cy="72" r="8"/></g>'),
  },
  checkers: {
    grad: 'linear-gradient(150deg,#c0392b 0%,#3f0d09 100%)',
    accent: '#f2e8d4',
    bg: wide(
      '<defs><pattern id="ckp" width="44" height="44" patternUnits="userSpaceOnUse">' +
      '<rect width="22" height="22" fill="#000" opacity=".2"/><rect x="22" y="22" width="22" height="22" fill="#000" opacity=".2"/></pattern></defs>' +
      '<rect width="360" height="150" fill="url(#ckp)"/>'),
    art: sq(
      '<ellipse cx="84" cy="72" rx="26" ry="10" fill="#9c8a66"/><rect x="58" y="60" width="52" height="12" fill="#9c8a66"/>' +
      '<ellipse cx="84" cy="60" rx="26" ry="10" fill="#f2e8d4"/><ellipse cx="84" cy="60" rx="17" ry="6.5" fill="none" stroke="#c9b88f" stroke-width="2"/>' +
      '<ellipse cx="46" cy="98" rx="30" ry="12" fill="#6a1b14"/><rect x="16" y="84" width="60" height="14" fill="#6a1b14"/>' +
      '<ellipse cx="46" cy="84" rx="30" ry="12" fill="#c8402f"/><ellipse cx="46" cy="84" rx="20" ry="8" fill="none" stroke="#7d2216" stroke-width="2"/>' +
      '<path d="M34 80 L38 66 L42 74 L46 62 L50 74 L54 66 L58 80Z" fill="#f5c542" stroke="#8a6a10" stroke-width="2" stroke-linejoin="round"/>'),
  },
  snooker: {
    grad: 'linear-gradient(150deg,#1f9a5e 0%,#093a22 100%)',
    accent: '#f6e05e',
    bg: wide(
      '<defs><pattern id="snp" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#fff" opacity=".06"/></pattern></defs>' +
      '<rect width="360" height="150" fill="url(#snp)"/>' +
      '<path d="M150 -10 V160" stroke="#e8f2ea" stroke-opacity=".25" stroke-width="2"/>' +
      '<path d="M150 40 A40 40 0 0 0 150 120" fill="none" stroke="#e8f2ea" stroke-opacity=".25" stroke-width="2"/>'),
    art: sq(
      '<path d="M6 112 L74 44" stroke="#2a1810" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M6 112 L62 56" stroke="#b88b4a" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M62 56 L74 44" stroke="#f3ead4" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="86" cy="38" r="12" fill="#f4f1ea" stroke="#8a8780" stroke-width="2"/><circle cx="82" cy="34" r="3.5" fill="#fff" opacity=".8"/>' +
      '<circle cx="50" cy="30" r="10" fill="#d21a22"/><circle cx="46" cy="26" r="3" fill="#fff" opacity=".6"/>' +
      '<circle cx="104" cy="74" r="10" fill="#d21a22"/>' +
      '<circle cx="76" cy="80" r="10" fill="#f7cb08"/><circle cx="72" cy="76" r="3" fill="#fff" opacity=".6"/>' +
      '<circle cx="58" cy="96" r="10" fill="#232323"/><circle cx="54" cy="92" r="3" fill="#fff" opacity=".5"/>'),
  },
};

const FALLBACK = {
  grad: 'linear-gradient(150deg,#2b2b2b 0%,#0b0b0b 100%)',
  accent: '#ffffff',
  bg: '',
  art: '',
};

export function themedCard(g, online, i) {
  const t = THEME[g.id] || FALLBACK;
  const art = t.art || '<span class="initial" style="font-size:64px">' + g.name[0] + '</span>';
  return (
    '<button class="card gcard" data-id="' + g.id + '" style="--g:' + t.grad + ';--ac:' + t.accent + ';--i:' + i + '">' +
    '<div class="gbg">' + t.bg + '</div>' +
    '<div class="gart">' + art + '</div>' +
    '<div class="gtxt"><h2>' + g.name + '</h2><p>' + g.tagline + '</p>' +
    '<div class="gmeta"><span class="gchip">' + (g.tier === 'verified' ? '✓ Verified' : 'Referee') + '</span>' +
    '<span class="gchip"><i class="gdot"></i><b id="on-' + g.id + '">' + online + '</b>&nbsp;playing</span></div></div>' +
    '<span class="gplay">PLAY</span></button>'
  );
}
