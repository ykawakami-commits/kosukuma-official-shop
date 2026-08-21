#!/usr/bin/env node
// tools/gen-poses.mjs — サイト実装箇所ポーズ（assets/pose/*.webp）の生成・採用ツール
// gen-kosukuma.mjs（旧 assets/gen パイプライン）の genWithRefs / MOUTH_BAN / 参照セットを流用。
// 旧ツールとの違い:
//   - 背景は透過でなく「配置先トークン色のベタ焼き」（gpt-image-2 は transparent 非対応(400)。
//     白/クリーム体は rembg で体内側まで消える罠があるため切り抜き非依存の設計）
//   - このツールは候補を生成して並べるだけ。採用判定は必ず人間(Claude)が Read で目視審査する。
//     自動SELECT(claude-opus-4-8)は事前フィルタとして併用可だが最終判断は目視（全滅なら作り直し）。
//   - adopt は背景を厳密hexへスナップ → PNGマスターを tools/gen-masters/ へ、
//     600px幅 WebP（lossless — q90ロッシーはYUV変換で背景が1階調ずれ、配置先トークンと
//     継ぎ目が出るため不可）を assets/pose/ へ保存する。
//
// 使い方:
//   node tools/gen-poses.mjs list
//   node tools/gen-poses.mjs gen sleeping [count=3] [outDir]   # 候補生成（既定 tools/_pose-candidates/<name>/）
//   node tools/gen-poses.mjs adopt sleeping <採用PNG>          # 目視審査で選んだ1枚を焼き込み
//
// 環境変数: OPENAI_API_KEY（無ければ D:/ダウンロード/ディスコード/.env から読む）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF_IDENTITY = path.join(ROOT, 'tools/refs/identity');
const OUT_WEBP = path.join(ROOT, 'assets', 'pose');
const OUT_MASTER = path.join(ROOT, 'tools', 'gen-masters');
const WEBP_WIDTH = 600;
const SNAP_TOLERANCE = 8; // 背景近傍Δ<=8を厳密ターゲットへ置換（体色#fcfad2は青210で対象外）

// ── 正典スペック（gen-kosukuma.mjs MOUTH_BAN と同一）──
// AIは中盤の指示を無視しがちなので先頭＋末尾に二重配置する（[[feedback_prompt_position]]）
const MOUTH_BAN =
  "TOP RULE (absolute): Kosukuma's face consists of EXACTLY three tiny marks — two small round dot-eyes plus one tiny flat OVAL nose (a simple small horizontal ellipse, about half the size of one eye) sitting just below the midpoint between the eyes — and NOTHING else, exactly like the reference stamps. The nose is REQUIRED whenever his face is visible, and it is a plain flat oval dot: NOT an omega, NOT a wavy line, NOT a 'w' shape, NOT a curve — never draw any wavy or w-shaped mark on his face. He is MOUTHLESS: draw NO mouth, NO lips, NO smile, NO teeth, NO open mouth anywhere on Kosukuma. His rear has exactly ONE small round tail — never two. The mole is ONE small FLAT black dot printed on his fur on the LOWER SIDE of his round torso (the hip/rear area): put it on the right hip when the right hip is visible, otherwise on the left hip — always on whichever hip side faces the viewer. NEVER draw the mole on his feet, legs, paws, tail, face or chest — it sits on the round body ABOVE the leg line, and it is flat, not a bump. ";

// 横たわりポーズ専用の追加ルール（おしりが第二の頭に見える事故の防止）
const RUMP_RULE =
  'SECOND ABSOLUTE RULE: when he is lying down his rear half is prominent — the rear half is a simple smooth featureless round rump with ONE small round tail — it must NEVER resemble a second head or face: no ear-like bumps, no dots, no marks of any kind on the rump except the single flat hip mole and the single round tail. Anyone glancing at the image, even at thumbnail size, must instantly read it as ONE bear with ONE head (the head is the end with the two dot-eyes and small round ears). ';

// 配置先トークン色でベタ焼きするスタイル節（hex差し込み）
const bakedStyle = (hex) =>
  ` STYLE: the official Kosukuma look — a simple white cream-colored round marshmallow mascot bear with short limbs, small round ears and one small round tail, minimal clean shapes, thin dark outline, soft flat colors (his fur is always filled with the pale cream color #fcfad2, never left as uncolored white line art). Match the reference stamps exactly. Do NOT make him pixel art, do NOT redesign him, do NOT make a generic cute sticker of a different bear. Full body visible. BACKGROUND: the ENTIRE background is one perfectly flat, uniform, solid field of the exact color ${hex} — absolutely nothing else: NO ground line, NO floor shading, NO drop shadow under the body, NO glow, NO vignette, NO texture, NO gradient. Just the scene on flat ${hex}.`;

// ── 生成対象（bg = 配置先トークンの焼き込みhex）──
//   guide/register/lost/sleeping → --paper #fdf9ec（商品詳細 .detail-kuma / カートドロワー / 404 / ヒーローパネル）
//   campfire → 夕方バンド --band-bg #f2e3c0（.footer-band html[data-time="evening"]）
const TARGETS = {
  guide: {
    out: 'guide', bg: '#fdf9ec',
    brief: 'Kosukuma standing in three-quarter view, one paw raised sideways in a gentle "this way / this one" presenting gesture, calm deadpan face. He looks like a quiet shop guide showing a product.',
  },
  register: {
    out: 'register', bg: '#fdf9ec',
    brief: 'Kosukuma sitting behind a small wooden cash-register counter with a tiny old-fashioned till, front view, deadpan calm face, like a quiet cashier waiting. The counter is minimal so Kosukuma is the clear main subject.',
  },
  lost: {
    out: 'lost', bg: '#fdf9ec',
    brief: 'Kosukuma standing and holding an unfolded paper map with both paws, head slightly tilted, looking around as if lost. Still deadpan, not panicking. The map is completely blank — no text, no letters, no symbols printed on it.',
  },
  campfire: {
    out: 'campfire', bg: '#f2e3c0',
    brief: 'Kosukuma sitting on the ground beside a small cozy campfire (logs and gentle flames included in the image), calm evening mood, deadpan relaxed face, looking at the fire. The campfire is the only prop.',
  },
  sleeping: {
    out: 'sleeping', bg: '#fdf9ec', rump: true,
    brief: 'Kosukuma lying on his side on the ground, relaxed and drowsy, curled slightly, calmly resting while staying awake. His face is EXACTLY the same as the wide-awake reference stamps: two small round solid black dot-eyes (open, perfectly round, identical to the stamps) plus one tiny flat oval nose — nothing else on the face: no mouth, no eyelid lines, no closed-eye arcs, no eyebrow curves, no eyelashes. One small round tail visible with the flat mole on the visible hip.',
  },
};

async function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  // このリポジトリに .env は無い — Discord bot リポジトリのキーを読む（値は一切出力しない）
  const txt = await readFile('D:/ダウンロード/ディスコード/.env', 'utf8');
  const m = txt.match(/^\s*OPENAI_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!m) throw new Error('OPENAI_API_KEY が見つかりません');
  return m[1].trim();
}

// gen-kosukuma.mjs の参照セット + 公式リファレンス（必須・先頭）
function refPaths() {
  return [
    path.join(ROOT, 'assets/kosukuma/front.png'),
    path.join(REF_IDENTITY, '01-front.png'),
    path.join(REF_IDENTITY, '02-threequarter.png'),
    path.join(REF_IDENTITY, '04-gorogoro.png'),
    path.join(REF_IDENTITY, '06-charsheet.png'),
  ];
}

// gen-kosukuma.mjs genWithRefs 流用（transparent 指定なし = ベタ焼き）
async function genWithRefs({ prompt, refs, apiKey }) {
  const form = new FormData();
  form.set('model', 'gpt-image-2');
  for (const p of refs) {
    const buf = await readFile(p);
    form.append('image[]', new Blob([buf], { type: 'image/png' }), path.basename(p));
  }
  form.set('prompt', prompt);
  form.set('size', '1024x1024');
  form.set('quality', 'high');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI images.edits ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('画像生成の応答に b64_json がありません');
  return Buffer.from(b64, 'base64');
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function cmdGen(name, count, outDir) {
  const t = TARGETS[name];
  if (!t) throw new Error(`未知の対象: ${name}（${Object.keys(TARGETS).join(' / ')}）`);
  const apiKey = await loadKey();
  const dir = outDir || path.join(ROOT, 'tools', '_pose-candidates', name);
  await mkdir(dir, { recursive: true });
  const prompt = t.rump
    ? MOUTH_BAN + RUMP_RULE + t.brief + bakedStyle(t.bg) + '\n\n' + RUMP_RULE + MOUTH_BAN
    : MOUTH_BAN + t.brief + bakedStyle(t.bg) + '\n\n' + MOUTH_BAN;
  console.log(`[gen] ${name} を ${count} 枚並列生成中...`);
  const refs = refPaths();
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => genWithRefs({ prompt, refs, apiKey })),
  );
  let ok = 0;
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      const p = path.join(dir, `cand-${i}.png`);
      await writeFile(p, r.value);
      console.log(`[gen] 候補${i} → ${p}`);
      ok++;
    } else {
      console.error(`[gen] 候補${i} 失敗: ${r.reason?.message ?? r.reason}`);
    }
  }
  if (ok === 0) throw new Error('全候補が生成失敗');
  console.log(`[gen] 完了 ${ok}/${count}。次: 全候補を Read で目視審査 → node tools/gen-poses.mjs adopt ${name} <採用PNG>`);
}

async function cmdAdopt(name, srcPng) {
  const t = TARGETS[name];
  if (!t) throw new Error(`未知の対象: ${name}`);
  if (!srcPng) throw new Error('adopt には採用PNGのパスが必要です');
  const sharp = (await import('sharp')).default;
  const target = hexToRgb(t.bg);
  const { data, info } = await sharp(srcPng).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  // 四隅サンプルの平均 = 実背景色 → 近傍を厳密ターゲットへスナップ
  const corner = (x, y) => { const i = (y * info.width + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  const samples = [corner(5, 5), corner(info.width - 6, 5), corner(5, info.height - 6), corner(info.width - 6, info.height - 6)];
  const bg = [0, 1, 2].map((k) => Math.round(samples.reduce((s, p) => s + p[k], 0) / samples.length));
  const out = Buffer.from(data);
  let replaced = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (Math.abs(data[i] - bg[0]) <= SNAP_TOLERANCE && Math.abs(data[i + 1] - bg[1]) <= SNAP_TOLERANCE && Math.abs(data[i + 2] - bg[2]) <= SNAP_TOLERANCE) {
      out[i] = target[0]; out[i + 1] = target[1]; out[i + 2] = target[2];
      replaced++;
    }
  }
  console.log(`[adopt] 背景実測 rgb(${bg}) → ${t.bg} スナップ（${((replaced / (data.length / ch)) * 100).toFixed(1)}% of pixels）`);
  const base = sharp(out, { raw: { width: info.width, height: info.height, channels: ch } });
  await mkdir(OUT_MASTER, { recursive: true });
  await mkdir(OUT_WEBP, { recursive: true });
  const masterPath = path.join(OUT_MASTER, `pose-${t.out}.png`);
  await base.clone().png().toFile(masterPath);
  const webpPath = path.join(OUT_WEBP, `${t.out}.webp`);
  await base.clone().resize({ width: WEBP_WIDTH }).webp({ lossless: true, effort: 6 }).toFile(webpPath);
  // 最終確認: webp四隅が厳密に焼き込みhexか
  const { data: d2, info: i2 } = await sharp(webpPath).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * i2.width + x) * i2.channels; return '#' + [0, 1, 2].map((k) => d2[i + k].toString(16).padStart(2, '0')).join(''); };
  const corners = [px(2, 2), px(i2.width - 3, 2), px(2, i2.height - 3), px(i2.width - 3, i2.height - 3)];
  const exact = corners.every((c) => c === t.bg);
  const st = await (await import('node:fs/promises')).stat(webpPath);
  console.log(`[adopt] ${webpPath} ${i2.width}x${i2.height} ${(st.size / 1024).toFixed(1)}KB corners=${corners.join(',')} ${exact ? 'OK' : 'NG!!'}`);
  console.log(`[adopt] master → ${masterPath}`);
  if (!exact) throw new Error(`四隅が ${t.bg} に一致しません — 採用中止`);
}

async function main() {
  const [cmd, name, a, b] = process.argv.slice(2);
  if (cmd === 'list' || !cmd) {
    console.log('生成対象（→ assets/pose/<out>.webp、背景=配置先トークン焼き込み）:');
    for (const [id, t] of Object.entries(TARGETS)) console.log(`  ${id} → ${t.out}.webp bg=${t.bg}`);
    return;
  }
  if (cmd === 'gen') return cmdGen(name, Number(a || 3), b);
  if (cmd === 'adopt') return cmdAdopt(name, a);
  throw new Error(`未知のコマンド: ${cmd}（list / gen / adopt）`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
