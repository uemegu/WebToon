// WebToon 管理画面
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const today = () => new Date().toLocaleDateString('sv-SE');

let db;
let sel = { view: 'site' }; // {view:'series', s} | {view:'episode', s, e}
let og = { page: 0, zoom: 1, x: 0.5, y: 0 };

const api = {
  async req(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  upload: (blob, ext, s, e) =>
    api.req(`/api/upload?${new URLSearchParams({ series: s, ext, ...(e ? { episode: e } : {}) })}`, { method: 'POST', body: blob }),
  delFile: (file, s, e) =>
    api.req(`/api/file?${new URLSearchParams({ series: s, file, ...(e ? { episode: e } : {}) })}`, { method: 'DELETE' }),
  delDir: (s, e) => api.req(`/api/dir?${new URLSearchParams({ series: s, ...(e ? { episode: e } : {}) })}`, { method: 'DELETE' }),
};

// ---- 保存 ----
let saveTimer;
const status = (t) => ($('#status').textContent = t);
function scheduleSave() {
  status('未保存…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}
async function saveNow() {
  clearTimeout(saveTimer);
  try {
    await api.req('/api/db', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(db) });
    status(`保存済み ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    status(`保存失敗: ${err.message}`);
  }
}

// ---- 画像処理 ----
function loadImage(src) {
  return new Promise((ok, ng) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ng(new Error('画像を読み込めません'));
    img.src = src;
  });
}
const toBlob = (canvas, type, q) => new Promise((ok) => canvas.toBlob(ok, type, q));

// 縦長画像を WebP に変換（小さくなる場合のみ採用）
async function prepare(file, webp) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    let ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    let blob = file;
    if (webp && ext !== 'gif') {
      try {
        const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
        c.getContext('2d').drawImage(img, 0, 0);
        const b = await toBlob(c, 'image/webp', 0.9);
        if (b?.type === 'image/webp' && b.size < file.size) {
          blob = b;
          ext = 'webp';
        }
      } catch {}
    }
    return { blob, ext, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const imgUrl = (s, e, file) => `/images/${s.id}/${e ? e.id + '/' : ''}${file}`;

// ---- サイドバー ----
function renderSide() {
  const items = db.series
    .map((s, si) => {
      const eps = s.episodes
        .map(
          (e, ei) =>
            `<button class="nav-item ${e.published === false ? 'draft' : ''} ${sel.view === 'episode' && sel.s === si && sel.e === ei ? 'active' : ''}" data-act="go-episode" data-s="${si}" data-e="${ei}">${esc(e.title || e.id)}</button>`
        )
        .join('');
      return `<button class="nav-item nav-series ${sel.view === 'series' && sel.s === si ? 'active' : ''}" data-act="go-series" data-s="${si}">${esc(s.title || s.id)}</button>
        <div class="nav-eps">${eps}<button class="nav-item nav-add" data-act="add-episode" data-s="${si}">＋ 話を追加</button></div>`;
    })
    .join('');
  $('#side').innerHTML = `
    <button class="nav-item ${sel.view === 'site' ? 'active' : ''}" data-act="go-site">サイト設定</button>
    <hr>${items}<hr>
    <button class="nav-item nav-add" data-act="add-series">＋ 作品を追加</button>`;
}

// ---- メイン ----
const field = (label, key, value, type = 'text', hint = '') =>
  `<label class="field"><span>${label}</span>${
    type === 'textarea'
      ? `<textarea data-bind="${key}">${esc(value)}</textarea>`
      : `<input type="${type}" data-bind="${key}" value="${esc(value)}">`
  }${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;

function current() {
  if (sel.view === 'site') return db.site;
  const s = db.series[sel.s];
  return sel.view === 'series' ? s : s.episodes[sel.e];
}

function renderMain() {
  const main = $('#main');
  if (sel.view === 'site') {
    const t = db.site;
    main.innerHTML = `<h2>サイト設定</h2>
      ${field('サイト名', 'title', t.title)}
      ${field('説明', 'description', t.description, 'textarea')}
      ${field('公開URL', 'baseUrl', t.baseUrl, 'url', 'GitHub Pages のURL（例: https://ユーザー名.github.io/リポジトリ名）。OGP画像の絶対URLに使います。')}
      ${field('作者名', 'author', t.author)}
      ${field('X(Twitter) アカウント', 'twitter', t.twitter, 'text', '@なしでOK。twitter:site に設定されます。')}`;
    return;
  }

  const s = db.series[sel.s];
  if (sel.view === 'series') {
    main.innerHTML = `<h2>${esc(s.title)} <span class="idbox">/${esc(s.id)}/</span></h2>
      <div class="toolbar">
        <button data-act="move-series" data-d="-1">↑ 上へ</button>
        <button data-act="move-series" data-d="1">↓ 下へ</button>
        <button data-act="add-episode" data-s="${sel.s}">＋ 話を追加</button>
        <button class="danger" data-act="del-series">作品を削除</button>
      </div>
      ${field('タイトル', 'title', s.title)}
      ${field('作者', 'author', s.author)}
      ${field('あらすじ・説明', 'description', s.description, 'textarea', '作品ページと、話に説明がない場合のOGP説明文に使われます。')}
      <h3>カバー画像（任意）</h3>
      ${s.cover ? `<img class="cover" src="${imgUrl(s, null, s.cover)}"><button class="danger small" data-act="del-cover">カバーを削除</button>` : '<p class="hint">未設定の場合は第1話のOGP画像（なければ1ページ目）が使われます。推奨 1200×630。</p>'}
      <div class="row" style="margin-top:8px"><input type="file" accept="image/*" id="cover-file"></div>`;
    $('#cover-file').onchange = (ev) => uploadCover(ev.target.files[0]);
    return;
  }

  const e = s.episodes[sel.e];
  main.innerHTML = `<h2>${esc(s.title)} / ${esc(e.title)} <span class="idbox">/${esc(s.id)}/${esc(e.id)}/</span></h2>
    <div class="toolbar">
      <button data-act="move-episode" data-d="-1">↑ 前へ</button>
      <button data-act="move-episode" data-d="1">↓ 後へ</button>
      <button data-act="preview-episode">この話をプレビュー</button>
      <button class="danger" data-act="del-episode">話を削除</button>
    </div>
    <div class="grid2">
      ${field('話タイトル', 'title', e.title)}
      ${field('公開日', 'date', e.date, 'date')}
    </div>
    ${field('説明（OGP説明文）', 'description', e.description, 'textarea', '空欄なら作品の説明が使われます。')}
    <label class="row" style="margin-bottom:8px"><input type="checkbox" data-bind="published" ${e.published !== false ? 'checked' : ''}> 公開する（オフで下書き＝ビルドに含めない）</label>

    <h3>ページ（${e.pages.length}枚）</h3>
    <div class="drop" id="drop">
      ここに画像をドロップ（複数可・ファイル名順に追加）<br>
      <div class="row" style="justify-content:center;margin-top:8px">
        <input type="file" accept="image/*" multiple id="page-files">
        <label><input type="checkbox" id="webp" checked> WebPに変換して軽量化</label>
      </div>
    </div>
    <div class="pages" id="pages">
      ${e.pages
        .map(
          (p, i) => `<div class="thumb" draggable="true" data-i="${i}">
        <img src="${imgUrl(s, e, p.file)}" loading="lazy">
        <div class="meta"><b>${i + 1}</b><span>${p.w}×${p.h}</span></div>
        <div class="ops">
          <button data-act="page-move" data-i="${i}" data-d="-1" title="前へ">←</button>
          <button data-act="page-move" data-i="${i}" data-d="1" title="後へ">→</button>
          <button data-act="page-del" data-i="${i}" title="削除">✕</button>
        </div></div>`
        )
        .join('')}
    </div>

    <h3>OGP画像（SNSでシェアされたときの画像）</h3>
    ${
      e.pages.length
        ? `<div class="og">
      <div>
        <canvas id="og-canvas" width="1200" height="630"></canvas>
        <p class="hint">ページの一部を 1200×630 で切り出します。</p>
      </div>
      <div>
        <label class="field"><span>元にするページ</span>
          <select id="og-page">${e.pages.map((_, i) => `<option value="${i}" ${og.page === i ? 'selected' : ''}>${i + 1}ページ目</option>`).join('')}</select></label>
        <label class="field"><span>縦位置</span><input type="range" id="og-y" min="0" max="1" step="0.001" value="${og.y}"></label>
        <label class="field"><span>拡大</span><input type="range" id="og-zoom" min="1" max="4" step="0.01" value="${og.zoom}"></label>
        <label class="field"><span>横位置（拡大時）</span><input type="range" id="og-x" min="0" max="1" step="0.001" value="${og.x}"></label>
        <button class="primary" data-act="og-save">この範囲をOGP画像に設定</button>
        <p class="hint" style="margin-top:14px">または画像を直接アップロード:<br><input type="file" accept="image/*" id="og-file"></p>
        <h3 style="margin-top:20px">現在のOGP画像</h3>
        ${e.og ? `<img class="current" src="${imgUrl(s, e, e.og)}"><button class="danger small" data-act="og-del" style="margin-top:6px">OGP画像を削除</button>` : '<p class="hint">未設定（1ページ目がそのまま使われます）</p>'}
      </div>
    </div>`
        : '<p class="hint">ページを追加すると設定できます。</p>'
    }`;

  bindPages(s, e);
  if (e.pages.length) bindOg(s, e);
}

function render() {
  renderSide();
  renderMain();
}

// ---- ページ操作 ----
function bindPages(s, e) {
  const drop = $('#drop');
  const add = (files) => addPages(s, e, [...files].filter((f) => f.type.startsWith('image/')));
  $('#page-files').onchange = (ev) => add(ev.target.files);
  drop.ondragover = (ev) => {
    if (!ev.dataTransfer.types.includes('Files')) return;
    ev.preventDefault();
    drop.classList.add('over');
  };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (ev) => {
    ev.preventDefault();
    drop.classList.remove('over');
    add(ev.dataTransfer.files);
  };

  // サムネのドラッグ並べ替え
  let from = null;
  for (const t of document.querySelectorAll('.thumb')) {
    t.ondragstart = () => {
      from = Number(t.dataset.i);
      t.classList.add('dragging');
    };
    t.ondragend = () => t.classList.remove('dragging');
    t.ondragover = (ev) => {
      if (from == null) return;
      ev.preventDefault();
      t.classList.add('dropto');
    };
    t.ondragleave = () => t.classList.remove('dropto');
    t.ondrop = (ev) => {
      ev.preventDefault();
      if (from == null) return;
      const to = Number(t.dataset.i);
      const [p] = e.pages.splice(from, 1);
      e.pages.splice(to, 0, p);
      from = null;
      scheduleSave();
      renderMain();
    };
  }
}

async function addPages(s, e, files) {
  if (!files.length) return;
  files.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  const webp = $('#webp')?.checked;
  let n = 0;
  for (const f of files) {
    status(`アップロード中 ${++n}/${files.length}: ${f.name}`);
    try {
      const { blob, ext, w, h } = await prepare(f, webp);
      const { file } = await api.upload(blob, ext, s.id, e.id);
      e.pages.push({ file, w, h });
    } catch (err) {
      alert(`${f.name}: ${err.message}`);
    }
  }
  await saveNow();
  renderMain();
}

async function uploadCover(f) {
  if (!f) return;
  const s = db.series[sel.s];
  const { blob, ext } = await prepare(f, true);
  const { file } = await api.upload(blob, ext, s.id);
  if (s.cover) await api.delFile(s.cover, s.id);
  s.cover = file;
  await saveNow();
  renderMain();
}

// ---- OGP ----
function bindOg(s, e) {
  const canvas = $('#og-canvas');
  const ctx = canvas.getContext('2d');
  let img;
  const draw = () => {
    if (!img) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const sw = W / og.zoom;
    const sh = Math.min(H, (sw * 630) / 1200);
    const sx = (W - sw) * og.x;
    const sy = (H - sh) * og.y;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1200, 630);
    const dh = (sh / sw) * 1200;
    ctx.drawImage(img, sx, sy, sw, sh, 0, (630 - dh) / 2, 1200, dh);
  };
  const load = async () => {
    og.page = Math.min(og.page, e.pages.length - 1);
    img = await loadImage(imgUrl(s, e, e.pages[og.page].file));
    draw();
  };
  $('#og-page').onchange = (ev) => {
    og.page = Number(ev.target.value);
    load();
  };
  for (const k of ['y', 'zoom', 'x'])
    $(`#og-${k}`).oninput = (ev) => {
      og[k] = Number(ev.target.value);
      draw();
    };
  $('#og-file').onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const { blob, ext } = await prepare(f, false);
    await setOg(s, e, blob, ext);
  };
  load();
}

async function setOg(s, e, blob, ext) {
  const { file } = await api.upload(blob, ext, s.id, e.id);
  if (e.og) await api.delFile(e.og, s.id, e.id);
  e.og = file;
  await saveNow();
  renderMain();
}

// ---- アクション ----
function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return i;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  scheduleSave();
  return j;
}

const actions = {
  'go-site': () => (sel = { view: 'site' }),
  'go-series': (d) => (sel = { view: 'series', s: Number(d.s) }),
  'go-episode': (d) => {
    sel = { view: 'episode', s: Number(d.s), e: Number(d.e) };
    og = { page: 0, zoom: 1, x: 0.5, y: 0 };
  },
  'add-series': () => {
    const id = prompt('作品ID（URLの一部になります。半角英小文字・数字・ハイフン）\n例: chikuwa-0815');
    if (id == null) return false;
    if (!ID.test(id)) return alert('IDは半角英小文字・数字・ハイフン・アンダースコアのみです'), false;
    if (db.series.some((s) => s.id === id)) return alert('同じIDの作品があります'), false;
    db.series.push({ id, title: '新しい作品', author: db.site.author || '', description: '', cover: null, episodes: [] });
    sel = { view: 'series', s: db.series.length - 1 };
    scheduleSave();
  },
  'add-episode': (d) => {
    const s = db.series[Number(d.s)];
    let n = s.episodes.length + 1;
    while (s.episodes.some((e) => e.id === `ep${n}`)) n++;
    const id = prompt('話ID（URLの一部になります）', `ep${n}`);
    if (id == null) return false;
    if (!ID.test(id)) return alert('IDは半角英小文字・数字・ハイフン・アンダースコアのみです'), false;
    if (s.episodes.some((e) => e.id === id)) return alert('同じIDの話があります'), false;
    s.episodes.push({ id, title: `第${s.episodes.length + 1}話`, description: '', date: today(), published: true, og: null, pages: [] });
    sel = { view: 'episode', s: Number(d.s), e: s.episodes.length - 1 };
    scheduleSave();
  },
  'move-series': (d) => (sel.s = move(db.series, sel.s, Number(d.d))),
  'move-episode': (d) => (sel.e = move(db.series[sel.s].episodes, sel.e, Number(d.d))),
  'del-series': async () => {
    const s = db.series[sel.s];
    if (!confirm(`作品「${s.title}」と全ての話・画像を削除します。よろしいですか？`)) return false;
    await api.delDir(s.id);
    db.series.splice(sel.s, 1);
    sel = { view: 'site' };
    await saveNow();
  },
  'del-episode': async () => {
    const s = db.series[sel.s];
    const e = s.episodes[sel.e];
    if (!confirm(`「${e.title}」とその画像を削除します。よろしいですか？`)) return false;
    await api.delDir(s.id, e.id);
    s.episodes.splice(sel.e, 1);
    sel = { view: 'series', s: sel.s };
    await saveNow();
  },
  'del-cover': async () => {
    const s = db.series[sel.s];
    await api.delFile(s.cover, s.id);
    s.cover = null;
    await saveNow();
  },
  'page-move': (d) => {
    move(db.series[sel.s].episodes[sel.e].pages, Number(d.i), Number(d.d));
  },
  'page-del': async (d) => {
    const s = db.series[sel.s];
    const e = s.episodes[sel.e];
    const i = Number(d.i);
    if (!confirm(`${i + 1}ページ目を削除しますか？`)) return false;
    await api.delFile(e.pages[i].file, s.id, e.id);
    e.pages.splice(i, 1);
    await saveNow();
  },
  'og-save': async () => {
    const s = db.series[sel.s];
    const e = s.episodes[sel.e];
    await setOg(s, e, await toBlob($('#og-canvas'), 'image/jpeg', 0.88), 'jpg');
    return false;
  },
  'og-del': async () => {
    const s = db.series[sel.s];
    const e = s.episodes[sel.e];
    await api.delFile(e.og, s.id, e.id);
    e.og = null;
    await saveNow();
  },
  'preview-episode': async () => {
    const s = db.series[sel.s];
    const e = s.episodes[sel.e];
    await build(`/preview/${s.id}/${e.id}/`);
    return false;
  },
};

async function build(path = '/preview/') {
  await saveNow();
  status('ビルド中…');
  const win = window.open('about:blank');
  const r = await api.req('/api/build', { method: 'POST' });
  status(r.ok ? r.log : 'ビルド失敗');
  if (!r.ok) {
    win?.close();
    return alert(r.log);
  }
  if (win) win.location = path;
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  try {
    const r = await actions[el.dataset.act]?.(el.dataset);
    if (r !== false) render();
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener('input', (ev) => {
  const key = ev.target.dataset?.bind;
  if (!key) return;
  current()[key] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
  scheduleSave();
  renderSide();
});

$('#build').onclick = () => build().catch((err) => alert(err.message));
addEventListener('beforeunload', (ev) => {
  if ($('#status').textContent.startsWith('未保存')) ev.preventDefault();
});

db = await api.req('/api/db');
render();
status('読み込み完了');
