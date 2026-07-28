// tools/edit/image-engine.mjs — 画像スロット一覧 + アップロード差し替え（sharp）
//
// 原則:
//  - 差し替え前の画像は必ず tools/edit/backups/<timestamp>/ に退避
//  - 出力形式はスロットの拡張子に従う（.webp→WebP / .png→PNG）
//  - スロット寸法にリサイズ（fit: contain=余白透過 / cover=はみ出しクロップ）
//  - variants（srcset用の別サイズ）も同じ元画像から同時生成
//  - ピクセルアート背景は nearest 補間 + ロスレスでドットのキレを守る

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, EditError, backupFiles } from './content-engine.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const SLOTS_PATH = path.join(ROOT, 'tools', 'edit', 'image-slots.json');

// Windowsでは書き込み直後のファイルがAV/インデクサに一瞬ロックされることがある（errno -4094）→ 短いリトライで吸収
async function writeFileRetry(abs, buf, tries = 8) {
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(abs, buf); return; }
    catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export function loadSlots() {
  return JSON.parse(fs.readFileSync(SLOTS_PATH, 'utf8'));
}

function parseVariant(str) {
  // 例: "assets/img/kosukuma-sticker-main-480.webp (480x360)"
  const m = String(str).match(/^(\S+)\s+\((\d+)x(\d+)/);
  if (!m) return null;
  return { path: m[1], width: Number(m[2]), height: Number(m[3]) };
}

export function slotTargets(slot) {
  const targets = [{ path: slot.path, width: slot.width, height: slot.height }];
  for (const v of slot.variants || []) {
    const t = parseVariant(v);
    if (t) targets.push(t);
  }
  return targets;
}

export function imagesReport() {
  const data = loadSlots();
  const slots = data.slots.map((s) => {
    const targets = slotTargets(s).map((t) => {
      const abs = path.join(ROOT, t.path);
      let stat = null;
      try { stat = fs.statSync(abs); } catch { /* 欠損はexists:falseで表示 */ }
      return { ...t, exists: !!stat, bytes: stat ? stat.size : 0, mtime: stat ? stat.mtimeMs : 0 };
    });
    return { ...s, targets, defaultFit: defaultFitFor(s) };
  });
  return { meta: data._meta ?? null, slots };
}

function defaultFitFor(slot) {
  const id = slot.id || '';
  if (id.startsWith('slot.photo-') || id === 'slot.og-image-top' || id.startsWith('slot.pixel-bg')) return 'cover';
  return 'contain';
}

function isPixelArt(slot) {
  return (slot.id || '').startsWith('slot.pixel-bg');
}

export async function uploadImage({ slotId, dataBase64, fit }) {
  const data = loadSlots();
  const slot = data.slots.find((s) => s.id === slotId);
  if (!slot) throw new EditError(`スロットが見つかりません: ${slotId}`);

  const b64 = String(dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!b64) throw new EditError('画像データが空です');
  let input;
  try { input = Buffer.from(b64, 'base64'); } catch { throw new EditError('base64のデコードに失敗しました'); }
  if (input.length < 100) throw new EditError('画像データが小さすぎます（壊れている可能性）');
  if (input.length > 40 * 1024 * 1024) throw new EditError('画像が大きすぎます（40MBまで）');

  let srcMeta;
  try { srcMeta = await sharp(input).metadata(); }
  catch { throw new EditError('画像として読み込めませんでした（PNG/JPG/WebP/GIF等を指定してください）'); }

  const useFit = fit === 'cover' ? 'cover' : 'contain';
  const targets = slotTargets(slot);

  // 差し替え前に既存ファイルを退避
  const backup = backupFiles(targets.map((t) => t.path));

  const pixel = isPixelArt(slot);
  const written = [];
  for (const t of targets) {
    const abs = path.join(ROOT, t.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let pipe = sharp(input, { limitInputPixels: 268402689 }).resize(t.width, t.height, {
      fit: useFit,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: pixel ? 'nearest' : 'lanczos3',
    });
    const ext = path.extname(t.path).toLowerCase();
    if (ext === '.webp') pipe = pixel ? pipe.webp({ lossless: true }) : pipe.webp({ quality: 92 });
    else if (ext === '.png') pipe = pipe.png();
    else if (ext === '.jpg' || ext === '.jpeg') pipe = pipe.flatten({ background: '#ffffff' }).jpeg({ quality: 92 });
    else throw new EditError(`未対応の出力形式です: ${ext}`);
    const buf = await pipe.toBuffer();
    await writeFileRetry(abs, buf);
    written.push({ path: t.path, width: t.width, height: t.height, bytes: buf.length });
  }

  return {
    ok: true,
    slotId,
    backup,
    fit: useFit,
    source: { width: srcMeta.width, height: srcMeta.height, format: srcMeta.format },
    written,
  };
}
