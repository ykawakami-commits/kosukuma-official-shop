// main.js — こすくまくんのおみせ エントリポイント

import { KumaAnim } from './kuma-anim.js';
import { initProductGrid, initCartDrawer, refreshProducts } from './shop-ui.js';
import { initShopify, fetchShopifyProducts } from './shopify.js';

// ===== Phase 1: 商品・カート初期化（フォールバックデータで即時描画） =====
initProductGrid();
initCartDrawer();

// ===== Phase 2: Shopify 接続 → 商品差し替え =====
(async () => {
  const connected = await initShopify();
  if (!connected) return;

  const shopifyProducts = await fetchShopifyProducts();
  if (shopifyProducts) {
    refreshProducts(shopifyProducts);
  }
})();

// ===== KumaAnim =====
function observeAnim(container, anim) {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => e.isIntersecting ? anim.play() : anim.stop());
  }, { rootMargin: '10% 0px' });
  obs.observe(container);
}

const animStyle = { width: '100%', height: '100%', objectFit: 'contain' };

const heroInline = document.getElementById('hero-inline-dance');
if (heroInline) {
  new KumaAnim(heroInline, 'dance', { style: animStyle }).play();
}

const aboutKaikai = document.getElementById('about-kaikai');
if (aboutKaikai) {
  const kaikai = new KumaAnim(aboutKaikai, 'kaikai', { style: animStyle });
  observeAnim(aboutKaikai, kaikai);
}

const utoutoContainer = document.getElementById('utouto-container');
if (utoutoContainer) {
  const utouto = new KumaAnim(utoutoContainer, 'utouto', { style: animStyle });
  observeAnim(utoutoContainer, utouto);
}

// ===== Sticky Cart =====
document.getElementById('sticky-cart')?.addEventListener('click', () => {
  document.getElementById('cart-toggle')?.click();
});

// ===== FAQ Accordion =====
document.querySelectorAll('.faq-q').forEach(q => {
  q.addEventListener('click', () => q.closest('.faq-item')?.classList.toggle('open'));
});

// ===== Section Heading Fade-in =====
const headingObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); headingObserver.unobserve(e.target); }
  });
}, { threshold: 0.2 });
document.querySelectorAll('.section-heading').forEach(h => headingObserver.observe(h));

// ===== Legal Modals =====
document.querySelectorAll('[data-modal]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(link.dataset.modal)?.classList.add('open');
  });
});
document.querySelectorAll('.legal-modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  overlay.querySelector('.legal-modal-close')?.addEventListener('click', () => overlay.classList.remove('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.legal-modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ===== Cursor Sparkles =====
(() => {
  const SPARKLES = ['✦', '✧', '⭑', '♦', '❋', '✴', '·'];
  const COLORS   = ['#d4a020', '#e8a030', '#c07818', '#f0c040', '#b64b32', '#e06030', '#9c7a4a'];
  const pool = [];
  const MAX_POOL = 80;
  let lastX = -1, lastY = -1, frame = 0;

  function getEl() {
    for (const s of pool) if (s._free) { s._free = false; return s; }
    if (pool.length >= MAX_POOL) return null;
    const el = document.createElement('span');
    el.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9999;will-change:transform,opacity;font-family:serif;line-height:1;text-shadow:0 0 6px rgba(212,160,32,0.6);';
    document.body.appendChild(el);
    el._free = false;
    pool.push(el);
    return el;
  }

  function spawn(x, y) {
    const el = getEl();
    if (!el) return;
    el.textContent = SPARKLES[Math.floor(Math.random() * SPARKLES.length)];
    el.style.fontSize  = (10 + Math.random() * 18) + 'px';
    el.style.color     = COLORS[Math.floor(Math.random() * COLORS.length)];
    el.style.opacity   = '1';
    el.style.display   = 'block';
    const vx   = (Math.random() - 0.5) * 80;
    const vy   = -30 - Math.random() * 60;
    const life = 600 + Math.random() * 500;
    const rot0 = Math.random() * 360;
    const start = performance.now();
    (function tick(now) {
      const t = (now - start) / life;
      if (t >= 1) { el.style.display = 'none'; el._free = true; return; }
      const ease = 1 - t * t;
      el.style.transform = `translate(${x + vx * t}px,${y + vy * t + 80 * t * t}px) rotate(${rot0 + t * 270}deg) scale(${ease})`;
      el.style.opacity   = String(Math.min(1, ease * 1.5));
      requestAnimationFrame(tick);
    })(performance.now());
  }

  const headerWrap = document.getElementById('header-3d-wrap');
  document.addEventListener('mousemove', (e) => {
    if (lastX < 0) { lastX = e.clientX; lastY = e.clientY; return; }
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (headerWrap) {
      const r = headerWrap.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    }
    frame++;
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 3) return;
    if (frame % 2 !== 0 && speed < 10) return;
    const count = speed > 40 ? 4 : speed > 20 ? 3 : speed > 8 ? 2 : 1;
    for (let i = 0; i < count; i++) spawn(e.clientX, e.clientY);
  });
})();

console.log('%c こすくまくんのおみせ — ready', 'color: #8B6914; font-weight: bold;');
