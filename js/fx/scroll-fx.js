// fx/scroll-fx.js — スクロール連動の演出
// - ヒーローパララックス（こんぺいとう層とパネルを別速度で流す）
// - イーロン価格の$420,000,000カウントアップ（inview一回だけ）
// すべて prefers-reduced-motion で初期化しない（呼び出し側でガード）

export function initScrollFx() {
  // ===== ヒーローパララックス =====
  const heroFx = document.querySelector('.hero-fx');
  const heroPanel = document.querySelector('.hero-panel');
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < window.innerHeight * 1.3) {
          // rotateは個別プロパティなのでtransformと合成される（打ち消さない）
          if (heroFx) heroFx.style.transform = `translateY(${y * 0.22}px)`;
          if (heroPanel) heroPanel.style.transform = `translateY(${y * 0.08}px)`;
        }
        ticking = false;
      });
    },
    { passive: true },
  );

  // ===== イーロン価格カウントアップ =====
  const priceEl = document.querySelector('.elon-price');
  if (priceEl) {
    const finalText = priceEl.textContent.trim(); // "$420,000,000"
    const target = 420000000;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.disconnect();
          const t0 = performance.now();
          const dur = 1600;
          const tick = (now) => {
            const t = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            priceEl.textContent = '$' + Math.round(target * eased).toLocaleString('en-US');
            if (t < 1) requestAnimationFrame(tick);
            else priceEl.textContent = finalText;
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(priceEl);
  }
}
