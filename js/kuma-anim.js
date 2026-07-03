// kuma-anim.js — こすくまフレームアニメーション
// 連番PNGを順番に表示してパラパラアニメにする（1コマ打ち・24FPS）
//
// v2の変更:
// - フレームのプリロードは play() 時まで遅延（起動直後に154枚一括DLしていた事故の防止）
// - URLは相対パス（本番ドメイン直書きを廃止 — ドメイン移行・プレビュー検証を可能に）

const ANIMS = {
  dance:         { frames: 49, prefix: 'dance_' },
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
    this.loop = opts.loop !== false;
    this.idx = 0;
    this.timer = null;
    this._preloadStarted = false;

    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.setAttribute('aria-hidden', 'true');
    this.img.draggable = false;
    if (opts.className) this.img.className = opts.className;
    if (opts.style) Object.assign(this.img.style, opts.style);
    container.appendChild(this.img);

    this.srcs = [];
    for (let i = 1; i <= this.frameCount; i++) {
      this.srcs.push(`/assets/kosukuma/anim/${animName}/${anim.prefix}${String(i).padStart(3, '0')}.png`);
    }
    this.img.src = this.srcs[0];
  }

  _preload() {
    if (this._preloadStarted) return;
    this._preloadStarted = true;
    this._preloadImages = this.srcs.map((src) => {
      const pre = new Image();
      pre.src = src;
      return pre;
    });
  }

  play() {
    if (this.timer) return;
    this._preload();
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % this.frameCount;
      if (!this.loop && this.idx === 0) {
        this.stop();
        return;
      }
      this.img.src = this.srcs[this.idx];
    }, 1000 / this.fps);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.stop();
    this.img.remove();
    this._preloadImages = null;
  }
}
