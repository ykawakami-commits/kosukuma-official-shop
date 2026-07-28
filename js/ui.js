// js/ui.js — 画面配線（ドロワー/トースト/hydration/サムネ切替）
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

  // バッジ（ヘッダー）
  const qty = c?.totalQuantity ?? 0;
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.textContent = String(qty);
    badge.hidden = qty === 0;
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
      const restock = el.querySelector('.restock-link');
      const note = el.querySelector('[data-stock-note]');
      if (chip) chip.hidden = false;
      if (p.availableForSale && p.variantId) {
        if (btn) { btn.disabled = false; btn.dataset.variantId = p.variantId; btn.textContent = 'カートに入れる'; }
        if (chip) { chip.textContent = 'あるよ'; chip.classList.add('is-instock'); }
        if (restock) restock.hidden = true;
      } else {
        // 状態表示は .status-chip（左上ピル）の1箇所のみ（DS §6-3 G7対策。スタンプ重複表示は全廃）
        if (btn) { btn.disabled = true; btn.textContent = 'うりきれ'; }
        if (chip) { chip.textContent = 'うりきれ'; chip.classList.add('is-soldout'); }
        if (restock) restock.hidden = false;
        if (note) note.textContent = '戻ってきたら、ここで言うよ';
      }
    });
  }
}

// ── 商品カード共通テンプレ（index.html #products の静的カードと同一構造） ──
// 最近チェック欄など JS 生成カードは必ずこれを使う（構造の単一情報源）。
// - カート導線: [data-add-to-cart] は initAddButtons の委譲が拾い、js/cart.js の addLine を呼ぶ
// - 価格/在庫: hydrateProducts が data-handle 一致で上書きする（フロントで金額計算しない）
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const RESTOCK_MAILTO = 'mailto:info@kosukuma.com?subject=%E5%86%8D%E5%85%A5%E8%8D%B7%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B';

// ── 折返し制御辞書（index.html #products の静的カードと同位置・同マークアップ） ──
// .product-name は keep-all のため、<wbr> が無いと商品名全体が1語として
// min-content 幅を押し広げ、402px 2カラムでカード中身ごと右端クリップされる。
// 文言（こすくまくんの声）は不変 — 折返し点の注入のみを行う。
// 辞書は「完全一致した既知の商品名/一言」にのみ信頼済み定数HTMLを返す。
// 一致しない文字列（外部データ由来）は必ず escapeHTML を通す（XSS防止は不変）。
const NAME_BREAK_HTML = {
  'ウルトラプレミアムTシャツ': 'ウルトラ<wbr>プレミアム<wbr>Tシャツ',
};
const ONELINER_SEG_HTML = {
  'はっても はがしても、ぼくはぼくだよ':
    '<span class="u-ib">はっても はがしても、</span><span class="u-ib">ぼくはぼくだよ</span>',
  '15万円。たかい？ ぼくもそう思うよ':
    '<span class="u-ib">15万円。たかい？</span> <span class="u-ib">ぼくもそう思うよ</span>',
  '頭はまもるよ。心はまもってくれないよ':
    '<span class="u-ib">頭はまもるよ。</span><span class="u-ib">心はまもってくれないよ</span>',
};

function productCardHTML({ url, name, img, oneliner = '' }) {
  const u = escapeHTML(url);
  const n = Object.hasOwn(NAME_BREAK_HTML, name) ? NAME_BREAK_HTML[name] : escapeHTML(name);
  const one = Object.hasOwn(ONELINER_SEG_HTML, oneliner) ? ONELINER_SEG_HTML[oneliner] : escapeHTML(oneliner);
  return `
      <a class="product-media" href="${u}">
        <img src="${escapeHTML(img)}" alt="${escapeHTML(name)}" loading="lazy">
        <span class="status-chip" hidden></span>
      </a>
      <div class="product-body">
        <h3 class="product-name"><a href="${u}">${n}</a></h3>
        <p class="product-oneliner">${one}</p>
        <p class="product-price"><span class="u-nw"><span data-price></span><span class="tax">（税込）</span></span></p>
        <p data-stock-note></p>
        <div class="card-actions">
          <button class="btn btn-primary" type="button" data-add-to-cart>カートに入れる</button>
          <a class="btn btn-ghost" href="${u}">くわしく</a>
        </div>
        <a class="restock-link" href="${RESTOCK_MAILTO}" hidden>再入荷のお知らせを<wbr>聞いてみる</a>
      </div>`;
}

// ── 最近チェックした商品（localStorage。商品ページで記録し、トップで表示） ──
// エントリ形式: { handle, name, url, img, oneliner } — 商品ページ側で採取して保存するため
// 固定辞書（旧CHECKED_META）は不要。商品を増やしても商品ページを作れば自動で履歴に出る。
const CHECKED_KEY = 'kosukuma-checked';

function readChecked() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKED_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    // 外部データ（localStorage）は信用しない: 形とパスを検証して通す。
    // 旧形式（handle文字列だけ）は表示メタが無いので読み捨て（次の閲覧で再記録される）
    return raw.filter((e) =>
      e && typeof e === 'object'
      && typeof e.handle === 'string' && e.handle.length > 0
      && typeof e.name === 'string' && e.name.length > 0
      && typeof e.url === 'string' && e.url.startsWith('/products/')
      && typeof e.img === 'string' && e.img.startsWith('/assets/'));
  } catch { return []; }
}

// 商品ページ（.product-detail[data-handle]）で閲覧を記録（表示に必要なメタごと保存）
function recordCheckedView() {
  const detail = document.querySelector('.product-detail[data-handle]');
  if (!detail) return;
  const handle = detail.dataset.handle;
  const entry = {
    handle,
    name: detail.querySelector('h1')?.textContent.trim() || handle,
    url: location.pathname,
    // サムネ1枚目が480px版（カード表示に十分な軽さ）。無ければメイン画像
    img: detail.querySelector('.detail-thumb img')?.getAttribute('src')
      ?? document.getElementById('detail-main')?.getAttribute('src')
      ?? '/assets/kosukuma/front.png',
    oneliner: detail.querySelector('.detail-oneliner')?.textContent.trim() ?? '',
  };
  const list = [entry, ...readChecked().filter((e) => e.handle !== handle)].slice(0, 8);
  try { localStorage.setItem(CHECKED_KEY, JSON.stringify(list)); } catch { /* 保存できなくても画面は止めない */ }
}

// トップと商品ページの #checked-grid に描画。空ならセクションごと非表示のまま
function renderCheckedItems() {
  const section = document.getElementById('checked');
  const grid = document.getElementById('checked-grid');
  if (!section || !grid) return;
  // 商品ページでは「いま見ている商品」は履歴に出さない（直前の recordCheckedView で先頭に入るため）
  const currentHandle = document.querySelector('.product-detail[data-handle]')?.dataset.handle ?? null;
  // config.js の方針（PRODUCT_HANDLES に無い handle は売り場に出さない）を履歴にも適用
  const items = readChecked().filter((e) => PRODUCT_HANDLES.includes(e.handle) && e.handle !== currentHandle);
  if (items.length === 0) return;
  for (const entry of items) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.dataset.handle = entry.handle; // hydrateProducts がこの data-handle 一致で価格・在庫・カートボタンを上書き
    card.innerHTML = productCardHTML(entry);
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
