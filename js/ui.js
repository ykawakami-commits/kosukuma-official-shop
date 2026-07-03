// ui.js — 画面の配線
//
// 原則:
// - カートの数字・合計・チェックアウトURLは cart.js（=Shopify）だけを見る
// - CATALOGは「見せ方」だけを持つ演出レイヤー。価格と在庫は必ずShopifyで上書き
// - 失敗は黙殺しない。全部こすくまくんの声でトーストする

import { fetchProductsByHandles, formatMoney } from './storefront.js';
import * as cart from './cart.js';
import { PRODUCT_HANDLES, FREE_SHIPPING_THRESHOLD_JPY } from './config.js';
import { KumaAnim } from './kuma-anim.js';
import { prefersReducedMotion } from './fx/motion.js';

// ===== 表示カタログ（演出レイヤー） =====
const CATALOG = {
  'こすくまくんステッカー': {
    no: 'NO. 001',
    story: 'どこにでも貼れる。まちのどこかで見かけたら、それはたぶん、なかまのしわざ。',
    images: [
      '/assets/img/kosukuma-sticker-street-800.webp',
      '/assets/img/kosukuma-sticker-pack-800.webp',
      '/assets/img/kosukuma-sticker-main-800.webp',
    ],
  },
  'tシャツ': {
    no: 'NO. 002',
    story: 'いちばんいいやつ。なにがいいかは、きたひとだけわかる。',
    images: [
      '/assets/img/kosukuma-ultra-tshirt-1-800.webp',
      '/assets/img/kosukuma-ultra-tshirt-2-800.webp',
    ],
  },
  'こすくまデコヘルメット': {
    no: 'NO. 003',
    story: 'せかいに1こだけだった、デコレーションヘルメット。あたらしいおうちに たびだっていったよ。',
    images: ['/assets/img/kosukuma-deco-helmet-800.webp'],
    imgFit: 'contain',
  },
};

const SOLDOUT_LABELS = {
  'こすくまデコヘルメット': 'たびだっていったよ',
  default: 'うりきれちゃった',
};

// handle → Shopify商品（hydrate後に入る）
const products = new Map();

// スクリーンリーダー向けの不可視アナウンス（視覚ポップアップと重複させないため分離）
export function announce(message) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'visually-hidden';
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===== トースト =====
export function toast(message, ms = 3200) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 350);
  }, ms);
}

const VOICE = {
  netError: 'ごめん、おみせとつながらないみたい。ちょっとまってもういちどためして。',
  noStock: 'ごめん、いまざいこがないみたい。',
  partialStock: 'ざいこがすこししかなくて、いれられるだけいれたよ。',
  checkoutError: 'レジのちょうしがわるいみたい。すこしまってから、もういちどおしてみて。',
};

// ===== ダイアログ共通 =====
function wireDialog(dialog) {
  dialog.querySelectorAll('[data-close]').forEach((btn) =>
    btn.addEventListener('click', () => dialog.close()),
  );
  // 背景クリックで閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function initDialogs() {
  document.querySelectorAll('dialog').forEach(wireDialog);
  // フッターの法務リンク等
  document.querySelectorAll('[data-dialog]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(link.dataset.dialog)?.showModal();
    });
  });
}

// ===== 商品のhydration（静的HTML → Shopify実データで上書き） =====
async function hydrateProducts() {
  let fetched;
  try {
    fetched = await fetchProductsByHandles(PRODUCT_HANDLES);
  } catch {
    // 静的HTMLに正しい直近データが焼いてあるので、表示はそのまま生かす。
    // ただし購入操作は variantId が無いとできないため、ボタン押下時に改めて伝える
    return;
  }
  fetched.forEach((p) => p && products.set(p.handle, p));

  document.querySelectorAll('[data-handle]').forEach((card) => {
    const p = products.get(card.dataset.handle);
    if (p) applyProductState(card, p);
  });
}

function applyProductState(card, p) {
  const priceEl = card.querySelector('[data-price]');
  if (priceEl && p.price) {
    priceEl.innerHTML = `${formatMoney(p.price)}<span class="tax-label">(税込)</span>`;
  }
  const btn = card.querySelector('[data-add-to-cart]');
  if (!btn) return;

  if (p.availableForSale && p.variantId) {
    btn.disabled = false;
    btn.textContent = 'カゴに入れる';
    card.classList.remove('is-soldout');
    card.querySelector('[data-soldout-stamp]')?.remove();
  } else {
    btn.disabled = true;
    btn.textContent = SOLDOUT_LABELS[p.handle] ?? SOLDOUT_LABELS.default;
    card.classList.add('is-soldout');
    if (!card.querySelector('[data-soldout-stamp]')) {
      const stamp = document.createElement('span');
      stamp.className = 'soldout-stamp';
      stamp.dataset.soldoutStamp = '';
      stamp.innerHTML = 'うりきれ<small>SOLD OUT</small>';
      card.querySelector('.product-media, .feature-media')?.appendChild(stamp);
    }
    card.querySelector('[data-stock-note]')?.remove();
  }
}

// ===== カート表示（cart.jsのShopifyミラーを描くだけ） =====
let mutating = false; // 連打による多重mutation防止

function renderCart(c) {
  const count = c?.totalQuantity ?? 0;

  const countEl = document.getElementById('cart-count');
  if (countEl && String(count) !== countEl.textContent) {
    countEl.textContent = count;
    // ころんと回って増える（reduced-motionではCSS側でアニメが無効化される）
    countEl.classList.remove('roll');
    void countEl.offsetWidth;
    countEl.classList.add('roll');
  }

  const sticky = document.getElementById('sticky-cart');
  const stickyCount = document.getElementById('sticky-cart-count');
  if (stickyCount) stickyCount.textContent = count;
  sticky?.classList.toggle('show', count > 0);

  const itemsEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total-price');
  const checkoutBtn = document.getElementById('btn-checkout');
  if (!itemsEl) return;

  const lines = c?.lines.nodes ?? [];
  renderShippingMeter(c, lines.length);
  if (lines.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <img class="pixel-art" src="/assets/kosukuma/front.png" alt="">
        まだなにも入ってないよ
        <button class="btn-cart cart-empty-cta" id="cart-empty-cta">グッズをみる</button>
      </div>`;
    itemsEl.querySelector('#cart-empty-cta')?.addEventListener('click', () => {
      document.getElementById('cart-drawer')?.close();
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    });
    if (totalEl) totalEl.textContent = '¥0';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  itemsEl.innerHTML = '';
  for (const line of lines) {
    const m = line.merchandise;
    const item = document.createElement('div');
    item.className = 'cart-item';
    // Shopify CDNの画像はwidthパラメータでリサイズできる（?の有無両対応）
    const thumb = m.image
      ? m.image.url + (m.image.url.includes('?') ? '&' : '?') + 'width=128'
      : null;
    item.innerHTML = `
      <div class="cart-item-img">${thumb ? `<img src="${encodeURI(thumb)}" alt="">` : ''}</div>
      <div>
        <p class="cart-item-name"></p>
        <p class="cart-item-price">${formatMoney(line.cost.totalAmount)}</p>
      </div>
      <div class="cart-item-actions">
        <div class="cart-item-qty">
          <button data-line="${line.id}" data-delta="-1">−</button>
          <span class="qty-num">${line.quantity}</span>
          <button data-line="${line.id}" data-delta="1">＋</button>
        </div>
        <button class="cart-item-remove" data-remove="${line.id}">だす</button>
      </div>`;
    item.querySelector('.cart-item-name').textContent = m.product.title;
    const [minusBtn, plusBtn] = item.querySelectorAll('.cart-item-qty button');
    minusBtn.setAttribute('aria-label', `${m.product.title} をへらす`);
    plusBtn.setAttribute('aria-label', `${m.product.title} をふやす`);
    item.querySelector('[data-remove]').setAttribute('aria-label', `${m.product.title} をカートからだす`);
    itemsEl.appendChild(item);
  }

  if (totalEl) totalEl.textContent = formatMoney(c.cost.subtotalAmount);
  if (checkoutBtn) checkoutBtn.disabled = false;
}

// 送料無料メーター（閾値は特商法表記と同一のconfig値）
function renderShippingMeter(c, lineCount) {
  const meter = document.getElementById('shipping-meter');
  if (!meter) return;
  if (!c || lineCount === 0) {
    meter.hidden = true;
    return;
  }
  const subtotal = Number(c.cost.subtotalAmount.amount);
  const remain = FREE_SHIPPING_THRESHOLD_JPY - subtotal;
  const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD_JPY) * 100));
  meter.hidden = false;
  meter.classList.toggle('reached', remain <= 0);
  document.getElementById('shipping-meter-label').textContent =
    remain <= 0
      ? 'そうりょうむりょう！やったね'
      : `あと ${formatMoney({ amount: remain, currencyCode: 'JPY' })} で そうりょうむりょうだよ`;
  document.getElementById('shipping-meter-bar').style.width = pct + '%';
  document.getElementById('shipping-meter-bar-wrap').setAttribute('aria-valuenow', String(pct));
}

async function changeQty(lineId, delta) {
  if (mutating) return;
  const c = cart.getCart();
  const line = c?.lines.nodes.find((l) => l.id === lineId);
  if (!line) return;
  mutating = true;
  document.querySelectorAll('.cart-item-qty button').forEach((b) => (b.disabled = true));
  try {
    const next = line.quantity + delta;
    const res = await cart.updateLineQuantity(lineId, next);
    if (res?.applied !== undefined && next > line.quantity && res.applied < next) {
      toast(VOICE.partialStock);
    }
    announce('カートをこうしんしたよ');
  } catch {
    toast(VOICE.netError);
  } finally {
    mutating = false;
    renderCart(cart.getCart()); // ボタン再生成でdisabled解除
    // innerHTML再構築でフォーカスが全喪失するため、押した操作と同じボタンへ復元
    const same = document.querySelector(
      `button[data-line="${CSS.escape(lineId)}"][data-delta="${delta}"]`,
    );
    const fallback =
      document.querySelector('.cart-item-qty button') ??
      document.querySelector('#cart-drawer .dialog-close');
    (same ?? fallback)?.focus();
  }
}

async function removeLineWithFeedback(lineId) {
  if (mutating) return;
  mutating = true;
  document.querySelectorAll('.cart-item-actions button').forEach((b) => (b.disabled = true));
  try {
    await cart.removeLine(lineId);
    announce('カートからだしたよ');
  } catch {
    toast(VOICE.netError);
  } finally {
    mutating = false;
    renderCart(cart.getCart());
    (document.querySelector('.cart-item-qty button') ??
      document.querySelector('#cart-drawer .dialog-close'))?.focus();
  }
}

function initCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;

  const open = () => drawer.showModal();
  document.getElementById('cart-toggle')?.addEventListener('click', open);
  document.getElementById('sticky-cart')?.addEventListener('click', open);

  document.getElementById('cart-items')?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('button[data-remove]');
    if (removeBtn) {
      removeLineWithFeedback(removeBtn.dataset.remove);
      return;
    }
    const btn = e.target.closest('button[data-line]');
    if (!btn) return;
    changeQty(btn.dataset.line, parseInt(btn.dataset.delta, 10));
  });

  document.getElementById('btn-checkout')?.addEventListener('click', () => {
    const url = cart.getCheckoutUrl();
    const c = cart.getCart();
    if (!c || c.totalQuantity === 0) return;
    if (url) {
      window.location.href = url;
    } else {
      toast(VOICE.checkoutError);
    }
  });

  cart.onCartChange(renderCart);
}

// ===== カゴ追加（おしりふりふり+商品が飛んでいく） =====
let popupTimer = null;
let popupAnim = null;

// 商品画像がカートボタンへ飛んでいく（買い物の快感演出）。
// ダイアログ内からの追加など、飛ばせる画像が無い時は静かにスキップ
function flyToCart(card) {
  if (prefersReducedMotion() || !card) return;
  const img = card.querySelector('.feature-media img, .product-media img');
  const target = document.getElementById('cart-toggle');
  if (!img || !target || typeof img.animate !== 'function') return;
  const from = img.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;

  const ghost = img.cloneNode(false);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText =
    `position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;` +
    'object-fit:cover;border-radius:14px;z-index:var(--z-toast);pointer-events:none;will-change:transform,opacity;';
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 70}px) scale(0.45) rotate(5deg)`, opacity: 0.95, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(10deg)`, opacity: 0.3 },
    ],
    { duration: 680, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' },
  );
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
}

function showAddedPopup() {
  const popup = document.getElementById('cart-popup');
  if (!popup) return;
  popup.classList.add('show');
  const container = document.getElementById('popup-anim-container');
  if (container && !popupAnim) {
    popupAnim = new KumaAnim(container, 'osirihurihuri', {
      style: { width: '100%', height: '100%', objectFit: 'contain' },
    });
  }
  popupAnim?.play();
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => {
    popup.classList.remove('show');
    popupAnim?.stop();
  }, 2500);
}

async function addToCart(handle, btn) {
  const p = products.get(handle);
  if (!p?.variantId || !p.availableForSale) {
    toast(products.size === 0 ? VOICE.netError : VOICE.noStock);
    return;
  }
  if (mutating) return;
  mutating = true;
  const origText = btn.textContent;
  btn.disabled = true;
  try {
    const res = await cart.addLine(p.variantId, 1);
    if (res.applied === 0) {
      toast(VOICE.noStock);
      return;
    }
    if (res.applied < res.requested) toast(VOICE.partialStock);
    announce('カゴに入れたよ');
    flyToCart(btn.closest('[data-handle]'));
    btn.textContent = 'いれたよ！';
    btn.classList.add('added');
    setTimeout(() => {
      btn.textContent = origText;
      btn.classList.remove('added');
    }, 1000);
    showAddedPopup();
    // こんぺいとう紙吹雪（ボタン中心から）
    if (!prefersReducedMotion()) {
      const r = btn.getBoundingClientRect();
      import('./fx/confetti.js').then((m) => m.burst(r.left + r.width / 2, r.top + r.height / 2));
    }
    const headerCart = document.getElementById('cart-toggle');
    headerCart?.classList.add('bounce');
    setTimeout(() => headerCart?.classList.remove('bounce'), 320);
  } catch {
    toast(VOICE.netError);
  } finally {
    mutating = false;
    btn.disabled = false;
  }
}

function initAddButtons() {
  document.querySelectorAll('[data-add-to-cart]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const handle = btn.closest('[data-handle]')?.dataset.handle;
      if (handle) addToCart(handle, btn);
    });
  });
}

// ===== 商品詳細ダイアログ =====
const pd = { handle: null, index: 0 };

function renderGallery() {
  const meta = CATALOG[pd.handle] ?? {};
  const images = meta.images ?? [];
  const idx = ((pd.index % images.length) + images.length) % images.length;
  pd.index = idx;

  const main = document.getElementById('pd-main');
  const img = document.getElementById('pd-image');
  img.src = images[idx] ?? '';
  main.classList.toggle('fit-contain', meta.imgFit === 'contain');

  const multi = images.length > 1;
  document.getElementById('pd-prev').style.display = multi ? '' : 'none';
  document.getElementById('pd-next').style.display = multi ? '' : 'none';

  const name = document.getElementById('pd-name').textContent;
  img.alt = multi ? `${name} しゃしん${idx + 1}まいめ` : name;

  const thumbs = document.getElementById('pd-thumbs');
  thumbs.innerHTML = '';
  if (multi) {
    images.forEach((src, i) => {
      const t = document.createElement('button');
      t.className = 'pd-thumb' + (i === idx ? ' active' : '');
      t.setAttribute('aria-label', `しゃしん ${i + 1}まいめ`);
      if (i === idx) t.setAttribute('aria-current', 'true');
      t.innerHTML = `<img src="${src}" alt="">`;
      t.addEventListener('click', () => {
        pd.index = i;
        renderGallery();
      });
      thumbs.appendChild(t);
    });
  }
}

function openProductDialog(card) {
  const handle = card.dataset.handle;
  const dialog = document.getElementById('product-dialog');
  if (!handle || !dialog) return;

  pd.handle = handle;
  pd.index = 0;

  const meta = CATALOG[handle] ?? {};
  const name = card.querySelector('h3, .product-name')?.textContent ?? '';
  const img = document.getElementById('pd-image');
  img.alt = name;
  document.getElementById('pd-no').textContent = meta.no ?? '';
  document.getElementById('pd-name').textContent = name;
  document.getElementById('pd-story').textContent = meta.story ?? '';

  const p = products.get(handle);
  const priceEl = document.getElementById('pd-price');
  const priceText = card.querySelector('[data-price]')?.textContent ?? '';
  priceEl.innerHTML = p?.price
    ? `${formatMoney(p.price)}<span class="tax-label">(税込)</span>`
    : priceText;

  const addBtn = document.getElementById('pd-add');
  const srcBtn = card.querySelector('[data-add-to-cart]');
  addBtn.disabled = srcBtn?.disabled ?? true;
  addBtn.textContent = srcBtn?.textContent ?? 'カゴに入れる';
  addBtn.dataset.handle = handle;

  renderGallery();
  dialog.showModal();
}

function initProductDialog() {
  const dialog = document.getElementById('product-dialog');
  if (!dialog) return;

  // 詳細を開くのは商品名の「本物のボタン」(.card-detail-btn)。
  // カード全体へのrole="button"付与は入れ子インタラクティブ違反+見出し消失になるため禁止。
  // カード全面クリックはボタンの::after疑似要素（CSS）で実現している。
  document.querySelectorAll('[data-open-detail]').forEach((btn) => {
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-handle]');
      if (card) openProductDialog(card);
    });
  });

  document.getElementById('pd-prev')?.addEventListener('click', () => {
    pd.index--;
    renderGallery();
  });
  document.getElementById('pd-next')?.addEventListener('click', () => {
    pd.index++;
    renderGallery();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { pd.index--; renderGallery(); }
    if (e.key === 'ArrowRight') { pd.index++; renderGallery(); }
  });

  document.getElementById('pd-add')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    addToCart(btn.dataset.handle, btn);
    setTimeout(() => dialog.close(), 700);
  });
}

// ===== イーロンマスク様 ほんにんかくにん =====
// 2段階クイズ（名前 → かいいぬ）。この店の名物なので一言一句大切に扱う。
function initElon() {
  const dialog = document.getElementById('elon-dialog');
  const content = document.getElementById('elon-dialog-content');
  const openBtn = document.getElementById('elon-buy-btn');
  if (!dialog || !content || !openBtn) return;

  // 失敗も自動クローズしない（読み上げ・読了の時間を奪わない）
  const fail = () => {
    content.innerHTML = `
      <p class="elon-message fail">ちがうみたい。イーロンマスクさんしかかえないよ。</p>
      <div class="elon-buttons"><button class="elon-btn" id="elon-fail-close">とじる</button></div>`;
    const closeBtn = document.getElementById('elon-fail-close');
    closeBtn.addEventListener('click', () => dialog.close());
    closeBtn.focus();
  };

  const success = () => {
    content.innerHTML = `
      <p class="elon-message success">かくにんできたよ！ほんものだ。</p>
      <p class="elon-q">けっこう おおきなおかいものだから、<br>メールでそうだんしよ。</p>
      <div class="elon-buttons">
        <a class="elon-btn primary" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none"
           href="mailto:info@kosukuma.com?subject=%E3%82%A4%E3%83%BC%E3%83%AD%E3%83%B3%E3%83%9E%E3%82%B9%E3%82%AF%E6%A7%98%E5%B0%82%E7%94%A8%E3%81%AE%E4%BB%B6">そうだんする</a>
      </div>`;
  };

  const askDog = () => {
    content.innerHTML = `
      <div class="elon-input-group">
        <label for="elon-dog-input">かいいぬのなまえは？</label>
        <input type="text" id="elon-dog-input" autocomplete="off">
        <button class="elon-btn primary" id="elon-dog-submit">かくにん</button>
      </div>`;
    const input = document.getElementById('elon-dog-input');
    input.focus();
    const submit = () => (input.value.trim() === 'Floki' ? success() : fail());
    document.getElementById('elon-dog-submit').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  };

  const askName = () => {
    content.innerHTML = `
      <div class="elon-input-group">
        <label for="elon-name-input">おなまえをおしえてね</label>
        <input type="text" id="elon-name-input" placeholder="おなまえ" autocomplete="off">
        <button class="elon-btn primary" id="elon-name-submit">かくにん</button>
      </div>`;
    const input = document.getElementById('elon-name-input');
    input.focus();
    const submit = () => (input.value.trim() === 'Elon Musk' ? askDog() : fail());
    document.getElementById('elon-name-submit').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  };

  openBtn.addEventListener('click', () => {
    content.innerHTML = `
      <p class="elon-q">イーロンマスク様ですか？</p>
      <div class="elon-buttons">
        <button class="elon-btn primary" id="elon-yes">はい</button>
        <button class="elon-btn" id="elon-no">いいえ</button>
      </div>`;
    dialog.showModal();
    document.getElementById('elon-yes').addEventListener('click', askName);
    document.getElementById('elon-no').addEventListener('click', fail);
  });
}

// ===== スクロール出現 =====
function initReveal() {
  // JS死亡時の保険タイマー（index.htmlのinlineスクリプト）はもう不要
  if (window.__kosuRevealFallback) clearTimeout(window.__kosuRevealFallback);
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

// ===== 起動 =====
export async function initUI() {
  initDialogs();
  initCartDrawer();
  initAddButtons();
  initProductDialog();
  initElon();
  initReveal();

  // カート復元と商品hydrationは並行（どちらも失敗してもページは生きる）
  await Promise.allSettled([
    cart.restoreCart().then(() => renderCart(cart.getCart())),
    hydrateProducts(),
  ]);
}
