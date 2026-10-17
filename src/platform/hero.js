const POT =
  '<svg viewBox="0 0 170 170">' +
  '<defs><linearGradient id="hgold" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#ffe9a3"/><stop offset=".55" stop-color="#ffc233"/><stop offset="1" stop-color="#d98a12"/>' +
  '</linearGradient></defs>' +
  '<path d="M52 48 H34 Q30 48 32 58 Q36 78 56 82" fill="none" stroke="#e6a325" stroke-width="7" stroke-linecap="round"/>' +
  '<path d="M118 48 H136 Q140 48 138 58 Q134 78 114 82" fill="none" stroke="#e6a325" stroke-width="7" stroke-linecap="round"/>' +
  '<path d="M52 40 H118 V70 Q118 104 85 112 Q52 104 52 70Z" fill="url(#hgold)" stroke="#a8650a" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M64 50 Q64 80 74 96" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>' +
  '<rect x="78" y="110" width="14" height="22" fill="#e6a325" stroke="#a8650a" stroke-width="3"/>' +
  '<rect x="58" y="130" width="54" height="14" rx="4" fill="url(#hgold)" stroke="#a8650a" stroke-width="3"/>' +
  '<path d="M85 56 l5 11 12 1.5 -9 8 3 12 -11 -6.5 -11 6.5 3 -12 -9 -8 12 -1.5z" fill="#fff6d0" stroke="#d98a12" stroke-width="2" stroke-linejoin="round"/>' +
  '<ellipse cx="138" cy="152" rx="18" ry="7" fill="#b87a10"/><rect x="120" y="143" width="36" height="9" fill="#d99a1c"/>' +
  '<ellipse cx="138" cy="143" rx="18" ry="7" fill="#ffd35a" stroke="#a8650a" stroke-width="2"/>' +
  '<text x="138" y="147" text-anchor="middle" font-size="10" font-weight="800" fill="#a8650a" font-family="sans-serif">$</text>' +
  '<ellipse cx="30" cy="156" rx="14" ry="5.5" fill="#b87a10"/><rect x="16" y="150" width="28" height="6" fill="#d99a1c"/>' +
  '<ellipse cx="30" cy="150" rx="14" ry="5.5" fill="#ffd35a" stroke="#a8650a" stroke-width="2"/>' +
  '</svg>';

export function heroDecor() {
  return (
    '<div class="hdeco">' +
    '<div class="hglow"></div>' +
    '<div class="hpot">' + POT + '</div>' +
    '<i class="fl f1"></i><i class="fl f2"></i><i class="fl f3"></i><i class="fl f4"></i>' +
    '<i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i>' +
    '</div>'
  );
}
