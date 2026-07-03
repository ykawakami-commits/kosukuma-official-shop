// fx/hover-zoom.js — 商品写真の覗き込みズーム
// カーソル位置がそのまま拡大の中心になる（transform-origin追従）。
// ECの「商品をちゃんと見せる」現代標準。マウス環境のみ・reduced-motionでは初期化しない。

export function initHoverZoom(selector) {
  document.querySelectorAll(selector).forEach((media) => {
    const img = media.querySelector('img');
    if (!img) return;
    media.classList.add('media-zoom');
    media.addEventListener('pointermove', (e) => {
      const r = media.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      img.style.transformOrigin = `${x}% ${y}%`;
    });
    media.addEventListener('pointerenter', () => media.classList.add('zooming'));
    media.addEventListener('pointerleave', () => {
      media.classList.remove('zooming');
      img.style.transformOrigin = '';
    });
  });
}
