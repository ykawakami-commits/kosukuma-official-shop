// fx/magnetic.js — マグネティックボタン（カーソルに吸い付く）
// ハイエンドサイトの定番の触り心地。マウス環境のみ・reduced-motionでは初期化しない
// （呼び出し側でガード）。押し込み(:active相当)もここで面倒を見る —
// inline transformがCSSの:activeを上書きしてしまうため。

const PULL = 0.28;      // 吸着の強さ
const MAX_PULL = 10;    // 最大移動px

export function initMagnetic(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    let pressed = false;

    const apply = (dx, dy) => {
      const press = pressed ? ' translateY(3px)' : '';
      el.style.transform = `translate(${dx}px, ${dy}px)${press}`;
    };

    el.style.transition = 'transform 0.3s var(--ease-pop), box-shadow 0.16s';

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const clamp = (v) => Math.max(-MAX_PULL, Math.min(MAX_PULL, v * PULL));
      apply(clamp(dx), clamp(dy));
    });
    el.addEventListener('pointerleave', () => {
      pressed = false;
      el.style.transform = '';
    });
    el.addEventListener('pointerdown', () => {
      pressed = true;
      el.style.boxShadow = 'var(--press-shadow-down) var(--ink)';
      const m = /translate\(([^)]+)\)/.exec(el.style.transform);
      el.style.transform = (m ? `translate(${m[1]})` : '') + ' translateY(3px)';
    });
    const release = () => {
      pressed = false;
      el.style.boxShadow = '';
      el.style.transform = el.style.transform.replace(' translateY(3px)', '');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  });
}
