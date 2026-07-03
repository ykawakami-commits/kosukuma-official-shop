// fx/confetti.js — こんぺいとう紙吹雪バースト
// カゴ追加成功の瞬間に、ヒーローの3Dこんぺいとうと同じパステル色の紙片が舞う。
// 「この店のお祝いはこんぺいとう」というシグネチャー演出。
// 依存ゼロのCanvas 2D。呼び出し側で prefers-reduced-motion をガードすること。

const PALETTE = ['#5cc8e8', '#6dd87a', '#f07aa0', '#f0a050', '#f0d848', '#e8e0d8']; // hero-3dと同一

let canvas = null;
let ctx = null;
let particles = [];
let rafId = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100dvh;pointer-events:none;z-index:var(--z-toast);';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// (x, y) はビューポート座標。ボタンの中心などを渡す
export function burst(x, y, count = 26) {
  ensureCanvas();
  resize();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4.5,   // 少し上向きに打ち上げる
      size: 4 + Math.random() * 5,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,  // ひらひら横揺れの位相
      life: 0,
      maxLife: 55 + Math.random() * 25,    // フレーム数（~1秒強）
    });
  }
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.life < p.maxLife);
  if (particles.length === 0) {
    rafId = 0;
    return;
  }
  for (const p of particles) {
    p.life++;
    p.vy += 0.22;                                 // 重力
    p.x += p.vx + Math.sin(p.phase + p.life * 0.15) * 0.8;  // ひらひら
    p.y += p.vy;
    p.rot += p.vrot;
    const alpha = 1 - Math.pow(p.life / p.maxLife, 2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    // こんぺいとうっぽい小さな星形（4トゲ）
    const s = p.size;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? s : s * 0.45;
      const a = (i / 8) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  rafId = requestAnimationFrame(tick);
}
