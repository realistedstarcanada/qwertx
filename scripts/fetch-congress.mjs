#!/usr/bin/env node
// Congressional stock trades from the official STOCK Act disclosure sites:
//   House:  disclosures-clerk.house.gov  (yearly XML index + Periodic Transaction Report PDFs)
//   Senate: efdsearch.senate.gov         (electronic Periodic Transaction Reports, HTML)
// Party and state come from the public unitedstates/congress-legislators dataset.
// New filings are appended to data/congress/trades.json; filings already processed are skipped.
// Usage: node scripts/fetch-congress.mjs [--since 2026-04-01] [--debug] [--house-only|--senate-only]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON, sleep } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'congress');
const OUT = path.join(OUT_DIR, 'trades.json');
const args = process.argv.slice(2);
const DEBUG = args.includes('--debug');
const argVal = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const UA = 'Mozilla/5.0 (compatible; QWERTxBot/1.0; +https://qwertx.com)';
const MAX_DOCS = Number(argVal('--max') || 400);

// Keep trades from the start of the quarter before last.
function defaultSince() {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3);
  const start = new Date(Date.UTC(d.getUTCFullYear(), q * 3 - 6, 1));
  return start.toISOString().slice(0, 10);
}
const SINCE = argVal('--since') || defaultSince();

const usDate = (s) => {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

// STOCK Act amounts are ranges. Midpoint is used for rough $ totals.
export function parseAmount(s) {
  const t = String(s || '').replace(/\s+/g, ' ');
  const nums = [...t.matchAll(/\$\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  if (!nums.length) return { label: t.trim(), low: null, high: null, mid: null };
  if (/over/i.test(t) && nums.length === 1) return { label: `Over $${nums[0].toLocaleString('en-US')}`, low: nums[0], high: null, mid: nums[0] };
  const [low, high = low] = nums;
  return { label: `$${low.toLocaleString('en-US')} – $${high.toLocaleString('en-US')}`, low, high, mid: (low + high) / 2 };
}

export function normType(s) {
  const t = String(s || '').trim().toLowerCase();
  if (/^p(urchase)?$/.test(t) || t.startsWith('purchase')) return 'buy';
  if (t.startsWith('s') || t.includes('sale')) return 'sell';
  if (t.startsWith('e')) return 'exchange';
  return 'other';
}

/* ------------------------------ People ------------------------------ */
async function loadLegislators() {
  try {
    const list = await fetchRetry('https://unitedstates.github.io/congress-legislators/legislators-current.json', { headers: { 'User-Agent': UA } }, { type: 'json' });
    return list.map((p) => {
      const term = p.terms[p.terms.length - 1];
      return {
        id: p.id?.bioguide,
        first: p.name.first,
        last: p.name.last,
        nick: p.name.nickname,
        full: p.name.official_full || `${p.name.first} ${p.name.last}`,
        chamber: term.type === 'sen' ? 'Senate' : 'House',
        state: term.state,
        district: term.district,
        party: term.party,
      };
    });
  } catch (e) {
    console.warn(`legislators list unavailable: ${e.message}`);
    return [];
  }
}

const norm = (s) => String(s || '').replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
function findPerson(people, { first, last, chamber, state }) {
  const L = norm(last);
  const F = norm(first);
  const cands = people.filter((p) => p.chamber === chamber && (norm(p.last) === L || norm(p.last).endsWith(L) || L.endsWith(norm(p.last))));
  if (!cands.length && F) {
    // Try the first name too ("A. Mitchell McConnell" style names)
    const byFirst = people.filter((p) => p.chamber === chamber && norm(p.last) === L.replace(/^.*?(?=[a-z]{4,}$)/, ''));
    if (byFirst.length) return byFirst[0];
  }
  if (cands.length <= 1) return cands[0] || null;
  const byState = state ? cands.filter((p) => p.state === state) : cands;
  if (byState.length === 1) return byState[0];
  const pool = byState.length ? byState : cands;
  return pool.find((p) => norm(p.first).startsWith(F.slice(0, 3)) || norm(p.nick).startsWith(F.slice(0, 3))) || pool[0];
}

/* ------------------------------ House ------------------------------ */
export function parseHousePtrText(text) {
  // pdftotext output of an electronically filed House PTR. Each transaction block contains
  // "(TICKER) [ST]" and a line with type + two dates + amount; the order can vary, so parse per block.
  const flat = text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const out = [];
  const re = /\(([A-Z][A-Z0-9.\-]{0,7})\)\s*\[(ST|OP|EF|ET|AB|OT|OI|PS|HN)\]/g;
  let m;
  const hits = [];
  while ((m = re.exec(flat))) hits.push({ i: m.index, end: re.lastIndex, ticker: m[1], kind: m[2] });
  for (let k = 0; k < hits.length; k++) {
    const h = hits[k];
    const prevEnd = k ? hits[k - 1].end : 0;
    const nextStart = k + 1 < hits.length ? hits[k + 1].i : flat.length;
    const before = flat.slice(Math.max(prevEnd, h.i - 400), h.i);
    const after = flat.slice(h.end, Math.min(nextStart, h.end + 500));
    const win = before + ' @@ ' + after;
    // type then transaction date then notification date
    const tm = /(?:^|\s)(P|S|S \(partial\)|E)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/.exec(after) || /(?:^|\s)(P|S|S \(partial\)|E)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/.exec(win);
    if (!tm) continue;
    const amt = /(\$[\d,]+\s*-\s*(?:[\s\S]{0,80}?)\$[\d,]+|Over \$[\d,]+|\$[\d,]+ \+)/.exec(win.slice(win.indexOf(tm[2])));
    const ownerM = /(?:^|\s)(SP|JT|DC)\s+[A-Z]/.exec(before.slice(-200));
    const asset = before.replace(/[\s\S]*(?:\$[\d,]+|\[[A-Z]{2}\]|Cap\.?\s*Gains[^\n]*|\?)\s*/m, '').replace(/^(SP|JT|DC)\s+/, '').trim();
    out.push({
      ticker: h.ticker.replace(/\.$/, ''),
      assetType: h.kind,
      asset: (asset + ' ' + flat.slice(h.i, h.end)).replace(/\s+/g, ' ').trim().slice(-140),
      type: normType(tm[1]),
      partial: /partial/i.test(tm[1]),
      date: usDate(tm[2]),
      notified: usDate(tm[3]),
      amount: parseAmount(amt ? amt[1] : ''),
      owner: ownerM ? ownerM[1] : 'Self',
    });
  }
  return out;
}

async function houseFilings(years) {
  const list = [];
  for (const y of years) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'housefd-'));
    try {
      const res = await fetch(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${y}FD.zip`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(path.join(tmp, 'fd.zip'), Buffer.from(await res.arrayBuffer()));
      execFileSync('unzip', ['-o', '-q', path.join(tmp, 'fd.zip'), '-d', tmp]);
      const xmlFile = fs.readdirSync(tmp).find((f) => /\.xml$/i.test(f));
      const xml = fs.readFileSync(path.join(tmp, xmlFile), 'utf8');
      for (const b of xml.match(/<Member>[\s\S]*?<\/Member>/g) || []) {
        const g = (t) => ((new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(b) || [])[1] || '').trim();
        if (g('FilingType') !== 'P') continue;
        list.push({ year: y, docId: g('DocID'), first: g('First'), last: g('Last'), stateDst: g('StateDst'), filed: usDate(g('FilingDate')) });
      }
    } catch (e) {
      console.warn(`House ${y} index unavailable: ${e.message}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return list;
}

async function houseTrades(people, done) {
  const years = [...new Set([Number(SINCE.slice(0, 4)), new Date().getUTCFullYear()])];
  const filings = (await houseFilings(years)).filter((f) => f.filed && f.filed >= SINCE && !done.has(`H${f.docId}`));
  console.log(`House: ${filings.length} new PTR filings since ${SINCE}`);
  const trades = [];
  const processed = [];
  let n = 0;
  for (const f of filings.sort((a, b) => b.filed.localeCompare(a.filed))) {
    if (n >= MAX_DOCS) break;
    // Electronically filed PTRs have numeric DocIDs starting with 2; others are scanned paper forms.
    if (!/^2\d{7}$/.test(f.docId)) {
      processed.push(`H${f.docId}`);
      continue;
    }
    n++;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr-'));
    try {
      const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.year}/${f.docId}.pdf`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pdf = path.join(tmp, 'p.pdf');
      fs.writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
      const text = execFileSync('pdftotext', ['-raw', pdf, '-'], { encoding: 'utf8' });
      if (DEBUG && n <= 3) console.log(`----- House ${f.docId} raw text -----\n${text.slice(0, 2500)}\n-----`);
      const state = f.stateDst.slice(0, 2);
      const person = findPerson(people, { first: f.first, last: f.last, chamber: 'House', state });
      const rows = parseHousePtrText(text);
      for (const r of rows)
        trades.push({
          id: `H${f.docId}-${trades.length}`,
          chamber: 'House',
          member: person ? person.full : `${f.first} ${f.last}`,
          bioguide: person?.id || null,
          party: person?.party || null,
          state,
          district: f.stateDst.slice(2) || null,
          filed: f.filed,
          source: url,
          ...r,
        });
      processed.push(`H${f.docId}`);
      if (DEBUG && n <= 3) console.log(`  parsed ${rows.length} rows:`, JSON.stringify(rows.slice(0, 3)));
    } catch (e) {
      console.warn(`  House ${f.docId} (${f.last}) skipped: ${e.message}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    await sleep(250);
  }
  return { trades, processed };
}

/* ------------------------------ Senate ------------------------------ */
class Jar {
  constructor() {
    this.c = {};
  }
  take(res) {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const line of raw) {
      const [kv] = line.split(';');
      const i = kv.indexOf('=');
      if (i > 0) this.c[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  }
  get header() {
    return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function parseSenatePtrHtml(html) {
  const body = (/<tbody>([\s\S]*?)<\/tbody>/i.exec(html) || [])[1] || '';
  const rows = [];
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const td = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(strip);
    if (td.length < 8) continue;
    // #, Transaction Date, Owner, Ticker, Asset Name, Asset Type, Type, Amount, Comment
    const [, date, owner, ticker, asset, assetType, type, amount] = td;
    const tk = ticker && ticker !== '--' ? ticker.replace(/[^A-Z0-9.\-]/gi, '').toUpperCase() : null;
    rows.push({
      ticker: tk,
      asset,
      assetType: /stock/i.test(assetType) ? 'ST' : assetType,
      type: normType(type),
      partial: /partial/i.test(type),
      date: usDate(date),
      amount: parseAmount(amount),
      owner: owner || 'Self',
    });
  }
  return rows;
}

async function senateTrades(people, done) {
  const base = 'https://efdsearch.senate.gov';
  const jar = new Jar();
  const get = async (url, extra = {}) => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: jar.header, ...extra }, redirect: 'manual' });
    jar.take(res);
    return res;
  };
  let res = await get(`${base}/search/home/`);
  let html = await res.text();
  const token = (/name="csrfmiddlewaretoken" value="([^"]+)"/.exec(html) || [])[1];
  if (!token) throw new Error('Senate: no CSRF token on agreement page');
  res = await fetch(`${base}/search/home/`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Cookie: jar.header, 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${base}/search/home/` },
    body: new URLSearchParams({ prohibition_agreement: '1', csrfmiddlewaretoken: token }),
    redirect: 'manual',
  });
  jar.take(res);
  const csrf = jar.c.csrftoken || token;
  const [y, m, d] = SINCE.split('-');
  const reports = [];
  for (let start = 0; start < 2000; start += 100) {
    const r = await fetch(`${base}/search/report/data/`, {
      method: 'POST',
      headers: { 'User-Agent': UA, Cookie: jar.header, 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrf, Referer: `${base}/search/` },
      body: new URLSearchParams({
        start: String(start), length: '100', report_types: '[11]', filer_types: '[]',
        submitted_start_date: `${m}/${d}/${y} 00:00:00`, submitted_end_date: '', candidate_state: '', senator_state: '',
        office_id: '', first_name: '', last_name: '', csrfmiddlewaretoken: csrf,
      }),
    });
    jar.take(r);
    if (!r.ok) throw new Error(`Senate search HTTP ${r.status}`);
    const j = await r.json();
    const data = j.data || [];
    reports.push(...data);
    if (data.length < 100) break;
    await sleep(400);
  }
  const ptrs = reports
    .map((row) => {
      const link = (/href="([^"]+)"/.exec(row[3]) || [])[1] || '';
      return { first: strip(row[0]), last: strip(row[1]), office: strip(row[2]), link, filed: usDate(row[4]) };
    })
    .filter((r) => /\/search\/view\/ptr\//.test(r.link));
  const todo = ptrs.filter((p) => !done.has(`S${p.link}`));
  console.log(`Senate: ${reports.length} reports since ${SINCE}, ${ptrs.length} electronic PTRs, ${todo.length} new`);
  const trades = [];
  const processed = reports.filter((r) => !/\/ptr\//.test(r[3])).map((r) => `S${(/href="([^"]+)"/.exec(r[3]) || [])[1]}`);
  let n = 0;
  for (const p of todo) {
    if (n++ >= MAX_DOCS) break;
    try {
      const r = await get(base + p.link, { Referer: `${base}/search/` });
      const page = await r.text();
      const rows = parseSenatePtrHtml(page);
      if (DEBUG && n <= 2) console.log(`----- Senate ${p.last}: ${rows.length} rows -----`, JSON.stringify(rows.slice(0, 2)));
      const person = findPerson(people, { first: p.first, last: p.last, chamber: 'Senate' });
      for (const row of rows)
        trades.push({
          id: `S${p.link.split('/').filter(Boolean).pop()}-${trades.length}`,
          chamber: 'Senate',
          member: person ? person.full : `${p.first} ${p.last}`,
          bioguide: person?.id || null,
          party: person?.party || null,
          state: person?.state || null,
          district: null,
          filed: p.filed,
          source: base + p.link,
          ...row,
        });
      processed.push(`S${p.link}`);
    } catch (e) {
      console.warn(`  Senate ${p.last} skipped: ${e.message}`);
    }
    await sleep(500);
  }
  return { trades, processed };
}

async function secCompanyNames() {
  try {
    const list = await fetchRetry('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'QWERTx admin@qwertx.com' } }, { type: 'json' });
    return new Map(Object.values(list).map((x) => [String(x.ticker).toUpperCase().replace('-', '.'), x.title]));
  } catch {
    return new Map();
  }
}

/* ------------------------------ Main ------------------------------ */
async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const store = readJSON(OUT, { updatedAt: null, since: SINCE, processed: [], trades: [] });
  const done = new Set(store.processed);
  const people = await loadLegislators();
  console.log(`Legislators loaded: ${people.length}`);
  const parts = [];
  if (!args.includes('--senate-only')) {
    try {
      parts.push(await houseTrades(people, done));
    } catch (e) {
      console.warn(`House failed: ${e.message}`);
    }
  }
  if (!args.includes('--house-only')) {
    try {
      parts.push(await senateTrades(people, done));
    } catch (e) {
      console.warn(`Senate failed: ${e.message}`);
    }
  }
  const added = parts.flatMap((p) => p.trades);
  const names = await secCompanyNames();
  for (const t of [...store.trades, ...added]) if (t.ticker && !t.company && names.has(t.ticker)) t.company = names.get(t.ticker);
  const cutoff = defaultSince();
  const trades = [...store.trades, ...added]
    .filter((t) => (t.date || t.filed || '') >= cutoff || (t.filed || '') >= cutoff)
    .sort((a, b) => (b.filed || '').localeCompare(a.filed || '') || (b.date || '').localeCompare(a.date || ''));
  const processed = [...new Set([...store.processed, ...parts.flatMap((p) => p.processed)])].slice(-6000);
  writeJSON(OUT, { updatedAt: new Date().toISOString(), since: cutoff, processed, trades });
  const stocks = trades.filter((t) => t.ticker);
  console.log(`Added ${added.length} trades (${added.filter((t) => t.ticker).length} with tickers). Store now has ${trades.length} trades, ${stocks.length} with tickers.`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
