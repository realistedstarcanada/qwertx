#!/usr/bin/env node
// Every company and ETF listed on the Toronto Stock Exchange, from TSX's public listed-company directory,
// saved as data/tsx-tickers.json = { "CGL.TO": "iShares Gold Bullion ETF", "BIP-UN.TO": "...", ... }.
// The Pro watchlist uses it to accept Toronto-only holdings and to suggest them in the add box.
// Symbols are written the way the site writes Toronto listings: dots become dashes (BIP.UN -> BIP-UN.TO).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/tsx-tickers.json');
const URL = 'https://www.tsx.com/json/company-directory/search/tsx/%5E*';

/** Turns the directory JSON into { "SYM.TO": name }. Exported for tests. */
export function parseDirectory(json) {
  const rows = Array.isArray(json) ? json : json?.results || json?.data || [];
  const out = {};
  const add = (sym, name) => {
    const s = String(sym || '').toUpperCase().trim();
    if (!/^[A-Z][A-Z0-9]{0,6}(\.[A-Z0-9]{1,3})*$/.test(s)) return;
    const key = `${s.replace(/\./g, '-')}.TO`;
    if (!out[key]) out[key] = String(name || s).replace(/\s+/g, ' ').trim();
  };
  for (const r of rows) {
    add(r.symbol, r.name);
    for (const i of r.instruments || []) add(i.symbol, i.name || r.name);
  }
  return out;
}

async function run() {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (QWERTx ticker list; admin@qwertx.com)', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TSX directory: HTTP ${res.status}`);
  const list = parseDirectory(await res.json());
  const n = Object.keys(list).length;
  if (n < 1000) throw new Error(`Only ${n} TSX listings: refusing to overwrite`);
  const next = JSON.stringify(Object.fromEntries(Object.entries(list).sort(([a], [b]) => a.localeCompare(b))));
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (before !== next) fs.writeFileSync(OUT, next);
  console.log(`${n} TSX listings${before === next ? ' (unchanged)' : ''} → data/tsx-tickers.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
