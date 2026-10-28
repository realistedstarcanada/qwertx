#!/usr/bin/env node
// INTERNAL TESTING ONLY: prices, analyst price targets, buy/hold/sell counts and earnings history from Yahoo
// Finance's public web endpoints, written in the same shape as the licensed vendor (data/vendor/<TICKER>.json),
// so the Pro page can be tested end to end before a data licence is in place.
//
// Runs only when config/pro.json has "vendor": { "name": "yahoo", "enabled": true, "internalTest": true }.
// The site build shows this data on preview (branch) builds only, never on the production build from main.
// Replace with the licensed feed (scripts/fetch-fmp.mjs) before launch.
//
// Tickers: the stocks at least one tracked fund manager owns, every ETF in config/etfs.json, everything on a
// member watchlist (POST {PRO_SITE_URL}/api/internal/universe with CRON_SECRET) and any extra TICKERS="A B".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, sleep } from './lib/net.mjs';
import { thin } from './fetch-fmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/vendor');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GAP_MS = Number(process.env.YAHOO_GAP_MS || 300);

const raw = (v) => (v && typeof v === 'object' ? v.raw : v);
const num = (v) => { const n = Number(raw(v)); return v == null || raw(v) == null || !Number.isFinite(n) ? null : n; };
const day = (v) => { const r = raw(v); return typeof r === 'number' ? new Date(r * 1000).toISOString().slice(0, 10) : typeof v?.fmt === 'string' ? v.fmt : null; };

/** Yahoo symbol for a QWERTx ticker: BRK.B -> BRK-B; Toronto listings already match (CGL.TO, BIP-UN.TO). */
export const yahooSymbol = (t) => (t.endsWith('.TO') ? t : t.replace(/\.([A-Z])$/, '-$1'));

/** quoteSummary result + chart closes -> the vendor file shape. Exported for tests. */
export function shapeYahoo(summary, closes = []) {
  const s = summary || {};
  const fd = s.financialData || {}, pr = s.price || {};
  const trend = (s.recommendationTrend?.trend || []).find((x) => x.period === '0m') || s.recommendationTrend?.trend?.[0] || null;
  const p = num(pr.regularMarketPrice) ?? num(fd.currentPrice);
  const chgFmt = pr.regularMarketChangePercent?.fmt;
  const chg = typeof chgFmt === 'string' && chgFmt.endsWith('%') ? parseFloat(chgFmt) : num(pr.regularMarketChangePercent) != null ? Math.round(num(pr.regularMarketChangePercent) * 10000) / 100 : null;
  const avg = num(fd.targetMeanPrice);
  return {
    n: pr.longName || pr.shortName || null,
    q: p != null ? { p, chg, d: day(pr.regularMarketTime) || new Date().toISOString().slice(0, 10), cur: pr.currency || fd.financialCurrency || null } : null,
    hist: thin(closes.map(([d, c]) => ({ date: d, price: c }))),
    an: avg != null && num(fd.numberOfAnalystOpinions) ? {
      low: num(fd.targetLowPrice), avg, high: num(fd.targetHighPrice), median: num(fd.targetMedianPrice),
      sb: num(trend?.strongBuy) || 0, b: num(trend?.buy) || 0, h: num(trend?.hold) || 0, s: num(trend?.sell) || 0, ss: num(trend?.strongSell) || 0,
      consensus: fd.recommendationKey || null, n: num(fd.numberOfAnalystOpinions),
    } : null,
    er: (s.earningsHistory?.history || []).filter((e) => num(e.epsActual) != null)
      .map((e) => ({ d: day(e.quarter), a: num(e.epsActual), e: num(e.epsEstimate) }))
      .filter((e) => e.d).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8),
  };
}

/** [[date, close]] from a v8 chart response. Exported for tests. */
export function chartCloses(json) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp || [], c = r?.indicators?.quote?.[0]?.close || [];
  return ts.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), c[i]]).filter(([, v]) => Number.isFinite(v));
}

let session = null;
async function getSession() {
  // Yahoo's quoteSummary needs a cookie plus a "crumb" token tied to it.
  const r = await fetch('https://fc.yahoo.com/', { redirect: 'manual', headers: { 'User-Agent': UA } }).catch(() => null);
  const cookie = (r?.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const c = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
  const crumb = (await c.text()).trim();
  if (!c.ok || !crumb || crumb.length > 40) throw new Error(`Yahoo crumb: HTTP ${c.status} ${crumb.slice(0, 80)}`);
  return { cookie, crumb };
}

let last = 0;
async function yget(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    if (!session) session = await getSession();
    const u = url.includes('quoteSummary') ? `${url}&crumb=${encodeURIComponent(session.crumb)}` : url;
    const res = await fetch(u, { headers: { 'User-Agent': UA, Cookie: session.cookie, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: 0, e }));
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 403) session = null; // crumb expired
    if (res.status === 404) return null;
    await sleep(2000 * 2 ** i);
  }
  return null;
}

async function universe() {
  const t = new Set();
  const idx = readJSON(path.join(ROOT, 'dist/pro/index.json'), null);
  if (idx) for (const [k, v] of Object.entries(idx.tickers)) if (v[1] >= 1 && !idx.etfs?.[k]) t.add(k);
  else console.warn('dist/pro/index.json missing: run the build first for the fund-manager stocks');
  const etfs = readJSON(path.join(ROOT, 'config/etfs.json'), { us: {}, ca: {} });
  Object.keys(etfs.us || {}).forEach((k) => t.add(k));
  Object.keys(etfs.ca || {}).forEach((k) => t.add(`${k}.TO`));
  if (process.env.PRO_SITE_URL && process.env.CRON_SECRET) {
    try {
      const res = await fetch(`${process.env.PRO_SITE_URL.replace(/\/$/, '')}/api/internal/universe`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      if (res.ok) { const j = await res.json(); j.tickers.forEach((k) => t.add(k)); console.log(`watchlists: ${j.tickers.length} tickers`); }
      else console.warn(`watchlists: HTTP ${res.status} from ${process.env.PRO_SITE_URL}`);
    } catch (e) { console.warn(`watchlists: ${e.message}`); }
  }
  String(process.env.TICKERS || '').toUpperCase().split(/[\s,]+/).filter(Boolean).forEach((k) => t.add(k));
  return [...t];
}

async function run() {
  const v = readJSON(path.join(ROOT, 'config/pro.json'), {}).vendor || {};
  if (!(v.name === 'yahoo' && v.enabled && v.internalTest)) {
    console.log('Yahoo test data is switched off (config/pro.json vendor.name "yahoo", enabled, internalTest). Nothing to do.');
    return;
  }
  const list = await universe();
  console.log(`Yahoo (internal test): ${list.length} tickers`);
  let ok = 0, an = 0, first = true;
  for (const t of list) {
    const sym = encodeURIComponent(yahooSymbol(t));
    const summary = await yget(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=price,financialData,recommendationTrend,earningsHistory&formatted=true`);
    const res = summary?.quoteSummary?.result?.[0] || null;
    if (first && res) { console.log(`sample ${t}: modules ${Object.keys(res).join(', ')}`); first = false; }
    const monthly = chartCloses(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=10y&interval=1mo`));
    const weekly = chartCloses(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1wk`));
    const out = shapeYahoo(res, [...monthly, ...weekly]);
    if (!out.q && !out.hist.length) { console.warn(`  ${t}: no data`); continue; }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${t}.json`), JSON.stringify({ t, at: new Date().toISOString().slice(0, 10), source: 'Yahoo Finance (internal test)', ...out }));
    ok++;
    if (out.an) an++;
    if (ok % 50 === 0) console.log(`  ${ok} done`);
  }
  console.log(`Yahoo (internal test): ${ok}/${list.length} tickers saved, ${an} with analyst targets`);
  if (!ok) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
