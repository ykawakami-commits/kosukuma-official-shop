// tools/edit/server.mjs — ローカル編集サーバ（node:http のみ・依存追加なし）
//
// 起動: npm run edit → http://localhost:8820/_edit
//  - / でサイト本体をそのまま配信（編集UIのiframeプレビューと同一オリジン）
//  - /_edit で日本語編集UI（テキスト台帳 / 画像スロット / デプロイ）
//  - サイト本体ファイルを書き換えるのは「保存」「画像アップロード」のAPIだけ。
//    起動・スキャン・配信では一切書き換えない
//  - 127.0.0.1 バインドのみ（外部非公開）

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, EditError, contentReport, saveEntry } from './content-engine.mjs';
import { imagesReport, uploadImage } from './image-engine.mjs';

const HOST = '127.0.0.1';
const PORT = 8820;
const EDIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(EDIT_DIR, 'config.json');
const KEY_PATH = path.join(EDIT_DIR, '.access-key');       // git管理外（.gitignore済み）
const AUDIT_PATH = path.join(EDIT_DIR, 'audit.log');       // *.log は .gitignore 済み

// ---- リモートアクセスキー ----
// Cloudflare Tunnel 経由の外部アクセスは、このキーを知っている人だけ編集可能。
// ローカル（トンネルを通らない 127.0.0.1 直アクセス）は従来どおりキー不要。
// キーを無効化したい時は .access-key を削除して再起動（新キーが発行される）。
function ensureAccessKey() {
  try {
    const k = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (/^[0-9a-f]{32,64}$/.test(k)) return k;
  } catch { /* 初回は未作成 */ }
  const k = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(KEY_PATH, k + '\n');
  return k;
}
const ACCESS_KEY = ensureAccessKey();

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// トンネル経由か（cloudflaredが付ける cf-connecting-ip で判定。ローカル直はヘッダ無し）
const isRemote = (req) => Boolean(req.headers['cf-connecting-ip']);
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress;

// 認可済みなら true。未認可ならレスポンスを書いて false を返す
function requireAuth(req, res, url) {
  if (!isRemote(req)) return true; // ローカルは従来どおり
  const qKey = url.searchParams.get('key');
  if (qKey !== null) {
    if (safeEqual(qKey, ACCESS_KEY)) {
      // キー付きURLで来たら HttpOnly クッキーに移してクリーンなURLへ
      res.writeHead(302, {
        'set-cookie': `edit_key=${ACCESS_KEY}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
        location: url.pathname || '/_edit',
      });
      res.end();
      return false; // リダイレクト済み
    }
  } else if (safeEqual(parseCookies(req).edit_key || '', ACCESS_KEY)) {
    return true;
  }
  res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end('<!doctype html><meta charset="utf-8"><title>アクセスキーが必要です</title>'
    + '<body style="font-family:sans-serif;max-width:32em;margin:20vh auto;text-align:center">'
    + '<h1 style="font-size:1.2rem">このページを開くにはアクセスキーが必要だよ</h1>'
    + '<p>共有されたキー付きURL（…/_edit?key=XXXX）からアクセスしてね。</p></body>');
  return false;
}

function auditLog(req, pathname) {
  try {
    fs.appendFileSync(AUDIT_PATH, JSON.stringify({
      ts: new Date().toISOString(), ip: clientIp(req), remote: isRemote(req),
      method: req.method, path: pathname,
    }) + '\n');
  } catch { /* 監査ログ失敗で本処理は止めない */ }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return null; }
}

// ---- レスポンスヘルパ ----

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function sendFile(res, absPath, status = 200) {
  const ext = path.extname(absPath).toLowerCase();
  res.writeHead(status, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store', // 編集の即時反映を最優先（ローカル専用）
  });
  fs.createReadStream(absPath).pipe(res);
}

function send404(res) {
  const p404 = path.join(ROOT, '404.html');
  if (fs.existsSync(p404)) return sendFile(res, p404, 404);
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

function readBody(req, limitBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limitBytes) { reject(new EditError('リクエストが大きすぎます')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  try { return JSON.parse(buf.toString('utf8')); }
  catch { throw new EditError('JSONのパースに失敗しました'); }
}

// ---- デプロイジョブ（1本のみ・ログはポーリングで取得） ----

const job = { running: false, phase: null, mode: null, lines: [], child: null, result: null, startedAt: 0 };

function jobLog(line) {
  for (const l of String(line).replace(/\r\n/g, '\n').split('\n')) {
    if (l.trim() === '') continue;
    job.lines.push(l.length > 4000 ? l.slice(0, 4000) + '…' : l);
  }
  if (job.lines.length > 5000) job.lines.splice(0, job.lines.length - 5000);
}

function runStep(command, phase) {
  return new Promise((resolve) => {
    job.phase = phase;
    jobLog(`$ ${command}`);
    const child = spawn(command, { shell: true, cwd: ROOT, windowsHide: true });
    job.child = child;
    let out = '';
    child.stdout.on('data', (d) => { const s = d.toString('utf8'); out += s; jobLog(s); });
    child.stderr.on('data', (d) => { const s = d.toString('utf8'); out += s; jobLog(s); });
    child.on('error', (e) => { jobLog(`spawn error: ${e.message}`); resolve({ code: -1, out }); });
    child.on('close', (code) => { job.child = null; resolve({ code, out }); });
  });
}

async function runJob(mode) {
  const config = loadConfig();
  const e2eCmd = config?.e2e?.command || `npm run e2e -- http://${HOST}:${PORT}`;
  try {
    // 1) E2E（全PASSがデプロイの前提条件）
    const e2e = await runStep(e2eCmd, 'e2e');
    const failLines = (e2e.out.match(/^FAIL: .*/gm) || []).length;
    const e2ePassed = e2e.code === 0 && failLines === 0;
    if (!e2ePassed) {
      jobLog(`==== E2E不合格（exit=${e2e.code} / FAIL ${failLines}件）。デプロイは実行しません ====`);
      job.result = { ok: false, phase: 'e2e', message: `E2E不合格（FAIL ${failLines}件）` };
      return;
    }
    jobLog('==== E2E全PASS ====');
    if (mode === 'e2e') { job.result = { ok: true, phase: 'e2e', message: 'E2E全PASS' }; return; }

    // 2) デプロイ（プレビューのみUIから許可）
    const target = config?.deploy?.preview;
    if (!target?.command || target.enabled === false) {
      jobLog('デプロイコマンドが未設定です。tools/edit/config.json の deploy.preview.command を設定してください');
      job.result = { ok: false, phase: 'deploy', message: 'デプロイコマンド未設定（config.jsonを確認）' };
      return;
    }
    const dep = await runStep(target.command, 'deploy');
    if (dep.code !== 0) {
      job.result = { ok: false, phase: 'deploy', message: `デプロイ失敗（exit=${dep.code}）` };
      return;
    }
    jobLog(`==== デプロイ完了: ${target.url || ''} ====`);
    job.result = { ok: true, phase: 'deploy', message: `デプロイ完了 ${target.url || ''}` };
  } catch (e) {
    jobLog(`ジョブエラー: ${e.message}`);
    job.result = { ok: false, phase: job.phase, message: e.message };
  } finally {
    job.running = false;
    job.phase = null;
  }
}

function startJob(mode) {
  if (job.running) throw new EditError('すでに実行中のジョブがあります');
  job.running = true;
  job.mode = mode;
  job.lines = [];
  job.result = null;
  job.startedAt = Date.now();
  runJob(mode); // fire-and-forget（ログはポーリングで見る）
}

function stopJob() {
  if (!job.running || !job.child) return false;
  try { execSync(`taskkill /pid ${job.child.pid} /T /F`, { stdio: 'ignore' }); }
  catch { try { job.child.kill('SIGKILL'); } catch { /* すでに終了 */ } }
  jobLog('（ユーザーが中止しました）');
  return true;
}

// ---- APIルーティング ----

// ---- チャット（編集ページ ⇄ このPCで待機するClaudeの直通窓口） ----
// 仕組み: 送信は log.jsonl に追記されるだけ。Claude Code 側が tail -F で新着を監視し、
// 返信を POST /_edit/api/chat/reply（ローカル専用）で書き込む。UIは3秒ポーリング。

const CHAT_DIR = path.join(EDIT_DIR, 'chat');
const CHAT_LOG = path.join(CHAT_DIR, 'log.jsonl');

function appendChat(entry) {
  fs.mkdirSync(CHAT_DIR, { recursive: true });
  fs.appendFileSync(CHAT_LOG, JSON.stringify(entry) + '\n');
  return entry;
}

function readChat(afterTs = 0, limit = 300) {
  let lines = [];
  try { lines = fs.readFileSync(CHAT_LOG, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  const out = [];
  for (const l of lines) {
    try { const e = JSON.parse(l); if (e.ts > afterTs) out.push(e); }
    catch { /* 壊れた行はスキップ（表示を止めない） */ }
  }
  return out.slice(-limit);
}

async function handleApi(req, res, pathname, query) {
  if (req.method === 'GET' && pathname === '/_edit/api/chat/log') {
    return sendJson(res, 200, { messages: readChat(Number(query.get('after') || 0)) });
  }
  if (req.method === 'POST' && pathname === '/_edit/api/chat/send') {
    const body = await readJsonBody(req);
    const text = String(body.text || '').trim();
    if (!text) throw new EditError('メッセージが空です');
    if (text.length > 4000) throw new EditError('メッセージが長すぎます（4000文字まで）');
    const entry = appendChat({
      id: crypto.randomUUID(), ts: Date.now(), role: 'user',
      name: String(body.name || '').trim().slice(0, 30) || 'ゲスト',
      ip: clientIp(req), text,
    });
    return sendJson(res, 200, { ok: true, entry });
  }
  if (req.method === 'POST' && pathname === '/_edit/api/chat/reply') {
    // 返信を書けるのはこのPC上のClaudeだけ（トンネル経由の書き込みは拒否）
    if (isRemote(req)) throw new EditError('replyはローカル専用です');
    const body = await readJsonBody(req);
    const text = String(body.text || '').trim();
    if (!text) throw new EditError('メッセージが空です');
    const entry = appendChat({ id: crypto.randomUUID(), ts: Date.now(), role: 'assistant', name: 'Claude', text });
    return sendJson(res, 200, { ok: true, entry });
  }
  if (req.method === 'GET' && pathname === '/_edit/api/content') {
    return sendJson(res, 200, contentReport());
  }
  if (req.method === 'POST' && pathname === '/_edit/api/save') {
    const body = await readJsonBody(req);
    const result = saveEntry(body);
    return sendJson(res, 200, result);
  }
  if (req.method === 'GET' && pathname === '/_edit/api/images') {
    return sendJson(res, 200, imagesReport());
  }
  if (req.method === 'POST' && pathname === '/_edit/api/upload-image') {
    const body = await readJsonBody(req);
    const result = await uploadImage(body);
    return sendJson(res, 200, result);
  }
  if (req.method === 'GET' && pathname === '/_edit/api/deploy-config') {
    return sendJson(res, 200, { config: loadConfig(), configPath: 'tools/edit/config.json' });
  }
  if (req.method === 'POST' && pathname === '/_edit/api/deploy') {
    const body = await readJsonBody(req);
    const mode = body.mode === 'deploy' ? 'deploy' : 'e2e';
    startJob(mode);
    return sendJson(res, 200, { started: true, mode });
  }
  if (req.method === 'POST' && pathname === '/_edit/api/deploy-stop') {
    return sendJson(res, 200, { stopped: stopJob() });
  }
  if (req.method === 'GET' && pathname === '/_edit/api/deploy-log') {
    const cursor = Math.max(0, Number(query.get('cursor')) || 0);
    return sendJson(res, 200, {
      cursor: job.lines.length,
      lines: job.lines.slice(cursor),
      running: job.running,
      phase: job.phase,
      mode: job.mode,
      result: job.result,
    });
  }
  return sendJson(res, 404, { error: 'unknown api' });
}

// ---- 静的配信（サイト本体 + 編集UI） ----

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return send404(res);
  let stat = null;
  try { stat = fs.statSync(abs); } catch { /* 404へ */ }
  if (stat?.isDirectory()) {
    const idx = path.join(abs, 'index.html');
    if (fs.existsSync(idx)) return sendFile(res, idx);
    return send404(res);
  }
  if (stat?.isFile()) return sendFile(res, abs);
  return send404(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = url.pathname;
  try {
    // 編集UI・編集APIはリモート（トンネル経由）ならアクセスキー必須
    if (pathname === '/_edit' || pathname.startsWith('/_edit/')) {
      if (!requireAuth(req, res, url)) return;
      if (req.method === 'POST') auditLog(req, pathname); // 書き込み系の監査証跡
    }
    if (pathname === '/_edit' || pathname === '/_edit/') return sendFile(res, path.join(EDIT_DIR, 'ui.html'));
    if (pathname === '/_edit/ui.css') return sendFile(res, path.join(EDIT_DIR, 'ui.css'));
    if (pathname === '/_edit/ui.js') return sendFile(res, path.join(EDIT_DIR, 'ui.js'));
    if (pathname.startsWith('/_edit/api/')) return await handleApi(req, res, pathname, url.searchParams);
    return serveStatic(res, pathname);
  } catch (e) {
    const status = e instanceof EditError ? e.status : 500;
    if (status === 500) console.error('[edit-server]', e);
    return sendJson(res, status, { error: e.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  const report = contentReport();
  const stale = report.entries.filter((e) => e.status === 'stale');
  console.log('┌──────────────────────────────────────────────');
  console.log('│ こすくまくんのおみせ 編集サーバ');
  console.log(`│ 編集UI:      http://localhost:${PORT}/_edit`);
  console.log(`│ サイト配信:  http://localhost:${PORT}/`);
  console.log(`│ 台帳: ${report.entries.length}件（OK ${report.entries.length - stale.length} / 要再スキャン ${stale.length}）`);
  for (const s of stale.slice(0, 10)) console.log(`│   要再スキャン: ${s.id} — ${s.problems.join(' / ')}`);
  console.log('│ ※ 起動時は検証のみ。ファイルは一切書き換えていません');
  console.log(`│ リモート共有キー: ${ACCESS_KEY.slice(0, 6)}…（全文は tools/edit/.access-key）`);
  console.log('└──────────────────────────────────────────────');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`ポート${PORT}が使用中です。既存の編集サーバが起動していないか確認してください`);
    process.exit(1);
  }
  throw e;
});
