// main.js — こすくまくんのおみせ エントリポイント
//
// 起動順:
// 1. UI配線 + カート復元 + 商品hydration（購入導線 = 最優先）
// 2. くまアニメ（見えてから生成・再生 — 起動時の一括プリロード禁止）
// 3. 演出（キラキラ / 3Dこんぺいとう）は遅延ロード。reduced-motionでは起動しない

import { initUI } from './ui.js';
import { KumaAnim } from './kuma-anim.js';
import { prefersReducedMotion, isMobile } from './fx/motion.js';

initUI();

// ===== くまアニメ（IntersectionObserverで遅延生成+可視のみ再生） =====
function lazyKumaAnim(id, name) {
  const container = document.getElementById(id);
  if (!container) return;
  let anim = null;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          if (!anim) {
            anim = new KumaAnim(container, name, {
              style: { width: '100%', height: '100%', objectFit: 'contain' },
            });
          }
          if (!prefersReducedMotion()) anim.play();
        } else {
          anim?.stop();
        }
      });
    },
    { rootMargin: '10% 0px' },
  );
  io.observe(container);
}

lazyKumaAnim('hero-inline-dance', 'dance');
lazyKumaAnim('about-kaikai', 'kaikai');
lazyKumaAnim('utouto-container', 'utouto');

// Aboutのこすくまくんは、つつくとぴょんと跳ねる（隠しあそび）
const aboutKuma = document.getElementById('about-kaikai');
if (aboutKuma) {
  aboutKuma.classList.add('pokeable');
  aboutKuma.addEventListener('click', () => {
    if (prefersReducedMotion()) return;
    aboutKuma.classList.remove('poked');
    void aboutKuma.offsetWidth; // 連打でもアニメを再発火させるためのreflow
    aboutKuma.classList.add('poked');
  });
}

// ===== スクロール演出（パララックス+イーロンカウントアップ） =====
if (!prefersReducedMotion()) {
  import('./fx/scroll-fx.js').then((m) => m.initScrollFx());
}

// ===== マウス環境限定の演出（reduced-motion除外） =====
if (!prefersReducedMotion() && window.matchMedia('(pointer: fine)').matches) {
  import('./fx/sparkles.js').then((m) => m.initSparkles());
  // マグネティックボタン（吸い付く触り心地）— イーロン様専用のみ
  import('./fx/magnetic.js').then((m) => m.initMagnetic('#elon-buy-btn'));
  // 商品写真の覗き込みズーム（イーロン/プレースホルダーは対象外）
  import('./fx/hover-zoom.js').then((m) =>
    m.initHoverZoom('.product-media:not(.elon-media)'),
  );
}

// ===== 3Dこんぺいとうヒーロー（遅延ロード） =====
// - reduced-motion では起動しない（静的グラデーションのまま）
// - 初期化はアイドル時に回し、購入導線のロードを絶対に邪魔しない
if (!prefersReducedMotion()) {
  const start = () => {
    import('./fx/hero-3d.js')
      .then((m) => m.initHero3D({ mobile: isMobile() }))
      .catch(() => {
        /* WebGL不可・ロード失敗時は静的ヒーローのまま（購入には無関係） */
      });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(start, { timeout: 2500 });
  } else {
    setTimeout(start, 800);
  }
}

console.log('%c こすくまくんのおみせ — ready', 'color: #8B6914; font-weight: bold;');
