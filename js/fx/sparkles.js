// fx/sparkles.js — カーソルの金色キラキラ
// v1の実装品質が高かったので温存（要素プール+rAF）。変更点:
// - prefers-reduced-motion では初期化しない（呼び出し側でガード）
// - 生成spanに aria-hidden を付与
// - ヒーロー3D領域の上では出さない（3D演出とケンカしない）

const SPARKLES = ['✦', '✧', '⭑', '♦', '❋', '✴', '·'];
const COLORS = ['#d4a020', '#e8a030', '#c07818', '#f0c040', '#b64b32', '#e06030', '#9c7a4a'];
const MAX_POOL = 80;

export function initSparkles() {
  const pool = [];
  let lastX = -1;
  let lastY = -1;
  let frame = 0;

  function getEl() {
    for (const s of pool) {
      if (s._free) {
        s._free = false;
        return s;
      }
    }
    if (pool.length >= MAX_POOL) return null;
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;z-index:var(--z-fx);will-change:transform,opacity;font-family:serif;line-height:1;text-shadow:0 0 6px rgba(212,160,32,0.6);';
    document.body.appendChild(el);
    el._free = false;
    pool.push(el);
    return el;
  }

  function spawn(x, y) {
    const el = getEl();
    if (!el) return;
    el.textContent = SPARKLES[Math.floor(Math.random() * SPARKLES.length)];
    el.style.fontSize = 10 + Math.random() * 18 + 'px';
    el.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    el.style.opacity = '1';
    el.style.display = 'block';
    const vx = (Math.random() - 0.5) * 80;
    const vy = -30 - Math.random() * 60;
    const life = 600 + Math.random() * 500;
    const rot0 = Math.random() * 360;
    const start = performance.now();
    (function tick(now) {
      const t = (now - start) / life;
      if (t >= 1) {
        el.style.display = 'none';
        el._free = true;
        return;
      }
      const ease = 1 - t * t;
      el.style.transform = `translate(${x + vx * t}px,${y + vy * t + 80 * t * t}px) rotate(${rot0 + t * 270}deg) scale(${ease})`;
      el.style.opacity = String(Math.min(1, ease * 1.5));
      requestAnimationFrame(tick);
    })(performance.now());
  }

  const heroFx = document.querySelector('.hero-fx');
  document.addEventListener('mousemove', (e) => {
    if (lastX < 0) {
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (heroFx) {
      const r = heroFx.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    }
    frame++;
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 3) return;
    if (frame % 2 !== 0 && speed < 10) return;
    const count = speed > 40 ? 4 : speed > 20 ? 3 : speed > 8 ? 2 : 1;
    for (let i = 0; i < count; i++) spawn(e.clientX, e.clientY);
  });
}
