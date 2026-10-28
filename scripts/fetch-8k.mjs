#!/usr/bin/env node
// Major company events from SEC Form 8-K filings (official, free) for every stock QWERTx covers.
// 1. Reads EDGAR's daily form index for each day not processed yet (8-K and 8-K/A rows only).
// 2. For companies in our universe that filed, reads their submissions JSON once to get the 8-K item numbers.
// Writes data/filings/8k.json = { updatedAt, through, byTicker: { NVDA: [{ d, items, acc, url }] } }, last 120 days.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON } from './lib/net.mjs';
import { sec, pad } from './lib/sec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/filings/8k.json');
const KEEP_DAYS = 120;
const PER_TICKER = 10;

/** Parses one EDGAR daily form.idx file into rows. Exported for tests. */
export function parseFormIndex(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(\S+(?: \S+)*?)\s{2,}(.+?)\s{2,}(\d{1,10})\s{2,}(\d{8}|\d{4}-\d{2}-\d{2})\s{2,}(\S+)\s*$/.exec(line);
    if (!m) continue;
    const date = m[4].includes('-') ? m[4] : `${m[4].slice(0, 4)}-${m[4].slice(4, 6)}-${m[4].slice(6, 8)}`;
    rows.push({ form: m[1].trim(), company: m[2].trim(), cik: Number(m[3]), date, file: m[5] });
  }
  return rows;
}

/** 8-K filings with item numbers from a company's submissions JSON. Exported for tests. */
export function eightKsFrom(sub, sinceIso) {
  const r = sub?.filings?.recent;
  if (!r?.form) return [];
  const out = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== '8-K' && r.form[i] !== '8-K/A') continue;
    if (r.filingDate[i] < sinceIso) continue;
    const acc = r.accessionNumber[i];
    const items = String(r.items?.[i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    out.push({
      d: r.filingDate[i],
      items,
      amend: r.form[i] === '8-K/A',
      acc,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(sub.cik)}/${acc.replace(/-/g, '')}/${r.primaryDocument?.[i] || `${acc}-index.htm`}`,
    });
  }
  return out;
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const qtr = (d) => `QTR${Math.floor(d.getUTCMonth() / 3) + 1}`;

async function run() {
  const prev = readJSON(OUT, { byTicker: {}, through: null });
  const index = readJSON(path.join(ROOT, 'dist/pro/index.json'), null);
  const universe = new Set(Object.keys(index?.tickers || {}));
  for (const s of Object.keys(readJSON(path.join(ROOT, 'data/sectors.json'), {}))) universe.add(s);
  if (!universe.size) throw new Error('No ticker universe (build the site first so dist/pro/index.json exists)');

  // CIK -> our tickers
  const list = await sec('https://www.sec.gov/files/company_tickers.json', 'json');
  const tickersOf = new Map();
  for (const x of Object.values(list)) {
    const t = String(x.ticker).toUpperCase().replace(/-([A-Z])$/, '.$1');
    if (!universe.has(t)) continue;
    if (!tickersOf.has(x.cik_str)) tickersOf.set(x.cik_str, []);
    tickersOf.get(x.cik_str).push(t);
  }

  const today = new Date();
  const since = new Date(Date.now() - KEEP_DAYS * 864e5);
  let start = prev.through ? new Date(Date.parse(prev.through) + 864e5) : since;
  if (start < since) start = since;
  const filers = new Set();
  let days = 0;
  for (let d = new Date(start); d <= today; d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const ymd = isoDay(d).replace(/-/g, '');
    const url = `https://www.sec.gov/Archives/edgar/daily-index/${d.getUTCFullYear()}/${qtr(d)}/form.${ymd}.idx`;
    let text;
    try {
      text = await sec(url);
    } catch (e) {
      if (/HTTP 40[34]/.test(e.message)) continue; // holiday or not published yet
      throw e;
    }
    days++;
    for (const r of parseFormIndex(text)) if ((r.form === '8-K' || r.form === '8-K/A') && tickersOf.has(r.cik)) filers.add(r.cik);
  }

  const byTicker = { ...(prev.byTicker || {}) };
  const sinceIso = isoDay(since);
  let n = 0;
  for (const cik of filers) {
    try {
      const sub = await sec(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, 'json');
      const list8k = eightKsFrom(sub, sinceIso);
      for (const t of tickersOf.get(cik)) byTicker[t] = list8k.slice(0, PER_TICKER);
      n++;
    } catch (e) {
      console.warn(`  CIK ${cik}: ${e.message}`);
    }
  }
  // Drop anything older than the window.
  for (const t of Object.keys(byTicker)) {
    byTicker[t] = (byTicker[t] || []).filter((x) => x.d >= sinceIso);
    if (!byTicker[t].length) delete byTicker[t];
  }
  writeJSON(OUT, { updatedAt: new Date().toISOString(), through: isoDay(today), source: 'SEC EDGAR Form 8-K', byTicker });
  console.log(`8-K: ${days} daily indexes read, ${filers.size} covered companies filed, ${n} refreshed, ${Object.keys(byTicker).length} tickers with events`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
