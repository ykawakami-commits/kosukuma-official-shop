// js/main.js — エントリポイント
import { initUI } from './ui.js';
import { initWhimsy } from './fx/whimsy.js';
import { isMobile } from './fx/motion.js';
import { initHero3D } from './fx/hero-3d.js';

initUI();
const band = initWhimsy();

// コマアニメ遅延ロード（公式ルール: 同一アニメは1ページ1個まで）
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
lazyKumaAnim('about-kaikai', 'kaikai');
if (band === 'night') lazyKumaAnim('whimsy-kuma-anim', 'utouto');

// 聖域: ジャイロ金平糖（アイドル時に遅延初期化。モバイル前提の機能）
const start3d = () => initHero3D({ mobile: isMobile() });
if ('requestIdleCallback' in window) requestIdleCallback(start3d, { timeout: 2500 });
else setTimeout(start3d, 800);
