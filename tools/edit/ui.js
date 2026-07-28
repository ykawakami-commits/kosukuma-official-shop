// tools/edit/ui.js — 編集ツールUI（テキスト台帳 / 画像スロット / デプロイ）
/* eslint-env browser */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const PAGE_ORDER = ['共通', 'index', 'sticker', 'ultra-tshirt', 'deco-helmet', '404', 'js'];
const PAGE_LABEL = {
  '共通': '共通（複数ページ連動）',
  'index': 'トップページ',
  'sticker': 'ステッカー',
  'ultra-tshirt': 'ウルトラプレミアムTシャツ',
  'deco-helmet': 'デコヘルメット',
  '404': '404ページ',
  'js': 'JS内の文言',
};
const PREVIEW_PAGES = [
  { label: 'トップ', path: '/' },
  { label: 'ステッカー', path: '/products/sticker.html' },
  { label: 'Tシャツ', path: '/products/ultra-tshirt.html' },
  { label: 'ヘルメット', path: '/products/deco-helmet.html' },
  { label: '404', path: '/404.html' },
];

const state = {
  entries: [],          // サーバから取得した台帳（現在保存されている値）
  cards: new Map(),     // id → { el, plainTa, htmlTa, errEl, badgeDirty, ... }
  currentPath: '/',
};

// ---- 共通ヘルパ ----

async function api(path, opts) {
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

let toastTimer = 0;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 6000 : 2600);
}

const stripTags = (s) => s.replace(/<[^>]*>/g, '');
const decodeEntities = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function reloadPreview() {
  const frame = $('#preview-frame');
  try { frame.contentWindow.location.reload(); }
  catch { frame.src = state.currentPath; }
}

// ---- タブ切替 ----

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t === btn));
  const tab = btn.dataset.tab;
  $('#pane-text').hidden = tab !== 'text';
  $('#pane-images').hidden = tab !== 'images';
  $('#pane-deploy').hidden = tab !== 'deploy';
});

// ---- プレビュー操作 ----

function setupPreview() {
  const wrap = $('#page-buttons');
  for (const p of PREVIEW_PAGES) {
    const b = document.createElement('button');
    b.className = 'btn btn-sm page-btn' + (p.path === '/' ? ' is-active' : '');
    b.textContent = p.label;
    b.addEventListener('click', () => {
      state.currentPath = p.path;
      $('#preview-frame').src = p.path;
      $('#open-tab').href = p.path;
      $$('.page-btn').forEach((x) => x.classList.toggle('is-active', x === b));
    });
    wrap.appendChild(b);
  }
  $('#reload-preview').addEventListener('click', reloadPreview);
  $('#device-toggle').addEventListener('click', () => {
    const w = $('#frame-wrap');
    const mobile = w.classList.toggle('is-mobile');
    $('#device-toggle').textContent = mobile ? 'PC表示' : 'スマホ表示';
  });
}

// ---- テキストタブ ----

function entryDirty(entry, card) {
  if (card.plainTa.value !== entry.value) return true;
  if (entry.valueHtml != null && card.htmlTa.value !== entry.valueHtml) return true;
  return false;
}

function updateCardState(entry) {
  const card = state.cards.get(entry.id);
  if (!card) return;
  const dirty = entryDirty(entry, card);
  card.el.classList.toggle('is-dirty', dirty);
  card.badgeDirty.hidden = !dirty;
  card.badgeSaved.hidden = dirty || entry.status !== 'ok';
  card.saveBtn.disabled = !dirty;
  card.resetBtn.disabled = !dirty;
  if (card.htmlTa && card.matchEl) {
    const okMatch = decodeEntities(stripTags(card.htmlTa.value)) === card.plainTa.value;
    card.matchEl.textContent = okMatch ? '✓ プレーン形と一致' : '✗ プレーン形と不一致（保存できません）';
    card.matchEl.className = okMatch ? 'match' : 'mismatch';
  }
  updateSaveAll();
}

function updateSaveAll() {
  const dirtyIds = [...state.cards.keys()].filter((id) => {
    const entry = state.entries.find((e) => e.id === id);
    const card = state.cards.get(id);
    return entry && card && entry.status === 'ok' && entryDirty(entry, card);
  });
  const btn = $('#save-all');
  btn.disabled = dirtyIds.length === 0;
  btn.textContent = dirtyIds.length ? `変更を全部保存（${dirtyIds.length}件）` : '変更を全部保存';
}

async function saveOne(entry) {
  const card = state.cards.get(entry.id);
  card.errEl.textContent = '';
  card.saveBtn.disabled = true;
  card.saveBtn.textContent = '保存中…';
  try {
    const body = { id: entry.id, value: card.plainTa.value };
    if (entry.valueHtml != null) body.valueHtml = card.htmlTa.value;
    const result = await api('/_edit/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!result.unchanged) {
      entry.value = card.plainTa.value;
      if (entry.valueHtml != null) entry.valueHtml = card.htmlTa.value;
      toast(`保存しました: ${entry.label}` + (result.verified === false ? '\n（注意: 保存後検証で不一致あり）' : ''));
      reloadPreview();
    }
    updateCardState(entry);
    return true;
  } catch (e) {
    card.errEl.textContent = e.message;
    toast(`保存できませんでした: ${entry.label}`, true);
    return false;
  } finally {
    card.saveBtn.textContent = '保存';
    updateCardState(entry);
  }
}

function buildEntryCard(entry) {
  const el = document.createElement('div');
  el.className = 'entry' + (entry.status === 'stale' ? ' is-stale' : '');
  el.dataset.id = entry.id;

  const head = document.createElement('div');
  head.className = 'entry-head';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = entry.label;
  head.appendChild(label);

  const badges = document.createElement('span');
  badges.className = 'entry-badges';
  const bCount = document.createElement('span');
  bCount.className = 'badge' + (entry.group ? ' badge-linked' : '');
  bCount.textContent = entry.group ? `連動 ${entry.totalCount}箇所を同時更新` : `${entry.totalCount}箇所`;
  badges.appendChild(bCount);
  const badgeDirty = document.createElement('span');
  badgeDirty.className = 'badge badge-dirty';
  badgeDirty.textContent = '変更あり（未保存）';
  badgeDirty.hidden = true;
  badges.appendChild(badgeDirty);
  const badgeSaved = document.createElement('span');
  badgeSaved.className = 'badge badge-saved';
  badgeSaved.textContent = '保存済み';
  badges.appendChild(badgeSaved);
  if (entry.status === 'stale') {
    const bs = document.createElement('span');
    bs.className = 'badge badge-stale';
    bs.textContent = '要再スキャン';
    badges.appendChild(bs);
  }
  head.appendChild(badges);
  el.appendChild(head);

  if (entry.note) {
    const note = document.createElement('p');
    note.className = 'entry-note';
    note.textContent = '※ ' + entry.note;
    el.appendChild(note);
  }
  if (entry.status === 'stale') {
    const pr = document.createElement('p');
    pr.className = 'entry-problems';
    pr.textContent = 'ファイル内の断片が台帳と食い違っています（編集不可）:\n' + entry.problems.join('\n');
    el.appendChild(pr);
  }

  const disabled = entry.status === 'stale';
  const plainTa = document.createElement('textarea');
  plainTa.value = entry.value;
  plainTa.disabled = disabled;
  plainTa.rows = Math.min(6, Math.max(1, Math.ceil(entry.value.length / 40)));
  let htmlTa = null;
  let matchEl = null;

  if (entry.valueHtml != null) {
    const fl1 = document.createElement('div');
    fl1.className = 'field-label';
    fl1.textContent = '表示テキスト（プレーン形）';
    el.appendChild(fl1);
    el.appendChild(plainTa);

    const fl2 = document.createElement('div');
    fl2.className = 'field-label';
    const t = document.createElement('span');
    t.textContent = 'マークアップ形（<wbr>や.u-ib等の折返しタグ入り・両方同時に保存されます）';
    fl2.appendChild(t);
    matchEl = document.createElement('span');
    fl2.appendChild(matchEl);
    const syncBtn = document.createElement('button');
    syncBtn.type = 'button';
    syncBtn.className = 'link-btn';
    syncBtn.textContent = 'タグなしでプレーン形から作り直す';
    fl2.appendChild(syncBtn);
    el.appendChild(fl2);

    htmlTa = document.createElement('textarea');
    htmlTa.className = 'html-form';
    htmlTa.value = entry.valueHtml;
    htmlTa.disabled = disabled;
    htmlTa.rows = Math.min(6, Math.max(1, Math.ceil(entry.valueHtml.length / 46)));
    el.appendChild(htmlTa);
    syncBtn.addEventListener('click', () => {
      htmlTa.value = plainTa.value;
      updateCardState(entry);
    });
  } else {
    el.appendChild(plainTa);
  }

  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.textContent = '保存';
  saveBtn.disabled = true;
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-sm';
  resetBtn.textContent = '元に戻す';
  resetBtn.disabled = true;
  const errEl = document.createElement('span');
  errEl.className = 'entry-error';
  actions.append(saveBtn, resetBtn, errEl);
  el.appendChild(actions);

  const files = document.createElement('div');
  files.className = 'entry-files';
  files.textContent = entry.occurrences.map((o) => `${o.file}×${o.count}`).join(' / ');
  el.appendChild(files);

  const card = { el, plainTa, htmlTa, matchEl, errEl, badgeDirty, badgeSaved, saveBtn, resetBtn };
  state.cards.set(entry.id, card);

  plainTa.addEventListener('input', () => updateCardState(entry));
  if (htmlTa) htmlTa.addEventListener('input', () => updateCardState(entry));
  saveBtn.addEventListener('click', () => saveOne(entry));
  resetBtn.addEventListener('click', () => {
    plainTa.value = entry.value;
    if (htmlTa) htmlTa.value = entry.valueHtml;
    errEl.textContent = '';
    updateCardState(entry);
  });
  updateCardState(entry);
  return el;
}

function renderEntries() {
  const list = $('#entry-list');
  list.textContent = '';
  state.cards.clear();
  const pages = [...new Set([...PAGE_ORDER, ...state.entries.map((e) => e.page)])];
  for (const page of pages) {
    const pageEntries = state.entries.filter((e) => e.page === page);
    if (!pageEntries.length) continue;
    const details = document.createElement('details');
    details.className = 'page-group';
    details.open = page !== 'js';
    const summary = document.createElement('summary');
    summary.textContent = PAGE_LABEL[page] || page;
    const cnt = document.createElement('span');
    cnt.className = 'count';
    cnt.textContent = `　${pageEntries.length}件`;
    summary.appendChild(cnt);
    details.appendChild(summary);
    let lastSection = null;
    for (const entry of pageEntries) {
      if (entry.section !== lastSection) {
        lastSection = entry.section;
        const h = document.createElement('div');
        h.className = 'section-head';
        h.textContent = entry.section;
        details.appendChild(h);
      }
      details.appendChild(buildEntryCard(entry));
    }
    list.appendChild(details);
  }
  updateSummary();
}

function updateSummary() {
  const stale = state.entries.filter((e) => e.status === 'stale').length;
  const el = $('#summary');
  el.textContent = '';
  el.append(`台帳 ${state.entries.length}件`);
  if (stale) {
    const w = document.createElement('span');
    w.className = 'warn';
    w.textContent = `　要再スキャン ${stale}件`;
    el.appendChild(w);
  } else {
    el.append('　全て検証OK');
  }
}

function setupSearch() {
  $('#search').addEventListener('input', () => {
    const q = $('#search').value.trim().toLowerCase();
    for (const entry of state.entries) {
      const card = state.cards.get(entry.id);
      if (!card) continue;
      const hay = `${entry.label} ${entry.id} ${entry.value} ${entry.section}`.toLowerCase();
      card.el.hidden = q !== '' && !hay.includes(q);
    }
    $$('.page-group').forEach((g) => {
      const visible = $$('.entry', g).some((c) => !c.hidden);
      g.hidden = !visible;
      if (q) g.open = true;
    });
  });
}

$('#save-all').addEventListener('click', async () => {
  const targets = state.entries.filter((e) => {
    const card = state.cards.get(e.id);
    return card && e.status === 'ok' && entryDirty(e, card);
  });
  let okCount = 0;
  for (const entry of targets) {
    const ok = await saveOne(entry);
    if (ok) okCount += 1;
  }
  toast(`${okCount}/${targets.length}件を保存しました`);
});

function renderReadOnlyInfo(meta) {
  if (!meta) return;
  const list = $('#entry-list');
  const box = document.createElement('details');
  box.className = 'page-group readonly-info';
  const summary = document.createElement('summary');
  summary.textContent = '編集対象外（読み取り専用）について';
  box.appendChild(summary);
  const addSection = (title, items) => {
    if (!items?.length) return;
    const h = document.createElement('div');
    h.className = 'section-head';
    h.textContent = title;
    box.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'readonly-list';
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  };
  addSection('このツールでは変更できないもの', meta.readOnlyTargets);
  addSection('ユーザーに見えないため台帳に入れていないもの', meta.excludedAsNonUserVisible);
  list.appendChild(box);
}

async function loadContent() {
  try {
    const data = await api('/_edit/api/content');
    state.entries = data.entries;
    renderEntries();
    renderReadOnlyInfo(data.meta);
  } catch (e) {
    $('#entry-list').textContent = `台帳の読み込みに失敗しました: ${e.message}`;
  }
}

// ---- 画像タブ ----

function buildSlotCard(slot) {
  const el = document.createElement('div');
  el.className = 'slot';

  const main = slot.targets[0];
  const thumb = document.createElement('img');
  thumb.className = 'slot-thumb';
  thumb.src = `/${main.path}?v=${main.mtime}`;
  thumb.alt = '';
  el.appendChild(thumb);

  const label = document.createElement('div');
  label.className = 'slot-label';
  label.textContent = slot.label;
  el.appendChild(label);

  const meta = document.createElement('div');
  meta.className = 'slot-meta';
  const kb = (n) => `${Math.round(n / 102.4) / 10}KB`;
  meta.textContent = slot.targets
    .map((t) => `${t.path}（${t.width}×${t.height}${t.exists ? ` / ${kb(t.bytes)}` : ' / 未存在'}）`)
    .join('\n');
  meta.style.whiteSpace = 'pre-wrap';
  el.appendChild(meta);

  if (slot.bgHint) {
    const bg = document.createElement('div');
    bg.className = 'slot-usedat';
    bg.textContent = `背景: ${slot.bgHint}`;
    el.appendChild(bg);
  }
  if (slot.usedAt?.length) {
    const used = document.createElement('div');
    used.className = 'slot-usedat';
    used.textContent = `使用箇所: ${slot.usedAt.join(' / ')}`;
    el.appendChild(used);
  }

  const controls = document.createElement('div');
  controls.className = 'slot-controls';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  const fit = document.createElement('select');
  for (const [v, t] of [['contain', 'おさめる（余白透過）'], ['cover', 'おおう（はみ出しクロップ）']]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    fit.appendChild(o);
  }
  fit.value = slot.defaultFit;
  const up = document.createElement('button');
  up.className = 'btn btn-primary btn-sm';
  up.textContent = 'アップロード';
  up.disabled = true;
  controls.append(file, fit, up);
  el.appendChild(controls);

  const msg = document.createElement('div');
  msg.className = 'slot-msg';
  el.appendChild(msg);

  file.addEventListener('change', () => { up.disabled = !file.files[0]; });
  up.addEventListener('click', async () => {
    const f = file.files[0];
    if (!f) return;
    up.disabled = true;
    up.textContent = '変換中…';
    msg.className = 'slot-msg';
    msg.textContent = '';
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('ファイルが読めませんでした'));
        r.readAsDataURL(f);
      });
      const result = await api('/_edit/api/upload-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, dataBase64: dataUrl, fit: fit.value }),
      });
      msg.className = 'slot-msg ok';
      msg.textContent = '差し替えました:\n' + result.written.map((w) => `${w.path}（${Math.round(w.bytes / 1024)}KB）`).join('\n');
      thumb.src = `/${main.path}?v=${Date.now()}`;
      toast(`画像を差し替えました: ${slot.label}`);
      reloadPreview();
    } catch (e) {
      msg.className = 'slot-msg err';
      msg.textContent = e.message;
      toast('画像の差し替えに失敗しました', true);
    } finally {
      up.disabled = !file.files[0];
      up.textContent = 'アップロード';
    }
  });
  return el;
}

async function loadImages() {
  try {
    const data = await api('/_edit/api/images');
    const list = $('#slot-list');
    list.textContent = '';
    for (const slot of data.slots) list.appendChild(buildSlotCard(slot));
  } catch (e) {
    $('#slot-list').textContent = `スロットの読み込みに失敗しました: ${e.message}`;
  }
}

// ---- デプロイタブ ----

let logCursor = 0;
let logTimer = 0;

function renderDeployInfo(config) {
  const el = $('#deploy-info');
  el.textContent = '';
  const add = (html) => { el.appendChild(html); };
  const p = (text, cls) => {
    const n = document.createElement('div');
    if (cls) n.className = cls;
    n.textContent = text;
    return n;
  };
  const code = (text) => {
    const n = document.createElement('code');
    n.textContent = text;
    return n;
  };
  if (!config) {
    add(p('デプロイ設定（tools/edit/config.json）が見つかりません。以下の形式で作成してください:'));
    add(code('{ "e2e": { "command": "npm run e2e -- http://127.0.0.1:8820" },\n  "deploy": { "preview": { "command": "npx wrangler pages deploy . --project-name=<プロジェクト名> --branch=main --commit-dirty=true" } } }'));
    return;
  }
  add(p('① E2E（受け入れ基準の全PASSがデプロイの条件）:'));
  add(code(config.e2e?.command || '(未設定)'));
  add(p(`② プレビューデプロイ → ${config.deploy?.preview?.url || ''}`));
  add(code(config.deploy?.preview?.command || '(未設定)'));
  if (config.deploy?.production) {
    add(p(`本番デプロイ（UIからは実行不可） → ${config.deploy.production.url || ''}`, 'muted'));
    add(code(config.deploy.production.command || ''));
    if (config.deploy.production.note) add(p(config.deploy.production.note, 'muted'));
  }
}

function setDeployRunning(running, phase) {
  $('#btn-e2e').disabled = running;
  $('#btn-deploy').disabled = running;
  $('#btn-stop').hidden = !running;
  const st = $('#deploy-status');
  if (running) {
    st.className = 'deploy-status running';
    st.textContent = phase === 'deploy' ? 'デプロイ実行中…' : 'E2E実行中…';
  }
}

async function pollLog() {
  try {
    const data = await api(`/_edit/api/deploy-log?cursor=${logCursor}`);
    if (data.lines.length) {
      const log = $('#deploy-log');
      log.textContent += data.lines.join('\n') + '\n';
      log.scrollTop = log.scrollHeight;
      logCursor = data.cursor;
    }
    setDeployRunning(data.running, data.phase);
    if (!data.running) {
      clearInterval(logTimer);
      logTimer = 0;
      const st = $('#deploy-status');
      if (data.result) {
        st.className = 'deploy-status ' + (data.result.ok ? 'ok' : 'err');
        st.textContent = data.result.message;
      }
    }
  } catch { /* ポーリング失敗は次回に任せる */ }
}

async function startDeploy(mode) {
  try {
    $('#deploy-log').textContent = '';
    logCursor = 0;
    await api('/_edit/api/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    setDeployRunning(true, 'e2e');
    if (!logTimer) logTimer = setInterval(pollLog, 900);
  } catch (e) {
    toast(e.message, true);
  }
}

$('#btn-e2e').addEventListener('click', () => startDeploy('e2e'));
$('#btn-deploy').addEventListener('click', () => startDeploy('deploy'));
$('#btn-stop').addEventListener('click', async () => {
  await api('/_edit/api/deploy-stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
});

async function loadDeployConfig() {
  try {
    const data = await api('/_edit/api/deploy-config');
    renderDeployInfo(data.config);
  } catch (e) {
    renderDeployInfo(null);
  }
}

// ---- 起動 ----

setupPreview();
setupSearch();
loadContent();
loadImages();
loadDeployConfig();
pollLog(); // 進行中ジョブがあれば拾う
