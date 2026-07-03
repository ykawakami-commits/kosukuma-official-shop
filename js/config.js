// config.js — Shopify Storefront API 設定
//
// storefrontAccessToken は「公開」設計のトークン（Storefront APIは
// 未認証クライアント向け）。秘密ではないのでここに置いてよい。
// APIバージョンは必ず固定する（'latest' 依存で購入導線が壊れる事故防止）。

export const SHOPIFY_CONFIG = {
  domain: 'xdhx4j-1y.myshopify.com',
  storefrontAccessToken: '6a91ef09b283337776f91e12edbe6da7',
  apiVersion: '2025-04',
};

// 売り場とShopify商品の紐付けは handle で行う（タイトル部分一致は禁止 —
// 管理画面でタイトルを変えると静かに壊れるため）。
// ここに無い handle の商品（例: テスト商品）は売り場に出さない。
export const PRODUCT_HANDLES = [
  'こすくまくんステッカー',
  'tシャツ',
  'こすくまデコヘルメット',
];
