// shop-ui.js — 商品グリッド、カート、チェックアウト導線

import { KumaAnim } from './kuma-anim.js';
import { IS_CONFIGURED, addToShopifyCart, getCheckoutUrl } from './shopify.js';

// ===== 商品データ =====
// status: 'on-sale' | 'sold-out' | 'coming-soon'
const FALLBACK_PRODUCTS = [
  // テスト商品ここから
  { id: 'test',     name: 'テスト商品',                    price: 1,          status: 'on-sale',     oneliner: 'てすとだよ',        img: 'assets/kosukuma-product.png' },
  // テスト商品ここまで
  { id: 'sticker',  name: 'こすくまくんステッカー',        price: 780,        status: 'on-sale',     oneliner: 'どこにでも貼れる',  img: 'assets/kosukuma-sticker-new.png' },
  { id: 'ultra-premium-tshirt', name: 'こすくまウルトラプレミアムTシャツ', price: 1000, status: 'on-sale', oneliner: 'いちばんいいやつ', img: 'assets/kosukuma-ultra-premium-tshirt.jpg', currency: 'USD', cartPrice: 150000 },
  { id: 'elon',     name: 'イーロンマスク様専用',          price: 4200000000, status: 'on-sale',     oneliner: 'いっしょにあそぼ',  img: 'assets/elon-special-new.png' },
  { id: 'tshirt',   name: 'こすくまくんTシャツ',           price: null,       status: 'coming-soon', oneliner: 'おそろいもいいね',  img: 'assets/kosukuma-tshirt.png' },
];

let PRODUCTS = FALLBACK_PRODUCTS;

// ===== プレースホルダー画像 =====
const PLACEHOLDER_COLORS = ['#fce4ec', '#e3f2fd', '#e8f5e9', '#fff8e1', '#fce8e6'];

function makePlaceholder(name) {
  const bg = PLACEHOLDER_COLORS[name.length % PLACEHOLDER_COLORS.length];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">`,
    `<rect width="200" height="200" rx="16" fill="${bg}"/>`,
    `<text x="100" y="108" text-anchor="middle" font-size="13" fill="#9c7a4a" font-family="sans-serif">${name}</text>`,
    `</svg>`,
  ].join('');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ===== Shopify 商品マッピング =====
function mapShopifyProduct(p) {
  const variant = p.variants[0];
  const price   = variant ? parseFloat(variant.price.amount) : null;
  return {
    id:        String(p.id),
    variantId: variant ? String(variant.id) : null,
    name:      p.title,
    price,
    status:    price !== null ? 'on-sale' : 'coming-soon',
    img:       p.images[0]?.src ?? null,
    oneliner:  p.description ?? '',
  };
}

// ===== 価格フォーマット =====
function formatPrice(price, currency) {
  if (price === null || price === undefined) return '';
  if (currency === 'USD') {
    return '$' + Number(price).toLocaleString() + '<span class="tax-label">(税込)</span>';
  }
  return '\u00a5' + Number(price).toLocaleString() + '<span class="tax-label">(税込)</span>';
}

// ===== カート =====
let cart = loadCart();
let popupTimer = null;
let popupAnim  = null;

function loadCart() {
  try { localStorage.removeItem('kosukuma-cart'); } catch { /* ignore */ }
  return [];
}

function saveCart() {
  try { localStorage.setItem('kosukuma-cart', JSON.stringify(cart)); } catch { /* ignore */ }
}

async function addToCart(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product || product.status !== 'on-sale') return;

  if (IS_CONFIGURED && product.variantId) {
    await addToShopifyCart(product.variantId);
  }

  const existing = cart.find(c => c.id === productId);
  if (existing) { existing.qty++; }
  else { cart.push({ id: productId, qty: 1 }); }
  updateCartUI();
  showCartPopup();
}

function removeFromCart(productId) {
  cart = cart.filter(c => c.id !== productId);
  updateCartUI();
}

function changeQty(productId, delta) {
  const item = cart.find(c => c.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(productId); return; }
  updateCartUI();
}

function updateCartUI() {
  const totalItems = cart.reduce((s, c) => s + c.qty, 0);

  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = totalItems;

  const stickyCount = document.getElementById('sticky-cart-count');
  const stickyBtn   = document.getElementById('sticky-cart');
  if (stickyCount) stickyCount.textContent = totalItems;
  if (stickyBtn) {
    stickyBtn.style.display = totalItems > 0 ? 'flex' : 'none';
    stickyBtn.classList.toggle('has-items', totalItems > 0);
  }

  const itemsContainer = document.getElementById('cart-items');
  const totalPrice     = document.getElementById('cart-total-price');
  if (!itemsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = '<div class="cart-empty">まだなにも入ってないよ</div>';
    if (totalPrice) totalPrice.textContent = '\u00a50';
    return;
  }

  let html = '';
  let sum  = 0;

  cart.forEach(c => {
    const p = PRODUCTS.find(prod => prod.id === c.id);
    if (!p) return;
    // USD商品はcartPrice(円換算)で合計に加算、表示はUSD
    const unitPrice = p.cartPrice ?? p.price ?? 0;
    const subtotal = unitPrice * c.qty;
    sum += subtotal;
    const displaySubtotal = p.currency === 'USD' ? (p.price ?? 0) * c.qty : subtotal;
    const img = p.img ?? makePlaceholder(p.name);
    html += `
      <div class="cart-item">
        <div class="cart-item-img"><img src="${img}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;"></div>
        <div class="cart-item-info">
          <p class="cart-item-name">${p.name}</p>
          <p class="cart-item-price">${formatPrice(displaySubtotal, p.currency)}</p>
        </div>
        <div class="cart-item-qty">
          <button data-id="${p.id}" data-delta="-1">\u2212</button>
          <span>${c.qty}</span>
          <button data-id="${p.id}" data-delta="1">\uff0b</button>
        </div>
      </div>`;
  });

  itemsContainer.innerHTML = html;
  if (totalPrice) totalPrice.innerHTML = formatPrice(sum);

  itemsContainer.querySelectorAll('.cart-item-qty button').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, parseInt(btn.dataset.delta, 10) || 0));
  });

  saveCart();
}

function showCartPopup() {
  const popup = document.getElementById('cart-popup');
  if (!popup) return;
  popup.classList.add('show');

  const animContainer = document.getElementById('popup-anim-container');
  if (animContainer && !popupAnim) {
    popupAnim = new KumaAnim(animContainer, 'osirihurihuri', {
      style: { width: '100%', height: '100%', objectFit: 'contain' },
    });
  }
  if (popupAnim) popupAnim.play();

  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => {
    popup.classList.remove('show');
    if (popupAnim) popupAnim.stop();
  }, 2500);
}

// ===== グリッド描画 =====
function renderGrid() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = '';

  PRODUCTS.forEach((p) => {
    const img = p.img ?? makePlaceholder(p.name);
    const card = document.createElement('div');
    card.className = 'product-card';

    // ---- 画像 ----
    let imgHtml;
    const imgStyle = p.img ? 'style="object-fit:cover;width:100%;height:100%;"' : '';
    if (p.status === 'sold-out') {
      imgHtml = `
        <div class="product-img is-sold-out">
          <img src="${img}" alt="${p.name}" loading="lazy" ${imgStyle}>
          <div class="sold-out-overlay"><span class="sold-out-label">SOLD OUT</span></div>
        </div>`;
    } else {
      imgHtml = `<div class="product-img"><img src="${img}" alt="${p.name}" loading="lazy" ${imgStyle}></div>`;
    }

    // ---- 価格 ----
    let priceHtml;
    if (p.status === 'on-sale' && p.price !== null) {
      priceHtml = `<p class="product-price">${formatPrice(p.price, p.currency)}</p>`;
    } else if (p.status === 'sold-out') {
      priceHtml = `<p class="product-price price-coming-soon">\u2014</p>`;
    } else {
      priceHtml = `<p class="product-price price-coming-soon">もうすこしまってね</p>`;
    }

    // ---- ボタン ----
    let btnHtml = '';
    if (p.status === 'on-sale') {
      btnHtml = `<button class="btn-cart" data-id="${p.id}">カゴに入れる</button>`;
    } else if (p.status === 'sold-out') {
      btnHtml = `<button class="btn-cart" disabled>SOLD OUT</button>`;
    } else {
      btnHtml = `<button class="btn-cart" disabled>もうすこしまってね</button>`;
    }

    card.innerHTML = `
      <button class="product-heart" aria-label="お気に入り">\u2661</button>
      ${imgHtml}
      <p class="product-name">${p.name}</p>
      ${p.oneliner ? `<p class="product-oneliner" >${p.oneliner}</p>` : ''}
      ${priceHtml}
      ${btnHtml}
    `;
    grid.appendChild(card);
  });
}

let gridListenersSetUp = false;
function setupGridListeners() {
  if (gridListenersSetUp) return;
  gridListenersSetUp = true;
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  // お気に入りトグル
  grid.addEventListener('click', (e) => {
    const heart = e.target.closest('.product-heart');
    if (!heart) return;
    heart.classList.toggle('liked');
    heart.textContent = heart.classList.contains('liked') ? '\u2665' : '\u2661';
  });

  // カゴに入れる
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-cart');
    if (!btn || btn.disabled) return;

    const id = btn.dataset.id;
    addToCart(id);

    // ボタンフィードバック
    const origText = btn.textContent;
    btn.textContent = 'いれたよ！';
    btn.classList.add('added');
    setTimeout(() => { btn.textContent = origText; btn.classList.remove('added'); }, 1000);

    // ヘッダーカートバウンス
    const headerCart = document.getElementById('cart-toggle');
    if (headerCart) {
      headerCart.classList.add('bounce');
      setTimeout(() => headerCart.classList.remove('bounce'), 300);
    }
  });
}

// ===== 外部公開 API =====

export function initProductGrid() {
  renderGrid();
  setupGridListeners();
  if (cart.length > 0) updateCartUI();
}

export function refreshProducts(shopifyProducts) {
  if (!shopifyProducts || shopifyProducts.length === 0) return;

  for (const sp of shopifyProducts) {
    const variant = sp.variants[0];
    if (!variant) continue;

    const local = PRODUCTS.find(p => sp.title.includes(p.name) || p.name.includes(sp.title));
    if (local && local.status === 'on-sale' && !local.currency) {
      local.price     = parseFloat(variant.price.amount ?? variant.price);
      local.variantId = String(variant.id);
    }
  }

  renderGrid();
  console.info('%c Shopify 商品データを反映', 'color: #7c9e6a');
}

export function initCartDrawer() {
  const toggle      = document.getElementById('cart-toggle');
  const overlay     = document.getElementById('cart-overlay');
  const drawer      = document.getElementById('cart-drawer');
  const closeBtn    = document.getElementById('cart-close');
  const checkoutBtn = document.getElementById('btn-checkout');

  const open  = () => { overlay?.classList.add('open');    drawer?.classList.add('open'); };
  const close = () => { overlay?.classList.remove('open'); drawer?.classList.remove('open'); };

  toggle?.addEventListener('click', open);
  overlay?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('open')) close();
  });

  checkoutBtn?.addEventListener('click', () => {
    if (cart.length === 0) return;

    if (IS_CONFIGURED) {
      const url = getCheckoutUrl();
      if (url) { window.location.href = url; return; }
      console.warn('Shopify チェックアウトURL未取得 — ローカルカートのみ');
    }
  });
}
