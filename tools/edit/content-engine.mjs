// tools/edit/content-engine.mjs — 台帳（content-map.json）ベースの安全なテキスト置換エンジン
//
// 原則:
//  - サイト本体ファイルを書き換えるのは saveEntry() だけ（= ユーザーが保存した時だけ）
//  - 保存前に必ず「find断片が期待回数ちょうど出現するか」を再検証（崩れていたら 要再スキャン エラー）
//  - 保存前に対象ファイル + content-map.json を tools/edit/backups/<timestamp>/ に退避
//  - HTML形（<wbr>/.u-ib等）はタグ構造を保った置換のみ許可、テキスト部分は自動エスケープ
//  - JS内の文言はどの引用符コンテキストでも壊れないユニバーサルエスケープ

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAP_REL = 'tools/edit/content-map.json';
const MAP_PATH = path.join(ROOT, MAP_REL);
const BACKUP_ROOT = path.join(ROOT, 'tools', 'edit', 'backups');

const SENTINEL = String.fromCharCode(0); // 置換用センチネル（実ファイルには決して残らない）

export class EditError extends Error {
  constructor(message) { super(message); this.name = 'EditError'; this.status = 400; }
}

export function loadMap() {
  return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
}

const countIn = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const dedupe = (arr) => [...new Set(arr.filter(Boolean))];

export function normalizedItems(entry) {
  if (entry.group) {
    return entry.find.map((f) => ({ file: f.file, find: f.find, count: f.count ?? 1, form: f.form || null }));
  }
  return [{ file: entry.file, find: entry.find, count: 1, form: null }];
}

// ---- 検証（読み取りのみ・書き換え一切なし） ----

export function verifyAll(map) {
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) {
      try { cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
      catch { cache.set(rel, null); }
    }
    return cache.get(rel);
  };
  const results = new Map();
  for (const entry of map.entries) {
    const problems = [];
    for (const it of normalizedItems(entry)) {
      const text = read(it.file);
      if (text == null) { problems.push(`${it.file}: ファイルが読めません`); continue; }
      const n = countIn(text, it.find);
      if (n !== it.count) problems.push(`${it.file}: 期待${it.count}回のところ実際${n}回`);
    }
    results.set(entry.id, problems);
  }
  return results;
}

// ---- エスケープ ----

const escHtmlText = (s) =>
  s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escHtmlAttr = (s) => escHtmlText(s).replace(/"/g, '&quot;');
const escJson = (s) => JSON.stringify(s).slice(1, -1);
// どのJS文字列コンテキスト（' " `）でも合法になるユニバーサルエスケープ（引用符不明時の保険）
const escJsUniversal = (s) =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
// 引用符が特定できた時の最小エスケープ（ファイルの見た目を変えない）
const escJsForQuote = (s, q) => {
  let out = s.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  if (q === '`') return out.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return out.split(q).join('\\' + q);
};
// 断片内の直前を遡って、値を囲むJS引用符を推定（見つからなければnull）
function detectJsQuote(frag, idx) {
  for (let i = idx - 1; i >= 0; i--) {
    const c = frag[i];
    if ((c === "'" || c === '"' || c === '`') && frag[i - 1] !== '\\') return c;
  }
  return null;
}

const stripTags = (s) => s.replace(/<[^>]*>/g, '');
const decodeEntities = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ---- コンテキスト検出 ----

function detectHtmlCtx(frag, idx) {
  const before = frag.slice(0, idx);
  if (/"\s*:\s*"[^"]*$/.test(before)) return 'jsonld'; // "name": "◯◯（JSON-LD文字列値の中）
  if (/=\s*"[^"]*$/.test(before)) return 'attr';       // alt="◯◯ / content="◯◯
  return 'html-text';
}

function encodeNewAt(frag, idx, newRaw, isJs, isHtmlForm) {
  if (isJs) {
    const q = detectJsQuote(frag, idx);
    return q ? escJsForQuote(newRaw, q) : escJsUniversal(newRaw);
  }
  if (isHtmlForm) return newRaw; // サニタイズ済みマークアップをそのまま
  const ctx = detectHtmlCtx(frag, idx);
  if (ctx === 'jsonld') return escJson(newRaw);
  if (ctx === 'attr') return escHtmlAttr(newRaw);
  return escHtmlText(newRaw);
}

// 断片の中から「現在の文言がファイル上でどうエンコードされているか」を探す
function findEncodedOld(frag, oldRaw, isJs) {
  const cands = isJs
    ? [oldRaw, escJsForQuote(oldRaw, "'"), escJsForQuote(oldRaw, '"'), escJsForQuote(oldRaw, '`'), escJsUniversal(oldRaw)]
    : [oldRaw, escHtmlText(oldRaw), escHtmlAttr(oldRaw), escJson(oldRaw)];
  for (const c of dedupe(cands)) if (frag.includes(c)) return c;
  return null;
}

function replaceOccurrences(frag, oldEnc, makeNew) {
  let out = '';
  let pos = 0;
  let hits = 0;
  for (;;) {
    const i = frag.indexOf(oldEnc, pos);
    if (i < 0) break;
    out += frag.slice(pos, i) + makeNew(i);
    pos = i + oldEnc.length;
    hits += 1;
  }
  out += frag.slice(pos);
  if (hits === 0) return null;
  return out;
}

// ---- HTML形のサニタイズ（タグ構造維持 + テキスト自動エスケープ） ----

const VOID_TAGS = new Set(['wbr', 'br']);

export function sanitizeHtmlForm(input, allowedTags) {
  const tokens = input.split(/(<[^>]*>)/);
  let out = '';
  for (const t of tokens) {
    if (!t) continue;
    if (t.startsWith('<') && t.endsWith('>')) {
      if (!allowedTags.has(t)) {
        throw new EditError(
          `使えないタグです: ${t}\n（この項目で使えるタグ: ${[...allowedTags].join(' ') || 'なし'}）`
        );
      }
      out += t;
    } else {
      out += escHtmlText(t);
    }
  }
  const opens = {};
  const closes = {};
  for (const m of out.matchAll(/<(\/?)([a-zA-Z0-9-]+)[^>]*>/g)) {
    const name = m[2].toLowerCase();
    if (VOID_TAGS.has(name)) continue;
    const bucket = m[1] ? closes : opens;
    bucket[name] = (bucket[name] || 0) + 1;
  }
  for (const k of new Set([...Object.keys(opens), ...Object.keys(closes)])) {
    if ((opens[k] || 0) !== (closes[k] || 0)) throw new EditError(`タグ <${k}> の開きと閉じが合っていません`);
  }
  return out;
}

// ---- js-template（`...${expr}...`）の再構築 ----

// `...${expr}...` をブレース深度を数えて分解（${formatMoney({...})} のようなネストに対応）
function splitTemplate(frag) {
  const inner = frag.startsWith('`') && frag.endsWith('`') ? frag.slice(1, -1) : frag;
  const lits = [];
  const exprs = [];
  let cur = '';
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '\\') { cur += inner.slice(i, i + 2); i += 2; continue; }
    if (inner[i] === '$' && inner[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < inner.length && depth > 0) {
        if (inner[j] === '{') depth += 1;
        else if (inner[j] === '}') depth -= 1;
        j += 1;
      }
      lits.push(cur);
      exprs.push(inner.slice(i, j));
      cur = '';
      i = j;
      continue;
    }
    cur += inner[i];
    i += 1;
  }
  lits.push(cur);
  return { lits, exprs };
}

function rebuildTemplate(entry, frag, newPlain) {
  const { lits, exprs } = splitTemplate(frag);
  if (exprs.length === 0) return null; // プレースホルダ無し → 通常のplain置換へ
  // 旧value（表示形）からプレースホルダ文字列（例: （商品名））を逆算する
  const phs = [];
  let rest = entry.value;
  if (!rest.startsWith(lits[0])) throw new EditError('テンプレート断片と現在値が一致しません（要再スキャン）');
  rest = rest.slice(lits[0].length);
  for (let i = 1; i < lits.length; i++) {
    const lit = lits[i];
    const at = lit === '' && i === lits.length - 1 ? rest.length : rest.indexOf(lit);
    if (at < 0) throw new EditError('テンプレート断片と現在値が一致しません（要再スキャン）');
    phs.push(rest.slice(0, at));
    rest = rest.slice(at + lit.length);
  }
  // 新value（表示形）をプレースホルダで分解 → プレースホルダ削除は禁止
  const newLits = [];
  let r = newPlain;
  for (const ph of phs) {
    const i = r.indexOf(ph);
    if (i < 0) throw new EditError(`プレースホルダ「${ph}」は削除できません。文中に残してください`);
    newLits.push(r.slice(0, i));
    r = r.slice(i + ph.length);
  }
  newLits.push(r);
  let out = '`';
  for (let i = 0; i < newLits.length; i++) {
    out += escJsForQuote(newLits[i], '`');
    if (i < exprs.length) out += exprs[i];
  }
  return out + '`';
}

// ---- 1つのfind断片 → 新しい断片 ----

function computeNewFragment(entry, item, newPlain, newHtml) {
  const frag = item.find;
  const isJs = item.file.endsWith('.js');

  if (item.form === 'jsonld-number') {
    const oldNum = (entry.value.match(/\d/g) || []).join('');
    const newNum = (newPlain.match(/\d/g) || []).join('');
    if (!oldNum) throw new EditError('現在値から数値が取り出せません（要再スキャン）');
    if (!newNum) throw new EditError('この項目はJSON-LDの数値と連動しています。¥780 のように数字を含めてください');
    const out = replaceOccurrences(frag, oldNum, () => newNum);
    if (out == null) throw new EditError(`断片に数値 ${oldNum} が見つかりません（要再スキャン）`);
    return out;
  }

  if (entry.type === 'js-template' && !item.form) {
    const rebuilt = rebuildTemplate(entry, frag, newPlain);
    if (rebuilt != null) return rebuilt;
  }

  if (item.form === 'dict') {
    // 1断片に plain（辞書キー）と html（辞書値）が同居 → センチネル方式で安全に両替え
    if (entry.valueHtml == null) throw new EditError('dict形式なのにvalueHtmlがありません（台帳異常）');
    const encHtmlOld = findEncodedOld(frag, entry.valueHtml, true);
    if (!encHtmlOld) throw new EditError('辞書値（HTML形）が断片内に見つかりません（要再スキャン）');
    const s1 = replaceOccurrences(frag, encHtmlOld, () => SENTINEL);
    const encPlainOld = findEncodedOld(s1, entry.value, true);
    if (!encPlainOld) throw new EditError('辞書キー（プレーン形）が断片内に見つかりません（要再スキャン）');
    const s2 = replaceOccurrences(s1, encPlainOld, (i) => encodeNewAt(s1, i, newPlain, true, false));
    if (s2 == null) throw new EditError('辞書キーの置換に失敗しました');
    const s3 = replaceOccurrences(s2, SENTINEL, (i) => encodeNewAt(s2, i, newHtml, true, true));
    return s3 ?? s2;
  }

  const isHtmlForm = item.form === 'html' || item.form === 'dict-value';
  if (isHtmlForm) {
    if (entry.valueHtml == null) throw new EditError('html形式なのにvalueHtmlがありません（台帳異常）');
    const encOld = findEncodedOld(frag, entry.valueHtml, isJs);
    if (!encOld) throw new EditError('HTML形の現在値が断片内に見つかりません（要再スキャン）');
    const out = replaceOccurrences(frag, encOld, (i) => encodeNewAt(frag, i, newHtml, isJs, true));
    if (out == null) throw new EditError('HTML形の置換に失敗しました');
    return out;
  }

  // plain / form無し
  let encOld = findEncodedOld(frag, entry.value, isJs);
  if (encOld) {
    const out = replaceOccurrences(frag, encOld, (i) => encodeNewAt(frag, i, newPlain, isJs, false));
    if (out != null) return out;
  }
  // フォールバック: 断片がHTML形そのもの（例: 再入荷のお知らせを<wbr>聞いてみる）
  if (entry.valueHtml != null) {
    encOld = findEncodedOld(frag, entry.valueHtml, isJs);
    if (encOld) {
      const out = replaceOccurrences(frag, encOld, (i) => encodeNewAt(frag, i, newHtml, isJs, true));
      if (out != null) return out;
    }
  }
  throw new EditError(`断片内に現在の文言が見つかりません（要再スキャン）: ${frag.slice(0, 48)}…`);
}

// ---- バックアップ ----

function backupStamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

export function backupFiles(relPaths) {
  const stamp = backupStamp();
  const dir = path.join(BACKUP_ROOT, stamp);
  for (const rel of dedupe(relPaths)) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return `tools/edit/backups/${stamp}`;
}

// ---- 保存（ここだけがサイト本体ファイルを書き換える） ----

export function saveEntry({ id, value, valueHtml }) {
  const map = loadMap();
  const entry = map.entries.find((e) => e.id === id);
  if (!entry) throw new EditError(`エントリが見つかりません: ${id}`);

  const newPlain = String(value ?? '');
  if (!newPlain.trim()) throw new EditError('空の文言は保存できません');
  if (newPlain.includes(SENTINEL)) throw new EditError('使用できない制御文字が含まれています');

  const items = normalizedItems(entry);
  const touchesJs = items.some((it) => it.file.endsWith('.js'));
  if (touchesJs && /[<>]/.test(newPlain)) {
    throw new EditError('この文言はJS内でも使われるため < と > は使えません');
  }

  let newHtml = null;
  if (entry.valueHtml != null) {
    if (valueHtml == null || !String(valueHtml).trim()) {
      throw new EditError('この項目はマークアップ形（HTML）も必要です。両方を埋めて保存してください');
    }
    const allowed = new Set(entry.valueHtml.match(/<[^>]*>/g) || []);
    newHtml = sanitizeHtmlForm(String(valueHtml), allowed);
    if (decodeEntities(stripTags(newHtml)) !== newPlain) {
      throw new EditError(
        'マークアップ形からタグを除いたテキストがプレーン形と一致していません。\n（折返し辞書とカード文言の連動が壊れるため、両方を同じ内容にしてください）'
      );
    }
  }

  const unchanged = newPlain === entry.value && (entry.valueHtml == null || newHtml === entry.valueHtml);
  if (unchanged) return { unchanged: true, id };

  // 1) 保存直前の再検証 + 新断片の計算（この段階ではまだ何も書かない）
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    return cache.get(rel);
  };
  const plans = [];
  for (const it of items) {
    let text;
    try { text = read(it.file); }
    catch { throw new EditError(`要再スキャン: ${it.file} が読めません`); }
    const n = countIn(text, it.find);
    if (n !== it.count) {
      throw new EditError(`要再スキャン: ${it.file} で断片が期待${it.count}回のところ${n}回でした。台帳の再生成が必要です`);
    }
    const newFrag = computeNewFragment(entry, it, newPlain, newHtml);
    if (newFrag !== it.find && countIn(text, newFrag) > 0) {
      throw new EditError(`衝突: 置換後の断片がすでに ${it.file} に存在します。台帳が曖昧になるため中止しました`);
    }
    plans.push({ ...it, newFrag });
  }

  // 2) バックアップ（変更前ファイル + 台帳）
  const files = dedupe(items.map((i) => i.file));
  const backup = backupFiles([...files, MAP_REL]);

  // 3) 書き込み
  for (const rel of files) {
    let text = read(rel);
    for (const p of plans) {
      if (p.file !== rel || p.newFrag === p.find) continue;
      text = text.split(p.find).join(p.newFrag);
    }
    fs.writeFileSync(path.join(ROOT, rel), text, 'utf8');
    cache.set(rel, text);
  }

  // 4) 台帳を新しい値・新しい断片に更新
  entry.value = newPlain;
  if (entry.valueHtml != null) entry.valueHtml = newHtml;
  if (entry.group) entry.find.forEach((f, i) => { f.find = plans[i].newFrag; });
  else entry.find = plans[0].newFrag;
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 1), 'utf8');

  // 5) 事後検証
  const problems = [];
  for (const it of normalizedItems(entry)) {
    const n = countIn(fs.readFileSync(path.join(ROOT, it.file), 'utf8'), it.find);
    if (n !== it.count) problems.push(`${it.file}: 保存後検証で期待${it.count}回のところ${n}回`);
  }
  return { unchanged: false, id, backup, verified: problems.length === 0, problems };
}

// ---- API用の一覧（検証結果つき） ----

export function contentReport() {
  const map = loadMap();
  const verify = verifyAll(map);
  const entries = map.entries.map((e) => {
    const items = normalizedItems(e);
    const problems = verify.get(e.id) || [];
    return {
      id: e.id,
      label: e.label,
      page: e.page,
      section: e.section,
      type: e.type,
      value: e.value,
      valueHtml: e.valueHtml ?? null,
      note: e.note ?? null,
      related: e.related ?? null,
      group: !!e.group,
      occurrences: items.map((i) => ({ file: i.file, count: i.count, form: i.form })),
      totalCount: items.reduce((a, i) => a + i.count, 0),
      status: problems.length ? 'stale' : 'ok',
      problems,
    };
  });
  return { meta: map._meta ?? null, entries };
}
