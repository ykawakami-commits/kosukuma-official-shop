// shop-ui.js — 商品グリッド描画

// ===== 商品データ =====
// status: 'on-sale' | 'sold-out' | 'coming-soon'
const FALLBACK_PRODUCTS = [
  // テスト商品ここから
  { id: 'test',     name: 'テスト商品',                    price: 1,          status: 'on-sale',     oneliner: 'てすとだよ',        img: 'assets/kosukuma-product.png' },
  // テスト商品ここまで
  { id: 'sticker',  name: 'こすくまくんステッカー',        price: 780,        status: 'on-sale',     oneliner: 'どこにでも貼れる',  img: 'assets/kosukuma-sticker-new.jpg' },
  { id: 'ultra-premium-tshirt', name: 'こすくまウルトラプレミアムTシャツ', price: 1000, status: 'on-sale', oneliner: 'いちばんいいやつ', img: 'assets/kosukuma-ultra-premium-tshirt.jpg', currency: 'USD' },
  { id: 'elon',     name: 'イーロンマスク様専用',          price: 4200000000, status: 'on-sale',     oneliner: 'いっしょにあそぼ',  img: 'assets/elon-special.png' },
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

// ===== 価格フォーマット =====
function formatPrice(price, currency) {
  if (price === null || price === undefined) return '';
  if (currency === 'USD') {
    return '$' + Number(price).toLocaleString() + '<span class="tax-label">(税込)</span>';
  }
  return '\u00a5' + Number(price).toLocaleString() + '<span class="tax-label">(税込)</span>';
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
    if (p.status === 'sold-out') {
      btnHtml = `<button class="btn-cart" disabled>SOLD OUT</button>`;
    } else if (p.status === 'coming-soon') {
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

function setupGridListeners() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  // お気に入りトグル
  grid.addEventListener('click', (e) => {
    const heart = e.target.closest('.product-heart');
    if (!heart) return;
    heart.classList.toggle('liked');
    heart.textContent = heart.classList.contains('liked') ? '\u2665' : '\u2661';
  });
}

// ===== 外部公開 API =====

export function initProductGrid() {
  renderGrid();
  setupGridListeners();
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
