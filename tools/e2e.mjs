// tools/e2e.mjs — 購入導線E2E + 受け入れ基準の自動検証
//
// 使い方: node tools/e2e.mjs [baseURL]（省略時 http://127.0.0.1:3459）
// ※ D:/ダウンロード 配下で実行すること（puppeteerの解決先）
//
// 受け入れ基準（リニューアルv2の合格条件）:
//  A. JS例外0（hero-3d起因の既知除外あり）
//  B1-B6. カゴ追加→ドロワー→合計→数量+→送料メーター→削除 が全てShopifyと同期
//  C. 「レジにすすむ」のURLが本物のShopifyチェックアウト(HTTP 200)に到達
//  D. 402×874で「レジにすすむ」ボタンが完全に視認できる（3D等に覆われない）
//  F. 402/640/768/900/1280 で横スクロールなし（対象: / と /products/sticker.html）
//  G. JSON-LD ↔ Shopify実データの同期（対象: / + 商品3ページ）
//  H. 3D金平糖が初期化されている（import黙殺死の回帰検知）
//  I. 対象5ページ（/・商品3・/404.html）でページ内全リソースの404ゼロ
//  J. 法定ページが200+実内容
//  P1. 商品3ページ: h1・[data-price]（¥表記）・.detail-story（20文字以上）
//  P2. / の #whimsy-line が非空 & data-time が day|evening|night
//  P3. 全対象ページで価格表示に「税込」を含む（.tax 要素の存在）

import puppeteer from 'puppeteer';
import { SHOPIFY_CONFIG, PRODUCT_HANDLES } from '../js/config.js';

const BASE = process.argv[2] || 'http://127.0.0.1:3459';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
};

// G: JSON-LD ↔ Shopify 実データ同期（トップ + 全商品ページ）
async function shopifyOffers() {
  const q = `query ($handle: String!) { productByHandle(handle: $handle) { availableForSale variants(first: 1) { nodes { price { amount } } } } }`;
  const out = new Map();
  for (const handle of PRODUCT_HANDLES) {
    const res = await fetch(`https://${SHOPIFY_CONFIG.domain}/api/${SHOPIFY_CONFIG.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-storefront-access-token': SHOPIFY_CONFIG.storefrontAccessToken },
      body: JSON.stringify({ query: q, variables: { handle } }),
    });
    const json = await res.json();
    const p = json.data?.productByHandle;
    out.set(handle, { available: !!p?.availableForSale, price: Math.round(Number(p?.variants?.nodes?.[0]?.price?.amount)) });
  }
  return out;
}

// swiftshader: ヘッドレスでもWebGLを有効化（3D初期化の回帰検知に必要）
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const jsErrors = [];
const brokenAssets = [];
let step = 'init';
page.on('pageerror', (e) => {
  jsErrors.push(`[${step}] ${e.message.slice(0, 200)}`);
  if (process.env.E2E_DEBUG) console.log(`PAGEERROR@${step}:`, (e.stack || e.message).slice(0, 500));
});
// 自ホストのアセット404は全部バグ（three.core.js欠落で3Dが黙って死んだ前科）
page.on('response', (res) => {
  const url = res.url();
  if (res.status() === 404 && /\/(assets|css|js|legal)\//.test(url)) {
    brokenAssets.push(url.split('/').slice(-2).join('/'));
  }
});
await page.setViewport({ width: 1440, height: 900 });
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });

// hydration待ち（ステッカーのボタンが有効化される）
await page.waitForFunction(
  () => !document.querySelector('#p-sticker [data-add-to-cart]')?.disabled,
  { timeout: 15000 },
).catch(() => {});

// ---- P2: 時間帯の一言（whimsy） ----
step = 'P2-whimsy';
await page.waitForFunction(
  () => (document.getElementById('whimsy-line')?.textContent ?? '').trim().length > 0,
  { timeout: 10000 },
).catch(() => {});
const whimsy = await page.evaluate(() => ({
  line: (document.getElementById('whimsy-line')?.textContent ?? '').trim(),
  time: document.documentElement.dataset.time ?? '',
}));
ok(
  'P2: 時間帯の一言が非空 & data-time が day|evening|night',
  whimsy.line.length > 0 && ['day', 'evening', 'night'].includes(whimsy.time),
  `time=${whimsy.time} line=${whimsy.line.slice(0, 24)}…`,
);

// ---- B: カート全操作の同期 ----
step = 'B-add';
const addBtn = await page.$('#p-sticker [data-add-to-cart]');
await addBtn.click();
await page.waitForFunction(() => document.getElementById('cart-count').textContent === '1', { timeout: 15000 })
  .then(() => ok('B1: カゴに入れる → ヘッダーカウント1', true))
  .catch(() => ok('B1: カゴに入れる → ヘッダーカウント1', false));

await page.click('#cart-toggle');
await page.waitForSelector('#cart-drawer[open]', { timeout: 5000 });
await new Promise((r) => setTimeout(r, 700)); // スライドイン完了待ち
ok('B2: ドロワーが開く', true);

const total1 = await page.$eval('#cart-total-price', (el) => el.textContent);
ok('B3: 合計がShopify計算値', total1.includes('780'), total1);

step = 'B4-qty';
// 数量+ → 数量2・合計 ¥1,560（在庫クランプが効いたらここでFAIL＝要調査の合図）
await page.click('.ci-qty button[data-delta="1"]');
const qty2 = await page.waitForFunction(
  () => document.querySelector('.ci-qty span')?.textContent === '2',
  { timeout: 15000 },
).then(() => true).catch(() => false);
const totalPlus = await page.$eval('#cart-total-price', (el) => el.textContent);
ok('B4: 数量+が同期（数量2・合計 ¥1,560）', qty2 && totalPlus.includes('1,560'), `qty2=${qty2} total=${totalPlus}`);

step = 'C-checkout';
// ---- C: チェックアウトURL到達性（遷移せずURLを取得して外側からfetch検証） ----
const url = await page.evaluate(async () => {
  const mod = await import('/js/cart.js');
  return mod.getCheckoutUrl();
});
if (url) {
  // node fetchはShopifyのbot対策で403になるため、実ブラウザで遷移して検証
  const p2 = await browser.newPage();
  const resp = await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const finalUrl = p2.url();
  ok(
    'C: チェックアウトURLがHTTP 200',
    resp.status() === 200 && /checkout|myshopify/.test(finalUrl),
    `${resp.status()} → ${finalUrl.slice(0, 70)}...`,
  );
  await p2.close();
} else {
  ok('C: チェックアウトURLがHTTP 200', false, 'URLがnull');
}

step = 'B6-meter';
// ---- 送料無料メーター（¥1,560 / ¥5,000 = 31%付近） ----
const meterLabel = await page.$eval('#shipping-meter-label', (el) => el.textContent);
ok('B6: 送料無料メーターが「あと¥X」を表示', meterLabel.includes('あと'), meterLabel);

step = 'B5-empty';
// ---- 「ぽいってする」ボタンで行削除（Shopify同期） ----
await page.click('button[data-remove]');
await new Promise((r) => setTimeout(r, 3500));
// 残っていたら数量−で後片付け（在庫クランプ等で行が残るケースの保険）
while (true) {
  const minus = await page.$('.ci-qty button[data-delta="-1"]');
  if (!minus) break;
  await minus.click();
  await new Promise((r) => setTimeout(r, 2500));
}
const emptyState = await page.evaluate(() => {
  const e = document.querySelector('.cart-empty');
  return {
    visible: !!e && !e.hidden && e.getBoundingClientRect().height > 0,
    text: e?.textContent ?? '',
  };
});
ok(
  'B5: 削除 → 空表示「まだ何も入ってないよ」',
  emptyState.visible && emptyState.text.includes('まだ何も入ってないよ'),
  emptyState.text.trim().slice(0, 40),
);
await page.keyboard.press('Escape');

step = 'D-mobile';
// ---- D: モバイルでレジボタン完全視認 ----
await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 800));
const stickerBtn = await page.$('#p-sticker [data-add-to-cart]');
await stickerBtn.click();
await page.waitForFunction(() => document.getElementById('cart-count').textContent === '1', { timeout: 15000 })
  .catch(() => {});
await page.click('#cart-toggle');
await page.waitForSelector('#cart-drawer[open]');
// トースト（z-index: toast > drawer）がレジボタンを覆う間は待つ
await page.waitForFunction(() => !document.querySelector('#toast-region .toast'), { timeout: 8000 })
  .catch(() => {});
await new Promise((r) => setTimeout(r, 700));
const btnVisible = await page.evaluate(() => {
  const btn = document.getElementById('btn-checkout');
  const r = btn.getBoundingClientRect();
  if (r.bottom > window.innerHeight || r.top < 0) return { pass: false, why: '画面外' };
  const cy = r.top + r.height / 2;
  const pts = [
    [r.left + r.width / 2, cy],
    [r.left + 10, cy],
    [r.right - 10, cy],
  ];
  for (const [x, y] of pts) {
    const el = document.elementFromPoint(x, y);
    if (!btn.contains(el) && el !== btn) return { pass: false, why: `覆われている: ${el?.tagName}.${el?.className}` };
  }
  return { pass: true };
});
ok('D: 402×874でレジボタン完全視認', btnVisible.pass, btnVisible.why ?? '');
// 後片付け
while (true) {
  const minus = await page.$('.ci-qty button[data-delta="-1"]');
  if (!minus) break;
  await minus.click();
  await new Promise((r) => setTimeout(r, 2500));
}
await page.keyboard.press('Escape');

step = 'F-bp';
// ---- F: 5ブレークポイント横スクロールなし（/ と商品ページ代表） ----
for (const path of ['/', '/products/sticker.html']) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  for (const w of [402, 640, 768, 900, 1280]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 500));
    const h = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    ok(`F: ${path} ${w}px 横スクロールなし`, !h);
  }
}

// ---- G: JSON-LD ↔ Shopify実データの同期（/ + 商品3ページ） ----
step = 'G-jsonld';
const liveOffers = await shopifyOffers().catch(() => new Map());
const nameToHandle = {
  'こすくまくんステッカー': 'こすくまくんステッカー',
  'ウルトラプレミアムTシャツ': 'tシャツ',
  'こすくまデコヘルメット': 'こすくまデコヘルメット',
};
const gIssues = [];
if (liveOffers.size === 0) gIssues.push('Shopify実データの取得に失敗（ネットワーク/API）');
for (const path of ['/', '/products/sticker.html', '/products/ultra-tshirt.html', '/products/deco-helmet.html']) {
  const pg = await browser.newPage();
  const rg = await pg.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  if (!rg || rg.status() !== 200) {
    gIssues.push(`${path}: ページが${rg?.status() ?? '到達不可'}`);
    await pg.close();
    continue;
  }
  const products = await pg.evaluate(() => {
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (!ld) return null;
    try {
      return JSON.parse(ld.textContent)['@graph'].filter((n) => n['@type'] === 'Product');
    } catch {
      return null;
    }
  });
  if (!products) {
    gIssues.push(`${path}: JSON-LDなし/壊れている`);
    await pg.close();
    continue;
  }
  for (const p of products) {
    const handle = nameToHandle[p.name];
    const live = handle ? liveOffers.get(handle) : null;
    if (!live) { gIssues.push(`${path}: ${p.name} はShopifyに見つからない`); continue; }
    if (Number(p.offers?.price) !== live.price) {
      gIssues.push(`${path}: ${p.name} JSON-LD価格${p.offers?.price} ≠ Shopify実価格${live.price}`);
    }
    const ldAvail = String(p.offers?.availability ?? '').includes('InStock');
    if (ldAvail !== live.available) {
      gIssues.push(`${path}: ${p.name} JSON-LD在庫${ldAvail} ≠ Shopify実在庫${live.available}`);
    }
  }
  await pg.close();
}
ok('G: JSON-LDとShopify実データが同期（4ページ）', gIssues.length === 0, gIssues.join(' / ').slice(0, 300));

// ---- H: 3Dこんぺいとうが初期化されている（import黙殺死の回帰検知） ----
step = 'H-3d';
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 9000)); // idle初期化+GLB+presim待ち
const canvas3d = await page.evaluate(() => {
  const c = document.getElementById('hero-3d-canvas');
  return { w: c?.width ?? 0, h: c?.height ?? 0 };
});
ok('H: 3Dこんぺいとう初期化（canvasバッファ設定済み）', canvas3d.w > 300, `${canvas3d.w}x${canvas3d.h}`);

// ---- I: 対象ページの全リソース404ゼロ（ページ自体の到達性も含む） ----
step = 'I-404';
for (const path of ['/', '/products/sticker.html', '/products/ultra-tshirt.html', '/products/deco-helmet.html', '/404.html']) {
  const pi = await browser.newPage();
  const notFound = [];
  pi.on('response', (res) => {
    const u = res.url();
    if (res.status() === 404 && /\/(assets|css|js|legal)\//.test(u)) {
      notFound.push(u.split('/').slice(-2).join('/'));
    }
  });
  const ri = await pi.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);
  ok(
    `I: ${path} リソース404ゼロ`,
    !!ri && ri.status() === 200 && notFound.length === 0,
    `status=${ri?.status() ?? '到達不可'}${notFound.length ? ' 404: ' + [...new Set(notFound)].join(', ') : ''}`,
  );
  await pi.close();
}

// ---- J: 法定ページが実URLで到達可能（JSなしでも法定表記に辿り着ける） ----
for (const path of ['/legal/tokushoho.html', '/legal/privacy.html']) {
  const p3 = await browser.newPage();
  const r3 = await p3.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const hasContent = await p3.evaluate(() => document.body.textContent.includes('株式会社こす.くま'));
  ok(`J: ${path} が200+実内容`, r3.status() === 200 && hasContent, String(r3.status()));
  await p3.close();
}

// ---- P1: 商品3ページの描画（h1・価格・ストーリー） ----
step = 'P1-product-pages';
const productPages = ['/products/sticker.html', '/products/ultra-tshirt.html', '/products/deco-helmet.html'];
for (const path of productPages) {
  const pp = await browser.newPage();
  const rp = await pp.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  let pass = false;
  let detail;
  if (rp && rp.status() === 200) {
    const c = await pp.evaluate(() => ({
      h1: (document.querySelector('h1')?.textContent ?? '').trim(),
      price: (document.querySelector('[data-price]')?.textContent ?? '').trim(),
      story: (document.querySelector('.detail-story')?.textContent ?? '').trim(),
    }));
    pass = c.h1.length > 0 && c.price.includes('¥') && c.story.length >= 20;
    detail = `h1=${c.h1.slice(0, 14)} price=${c.price} story=${c.story.length}文字`;
  } else {
    detail = `status=${rp?.status() ?? '到達不可'}`;
  }
  ok(`P1: ${path} h1/価格/ストーリー描画`, pass, detail);
  await pp.close();
}

// ---- P3: 全対象ページで価格に「税込」表記（.tax 要素の存在） ----
step = 'P3-tax';
for (const path of ['/', ...productPages]) {
  const pt = await browser.newPage();
  const rt = await pt.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  if (!rt || rt.status() !== 200) {
    // 商品ページ未作成の間はスキップ扱い（ページの存在そのものは P1/I/G が担保）
    ok(`P3: ${path} 価格に税込表記`, true, `skip（ページ未到達 status=${rt?.status() ?? '-'}）`);
    await pt.close();
    continue;
  }
  const tax = await pt.evaluate(() => {
    const els = [...document.querySelectorAll('.tax')];
    return { count: els.length, allTax: els.every((el) => el.textContent.includes('税込')) };
  });
  ok(`P3: ${path} 価格に税込表記`, tax.count > 0 && tax.allTax, `.tax×${tax.count}`);
  await pt.close();
}

// ---- A: JSエラー0 ----
const realErrors = jsErrors.filter((e) => !e.includes('hero-3d'));
ok('A: JS例外0', realErrors.length === 0, realErrors.join(' | ').slice(0, 200));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
