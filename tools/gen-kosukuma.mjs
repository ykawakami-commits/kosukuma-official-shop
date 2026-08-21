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
//   ※ gpt-image-2 は background=transparent 非対応（400 invalid_value）。
//     pose:* を生成するときは OPENAI_IMAGE_MODEL=gpt-image-1 を付けること（2026-07-26 実測）
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
  " STYLE: the official Kosukuma look — a simple white cream-colored round marshmallow mascot bear with short limbs, small round ears and one small round tail, minimal clean shapes, thin dark outline, soft flat colors (his fur is always filled with the pale cream color, never left as uncolored white line art). Match the reference stamps exactly. Do NOT make him pixel art, do NOT redesign him, do NOT make a generic cute sticker of a different bear. Full body visible, on a TRANSPARENT background (alpha channel, no backdrop). Every pixel outside the character and the props named in the brief must be fully transparent (alpha 0): NO glow, NO light haze, NO ambient color wash, NO drop shadow on invisible ground, NO vignette.";

const BG_STYLE =
  " STYLE: 16-bit pixel art in EXACTLY the same style, palette and scene composition as the reference image (the camper van by the river with the village, bridge and mountains). Chunky visible pixels, consistent dithering, same camera angle and layout. Do NOT draw any characters, bears, people or animals in the scene — landscape only.";

// ── 生成対象 ──
const TARGETS = {
  // ── pose:*（廃止 2026-07-28）: assets/gen は廃止済み。ライブページは assets/pose/*.webp を
  //    参照する（背景ベタ焼き・配置先トークン色一致）。新規生成は tools/gen-poses.mjs へ。
  //    ここの pose:* を再実行しても assets/gen に出力されるだけでサイトには反映されない。
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
    brief: 'Kosukuma lying on his side on the ground, relaxed and drowsy, curled slightly, calmly resting while staying awake. His face is EXACTLY the same as the wide-awake reference stamps: two small round solid black dot-eyes (open, perfectly round, identical to the stamps) plus one tiny flat oval nose — nothing else on the face: no mouth, no eyelid lines, no closed-eye arcs, no eyebrow curves, no eyelashes. One small round tail visible with the flat mole on the visible hip.',
  },
  'bg:evening': {
    kind: 'bg', out: 'bg-evening',
    brief: 'The same camper-van-by-the-river scene at sunset: warm orange and pink sky, long soft shadows, golden light on the grass, the village windows starting to glow faintly.',
  },
  'bg:night': {
    kind: 'bg', out: 'bg-night',
    brief: 'The same camper-van-by-the-river scene at night: deep dark blue sky with small stars, the scene lit mainly by a warm glowing campfire in front of the van and soft warm window light from the van, moonlit river reflections.',
  },
  // ── UI素材（廃止 2026-07-28）: ドット/ピクセル風UIは全廃（DS §7-2-2）。
  //    アイコンはインラインSVG（.ui-icon）、ボタンはCSS 3種規格（§6-2）に移行済みのため
  //    ビットマップUIの再生成は禁止。参照素材は tools/refs/dot-illust/ に退避済み。
  // 'ui:btn-primary': {
  //   kind: 'ui', out: 'ui-btn-primary', width: 640,
  //   brief: 'A single 16-bit pixel art rounded-rectangle button shaped like a small wooden shop sign plank: warm honey-brown wood, thick dark chocolate outline, a slightly lighter perfectly FLAT empty center panel (absolutely no text, no icons, no symbols, no decorations in the center — it is a blank area for HTML text overlay), subtle wood grain only near the edges, gentle top highlight. Wide landscape shape roughly 3:1. Transparent background outside the button shape.',
  // },
  // 'ui:btn-ghost': {
  //   kind: 'ui', out: 'ui-btn-ghost', width: 640,
  //   brief: 'A single 16-bit pixel art rounded-rectangle button made of plain cream paper with a thin dark outline: soft warm off-white paper, perfectly FLAT empty center (absolutely no text, no icons, no decorations in the center), very subtle paper texture near the edges only. Wide landscape shape roughly 3:1. Transparent background outside the button shape.',
  // },
  // 'ui:icon-cart': {
  //   kind: 'ui', out: 'ui-icon-cart', width: 192,
  //   brief: 'A 16-bit pixel art small wooden shopping basket icon holding a few colorful konpeito (tiny star-shaped sugar candies in pastel pink, blue, yellow, green), thick dark outline, simple and readable at favicon size, centered, transparent background.',
  // },
  // 'ui:icon-menu': {
  //   kind: 'ui', out: 'ui-icon-menu', width: 192,
  //   brief: 'A 16-bit pixel art small wooden signpost icon with three blank horizontal wooden planks stacked on one post, warm brown wood, thick dark outline, simple and readable at favicon size, centered, transparent background.',
  // },
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

async function genWithRefs({ prompt, refPaths, transparent, size = '1024x1024', model }) {
  const form = new FormData();
  form.set('model', model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
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
  const isUi = t.kind === 'ui';
  const refPaths = isPose
    ? ['01-front.png', '02-threequarter.png', '04-gorogoro.png', '06-charsheet.png'].map((f) => path.join(REF_IDENTITY, f))
    : isUi
      ? ['maptile_wood_01.png', 'nature_star_yellow.png', 'effect_kirakira_01_yellow.png', 'food_hachimitsu_01.png'].map((f) => path.join(ROOT, 'tools/refs/dot-illust', f))
      : [path.join(REF_STYLE, 'base-map-day.png')];
  const UI_STYLE =
    " STYLE: crisp 16-bit pixel art matching the reference pixel items (chunky visible pixels, thick dark outlines, limited palette), on a TRANSPARENT background (alpha channel). Absolutely NO text or letters anywhere in the image.";
  const prompt = isPose
    ? MOUTH_BAN + t.brief + POSE_STYLE + '\n\n' + MOUTH_BAN
    : isUi
      ? t.brief + UI_STYLE
      : t.brief + BG_STYLE;
  console.log(`[gen] ${id} を2枚並列生成中...`);
  const size = isUi && t.width <= 192 ? '1024x1024' : isPose ? '1024x1024' : '1536x1024';
  // 透過が必要なのは gpt-image-1 のみ対応（gpt-image-2 は background=transparent を400拒否。ヘッダGotcha参照）
  const genOpts = { prompt, refPaths, transparent: isPose || isUi, size, model: isUi ? 'gpt-image-1' : undefined };
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
  const outDir = isPose || isUi ? OUT_POSE : OUT_BG;
  await mkdir(outDir, { recursive: true });
  const pngPath = path.join(outDir, `${t.out}.png`);
  await writeFile(pngPath, winner);

  // WebP化（sharp）。ポーズは600px幅・UIは指定幅の透過webp、背景は1536px/768pxの2幅
  const sharp = (await import('sharp')).default;
  if (isPose || isUi) {
    const resizeOpts = isUi ? { width: t.width, kernel: 'nearest' } : { width: 600 };
    await sharp(winner).resize(resizeOpts).webp({ quality: 88, alphaQuality: 95 }).toFile(path.join(outDir, `${t.out}.webp`));
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
    for (const [id, t] of Object.entries(TARGETS)) console.log(`  ${id} → ${t.kind === 'bg' ? 'assets/pixel' : 'assets/gen'}/${t.out}`);
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
