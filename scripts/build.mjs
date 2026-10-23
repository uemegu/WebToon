#!/usr/bin/env node
// data/db.json と data/images から dist/ に静的サイトを書き出す
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const IMG = path.join(DATA, 'images');
const ASSETS = path.join(ROOT, 'scripts', 'assets');
const OUT = path.join(ROOT, 'dist');

const db = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
const site = db.site ?? {};
const base = (site.baseUrl ?? '').replace(/\/+$/, '');
if (!base) console.warn('⚠ site.baseUrl が未設定です。OGP画像は絶対URLが必要なので設定してください。');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const abs = (p) => `${base}/${p}`;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function layout({ depth, title, description, url, image, type = 'website', bodyClass = '', body }) {
  const r = depth ? '../'.repeat(depth) : './';
  const desc = description || site.description || '';
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(abs(url))}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(abs(url))}">
${image ? `<meta property="og:image" content="${esc(abs(image))}">` : ''}
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
${site.twitter ? `<meta name="twitter:site" content="@${esc(site.twitter.replace(/^@/, ''))}">` : ''}
<meta name="theme-color" content="#16161a">
<link rel="stylesheet" href="${r}assets/style.css">
<script src="${r}assets/app.js" defer></script>
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;
}

const fmtDate = (d) => (d ? d.replaceAll('-', '.') : '');

// ---- 出力 ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
for (const f of fs.readdirSync(ASSETS)) copy(path.join(ASSETS, f), path.join(OUT, 'assets', f));

const cards = [];
let count = 0;
let topImage = null;

for (const s of db.series ?? []) {
  const eps = (s.episodes ?? []).filter((e) => e.published !== false && e.pages?.length);
  if (!eps.length) continue;

  // 各話のサムネ/OGP: OGP画像 > 1ページ目
  const epImage = (e) => `${s.id}/${e.id}/${e.og ?? e.pages[0].file}`;
  let cover = null;
  if (s.cover) {
    copy(path.join(IMG, s.id, s.cover), path.join(OUT, s.id, s.cover));
    cover = `${s.id}/${s.cover}`;
  }
  const seriesImage = cover ?? epImage(eps[0]);
  topImage ??= seriesImage;

  eps.forEach((e, i) => {
    const dir = path.join(OUT, s.id, e.id);
    for (const p of e.pages) copy(path.join(IMG, s.id, e.id, p.file), path.join(dir, p.file));
    if (e.og) copy(path.join(IMG, s.id, e.id, e.og), path.join(dir, e.og));

    const prev = eps[i - 1];
    const next = eps[i + 1];
    const title = `${s.title} ${e.title}`;
    const imgs = e.pages
      .map(
        (p, n) =>
          `<img src="${esc(p.file)}" width="${p.w}" height="${p.h}" alt="${esc(e.title)} ${n + 1}"` +
          (n < 2 ? ` fetchpriority="${n ? 'auto' : 'high'}"` : ' loading="lazy"') +
          ' decoding="async">'
      )
      .join('\n');

    const body = `
<header class="bar" id="bar">
  <a class="bar-back" href="../">‹</a>
  <div class="bar-title"><span>${esc(s.title)}</span><b>${esc(e.title)}</b></div>
</header>
<main class="reader" id="reader">
${imgs}
</main>
<footer class="ep-foot">
  <p class="ep-end">${esc(e.title)}　おわり</p>
  ${next ? `<a class="btn btn-primary btn-next" href="../${esc(next.id)}/">次の話へ　${esc(next.title)} ›</a>` : '<p class="ep-latest">最新話です</p>'}
  <nav class="ep-nav">
    ${prev ? `<a class="btn" href="../${esc(prev.id)}/">‹ 前の話</a>` : '<span class="btn is-disabled">‹ 前の話</span>'}
    <a class="btn" href="../">話一覧</a>
  </nav>
  <div class="share">
    <a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(abs(`${s.id}/${e.id}/`))}">Xでシェア</a>
    <button class="btn" type="button" data-share data-title="${esc(title)}">リンクを共有</button>
  </div>
  <a class="home-link" href="../../">${esc(site.title)}</a>
</footer>`;

    fs.writeFileSync(
      path.join(dir, 'index.html'),
      layout({
        depth: 2,
        title,
        description: e.description || s.description,
        url: `${s.id}/${e.id}/`,
        image: epImage(e),
        type: 'article',
        bodyClass: 'is-reader',
        body,
      })
    );
    count++;
  });

  // 作品ページ
  const list = eps
    .map(
      (e) => `<li><a href="${esc(e.id)}/">
  <img src="${esc(epImage(e).slice(s.id.length + 1))}" alt="" loading="lazy" decoding="async">
  <span class="ep-meta"><b>${esc(e.title)}</b><small>${fmtDate(e.date)}</small></span>
</a></li>`
    )
    .join('\n');
  const seriesBody = `
<header class="top"><a href="../">${esc(site.title)}</a></header>
<main class="wrap">
  <section class="series-hero">
    <img src="${esc(seriesImage.slice(s.id.length + 1))}" alt="">
    <h1>${esc(s.title)}</h1>
    ${s.author ? `<p class="author">${esc(s.author)}</p>` : ''}
    ${s.description ? `<p class="desc">${esc(s.description).replaceAll('\n', '<br>')}</p>` : ''}
    <div class="hero-actions">
      <a class="btn btn-primary" href="${esc(eps[0].id)}/">第1話から読む</a>
      ${eps.length > 1 ? `<a class="btn" href="${esc(eps.at(-1).id)}/">最新話を読む</a>` : ''}
    </div>
  </section>
  <h2 class="sec-title">話一覧 <small>全${eps.length}話</small></h2>
  <ul class="ep-list">
${list}
  </ul>
</main>`;
  fs.writeFileSync(
    path.join(OUT, s.id, 'index.html'),
    layout({ depth: 1, title: `${s.title} | ${site.title}`, description: s.description, url: `${s.id}/`, image: seriesImage, body: seriesBody })
  );

  cards.push(`<li><a href="${esc(s.id)}/">
  <img src="${esc(seriesImage)}" alt="" loading="lazy" decoding="async">
  <b>${esc(s.title)}</b>
  <small>全${eps.length}話 · ${fmtDate(eps.at(-1).date)} 更新</small>
</a></li>`);
}

// トップページ
const indexBody = `
<header class="top"><a href="./">${esc(site.title)}</a></header>
<main class="wrap">
  ${site.description ? `<p class="site-desc">${esc(site.description)}</p>` : ''}
  <ul class="series-grid">
${cards.join('\n')}
  </ul>
</main>`;
fs.writeFileSync(path.join(OUT, 'index.html'), layout({ depth: 0, title: site.title, url: '', image: topImage, body: indexBody }));

console.log(`✔ ${cards.length} 作品 / ${count} 話を dist/ に出力しました`);
