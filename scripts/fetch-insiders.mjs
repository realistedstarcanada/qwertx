#!/usr/bin/env node
// Quarterly insider trading summary from the SEC "Insider Transactions Data Sets" (Forms 3/4/5).
// Downloads the newest quarterly ZIP not yet processed, keeps open-market purchases (code P) and
// sales (code S) from Form 4 filings, and writes data/insiders/<YYYYqN>.json.
// Usage: node scripts/fetch-insiders.mjs [--force] [--quarter 2026q3]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON } from './lib/net.mjs';
import { sec, UA } from './lib/sec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'insiders');
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const wantQ = args.includes('--quarter') ? args[args.indexOf('--quarter') + 1] : null;
const KEEP_QUARTERS = 4;

const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
export function toIsoDate(s) {
  if (!s) return null;
  let m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/i.exec(s);
  if (m) return `${m[3]}-${MON[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[0];
  return null;
}

/** Read a TSV into an array of objects keyed by the header row. */
export function readTsv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const head = lines.shift().split('\t').map((h) => h.trim().toUpperCase());
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const cells = line.split('\t');
    const o = {};
    head.forEach((h, i) => (o[h] = cells[i] ?? ''));
    rows.push(o);
  }
  return rows;
}

function roleOf(rel, title) {
  const r = String(rel || '').toLowerCase();
  const t = String(title || '').trim();
  if (t) return t;
  if (r.includes('officer')) return 'Officer';
  if (r.includes('director')) return 'Director';
  if (r.includes('tenpercent') || r.includes('10')) return '10% owner';
  return r ? r.replace(/,/g, ', ') : 'Insider';
}

function relOf(rel) {
  const r = String(rel || '').toLowerCase();
  return { officer: r.includes('officer'), director: r.includes('director'), owner10: r.includes('ten') || r.includes('10') };
}

export function summarize(dir, quarter) {
  // Trades dated within the quarter (plus the prior quarter, for late filers).
  const y = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(5));
  const maxDate = new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10);
  const minDate = new Date(Date.UTC(y, q * 3 - 6, 1)).toISOString().slice(0, 10);
  const subs = new Map(readTsv(path.join(dir, 'SUBMISSION.tsv')).map((s) => [s.ACCESSION_NUMBER, s]));
  const owners = new Map();
  for (const o of readTsv(path.join(dir, 'REPORTINGOWNER.tsv'))) {
    if (!owners.has(o.ACCESSION_NUMBER)) owners.set(o.ACCESSION_NUMBER, []);
    owners.get(o.ACCESSION_NUMBER).push(o);
  }
  const trans = readTsv(path.join(dir, 'NONDERIV_TRANS.tsv'));
  const rows = [];
  for (const t of trans) {
    const code = (t.TRANS_CODE || '').trim().toUpperCase();
    if (code !== 'P' && code !== 'S') continue;
    const s = subs.get(t.ACCESSION_NUMBER);
    if (!s || !/^4/.test(s.DOCUMENT_TYPE || '')) continue;
    const shares = parseFloat(t.TRANS_SHARES) || 0;
    const price = parseFloat(t.TRANS_PRICEPERSHARE) || 0;
    const value = shares * price;
    if (!shares || !price || value < 1000) continue;
    // Guard against data-entry errors in filings (prices in the wrong unit, swapped fields).
    if (price > 10000 && !/^BRK/.test(s.ISSUERTRADINGSYMBOL || '')) continue;
    if (value > 3e9) continue;
    const tDate = toIsoDate(t.TRANS_DATE);
    if (!tDate || tDate < minDate || tDate > maxDate) continue;
    const ticker = (s.ISSUERTRADINGSYMBOL || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ticker || ticker === 'NONE' || ticker === 'N/A') continue;
    const o = (owners.get(t.ACCESSION_NUMBER) || [])[0] || {};
    rows.push({
      acc: t.ACCESSION_NUMBER,
      type: code === 'P' ? 'buy' : 'sell',
      ticker,
      company: (s.ISSUERNAME || '').trim(),
      issuerCik: s.ISSUERCIK,
      owner: (o.RPTOWNERNAME || '').trim(),
      ownerCik: o.RPTOWNERCIK,
      role: roleOf(o.RPTOWNER_RELATIONSHIP, o.RPTOWNER_TITLE),
      ...relOf(o.RPTOWNER_RELATIONSHIP),
      date: tDate,
      filed: toIsoDate(s.FILING_DATE),
      shares,
      price,
      value,
      plan: /^(1|y|true)/i.test(String(s.AFF10B5ONE || '').trim()),
    });
  }

  // Merge multiple lines of the same filing for the same issuer+type (one row per insider trade report).
  const merged = new Map();
  for (const r of rows) {
    const k = `${r.acc}|${r.type}`;
    const m = merged.get(k);
    if (m) {
      m.shares += r.shares;
      m.value += r.value;
      m.price = m.value / m.shares;
      if (r.date && (!m.date || r.date < m.date)) m.date = r.date;
    } else merged.set(k, { ...r });
  }
  const trades = [...merged.values()];
  const buys = trades.filter((t) => t.type === 'buy');
  const sells = trades.filter((t) => t.type === 'sell');

  const byCompany = (list) => {
    const m = new Map();
    for (const t of list) {
      if (!m.has(t.ticker)) m.set(t.ticker, { ticker: t.ticker, company: t.company, value: 0, trades: 0, insiders: new Set(), roles: new Set(), last: null });
      const c = m.get(t.ticker);
      c.value += t.value;
      c.trades++;
      c.insiders.add(t.ownerCik || t.owner);
      c.roles.add(t.role);
      if (!c.last || t.date > c.last) c.last = t.date;
    }
    return [...m.values()].map((c) => ({ ...c, insiders: c.insiders.size, roles: [...c.roles].slice(0, 4) }));
  };
  const buyCos = byCompany(buys);
  const sellCos = byCompany(sells);
  const slim = (t) => ({ ticker: t.ticker, company: t.company, owner: t.owner, role: t.role, exec: !!(t.officer || t.director), owner10: !!t.owner10, date: t.date, filed: t.filed, shares: Math.round(t.shares), price: +t.price.toFixed(2), value: Math.round(t.value), plan: t.plan, acc: t.acc, ownerCik: t.ownerCik, issuerCik: t.issuerCik });
  const isExec = (t) => (t.officer || t.director) && !t.owner10;

  const monthly = {};
  for (const t of trades) {
    const k = (t.date || '').slice(0, 7);
    if (!k) continue;
    monthly[k] = monthly[k] || { buy: 0, sell: 0, buyValue: 0, sellValue: 0 };
    monthly[k][t.type]++;
    monthly[k][t.type + 'Value'] += t.value;
  }

  return {
    quarter,
    generatedAt: new Date().toISOString(),
    source: 'SEC Insider Transactions Data Sets (Form 4, transaction codes P and S)',
    totals: {
      buys: buys.length,
      sells: sells.length,
      buyValue: Math.round(buys.reduce((a, t) => a + t.value, 0)),
      sellValue: Math.round(sells.reduce((a, t) => a + t.value, 0)),
      buyCompanies: buyCos.length,
      sellCompanies: sellCos.length,
      plannedSells: sells.filter((t) => t.plan).length,
    },
    monthly,
    topBuys: buys.sort((a, b) => b.value - a.value).slice(0, 40).map(slim),
    topExecBuys: buys.filter(isExec).sort((a, b) => b.value - a.value).slice(0, 40).map(slim),
    topExecSells: sells.filter(isExec).sort((a, b) => b.value - a.value).slice(0, 40).map(slim),
    topSells: sells.sort((a, b) => b.value - a.value).slice(0, 40).map(slim),
    clusterBuys: byCompany(buys.filter(isExec)).filter((c) => c.insiders >= 3).sort((a, b) => b.insiders - a.insiders || b.value - a.value).slice(0, 30),
    topBuyCompanies: buyCos.sort((a, b) => b.value - a.value).slice(0, 30),
    topSellCompanies: sellCos.sort((a, b) => b.value - a.value).slice(0, 30),
    // Every ticker with insider buying, so the site can cross-reference superinvestor holdings.
    buyTickers: Object.fromEntries(buyCos.map((c) => [c.ticker, { value: Math.round(c.value), insiders: c.insiders }])),
    sellTickers: Object.fromEntries(sellCos.map((c) => [c.ticker, { value: Math.round(c.value), insiders: c.insiders }])),
  };
}

async function listDatasets() {
  const html = await sec('https://www.sec.gov/dera/data/form-345');
  const links = [...html.matchAll(/href="([^"]*?(\d{4}q[1-4])_form345\.zip)"/gi)].map((m) => ({
    url: new URL(m[1], 'https://www.sec.gov').href,
    quarter: m[2].toLowerCase(),
  }));
  const seen = new Set();
  return links.filter((l) => !seen.has(l.quarter) && seen.add(l.quarter)).sort((a, b) => b.quarter.localeCompare(a.quarter));
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const sets = await listDatasets();
  if (!sets.length) throw new Error('no data set links found on the SEC page');
  const targets = wantQ ? sets.filter((s) => s.quarter === wantQ) : sets.slice(0, 2);
  for (const ds of targets) {
    const outFile = path.join(OUT, `${ds.quarter}.json`);
    if (!FORCE && fs.existsSync(outFile)) {
      console.log(`• ${ds.quarter}: already processed`);
      continue;
    }
    console.log(`• ${ds.quarter}: downloading ${ds.url}`);
    const res = await fetch(ds.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${ds.url}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f345-'));
    const zip = path.join(tmp, 'data.zip');
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
    const files = fs.readdirSync(tmp);
    const head = (f) => fs.readFileSync(path.join(tmp, f), 'utf8').split('\n')[0];
    console.log(`  files: ${files.join(', ')}`);
    for (const f of ['SUBMISSION.tsv', 'REPORTINGOWNER.tsv', 'NONDERIV_TRANS.tsv']) console.log(`  ${f} columns: ${head(f).replace(/\t/g, ', ')}`);
    const summary = summarize(tmp, ds.quarter);
    writeJSON(outFile, summary);
    console.log(`  ${summary.totals.buys} buys ($${(summary.totals.buyValue / 1e6).toFixed(0)}M), ${summary.totals.sells} sells ($${(summary.totals.sellValue / 1e9).toFixed(2)}B)`);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // Keep the newest few quarters only.
  const all = fs.readdirSync(OUT).filter((f) => /^\d{4}q[1-4]\.json$/.test(f)).sort().reverse();
  for (const f of all.slice(KEEP_QUARTERS)) fs.rmSync(path.join(OUT, f));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
