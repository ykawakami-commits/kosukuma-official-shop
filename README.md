# こすくまくんのおみせ

こすくまくん公式グッズEC。静的サイト + Shopify Storefront Cart API（フレームワーク・ビルドなし）。

本番: https://kosukuma-official-shop.pages.dev

## 構成

```
index.html          トップ（ヒーロー/お知らせ/商品グリッド/about/ガイド/FAQ。商品カードは静的に書く: SEO/JSON-LDのため）
products/           商品詳細3ページ（sticker/ultra-tshirt/deco-helmet。標準EC構成＋JSON-LD）
404.html
legal/              特定商取引法・プライバシーポリシー
css/tokens.css      デザイントークン（色/余白/z-index/時間帯トークン — 唯一の真実。生値ハードコード禁止）
css/main.css        コンポーネントCSS
js/config.js        Shopifyドメイン/公開トークン/APIバージョン/商品handle一覧/送料無料閾値
js/storefront.js    Storefront GraphQL薄層クライアント
js/cart.js          カート状態（Shopify Cartが唯一の真実）
js/ui.js            画面配線（hydration/ドロワー/ダイアログ/トースト/reveal/サムネ切替）
js/main.js          エントリポイント（whimsy起動・コマアニメ/3Dの遅延ロード）
js/kuma-anim.js     こすくまコマアニメ（遅延ロード。同一アニメは1ページ1個まで）
js/fx/motion.js     ブレークポイント(640/900)とreduced-motionの単一情報源
js/fx/whimsy.js     時間帯の遊び（帯判定/フッター一言/姿切替。装飾領域のみ）
js/fx/hero-3d.js    3D金平糖物理（聖域・ヒーロー内限定。requestIdleCallbackで遅延）
assets/gen/         生成こすくまポーズ（webp。shopkeeper/campfire/sleeping/register/guide/lost）
assets/pixel/       時間帯ドット絵背景（昼/夕/夜 × 768/1536 webp）
assets/img/         商品画像（WebP/srcset焼き済み）
assets/kosukuma/    公式素体・アニメフレーム
assets/3d/          konpeito.glb（3D金平糖モデル）
assets/vendor/      three.js等セルフホスト
tools/optimize-images.mjs  商品画像→WebP/srcset生成（npm run images）
tools/gen-kosukuma.mjs     ポーズ/背景の事前生成（npm run gen。サイト実行時には生成しない）
tools/e2e.mjs       購入導線E2E 36項目（npm run e2e）
_headers            キャッシュ/セキュリティヘッダ（Cloudflare Pages）
```

## 公式感と時間帯の世界

- **公式感**: ヘッダーの「公式」表記、価格はすべて税込表示、日付つき「お知らせ」、運営会社情報と特商法/プライバシーへの導線を全ページに置く
- **時間帯の世界**: `html[data-time]` が昼/夕/夜で切り替わり、ドット絵背景（assets/pixel）と空の色味・フッターバンドが追従する。`js/fx/whimsy.js` が時間帯の一言と姿（夜はutoutoアニメ）を出す。遊びは装飾領域（ヒーロー端・フッター・背景帯）のみで、商品カード・価格・ボタンには一切触れない

## 絶対に守ること（過去の事故から）

1. **カートをフロントで自前計算しない。** 数量変更・削除も必ずShopify API経由（cart.js）。
   旧実装は「追加だけ同期」で、画面¥780のまま¥1,560請求される過剰請求バグがあった
2. **価格・通貨をフロントで捏造しない。** 表示は常にShopifyのMoney型から。
   ストアはJPYオンリー
3. **商品の紐付けはhandleのみ**（js/config.js）。タイトル部分一致は禁止（改名で静かに壊れる）
4. **3D/演出はz-index階層表（css/tokens.css）より上に出さない。** 購入UIは聖域
5. **ブレークポイントは js/fx/motion.js と css の 640/900 で固定。** 独自の768等を作らない
6. **デプロイは必ずgitにコミットしてから。** 本番とgitが乖離した前科あり
   （推奨: Cloudflare PagesのGit連携にして手動deployをやめる）

## よくある作業

### 商品を追加・変更する
1. Shopify管理画面で商品を作る（JPY・在庫設定）
2. `js/config.js` の `PRODUCT_HANDLES` にhandleを追加
3. `index.html` に商品カードを追加（既存カードをコピーして `data-handle` を合わせる。JSON-LDにも1件追加）
4. `products/` に詳細ページを追加（既存ページをコピーして `data-handle`・画像・ストーリー・JSON-LDを更新）
5. 元画像を `assets/` に置いて `npm run images`（`tools/optimize-images.mjs` のリストに追記）
6. `sitemap.xml` にURLを追加

在庫・価格・売切れ表示はShopifyの実データで毎ロード自動上書きされる（hydration）。

### 検証
```bash
npx http-server -p 3459          # ローカルサーバー
npm run e2e                       # 受け入れ基準36項目（D:/ダウンロード配下で実行）
```

### デプロイ
```bash
npx wrangler pages deploy . --project-name=kosukuma-official-shop --branch=main --commit-dirty=true
```
※ `--branch=main` を忘れるとPreview環境に行く。デプロイ前に必ずコミット。

## Shopify側のTODO
- テスト商品「テスト」(¥1)を非公開/アーカイブにする（公開APIから誰でも買える状態）
- Headlessチャネルで `unauthenticated_read_product_inventory` を有効化すると在庫数表示が可能になる
