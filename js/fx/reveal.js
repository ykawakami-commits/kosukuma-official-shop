// js/fx/reveal.js — スクロール出現エフェクト
// ちいかわマーケット（Shopify Dawn 標準 scroll-trigger）の実測パラメータをそのまま移植する。
//
// 実測仕様（parity計測済み）:
//   - 発火: IntersectionObserver rootMargin "0px 0px -50px 0px" threshold 0
//           （要素上端がビューポート下端から50px入った瞬間）
//   - 出現: 600ms cubic-bezier(0,0,.3,1) / translateY 20px→0 / opacity .01→1（CSS側 css/main.css）
//   - stagger: cascade 要素のみ「同時に見えたバッチ内」で 0 から振り直して 75ms 刻み
//              （ページ後半の行でも delay が無限に伸びない、Dawnの --animation-order 上書きと同挙動）
//   - 1回きり: 出現後 unobserve（上に戻って再スクロールしても再発火しない）
//
// 方針:
//   - クラスは JS がここで付ける（HTMLは素のまま）→ JS無効環境では何も隠れない（プログレッシブエンハンスメント）
//     ＋ tools/edit/content-map.json の find 断片（生HTML）を一切崩さない
//   - ファーストビュー除外: 初期化時点でビューポートに1pxでも入っている要素（＋スクロール復元で
//     上に抜けた要素）には触らない＝即時表示（リロード時にチラつかせない）。
//     ちいかわ本家は画面内要素もロード時にアニメ再生するが、ここは「初期表示は即時」の要件を優先
//   - reduced-motion は motion.js の判定で全スキップ（CSS 側 @media ガードと二重化）
//   - 対象外（聖域）: アナウンス/ヘッダー/ナビ帯/告知行/ヒーローカルーセル/商品詳細本体/カルーセル内アイテム

import { prefersReducedMotion } from './motion.js';

// 対象の選定はちいかわ実測の方針どおり2種のみ:
//   繰り返しアイテム = cascade（75ms階段） / セクション見出し・単発ボックス = 単発（delay 0）
// 画像・テキストノード単体には付けない。ファーストビュー要素はここに載せない。
const TARGETS = [
  { selector: '.section-head', cascade: false },            // #products/#checked/#about/#guide/#faq/#related
  { selector: '#news .info-box', cascade: false },          // お知らせ箱（見出し込みで1単位）
  { selector: '#about .about-wrap', cascade: false },
  { selector: '.product-grid .product-card', cascade: true }, // 商品カード（トップ/最近チェック/他の商品）
  { selector: '#guide .guide-item', cascade: true },
  { selector: '#faq .faq-item', cascade: true },
  { selector: '.footer-boxes .footer-box', cascade: true },
];

const ORDER_PROP = '--reveal-order';

// アニメ完了後はクラス・インラインprop・data属性を全部外して素の状態に戻す。
// （animation の fill が transform を保持し続けると .product-card:hover / .footer-box:hover の
//   浮き2px transform に勝ってしまい hover が死ぬ。出現は1回きりなので外して問題ない）
function settle(el) {
  el.classList.remove('reveal', 'is-visible');
  el.style.removeProperty(ORDER_PROP);
  delete el.dataset.revealCascade;
}

function onIntersect(entries, observer) {
  let order = 0; // Dawn同様、staggerはバッチごとに0から振り直す
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    if ('revealCascade' in el.dataset) {
      el.style.setProperty(ORDER_PROP, String(order));
      order += 1;
    }
    // animationcancel も拾う（アニメ中に reduced-motion へ切り替わった場合等でも素の状態へ戻す）
    el.addEventListener('animationend', () => settle(el), { once: true });
    el.addEventListener('animationcancel', () => settle(el), { once: true });
    el.classList.add('is-visible');
    observer.unobserve(el); // ← 1回きり（再スクロールで再発火しない）
  }
}

export function initReveal() {
  if (prefersReducedMotion()) return; // 即時表示・アニメなし（クラスを一切付けない）
  if (!('IntersectionObserver' in window)) return; // フェイルオープン: 観測できなければ何も隠さない

  let observer;
  try {
    observer = new IntersectionObserver(onIntersect, { rootMargin: '0px 0px -50px 0px' });
  } catch {
    return;
  }

  const viewportH = window.innerHeight;
  const seen = new Set();
  for (const { selector, cascade } of TARGETS) {
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue; // セレクタ重複時の二重登録防止
      seen.add(el);
      if (el.closest('[hidden]')) continue; // 非表示セクション（履歴空の #checked 等）は対象外
      // 初期表示で見えている要素は隠さない（リロード時のチラつきゼロ）。
      // rect.top < viewportH は「1pxでも見えている」＋「復元スクロールで上に抜けた」の両方をカバー
      if (el.getBoundingClientRect().top < viewportH) continue;
      el.classList.add('reveal');
      if (cascade) el.dataset.revealCascade = '';
      observer.observe(el);
    }
  }
}
