// fx/motion.js — モーション/ブレークポイントの単一情報源（JS側）
//
// - prefers-reduced-motion はCSSだけでなく、JS演出（3D・キラキラ・パラパラ）も
//   ここのガードを通して必ず止める
// - ブレークポイントは css/tokens.css のコメントと同値（640 / 900）。
//   JSとCSSで値がズレて501〜768px帯の3Dが消えた事故の再発防止

export const BP = {
  mobile: 640,
  tablet: 900,
};

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isMobile() {
  return window.matchMedia(`(max-width: ${BP.mobile}px)`).matches;
}

// 変化を購読（3Dの再初期化などに使う）
export function onBreakpointChange(fn) {
  const mq = window.matchMedia(`(max-width: ${BP.mobile}px)`);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}
