#!/usr/bin/env node
// QWERTx static site builder. Reads config/ + data/, writes a complete static site to dist/.
// Env: SITE_URL (default https://qwertx.com), DATA_DIR, CONFIG, CF_ANALYTICS_TOKEN
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadData } from './src/lib/data.mjs';
import { layout } from './src/layout.mjs';
import * as pages from './src/pages.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const site = {
  name: 'QWERTx',
  tagline: 'After Work Investment Strategies',
  url: (process.env.SITE_URL || 'https://qwertx.com').replace(/\/$/, ''),
  analyticsToken: process.env.CF_ANALYTICS_TOKEN || '',
};

const t0 = Date.now();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

// Fingerprinted assets so they can be cached forever.
const assets = {};
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const [key, file] of [['css', 'site.css'], ['js', 'app.js']]) {
  const src = fs.readFileSync(path.join(ROOT, 'src/assets', file));
  const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 10);
  const name = file.replace('.', `.${hash}.`);
  fs.writeFileSync(path.join(OUT, 'assets', name), src);
  assets[key] = `/assets/${name}`;
}

const d = loadData({
  root: ROOT,
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  configPath: path.resolve(ROOT, process.env.CONFIG || 'config/investors.json'),
});

const rendered = [
  pages.home(d),
  pages.investorsIndex(d),
  ...d.investors.map((inv) => (inv.portfolio ? pages.investorPage(d, inv) : pages.investorPending(inv))),
  pages.stocksIndex(d),
  ...d.stocks.map((s) => pages.stockPage(d, s)),
  pages.newsPage(d),
  pages.aboutPage(d),
  pages.notFound(d),
];

for (const pg of rendered) {
  const html = layout({ site, assets, ...pg });
  const file = pg.path.endsWith('.html') ? path.join(OUT, pg.path) : path.join(OUT, pg.path, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// Snapshot for the live gauge to fall back on, plus sitemap.
if (d.market) fs.writeFileSync(path.join(OUT, 'market-snapshot.json'), JSON.stringify(d.market));
const today = new Date().toISOString().slice(0, 10);
const urls = rendered.filter((p) => !p.path.endsWith('.html')).map((p) => `<url><loc>${site.url}${p.path}</loc><lastmod>${today}</lastmod></url>`);
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${rendered.length} pages (${d.live.length}/${d.investors.length} investors with data, ${d.stocks.length} stocks) in ${Date.now() - t0}ms → dist/`);
