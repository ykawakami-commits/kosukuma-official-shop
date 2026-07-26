# こすくまくんのおみせ 全面リニューアル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存サイトを「構造は世界一退屈に、テキストは世界一こすくまくんに」の哲学で全面作り直し、聖域のジャイロ金平糖だけを温存再統合する。

**Architecture:** 静的HTML + vanilla JS + Shopify Storefront Cart API（フレームワーク・ビルド工程なし・現行構成維持）。標準EC複数ページ（トップ=一覧 / 商品詳細×3 / カートドロワー）。ドット絵はアクセント（背景帯・時間帯切替）、こすくまくん本体は公式クリーンスタイルで全ページの主役。声はGoogle Doc準拠モードAの静的書き下ろし＋軽い遊び（`js/fx/whimsy.js`）。

**Tech Stack:** HTML/CSS/vanilla JS(ESM)、Shopify Storefront API (`xdhx4j-1y.myshopify.com`, apiVersion `2025-04`)、three.js+Rapier（聖域hero-3d・importmap経由）、gpt-image-2 + claude-opus-4-8（事前生成ツールのみ）、sharp（WebP化）、puppeteer（e2e）

**Spec:** `docs/superpowers/specs/2026-07-26-shop-renewal-design.md`（同リポジトリ）

## Global Constraints

- 静的HTML + vanilla JS。フレームワーク導入・ビルド工程の新設は禁止
- **カートをフロントで自前計算しない。** 数量変更・削除も必ずShopify API経由（`js/cart.js`）
- **価格・通貨をフロントで捏造しない。** 表示は常にShopifyのMoney型（`formatMoney`）。JPYオンリー
- 商品の紐付けはhandle完全一致のみ（`js/config.js` の `PRODUCT_HANDLES`）。タイトル部分一致は禁止
- **コード不変で温存するファイル**: `js/fx/hero-3d.js` / `assets/3d/konpeito.glb` / `js/cart.js` / `js/storefront.js` / `js/config.js` / `js/kuma-anim.js` / `js/fx/motion.js`
- 演出はz-index階層表（`--z-fx:1 < --z-content:10 < --z-header:100 < --z-sticky:200 < --z-drawer:500 < --z-modal:600 < --z-toast:700`）より上に出さない。購入UIは聖域
- ブレークポイントは 640px / 900px 固定（css と `js/fx/motion.js` が単一情報源。独自の768等を作らない）
- 声のルール: モードA（元も子もない一言＋共犯構造＋断罪せず問う＋虚無を軽さに着地）。禁句=安っぽい希望（「いつか報われる」等）。冷笑にならない4条件: (a)共犯構造 (b)断罪せず問う (c)虚無を軽さに着地 (d)他人の価値観を否定して自分の安心を得ない
- 素材ルール: こすくまくんはドット絵にしない。同一コマアニメは1ページ1個まで。等身比率厳守（サイズ差の笑いは禁止）。AI生成は正典スペック+SELECT通過品のみ
- 遊び（時間帯背景・一言・昼寝）は装飾領域のみ。商品カード・価格・ボタンには一切触れない
- パフォーマンス: 画像はWebP/srcset・遅延ロード。世界観演出がページ速度・購入導線を犠牲にしない
- 日本語改行制御（kigyo-ip `mother/index.html` 方式を全ページ適用）: `word-break: keep-all` + `line-break: strict` + `overflow-wrap: break-word`（保険）。見出しは `text-wrap: balance`、本文は `text-wrap: pretty`
- ブランチ: `renewal-v2`（現行チェックアウト済み）。各タスク末にコミット（日本語conventional commits。例: `feat: トップページ全面リニューアル`）
- 商品マスタ（Shopify実データ。JSON-LD・静的价格表示と必ず一致させる）:
  - handle `こすくまくんステッカー` / slug `sticker` / ¥780 / InStock
  - handle `tシャツ` / slug `ultra-tshirt` / 表示名「ウルトラプレミアムTシャツ」/ ¥150,000 / SoldOut
  - handle `こすくまデコヘルメット` / slug `deco-helmet` / ¥109,000 / SoldOut
- 送料: 全国一律¥500・¥5,000以上で無料（`FREE_SHIPPING_THRESHOLD_JPY = 5000`）。発送3〜5日。返品7日以内（特商法表記 `legal/tokushoho.html` と同文必須）

---

### Task 1: 生成パイプライン基盤 + 参照アセット移管

**Files:**
- Create: `tools/gen-kosukuma.mjs`
- Create: `tools/refs/identity/01-front.png` / `02-threequarter.png` / `04-gorogoro.png` / `06-charsheet.png`（`D:/ダウンロード/motomokonai-kosukuma/public/refs/` からコピー）
- Create: `tools/refs/style/base-map-day.png`（`D:/ダウンロード/ip-proposal/mother/assets/base-map-day.png` からコピー）
- Modify: `package.json`（scripts に `gen` 追加）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: CLI `node tools/gen-kosukuma.mjs list|run <target...>|run all`。生成対象ID: `pose:shopkeeper` `pose:guide` `pose:register` `pose:lost` `pose:campfire` `pose:sleeping` `bg:evening` `bg:night`。出力: `assets/gen/kuma-*.webp`（透過・600px幅）+ `assets/pixel/bg-{evening,night}-1536.webp` / `-768.webp`。Task 2 がこれを実行する

- [ ] **Step 1: 参照アセットをコピー**

```bash
cd /d/ダウンロード/kosukuma-official-shop
mkdir -p tools/refs/identity tools/refs/style assets/gen assets/pixel
cp /d/ダウンロード/motomokonai-kosukuma/public/refs/01-front.png tools/refs/identity/
cp /d/ダウンロード/motomokonai-kosukuma/public/refs/02-threequarter.png tools/refs/identity/
cp /d/ダウンロード/motomokonai-kosukuma/public/refs/04-gorogoro.png tools/refs/identity/
cp /d/ダウンロード/motomokonai-kosukuma/public/refs/06-charsheet.png tools/refs/identity/
cp /d/ダウンロード/ip-proposal/mother/assets/base-map-day.png tools/refs/style/
ls tools/refs/identity tools/refs/style
```

Expected: identity に4ファイル、style に1ファイル

- [ ] **Step 2: `tools/gen-kosukuma.mjs` を作成（全文）**

```js
#!/usr/bin/env node
// tools/gen-kosukuma.mjs — こすくまポーズ/時間帯背景の事前生成ツール
// おしゃべり(motomokonai-kosukuma)の漫画生成ロジック移植:
//   正典スペック(MOUTH_BAN)二重配置 + 参照画像つき gpt-image-2(images.edit) best-of-2 並列生成
//   → claude-opus-4-8 による SELECT 比較選抜（破綻基準A〜E移植）。
// サイト実行時には生成しない。事前生成して assets/ に焼く運用。
//
// 使い方:
//   node tools/gen-kosukuma.mjs list                  # 生成対象と環境変数の確認
//   node tools/gen-kosukuma.mjs run pose:shopkeeper   # 個別生成
//   node tools/gen-kosukuma.mjs run all               # 全生成
//   node tools/gen-kosukuma.mjs run pose:lost bg:night
//
// 環境変数: OPENAI_API_KEY（生成）/ ANTHROPIC_API_KEY（SELECT）
//   OPENAI_IMAGE_MODEL で生成モデル上書き可（既定 gpt-image-2）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF_IDENTITY = path.join(ROOT, 'tools/refs/identity');
const REF_STYLE = path.join(ROOT, 'tools/refs/style');
const OUT_POSE = path.join(ROOT, 'assets', 'gen');
const OUT_BG = path.join(ROOT, 'assets', 'pixel');

// ── 正典スペック（qcLoop.ts MOUTH_BAN 移植・カラー公式スタイル版）──
// AIは中盤の指示を無視しがちなので先頭＋末尾に二重配置する（[[feedback_prompt_position]]）
const MOUTH_BAN =
  "TOP RULE (absolute): Kosukuma's face consists of EXACTLY three tiny marks — two small round dot-eyes plus one tiny flat OVAL nose (a simple small horizontal ellipse, about half the size of one eye) sitting just below the midpoint between the eyes — and NOTHING else, exactly like the reference stamps. The nose is REQUIRED whenever his face is visible, and it is a plain flat oval dot: NOT an omega, NOT a wavy line, NOT a 'w' shape, NOT a curve — never draw any wavy or w-shaped mark on his face. He is MOUTHLESS: draw NO mouth, NO lips, NO smile, NO teeth, NO open mouth anywhere on Kosukuma. His rear has exactly ONE small round tail — never two. The mole is ONE small FLAT black dot printed on his fur on the LOWER SIDE of his round torso (the hip/rear area): put it on the right hip when the right hip is visible, otherwise on the left hip — always on whichever hip side faces the viewer. NEVER draw the mole on his feet, legs, paws, tail, face or chest — it sits on the round body ABOVE the leg line, and it is flat, not a bump. ";

const POSE_STYLE =
  " STYLE: the official Kosukuma look — a simple white cream-colored round marshmallow mascot bear with short limbs, small round ears and one small round tail, minimal clean shapes, thin dark outline, soft flat colors. Match the reference stamps exactly. Do NOT make him pixel art, do NOT redesign him, do NOT make a generic cute sticker of a different bear. Full body visible, on a TRANSPARENT background (alpha channel, no backdrop).";

const BG_STYLE =
  " STYLE: 16-bit pixel art in EXACTLY the same style, palette and scene composition as the reference image (the camper van by the river with the village, bridge and mountains). Chunky visible pixels, consistent dithering, same camera angle and layout. Do NOT draw any characters, bears, people or animals in the scene — landscape only.";

// ── 生成対象 ──
const TARGETS = {
  'pose:shopkeeper': {
    kind: 'pose', out: 'kuma-shopkeeper',
    brief: 'Kosukuma standing calmly behind a small wooden market-stall counter, front view, deadpan relaxed face, one paw resting on the counter. A tiny wooden shop stall feeling, but the stall itself is minimal so Kosukuma is the clear main subject.',
  },
  'pose:guide': {
    kind: 'pose', out: 'kuma-guide',
    brief: 'Kosukuma standing in three-quarter view, one paw raised sideways in a gentle "this way / this one" presenting gesture, calm deadpan face. He looks like a quiet shop guide showing a product.',
  },
  'pose:register': {
    kind: 'pose', out: 'kuma-register',
    brief: 'Kosukuma sitting behind a small wooden cash-register counter with a tiny old-fashioned till, front view, deadpan calm face, like a quiet cashier waiting.',
  },
  'pose:lost': {
    kind: 'pose', out: 'kuma-lost',
    brief: 'Kosukuma standing and holding an unfolded paper map with both paws, head slightly tilted, looking around as if lost. Still deadpan, not panicking.',
  },
  'pose:campfire': {
    kind: 'pose', out: 'kuma-campfire',
    brief: 'Kosukuma sitting on the ground beside a small cozy campfire (logs and gentle flames included in the image), warm orange light softly lighting his body, night calm mood, deadpan relaxed face, looking at the fire.',
  },
  'pose:sleeping': {
    kind: 'pose', out: 'kuma-sleeping',
    brief: 'Kosukuma lying on his side peacefully asleep, curled slightly, calm sleeping face (still just two dot eyes closed as small curves are NOT allowed — keep the two dot eyes and the flat oval nose only, no mouth), one small round tail visible with the flat mole on the visible hip.',
  },
  'bg:evening': {
    kind: 'bg', out: 'bg-evening',
    brief: 'The same camper-van-by-the-river scene at sunset: warm orange and pink sky, long soft shadows, golden light on the grass, the village windows starting to glow faintly.',
  },
  'bg:night': {
    kind: 'bg', out: 'bg-night',
    brief: 'The same camper-van-by-the-river scene at night: deep dark blue sky with small stars, the scene lit mainly by a warm glowing campfire in front of the van and soft warm window light from the van, moonlit river reflections.',
  },
};

// ── SELECT（比較選抜）: qcLoop.ts SELECT_SYSTEM 移植 ──
const SELECT_SYSTEM = `あなたは「元も子もないこすくまくん」公式ショップの編集者。2枚の候補から【使える方】を1枚選ぶ。
まず各候補が重大破綻を持つか判定する：
A. 別キャラ化（小さな点目でない／顔が見える向きなのに鼻が欠落／鼻の形の誤り【正=小さな横長だえん。ω・波線・"w"型は全てNG】／しっぽが2個以上／ほくろの位置誤り【正=見えているお尻〜腰の側面下部の平らな点1つ。足・脚・しっぽ・顔・胸はNG】）
B. 口が描かれている（最重要禁止。小さなだえんの鼻はOK・それ以外の口状の線は全てNG）
C. 画風不一致（ポーズ=公式のクリーンなスタイルでない・ドット絵化している／背景=参照と同じドット絵の風景・構図でない）
D. 指定シチュエーションからの逸脱（ブリーフに書かれたポーズ・場面になっていない）
E. （背景のみ）キャラクター・人・動物が描き込まれている
破綻は失格。残った候補を「公式らしさ・用途への合致・絵としての品質」で比較して勝者を選ぶ。
両方健全なら品質の高い方。両方破綻なら破綻の軽い方を winner にし bothBroken=true。
JSONだけ返す：{"winner":0|1,"bothBroken":boolean,"reason":"..."}`;

function needEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が未設定です`);
  return v;
}

async function genWithRefs({ prompt, refPaths, transparent, size = '1024x1024' }) {
  const form = new FormData();
  form.set('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
  for (const p of refPaths) {
    const buf = await readFile(p);
    form.append('image[]', new Blob([buf], { type: 'image/png' }), path.basename(p));
  }
  form.set('prompt', prompt);
  form.set('size', size);
  form.set('quality', 'high');
  if (transparent) form.set('background', 'transparent');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { authorization: `Bearer ${needEnv('OPENAI_API_KEY')}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI images.edits ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('画像生成の応答に b64_json がありません');
  return b64;
}

async function selectWinner({ candidates, refPaths, brief }) {
  const content = [];
  for (const p of refPaths) {
    content.push({ type: 'text', text: `【参照: ${path.basename(p)}】` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: (await readFile(p)).toString('base64') } });
  }
  content.push({ type: 'text', text: `【ブリーフ】${brief}` });
  content.push({ type: 'text', text: '【候補0】' });
  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: candidates[0] } });
  content.push({ type: 'text', text: '【候補1】' });
  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: candidates[1] } });
  content.push({ type: 'text', text: '2枚を比較し、winner(0か1) / bothBroken / reason をJSONだけで返して。' });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': needEnv('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 800,
      system: SELECT_SYSTEM,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic SELECT ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  const v = m ? JSON.parse(m[0]) : null;
  if (!v || (v.winner !== 0 && v.winner !== 1)) {
    return { winner: 0, bothBroken: false, reason: 'SELECT判定不能につき候補0採用（フェイルクローズ）' };
  }
  return v;
}

async function runTarget(id) {
  const t = TARGETS[id];
  if (!t) throw new Error(`未知の生成対象: ${id}`);
  const isPose = t.kind === 'pose';
  const refPaths = isPose
    ? ['01-front.png', '02-threequarter.png', '04-gorogoro.png', '06-charsheet.png'].map((f) => path.join(REF_IDENTITY, f))
    : [path.join(REF_STYLE, 'base-map-day.png')];
  const prompt = isPose
    ? MOUTH_BAN + t.brief + POSE_STYLE + '\n\n' + MOUTH_BAN
    : t.brief + BG_STYLE;
  console.log(`[gen] ${id} を2枚並列生成中...`);
  const size = isPose ? '1024x1024' : '1536x1024';
  const genOpts = { prompt, refPaths, transparent: isPose, size };
  let candidates;
  try {
    candidates = await Promise.all([genWithRefs(genOpts), genWithRefs(genOpts)]);
  } catch (e) {
    // 1536x1024 非対応モデルなら正方形にフォールバック（アスペクトは sharp 側でトリミングしない＝指定サイズで生成されない場合の保険）
    if (!isPose && /size|invalid|unsupported/i.test(e.message)) {
      console.log('[gen] 1536x1024 非対応のため 1024x1024 にフォールバック');
      const fb = { ...genOpts, size: '1024x1024' };
      candidates = await Promise.all([genWithRefs(fb), genWithRefs(fb)]);
    } else {
      throw e;
    }
  }
  console.log(`[gen] ${id} を SELECT 中...`);
  const sel = await selectWinner({ candidates, refPaths, brief: t.brief });
  console.log(`[gen] ${id} → 候補${sel.winner} 採用 (${sel.reason})${sel.bothBroken ? ' ※両方破綻・軽い方' : ''}`);
  const winner = Buffer.from(candidates[sel.winner] ?? candidates[0], 'base64');
  const outDir = isPose ? OUT_POSE : OUT_BG;
  await mkdir(outDir, { recursive: true });
  const pngPath = path.join(outDir, `${t.out}.png`);
  await writeFile(pngPath, winner);

  // WebP化（sharp）。ポーズは600px幅透過webp、背景は1536px/768pxの2幅
  const sharp = (await import('sharp')).default;
  if (isPose) {
    await sharp(winner).resize({ width: 600 }).webp({ quality: 88, alphaQuality: 95 }).toFile(path.join(outDir, `${t.out}.webp`));
    console.log(`[gen] → assets/gen/${t.out}.webp (+ png master)`);
  } else {
    // ドット絵は滲ませない（nearest kernel）。生成が既に1536幅なら拡大しない
    await sharp(winner).resize({ width: 1536, withoutEnlargement: true, kernel: 'nearest' }).webp({ quality: 82 }).toFile(path.join(outDir, `${t.out}-1536.webp`));
    await sharp(winner).resize({ width: 768, withoutEnlargement: true, kernel: 'nearest' }).webp({ quality: 82 }).toFile(path.join(outDir, `${t.out}-768.webp`));
    console.log(`[gen] → assets/pixel/${t.out}-{1536,768}.webp (+ png master)`);
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'list' || !cmd) {
    console.log('生成対象:');
    for (const [id, t] of Object.entries(TARGETS)) console.log(`  ${id} → ${t.kind === 'pose' ? 'assets/gen' : 'assets/pixel'}/${t.out}`);
    console.log(`環境: OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? '設定済み' : '未設定'} ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? '設定済み' : '未設定'} model=${process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'}`);
    return;
  }
  if (cmd === 'run') {
    const ids = args.includes('all') ? Object.keys(TARGETS) : args;
    if (ids.length === 0) throw new Error('run には対象IDか all を指定してください');
    for (const id of ids) await runTarget(id);
    return;
  }
  throw new Error(`未知のコマンド: ${cmd}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
```

- [ ] **Step 3: 構文チェックと list 動作確認**

Run:
```bash
cd /d/ダウンロード/kosukuma-official-shop
node --check tools/gen-kosukuma.mjs
node tools/gen-kosukuma.mjs list
```
Expected: 構文エラーなし。8対象の一覧と環境変数状況が表示される（APIキー未設定でも list は動く）

- [ ] **Step 4: package.json に gen スクリプト追加**

`"scripts"` に1行追加:
```json
"gen": "node tools/gen-kosukuma.mjs"
```

- [ ] **Step 5: Commit**

```bash
git add tools/gen-kosukuma.mjs tools/refs assets/gen assets/pixel package.json
git commit -m "feat: 生成パイプライン基盤（gen-kosukuma.mjs）＋参照アセット移管"
```

---

### Task 2: ポーズ＆時間帯背景の生成実行

**Files:**
- Create: `assets/gen/kuma-{shopkeeper,guide,register,lost,campfire,sleeping}.webp` + `.png`（マスター）
- Create: `assets/pixel/bg-day-{1536,768}.webp`（`tools/refs/style/base-map-day.png` からの変換）
- Create: `assets/pixel/bg-{evening,night}-{1536,768}.webp` + `.png`（生成）

**Interfaces:**
- Consumes: Task 1 の `tools/gen-kosukuma.mjs`
- Produces: サイトが参照する最終アセットURL — `/assets/gen/kuma-shopkeeper.webp` `/assets/gen/kuma-guide.webp` `/assets/gen/kuma-register.webp` `/assets/gen/kuma-lost.webp` `/assets/gen/kuma-campfire.webp` `/assets/gen/kuma-sleeping.webp` `/assets/pixel/bg-day-768.webp` `/assets/pixel/bg-day-1536.webp` `/assets/pixel/bg-evening-768.webp` `/assets/pixel/bg-evening-1536.webp` `/assets/pixel/bg-night-768.webp` `/assets/pixel/bg-night-1536.webp`

- [ ] **Step 1: APIキーの確認**

`node tools/gen-kosukuma.mjs list` で両方「設定済み」であること。未設定なら **ユーザーにキーの場所を確認する**（推測で探さない。`D:/ダウンロード/motomokonai-kosukuma/` の環境設定にOPENAI_API_KEYがある可能性が高い）。キーが用意できない場合はこのタスクをブロックしてユーザーに報告。

- [ ] **Step 2: 昼背景のWebP変換（生成不要・既存素材から）**

```bash
cd /d/ダウンロード/kosukuma-official-shop
node -e "import('sharp').then(async ({default: s}) => { const b = await import('node:fs/promises').then(fs => fs.readFile('tools/refs/style/base-map-day.png')); await s(b).resize({width:1536}).webp({quality:82}).toFile('assets/pixel/bg-day-1536.webp'); await s(b).resize({width:768}).webp({quality:82}).toFile('assets/pixel/bg-day-768.webp'); })"
```

- [ ] **Step 3: 生成実行（ポーズ6 + 背景2）**

```bash
node tools/gen-kosukuma.mjs run pose:shopkeeper pose:guide pose:register
node tools/gen-kosukuma.mjs run pose:lost pose:campfire pose:sleeping
node tools/gen-kosukuma.mjs run bg:evening bg:night
```

Expected: 各対象で `候補N 採用` のログと webp 出力。失敗（ネットワーク/レート制限）は該当対象だけ再実行する（`run pose:guide` のように個別指定）

- [ ] **Step 4: 目視検証（必須）**

生成物を1枚ずつ ReadMediaFile で開き、以下を確認:
- ポーズ: 点目2つ＋横長だえんの鼻・口なし・しっぽ1個・ほくろ位置・透過背景・ドット絵化していない
- 背景: base-map-day と同じ構図（キャンプ車・川・橋・山）の夕/夜版。夜に焚き火があること。キャラが描き込まれていないこと

不合格があれば該当対象を再生成（プロンプトのbriefを微調整してから `run` し直す）。**SELECT通過品でも目視で落としてよい**

- [ ] **Step 5: Commit**

```bash
git add assets/gen assets/pixel
git commit -m "feat: こすくまポーズ6種＆時間帯背景（昼/夕/夜）を生成"
```

---

### Task 3: トップページ全面改修（e2e新構造化 → CSS → index.html → JS 3本）

**Files:**
- Modify: `tools/e2e.mjs`（新構造のチェックに全面更新。先に書いてFAILさせる）
- Create: `css/tokens.css`（全面書き換え）
- Create: `css/main.css`（全面書き換え）
- Create: `index.html`（全面書き換え）
- Create: `js/ui.js`（全面書き換え）
- Create: `js/main.js`（全面書き換え）
- Create: `js/fx/whimsy.js`（新規）

**Interfaces:**
- Consumes: `js/cart.js`（`getCart/onCartChange/restoreCart/addLine/updateLineQuantity/removeLine/getCheckoutUrl`）、`js/storefront.js`（`fetchProductsByHandles/formatMoney`）、`js/config.js`（`PRODUCT_HANDLES/FREE_SHIPPING_THRESHOLD_JPY`）、`js/kuma-anim.js`（`KumaAnim(container, name, opts)`、`.play()`）、`js/fx/motion.js`（`isMobile/prefersReducedMotion`）、`js/fx/hero-3d.js`（`initHero3D({mobile})`）
- Produces: DOM契約（Task 4の商品ページ・tools/e2e.mjs が依存）:
  - `[data-handle]`（article）配下: `[data-price]` / `[data-add-to-cart]`（hydrationで`data-variant-id`付与）/ `.status-chip` / `[data-soldout-stamp]` / `.restock-link` / `[data-stock-note]`
  - id: `cart-toggle` `cart-count` `sticky-cart` `sticky-cart-count` `cart-drawer` `cart-items` `cart-total-price` `btn-checkout` `shipping-meter-label` `shipping-meter-bar` `menu-btn` `menu-dialog` `toast-region` `hero-kuma` `gyro-btn` `hero-3d-canvas` `about-kaikai` `whimsy-line` `whimsy-kuma-img` `whimsy-kuma-anim` `products` `detail-main`(商品ページのみ)
  - `whimsy.js` エクスポート: `getBand()` / `initWhimsy()`（返り値: `'morning'|'day'|'evening'|'night'`）。`html[data-time]` は `'day'|'evening'|'night'`（背景切替用）

- [ ] **Step 1: `tools/e2e.mjs` を新構造に更新（先に書く・この時点でFAILするのが正しい）**

まず `tools/e2e.mjs` を全文Readし、**ハーネス部分（ローカルサーバ起動・puppeteer起動オプション・PASS/FAILレポーター）は温存**して、チェック群を以下に入れ替える（サーバ起動・ブラウザ起動・結果出力の既存関数名はそのまま使うこと）:

- **削除**: E1（イーロン「いいえ」拒否）、E2（Elon Musk+Floki成功）。イーロン売り場撤去のため
- **維持（セレクタのみ新DOMに合わせる）**: B1（`#p-sticker [data-add-to-cart]` をクリック→`#cart-count` が `1`）、B2（`#cart-toggle`→`#cart-drawer[open]`）、B3（`#cart-total-price` がShopify計算値 ¥780 と一致）、B4（`[data-delta="1"]`→数量2・合計 ¥1,560）、B5（`[data-remove]`→空表示 `.cart-empty` が見える＆「まだ何も入ってないよ」を含む）、B6（`#shipping-meter-label` に「あと」を含む）、C（`getCheckoutUrl` 相当のURLにHTTP 200）、D（402×874で `#btn-checkout` が完全視認）、F（幅 402/640/768/900/1280 で `document.documentElement.scrollWidth <= clientWidth+1`。対象: `/` と `/products/sticker.html`）、H（`#hero-3d-canvas` 初期化。既存ロジック流用）、I（ページ内全リソースの404ゼロ。対象: `/`・`/products/sticker.html`・`/products/ultra-tshirt.html`・`/products/deco-helmet.html`・`/404.html`）、J（`/legal/tokushoho.html`・`/legal/privacy.html` が200＋実内容）、A（JS例外0。hero-3d起因の既知除外は維持）
- **G（書き換え）**: JSON-LD ↔ Shopify実データの同期。対象4URL（`/`・商品3ページ）。Shopify実データはnodeから直接GraphQLクエリ:
```js
// G: JSON-LD ↔ Shopify 実データ同期（トップ + 全商品ページ）
import { SHOPIFY_CONFIG, PRODUCT_HANDLES } from '../js/config.js'; // ※e2e.mjs先頭のimport群に追加
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
// ページ側: 各URLをpage.gotoし、application/ld+json を JSON.parse → @graph 内 Product[] について
//   offers.price（数値化）と offers.availability（InStock=available true / OutOfStock=false）を
//   shopifyOffers() の値と name→handle 対応表（下記）で照合。不一致が1件でもFAIL。
// name→handle 対応表: { 'こすくまくんステッカー': 'こすくまくんステッカー', 'ウルトラプレミアムTシャツ': 'tシャツ', 'こすくまデコヘルメット': 'こすくまデコヘルメット' }
```
- **P1（新規）**: 商品3ページそれぞれで `h1`・`[data-price]`（¥表記）・`.detail-story`（20文字以上）が描画されている
- **P2（新規）**: `/` で `#whimsy-line` のテキストが非空、`document.documentElement.dataset.time` が `day|evening|night` のいずれか
- **P3（新規）**: 全対象ページで価格表示に「税込」を含む（`.tax` 要素の存在）

Run: `npm run e2e`
Expected: 新チェックが FAIL（まだ新ページが無いので当然）

- [ ] **Step 2: `css/tokens.css` を全面書き換え（全文）**

```css
/* css/tokens.css — デザイントークン（色/余白/z-index — 唯一の真実。生値ハードコード禁止） */
:root {
  /* 色ベース */
  --paper: #fffdf6;
  --cream: #fcfad2;
  --cream-deep: #f5f0bd;
  --ink: #3a3126;
  --ink-sub: #6f6759;
  /* アクセント */
  --honey: #d99a2b;
  --honey-deep: #8a5f14;
  --green: #5d7f4c;
  --green-deep: #4c6a3e;
  --brown: #7d5f37;
  --brown-dark: #4a3a22;
  --terracotta: #b0492f;
  /* disabled */
  --disabled-bg: #d9d4c2;
  --disabled-text: #6b6552;
  --disabled-border: #a39c85;
  /* 時間帯（whimsy.js が html[data-time] を day/evening/night で切替） */
  --sky-tint: rgba(255, 244, 200, 0);
  --band-bg: #f7f1d8;
  --band-ink: var(--ink);
  --hero-bg: image-set(
    url("/assets/pixel/bg-day-768.webp") 1x,
    url("/assets/pixel/bg-day-1536.webp") 2x
  );
}
html[data-time="evening"] {
  --sky-tint: rgba(255, 166, 88, 0.14);
  --band-bg: #f2dfc0;
  --band-ink: var(--ink);
  --hero-bg: image-set(
    url("/assets/pixel/bg-evening-768.webp") 1x,
    url("/assets/pixel/bg-evening-1536.webp") 2x
  );
}
html[data-time="night"] {
  --sky-tint: rgba(24, 34, 78, 0.22);
  --band-bg: #2b3350;
  --band-ink: #f4edd8;
  --hero-bg: image-set(
    url("/assets/pixel/bg-night-768.webp") 1x,
    url("/assets/pixel/bg-night-1536.webp") 2x
  );
}
:root {
  /* 字 */
  --font-body: "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif;
  --font-num: "Quicksand", "Zen Maru Gothic", sans-serif;
  --fs-hero: clamp(1.9rem, 1.2rem + 3vw, 3rem);
  --fs-h2: clamp(1.4rem, 1.1rem + 1.6vw, 2rem);
  --fs-h3: 1.15rem;
  --fs-body: 1rem;
  --fs-small: 0.85rem;
  --fs-label: 0.72rem;
  --fs-price: 1.3rem;
  /* 余白 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 28px;
  --space-5: 44px;
  --space-6: 64px;
  --gutter: clamp(20px, 4vw, 64px);
  --content-max: 1160px;
  /* 角丸・影 */
  --radius-s: 8px;
  --radius-m: 14px;
  --radius-l: 22px;
  --shadow-card: 0 2px 0 rgba(74, 58, 34, 0.12), 0 10px 24px rgba(74, 58, 34, 0.08);
  --shadow-pop: 0 6px 0 rgba(74, 58, 34, 0.16), 0 18px 40px rgba(74, 58, 34, 0.14);
  --press-shadow: 0 4px 0 var(--brown-dark);
  --press-shadow-down: 0 1px 0 var(--brown-dark);
  /* z-index階層表（厳格。この順より上に出さない。購入UIは聖域） */
  --z-fx: 1;
  --z-content: 10;
  --z-header: 100;
  --z-sticky: 200;
  --z-drawer: 500;
  --z-modal: 600;
  --z-toast: 700;
  /* ブレークポイント: 640px / 900px 固定（js/fx/motion.js と同一値・単一情報源。@mediaは変数不可のため各所に直書き） */
  /* モーション */
  --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-quick: 160ms;
  --dur-base: 280ms;
}
```

- [ ] **Step 3: `css/main.css` を全面書き換え（全文）**

`css/main.css`（全文）:

```css
/* css/main.css — コンポーネントCSS。トークンは css/tokens.css を使う（生値禁止） */
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--fs-body);
  color: var(--ink);
  background: var(--paper);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
img { max-width: 100%; height: auto; display: block; }
a { color: var(--green-deep); }
button { font-family: inherit; cursor: pointer; }
main { display: block; }
h1, h2, h3 { line-height: 1.35; margin: 0; }
p { margin: 0; }

/* ── 日本語改行制御（kigyo-ip方式: 文字間改行を抑止し句読点・括弧でのみ改行＋見出しbalance＋本文pretty） ── */
h1, h2, h3, .hero-sub, .product-oneliner, .detail-oneliner, .detail-story, .guide-item p,
.faq-item summary, .faq-a, .news-list p, .trust-item, .about-text, .balloon, #whimsy-line,
.footer-main li, .footer-main p, .cart-empty p, .drawer-note, .spec-table th, .spec-table td,
.ci-title, .toast {
  word-break: keep-all;
  line-break: strict;
  overflow-wrap: break-word; /* 保険: どうしても収まらない長文句のみ許す */
}
h1, h2, h3, .product-name, .faq-item summary { text-wrap: balance; }
.hero-sub, .product-oneliner, .detail-oneliner, .detail-story, .guide-item p, .news-list p,
.about-text, #whimsy-line, .cart-empty p, .spec-table td, .faq-a { text-wrap: pretty; }

.skip-link {
  position: absolute; left: -9999px; top: 0;
  background: var(--ink); color: var(--paper); padding: var(--space-2) var(--space-3);
  z-index: var(--z-toast);
}
.skip-link:focus { left: 0; }

/* ── お知らせバー（公式感: 重要告知1件） ── */
.announce-bar {
  background: var(--ink); color: var(--paper);
  text-align: center; font-size: var(--fs-small);
  padding: var(--space-2) var(--gutter);
}

/* ── ヘッダー ── */
.site-header {
  position: sticky; top: 0; z-index: var(--z-header);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--gutter);
  background: var(--paper);
  border-bottom: 2px solid var(--cream-deep);
}
.header-logo { display: flex; align-items: center; gap: var(--space-2); text-decoration: none; color: var(--ink); }
.header-logo img { width: 40px; height: 40px; }
.header-logo .logo-text { font-weight: 700; font-size: var(--fs-h3); }
.header-logo .logo-official {
  font-size: var(--fs-label); color: var(--paper); background: var(--green-deep);
  border-radius: var(--radius-s); padding: 2px 8px; letter-spacing: 0.08em;
}
.header-actions { display: flex; gap: var(--space-2); align-items: center; }
.icon-btn {
  position: relative; display: inline-flex; align-items: center; gap: var(--space-1);
  border: 2px solid var(--brown-dark); border-radius: var(--radius-m);
  background: var(--paper); color: var(--ink);
  padding: var(--space-2) var(--space-3); font-size: var(--fs-small); font-weight: 700;
}
.badge {
  position: absolute; top: -8px; right: -8px; min-width: 20px; height: 20px;
  border-radius: 999px; background: var(--terracotta); color: var(--paper);
  font-size: var(--fs-label); display: grid; place-items: center; padding: 0 5px;
}
.badge[hidden] { display: none; }

/* ── ヒーロー（ドット絵背景×公式こすくま×聖域金平糖） ── */
.hero { position: relative; overflow: hidden; }
.hero-fx {
  position: relative; z-index: var(--z-fx);
  height: min(72vw, 520px);
  background-image: var(--hero-bg);
  background-size: cover; background-position: center bottom;
  image-rendering: pixelated;
}
.hero-fx::after { /* 時間帯の色味調整（背景の上・コンテンツの下） */
  content: ""; position: absolute; inset: 0; background: var(--sky-tint); pointer-events: none;
}
#hero-3d-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-inner {
  position: relative; z-index: var(--z-content);
  margin: calc(-1 * var(--space-6)) auto 0;
  max-width: var(--content-max); padding: 0 var(--gutter);
  display: flex; justify-content: center;
}
.hero-panel {
  display: flex; align-items: center; gap: var(--space-4);
  background: var(--paper); border: 2px solid var(--brown-dark); border-radius: var(--radius-l);
  box-shadow: var(--shadow-pop);
  padding: var(--space-4) var(--space-5);
  max-width: 760px; width: 100%;
}
#hero-kuma { width: clamp(120px, 22vw, 200px); flex: none; }
.hero-copy h1 { font-size: var(--fs-hero); }
.hero-sub { margin-top: var(--space-2); color: var(--ink-sub); }
.hero-cta { margin-top: var(--space-4); display: inline-block; }
#gyro-btn {
  position: absolute; right: var(--gutter); bottom: var(--space-4); z-index: var(--z-content);
  border: 2px solid var(--brown-dark); border-radius: var(--radius-m);
  background: var(--cream); color: var(--ink); padding: var(--space-2) var(--space-3);
  font-size: var(--fs-small); font-weight: 700;
}

/* ── 信頼ストリップ（特商法と同文） ── */
.trust-strip {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2);
  max-width: var(--content-max); margin: var(--space-5) auto 0; padding: 0 var(--gutter);
}
.trust-strip .trust-item {
  background: var(--cream); border-radius: var(--radius-m);
  text-align: center; padding: var(--space-3) var(--space-2);
  font-size: var(--fs-small); font-weight: 700;
}
.trust-strip .trust-item small { display: block; color: var(--ink-sub); font-weight: 400; font-size: var(--fs-label); }

/* ── セクション共通 ── */
.section { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--gutter) 0; }
.section-head { margin-bottom: var(--space-4); }
.section-head h2 { font-size: var(--fs-h2); }
.section-lead { color: var(--ink-sub); margin-top: var(--space-1); }

/* ── お知らせ（公式感: 日付＋内容の退屈なリスト） ── */
.news-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--cream-deep); }
.news-list li {
  display: flex; gap: var(--space-3); align-items: baseline;
  padding: var(--space-3) 0; border-bottom: 1px solid var(--cream-deep);
}
.news-list time { flex: none; font-family: var(--font-num); font-size: var(--fs-small); color: var(--ink-sub); }

/* ── 商品グリッド（標準EC・退屈） ── */
.product-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4);
}
.product-card {
  background: var(--paper); border: 2px solid var(--cream-deep); border-radius: var(--radius-l);
  overflow: hidden; box-shadow: var(--shadow-card); display: flex; flex-direction: column;
}
.product-media { position: relative; display: block; background: var(--cream); aspect-ratio: 1; }
.product-media img { width: 100%; height: 100%; object-fit: cover; }
.product-media[data-img-fit="contain"] img { object-fit: contain; }
.status-chip {
  position: absolute; left: var(--space-2); top: var(--space-2);
  background: var(--paper); border: 1px solid var(--brown-dark); border-radius: 999px;
  font-size: var(--fs-label); font-weight: 700; padding: 2px 10px;
}
.status-chip.is-instock { color: var(--green-deep); }
.status-chip.is-soldout { color: var(--terracotta); }
[data-soldout-stamp] {
  position: absolute; right: var(--space-2); top: var(--space-2);
  background: var(--terracotta); color: var(--paper); border-radius: var(--radius-s);
  font-size: var(--fs-label); font-weight: 700; padding: 3px 10px; transform: rotate(6deg);
}
.product-body { padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); flex: 1; }
.product-name { font-size: var(--fs-h3); }
.product-name a { color: var(--ink); text-decoration: none; }
.product-name a:hover { text-decoration: underline; }
.product-oneliner { color: var(--ink-sub); font-size: var(--fs-small); min-height: 2.6em; }
.product-price { font-family: var(--font-num); font-size: var(--fs-price); font-weight: 700; }
.tax { font-size: var(--fs-label); color: var(--ink-sub); font-weight: 400; }
[data-stock-note] { font-size: var(--fs-label); color: var(--ink-sub); }
.card-actions { margin-top: auto; display: flex; gap: var(--space-2); align-items: center; }
.restock-link { font-size: var(--fs-small); }

/* ── ボタン（購入UIは聖域・退屈で押しやすく） ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1);
  border: 2px solid var(--brown-dark); border-radius: var(--radius-m);
  font-weight: 700; font-size: var(--fs-small);
  padding: var(--space-2) var(--space-4); text-decoration: none;
  transition: transform var(--dur-quick) var(--ease-pop);
}
.btn:active { transform: translateY(2px); }
.btn-primary { background: var(--honey); color: var(--ink); box-shadow: var(--press-shadow); }
.btn-primary:active { box-shadow: var(--press-shadow-down); }
.btn-ghost { background: var(--paper); color: var(--ink); }
.btn:disabled, .btn-primary:disabled {
  background: var(--disabled-bg); color: var(--disabled-text);
  border-color: var(--disabled-border); box-shadow: none; cursor: not-allowed;
}

/* ── about ── */
.about-wrap {
  display: flex; gap: var(--space-4); align-items: center;
  background: var(--cream); border-radius: var(--radius-l); padding: var(--space-4);
}
.about-wrap .about-anim { width: clamp(120px, 24vw, 220px); flex: none; }
.about-text { color: var(--ink); }

/* ── guide（標準ECのお買い物ガイド） ── */
.guide-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); }
.guide-item { background: var(--paper); border: 2px solid var(--cream-deep); border-radius: var(--radius-m); padding: var(--space-3); }
.guide-item h3 { font-size: var(--fs-body); margin-bottom: var(--space-1); }
.guide-item p { font-size: var(--fs-small); color: var(--ink-sub); }

/* ── faq ── */
.faq-item { border-bottom: 1px solid var(--cream-deep); }
.faq-item summary {
  cursor: pointer; font-weight: 700; padding: var(--space-3) 0; list-style: none;
}
.faq-item summary::before { content: "Q. "; color: var(--green-deep); }
.faq-item .faq-a { padding: 0 0 var(--space-3) 1.6em; color: var(--ink-sub); font-size: var(--fs-small); }
.faq-item .faq-a::before { content: "A. "; color: var(--honey-deep); font-weight: 700; margin-left: -2.2em; margin-right: 0.6em; }

/* ── フッター（時間帯バンド＋公式情報） ── */
.footer-band {
  margin-top: var(--space-6);
  background: var(--band-bg); color: var(--band-ink);
  display: flex; align-items: center; justify-content: center; gap: var(--space-4);
  padding: var(--space-5) var(--gutter);
  transition: background var(--dur-base);
}
.footer-band img, .footer-band #whimsy-kuma-anim { width: clamp(110px, 20vw, 180px); flex: none; }
#whimsy-line { font-size: var(--fs-small); max-width: 26em; }
.footer-main {
  background: var(--ink); color: var(--paper);
  padding: var(--space-5) var(--gutter);
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-4);
  font-size: var(--fs-small);
}
.footer-main a { color: var(--cream); }
.footer-main h3 { font-size: var(--fs-small); color: var(--cream-deep); margin-bottom: var(--space-2); letter-spacing: 0.08em; }
.footer-main ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.footer-copy { text-align: center; color: var(--ink-sub); font-size: var(--fs-label); padding: var(--space-3); background: var(--paper); }

/* ── ダイアログ（メニュー・カート） ── */
dialog {
  border: 2px solid var(--brown-dark); border-radius: var(--radius-l);
  background: var(--paper); color: var(--ink); padding: 0;
  max-width: min(92vw, 420px); width: 100%;
}
dialog::backdrop { background: rgba(58, 49, 38, 0.45); }
.dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3) var(--space-4); border-bottom: 2px solid var(--cream-deep);
}
.dialog-head h2 { font-size: var(--fs-h3); }
.dialog-body { padding: var(--space-4); }
#menu-dialog nav ul { list-style: none; margin: 0; padding: 0; display: grid; }
#menu-dialog nav a {
  display: block; padding: var(--space-3) var(--space-2); color: var(--ink); text-decoration: none;
  border-bottom: 1px solid var(--cream-deep); font-weight: 700;
}
#cart-drawer { margin-left: auto; margin-right: 0; height: 100%; max-height: none; border-radius: var(--radius-l) 0 0 var(--radius-l); z-index: var(--z-drawer); }
.drawer-kuma { width: 96px; margin: 0 auto; }
.cart-empty { text-align: center; color: var(--ink-sub); display: grid; gap: var(--space-3); justify-items: center; padding: var(--space-4) 0; }
#cart-items { display: grid; gap: var(--space-3); }
.cart-line { display: grid; grid-template-columns: 64px 1fr auto; gap: var(--space-2); align-items: center; border-bottom: 1px solid var(--cream-deep); padding-bottom: var(--space-3); }
.cart-line img { width: 64px; height: 64px; object-fit: cover; border-radius: var(--radius-s); background: var(--cream); }
.ci-title { font-size: var(--fs-small); font-weight: 700; }
.ci-qty { display: inline-flex; align-items: center; gap: var(--space-2); margin-top: var(--space-1); }
.ci-qty button {
  width: 28px; height: 28px; border: 2px solid var(--brown-dark); border-radius: var(--radius-s);
  background: var(--paper); font-weight: 700; line-height: 1;
}
.ci-price { font-family: var(--font-num); font-weight: 700; }
.ci-remove { border: none; background: none; color: var(--ink-sub); font-size: var(--fs-label); text-decoration: underline; padding: 0; margin-top: var(--space-1); }
#shipping-meter { margin: var(--space-4) 0; }
#shipping-meter-bar-wrap { height: 10px; background: var(--cream-deep); border-radius: 999px; overflow: hidden; margin-top: var(--space-1); }
#shipping-meter-bar { height: 100%; width: 0%; background: var(--green); border-radius: 999px; transition: width var(--dur-base); }
#shipping-meter-label { font-size: var(--fs-small); }
.cart-total { display: flex; justify-content: space-between; align-items: baseline; margin: var(--space-3) 0; }
#cart-total-price { font-family: var(--font-num); font-size: var(--fs-price); font-weight: 700; }
#btn-checkout { width: 100%; font-size: var(--fs-body); padding: var(--space-3); }
.drawer-note { text-align: center; color: var(--ink-sub); font-size: var(--fs-label); margin-top: var(--space-2); }

/* ── トースト ── */
#toast-region { position: fixed; left: 50%; bottom: var(--space-4); transform: translateX(-50%); z-index: var(--z-toast); display: grid; gap: var(--space-2); }
.toast {
  background: var(--ink); color: var(--paper); border-radius: var(--radius-m);
  padding: var(--space-2) var(--space-4); font-size: var(--fs-small);
  opacity: 0; transform: translateY(8px); transition: opacity var(--dur-quick), transform var(--dur-quick);
}
.toast.show { opacity: 1; transform: translateY(0); }

/* ── スティッキーカート ── */
#sticky-cart {
  position: fixed; right: var(--space-3); bottom: var(--space-3); z-index: var(--z-sticky);
  border: 2px solid var(--brown-dark); border-radius: 999px; background: var(--honey);
  padding: var(--space-3); box-shadow: var(--shadow-pop);
  opacity: 0; pointer-events: none; transform: translateY(12px);
  transition: opacity var(--dur-base), transform var(--dur-base);
}
#sticky-cart.show { opacity: 1; pointer-events: auto; transform: translateY(0); }

/* ── reveal（控えめな出現） ── */
.reveal { opacity: 0; transform: translateY(12px); transition: opacity var(--dur-base), transform var(--dur-base); }
.reveal.visible { opacity: 1; transform: translateY(0); }

/* ── 商品詳細ページ ── */
.breadcrumb { max-width: var(--content-max); margin: 0 auto; padding: var(--space-3) var(--gutter) 0; font-size: var(--fs-small); color: var(--ink-sub); }
.breadcrumb a { color: var(--green-deep); }
.product-detail {
  max-width: var(--content-max); margin: 0 auto; padding: var(--space-4) var(--gutter) 0;
  display: grid; grid-template-columns: 1.1fr 1fr; gap: var(--space-5); align-items: start;
}
.detail-media .main-img { background: var(--cream); border-radius: var(--radius-l); overflow: hidden; border: 2px solid var(--cream-deep); position: relative; }
.detail-thumbs { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
.detail-thumb { width: 72px; height: 72px; border: 2px solid var(--cream-deep); border-radius: var(--radius-s); background: var(--cream); padding: 0; overflow: hidden; }
.detail-thumb[aria-selected="true"] { border-color: var(--brown-dark); }
.detail-info { display: flex; flex-direction: column; gap: var(--space-3); }
.detail-info h1 { font-size: var(--fs-h2); }
.detail-oneliner { color: var(--ink-sub); }
.detail-price { font-family: var(--font-num); font-size: var(--fs-price); font-weight: 700; }
.detail-price .tax { font-size: var(--fs-label); font-weight: 400; color: var(--ink-sub); }
.detail-story { background: var(--cream); border-radius: var(--radius-m); padding: var(--space-3); }
.spec-table { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
.spec-table th, .spec-table td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--cream-deep); vertical-align: top; }
.spec-table th { color: var(--ink-sub); font-weight: 400; width: 7em; }
.detail-kuma { display: flex; gap: var(--space-3); align-items: center; margin-top: var(--space-2); }
.detail-kuma img { width: 96px; flex: none; }
.detail-kuma .balloon {
  background: var(--paper); border: 2px solid var(--brown-dark); border-radius: var(--radius-m);
  padding: var(--space-2) var(--space-3); font-size: var(--fs-small); position: relative;
}

/* ── レスポンシブ（640px / 900px 固定） ── */
@media (max-width: 900px) {
  .product-grid { grid-template-columns: repeat(2, 1fr); }
  .guide-grid { grid-template-columns: repeat(2, 1fr); }
  .footer-main { grid-template-columns: 1fr; }
  .product-detail { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .product-grid { grid-template-columns: 1fr; }
  .trust-strip { grid-template-columns: repeat(2, 1fr); }
  .hero-panel { flex-direction: column; text-align: center; padding: var(--space-3); gap: var(--space-2); }
  #hero-kuma { width: 128px; }
  .hero-fx { height: 88vw; }
  .footer-band { flex-direction: column; text-align: center; gap: var(--space-2); }
  #cart-drawer { max-width: 100vw; }
  .about-wrap { flex-direction: column; text-align: center; }
}

/* ── reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .reveal { opacity: 1; transform: none; transition: none; }
  .btn, .toast, #sticky-cart, #shipping-meter-bar { transition: none; }
}
```

- [ ] **Step 4: `index.html` を全面書き換え（全文）**

`index.html`（全文）:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>こすくまくんのおみせ｜公式グッズショップ</title>
<meta name="description" content="こすくまくんの公式グッズのおみせだよ。ぼくがすきなものだけ置いてあるよ。">
<link rel="canonical" href="https://kosukuma-official-shop.pages.dev/">
<meta property="og:type" content="website">
<meta property="og:title" content="こすくまくんのおみせ｜公式グッズショップ">
<meta property="og:description" content="こすくまくんの公式グッズのおみせだよ。ぼくがすきなものだけ置いてあるよ。">
<meta property="og:image" content="https://kosukuma-official-shop.pages.dev/assets/og.webp">
<meta property="og:url" content="https://kosukuma-official-shop.pages.dev/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Kosu_dot_kuma">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Zen+Maru+Gothic:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/main.css">
<script>
/* 時間帯の先行判定（背景のフラッシュ防止。whimsy.js と同じ帯ロジック） */
(() => { const h = new Date().getHours();
  const t = (h >= 16 && h < 19) ? 'evening' : (h >= 19 || h < 5) ? 'night' : 'day';
  document.documentElement.dataset.time = t; })();
/* JS死亡保険: reveal が残ったら全表示 */
window.__kosuRevealFallback = setTimeout(() => {
  document.querySelectorAll('.reveal:not(.visible)').forEach((el) => el.classList.add('visible'));
}, 4000);
</script>
<script type="importmap">
{ "imports": { "three": "/assets/vendor/three.module.js" } }
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OnlineStore",
      "name": "こすくまくんのおみせ",
      "url": "https://kosukuma-official-shop.pages.dev/",
      "parentOrganization": { "@type": "Organization", "name": "株式会社こす.くま" }
    },
    {
      "@type": "Product",
      "name": "こすくまくんステッカー",
      "url": "https://kosukuma-official-shop.pages.dev/products/sticker.html",
      "image": "https://kosukuma-official-shop.pages.dev/assets/img/kosukuma-sticker-main-800.webp",
      "offers": {
        "@type": "Offer", "price": 780, "priceCurrency": "JPY",
        "availability": "https://schema.org/InStock",
        "shippingDetails": { "@type": "OfferShippingDetails", "shippingRate": { "@type": "MonetaryAmount", "value": 500, "currency": "JPY" } },
        "hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy", "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow", "merchantReturnDays": 7 }
      }
    },
    {
      "@type": "Product",
      "name": "ウルトラプレミアムTシャツ",
      "url": "https://kosukuma-official-shop.pages.dev/products/ultra-tshirt.html",
      "image": "https://kosukuma-official-shop.pages.dev/assets/img/kosukuma-ultra-tshirt-1-800.webp",
      "offers": {
        "@type": "Offer", "price": 150000, "priceCurrency": "JPY",
        "availability": "https://schema.org/OutOfStock",
        "shippingDetails": { "@type": "OfferShippingDetails", "shippingRate": { "@type": "MonetaryAmount", "value": 500, "currency": "JPY" } },
        "hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy", "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow", "merchantReturnDays": 7 }
      }
    },
    {
      "@type": "Product",
      "name": "こすくまデコヘルメット",
      "url": "https://kosukuma-official-shop.pages.dev/products/deco-helmet.html",
      "image": "https://kosukuma-official-shop.pages.dev/assets/img/kosukuma-deco-helmet-800.webp",
      "offers": {
        "@type": "Offer", "price": 109000, "priceCurrency": "JPY",
        "availability": "https://schema.org/OutOfStock",
        "shippingDetails": { "@type": "OfferShippingDetails", "shippingRate": { "@type": "MonetaryAmount", "value": 500, "currency": "JPY" } },
        "hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy", "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow", "merchantReturnDays": 7 }
      }
    }
  ]
}
</script>
</head>
<body>
<a class="skip-link" href="#main">本文へスキップ</a>
<div class="announce-bar">¥5,000以上で送料無料だよ。ぼくが運ぶわけじゃないけどね</div>

<header class="site-header">
  <a class="header-logo" href="/">
    <img src="/assets/kosukuma/front.png" alt="こすくまくん" width="40" height="40">
    <span class="logo-text">こすくまくんのおみせ</span>
    <span class="logo-official">公式</span>
  </a>
  <div class="header-actions">
    <button class="icon-btn" id="cart-toggle" type="button" aria-label="カートを開く">
      レジ<span class="badge" id="cart-count" hidden>0</span>
    </button>
    <button class="icon-btn" id="menu-btn" type="button" aria-label="メニューを開く">メニュー</button>
  </div>
</header>

<main id="main">
  <!-- ヒーロー: 聖域の3D金平糖は .hero-fx 内の canvas にマウントされる -->
  <section class="hero">
    <div class="hero-fx">
      <canvas id="hero-3d-canvas"></canvas>
      <button id="gyro-btn" type="button" hidden>かたむけてあそぶ</button>
    </div>
    <div class="hero-inner">
      <div class="hero-panel">
        <img id="hero-kuma" src="/assets/gen/kuma-shopkeeper.webp" alt="店番をしているこすくまくん" width="200" height="200">
        <div class="hero-copy">
          <h1>こすくまくんのおみせ</h1>
          <p class="hero-sub">ぼくがすきなものだけ置いてあるよ。むりに買わなくていいよ。ぼくもむりしてないから</p>
          <a class="btn btn-primary hero-cta" href="#products">おみせを見る</a>
        </div>
      </div>
    </div>
  </section>

  <div class="trust-strip">
    <div class="trust-item">送料 全国一律 ¥500<small>どこでも同じだよ</small></div>
    <div class="trust-item">¥5,000以上で送料無料<small>タダって、いい言葉だよね</small></div>
    <div class="trust-item">発送まで 3〜5日<small>ぼくが歩いて届けるわけじゃないから</small></div>
    <div class="trust-item">返品 到着後7日以内<small>気が変わるのは、悪いことじゃないよ</small></div>
  </div>

  <!-- お知らせ（公式感: 日付＋内容の退屈なリスト） -->
  <section class="section reveal" id="news">
    <div class="section-head">
      <h2>お知らせ</h2>
    </div>
    <ul class="news-list">
      <li><time datetime="2026-07-26">2026.07.26</time><p>おみせが新しくなったよ。ぼくもまだ見慣れてなくて、ときどき迷うよ</p></li>
      <li><time datetime="2026-07-26">2026.07.26</time><p>発送は注文から3〜5日だよ。すこし待ってね</p></li>
      <li><time datetime="2026-07-26">2026.07.26</time><p>お問い合わせはメールで24時間受け付けてるよ。返事は営業日に、中の人が書くよ（<a href="mailto:info@kosukuma.com">info@kosukuma.com</a>）</p></li>
    </ul>
  </section>

  <!-- 商品一覧 -->
  <section class="section reveal" id="products">
    <div class="section-head">
      <h2>売ってるもの</h2>
      <p class="section-lead">3つだけだよ。多いと迷うでしょ。ぼくが迷うから</p>
    </div>
    <div class="product-grid">
      <article class="product-card" id="p-sticker" data-handle="こすくまくんステッカー">
        <a class="product-media" href="/products/sticker.html">
          <img src="/assets/img/kosukuma-sticker-main-800.webp" srcset="/assets/img/kosukuma-sticker-main-480.webp 480w, /assets/img/kosukuma-sticker-main-800.webp 800w" sizes="(max-width: 640px) 100vw, 33vw" alt="こすくまくんステッカー" loading="lazy">
          <span class="status-chip" hidden></span>
          <span data-soldout-stamp hidden></span>
        </a>
        <div class="product-body">
          <h3 class="product-name"><a href="/products/sticker.html">こすくまくんステッカー</a></h3>
          <p class="product-oneliner">はっても はがしても、ぼくはぼくだよ</p>
          <p class="product-price"><span data-price>¥780</span><span class="tax">（税込）</span></p>
          <p data-stock-note></p>
          <div class="card-actions">
            <button class="btn btn-primary" type="button" data-add-to-cart>カートに入れる</button>
            <a class="btn btn-ghost" href="/products/sticker.html">くわしく</a>
          </div>
          <a class="restock-link" href="mailto:info@kosukuma.com?subject=%E5%86%8D%E5%85%A5%E8%8D%B7%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B" hidden>再入荷のお知らせを聞いてみる</a>
        </div>
      </article>

      <article class="product-card" id="p-ultra-tshirt" data-handle="tシャツ">
        <a class="product-media" href="/products/ultra-tshirt.html">
          <img src="/assets/img/kosukuma-ultra-tshirt-1-800.webp" srcset="/assets/img/kosukuma-ultra-tshirt-1-480.webp 480w, /assets/img/kosukuma-ultra-tshirt-1-800.webp 800w" sizes="(max-width: 640px) 100vw, 33vw" alt="ウルトラプレミアムTシャツ" loading="lazy">
          <span class="status-chip" hidden></span>
          <span data-soldout-stamp hidden></span>
        </a>
        <div class="product-body">
          <h3 class="product-name"><a href="/products/ultra-tshirt.html">ウルトラプレミアムTシャツ</a></h3>
          <p class="product-oneliner">15万円。たかい？ ぼくもそう思うよ</p>
          <p class="product-price"><span data-price>¥150,000</span><span class="tax">（税込）</span></p>
          <p data-stock-note></p>
          <div class="card-actions">
            <button class="btn btn-primary" type="button" data-add-to-cart disabled>うりきれ</button>
            <a class="btn btn-ghost" href="/products/ultra-tshirt.html">くわしく</a>
          </div>
          <a class="restock-link" href="mailto:info@kosukuma.com?subject=%E5%86%8D%E5%85%A5%E8%8D%B7%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B" hidden>再入荷のお知らせを聞いてみる</a>
        </div>
      </article>

      <article class="product-card" id="p-deco-helmet" data-handle="こすくまデコヘルメット">
        <a class="product-media" href="/products/deco-helmet.html" data-img-fit="contain">
          <img src="/assets/img/kosukuma-deco-helmet-800.webp" srcset="/assets/img/kosukuma-deco-helmet-480.webp 480w, /assets/img/kosukuma-deco-helmet-800.webp 800w" sizes="(max-width: 640px) 100vw, 33vw" alt="こすくまデコヘルメット" loading="lazy">
          <span class="status-chip" hidden></span>
          <span data-soldout-stamp hidden></span>
        </a>
        <div class="product-body">
          <h3 class="product-name"><a href="/products/deco-helmet.html">こすくまデコヘルメット</a></h3>
          <p class="product-oneliner">頭はまもるよ。心はまもってくれないよ</p>
          <p class="product-price"><span data-price>¥109,000</span><span class="tax">（税込）</span></p>
          <p data-stock-note></p>
          <div class="card-actions">
            <button class="btn btn-primary" type="button" data-add-to-cart disabled>うりきれ</button>
            <a class="btn btn-ghost" href="/products/deco-helmet.html">くわしく</a>
          </div>
          <a class="restock-link" href="mailto:info@kosukuma.com?subject=%E5%86%8D%E5%85%A5%E8%8D%B7%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B" hidden>再入荷のお知らせを聞いてみる</a>
        </div>
      </article>
    </div>
  </section>

  <!-- about -->
  <section class="section reveal" id="about">
    <div class="section-head">
      <h2>こすくまくんについて</h2>
    </div>
    <div class="about-wrap">
      <div class="about-anim" id="about-kaikai" aria-hidden="true"></div>
      <p class="about-text">ぼく、こすくまくん。25歳。西荻窪に住んでる。はちみつと昼寝がすき。むずかしいことはわからないけど、店だけはちゃんとやってるよ。……たぶんね</p>
    </div>
  </section>

  <!-- お買い物ガイド（標準EC・退屈） -->
  <section class="section reveal" id="guide">
    <div class="section-head">
      <h2>とどくまでの話</h2>
    </div>
    <div class="guide-grid">
      <div class="guide-item"><h3>送料</h3><p>全国一律500円だよ。5,000円以上でタダになるよ</p></div>
      <div class="guide-item"><h3>発送</h3><p>注文から3〜5日で送るよ。そのくらい待ってね</p></div>
      <div class="guide-item"><h3>返品</h3><p>届いてから7日以内なら返品できるよ。詳しくは特商法のページを見てね</p></div>
      <div class="guide-item"><h3>支払い</h3><p>Shopifyのページで支払うよ。ぼくはお金に触らない主義だよ</p></div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="section reveal" id="faq">
    <div class="section-head">
      <h2>よくある質問と、ぼくの返事</h2>
    </div>
    <details class="faq-item">
      <summary>売り切れた商品は、また入るの？</summary>
      <p class="faq-a">たぶんね。決まったらこの店の「お知らせ」で言うよ。約束はしないよ。ぼく、約束苦手だから</p>
    </details>
    <details class="faq-item">
      <summary>ギフト包装はできる？</summary>
      <p class="faq-a">今はできないよ。ごめんね。ぼくも不器用だから、包装も不器用なんだ</p>
    </details>
    <details class="faq-item">
      <summary>問い合わせはどこから？</summary>
      <p class="faq-a"><a href="mailto:info@kosukuma.com">info@kosukuma.com</a> へメールしてね。24時間受け付けてるよ。返事は営業日に、中の人が書くよ</p>
    </details>
    <details class="faq-item" id="contact">
      <summary>金平糖は売ってないの？</summary>
      <p class="faq-a">ぼくのだよ。売り物じゃないよ。……わけてあげたいのは山々だけどね</p>
    </details>
  </section>
</main>

<!-- フッター（時間帯バンド＋公式情報） -->
<footer>
  <div class="footer-band">
    <img id="whimsy-kuma-img" src="/assets/kosukuma/front.png" alt="こすくまくん" width="160" height="160">
    <div id="whimsy-kuma-anim" hidden aria-hidden="true"></div>
    <p id="whimsy-line">……</p>
  </div>
  <div class="footer-main">
    <div>
      <h3>運営</h3>
      <p>株式会社こす.くま<br>東京都目黒区東山3丁目7-11 大橋会館205<br><a href="mailto:info@kosukuma.com">info@kosukuma.com</a></p>
    </div>
    <div>
      <h3>公式SNS</h3>
      <ul>
        <li><a href="https://x.com/Kosu_dot_kuma" rel="noopener">X（旧Twitter）@Kosu_dot_kuma</a></li>
        <li>ぼくの日々はこっちだよ</li>
      </ul>
    </div>
    <div>
      <h3>お店のルール</h3>
      <ul>
        <li><a href="/legal/tokushoho.html">特定商取引法に基づく表記</a></li>
        <li><a href="/legal/privacy.html">プライバシーポリシー</a></li>
        <li><a href="/#guide">とどくまでの話</a></li>
      </ul>
    </div>
  </div>
  <p class="footer-copy">© 2026 株式会社こす.くま ／ この店の言葉はぜんぶ、ぼくが言ってるよ。間違ってたらごめんね</p>
</footer>

<!-- メニュー -->
<dialog id="menu-dialog" aria-label="メニュー">
  <div class="dialog-head">
    <h2>メニュー</h2>
    <button class="icon-btn" type="button" data-close>とじる</button>
  </div>
  <div class="dialog-body">
    <nav>
      <ul>
        <li><a href="/#products">売ってるもの</a></li>
        <li><a href="/#news">お知らせ</a></li>
        <li><a href="/#about">こすくまくんについて</a></li>
        <li><a href="/#guide">とどくまでの話</a></li>
        <li><a href="/#faq">よくある質問</a></li>
        <li><a href="/legal/tokushoho.html">特定商取引法に基づく表記</a></li>
        <li><a href="/legal/privacy.html">プライバシーポリシー</a></li>
      </ul>
    </nav>
  </div>
</dialog>

<!-- カート（レジ） -->
<dialog id="cart-drawer" aria-label="カート">
  <div class="dialog-head">
    <h2>レジ</h2>
    <button class="icon-btn" type="button" data-close>とじる</button>
  </div>
  <div class="dialog-body">
    <div class="cart-empty" hidden>
      <img class="drawer-kuma" src="/assets/gen/kuma-register.webp" alt="レジ係のこすくまくん">
      <p>まだ何も入ってないよ。ぼくの店、見るだけでもいいんだよ。ぼくもよくやる</p>
    </div>
    <div id="cart-items"></div>
    <div id="shipping-meter" hidden>
      <p id="shipping-meter-label"></p>
      <div id="shipping-meter-bar-wrap"><div id="shipping-meter-bar"></div></div>
    </div>
    <div class="cart-total" id="cart-total" hidden>
      <span>合計</span><span id="cart-total-price"></span>
    </div>
    <button class="btn btn-primary" id="btn-checkout" type="button" hidden>レジにすすむ</button>
    <p class="drawer-note">ここから先はShopifyさんの担当だよ。ぼくより確かだよ</p>
  </div>
</dialog>

<button id="sticky-cart" type="button" aria-label="カートを開く">レジ<span class="badge" id="sticky-cart-count" hidden>0</span></button>
<div id="toast-region" aria-live="polite"></div>

<script type="module" src="/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: `js/ui.js` を全面書き換え（全文）**

`js/ui.js`（全文）:

```js
// js/ui.js — 画面配線（ドロワー/トースト/hydration/reveal/サムネ切替）
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

// ── 売り切れスタンプ文言（商品ごとの遊び。在庫情報そのものはShopifyが真実） ──
const SOLDOUT_LABELS = {
  'こすくまデコヘルメット': 'たびだっていったよ',
};
const soldoutLabel = (handle) => SOLDOUT_LABELS[handle] ?? 'うりきれちゃった';

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
function renderCart() {
  const c = cart.getCart();
  const items = document.getElementById('cart-items');
  if (!items) return;
  const empty = document.querySelector('.cart-empty');
  const meter = document.getElementById('shipping-meter');
  const totalWrap = document.getElementById('cart-total');
  const checkout = document.getElementById('btn-checkout');
  const lines = c?.lines?.nodes ?? [];

  // バッジ（ヘッダー＋スティッキー）
  const qty = c?.totalQuantity ?? 0;
  for (const id of ['cart-count', 'sticky-cart-count']) {
    const badge = document.getElementById(id);
    if (badge) {
      badge.textContent = String(qty);
      badge.hidden = qty === 0;
    }
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
    const q = document.createElement('span');
    q.textContent = String(line.quantity);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '＋';
    plus.dataset.line = line.id; plus.dataset.delta = '1';
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
}

// ── カート操作（全てShopify API経由。フロントで金額計算しない） ──
function initCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  const open = () => { renderCart(); drawer.showModal(); };
  document.getElementById('cart-toggle')?.addEventListener('click', open);
  document.getElementById('sticky-cart')?.addEventListener('click', open);

  const mutating = new Set(); // ライン単位の二重送信ガード

  document.getElementById('cart-items')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const lineId = btn.dataset.line;
    if (!lineId || mutating.has(lineId)) return; // 連打による二重送信ガード（stale数量のPUT防止）
    mutating.add(lineId);
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
      const stamp = el.querySelector('[data-soldout-stamp]');
      const restock = el.querySelector('.restock-link');
      const note = el.querySelector('[data-stock-note]');
      if (chip) chip.hidden = false;
      if (p.availableForSale && p.variantId) {
        if (btn) { btn.disabled = false; btn.dataset.variantId = p.variantId; btn.textContent = 'カートに入れる'; }
        if (chip) { chip.textContent = 'あるよ'; chip.classList.add('is-instock'); }
        if (stamp) stamp.hidden = true;
        if (restock) restock.hidden = true;
      } else {
        if (btn) { btn.disabled = true; btn.textContent = 'うりきれ'; }
        if (chip) { chip.textContent = 'うりきれ'; chip.classList.add('is-soldout'); }
        if (stamp) { stamp.hidden = false; stamp.textContent = soldoutLabel(p.handle); }
        if (restock) restock.hidden = false;
        if (note) note.textContent = '戻ってきたら、ここで言うよ';
      }
    });
  }
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

// ── reveal（控えめな出現）＋ JS死亡保険の解除 ──
function initReveal() {
  if (window.__kosuRevealFallback) clearTimeout(window.__kosuRevealFallback);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

// ── スティッキーカート（ヒーローが見えなくなったら出す） ──
function initStickyCart() {
  const sticky = document.getElementById('sticky-cart');
  const hero = document.querySelector('.hero');
  if (!sticky || !hero) return;
  new IntersectionObserver((entries) => {
    sticky.classList.toggle('show', !entries[0].isIntersecting);
  }).observe(hero);
}

export async function initUI() {
  initDialogs();
  initCartDrawer();
  initAddButtons();
  initThumbs();
  initReveal();
  initStickyCart();
  renderCart();
  await Promise.allSettled([
    cart.restoreCart().then(() => renderCart()),
    hydrateProducts(),
  ]);
}
```

- [ ] **Step 6: `js/main.js` を全面書き換え（全文）**

```js
// js/main.js — エントリポイント
import { initUI } from './ui.js';
import { initWhimsy } from './fx/whimsy.js';
import { isMobile, prefersReducedMotion } from './fx/motion.js';
// ※ hero-3d.js は static import しない: bare specifier `three` を引くため、
//   importmap の無い商品ページでモジュール解決が失敗し全JSが死ぬ。動的 import で遅延ロードする

initUI();
const band = initWhimsy();

// コマアニメ遅延ロード（公式ルール: 同一アニメは1ページ1個まで）
// prefers-reduced-motion 時はアニメを起動しない（静止画像のまま。前庭障害系 a11y）
async function lazyKumaAnim(id, name) {
  const el = document.getElementById(id);
  if (!el) return;
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const { KumaAnim } = await import('./kuma-anim.js');
    new KumaAnim(el, name).play();
  }, { rootMargin: '10% 0px' });
  io.observe(el);
}
if (!prefersReducedMotion()) {
  lazyKumaAnim('about-kaikai', 'kaikai');
  if (band === 'night') lazyKumaAnim('whimsy-kuma-anim', 'utouto');
}

// 聖域: ジャイロ金平糖（トップページのみ。アイドル時に遅延初期化。モバイル前提の機能）
// prefers-reduced-motion 時は起動しない（常時動く3Dのため）
if (document.querySelector('.hero') && !prefersReducedMotion()) {
  const start3d = async () => {
    const { initHero3D } = await import('./fx/hero-3d.js').catch(() => ({}));
    if (initHero3D) initHero3D({ mobile: isMobile() });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(() => { start3d(); }, { timeout: 2500 });
  else setTimeout(() => { start3d(); }, 800);
}
```

- [ ] **Step 7: `js/fx/whimsy.js` を新規作成（全文）**

```js
// js/fx/whimsy.js — 軽い遊び（時間帯の背景/一言/姿、ごく稀な昼寝）
// 遊びは装飾領域（ヒーロー端・フッター・背景帯）のみ。商品カード・価格・ボタンには一切触れない。
const LINES = {
  morning: 'おはよう。ぼくはまだ半分ねてるよ',
  day: '昼だよ。ぼくは金平糖の食べる順番を考えてるよ',
  evening: '夕方って、なんとなく人を褒めたくなるよ。今日も生きてたよ。えらいよ',
  night: '夜だよ。焚き火の前だと本音がぽろりって出るよ。……ぼくはまあまあ楽しかったよ',
};

export function getBand() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

export function initWhimsy() {
  const band = getBand();
  // 背景用の data-time は <head> の先行スクリプトが設定済み。未設定時の保険
  document.documentElement.dataset.time ||= band === 'morning' ? 'day' : band;

  // フッター一言
  const line = document.getElementById('whimsy-line');
  if (line) line.textContent = LINES[band];

  // フッターの姿（夜は main.js が utouto アニメを #whimsy-kuma-anim にマウントする）
  const img = document.getElementById('whimsy-kuma-img');
  const animSlot = document.getElementById('whimsy-kuma-anim');
  if (band === 'evening' && img) img.src = '/assets/gen/kuma-campfire.webp';
  if (band === 'night') {
    if (img) img.hidden = true;
    if (animSlot) animSlot.hidden = false;
  }

  // ごく稀にヒーローが昼寝（1割以下・装飾のみ）
  if (Math.random() < 0.1) {
    const hero = document.getElementById('hero-kuma');
    if (hero) hero.src = '/assets/gen/kuma-sleeping.webp';
  }
  return band;
}
```

- [ ] **Step 8: 構文チェック＋ローカルで部分確認**

```bash
cd /d/ダウンロード/kosukuma-official-shop
node --check js/ui.js && node --check js/main.js && node --check js/fx/whimsy.js
npm run e2e
```
Expected: 構文エラーなし。e2e は商品ページ未作成のため P1/G/I の一部が FAIL するが、**B1〜B6・D・A・P2・P3 は PASS** すること。B系がFAILする場合はセレクタ/DOM契約のズレを直す

- [ ] **Step 9: Commit**

```bash
git add tools/e2e.mjs css/tokens.css css/main.css index.html js/ui.js js/main.js js/fx/whimsy.js
git commit -m "feat: トップページ全面リニューアル（退屈な構造×こすくまの声×時間帯の世界）"
```

---

### Task 4: 商品詳細ページ ×3（手書き・JSON-LD付き）

**Files:**
- Create: `products/sticker.html` / `products/ultra-tshirt.html` / `products/deco-helmet.html`
- Modify: `js/main.js`（hero-3d を `.hero` があるページでのみ初期化するガード追加）
- Modify: `sitemap.xml`（商品3ページ追加）

**Interfaces:**
- Consumes: Task 3 のDOM契約（`[data-handle]` 配下のhydration対象、ドロワー、トースト、`whimsy` ids）。`js/main.js` / `js/ui.js` は全ページ共通
- Produces: e2e の G（JSON-LD同期）・P1・I の対象URL: `/products/sticker.html` `/products/ultra-tshirt.html` `/products/deco-helmet.html`

- [ ] **Step 1: `js/main.js` のガード確認（変更不要）**

Task 3 時点の `js/main.js` には既に `.hero` 存在ガード＋`prefersReducedMotion()` ゲートが含まれている（商品ページでは hero-3d が初期化されないことを確認するだけで編集は不要）。確認コマンド:

```bash
grep -n "querySelector('.hero')" js/main.js
```
Expected: 1件ヒット（ガード済み）

- [ ] **Step 2: `products/sticker.html` を作成（全文）**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>こすくまくんステッカー｜こすくまくんのおみせ</title>
<meta name="description" content="こすくまくんステッカー。はっても はがしても、ぼくはぼくだよ。">
<link rel="canonical" href="https://kosukuma-official-shop.pages.dev/products/sticker.html">
<meta property="og:type" content="product">
<meta property="og:title" content="こすくまくんステッカー｜こすくまくんのおみせ">
<meta property="og:description" content="はっても はがしても、ぼくはぼくだよ。">
<meta property="og:image" content="https://kosukuma-official-shop.pages.dev/assets/img/kosukuma-sticker-main-1280.webp">
<meta property="og:url" content="https://kosukuma-official-shop.pages.dev/products/sticker.html">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Kosu_dot_kuma">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Zen+Maru+Gothic:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/main.css">
<script>
(() => { const h = new Date().getHours();
  const t = (h >= 16 && h < 19) ? 'evening' : (h >= 19 || h < 5) ? 'night' : 'day';
  document.documentElement.dataset.time = t; })();
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "name": "こすくまくんステッカー",
      "url": "https://kosukuma-official-shop.pages.dev/products/sticker.html",
      "image": "https://kosukuma-official-shop.pages.dev/assets/img/kosukuma-sticker-main-800.webp",
      "offers": {
        "@type": "Offer", "price": 780, "priceCurrency": "JPY",
        "availability": "https://schema.org/InStock",
        "shippingDetails": { "@type": "OfferShippingDetails", "shippingRate": { "@type": "MonetaryAmount", "value": 500, "currency": "JPY" } },
        "hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy", "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow", "merchantReturnDays": 7 }
      }
    }
  ]
}
</script>
</head>
<body>
<a class="skip-link" href="#main">本文へスキップ</a>
<div class="announce-bar">¥5,000以上で送料無料だよ。ぼくが運ぶわけじゃないけどね</div>

<header class="site-header">
  <a class="header-logo" href="/">
    <img src="/assets/kosukuma/front.png" alt="こすくまくん" width="40" height="40">
    <span class="logo-text">こすくまくんのおみせ</span>
    <span class="logo-official">公式</span>
  </a>
  <div class="header-actions">
    <button class="icon-btn" id="cart-toggle" type="button" aria-label="カートを開く">
      レジ<span class="badge" id="cart-count" hidden>0</span>
    </button>
    <button class="icon-btn" id="menu-btn" type="button" aria-label="メニューを開く">メニュー</button>
  </div>
</header>

<main id="main">
  <nav class="breadcrumb" aria-label="パンくず"><a href="/">おみせ</a> › こすくまくんステッカー</nav>

  <article class="product-detail" data-handle="こすくまくんステッカー">
    <div class="detail-media">
      <div class="main-img">
        <img id="detail-main" src="/assets/img/kosukuma-sticker-main-1280.webp" alt="こすくまくんステッカー">
        <span class="status-chip" hidden></span>
        <span data-soldout-stamp hidden></span>
      </div>
      <div class="detail-thumbs">
        <button class="detail-thumb" type="button" aria-selected="true" data-full="/assets/img/kosukuma-sticker-main-1280.webp"><img src="/assets/img/kosukuma-sticker-main-480.webp" alt="ステッカー 画像1"></button>
        <button class="detail-thumb" type="button" aria-selected="false" data-full="/assets/img/kosukuma-sticker-pack-800.webp"><img src="/assets/img/kosukuma-sticker-pack-480.webp" alt="ステッカー 画像2"></button>
        <button class="detail-thumb" type="button" aria-selected="false" data-full="/assets/img/kosukuma-sticker-street-800.webp"><img src="/assets/img/kosukuma-sticker-street-480.webp" alt="ステッカー 画像3"></button>
      </div>
    </div>
    <div class="detail-info">
      <h1>こすくまくんステッカー</h1>
      <p class="detail-oneliner">はっても はがしても、ぼくはぼくだよ</p>
      <p class="detail-price"><span data-price>¥780</span><span class="tax">（税込）</span></p>
      <p data-stock-note></p>
      <p class="detail-story">ぼくの顔がはってある、ただのシールだよ。それなのに、はったものがちょっと元気そうに見えるの、ふしぎだよ。PCでも水筒でも、すきなところにどうぞ。はる場所は君が決めていいよ。ぼくはどこにいても、ぼくだから</p>
      <table class="spec-table">
        <tr><th>発送</th><td>注文から3〜5日で発送</td></tr>
        <tr><th>送料</th><td>全国一律500円（5,000円以上で無料）</td></tr>
        <tr><th>返品</th><td>到着後7日以内</td></tr>
        <tr><th>支払い</th><td>Shopifyのページでお支払い</td></tr>
      </table>
      <div class="card-actions">
        <button class="btn btn-primary" type="button" data-add-to-cart>カートに入れる</button>
      </div>
      <a class="restock-link" href="mailto:info@kosukuma.com?subject=%E5%86%8D%E5%85%A5%E8%8D%B7%E3%81%AE%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B" hidden>再入荷のお知らせを聞いてみる</a>
      <div class="detail-kuma">
        <img src="/assets/gen/kuma-guide.webp" alt="案内係のこすくまくん">
        <p class="balloon">これ、ぼくのいちおしだよ。買えとは言わないけど</p>
      </div>
    </div>
  </article>
</main>

<footer>
  <div class="footer-band">
    <img id="whimsy-kuma-img" src="/assets/kosukuma/front.png" alt="こすくまくん" width="160" height="160">
    <div id="whimsy-kuma-anim" hidden aria-hidden="true"></div>
    <p id="whimsy-line">……</p>
  </div>
  <div class="footer-main">
    <div>
      <h3>運営</h3>
      <p>株式会社こす.くま<br>東京都目黒区東山3丁目7-11 大橋会館205<br><a href="mailto:info@kosukuma.com">info@kosukuma.com</a></p>
    </div>
    <div>
      <h3>公式SNS</h3>
      <ul>
        <li><a href="https://x.com/Kosu_dot_kuma" rel="noopener">X（旧Twitter）@Kosu_dot_kuma</a></li>
        <li>ぼくの日々はこっちだよ</li>
      </ul>
    </div>
    <div>
      <h3>お店のルール</h3>
      <ul>
        <li><a href="/legal/tokushoho.html">特定商取引法に基づく表記</a></li>
        <li><a href="/legal/privacy.html">プライバシーポリシー</a></li>
        <li><a href="/#guide">とどくまでの話</a></li>
      </ul>
    </div>
  </div>
  <p class="footer-copy">© 2026 株式会社こす.くま ／ この店の言葉はぜんぶ、ぼくが言ってるよ。間違ってたらごめんね</p>
</footer>

<dialog id="menu-dialog" aria-label="メニュー">
  <div class="dialog-head">
    <h2>メニュー</h2>
    <button class="icon-btn" type="button" data-close>とじる</button>
  </div>
  <div class="dialog-body">
    <nav>
      <ul>
        <li><a href="/#products">売ってるもの</a></li>
        <li><a href="/#news">お知らせ</a></li>
        <li><a href="/#about">こすくまくんについて</a></li>
        <li><a href="/#guide">とどくまでの話</a></li>
        <li><a href="/#faq">よくある質問</a></li>
        <li><a href="/legal/tokushoho.html">特定商取引法に基づく表記</a></li>
        <li><a href="/legal/privacy.html">プライバシーポリシー</a></li>
      </ul>
    </nav>
  </div>
</dialog>

<dialog id="cart-drawer" aria-label="カート">
  <div class="dialog-head">
    <h2>レジ</h2>
    <button class="icon-btn" type="button" data-close>とじる</button>
  </div>
  <div class="dialog-body">
    <div class="cart-empty" hidden>
      <img class="drawer-kuma" src="/assets/gen/kuma-register.webp" alt="レジ係のこすくまくん">
      <p>まだ何も入ってないよ。ぼくの店、見るだけでもいいんだよ。ぼくもよくやる</p>
    </div>
    <div id="cart-items"></div>
    <div id="shipping-meter" hidden>
      <p id="shipping-meter-label"></p>
      <div id="shipping-meter-bar-wrap"><div id="shipping-meter-bar"></div></div>
    </div>
    <div class="cart-total" id="cart-total" hidden>
      <span>合計</span><span id="cart-total-price"></span>
    </div>
    <button class="btn btn-primary" id="btn-checkout" type="button" hidden>レジにすすむ</button>
    <p class="drawer-note">ここから先はShopifyさんの担当だよ。ぼくより確かだよ</p>
  </div>
</dialog>

<button id="sticky-cart" type="button" aria-label="カートを開く">レジ<span class="badge" id="sticky-cart-count" hidden>0</span></button>
<div id="toast-region" aria-live="polite"></div>

<script type="module" src="/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: `products/ultra-tshirt.html` を作成（全文）**

Step 2 と同一構造で、以下を差し替えたものを作成する（差し替え箇所は全て書き出す）:

- `<title>`: `ウルトラプレミアムTシャツ｜こすくまくんのおみせ`
- meta description / og:description: `15万円。たかい？ ぼくもそう思うよ。`
- canonical / og:url: `.../products/ultra-tshirt.html`
- og:image / JSON-LD image: `/assets/img/kosukuma-ultra-tshirt-1-800.webp`（ogは `-1280.webp`）
- JSON-LD: `"name": "ウルトラプレミアムTシャツ"`、`"price": 150000`、`"availability": "https://schema.org/OutOfStock"`
- breadcrumb: `おみせ › ウルトラプレミアムTシャツ`
- `article`: `data-handle="tシャツ"`
- メイン画像: `<img id="detail-main" src="/assets/img/kosukuma-ultra-tshirt-1-1280.webp" alt="ウルトラプレミアムTシャツ">`
- サムネ2枚:
  - `<button class="detail-thumb" type="button" aria-selected="true" data-full="/assets/img/kosukuma-ultra-tshirt-1-1280.webp"><img src="/assets/img/kosukuma-ultra-tshirt-1-480.webp" alt="Tシャツ 画像1"></button>`
  - `<button class="detail-thumb" type="button" aria-selected="false" data-full="/assets/img/kosukuma-ultra-tshirt-2-800.webp"><img src="/assets/img/kosukuma-ultra-tshirt-2-480.webp" alt="Tシャツ 画像2"></button>`
- `<h1>`: `ウルトラプレミアムTシャツ`
- oneliner: `15万円。たかい？ ぼくもそう思うよ`
- 価格: `<span data-price>¥150,000</span><span class="tax">（税込）</span>`
- story: `ぼくのからだとおなじ素材で作った……わけないよ。ふつうに、いいTシャツだよ。値段はちょっと言いすぎたかもしれない。それで売り切れたんだから、世の中おもしろいよ。ほしいって言ってくれた人たちへ。ありがとう。ぼくがいちばん驚いてるよ`
- カゴボタン: `<button class="btn btn-primary" type="button" data-add-to-cart disabled>うりきれ</button>`
- detail-kuma balloon: `たかい？ ぼくもそう思うよ。それなのに売り切れた。世の中おもしろいよ`

- [ ] **Step 4: `products/deco-helmet.html` を作成（全文）**

Step 2 と同一構造で、以下を差し替えたものを作成する:

- `<title>`: `こすくまデコヘルメット｜こすくまくんのおみせ`
- meta description / og:description: `頭はまもるよ。心はまもってくれないよ。`
- canonical / og:url: `.../products/deco-helmet.html`
- og:image / JSON-LD image: `/assets/img/kosukuma-deco-helmet-800.webp`（ogも同じ）
- JSON-LD: `"name": "こすくまデコヘルメット"`、`"price": 109000`、`"availability": "https://schema.org/OutOfStock"`
- breadcrumb: `おみせ › こすくまデコヘルメット`
- `article`: `data-handle="こすくまデコヘルメット"`
- メイン画像（`data-img-fit="contain"` を `.main-img` に付与）: `<img id="detail-main" src="/assets/img/kosukuma-deco-helmet-800.webp" alt="こすくまデコヘルメット">`
- サムネは1枚のみ（`aria-selected="true"`・`data-full="/assets/img/kosukuma-deco-helmet-800.webp"`・`<img src="/assets/img/kosukuma-deco-helmet-480.webp" alt="デコヘルメット">`）
- `<h1>`: `こすくまデコヘルメット`
- oneliner: `頭はまもるよ。心はまもってくれないよ`
- 価格: `<span data-price>¥109,000</span><span class="tax">（税込）</span>`
- story: `デコを守るヘルメットだよ。ぼくのデコはつるつるだけど、君のデコは大事にしてね。……いま、この子は旅に出てるよ。戻ってきたら、ここで言うよ`
- カゴボタン: `<button class="btn btn-primary" type="button" data-add-to-cart disabled>うりきれ</button>`
- detail-kuma balloon: `いま旅に出てるよ。戻ってきたら、ここで言うよ`

- [ ] **Step 5: `sitemap.xml` に商品3ページを追加**

`tools/e2e.mjs` を読んだ時と同様、既存 `sitemap.xml` をReadしてから、`<urlset>` 内の `/` エントリの直後に以下を挿入:

```xml
<url><loc>https://kosukuma-official-shop.pages.dev/products/sticker.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
<url><loc>https://kosukuma-official-shop.pages.dev/products/ultra-tshirt.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
<url><loc>https://kosukuma-official-shop.pages.dev/products/deco-helmet.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
```

- [ ] **Step 6: e2e の G / P1 / I を通す**

```bash
cd /d/ダウンロード/kosukuma-official-shop
npm run e2e
```
Expected: **G・P1・P2・P3・I が全て PASS**（B系は引き続き PASS のままであること）

- [ ] **Step 7: Commit**

```bash
git add products js/main.js sitemap.xml
git commit -m "feat: 商品詳細ページ3商品（標準EC構成・JSON-LD・声の書き下ろし）"
```

---

### Task 5: 404書き直し + キャッシュヘッダ + 仕上げ

**Files:**
- Create: `404.html`（全面書き換え）
- Modify: `_headers`（`/assets/gen/*` と `/assets/pixel/*` のキャッシュ追加）

**Interfaces:**
- Consumes: `/assets/gen/kuma-lost.webp`（Task 2）
- Produces: e2e I の対象 `/404.html`

- [ ] **Step 1: `404.html` を全面書き換え（全文。現行と同じく自己完結型・JSなし）**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ページがないよ｜こすくまくんのおみせ</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="stylesheet" href="/css/tokens.css">
<style>
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: var(--font-body); color: var(--ink); background: var(--paper);
    padding: var(--space-4); text-align: center;
  }
  main { display: grid; justify-items: center; gap: var(--space-3); max-width: 420px; }
  img { width: clamp(140px, 40vw, 220px); }
  h1 { font-size: var(--fs-h2); word-break: keep-all; line-break: strict; overflow-wrap: break-word; text-wrap: balance; }
  p { color: var(--ink-sub); word-break: keep-all; line-break: strict; overflow-wrap: break-word; text-wrap: pretty; }
  a.btn {
    display: inline-block; margin-top: var(--space-2);
    border: 2px solid var(--brown-dark); border-radius: var(--radius-m);
    background: var(--honey); color: var(--ink); font-weight: 700;
    padding: var(--space-2) var(--space-4); text-decoration: none;
    box-shadow: var(--press-shadow);
  }
</style>
</head>
<body>
<main>
  <img src="/assets/gen/kuma-lost.webp" alt="地図を持って道に迷っているこすくまくん">
  <h1>そのページ、ないよ</h1>
  <p>ぼくもさっき探した。なかった。<br>ページを探す旅に出たまま、ぼくもまだ戻ってないよ</p>
  <a class="btn" href="/">おみせに戻る</a>
</main>
</body>
</html>
```

- [ ] **Step 2: `_headers` にキャッシュルール追加**

既存 `_headers` をReadしてから、`/assets/img/*` のブロックと同じ書式で以下を追加:

```
/assets/gen/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
/assets/pixel/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
```

- [ ] **Step 3: 確認**

```bash
npm run e2e
```
Expected: I（アセット404ゼロ）の対象に `/404.html` が含まれ PASS

- [ ] **Step 4: Commit**

```bash
git add 404.html _headers
git commit -m "feat: 404をこすくまボイスで書き直し＋生成アセットのキャッシュ"
```

---

### Task 6: イーロン・旧fx・不要アセットの物理削除 + 聖域の最終確認

**Files:**
- Delete: `js/fx/sparkles.js` `js/fx/confetti.js` `js/fx/magnetic.js` `js/fx/scroll-fx.js` `js/fx/hover-zoom.js`
- Delete: `assets/elon-special-new.png` `assets/img/elon-special-new-480.webp` `assets/img/elon-special-new-800.webp`
- Modify: なし（`js/fx/hero-3d.js` は**一切触らない**）

**Interfaces:**
- Consumes: Task 3/4 で新DOM・新JSに移行済みであること
- Produces: イーロン痕跡ゼロ

- [ ] **Step 1: 参照残りの確認（削除前チェック）**

```bash
cd /d/ダウンロード/kosukuma-official-shop
grep -rn "sparkles\|confetti\|magnetic\|scroll-fx\|hover-zoom\|elon" --include="*.html" --include="*.js" --include="*.css" . | grep -v node_modules | grep -v docs/
```
Expected: ヒットゼロ（ヒットがあれば該当ファイルを修正してから削除へ進む）

- [ ] **Step 2: 削除**

```bash
git rm js/fx/sparkles.js js/fx/confetti.js js/fx/magnetic.js js/fx/scroll-fx.js js/fx/hover-zoom.js assets/elon-special-new.png assets/img/elon-special-new-480.webp assets/img/elon-special-new-800.webp
```

- [ ] **Step 3: 聖域の最終確認＋e2e**

`js/fx/hero-3d.js` と `assets/3d/konpeito.glb` が git で変更されていないことを確認:

```bash
git log --oneline -1 -- js/fx/hero-3d.js
git status --short
npm run e2e
```
Expected: hero-3d.js の最終コミットはリニューアル前のもの（変更なし）。e2e は **H・A・I を含む全項目 PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: イーロン売り場・旧fx演出を撤去（聖域の金平糖は温存）"
```

---

### Task 7: 最終検証（e2e全PASS・モバイル目視・声の自校）

**Files:**
- Modify: なし（検証タスク。問題が見つかったら修正コミットを積む）

- [ ] **Step 1: e2e 全項目 PASS**

```bash
cd /d/ダウンロード/kosukuma-official-shop
npm run e2e
```
Expected: 全項目 PASS（B1-B6 / C / D / F / G / H / I / J / A / P1 / P2 / P3）。FAILがあれば原因を直して再実行

- [ ] **Step 2: モバイル目視（402×874）**

puppeteer等で `/` と `/products/sticker.html` のスクリーンショットを402×874で撮影して目視確認:
- ヒーロー: ドット絵背景＋こすくまパネル＋3D金平糖が重ならず見える。`#gyro-btn` は初期hidden（タップ許可後に出るのは聖域の既存挙動）
- 商品グリッドが1列・価格（税込）・カードが潰れていない
- カートドロワーで `#btn-checkout` が完全視認
- フッターバンドが時間帯に応じた見た目（夜なら暗い背景＋utouto）
- `scrollHeight <= clientHeight` を強制する画面は無いが、横スクロールが無いこと（e2e F済み）

- [ ] **Step 3: 声の最終レビュー（自校チェックリスト）**

`index.html` / `products/*.html` / `404.html` / `js/ui.js`（トースト）/ `js/fx/whimsy.js` の全コピーを読み返し、以下を全行チェック:
1. 共犯構造があるか（指摘の後に自分の弱さを添えているか）
2. 断罪・冷笑・上から目線になっていないか
3. 虚無を軽さに着地できているか
4. 他人の価値観を否定していないか
5. 禁句（安っぽい希望: 「いつか報われる」「きっと良くなる」等）が無いか
6. 情報として正確か（送料・発送・返品・問い合わせ対応が事実と一致）

問題があれば修正してコミット（`fix: 声の自校レビュー修正`）

- [ ] **Step 4: パフォーマンス確認**

- `/` の初期ロードで3D（`hero-3d.js`・Rapier 2MB）が `requestIdleCallback` 経由で遅延されること（DevTools Networkで確認）
- 商品画像・背景が WebP + srcset で配信されていること
- `/assets/gen/*.webp` `/assets/pixel/*.webp` にキャッシュヘッダが付くこと（`_headers` 反映はデプロイ後）

- [ ] **Step 5: 完了報告**

ユーザーに以下を報告:
- e2e 全項目の PASS 結果
- スクリーンショットの確認結果
- 声の自校結果
- 残リスク（あれば）

---
