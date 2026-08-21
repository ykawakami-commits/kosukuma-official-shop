# ECコンバージョンUXノウハウ — こすくまくんのおみせ適用版

> リサーチ日: 2026-07-28
> 対象サイト: `D:/ダウンロード/kosukuma-official-shop/`（静的サイト / 商品3点 / Shopify Storefront Cart API直叩き / カートドロワー+トースト実装済み）
> 目的: 「大手キャラクターIP企業が運営していると誰もが信じる公式EC」に必要なCVR UXノウハウを、**このサイトの実ファイル・実セクション単位**まで落とし込む。
>
> 主要ソース: Baymard Institute（78,000時間超のECユーザビリティ研究）、Nielsen Norman Group、Shopify公式、日本語EC実務（aiship/ColorMe/Dejam）、国内公式キャラEC実地調査（サンリオ/ちいかわマーケット/mofusand/ポケモンセンター）。各項目に出典を明記。

---

## 0. このサイトの前提（適用先の地図）

| 実体 | 場所 |
|---|---|
| トップ（1ページ内に全セクション） | `index.html` — hero カルーセル3枚（hero / info-slide / spot-slide）→ `#products` → `#checked` → `#news` → `#about` → `#guide` → `#faq` |
| 商品詳細 | `products/sticker.html` / `products/ultra-tshirt.html` / `products/deco-helmet.html` |
| カート | `js/cart.js`（Shopifyカートが唯一の真実・cartId永続化・cost自前計算禁止の設計原則あり）+ `js/ui.js`（drawer / toast） |
| 設定 | `js/config.js` — `FREE_SHIPPING_THRESHOLD_JPY = 5000`、handle紐付け3商品 |
| 法定ページ | `legal/tokushoho.html` / `legal/privacy.html` |
| CTA文言 | 「カートに入れる」（ui.js / index.html で統一済み） |

商品3点という規模は弱点ではなく武器。Baymardの「チェックアウトは最短要素数へ」原則をIA全体に適用でき、**トップ=商品一覧を兼ね、カード→詳細→カート→レジの3〜4タップで完結**できる（カテゴリページ・検索・フィルタは少数SKUではすべて摩擦なので作らない）。

---

## 1. CVRを上げるファーストビュー設計

### 1-1. ファーストビューの3責務（Baymard）
ホームは「front door」であり「navigational anchor」。ファーストビューで①何の店か ②何が買えるか ③どう探すか、の3つを即時に伝える。Baymard 2021ベンチマークでは32%のサイトがここで平凡以下、パーフェクトはわずか17%。
**→ 適用**: hero スライド1枚目に「こすくまくん公式グッズショップ」の宣言＋公式こすくま（`こすくま_ol.ai`由来の静止画）＋主商品ビジュアル＋「商品を見る」の `#products` アンカーCTA。この3点がスクロールなしで見えることを iPhone 16 Pro（402×874）で確認する。
出典: [Baymard – Homepage UX Best Practices](https://baymard.com/blog/ecommerce-homepage-ux)

### 1-2. カルーセルは「使うなら正しく」— 75%のサイトが実装を誤る（Baymard）／操作率1%（NN/g系研究）
- カルーセル利用サイトの75%が実装ミス。静的セクションの方がしばしば成果が良い。
- NN/g系の実測では**カルーセルを操作する訪問者は約1%、2枚目以降に到達するのは0.5%未満**。自動回転はユーザーの制御を奪い、98ptの巨大文字ですら「回転したせいで」見つけられなかった実験例がある。
- 正しく使う条件: ゆっくり自動回転／ホバーで一時停止／**ユーザー操作後は恒久停止**／ドット+矢印で現在位置を明示。

**→ 適用（このサイトは hero / info-slide / spot-slide の3枚カルーセル）**:
1. **一番売りたい情報（公式宣言＋主商品CTA）は必ず1枚目**。2枚目以降にしか無い情報は「存在しない」前提で設計する。info-slide にしかない重要情報（送料無料条件等）は `#products` 直上か trust strip に静的複製する。
2. 自動回転させるなら6〜8秒間隔、`prefers-reduced-motion` で停止、タップ/スワイプ操作後は自動回転を恒久停止（JS: 一度でも `pointerdown` を受けたら interval を clear）。
3. 迷ったらカルーセルをやめ、hero 1枚+その下に info の帯、が最も安全（Baymardも静的優位を明言）。
出典: [Baymard – Homepage UX](https://baymard.com/blog/ecommerce-homepage-ux) / [NN/g – Auto-Forwarding Carousels Annoy Users](https://www.nngroup.com/articles/auto-forwarding/) / [VWO – Image Slider Alternatives](https://vwo.com/blog/image-slider-alternatives/)

### 1-3. 商品タイプの40%以上をトップで見せる（Baymard）
新規訪問者はトップで品揃えの全体像を掴む。**→ 適用**: 商品3点なら「全商品をトップに直置き」で自動的に100%達成。現行 `#products` セクションの全カード直置き構成を維持し、**中間の商品一覧ページを絶対に作らない**。heroから `#products` までの距離を1スクロール以内に保つ。
出典: [Baymard – Homepage UX](https://baymard.com/blog/ecommerce-homepage-ux)

### 1-4. 既製ストックフォト禁止・使用文脈イメージ（Baymard）
「良いデザインと心を動かす写真」はテストユーザーの好反応が実証済み。カットアウト商品画像と無個性ストック写真は平凡以下の主因。**→ 適用**: heroには公式こすくまマスター由来のビジュアル＋**実物商品の使用シーン写真**（ステッカーをPCに貼った写真、ヘルメット装着イメージ）。グローバルルール（公式静止画のみ・AI描き直し禁止・コマアニメ1ページ1個まで）はこの原則と完全に整合する。
出典: [Baymard – Homepage UX](https://baymard.com/blog/ecommerce-homepage-ux)

### 1-5. ポップアップ・過剰広告の禁止（Baymard）
59%のサイトが広告的要素で問題を抱え、ロード時のニュースレターオーバーレイはユーザーに「スパム」と呼ばれる。**→ 適用**: 初回訪問ポップアップ・メルマガモーダル・カウントダウンバナーは一切実装しない。お知らせは `#news` セクションと（重要時のみ）ヘッダー下の細い帯で伝える。
出典: [Baymard – Homepage UX](https://baymard.com/blog/ecommerce-homepage-ux)

### 1-6. ファーストビュー速度 = CVR（LCP 2.5秒未満）
Rakuten 24はCore Web Vitals改善でCV+33.1%、Deloitte研究では0.1秒の改善が CV約+1%。LCP要素はほぼ確実にheroまたは最初の商品カード画像。
**→ 適用（実コードで発見した改善点）**: `index.html` の最初の商品カード（`#p-sticker`）の `<img>` が `loading="lazy"` になっている。**hero画像と1枚目商品画像は `loading="eager"` + `fetchpriority="high"`、width/height明示に変更**。2枚目以降のカード・`#checked` 以下のみ lazy を維持。WebP+srcset は実装済みなので現状維持。
出典: [web.dev / digitalapplied – Page Speed Statistics](https://www.digitalapplied.com/blog/page-speed-statistics-2026-revenue-impact)

### 1-7. クリック可能領域の明示（Baymard）
43%のサイトがクリッカブル要素のスタイルに失敗。ユーザーは「押せるか分からない」要素の前で躊躇する。**→ 適用**: 商品カード全体を1つのヒットエリアに（現行の `<a class="product-media">` を card 全体ラップに拡張するか、カード全域クリックのJSを追加）。ホバーで影+わずかな浮き上がりを付け「押せる」ことを伝える。タップターゲットは最小44×44px。
出典: [Baymard – Homepage UX](https://baymard.com/blog/ecommerce-homepage-ux)

---

## 2. 商品カードのベストプラクティス

### 2-1. カード必須要素セット
Baymard/NN/g実務の合成: **画像＋商品名＋税込価格＋在庫状態バッジ**が最小完全形。このサイトの3状態（販売中/近日発売/売り切れ）はバッジで区別する。
- 価格は「¥780（税込）」形式。**価格の近くに「¥5,000以上で送料無料」を小さく併記**（想定外コストはカゴ落ち理由の48%で最大要因。日本の調査でも「送料発生を知ったため」が43.3%でカゴ落ち理由1位）。
- **→ 適用**: `#products` の3カードすべてに `.price` の直下 `.shipping-note` を追加。`FREE_SHIPPING_THRESHOLD_JPY` と文言の数字がズレないよう、表示はconfig値から生成するか、READMEに「変更時は特商法・trust strip・カードの3箇所同時更新」と明記（config.jsに既にこの警告コメントあり — カード追加分も対象に含める）。
出典: [Baymard – Cart Abandonment Statistics](https://baymard.com/lists/cart-abandonment-rate) / [aiship – ECサイトCVR改善15選](https://www.aiship.jp/ec-column/cvr)

### 2-2. サムネイルは複数枚・サイズ感が伝わるカットを（Baymard 2025）
80%のサイトが商品リストで複数サムネイルを提供していない（=提供すれば差別化）。またユーザーの42%は画像から実寸を推測しようとして失敗する。ステッカーは「思ったより小さい」ギャップが不満・返品の主因。
**→ 適用**:
- カードのホバー/スワイプで2枚目画像（使用シーン）に切り替わる仕掛けを追加（静的サイトでもCSS/JS数行で可能）。
- **ステッカーの画像セットは「1枚目=単体、2枚目=ノートPCに貼った実寸カット、3枚目=手持ちカット」**。詳細ページにはmm実寸を必ず記載。
- デコヘルメットは装着イメージ or 手持ちで大きさを示すカットを追加。
出典: [Baymard – Product List UX Best Practices 2025](https://baymard.com/blog/current-state-product-list-and-filtering) / [Baymard – Product Page UX Best Practices 2026](https://baymard.com/blog/current-state-ecommerce-product-page-ux)

### 2-3. 在庫状態は「事実のみ・具体的に」
- 在庫僅少は「残りわずか」より「**残り7点**」の実数（Shopify在庫数と連動）。**偽の希少性演出（常に残り3点等）は絶対禁止**——信頼毀損に加え景表法リスク。キャラグッズ購買層は限定・数量表示への感度が特に高い。
- 売り切れ商品は**カードを消さない・非リンク化しない**。SOLD OUTバッジは残し（人気の証明として機能）、詳細ページでCTA位置を「再入荷したら知らせて」（X/LINE/メール登録）に差し替える。再入荷通知はカゴ落ちリマインドの約2倍のCVを持つリード。
- 近日発売商品には「8月上旬」レベルの発売時期粒度＋「発売したら知らせて」導線。時期未定のComing Soonは期待を溜められない。
- **→ 適用**: `main.js` の在庫表示ロジックに Storefront API の `quantityAvailable` 連動実数表示を追加。売り切れ時の `ultra-tshirt.html` / `deco-helmet.html` はCTA差し替えパターンを実装。
出典: [CXL – Out of Stock Product Pages](https://cxl.com/blog/out-of-stock-product-pages/) / [The Gray Company – OOS UX/SEO](https://thegray.company/blog/permanently-temporarily-out-of-stock-products-ecommerce-seo-ux) / [NN/g – Trust and Credibility](https://www.nngroup.com/reports/ecommerce-ux-trust-and-credibility/)

### 2-4. ネタ商品の視覚的隔離
イーロン・マスク・スペシャルエディション級のジョーク商品を置くなら、実売商品と**同じカード様式で並べない**（帯色 or 「ネタ枠」ラベル）。価格表示の一貫性が崩れると実商品の価格への信頼も毀損する（NN/g信頼原則）。カートには入れさせず、タップで専用のオチ演出。
**→ 適用**: 現行3商品構成では該当なしだが、今後ネタ商品を足す場合はこのルールを適用。
出典: [NN/g – Trust and Credibility](https://www.nngroup.com/reports/ecommerce-ux-trust-and-credibility/)

### 2-5. 商品詳細ページの型（Baymard 2026）
- **「カートに入れる」は全デバイスでファーストビュー内**。モバイルは画像が価格+CTAを押し出しやすいので、メイン画像を `max-height: 55vh` 程度に制約し、402×874で価格とCTAが両方見えることを確認。
- **主CTAは1つだけprimary色**。「カートに入れる」をサイト内最高彩度の1色に統一し、他のボタン（詳細を見る・戻る等）にはその色を使わない。
- **モバイルにスクロール追従の下部固定バー**（商品名短縮+税込価格+カートに入れる）。上部CTAが画面外に出たらスライドイン。スティッキーCTAはモバイルCVを15〜20%押し上げる実測が複数ある。**カートドロワー表示中は隠す**（ui.jsのdrawer開閉と連動）。
- 価格ブロック直下に「🚚 3〜5営業日で発送 / 不良品は到着後7日以内交換OK」の1行＋`legal/tokushoho.html` へのリンク。配送スピード不明・返品ポリシー不満はそれぞれカゴ落ち・注文放棄の主要因（返品不満で15%）。
- **→ 適用**: `products/*.html` 3ファイル共通の `.detail-info` ブロックに上記を実装。
出典: [Baymard – Product Page UX Best Practices 2026](https://baymard.com/blog/current-state-ecommerce-product-page-ux) / [mgroupweb – Shopify Product Page Optimization](https://mgroupweb.com/blogs/shopify-product-page-optimization/)

### 2-6. レビューゼロ問題の代替 = ファンUGC
商品3点・新規ECではレビューが集まらない。キャラクターグッズでは**ファンのX投稿（貼った写真・飾った写真）が最強の社会的証明**。レビュー研究では星4.2〜4.7が5.0満点より転換率が高い（=生の声の信憑性）。
**→ 適用**: 各商品詳細の説明文下に「みんなの写真」セクション。@Kosu_dot_kuma へのメンション/ハッシュタグ投稿から**本人許諾を取った実在ポストのみ**掲載。静的サイトなので埋め込みはスクショ画像+リンク（外部スクリプト不要・速度も守れる）。
出典: [NN/g – Ecommerce UX Product Pages](https://www.nngroup.com/reports/ecommerce-ux-product-pages-including-reviews/) / [rework – Trust Signals & Social Proof](https://resources.rework.com/libraries/ecommerce-growth/trust-signals-social-proof)

---

## 3. カート導線（カゴ落ち平均70.22%との戦い）

Baymard集計: **平均カゴ落ち率70.22%**。理由の上位は①想定外コスト48% ②アカウント作成強制 ③配送が遅い/不明 ④チェックアウトが長い。チェックアウトUX改善だけで大手ECは最大+35.26%のCV改善余地。
出典: [Baymard – 50 Cart Abandonment Rate Statistics](https://baymard.com/lists/cart-abandonment-rate)

### 3-1. 追加後は必ずドロワーを自動オープン
「カートに入れる」押下後、無反応や小さなバッジ更新だけにしない（追加成功が伝わらないと二重追加・離脱が起きる）。ドロワーを自動で開き、追加商品をハイライト、小計、「レジへ進む」+「買い物を続ける」を並べる。
**→ 適用**: `ui.js` にdrawer実装済み。Cart API成功レスポンス受信後に必ず `openDrawer()` + 追加行ハイライトになっているか確認・徹底。
出典: [AB Tasty – Shopping Cart Optimization](https://www.abtasty.com/blog/shopping-cart-optimization/)

### 3-2. 送料無料プログレスバー
ドロワー最上部に「送料無料まであと¥X」バー（小計 < ¥5,000のとき）。達成時は「送料無料です🎉」に切替。**単価¥780のステッカー中心構成では複数枚買い誘導がAOVとCVの両方に効く**、このサイトで最も費用対効果の高い施策のひとつ。
**→ 適用**: `ui.js` のdrawer描画に追加。残額は `cart.cost.subtotalAmount`（Shopify計算値）から算出——cart.jsの「合計を自前計算しない」原則に従い、閾値比較のみフロントで行う。閾値は `config.js` の `FREE_SHIPPING_THRESHOLD_JPY` を参照（ハードコード禁止）。
出典: [Dejam – カゴ落ち対策](https://leango.co.jp/dejam/blog/article0347/)

### 3-3. カート編集は即時反映・削除は「元に戻す」方式
数量変更は「更新」ボタンなしの即時反映（楽観的UI+失敗時ロールバック）。削除は確認ダイアログなしで即実行+「元に戻す」トースト。チェックアウト直前の編集摩擦は最も高くつく離脱を生む。
**→ 適用**: `cart.js` は数量変更・削除もShopify同期する設計になっているので、`ui.js` 側を楽観的更新+ `toast('削除しました', {undo})` パターンに。数量+/-と削除ボタンは44×44px以上。
出典: [AB Tasty – Shopping Cart Optimization](https://www.abtasty.com/blog/shopping-cart-optimization/)

### 3-4. Shopify在庫無言クランプの検知（このリポジトリ固有の必須実装）
Shopify Cart APIは在庫超過時に**エラーを返さず黙って数量を切り詰める**（kosukuma-shop-v2で実測済みのGotcha）。要求qtyとレスポンスqtyを比較し、差異があれば「在庫が残りN点のため数量を調整しました」トーストを出す。無言の数量変化は「表示カート≠請求カート」に次ぐ信頼破壊。
**→ 適用**: `cart.js` の追加・数量変更処理に差分チェックを実装。cart.jsヘッダの設計原則5（失敗は黙殺しない）の具体化。
出典: 本プロジェクト実測Gotcha + Baymardエラーメッセージ原則

### 3-5. チェックアウトはゲスト購入+高速決済
アカウント作成強制はカゴ落ち理由2位。**Shop Payはゲスト比で最大+50%のCVリフト、ボタンが表示されるだけでも下部ファネル+5%**。
**→ 適用**: Shopify管理画面でゲストチェックアウト許可+Shop Pay/Apple Pay/Google Pay有効化（コードでなく設定作業）。ドロワーの「レジへ進む」は `cart.checkoutUrl` へ直行——中間確認ページを挟まない。
出典: [Shopify – Shop Pay](https://www.shopify.com/blog/shop-pay-checkout) / [Shopify Help – Accelerated Checkouts](https://help.shopify.com/en/manual/payments/accelerated-checkouts)

### 3-6. タップ数の最短化（3商品ECの特権）
トップ=一覧を兼ねる現行IAを維持: **カードタップ→詳細→カートに入れる→レジ、の3〜4タップで購入完了**。カテゴリ・検索・フィルタ・並び替えはBaymard 2025で大量のガイドラインがあるが、**SKU3点では全部不要**（中間階層はすべて摩擦）。追加しないことが正解。
出典: [Baymard – Product List UX 2025](https://baymard.com/blog/current-state-product-list-and-filtering)（フィルタ・ソート要件はSKU多数サイト向け）

---

## 4. 信頼要素 — 配送・FAQ・問い合わせの見せ方

トラストシグナルの体系的実装でCV+20〜35%、無名ブランドではセキュリティ表示で+15〜30%の実測レンジ。原則は一つ: **信頼シグナルは「不安が生まれるその場所」に置く**（フッターにまとめて隠さない）。
出典: [XICTRON – Trust Signals in E-Commerce](https://www.xictron.com/en/blog/trust-signals-ecommerce-conversion-boost-2026/) / [FigPii – Trust Signals](https://www.figpii.com/blog/trust-signals-in-e-commerce-conversion/)

### 4-1. 不安の発生場所 × 対応シグナルのマッピング

| 不安が生まれる場所 | 出すべきシグナル | このサイトでの実装先 |
|---|---|---|
| 商品カード（価格を見た瞬間） | 税込明記+送料条件 | `#products` 各カードの価格直下 |
| 商品詳細（買うか迷う瞬間) | 配送日数・返品1行要約+リンク | `products/*.html` CTA直下 |
| カートドロワー（決済へ進む瞬間） | 「決済はShopifyのセキュアなシステムで行われ、カード情報は当店に保存されません」+カードブランドロゴ | 「レジへ進む」ボタン**直下** |
| サイト全体（この店は実在するか） | 特商法・運営会社・ダブル©表記 | フッター常設リンク |

出典: [Baymard – trust signal配置原則](https://baymard.com/blog/current-state-ecommerce-product-page-ux) / [Build Grow Scale – 8 Trust Signals](https://buildgrowscale.com/trust-signals-ecommerce-conversion)

### 4-2. 国内公式キャラEC 4サイト実地調査で判明した「公式らしさ」の型
サンリオオンラインショップ / ちいかわマーケット / mofusandもふもふマーケット / ポケモンセンターオンラインの共通構造（前回リサーチで4サイトをWebFetch精読済み）:

1. **titleタグに必ず「公式」**（現行 `<title>こすくまくんのおみせ｜公式グッズショップ</title>` は型に合致 — 維持）。
2. **お知らせ欄に日付付きでネガティブ情報も掲載**（夏季休業・配送遅延・障害）。隠さないことが最大の信頼シグナル。→ `#news` に日付必須の運用ルール。最低でも長期休業と配送遅延は必ず載せるとREADMEに明記。
3. **「ご利用ガイド」+「よくあるご質問」の2枚看板をヘッダー/フッター両方に二重配置**。→ 現行 `#guide` / `#faq` セクションへのアンカーをヘッダーnavとフッターの両方に置く。FAQ最低4問=「発送はいつ？」「返品できる？」「支払い方法は？」「領収書は？」。
4. **フッター法定4点セット**: 利用規約・プライバシーポリシー・特商法表記・運営会社。→ `legal/tokushoho.html` `legal/privacy.html` は存在。**利用規約と運営会社（株式会社こす.くま）ページが未整備なら追加**。特商法には販売業者名/責任者/所在地/連絡先/支払時期/引渡時期/返品特約を記載。
5. **ダブル©表記**: 「© こすくまくん / 株式会社こす.くま」形式。IP権利者と運営者の両方の明示が公式性の証明（mofusand/ちいかわ方式）。
6. **SNSはフッター最下部にアイコン集約**（X + Instagram最低ライン）。本文中に散らさない。
7. **問い合わせはFAQ経由**: `#faq` 末尾に「解決しない場合はお問い合わせ」ボタン→メールフォーム。電話番号は特商法ページにあれば足りる。
8. **キャラ画像は機能を持つ場所のみ**（ロゴ/商品写真/バナー）。隙間埋め装飾で散らさない——公式の節度。
9. **偽サイト注意喚起ページ**を1枚用意（ポケセン・サンリオが実施。人気IPの証でもある）。

### 4-3. 文言トーン
平易で丁寧な「です・ます」調に統一。**購買圧演出（カウントダウン・在庫煽りの乱発・「今すぐ買え」）は全年齢向け公式ECでは逆効果**かつブランド毀損。緊急性表示は事実の在庫実数のみ（2-3参照）。
出典: サンリオ/mofusand実地調査 + [NN/g – Trust and Credibility](https://www.nngroup.com/reports/ecommerce-ux-trust-and-credibility/)

---

## 5. 主要統計クイックリファレンス（説得・優先度判断用）

| 統計 | 値 | 出典 |
|---|---|---|
| 平均カゴ落ち率 | 70.22% | [Baymard](https://baymard.com/lists/cart-abandonment-rate) |
| カゴ落ち理由1位: 想定外コスト | 48% | Baymard 同上 |
| 日本のカゴ落ち理由1位:「送料発生を知った」 | 43.3% | [aiship](https://www.aiship.jp/ec-column/cvr) |
| 返品ポリシー不満による注文放棄 | 15% | [Baymard Product Page 2026](https://baymard.com/blog/current-state-ecommerce-product-page-ux) |
| チェックアウトUX改善によるCV改善余地 | 最大+35.26% | Baymard |
| カルーセル操作率 / 2枚目以降到達 | 約1% / 0.5%未満 | [NN/g系研究](https://www.nngroup.com/articles/auto-forwarding/) |
| カルーセル実装を誤っているサイト | 75% | [Baymard Homepage](https://baymard.com/blog/ecommerce-homepage-ux) |
| 商品リストで複数サムネイル非提供 | 80% | [Baymard Product List 2025](https://baymard.com/blog/current-state-product-list-and-filtering) |
| 画像から実寸推測に失敗するユーザー | 42% | Baymard Product Page 2026 |
| Shop PayのCVリフト（ゲスト比 / 表示のみ） | 最大+50% / +5% | [Shopify](https://www.shopify.com/blog/shop-pay-checkout) |
| スティッキーCTAのモバイルCV押し上げ | +15〜20% | [mgroupweb](https://mgroupweb.com/blogs/shopify-product-page-optimization/) |
| CWV改善のCV効果（Rakuten 24） | +33.1% | [digitalapplied](https://www.digitalapplied.com/blog/page-speed-statistics-2026-revenue-impact) |
| トラストシグナル体系実装のCV改善 | +20〜35% | [XICTRON](https://www.xictron.com/en/blog/trust-signals-ecommerce-conversion-boost-2026/) |
| 星評価の最適レンジ（5.0満点より高CV） | 4.2〜4.7 | [rework](https://resources.rework.com/libraries/ecommerce-growth/trust-signals-social-proof) |

---

## 6. 実装チェックリスト（優先度順）

### P0 — CVR直結・工数小
- [ ] `index.html` 1枚目商品画像: `loading="lazy"` → `eager` + `fetchpriority="high"`（1-6）
- [ ] 全カード価格直下に「¥5,000以上で送料無料」併記（2-1）
- [ ] 商品詳細CTA直下に「🚚 3〜5営業日で発送 / 不良品交換OK」1行+特商法リンク（2-5）
- [ ] ドロワー「レジへ進む」直下にShopifyセキュア文言+カードロゴ（4-1）
- [ ] ドロワーに送料無料プログレスバー（3-2）
- [ ] カルーセル: ユーザー操作後の自動回転恒久停止（1-2）

### P1 — CVR直結・工数中
- [ ] 在庫無言クランプ検知トースト（3-4）
- [ ] モバイル商品詳細のスティッキー購入バー（2-5）
- [ ] カート編集の即時反映+Undoトースト（3-3）
- [ ] 売り切れ商品の「再入荷したら知らせて」CTA（2-3）
- [ ] ステッカーのサイズ感カット追加（PCに貼った実寸写真）+mm表記（2-2）
- [ ] Shopify設定: ゲスト購入+Shop Pay/Apple Pay/Google Pay（3-5）

### P2 — 公式らしさ・信頼の完成
- [ ] フッター法定4点セット完備（利用規約・運営会社ページ追加）+ダブル©表記（4-2）
- [ ] `#news` 日付付き運用ルール化（ネガティブ情報も掲載）（4-2）
- [ ] ガイド/FAQのヘッダー+フッター二重導線、FAQ4大質問（4-2）
- [ ] 「みんなの写真」UGCセクション（許諾済み実在ポストのみ）（2-6）
- [ ] カードホバーで2枚目画像切替（2-2）
- [ ] 偽サイト注意喚起ページ（4-2）

### やらないことリスト（アンチパターン）
- カテゴリページ・検索・フィルタ・ソート（SKU3点では純粋な摩擦）
- 初回訪問ポップアップ / メルマガモーダル / カウントダウン
- 偽の希少性演出（常に「残り3点」等）— 景表法リスク+信頼毀損
- 同格primary色の2CTA並置
- カート合計のフロント自前計算（cart.js設計原則で禁止済み）
- キャラ画像の隙間埋め装飾散らし / AI生成でのこすくま描き直し

---

## 出典一覧

**英語（研究機関・一次データ）**
- Baymard Institute: [Homepage UX Best Practices](https://baymard.com/blog/ecommerce-homepage-ux) / [Product Page UX Best Practices 2026](https://baymard.com/blog/current-state-ecommerce-product-page-ux) / [Product List UX Best Practices 2025](https://baymard.com/blog/current-state-product-list-and-filtering) / [50 Cart Abandonment Rate Statistics](https://baymard.com/lists/cart-abandonment-rate) / [35 Data-Driven Ecommerce Best Practices](https://baymard.com/learn/ecommerce-ux-best-practices)
- Nielsen Norman Group: [Auto-Forwarding Carousels Annoy Users](https://www.nngroup.com/articles/auto-forwarding/) / [Carousel Usability](https://www.nngroup.com/articles/designing-effective-carousels/) / [Trust and Credibility](https://www.nngroup.com/reports/ecommerce-ux-trust-and-credibility/) / [Product Pages incl. Reviews](https://www.nngroup.com/reports/ecommerce-ux-product-pages-including-reviews/)
- Shopify: [Shop Pay Checkout](https://www.shopify.com/blog/shop-pay-checkout) / [Accelerated Checkouts](https://help.shopify.com/en/manual/payments/accelerated-checkouts)
- CRO実務: [AB Tasty](https://www.abtasty.com/blog/shopping-cart-optimization/) / [CXL – Out of Stock Pages](https://cxl.com/blog/out-of-stock-product-pages/) / [The Gray Company](https://thegray.company/blog/permanently-temporarily-out-of-stock-products-ecommerce-seo-ux) / [VWO – Image Sliders](https://vwo.com/blog/image-slider-alternatives/) / [mgroupweb](https://mgroupweb.com/blogs/shopify-product-page-optimization/) / [XICTRON](https://www.xictron.com/en/blog/trust-signals-ecommerce-conversion-boost-2026/) / [FigPii](https://www.figpii.com/blog/trust-signals-in-e-commerce-conversion/) / [Build Grow Scale](https://buildgrowscale.com/trust-signals-ecommerce-conversion) / [rework](https://resources.rework.com/libraries/ecommerce-growth/trust-signals-social-proof) / [digitalapplied – Page Speed](https://www.digitalapplied.com/blog/page-speed-statistics-2026-revenue-impact)

**日本語（実務・実地調査）**
- [aiship – ECサイトCVR改善施策15選](https://www.aiship.jp/ec-column/cvr)（カゴ落ち理由43.3%=送料、業界別平均CVR）
- [ColorMe – ECサイトのCVRとは](https://shop-pro.jp/yomyom-colorme/99751) / [Dejam – カゴ落ち対策](https://leango.co.jp/dejam/blog/article0347/) / [ウルロジ – キャラクターグッズEC調査](https://ul-logi.jp/blog/logistics/charactergoods-ec/)
- 国内公式キャラEC実地調査（前回リサーチでWebFetch精読）: サンリオオンラインショップ / ちいかわマーケット / mofusandもふもふマーケット / ポケモンセンターオンライン

**関連ドキュメント**: 日本語タイポグラフィ（見出し改行・フキダシ・画像上テキスト）のルール群は前回リサーチのジャーナルに別途あり——実装フェーズで `text-wrap: pretty/balance` + `word-break: auto-phrase` + `lang="ja"` 必須の項を参照のこと。
