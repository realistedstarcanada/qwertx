// A small stand-in for Cloudflare Pages for tests and local previews: routes /api/* to functions/,
// serves everything else from dist/, and gives Functions a D1-compatible database backed by node:sqlite.
// Run with: node --no-warnings --import ./test/harness/json-hook.mjs ...
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.csv': 'text/csv', '.woff2': 'font/woff2', '.xml': 'application/xml' };

const val = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const plain = (r) => (r ? { ...r } : null);

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map(val)); }
  get isRead() { return /^\s*(SELECT|WITH)\b/i.test(this.sql); }
  async first(col) { const r = plain(this.db.prepare(this.sql).get(...this.args)); return col && r ? r[col] : r; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(plain), meta: {} }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}

export class D1 {
  constructor(file = ':memory:') { this.db = new DatabaseSync(file); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) out.push(s.isRead ? await s.all() : await s.run());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) { this.db.exec(sql); }
}

export function assets(distDir = path.join(ROOT, 'dist'), overrides = {}) {
  return {
    overrides,
    async fetch(req) {
      const p = decodeURIComponent(new URL(req.url).pathname);
      if (overrides[p] != null) return new Response(typeof overrides[p] === 'string' ? overrides[p] : JSON.stringify(overrides[p]), { headers: { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' } });
      let f = path.join(distDir, p);
      if (!f.startsWith(distDir)) return new Response('Not found', { status: 404 });
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
      if (!fs.existsSync(f)) return new Response('Not found', { status: 404 });
      return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } });
    },
  };
}

const modules = new Map();
async function fnFor(pathname) {
  const rel = pathname.replace(/^\/+/, '').replace(/\/$/, '');
  for (const cand of [`functions/${rel}.js`, `functions/${rel}/index.js`]) {
    const f = path.join(ROOT, cand);
    if (fs.existsSync(f)) {
      if (!modules.has(f)) modules.set(f, await import(pathToFileURL(f).href));
      return modules.get(f);
    }
  }
  return null;
}

/** Handles one request the way Pages would. */
export async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    const mod = await fnFor(url.pathname);
    if (mod) {
      const m = request.method.charAt(0) + request.method.slice(1).toLowerCase();
      const fn = mod[`onRequest${m}`] || mod.onRequest;
      if (!fn) return new Response('Method not allowed', { status: 405 });
      return fn({ request, env, params: {}, waitUntil() {}, next: () => env.ASSETS.fetch(request), data: {} });
    }
  }
  return env.ASSETS.fetch(request);
}

/** Cookie jar + same-origin defaults, for tests. */
export function client(env, origin = 'https://qwertx.test') {
  const jar = {};
  return {
    jar,
    async req(method, p, { body, headers = {}, raw } = {}) {
      const h = { ...headers };
      if (!('Origin' in h) && method !== 'GET') h.Origin = origin;
      const cookie = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookie) h.Cookie = cookie;
      if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
      const res = await handle(new Request(origin + p, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect: 'manual' }), env);
      const sc = res.headers.get('Set-Cookie');
      if (sc) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text, headers: res.headers };
    },
  };
}
