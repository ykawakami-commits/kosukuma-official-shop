// js/fx/carousel.js — ヒーローカルーセル（ちいかわ式: 自動再生＋矢印＋ドット＋一時停止＋スワイプ）
// 購入導線に触れない装飾領域のみ。z-index階層表より上に出さない。
const INTERVAL_MS = 6000;

export function initCarousel(id) {
  const root = document.getElementById(id);
  if (!root) return;
  const slides = Array.from(root.querySelectorAll('.carousel-slide'));
  if (slides.length <= 1) return;
  const dotsWrap = root.querySelector('.carousel-dots');
  const pauseBtn = root.querySelector('.carousel-pause');
  let index = 0;
  let timer = null;
  let paused = false;

  const dots = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `${i + 1}枚目を表示`);
    dot.addEventListener('click', () => go(i, true));
    dotsWrap?.appendChild(dot);
    return dot;
  });

  function render() {
    slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
    dots.forEach((d, i) => d.setAttribute('aria-current', i === index ? 'true' : 'false'));
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function start() {
    stop();
    if (!paused) timer = setInterval(() => go((index + 1) % slides.length), INTERVAL_MS);
  }
  function go(next, manual = false) {
    index = (next + slides.length) % slides.length;
    render();
    if (manual) start(); // 手動操作後は自動再生をリセット
  }

  root.querySelector('.carousel-arrow.prev')?.addEventListener('click', () => go(index - 1, true));
  root.querySelector('.carousel-arrow.next')?.addEventListener('click', () => go(index + 1, true));

  pauseBtn?.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? '▶' : 'II';
    pauseBtn.setAttribute('aria-label', paused ? '自動再生を再開する' : '自動再生を止める');
    start();
  });

  // スワイプ（パッシブリスナーでスクロールを妨げない）
  let touchX = null;
  root.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 48) go(index + (dx < 0 ? 1 : -1), true);
    touchX = null;
  }, { passive: true });

  // 画面外では自動再生を止める（電力節約）
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) start();
    else stop();
  }).observe(root);

  render();
}
