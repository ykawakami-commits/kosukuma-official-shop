// js/main.js — エントリポイント
import { initUI } from './ui.js';
import { initWhimsy } from './fx/whimsy.js';
import { initCarousel } from './fx/carousel.js';
import { initReveal } from './fx/reveal.js';
import { isMobile, prefersReducedMotion } from './fx/motion.js';

initUI();
const band = initWhimsy();
initCarousel('hero-carousel');
// スクロール出現（ちいかわ式）。initUI() の同期パートが「最近チェック」カードを
// #checked-grid に生成し終えた後に呼ぶ（生成カードも対象に含めるための順序依存）
initReveal();

// コマアニメ遅延ロード（公式ルール: 同一アニメは1ページ1個まで）
// prefers-reduced-motion 時はアニメを起動しない（静止画像のまま。前庭障害系 a11y）
async function lazyKumaAnim(id, name) {
  const el = document.getElementById(id);
  if (!el) return;
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const { KumaAnim } = await import('./kuma-anim.js');
    new KumaAnim(el, name).play();
  }, { rootMargin: '10% 0px' });
  io.observe(el);
}
if (!prefersReducedMotion()) {
  lazyKumaAnim('about-kaikai', 'kaikai');
  if (band === 'night') lazyKumaAnim('whimsy-kuma-anim', 'utouto');
}

// 聖域: ジャイロ金平糖（トップページのみ。アイドル時に遅延初期化。モバイル前提の機能）
// prefers-reduced-motion 時は起動しない（常時動く3Dのため）
// hero-3d は dynamic import（static だと importmap の無い商品ページで three の解決に失敗し main.js 全体が死ぬ）
if (document.querySelector('.hero') && !prefersReducedMotion()) {
  const start3d = async () => {
    const { initHero3D } = await import('./fx/hero-3d.js').catch(() => ({}));
    if (initHero3D) initHero3D({ mobile: isMobile() });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start3d, { timeout: 2500 });
  else setTimeout(start3d, 800);
}
