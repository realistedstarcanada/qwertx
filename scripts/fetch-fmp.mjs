#!/usr/bin/env node
// Licensed market data from Financial Modeling Prep: prices, analyst targets and ratings, earnings history.
// SWITCHED OFF until both are true:
//   1. config/pro.json "vendor": { "name": "fmp", "enabled": true, "displayLicence": true }
//      (FMP's terms require a Data Display and Licensing Agreement before showing their data on a website)
//   2. the FMP_API_KEY secret is set.
// Covers every ticker on a member watchlist (from /api/internal/universe) plus the ETFs in config/etfs.json.
// Writes data/vendor/<TICKER>.json. Field names follow FMP's "stable" API; check the first run's log.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/vendor');
const API = 'https://financialmodelingprep.com/stable';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Weekly closes for the last year plus monthly closes before that (5 years), as [[date, price]]. Exported for tests. */
export function thin(rows) {
  const sorted = rows.map((r) => [r.date, num(r.price ?? r.close ?? r.adjClose)]).filter((r) => r[0] && r[1] != null).sort((a, b) => a[0].localeCompare(b[0]));
  if (!sorted.length) return [];
  const yearAgo = new Date(Date.parse(sorted.at(-1)[0]) - 365 * 864e5).toISOString().slice(0, 10);
  const out = new Map();
  for (const [d, p] of sorted) {
    const k = d >= yearAgo ? `${d.slice(0, 4)}-w${Math.floor((Date.parse(d) - Date.parse(`${d.slice(0, 4)}-01-01`)) / (7 * 864e5))}` : d.slice(0, 7);
    out.set(k, [d, p]);
  }
  const res = [...out.values()];
  if (res.at(-1)[0] !== sorted.at(-1)[0]) res.push(sorted.at(-1));
  return res;
}

export function shape({ quote, hist, target, grades, earnings }) {
  const q = Array.isArray(quote) ? quote[0] : quote;
  const t = Array.isArray(target) ? target[0] : target;
  const g = Array.isArray(grades) ? grades[0] : grades;
  return {
    q: q ? { p: num(q.price), chg: num(q.changePercentage ?? q.changesPercentage), d: q.timestamp ? new Date(q.timestamp * 1000).toISOString().slice(0, 10) : null, cur: q.currency || null } : null,
    hist: thin(Array.isArray(hist) ? hist : hist?.historical || []),
    an: t && num(t.targetConsensus) != null ? {
      low: num(t.targetLow), avg: num(t.targetConsensus), high: num(t.targetHigh), median: num(t.targetMedian),
      sb: num(g?.strongBuy) || 0, b: num(g?.buy) || 0, h: num(g?.hold) || 0, s: num(g?.sell) || 0, ss: num(g?.strongSell) || 0, consensus: g?.consensus || null,
    } : null,
    er: (Array.isArray(earnings) ? earnings : []).filter((e) => num(e.epsActual) != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
      .map((e) => ({ d: e.date, a: num(e.epsActual), e: num(e.epsEstimated), ra: num(e.revenueActual), re: num(e.revenueEstimated) })),
  };
}

async function run() {
  const pro = readJSON(path.join(ROOT, 'config/pro.json'), {});
  const v = pro.vendor || {};
  const key = process.env.FMP_API_KEY;
  if (!(v.name === 'fmp' && v.enabled && v.displayLicence && key)) {
    console.log('Vendor data is switched off (config/pro.json vendor.enabled + displayLicence, and FMP_API_KEY). Nothing to do.');
    return;
  }
  const tickers = new Set();
  const etfs = readJSON(path.join(ROOT, 'config/etfs.json'), { us: {}, ca: {} });
  Object.keys(etfs.us || {}).forEach((t) => tickers.add(t));
  Object.keys(etfs.ca || {}).forEach((t) => tickers.add(`${t}.TO`));
  if (process.env.PRO_SITE_URL && process.env.CRON_SECRET) {
    const res = await fetch(`${process.env.PRO_SITE_URL}/api/internal/universe`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    if (res.ok) (await res.json()).tickers.forEach((t) => tickers.add(t));
    else console.warn(`universe: HTTP ${res.status}`);
  }
  const from = new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10);
  const get = (p) => fetchRetry(`${API}/${p}${p.includes('?') ? '&' : '?'}apikey=${key}`, {}, { type: 'json', minGapMs: 120 }).catch((e) => (console.warn(`  ${p.split('?')[0]}: ${e.message}`), null));
  let n = 0;
  for (const t of tickers) {
    const sym = encodeURIComponent(t.endsWith('.TO') ? t : t.replace(/\.([A-Z])$/, '-$1')); // BRK.B -> BRK-B
    const isEtf = !!(etfs.us?.[t] || etfs.ca?.[t.replace(/\.TO$/, '')]);
    const [quote, hist, target, grades, earnings] = await Promise.all([
      get(`quote?symbol=${sym}`),
      get(`historical-price-eod/light?symbol=${sym}&from=${from}`),
      isEtf ? null : get(`price-target-consensus?symbol=${sym}`),
      isEtf ? null : get(`grades-consensus?symbol=${sym}`),
      isEtf ? null : get(`earnings?symbol=${sym}&limit=12`),
    ]);
    const out = shape({ quote, hist, target, grades, earnings });
    if (!out.q && !out.hist.length) continue;
    writeJSON(path.join(OUT, `${t}.json`), { t, at: new Date().toISOString(), source: 'Financial Modeling Prep', ...out });
    n++;
  }
  console.log(`Vendor: ${n}/${tickers.size} tickers updated`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
