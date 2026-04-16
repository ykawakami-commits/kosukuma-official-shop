// shop-ui.js — 商品グリッド描画

// ===== 商品データ =====
// status: 'on-sale' | 'sold-out' | 'coming-soon'
const FALLBACK_PRODUCTS = [
  { id: 'sticker',  name: 'こすくまくんステッカー',        price: 780,        status: 'on-sale',     oneliner: 'どこにでも貼れる',  img: 'assets/kosukuma-sticker-new.jpg' },
  { id: 'tshirt',   name: 'こすくまくんTシャツ',           price: 3980,       status: 'on-sale',     oneliner: 'おそろいもいいね',  img: 'assets/kosukuma-tshirt.png' },
  { id: 'plush',    name: 'こすくまくんぬいぐるみ',        price: null,       status: 'sold-out',    oneliner: 'もふもふ',          img: 'assets/kosukuma-product.png' },
  { id: 'socks',    name: 'こすくまくん靴下',              price: null,       status: 'sold-out',    oneliner: 'あしにはくやつ',    img: 'assets/kosukuma-socks.png' },
  { id: 'yoyo',     name: 'こすくまくんヨーヨー',          price: null,       status: 'sold-out',    oneliner: 'あそべるやつ',      img: 'assets/kosukuma-product.png' },
  { id: 'notebook', name: 'こすくまくん自由帳',            price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'tote',     name: 'こすくまくんトートバッグ',      price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'pouch',    name: 'こすくまくんポーチ',            price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'jersey',   name: 'こすくまくん上下ジャージ',      price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'cushion',  name: 'こすくまくんブーブークッション', price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'elon',     name: 'イーロンマスク様専用',          price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'bousai',   name: '防災デコグッズ⭐️（一点もの）', price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
  { id: 'mu',       name: '無',                            price: null,       status: 'coming-soon', oneliner: '',                  img: 'assets/kosukuma-product.png' },
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
function formatPrice(price) {
  if (price === null || price === undefined) return '';
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
      priceHtml = `<p class="product-price">${formatPrice(p.price)}</p>`;
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
    if (local && local.status === 'on-sale') {
      local.price     = parseFloat(variant.price.amount ?? variant.price);
      local.variantId = String(variant.id);
    }
  }

  renderGrid();
  console.info('%c Shopify 商品データを反映', 'color: #7c9e6a');
}
