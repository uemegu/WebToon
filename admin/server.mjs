#!/usr/bin/env node
// ローカル専用の管理サーバー（127.0.0.1 でのみ待ち受け）
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const DB = path.join(DATA, 'db.json');
const IMG = path.join(DATA, 'images');
const ADMIN = path.join(ROOT, 'admin');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const EXT = new Set(['png', 'jpg', 'webp', 'gif']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function inside(base, rel) {
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) throw new HttpError(403, 'forbidden');
  return p;
}

function imgDir(series, episode) {
  if (!ID.test(series ?? '')) throw new HttpError(400, 'bad series id');
  if (episode != null && !ID.test(episode)) throw new HttpError(400, 'bad episode id');
  return episode != null ? path.join(IMG, series, episode) : path.join(IMG, series);
}

async function readBody(req, limit = 200 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

async function serveStatic(req, res, file, pathname) {
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    throw new HttpError(404, 'not found');
  }
  if (st.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { location: pathname + '/' });
      return res.end();
    }
    return serveStatic(req, res, path.join(file, 'index.html'), pathname);
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': st.size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

function runBuild() {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { cwd: ROOT }, (err, stdout, stderr) => {
      resolve({ ok: !err, log: (stdout + stderr).trim() || String(err ?? '') });
    });
  });
}

async function handle(req, res) {
  // DNS rebinding 対策: localhost 以外の Host は拒否
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new HttpError(403, 'forbidden host');

  const u = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(u.pathname);
  const q = u.searchParams;
  const m = req.method;

  if (p === '/api/db') {
    if (m === 'GET') return json(res, await fs.readFile(DB));
    if (m === 'PUT') {
      const db = JSON.parse((await readBody(req)).toString('utf8'));
      if (!db || typeof db !== 'object' || !Array.isArray(db.series)) throw new HttpError(400, 'invalid db');
      const tmp = DB + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(db, null, 2) + '\n');
      await fs.rename(tmp, DB);
      return json(res, { ok: true });
    }
  }

  if (p === '/api/upload' && m === 'POST') {
    const ext = (q.get('ext') ?? '').toLowerCase();
    if (!EXT.has(ext)) throw new HttpError(400, 'bad ext');
    const dir = imgDir(q.get('series'), q.get('episode'));
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(dir, name), await readBody(req));
    return json(res, { file: name });
  }

  if (p === '/api/file' && m === 'DELETE') {
    const file = q.get('file') ?? '';
    if (!FILE.test(file)) throw new HttpError(400, 'bad file');
    await fs.rm(path.join(imgDir(q.get('series'), q.get('episode')), file), { force: true });
    return json(res, { ok: true });
  }

  if (p === '/api/dir' && m === 'DELETE') {
    await fs.rm(imgDir(q.get('series'), q.get('episode')), { recursive: true, force: true });
    return json(res, { ok: true });
  }

  if (p === '/api/build' && m === 'POST') return json(res, await runBuild());

  if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'method not allowed');
  if (p.startsWith('/images/')) return serveStatic(req, res, inside(IMG, p.slice(8)), p);
  if (p === '/preview' || p.startsWith('/preview/')) return serveStatic(req, res, inside(DIST, p.slice(9)), p);
  if (p === '/') return serveStatic(req, res, path.join(ADMIN, 'index.html'), p);
  if (p.startsWith('/admin/')) return serveStatic(req, res, inside(ADMIN, p.slice(7)), p);
  throw new HttpError(404, 'not found');
}

http
  .createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!e.status) console.error(e);
      if (!res.headersSent) json(res, { error: e.message }, e.status ?? 500);
      else res.end();
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`管理画面: http://localhost:${PORT}/`);
  });
