/**
 * こすくまくんのおみせ — shop.js
 *
 * ══════════════════════════════════════════════════════════════
 *  SHOPIFY STOREFRONT API 連携ガイド
 * ══════════════════════════════════════════════════════════════
 *  現在は PRODUCTS 配列から商品データを読み込んでいます。
 *  Shopify と繋ぐ際は fetchProducts() を実装して差し替えてください。
 *
 *  ── GraphQL サンプル ──────────────────────────────────────────
 *
 *  const SHOPIFY_DOMAIN = 'your-store.myshopify.com';
 *  const STOREFRONT_TOKEN = 'xxxxxxxxxxxxxxxx';
 *
 *  async function fetchProducts() {
 *    const query = `{
 *      products(first: 10) {
 *        edges {
 *          node {
 *            id
 *            title
 *            description
 *            featuredImage { url altText }
 *            variants(first: 1) {
 *              edges {
 *                node {
 *                  id
 *                  price { amount currencyCode }
 *                  availableForSale
 *                }
 *              }
 *            }
 *          }
 *        }
 *      }
 *    }`;
 *
 *    const res = await fetch(
 *      `https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`,
 *      {
 *        method: 'POST',
 *        headers: {
 *          'Content-Type': 'application/json',
 *          'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
 *        },
 *        body: JSON.stringify({ query }),
 *      }
 *    );
 *    const { data } = await res.json();
 *
 *    return data.products.edges.map(({ node }) => ({
 *      id:        node.id,
 *      variantId: node.variants.edges[0].node.id,
 *      name:      node.title,
 *      desc:      node.description,
 *      price:     parseFloat(node.variants.edges[0].node.price.amount),
 *      available: node.variants.edges[0].node.availableForSale,
 *      imageUrl:  node.featuredImage?.url ?? null,
 *      imageAlt:  node.featuredImage?.altText ?? node.title,
 *      badge:     null,   // Shopify タグで制御するなら node.tags を参照
 *    }));
 *  }
 *
 *  ── Checkout ─────────────────────────────────────────────────
 *
 *  async function createCheckout() {
 *    const mutation = `
 *      mutation {
 *        checkoutCreate(input: {
 *          lineItems: [${cart.map(i =>
 *            `{ variantId: "${i.product.variantId}", quantity: ${i.qty} }`
 *          ).join(',')}]
 *        }) {
 *          checkout { webUrl }
 *          checkoutUserErrors { message }
 *        }
 *      }
 *    `;
 *    const res = await fetch(...); // 上と同じエンドポイント
 *    const { data } = await res.json();
 *    window.location.href = data.checkoutCreate.checkout.webUrl;
 *  }
 *
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

/* ════════════════════════════════════════════════════════════
   アセットベースURL
   ════════════════════════════════════════════════════════════ */
const ASSET_BASE = 'https://kosukuma-official-shop.pages.dev/assets';

/* ════════════════════════════════════════════════════════════
   商品データ  ← Shopify 連携時は fetchProducts() に差し替える
   ════════════════════════════════════════════════════════════ */
const PRODUCTS = [
  {
    id:        'kosukuma-plush',
    variantId: 'kosukuma-plush-v1',
    name:      'こすくまくんぬいぐるみ',
    desc:      'もちもちで抱きしめたくなる、こすくまくんのぬいぐるみだよ🐾',
    price:     null,            // TBD — Shopify 連携後に数値で設定
    available: true,
    imageUrl:  `${ASSET_BASE}/kosukuma/front.png`,
    imageAlt:  'こすくまくんぬいぐるみ',
    badge:     'best',          // 'best' | 'new' | 'sold' | null
  },
  {
    id:        'kosukuma-socks',
    variantId: 'kosukuma-socks-v1',
    name:      'こすくまくん靴下',
    desc:      'こすくまくんの顔がプリントされたかわいい靴下だよ👣',
    price:     null,
    available: true,
    imageUrl:  `${ASSET_BASE}/dot-illust/animal_kuma_higuma.png`,
    imageAlt:  'こすくまくん靴下',
    badge:     'new',
  },
  {
    id:        'kosukuma-yoyo',
    variantId: 'kosukuma-yoyo-v1',
    name:      'こすくまくんヨーヨー',
    desc:      'くるくると回るよ！遊べるこすくまくんグッズだよ🪀',
    price:     null,
    available: true,
    imageUrl:  `${ASSET_BASE}/dot-illust/mark_fukidashi_exclamation_yellow.png`,
    imageAlt:  'こすくまくんヨーヨー',
    badge:     null,
  },
  {
    id:        'kosukuma-sticker',
    variantId: 'kosukuma-sticker-v1',
    name:      'こすくまくんステッカー',
    desc:      'どこにでも貼れる！いろんな表情のこすくまくんが揃ってるよ✨',
    price:     null,
    available: true,
    imageUrl:  `${ASSET_BASE}/dot-illust/effect_kirakira_01_yellow.png`,
    imageAlt:  'こすくまくんステッカー',
    badge:     null,
  },
  {
    id:        'kosukuma-tshirt',
    variantId: 'kosukuma-tshirt-v1',
    name:      'こすくまくんTシャツ',
    desc:      '着るだけでこすくまくんになれる！？シンプルでかわいいTシャツだよ👕',
    price:     null,
    available: true,
    imageUrl:  `${ASSET_BASE}/dot-illust/food_hachimitsu_01.png`,
    imageAlt:  'こすくまくんTシャツ',
    badge:     'new',
  },
];

/* ════════════════════════════════════════════════════════════
   Cart state
   ════════════════════════════════════════════════════════════ */
let cart = []; // { product, qty }[]

const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => cart.reduce((s, i) => s + (i.product.price ?? 0) * i.qty, 0);

/* ════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════ */
function formatPrice(price) {
  if (price === null || price === undefined) {
    return '<span class="tbd">価格未定 (TBD)</span>';
  }
  return `¥${price.toLocaleString('ja-JP')}`;
}

function productThumbHTML(product, size = 'full') {
  if (product.imageUrl) {
    return `<img class="pixel-art" src="${product.imageUrl}" alt="${product.imageAlt}" loading="lazy" />`;
  }
  return `<span class="product-img-fallback" aria-label="${product.name}">🐻</span>`;
}

/* ════════════════════════════════════════════════════════════
   Render product grid
   ════════════════════════════════════════════════════════════ */
function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  grid.innerHTML = products.map(p => {
    const badgeHTML = p.badge
      ? `<span class="product-badge badge-${p.badge}">${
          p.badge === 'best' ? 'BEST' : p.badge === 'new' ? 'NEW' : 'SOLD OUT'
        }</span>`
      : '';

    const soldOut  = !p.available;
    const btnLabel = soldOut ? '在庫なし' : 'カートに入れる';

    return `
      <article class="product-card" data-id="${p.id}">
        <div class="product-img">
          ${productThumbHTML(p)}
          ${badgeHTML}
          <button class="product-heart" data-id="${p.id}" aria-label="${p.name}をお気に入りに追加" aria-pressed="false">🤍</button>
        </div>
        <div class="product-body">
          <h3 class="product-name">${p.name}</h3>
          <p class="product-oneliner">${p.desc}</p>
          <p class="product-price">${formatPrice(p.price)}</p>
        </div>
        <button class="btn-cart" data-id="${p.id}" ${soldOut ? 'disabled' : ''} aria-label="${p.name}をカートに入れる">
          ${btnLabel}
        </button>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.btn-cart:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => handleAddToCart(btn.dataset.id));
  });
  grid.querySelectorAll('.product-heart').forEach(btn => {
    btn.addEventListener('click', () => toggleHeart(btn));
  });
}

/* ════════════════════════════════════════════════════════════
   Wishlist
   ════════════════════════════════════════════════════════════ */
function toggleHeart(btn) {
  const on = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', String(!on));
  btn.classList.toggle('active', !on);
  btn.textContent = on ? '🤍' : '❤️';
}

/* ════════════════════════════════════════════════════════════
   Cart operations
   ════════════════════════════════════════════════════════════ */
function handleAddToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product || !product.available) return;

  const existing = cart.find(i => i.product.id === id);
  existing ? existing.qty++ : cart.push({ product, qty: 1 });

  updateCartUI();
  openCart();
  animateCartBtn();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.product.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.product.id !== id);
  updateCartUI();
}

/* ════════════════════════════════════════════════════════════
   Cart UI
   ════════════════════════════════════════════════════════════ */
function updateCartUI() {
  const countEl  = document.getElementById('cart-count');
  const itemsEl  = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  const totalEl  = document.getElementById('cart-total-price');

  const count = cartCount();
  if (countEl) countEl.textContent = count;

  if (cart.length === 0) {
    itemsEl.innerHTML = '<p class="cart-empty">カートに商品がありません</p>';
    footerEl.setAttribute('hidden', '');
    return;
  }

  footerEl.removeAttribute('hidden');

  const allPriced = cart.every(i => i.product.price !== null);
  totalEl.textContent = allPriced
    ? `¥${cartTotal().toLocaleString('ja-JP')}`
    : '価格未定';

  itemsEl.innerHTML = cart.map(({ product: p, qty }) => `
    <div class="cart-item" data-id="${p.id}">
      <div class="cart-item-thumb">
        ${p.imageUrl
          ? `<img class="pixel-art" src="${p.imageUrl}" alt="${p.imageAlt}" />`
          : `<span class="cart-item-thumb-fallback">🐻</span>`
        }
      </div>
      <div class="cart-item-info">
        <p class="cart-item-name">${p.name}</p>
        <p class="cart-item-price">${formatPrice(p.price)}</p>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec" data-id="${p.id}" aria-label="1個減らす">−</button>
        <span class="qty-num">${qty}</span>
        <button class="qty-btn" data-action="inc" data-id="${p.id}" aria-label="1個増やす">+</button>
      </div>
    </div>
  `).join('');

  itemsEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1));
  });
}

/* ════════════════════════════════════════════════════════════
   Drawer open / close
   ════════════════════════════════════════════════════════════ */
function openCart() {
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function animateCartBtn() {
  const btn = document.getElementById('cart-btn');
  btn.classList.remove('bounce');
  void btn.offsetWidth;
  btn.classList.add('bounce');
}

/* ════════════════════════════════════════════════════════════
   Checkout
   ────────────────────────────────────────────────────────────
   Shopify 連携後は checkoutCreate mutation を呼んで
   checkout.webUrl へリダイレクト（上のコメントを参照）
   ════════════════════════════════════════════════════════════ */
function handleCheckout() {
  alert('🐻 チェックアウト機能は近日公開予定だよ！\nShopify 連携後に使えるようになるよ。');
}

/* ════════════════════════════════════════════════════════════
   Cursor sparkle エフェクト（元サイト準拠）
   ════════════════════════════════════════════════════════════ */
const SPARKLE_CHARS  = ['✦', '✧', '⭑', '♦', '❋', '✴', '·'];
const SPARKLE_COLORS = ['#d4a020','#e8a030','#c07818','#f0c040','#b64b32','#e06030','#9c7a4a'];
const SPARKLE_POOL_SIZE = 60;
let   sparklePool = [];
let   sparkleIdx  = 0;

function initSparklePool() {
  const container = document.getElementById('sparkle-container');
  if (!container) return;
  for (let i = 0; i < SPARKLE_POOL_SIZE; i++) {
    const el = document.createElement('span');
    el.className = 'sparkle';
    el.style.display = 'none';
    container.appendChild(el);
    sparklePool.push(el);
  }
}

function spawnSparkle(x, y) {
  const el = sparklePool[sparkleIdx % SPARKLE_POOL_SIZE];
  sparkleIdx++;

  const char  = SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)];
  const color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)];
  const size  = 10 + Math.random() * 10;
  const ox    = (Math.random() - 0.5) * 20;
  const oy    = (Math.random() - 0.5) * 20;
  const dur   = 600 + Math.random() * 500;

  el.textContent = char;
  el.style.cssText = `
    display: block;
    left: ${x + ox}px;
    top:  ${y + oy}px;
    font-size: ${size}px;
    color: ${color};
    animation: sparkleFade ${dur}ms ease-out forwards;
  `;

  // アニメーション終了後に非表示
  el.addEventListener('animationend', () => { el.style.display = 'none'; }, { once: true });
}

let lastSparkle = 0;
function handleMouseMove(e) {
  const now = Date.now();
  if (now - lastSparkle < 40) return; // 40ms スロットル
  lastSparkle = now;
  spawnSparkle(e.clientX, e.clientY);
}

/* ════════════════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════════════════ */
function init() {
  // 商品レンダリング（Shopify 連携後は fetchProducts().then(renderProducts) に変更）
  renderProducts(PRODUCTS);

  // カートイベント
  document.getElementById('cart-btn').addEventListener('click', openCart);
  document.getElementById('cart-close').addEventListener('click', closeCart);
  document.getElementById('cart-overlay').addEventListener('click', closeCart);
  document.getElementById('checkout-btn').addEventListener('click', handleCheckout);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

  // カーソルスパークル
  initSparklePool();
  document.addEventListener('mousemove', handleMouseMove);

  // 初期UI
  updateCartUI();
}

document.addEventListener('DOMContentLoaded', init);
