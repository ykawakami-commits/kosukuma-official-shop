// cart.js — カート状態管理（Shopify Cartが唯一の真実）
//
// 旧実装の教訓（同じ事故を二度と起こさないための設計原則）:
// 1. ローカル独自カート配列は持たない — 表示カート≠請求カートの過剰請求バグの根因だった
// 2. 数量変更・削除も必ずShopifyに同期する（追加だけ同期は禁止）
// 3. 合計は自前で計算しない — cart.cost（Shopify計算値）をそのまま表示する。
//    通貨の混在・換算・捏造はフロントでは一切しない
// 4. cartIdはlocalStorageに永続化（Shopifyカートは最終操作から約10日生存）。
//    リロードで消える/毎ロードで使い捨てカート作成、の両事故を防ぐ
// 5. 失敗は黙殺しない — 呼び出し側がトーストで伝えられるよう必ずthrow/返却する

import { gql, StorefrontError } from './storefront.js';

const CART_ID_KEY = 'kosukuma-cart-id';

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount { amount currencyCode }
  }
  lines(first: 50) {
    nodes {
      id
      quantity
      cost { totalAmount { amount currencyCode } }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          price { amount currencyCode }
          image { url altText }
          product { title handle }
        }
      }
    }
  }
`;

let cart = null; // Shopifyから返った最新のカートオブジェクト（表示はこれだけを見る）
const listeners = new Set();

export function getCart() {
  return cart;
}

export function onCartChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setCart(next) {
  cart = next;
  if (next?.id) localStorage.setItem(CART_ID_KEY, next.id);
  listeners.forEach((fn) => fn(cart));
}

function readUserErrors(payload) {
  const errs = payload?.userErrors ?? [];
  if (errs.length) {
    throw new StorefrontError(errs[0].message, { kind: 'userError', detail: errs });
  }
}

// ===== 復元 / 生成 =====

// 起動時: 保存済みcartIdがあれば復元。
// IDを捨ててよいのは「Shopifyが確定的に cart:null を返した」時（購入完了・期限切れ）だけ。
// 一過性のネットワークエラーで捨てると、電波の悪い環境で開いただけで
// 顧客のカートが永久に失われる（レビュー指摘 — 実装バグだった）。
export async function restoreCart() {
  const savedId = localStorage.getItem(CART_ID_KEY);
  if (!savedId) return null;
  try {
    const data = await gql(`query($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`, { id: savedId });
    if (data.cart) {
      // 復元応答が遅い間にユーザー操作で新カートができていたら、そちらが勝ち
      if (cart?.id) return cart;
      setCart(data.cart);
      return cart;
    }
    // cart:null 確定 = このIDはもう使えない
    localStorage.removeItem(CART_ID_KEY);
  } catch {
    // 一過性エラー: IDは保持して次回ロードで再試行
  }
  return null;
}

// カートは「最初の追加時」に遅延生成する（全訪問者に使い捨てカートを作らない）
async function ensureCart() {
  if (cart?.id) return cart;
  const data = await gql(`mutation { cartCreate { cart { ${CART_FIELDS} } userErrors { field message } } }`);
  readUserErrors(data.cartCreate);
  setCart(data.cartCreate.cart);
  return cart;
}

// カート期限切れ（mutation対象が消えている）時に一度だけ作り直してリトライする。
// 判定は userErrors の code/field で行う — メッセージ文字列はストアのロケールで
// 変わる（この店は日本語で「指定されたカートは存在しません。」が返ることを実測済み）ため、
// 文字列マッチは言語非依存のフォールバックとしてのみ使う。
function isCartGone(err) {
  if (!(err instanceof StorefrontError)) return false;
  if (err.kind === 'userError') {
    const first = err.detail?.[0];
    if (first?.code === 'INVALID' && (first.field ?? []).includes('cartId')) return true;
  }
  if (err.kind === 'graphql' || err.kind === 'userError') {
    return /cart/i.test(err.message) && /(not exist|not found|invalid)/i.test(err.message);
  }
  return false;
}

async function withCartRetry(fn) {
  await ensureCart();
  try {
    return await fn();
  } catch (err) {
    if (!isCartGone(err)) throw err;
    localStorage.removeItem(CART_ID_KEY);
    cart = null;
    await ensureCart();
    return await fn();
  }
}

// ===== 操作（すべてShopifyに同期し、返ってきたカートで表示を更新する） =====

// Shopifyは在庫不足・販売不可のとき「エラーを返さず黙って数量をクランプ/行を落とす」
// （実測確認済み）。表示は返却カートを使うので乖離はしないが、
// ユーザーへのフィードバック用に「要求がどれだけ適用されたか」を返す。

function variantQty(c, variantId) {
  return (
    c?.lines.nodes.filter((l) => l.merchandise.id === variantId)
      .reduce((sum, l) => sum + l.quantity, 0) ?? 0
  );
}

export async function addLine(variantId, quantity = 1) {
  return withCartRetry(async () => {
    const before = variantQty(cart, variantId);
    const data = await gql(
      `mutation($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { ${CART_FIELDS} }
          userErrors { field message code }
        }
      }`,
      { cartId: cart.id, lines: [{ merchandiseId: variantId, quantity }] },
    );
    readUserErrors(data.cartLinesAdd);
    setCart(data.cartLinesAdd.cart);
    const applied = variantQty(cart, variantId) - before;
    return { cart, requested: quantity, applied };
  });
}

export async function updateLineQuantity(lineId, quantity) {
  if (quantity <= 0) return removeLine(lineId);
  return withCartRetry(async () => {
    const data = await gql(
      `mutation($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart { ${CART_FIELDS} }
          userErrors { field message code }
        }
      }`,
      { cartId: cart.id, lines: [{ id: lineId, quantity }] },
    );
    readUserErrors(data.cartLinesUpdate);
    setCart(data.cartLinesUpdate.cart);
    const line = cart.lines.nodes.find((l) => l.id === lineId);
    return { cart, requested: quantity, applied: line?.quantity ?? 0 };
  });
}

export async function removeLine(lineId) {
  return withCartRetry(async () => {
    const data = await gql(
      `mutation($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { ${CART_FIELDS} }
          userErrors { field message code }
        }
      }`,
      { cartId: cart.id, lineIds: [lineId] },
    );
    readUserErrors(data.cartLinesRemove);
    setCart(data.cartLinesRemove.cart);
    return cart;
  });
}

// チェックアウトURLはShopifyカートのものをそのまま使う。
// （旧実装の「表示と請求が食い違う」事故は、このURLとUIが別カートを見ていたことが原因）
export function getCheckoutUrl() {
  return cart?.checkoutUrl ?? null;
}
