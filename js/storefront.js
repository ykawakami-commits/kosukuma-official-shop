// storefront.js — Shopify Storefront GraphQL API の薄いクライアント
//
// Buy Button SDK（非推奨・サポート終了済み）の代替。依存ゼロのfetch直叩き。
// - APIバージョンは config で固定
// - GraphQLエラー/HTTPエラー/タイムアウトを StorefrontError に正規化
// - 呼び出し側（cart.js / product hydration）はエラーを握りつぶさず
//   ユーザーに見える形（トースト）で伝えること

import { SHOPIFY_CONFIG } from './config.js';

const ENDPOINT = `https://${SHOPIFY_CONFIG.domain}/api/${SHOPIFY_CONFIG.apiVersion}/graphql.json`;
const TIMEOUT_MS = 12000;

export class StorefrontError extends Error {
  constructor(message, { kind = 'unknown', detail = null } = {}) {
    super(message);
    this.name = 'StorefrontError';
    this.kind = kind; // 'network' | 'timeout' | 'http' | 'graphql' | 'userError'
    this.detail = detail;
  }
}

export async function gql(query, variables = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let json;
  try {
    // res.json()（ボディ読込）もタイムアウトの傘の下に置く — ボディがストールすると
    // 呼び出し側のmutatingフラグが永久にtrueのまま沈黙する（レビュー指摘）
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new StorefrontError(`Storefront API HTTP ${res.status}`, {
        kind: 'http',
        detail: res.status,
      });
    }
    json = await res.json();
  } catch (err) {
    if (err instanceof StorefrontError) throw err;
    const kind = err.name === 'AbortError' ? 'timeout' : 'network';
    throw new StorefrontError('Storefront APIに届かなかった', { kind, detail: err });
  } finally {
    clearTimeout(timer);
  }
  if (json.errors?.length) {
    throw new StorefrontError(json.errors[0].message, { kind: 'graphql', detail: json.errors });
  }
  return json.data;
}

// ===== 商品クエリ =====

const PRODUCT_FIELDS = `
  handle
  title
  availableForSale
  description
  featuredImage { url width height altText }
  variants(first: 10) {
    nodes {
      id
      title
      availableForSale
      price { amount currencyCode }
    }
  }
`;

// 売り場に並べる商品を handle 指定でまとめて取得する。
// 存在しない handle は null で返る（＝売り場に出さない判断ができる）。
export async function fetchProductsByHandles(handles) {
  const params = handles.map((_, i) => `$h${i}: String!`).join(', ');
  const fields = handles
    .map((_, i) => `p${i}: product(handle: $h${i}) { ${PRODUCT_FIELDS} }`)
    .join('\n');
  const query = `query(${params}) { ${fields} }`;
  const variables = Object.fromEntries(handles.map((h, i) => [`h${i}`, h]));
  const data = await gql(query, variables);
  return handles.map((_, i) => (data[`p${i}`] ? normalizeProduct(data[`p${i}`]) : null));
}

function normalizeProduct(p) {
  const variant = p.variants.nodes[0] ?? null;
  return {
    handle: p.handle,
    title: p.title,
    availableForSale: p.availableForSale,
    description: p.description || '',
    image: p.featuredImage,
    variants: p.variants.nodes,
    // 単一バリアント商品の代表値（バリアント選択UIは variants を見る）
    variantId: variant?.id ?? null,
    price: variant ? { amount: Number(variant.price.amount), currencyCode: variant.price.currencyCode } : null,
  };
}

// ===== 通貨フォーマット =====
// 価格は常にShopifyのMoney型（amount + currencyCode）から表示する。
// フロントで通貨を捏造しない・変換しない・混在させない。

const formatters = new Map();

export function formatMoney(money) {
  if (!money) return '';
  const { amount, currencyCode } = money;
  // JPYはIntlが全角￥(U+FFE5)を返し静的HTMLの半角¥と混在するため明示フォーマット
  if (currencyCode === 'JPY') {
    return '¥' + Math.round(Number(amount)).toLocaleString('ja-JP');
  }
  if (!formatters.has(currencyCode)) {
    formatters.set(
      currencyCode,
      new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: currencyCode === 'JPY' ? 'narrowSymbol' : 'symbol',
      }),
    );
  }
  return formatters.get(currencyCode).format(Number(amount));
}
