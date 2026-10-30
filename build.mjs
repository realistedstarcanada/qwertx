#!/usr/bin/env node
// QWERTx static site builder (original "After Hours" design). Reads config/, content/ and data/,
// writes a complete static site to dist/. Env: SITE_URL, DATA_DIR, CONFIG, CF_ANALYTICS_TOKEN
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadData } from './src/lib/data.mjs';
import { layout } from './src/layout.mjs';
import { home } from './src/pages/home.mjs';
import { investorsIndex, investorPage, investorPending } from './src/pages/investors.mjs';
import { stockPage } from './src/pages/stocks.mjs';
import { smartMoney } from './src/pages/smart.mjs';
import { politicians } from './src/pages/politicians.mjs';
import { insiders } from './src/pages/insiders.mjs';
import { market } from './src/pages/market.mjs';
import { calendarPage } from './src/pages/calendar.mjs';
import { personPage } from './src/pages/people.mjs';
import { proPages } from './src/pages/pro-pages.mjs';
import { accountPage } from './src/pages/account.mjs';
import { staticPages } from './src/pages/static.mjs';
import { buildProData } from './src/lib/pro-data.mjs';
import { buildWeather } from './src/lib/weather.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const t0 = Date.now();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

// Fingerprint the stylesheets and scripts so they can be cached for a year.
const fp = (rel) => {
  const src = path.join(OUT, rel);
  const buf = fs.readFileSync(src);
  const h = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  const out = rel.replace(/(\.\w+)$/, `.${h}$1`);
  fs.copyFileSync(src, path.join(OUT, out));
  return '/' + out;
};
fs.copyFileSync(path.join(ROOT, 'src/assets/qx-extra.css'), path.join(OUT, 'assets/css/qx-extra.css'));
fs.copyFileSync(path.join(ROOT, 'src/assets/qx-live.js'), path.join(OUT, 'assets/js/qx-live.js'));
fs.copyFileSync(path.join(ROOT, 'src/assets/qx-pro.js'), path.join(OUT, 'assets/js/qx-pro.js'));

const site = {
  name: 'QWERTx',
  url: (process.env.SITE_URL || 'https://qwertx.com').replace(/\/$/, ''),
  analyticsToken: process.env.CF_ANALYTICS_TOKEN || '',
  assets: {
    css: fp('assets/css/styles.css'),
    extra: fp('assets/css/qx-extra.css'),
    main: fp('assets/js/main.js'),
    charts: fp('assets/js/charts.js'),
    live: fp('assets/js/qx-live.js'),
    pro: fp('assets/js/qx-pro.js'),
  },
};

const d = loadData({
  root: ROOT,
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  configPath: path.resolve(ROOT, process.env.CONFIG || 'config/investors.json'),
});

const pages = [
  home(d),
  investorsIndex(d),
  ...d.investors.map((inv) => (inv.p ? investorPage(d, inv) : investorPending(inv))),
  smartMoney(d),
  ...d.stocks.map((s) => stockPage(d, s)),
  ...d.extraStocks.map((s) => stockPage(d, s)),
  politicians(d),
  ...(d.people || []).map((p) => personPage(d, p)),
  insiders(d),
  market(d),
  calendarPage(d),
  ...proPages(ROOT),
  accountPage(),
  ...staticPages(ROOT),
];
const notFound = {
  page: '404',
  path: '/404.html',
  title: 'Page not found',
  description: 'The page you are looking for could not be found.',
  noindex: true,
  body: `<section class="hero" style="min-height:70vh"><div class="hero-bg grid"></div><div class="container"><div class="hero-content">
  <div class="status-pill"><span class="status-dot" aria-hidden="true"></span>Error 404 · page not found</div>
  <h1>This page sold out<span class="accent">.</span></h1>
  <p class="lead">The link may be old or mistyped. Try one of these instead.</p>
  <div class="btn-row mt-32"><a class="btn btn-gold" href="/">Back to home</a><a class="btn" href="/investors.html">Super investors</a><a class="btn" href="/market.html">Market Pulse</a></div>
</div></div></section>`,
};
pages.push(notFound);

for (const pg of pages) {
  const html = layout({ site, d, ...pg });
  const file = pg.path === '/' ? path.join(OUT, 'index.html') : path.join(OUT, pg.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// Search index for the hero search box (ticker, name, slug, owners, Congress trades, insider buying).
const searchIndex = [...d.stocks, ...d.extraStocks]
  .filter((s) => s.hasPage && (s.ticker || s.label))
  .map((s) => ({ t: s.ticker || s.label, n: s.name, s: s.slug, o: s.owners || 0, c: s.ticker ? (d.politics.byTicker.get(s.ticker) || []).length : 0, b: s.ticker && d.insiders?.buyTickers?.[s.ticker] ? 1 : 0 }));
fs.writeFileSync(path.join(OUT, 'search-index.json'), JSON.stringify(searchIndex));

// QWERTx Pro: small static files the watchlist page and the alert functions read (see src/lib/pro-data.mjs).
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };
const readDir = (dir) => {
  const out = {};
  try { for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.json')) out[f.slice(0, -5)] = readJSON(`${dir}/${f}`); } catch {}
  return out;
};
const proCfg = readJSON('config/pro.json') || {};
// Prices, analyst targets and earnings history: a licensed feed, or Yahoo while the site is internal-only.
const vendorOn = !!(proCfg.vendor?.enabled && (proCfg.vendor?.displayLicence || proCfg.vendor?.internalTest));
const pro = buildProData(d, {
  aliases: readJSON('config/ticker-aliases.json')?.aliases || {},
  filings8k: readJSON('data/filings/8k.json'),
  etfCfg: readJSON('config/etfs.json'),
  etfData: readDir('data/etfs'),
  vendor: vendorOn ? readDir('data/vendor') : null,
  vendorLabel: vendorOn ? proCfg.vendor.label || proCfg.vendor.name : null,
});
// Space-separated list of every ticker we accept on a watchlist (catches typos without parsing JSON).
const secTickers = readJSON('data/sec-tickers.json');
const tsxTickers = readJSON('data/tsx-tickers.json') || {};
if (secTickers) {
  const known = new Set([...Object.keys(secTickers), ...Object.keys(tsxTickers), ...Object.keys(pro.index.tickers), ...Object.values(pro.index.aliases)]);
  fs.mkdirSync(path.join(OUT, 'pro'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'pro/known.txt'), ` ${[...known].sort().join(' ')} `);
}
// Every other ticker we know a name for, for the add box's search (loaded when the box is first used):
// SEC-listed companies, every Toronto listing, and the US listings of big Canadian companies.
{
  const names = { ...(readJSON('config/ticker-aliases.json')?.names || {}), ...(secTickers || {}), ...tsxTickers };
  const extra = Object.entries(names).filter(([t, n]) => !pro.index.tickers[t] && n && n !== t).sort((x, y) => x[0].localeCompare(y[0])).map(([t, n]) => [t, String(n).slice(0, 60)]);
  fs.mkdirSync(path.join(OUT, 'pro'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'pro/search.json'), JSON.stringify(extra));
}
fs.mkdirSync(path.join(OUT, 'pro/t'), { recursive: true });
for (const [t, o] of Object.entries(pro.ownership.stocks)) fs.writeFileSync(path.join(OUT, 'pro/t', `${t}.json`), JSON.stringify(o));
// Exchange rate for members who hold both US and Canadian listings (Bank of Canada daily rate).
{
  const fx = readJSON('data/macro.json')?.series?.ca_usdcad;
  const last = fx?.last || fx?.obs?.at(-1);
  if (last) pro.index.fx = { USDCAD: last[1], d: last[0], source: fx.source || 'Bank of Canada' };
}
fs.writeFileSync(path.join(OUT, 'pro/index.json'), JSON.stringify(pro.index));
fs.writeFileSync(path.join(OUT, 'pro/weather.json'), JSON.stringify(buildWeather({ macro: readJSON('data/macro.json'), market: d.market, insiders: d.insiders, politics: d.politics, live: d.live })));
fs.writeFileSync(path.join(OUT, 'pro/events-recent.json'), JSON.stringify({ generatedAt: pro.ownership.generatedAt, events: pro.recentEvents }));

// Fear & Greed snapshot for the live gauge's fallback, sitemap, robots.
if (d.market?.fearGreed) fs.writeFileSync(path.join(OUT, 'market-snapshot.json'), JSON.stringify(d.market.fearGreed));
const today = new Date().toISOString().slice(0, 10);
const pri = (p) => (p === '/' ? '1.0' : /^\/(investors|smart-money|politicians|insiders|market)\.html$/.test(p) ? '0.9' : p.startsWith('/investors/') ? '0.8' : '0.6');
const urls = pages
  .filter((p) => !p.noindex)
  .map((p) => `<url><loc>${site.url}${p.path === '/' ? '/' : p.path.replace(/\.html$/, '')}</loc><lastmod>${today}</lastmod><priority>${pri(p.path)}</priority></url>`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${pages.length} pages (${d.live.length}/${d.investors.length} investors, ${d.stocks.length} stocks, ${d.politics.totalTrades} congressional trades, insiders ${d.insiders?.label || 'none'}) in ${Date.now() - t0}ms → dist/`);
