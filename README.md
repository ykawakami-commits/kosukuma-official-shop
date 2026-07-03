# こすくまくんのおみせ

こすくまくん公式グッズEC。静的サイト + Shopify Storefront Cart API（フレームワーク・ビルドなし）。

本番: https://kosukuma-official-shop.pages.dev

## 構成

```
index.html          ページ本体（商品カードは静的に書く: SEO/JSON-LDのため）
404.html
css/tokens.css      デザイントークン（色/余白/z-index — 唯一の真実。生値ハードコード禁止）
css/main.css        コンポーネントCSS
js/config.js        Shopifyドメイン/公開トークン/APIバージョン/商品handle一覧
js/storefront.js    Storefront GraphQL薄層クライアント
js/cart.js          カート状態（Shopify Cartが唯一の真実）
js/ui.js            画面配線（グリッドhydration/ドロワー/ダイアログ/トースト/イーロン）
js/main.js          エントリポイント
js/kuma-anim.js     こすくまパラパラアニメ（遅延ロード）
js/fx/motion.js     ブレークポイント(640/900)とreduced-motionの単一情報源
js/fx/sparkles.js   カーソルきらきら
js/fx/hero-3d.js    3Dこんぺいとう物理（ヒーロー内限定）
js/fx/confetti.js   カゴ追加時のこんぺいとう紙吹雪バースト
js/fx/scroll-fx.js  ヒーローパララックス+イーロン$カウントアップ
js/fx/magnetic.js   マグネティックボタン（hero-cta/イーロン）
js/fx/hover-zoom.js 商品写真の覗き込みズーム
tools/optimize-images.mjs  商品画像→WebP/srcset生成（npm run images）
tools/e2e.mjs       購入導線E2E 15項目（npm run e2e）
_headers            キャッシュ/セキュリティヘッダ（Cloudflare Pages）
```

## 絶対に守ること（過去の事故から）

1. **カートをフロントで自前計算しない。** 数量変更・削除も必ずShopify API経由（cart.js）。
   旧実装は「追加だけ同期」で、画面¥780のまま¥1,560請求される過剰請求バグがあった
2. **価格・通貨をフロントで捏造しない。** 表示は常にShopifyのMoney型から。
   ストアはJPYオンリー。$表記はイーロン売り場の演出だけ（実売しない）
3. **商品の紐付けはhandleのみ**（js/config.js）。タイトル部分一致は禁止（改名で静かに壊れる）
4. **3D/演出はz-index階層表（css/tokens.css）より上に出さない。** 購入UIは聖域
5. **ブレークポイントは js/fx/motion.js と css の 640/900 で固定。** 独自の768等を作らない
6. **デプロイは必ずgitにコミットしてから。** 本番とgitが乖離した前科あり
   （推奨: Cloudflare PagesのGit連携にして手動deployをやめる）

## よくある作業

### 商品を追加・変更する
1. Shopify管理画面で商品を作る（JPY・在庫設定）
2. `js/config.js` の `PRODUCT_HANDLES` にhandleを追加
3. `index.html` に商品カードを追加（既存カードをコピーして `data-handle` を合わせる）
4. `js/ui.js` の `CATALOG` に画像・ストーリーを追加
5. 元画像を `assets/` に置いて `npm run images`（`tools/optimize-images.mjs` のリストに追記）

在庫・価格・売切れ表示はShopifyの実データで毎ロード自動上書きされる（hydration）。

### 検証
```bash
npx http-server -p 3459          # ローカルサーバー
npm run e2e                       # 受け入れ基準15項目（D:/ダウンロード配下で実行）
```

### デプロイ
```bash
npx wrangler pages deploy . --project-name=kosukuma-official-shop --branch=main --commit-dirty=true
```
※ `--branch=main` を忘れるとPreview環境に行く。デプロイ前に必ずコミット。

## Shopify側のTODO
- テスト商品「テスト」(¥1)を非公開/アーカイブにする（公開APIから誰でも買える状態）
- Headlessチャネルで `unauthenticated_read_product_inventory` を有効化すると在庫数表示が可能になる
- イーロンマスク様専用を実商品として登録すればクイズ→決済まで完走できる
