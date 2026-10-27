#!/usr/bin/env node
// Every US-listed ticker the SEC knows about (company_tickers.json + the fund and ETF list), saved as
// data/sec-tickers.json = { TICKER: "Company name" }. The Pro watchlist uses it to catch typos.
// Share classes are written the way the rest of the site writes them: BRK.B, not BRK-B.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sec } from './lib/sec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/sec-tickers.json');
const norm = (t) => String(t || '').toUpperCase().trim().replace(/-([A-Z])$/, '.$1');

const out = {};
const companies = await sec('https://www.sec.gov/files/company_tickers.json', 'json');
for (const x of Object.values(companies)) {
  const t = norm(x.ticker);
  if (/^[A-Z][A-Z0-9.]{0,9}$/.test(t) && !out[t]) out[t] = x.title;
}
try {
  // Funds and ETFs: { fields: [cik, seriesId, classId, symbol], data: [...] } (no names, so the symbol stands in).
  const funds = await sec('https://www.sec.gov/files/company_tickers_mf.json', 'json');
  const i = funds.fields.indexOf('symbol');
  for (const row of funds.data) {
    const t = norm(row[i]);
    if (/^[A-Z][A-Z0-9.]{0,9}$/.test(t) && !out[t]) out[t] = t;
  }
} catch (e) {
  console.warn('Fund list skipped:', e.message);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const next = JSON.stringify(sorted);
if (Object.keys(sorted).length < 5000) throw new Error(`Only ${Object.keys(sorted).length} tickers: refusing to overwrite`);
if (before !== next) fs.writeFileSync(OUT, next);
console.log(`${Object.keys(sorted).length} tickers${before === next ? ' (unchanged)' : ''} → data/sec-tickers.json`);
