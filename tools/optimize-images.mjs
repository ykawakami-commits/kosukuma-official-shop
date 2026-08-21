// tools/optimize-images.mjs — 商品画像の最適化パイプライン
//
// 撮影原寸(最大6000×4000/5MB)がそのまま配信されていた事故の再発防止。
// 元画像を assets/ に置いたままこのスクリプトを実行すると、
// assets/img/ に表示幅別のWebP（480/800/1280w）を生成する。
// HTMLは assets/img/*.webp だけを参照する（原寸は配信しない）。
//
// 実行: npm run images

import sharp from 'sharp';
import { mkdirSync, existsSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets', 'img');
mkdirSync(OUT, { recursive: true });

const WIDTHS = [480, 800, 1280];
const QUALITY = 82;

// 商品写真（表示に使うものだけ。未参照の死に画像はここに載せない）
const PRODUCTS = [
  ['kosukuma-sticker-pack', 'assets/kosukuma-sticker-pack.png'],
  ['kosukuma-sticker-street', 'assets/kosukuma-sticker-street.png'],
  ['kosukuma-sticker-main', 'assets/kosukuma-sticker-main.jpg'],
  ['kosukuma-ultra-tshirt-1', 'assets/kosukuma-ultra-tshirt-1.jpg'],
  ['kosukuma-ultra-tshirt-2', 'assets/kosukuma-ultra-tshirt-2.jpg'],
  ['kosukuma-deco-helmet', 'assets/kosukuma-deco-helmet.png'],
  ['kosukuma-product', 'assets/kosukuma-product.png'],
  ['kosukuma-taketombo', 'assets/kosukuma-taketombo.png'],
];

let totalIn = 0;
let totalOut = 0;

for (const [name, src] of PRODUCTS) {
  const abs = path.join(ROOT, src);
  if (!existsSync(abs)) {
    console.warn(`SKIP (not found): ${src}`);
    continue;
  }
  totalIn += statSync(abs).size;
  const meta = await sharp(abs).metadata();
  for (const w of WIDTHS) {
    if (meta.width && meta.width < w && w !== WIDTHS[0]) continue; // 拡大はしない
    const out = path.join(OUT, `${name}-${w}.webp`);
    await sharp(abs)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(out);
    totalOut += statSync(out).size;
  }
  console.log(`OK: ${name} (${meta.width}x${meta.height})`);
}

// OGP画像 1200×630（ステッカー街撮りをカバークロップ）
const ogSrc = path.join(ROOT, 'assets/kosukuma-sticker-street.png');
if (existsSync(ogSrc)) {
  await sharp(ogSrc)
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toFile(path.join(ROOT, 'assets', 'og.webp'));
  await sharp(ogSrc)
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(ROOT, 'assets', 'og.png'));
  console.log('OK: og.png / og.webp (1200x630)');
}

// favicon一式（こすくまくん正面）
const iconSrc = path.join(ROOT, 'assets/kosukuma/front.png');
if (existsSync(iconSrc)) {
  const pad = (size) =>
    sharp(iconSrc).resize(size, size, {
      fit: 'contain',
      background: { r: 252, g: 250, b: 210, alpha: 1 }, // cream
      kernel: 'nearest', // ドット絵を保つ
    });
  await pad(32).png().toFile(path.join(ROOT, 'favicon-32.png'));
  await pad(180).png().toFile(path.join(ROOT, 'apple-touch-icon.png'));
  await pad(512).png().toFile(path.join(ROOT, 'icon-512.png'));
  console.log('OK: favicon-32 / apple-touch-icon / icon-512');
}

console.log(
  `\n入力 ${(totalIn / 1048576).toFixed(1)}MB → 出力 ${(totalOut / 1048576).toFixed(2)}MB (商品画像srcset計)`,
);
