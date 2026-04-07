// kuma-anim.js — こすくまフレームアニメーション
// 連番PNGを順番に表示してパラパラアニメにする
// 1コマ打ち: 24FPSで各画を1フレーム保持（24枚/秒）

const ANIMS = {
  dance:         { frames: 49, prefix: 'dance_' },
  gorogoro:      { frames: 61, prefix: 'gorogoro_' },
  kaikai:        { frames: 57, prefix: 'kaikai_' },
  osirihurihuri: { frames: 32, prefix: 'osirihurihuri_' },
  utouto:        { frames: 48, prefix: 'utouto_' },
};

export class KumaAnim {
  constructor(container, animName, opts = {}) {
    const anim = ANIMS[animName];
    if (!anim) throw new Error(`Unknown anim: ${animName}`);

    this.name = animName;
    this.frameCount = anim.frames;
    this.fps = 24;
    this.hold = 1;
    this.loop = opts.loop !== false;
    this.idx = 0;
    this.tick = 0;
    this.timer = null;
    this.loaded = false;

    this.img = document.createElement('img');
    this.img.alt = `こすくまくん ${animName}`;
    this.img.draggable = false;
    if (opts.className) this.img.className = opts.className;
    if (opts.style) Object.assign(this.img.style, opts.style);
    container.appendChild(this.img);

    this.srcs = [];
    for (let i = 1; i <= this.frameCount; i++) {
      this.srcs.push(`https://kosukuma-official-shop.pages.dev/assets/kosukuma/anim/${animName}/${anim.prefix}${String(i).padStart(3, '0')}.png`);
    }

    this._preloaded = 0;
    this._preloadImages = [];
    this.srcs.forEach((src, i) => {
      const pre = new Image();
      pre.onload = () => {
        this._preloaded++;
        if (this._preloaded >= 3 && !this.loaded) {
          this.loaded = true;
          this.img.src = this.srcs[0];
        }
      };
      pre.src = src;
      this._preloadImages.push(pre);
    });

    this.img.src = this.srcs[0];
  }

  play() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick++;
      if (this.tick % this.hold !== 0) return;
      this.idx = (this.idx + 1) % this.frameCount;
      if (!this.loop && this.idx === 0) { this.stop(); return; }
      this.img.src = this.srcs[this.idx];
    }, 1000 / this.fps);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  destroy() {
    this.stop();
    this.img.remove();
    this._preloadImages = null;
  }
}

export function kumaImg(src, alt, opts = {}) {
  const img = document.createElement('img');
  img.src = `https://kosukuma-official-shop.pages.dev/assets/kosukuma/${src}`;
  img.alt = alt || 'こすくまくん';
  img.draggable = false;
  if (opts.className) img.className = opts.className;
  if (opts.style) Object.assign(img.style, opts.style);
  if (opts.width) img.style.width = opts.width;
  if (opts.height) img.style.height = opts.height;
  return img;
}
