#!/usr/bin/env node
// Full portfolios for featured House members: holdings from their latest annual Financial Disclosure report
// (Schedule A, with value ranges) and every electronic Periodic Transaction Report since last year.
// Source: the Clerk of the House (disclosures-clerk.house.gov). Writes data/featured/<slug>.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, sleep } from './lib/net.mjs';
import { parseHouseHoldings, parseHouseTransactions } from './lib/featured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/featured');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = 'https://disclosures-clerk.house.gov/public_disc';
const cfg = readJSON(path.join(ROOT, 'config/featured.json'), { house: [] });
const FORCE = process.argv.includes('--force');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-'));
const curl = (url, file) => execFileSync('curl', ['-sSL', '--fail', '-m', '180', '-A', UA, '-o', file, url]);
const text = (file) => execFileSync('pdftotext', ['-raw', file, '-'], { maxBuffer: 1 << 28 }).toString('utf8');

function yearIndex(year) {
  const zip = path.join(tmp, `${year}.zip`);
  curl(`${BASE}/financial-pdfs/${year}FD.zip`, zip);
  execFileSync('unzip', ['-o', '-q', zip, '-d', path.join(tmp, String(year))]);
  const xml = fs.readFileSync(path.join(tmp, String(year), `${year}FD.xml`), 'utf8');
  return [...xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)].map((m) => {
    const g = (t) => ((new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[1]) || [])[1] || '').trim();
    const [mm, dd, yy] = g('FilingDate').split('/');
    return { last: g('Last'), first: g('First'), type: g('FilingType'), state: g('StateDst'), year: g('Year'), filed: yy ? `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : null, doc: g('DocID') };
  });
}

async function main() {
  const now = new Date().getUTCFullYear();
  const idx = [];
  for (const y of [now, now - 1]) {
    try { idx.push(...yearIndex(y)); } catch (e) { console.error('index', y, e.message); }
  }
  if (!idx.length) { console.error('No House index; keeping previous data'); return; }
  for (const m of cfg.house) {
    const file = path.join(OUT, `${m.slug}.json`);
    const prev = readJSON(file, { docs: {} });
    const docs = FORCE ? {} : prev.docs || {};
    const mine = idx.filter((x) => x.last === m.last && x.first === m.first && (!m.state || x.state === m.state));
    // Electronic filings only (paper scans start with 8 or 9 and have no text layer).
    const ptrs = mine.filter((x) => x.type === 'P' && /^2/.test(x.doc));
    const annual = mine.filter((x) => x.type === 'O').sort((a, b) => String(b.filed).localeCompare(String(a.filed)))[0];
    for (const f of [...ptrs, ...(annual ? [annual] : [])]) {
      if (docs[f.doc]) continue;
      const kind = f.type === 'P' ? 'ptr-pdfs' : 'financial-pdfs';
      const url = `${BASE}/${kind}/${f.year}/${f.doc}.pdf`;
      try {
        curl(url, path.join(tmp, 'f.pdf'));
        const raw = text(path.join(tmp, 'f.pdf'));
        // Completeness check: every asset on the form ends with a type code like [ST]; count them.
        const codes = (raw.match(/\[[A-Z]{2}\]/g) || []).length;
        docs[f.doc] = f.type === 'P'
          ? { kind: 'ptr', filed: f.filed, url, codes, transactions: parseHouseTransactions(raw) }
          : { kind: 'annual', filed: f.filed, year: f.year, url, codes, holdings: parseHouseHoldings(raw), transactions: parseHouseTransactions(raw, { annual: true }) };
        console.log(m.slug, f.type, f.doc, f.filed, docs[f.doc].transactions.length, 'transactions', docs[f.doc].holdings ? docs[f.doc].holdings.length + ' holdings' : '');
      } catch (e) { console.error(m.slug, f.doc, e.message.slice(0, 160)); }
      await sleep(500);
    }
    // Cross-check two official documents against each other: the annual report's Schedule B lists every
    // transaction of the year, which must match the periodic transaction reports for that year.
    const checks = [];
    for (const a of Object.values(docs).filter((x) => x.kind === 'annual')) {
      const key = (t) => [t.date, t.ticker || t.name.slice(0, 20).toLowerCase(), t.type, t.lo].join('|');
      const ptrRows = Object.values(docs).filter((x) => x.kind === 'ptr').flatMap((x) => x.transactions).filter((t) => t.date && t.date.startsWith(a.year));
      const inPtr = new Set(ptrRows.map(key));
      const inAnnual = new Set(a.transactions.map(key));
      const matched = a.transactions.filter((t) => inPtr.has(key(t))).length;
      checks.push({ year: a.year, annual: a.transactions.length, ptr: ptrRows.length, matched, onlyAnnual: a.transactions.filter((t) => !inPtr.has(key(t))).map(key), onlyPtr: ptrRows.filter((t) => !inAnnual.has(key(t))).map(key) });
    }
    const completeness = Object.entries(docs).map(([id, x]) => ({ id, codes: x.codes, parsed: (x.kind === 'ptr' ? x.transactions.length : x.holdings.length + x.transactions.length) }));
    for (const c of checks) console.log(m.slug, `${c.year}: annual report lists ${c.annual} transactions, PTRs ${c.ptr}, matched ${c.matched}`);
    writeJSON(file, { slug: m.slug, checks, completeness, updatedAt: new Date().toISOString(), annualDoc: annual?.doc || prev.annualDoc || null, docs });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
