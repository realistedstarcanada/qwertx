#!/usr/bin/env node
// Long-term valuation and credit data for Market Weather, straight from the people who publish it:
//   - Robert Shiller's monthly dataset (shillerdata.com, ie_data.xls): CAPE, Excess CAPE Yield and real total
//     returns since 1871, used for "how much am I paying?" and what similar readings were followed by.
//   - Aswath Damodaran's implied equity risk premium for the S&P 500 (NYU Stern, updated at the start of each month).
//   - The Federal Reserve Board's excess bond premium and its 12-month recession probability (Gilchrist–Zakrajšek).
//   - S&P/TSX Composite month-end closes for Canada's trend dial (Yahoo Finance while the site is internal-only).
// Excel files are read with scripts/lib/sheet2json.py (needs Python with xlrd and openpyxl; the workflow installs them).
// Writes data/valuation.json. A source that fails keeps its previous values; status says what happened on this run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, sleep, writeJSON } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/valuation.json');
const UA = { 'User-Agent': process.env.SEC_USER_AGENT || 'QWERTx admin@qwertx.com' };

const SHILLER_PAGE = 'https://shillerdata.com/';
const SHILLER_FALLBACK = 'http://www.econ.yale.edu/~shiller/data/ie_data.xls';
const DAMODARAN_PAGE = 'https://pages.stern.nyu.edu/~adamodar/';
const DAMODARAN_FILES = ['https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx', 'https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xls'];
const EBP_CSV = 'https://www.federalreserve.gov/econres/notes/feds-notes/ebp_csv.csv';
const TSX_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPTSE?range=5y&interval=1mo';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const num = (v) => (typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(String(v).replace(/[,%\s]/g, '')));
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}-01`;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** Shiller writes months as decimals: 1871.01 is January, 2026.1 is October (the trailing zero is lost). */
export function shillerDate(v) {
  const x = num(v);
  if (!Number.isFinite(x) || x < 1800 || x > 2200) return null;
  const y = Math.floor(x), m = Math.round((x - y) * 100);
  return m >= 1 && m <= 12 ? ym(y, m) : null;
}

/** Excel date cell (an ISO string from sheet2json, or a day-count serial) to the first day of its month. */
export function excelMonth(v) {
  if (typeof v === 'string') {
    const iso = v.match(/^(\d{4})-(\d{2})-\d{2}/);
    if (iso) return ym(iso[1], Number(iso[2]));
    const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (us) return ym(us[3].length === 2 ? 2000 + Number(us[3]) : us[3], Number(us[1]));
    return null;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  return null;
}

/**
 * Shiller's "Data" sheet: finds the header row by name (columns move between releases), returns monthly
 * CAPE, Excess CAPE Yield (%) and the real total return that followed over 10 years (% a year).
 */
export function parseShiller(rows) {
  const hi = rows.findIndex((r) => r && norm(r[0]) === 'date' && r.some((c) => norm(c) === 'cape'));
  if (hi < 0) throw new Error('Shiller: header row with Date and CAPE not found');
  const head = rows[hi].map(norm);
  // Some labels are spread over the rows above the header ("Real" / "Total" / "Return Price"); read them joined too.
  const joined = head.map((h, i) => norm([rows[hi - 2]?.[i], rows[hi - 1]?.[i], rows[hi][i]].filter((x) => x != null).join(' ')));
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n));
  const colLike = (re) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : joined.findIndex((h) => re.test(h)); };
  const cCape = col('cape'), cEcy = colLike(/excess cape yield/), cTr = colLike(/real total return price|real tr price/), cGs10 = colLike(/gs10/), cCpi = col('cpi');
  const cFwd = colLike(/10 year annualized stock real return/);
  const cape = [], ecy = [], tr = [], gs10 = [], cpi = [];
  for (const r of rows.slice(hi + 1)) {
    const d = shillerDate(r?.[0]);
    if (!d) continue;
    const v = num(r[cCape]);
    if (Number.isFinite(v) && v > 0) cape.push([d, r4(v)]);
    if (cEcy >= 0 && Number.isFinite(num(r[cEcy]))) ecy.push([d, num(r[cEcy])]);
    if (cTr >= 0 && Number.isFinite(num(r[cTr]))) tr.push([d, num(r[cTr])]);
    if (cGs10 >= 0 && Number.isFinite(num(r[cGs10]))) gs10.push([d, num(r[cGs10])]);
    if (cCpi >= 0 && Number.isFinite(num(r[cCpi]))) cpi.push([d, num(r[cCpi])]);
  }
  if (cape.length < 120) throw new Error(`Shiller: only ${cape.length} CAPE rows`);
  // Excess CAPE Yield is stored as a fraction in some releases and in percent in others.
  let excess = ecy;
  if (excess.length && Math.max(...excess.map((o) => Math.abs(o[1]))) < 1) excess = excess.map(([d, v]) => [d, v * 100]);
  if (!excess.length && gs10.length && cpi.length) {
    // Shiller's own definition: 1/CAPE minus (10-year Treasury yield minus inflation over the past 10 years).
    const cp = new Map(cpi), g = new Map(gs10);
    excess = cape.map(([d, v]) => {
      const y = Number(d.slice(0, 4)), back = `${y - 10}${d.slice(4)}`;
      if (!cp.has(back) || !g.has(d)) return null;
      const infl = ((cp.get(d) / cp.get(back)) ** 0.1 - 1) * 100;
      return [d, 100 / v - (g.get(d) - infl)];
    }).filter(Boolean);
  }
  const trMap = new Map(tr);
  let fwd10 = tr.map(([d, v]) => {
    const later = `${Number(d.slice(0, 4)) + 10}${d.slice(4)}`;
    return trMap.has(later) && v > 0 ? [d, r4(((trMap.get(later) / v) ** 0.1 - 1) * 100)] : null;
  }).filter(Boolean);
  if (!fwd10.length && cFwd >= 0) {
    // Shiller's own "10 Year Annualized Stock Real Return" column (a fraction), when the price column isn't found.
    fwd10 = rows.slice(hi + 1).map((r) => [shillerDate(r?.[0]), num(r?.[cFwd])]).filter(([d, v]) => d && Number.isFinite(v)).map(([d, v]) => [d, r4(Math.abs(v) < 1 ? v * 100 : v)]);
  }
  return { cape, ecy: excess.map(([d, v]) => [d, r4(v)]), fwd10, columns: { header: rows[hi].slice(0, 24), above: rows[hi - 1]?.slice(0, 24) || [], tr: cTr, fwd: cFwd, ecy: cEcy } };
}

/** Damodaran's monthly implied ERP sheet: a date column and an "ERP" column; returns [[month, %], ...]. */
export function parseDamodaran(rows, { min = 12 } = {}) {
  // The header row has an ERP column and at least one other label (title rows above it are single cells).
  const isErp = (c) => /\berp\b|risk premium/i.test(String(c ?? ''));
  const hi = rows.findIndex((r) => r && r.some(isErp) && r.filter((c) => c != null && c !== '').length >= 2);
  if (hi < 0) throw new Error('Damodaran: no ERP column header');
  const head = rows[hi].map((c) => String(c ?? ''));
  const erpCols = head.map((h, i) => (isErp(h) ? i : -1)).filter((i) => i >= 0);
  // Prefer the plain trailing-12-month estimate (his headline number) over its variants.
  const t12 = erpCols.filter((i) => /t12|trailing/i.test(head[i])).sort((a, b) => head[a].length - head[b].length);
  const cErp = t12[0] ?? erpCols[0];
  const body = rows.slice(hi + 1).filter(Boolean);
  // The date column is the one where most cells read as dates.
  let cDate = -1, best = 0;
  for (let c = 0; c < head.length; c++) {
    const n = body.filter((r) => excelMonth(r[c])).length;
    if (n > best) { best = n; cDate = c; }
  }
  if (cDate < 0) throw new Error('Damodaran: no date column');
  const by = new Map();
  for (const r of body) {
    const d = excelMonth(r[cDate]), v = num(r[cErp]);
    if (d && Number.isFinite(v)) by.set(d, v);
  }
  let out = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (out.length && Math.max(...out.map((o) => Math.abs(o[1]))) < 1) out = out.map(([d, v]) => [d, v * 100]);
  out = out.filter(([, v]) => v > 0 && v < 20).map(([d, v]) => [d, r4(v)]);
  if (out.length < min) throw new Error(`Damodaran: only ${out.length} monthly ERP values`);
  return out;
}

/** The Fed's ebp_csv.csv: date, gz_spread, ebp, est_prob. Returns monthly EBP (percentage points) and probability (%). */
export function parseEbp(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',').map(norm);
  const cDate = head.findIndex((h) => h.includes('date')), cEbp = head.indexOf('ebp'), cProb = head.findIndex((h) => h.includes('prob'));
  if (cDate < 0 || cEbp < 0) throw new Error(`EBP: unexpected header ${lines[0]}`);
  const ebp = [], prob = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const d = excelMonth(c[cDate].trim()) || (/^\d{4}-\d{2}$/.test(c[cDate].trim()) ? `${c[cDate].trim()}-01` : null);
    if (!d) continue;
    if (Number.isFinite(num(c[cEbp]))) ebp.push([d, num(c[cEbp])]);
    if (cProb >= 0 && Number.isFinite(num(c[cProb]))) prob.push([d, num(c[cProb])]);
  }
  if (ebp.length < 24) throw new Error(`EBP: only ${ebp.length} rows`);
  const pct = prob.length && Math.max(...prob.map((o) => o[1])) <= 1 ? prob.map(([d, v]) => [d, v * 100]) : prob;
  return { ebp: ebp.map(([d, v]) => [d, r4(v)]), prob: pct.map(([d, v]) => [d, r4(v)]) };
}

/** Yahoo chart JSON (interval=1mo) to [[YYYY-MM-01, close], ...]. */
export function parseYahooMonthly(json) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp || [], close = r?.indicators?.quote?.[0]?.close || [];
  const by = new Map();
  ts.forEach((t, i) => {
    if (!Number.isFinite(close[i])) return;
    const d = new Date(t * 1000);
    by.set(ym(d.getUTCFullYear(), d.getUTCMonth() + 1), Math.round(close[i] * 100) / 100);
  });
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function download(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await sleep(2000 * 2 ** i);
    }
  }
  throw last;
}

function readSheet(buf, ext, sheet) {
  const tmp = path.join(os.tmpdir(), `qx-${process.pid}-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, buf);
  try {
    const out = execFileSync('python3', [path.join(ROOT, 'scripts/lib/sheet2json.py'), tmp, ...(sheet ? [sheet] : [])], { maxBuffer: 256 * 1024 * 1024 });
    return JSON.parse(out.toString('utf8'));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Absolute links on a page whose URL matches re (HTML entities in hrefs decoded). */
export function findLinks(html, base, re) {
  const out = [];
  for (const m of String(html).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!re.test(href)) continue;
    try { out.push(new URL(href, base).href); } catch {}
  }
  return [...new Set(out)];
}

async function shiller() {
  let urls = [];
  try { urls = findLinks(await fetchRetry(SHILLER_PAGE, { headers: UA }), SHILLER_PAGE, /ie_data\.xls/i); } catch {}
  urls.push(SHILLER_FALLBACK);
  let lastErr;
  for (const url of urls) {
    try {
      const buf = await download(url);
      const sheet = readSheet(buf, '.xls', 'Data');
      return { ...parseShiller(sheet.rows), url: url.replace(/\?.*$/, '') };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function damodaran() {
  let urls = [];
  try { urls = findLinks(await fetchRetry(DAMODARAN_PAGE, { headers: UA }), DAMODARAN_PAGE, /ERPbymonth\.xlsx?$/i); } catch {}
  urls.push(...DAMODARAN_FILES);
  let lastErr;
  for (const url of [...new Set(urls)]) {
    try {
      const buf = await download(url);
      // The file may hold one sheet or one per year: read them all and merge by month.
      const book = readSheet(buf, url.endsWith('x') ? '.xlsx' : '.xls', '*');
      const by = new Map(), sheets = {};
      for (const [name, rows] of Object.entries(book.all || {})) {
        try {
          const got = parseDamodaran(rows, { min: 1 });
          got.forEach(([d, v]) => by.set(d, v));
          sheets[name] = got.length;
        } catch (e) {
          sheets[name] = `${rows.length} rows, skipped: ${e.message}`;
        }
      }
      if (process.env.QX_DEBUG_SHEETS) sheets._sample = Object.fromEntries(Object.entries(book.all || {}).map(([n, rows]) => [n, rows.slice(0, 140).map((r) => (r || []).slice(0, 9))]));
      const erp = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      if (erp.length < 12) throw new Error(`Damodaran: only ${erp.length} months across sheets ${JSON.stringify(sheets)}`);
      return { erp, url, sheets };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function run() {
  const prev = readJSON(OUT, {});
  const out = { ...prev, updatedAt: new Date().toISOString(), status: {} };
  const step = async (key, fn) => {
    try {
      const v = await fn();
      Object.assign(out, v);
      out.status[key] = { ok: true, at: out.updatedAt };
    } catch (e) {
      out.status[key] = { ok: false, at: out.updatedAt, error: String(e.message || e).slice(0, 300), lastGood: prev.status?.[key]?.ok ? prev.status[key].at : prev.status?.[key]?.lastGood || null };
    }
  };
  await step('shiller', async () => {
    const s = await shiller();
    out.status.shillerColumns = s.columns;
    return { shiller: { source: 'Robert Shiller, Yale University (shillerdata.com)', url: s.url, cape: s.cape, ecy: s.ecy, fwd10: s.fwd10 } };
  });
  await step('damodaran', async () => {
    const d = await damodaran();
    out.status.damodaranSheets = d.sheets;
    return { erp: { source: 'Aswath Damodaran, NYU Stern', url: d.url, obs: d.erp } };
  });
  await step('ebp', async () => {
    const e = parseEbp(await fetchRetry(EBP_CSV, { headers: UA }));
    return { ebp: { source: 'Federal Reserve Board (Gilchrist–Zakrajšek excess bond premium)', url: EBP_CSV, obs: e.ebp, prob: e.prob } };
  });
  await step('tsx', async () => {
    const obs = parseYahooMonthly(await fetchRetry(TSX_CHART, { headers: UA }, { type: 'json' }));
    if (obs.length < 24) throw new Error(`TSX: only ${obs.length} months`);
    return { tsx: { source: 'Yahoo Finance (S&P/TSX Composite)', obs } };
  });
  writeJSON(OUT, out);
  const s = out.status;
  console.log(`Valuation: ${Object.entries(s).filter(([, v]) => 'ok' in v).map(([k, v]) => `${k} ${v.ok ? 'ok' : `FAILED (${v.error})`}`).join(' · ')}`);
  console.log(`  CAPE ${out.shiller?.cape?.at(-1)?.join(' ') || '-'} · ECY ${out.shiller?.ecy?.at(-1)?.join(' ') || '-'} · ERP ${out.erp?.obs?.at(-1)?.join(' ') || '-'} · EBP ${out.ebp?.obs?.at(-1)?.join(' ') || '-'} · TSX ${out.tsx?.obs?.at(-1)?.join(' ') || '-'}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => { console.error(e); process.exit(1); });
}
