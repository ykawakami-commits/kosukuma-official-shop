// js/ui.js — 画面配線（ドロワー/トースト/hydration/reveal/サムネ切替）
// カートの真実は js/cart.js（Shopify Cart API）。ここでは表示と配線だけを行う。
import { PRODUCT_HANDLES, FREE_SHIPPING_THRESHOLD_JPY } from './config.js';
import { fetchProductsByHandles, formatMoney } from './storefront.js';
import * as cart from './cart.js';

// ── トースト／スクリーンリーダー通知 ──
export function announce(message) {
  const region = document.getElementById('toast-region');
  if (region) region.setAttribute('aria-label', message);
}

export function toast(message, ms = 3200) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ── 売り切れスタンプ文言（商品ごとの遊び。在庫情報そのものはShopifyが真実） ──
const SOLDOUT_LABELS = {
  'こすくまデコヘルメット': 'たびだっていったよ',
};
const soldoutLabel = (handle) => SOLDOUT_LABELS[handle] ?? 'うりきれちゃった';

// ── ダイアログ（メニュー/カート共通） ──
function initDialogs() {
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.querySelectorAll('[data-close]').forEach((btn) =>
      btn.addEventListener('click', () => dialog.close()),
    );
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // 背景クリックで閉じる
    });
  });
  const menuBtn = document.getElementById('menu-btn');
  const menuDialog = document.getElementById('menu-dialog');
  if (menuBtn && menuDialog) {
    menuBtn.addEventListener('click', () => menuDialog.showModal());
    // メニュー内リンクは遷移前に閉じる
    menuDialog.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => menuDialog.close()),
    );
  }
}

// ── カート描画 ──
let lastCartAction = null; // { lineId, delta } — 再描画後のフォーカス復元用

function renderCart() {
  const c = cart.getCart();
  const items = document.getElementById('cart-items');
  if (!items) return;
  const empty = document.querySelector('.cart-empty');
  const meter = document.getElementById('shipping-meter');
  const totalWrap = document.getElementById('cart-total');
  const checkout = document.getElementById('btn-checkout');
  const lines = c?.lines?.nodes ?? [];

  // バッジ（ヘッダー＋スティッキー）
  const qty = c?.totalQuantity ?? 0;
  for (const id of ['cart-count', 'sticky-cart-count']) {
    const badge = document.getElementById(id);
    if (badge) {
      badge.textContent = String(qty);
      badge.hidden = qty === 0;
    }
  }

  // 明細
  items.innerHTML = '';
  for (const line of lines) {
    const row = document.createElement('div');
    row.className = 'cart-line';
    const img = document.createElement('img');
    img.src = line.merchandise.image?.url ?? '/assets/kosukuma/front.png';
    img.alt = line.merchandise.image?.altText ?? line.merchandise.product.title;
    img.width = 64; img.height = 64;
    const mid = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'ci-title';
    title.textContent = line.merchandise.product.title;
    const qtyWrap = document.createElement('p');
    qtyWrap.className = 'ci-qty';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.dataset.line = line.id; minus.dataset.delta = '-1';
    minus.setAttribute('aria-label', `${line.merchandise.product.title} をへらす`);
    const q = document.createElement('span');
    q.textContent = String(line.quantity);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '＋';
    plus.dataset.line = line.id; plus.dataset.delta = '1';
    plus.setAttribute('aria-label', `${line.merchandise.product.title} をふやす`);
    qtyWrap.append(minus, q, plus);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'ci-remove';
    remove.textContent = 'ぽいってする';
    remove.dataset.remove = ''; remove.dataset.line = line.id;
    mid.append(title, qtyWrap, remove);
    const price = document.createElement('p');
    price.className = 'ci-price';
    price.textContent = formatMoney(line.cost.totalAmount);
    row.append(img, mid, price);
    items.appendChild(row);
  }

  const isEmpty = lines.length === 0;
  if (empty) empty.hidden = !isEmpty;
  if (meter) meter.hidden = isEmpty;
  if (totalWrap) totalWrap.hidden = isEmpty;
  if (checkout) checkout.hidden = isEmpty;

  if (!isEmpty && c) {
    const subtotal = Number(c.cost.subtotalAmount.amount);
    const total = document.getElementById('cart-total-price');
    if (total) total.textContent = formatMoney(c.cost.subtotalAmount);
    const label = document.getElementById('shipping-meter-label');
    const bar = document.getElementById('shipping-meter-bar');
    const rest = Math.max(0, FREE_SHIPPING_THRESHOLD_JPY - subtotal);
    if (label) {
      label.textContent = rest > 0
        ? `あと${formatMoney({ amount: rest, currencyCode: 'JPY' })}で送料無料だよ`
        : '送料、タダになったよ。おめでとう。ぼくも嬉しいよ';
    }
    if (bar) bar.style.width = `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD_JPY) * 100)}%`;
  }

  // フォーカス復元（数量/削除操作で再描画されてもドロワー内で迷子にしない）
  const drawer = document.getElementById('cart-drawer');
  if (lastCartAction && drawer?.open) {
    const sel = lastCartAction.delta
      ? `button[data-line="${CSS.escape(lastCartAction.lineId)}"][data-delta="${lastCartAction.delta}"]`
      : null;
    const target = (sel && document.querySelector(sel)) || drawer.querySelector('[data-close]');
    target?.focus();
  }
}

// ── カート操作（全てShopify API経由。フロントで金額計算しない） ──
function initCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  const open = () => { renderCart(); drawer.showModal(); };
  document.getElementById('cart-toggle')?.addEventListener('click', open);
  document.getElementById('sticky-cart')?.addEventListener('click', open);

  const mutating = new Set(); // ライン単位の二重送信ガード

  document.getElementById('cart-items')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const lineId = btn.dataset.line;
    if (!lineId || mutating.has(lineId)) return; // 連打による二重送信ガード（stale数量のPUT防止）
    mutating.add(lineId);
    lastCartAction = { lineId, delta: btn.dataset.delta ?? null };
    try {
      if (btn.dataset.remove !== undefined) {
        await cart.removeLine(lineId);
        toast('ぽいってしたよ');
      } else if (btn.dataset.delta) {
        const line = cart.getCart()?.lines?.nodes?.find((l) => l.id === lineId);
        if (!line) return;
        const next = line.quantity + Number(btn.dataset.delta);
        const { requested, applied } = await cart.updateLineQuantity(lineId, next);
        if (applied < requested) toast('それは全部は用意できなかったよ。ある分だけにしといた');
      }
    } catch {
      toast('うまくいかなかったよ。もう一回ためしてみて');
    } finally {
      mutating.delete(lineId);
    }
  });

  document.getElementById('btn-checkout')?.addEventListener('click', () => {
    const url = cart.getCheckoutUrl();
    if (url) {
      window.location.href = url;
    } else {
      toast('レジの用意がまだみたい。もう一回ためしてみて');
    }
  });

  cart.onCartChange(() => renderCart());
}

// ── カゴ追加 ──
function initAddButtons() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn || btn.disabled) return;
    const variantId = btn.dataset.variantId;
    if (!variantId) {
      toast('もうちょっと待って。いま読み込み中だよ');
      return;
    }
    btn.disabled = true;
    try {
      const { requested, applied } = await cart.addLine(variantId, 1);
      toast(applied >= requested
        ? 'カートに入れたよ'
        : 'それは全部は用意できなかったよ。ある分だけ入れといた');
    } catch {
      toast('うまくいかなかったよ。もう一回ためしてみて');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── Shopify実データで表示を上書き（価格・在庫の真実はShopify） ──
async function hydrateProducts() {
  const products = await fetchProductsByHandles(PRODUCT_HANDLES);
  for (const p of products) {
    if (!p) continue;
    document.querySelectorAll(`[data-handle="${CSS.escape(p.handle)}"]`).forEach((el) => {
      const priceEl = el.querySelector('[data-price]');
      if (priceEl && p.price) priceEl.textContent = formatMoney(p.price);
      const btn = el.querySelector('[data-add-to-cart]');
      const chip = el.querySelector('.status-chip');
      const stamp = el.querySelector('[data-soldout-stamp]');
      const restock = el.querySelector('.restock-link');
      const note = el.querySelector('[data-stock-note]');
      if (chip) chip.hidden = false;
      if (p.availableForSale && p.variantId) {
        if (btn) { btn.disabled = false; btn.dataset.variantId = p.variantId; btn.textContent = 'カートに入れる'; }
        if (chip) { chip.textContent = 'あるよ'; chip.classList.add('is-instock'); }
        if (stamp) stamp.hidden = true;
        if (restock) restock.hidden = true;
      } else {
        if (btn) { btn.disabled = true; btn.textContent = 'うりきれ'; }
        if (chip) { chip.textContent = 'うりきれ'; chip.classList.add('is-soldout'); }
        if (stamp) { stamp.hidden = false; stamp.textContent = soldoutLabel(p.handle); }
        if (restock) restock.hidden = false;
        if (note) note.textContent = '戻ってきたら、ここで言うよ';
      }
    });
  }
}

// ── 最近チェックした商品（localStorage。商品ページで記録し、トップで表示） ──
const CHECKED_KEY = 'kosukuma-checked';
const CHECKED_META = {
  'こすくまくんステッカー': { name: 'こすくまくんステッカー', slug: 'sticker', img: '/assets/img/kosukuma-sticker-main-480.webp' },
  'tシャツ': { name: 'ウルトラプレミアムTシャツ', slug: 'ultra-tshirt', img: '/assets/img/kosukuma-ultra-tshirt-1-480.webp' },
  'こすくまデコヘルメット': { name: 'こすくまデコヘルメット', slug: 'deco-helmet', img: '/assets/img/kosukuma-deco-helmet-480.webp' },
};

function readChecked() {
  try { return JSON.parse(localStorage.getItem(CHECKED_KEY) ?? '[]'); } catch { return []; }
}

// 商品ページ（.product-detail[data-handle]）で閲覧を記録
function recordCheckedView() {
  const detail = document.querySelector('.product-detail[data-handle]');
  if (!detail) return;
  const handle = detail.dataset.handle;
  const list = [handle, ...readChecked().filter((h) => h !== handle)].slice(0, 8);
  try { localStorage.setItem(CHECKED_KEY, JSON.stringify(list)); } catch { /* 保存できなくても画面は止めない */ }
}

// トップ（#checked-grid）に描画。空ならセクションごと非表示のまま
function renderCheckedItems() {
  const section = document.getElementById('checked');
  const grid = document.getElementById('checked-grid');
  if (!section || !grid) return;
  const items = readChecked().filter((h) => CHECKED_META[h]);
  if (items.length === 0) return;
  for (const handle of items) {
    const meta = CHECKED_META[handle];
    const card = document.createElement('article');
    card.className = 'product-card';
    card.dataset.handle = handle;
    card.innerHTML = `
      <a class="product-media" href="/products/${meta.slug}.html">
        <img src="${meta.img}" alt="${meta.name}" loading="lazy">
        <span class="status-chip" hidden></span>
        <span data-soldout-stamp hidden></span>
      </a>
      <div class="product-body">
        <h3 class="product-name"><a href="/products/${meta.slug}.html">${meta.name}</a></h3>
        <p class="product-price"><span data-price></span><span class="tax">（税込）</span></p>
        <div class="card-actions">
          <a class="btn btn-ghost" href="/products/${meta.slug}.html">くわしく</a>
        </div>
      </div>`;
    grid.appendChild(card);
  }
  section.hidden = false;
}

// ── 商品詳細のサムネ切替（商品ページのみ存在） ──
function initThumbs() {
  const main = document.getElementById('detail-main');
  if (!main) return;
  document.querySelectorAll('.detail-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      main.src = thumb.dataset.full;
      document.querySelectorAll('.detail-thumb').forEach((t) => t.setAttribute('aria-selected', 'false'));
      thumb.setAttribute('aria-selected', 'true');
    });
  });
}

export async function initUI() {
  initDialogs();
  initCartDrawer();
  initAddButtons();
  initThumbs();
  recordCheckedView();
  renderCheckedItems();
  renderCart();
  await Promise.allSettled([
    cart.restoreCart().then(() => renderCart()),
    hydrateProducts(),
  ]);
}
