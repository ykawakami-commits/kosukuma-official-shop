// shopify.js — Shopify Buy SDK ラッパー

import { SHOPIFY_CONFIG } from './config.js';

const { domain, storefrontAccessToken } = SHOPIFY_CONFIG;

export const IS_CONFIGURED =
  domain.length > 0 &&
  storefrontAccessToken.length > 0 &&
  domain !== 'YOUR_STORE.myshopify.com' &&
  storefrontAccessToken !== 'YOUR_TOKEN';

let client   = null;
let checkout = null;

// ===== SDK 初期化 + チェックアウト作成 =====
export async function initShopify() {
  if (!IS_CONFIGURED) {
    console.info('%c Shopify: 未設定 — フォールバックモード', 'color: #9c7a4a');
    return false;
  }

  try {
    // UMD版を script タグで読み込む（esm.sh より互換性が高い）
    await new Promise((resolve, reject) => {
      if (window.ShopifyBuy) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    const ShopifyBuy = window.ShopifyBuy;
    console.log('1. SDK loaded:', typeof ShopifyBuy);

    client = ShopifyBuy.buildClient({ domain, storefrontAccessToken });
    console.log('2. Client created:', !!client);

    checkout = await client.checkout.create();
    console.log('3. Checkout created:', checkout.id);
    console.log('4. Checkout URL:', checkout.webUrl);

    console.info('%c Shopify: 接続成功 ✓', 'color: #7c9e6a; font-weight:bold');
    return true;
  } catch (err) {
    console.warn('Shopify 初期化エラー (localhost CORSなら無視OK):', err);
    return false;
  }
}

// ===== 商品一覧取得 =====
export async function fetchShopifyProducts() {
  if (!client) return null;
  try {
    const products = await client.product.fetchAll();
    console.log('5. Products fetched:', products.length, products.map(p => ({
      title: p.title,
      variantId: p.variants[0]?.id,
      price: p.variants[0]?.price,
    })));
    return products;
  } catch (err) {
    console.warn('Shopify 商品取得エラー:', err);
    return null;
  }
}

// ===== カートに追加 =====
export async function addToShopifyCart(variantId, quantity = 1) {
  if (!client || !checkout) return false;
  try {
    console.log('6. Adding to cart — variantId:', variantId);
    checkout = await client.checkout.addLineItems(checkout.id, [
      { variantId, quantity },
    ]);
    console.log('7. Cart updated — items:', checkout.lineItems.length, '| URL:', checkout.webUrl);
    return true;
  } catch (err) {
    console.warn('Shopify カート追加エラー:', err);
    return false;
  }
}

// ===== チェックアウト URL 取得 =====
export function getCheckoutUrl() {
  const url = checkout?.webUrl ?? null;
  console.log('8. getCheckoutUrl:', url);
  return url;
}
