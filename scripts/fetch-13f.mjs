#!/usr/bin/env node
// Pulls up to 9 quarters of 13F-HR filings for every investor in config/investors.json from SEC EDGAR.
// Writes data/portfolios/<slug>.json with: latest holdings (weights, quarter-over-quarter changes,
// estimated $ flows), positions sold out, and a compact 9-quarter history for the value/stack charts.
// Quarters already stored (same accession number) are reused, so only new filings are downloaded.
//
// Usage: node scripts/fetch-13f.mjs [slug ...] [--force]
// Env:   SEC_USER_AGENT   "Your Name your@email.com" (SEC requires a contact in the User-Agent)
//        OPENFIGI_API_KEY optional, speeds up ticker lookups
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON } from './lib/net.mjs';
import { sec, pad, dirUrl } from './lib/sec.mjs';
import { mapCusips } from './lib/figi.mjs';
import { updateSectors } from './lib/sectors.mjs';
import { parseInfoTable, aggregate, diffQuarters, pickFilings } from './lib/thirteenf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const QUARTERS = 9;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

async function filingIndex(cik, acc) {
  const idx = await sec(`${dirUrl(cik, acc)}/index.json`, 'json');
  return idx?.directory?.item || [];
}

async function isRestatement(cik, filing) {
  try {
    const items = await filingIndex(cik, filing.acc);
    const primary = items.find((i) => /primary_doc\.xml$/i.test(i.name));
    if (!primary) return false;
    const xml = await sec(`${dirUrl(cik, filing.acc)}/${primary.name}`);
    return /<(?:\w+:)?amendmentType>\s*RESTATEMENT/i.test(xml);
  } catch {
    return false;
  }
}

async function infoTableRows(cik, acc) {
  const items = await filingIndex(cik, acc);
  const xmls = items
    .filter((i) => /\.xml$/i.test(i.name) && !/primary_doc/i.test(i.name))
    .sort((a, b) => (parseInt(b.size) || 0) - (parseInt(a.size) || 0));
  for (const f of xmls) {
    const rows = parseInfoTable(await sec(`${dirUrl(cik, acc)}/${f.name}`));
    if (rows.length) return rows;
  }
  return parseInfoTable(await sec(`${dirUrl(cik, acc)}/${acc}.txt`));
}

/** Heavy filers can push older 13Fs out of `filings.recent`; pull the next page(s) if needed. */
async function mergeOlderFilings(sub) {
  const r = sub?.filings?.recent;
  if (!r) return;
  for (const f of sub.filings.files || []) {
    if (r.form.filter((x) => x === '13F-HR').length >= QUARTERS + 1) break;
    try {
      const more = await sec(`https://data.sec.gov/submissions/${f.name}`, 'json');
      for (const k of ['form', 'accessionNumber', 'filingDate', 'reportDate']) r[k].push(...(more[k] || []));
    } catch (e) {
      console.warn(`  older filings page skipped: ${e.message}`);
      break;
    }
  }
}

const loadQuarter = async (cik, f) => aggregate(await infoTableRows(cik, f.acc), f.filingDate);

/** Compact history entry: total, count and weights of positions >= 0.25%, keyed by CUSIP. */
function historyEntry(f, agg) {
  const w = {};
  for (const h of agg.holdings) if (h.weight >= 0.0025) w[h.cusip] = +(((w[h.cusip] || 0) + h.weight * 100).toFixed(3));
  return { period: f.period, filingDate: f.filingDate, acc: f.acc, total: agg.total, count: agg.holdings.length, w };
}

/** Estimated dollar flow of each change, at quarter-end prices. */
function addFlows(cur, sold) {
  for (const h of cur.holdings) {
    const price = h.shares ? h.value / h.shares : 0;
    if (h.status === 'new') h.flow = h.value;
    else if (h.prevShares != null && h.status !== 'unknown') h.flow = (h.shares - h.prevShares) * price;
    else h.flow = 0;
  }
  for (const s of sold) s.flow = -s.prevValue;
}

async function run() {
  const cfg = readJSON(path.join(ROOT, 'config/investors.json'));
  const cusipFile = path.join(DATA, 'cusip-map.json');
  const cusipMap = readJSON(cusipFile, {});
  const list = cfg.investors.filter((i) => !only.length || only.includes(i.slug));
  let ok = 0;
  let failed = 0;

  for (const inv of list) {
    const outFile = path.join(DATA, 'portfolios', `${inv.slug}.json`);
    try {
      console.log(`• ${inv.manager} (${inv.firm})`);
      const sub = await sec(`https://data.sec.gov/submissions/CIK${pad(inv.cik)}.json`, 'json');
      if (inv.expect && !String(sub.name || '').toUpperCase().includes(inv.expect.toUpperCase())) {
        throw new Error(`CIK ${inv.cik} belongs to "${sub.name}", expected "${inv.expect}". Check config/investors.json.`);
      }
      await mergeOlderFilings(sub);
      const filings = await pickFilings(sub, (f) => isRestatement(inv.cik, f), QUARTERS);
      if (!filings.length) throw new Error('no 13F-HR filings found');
      const [cur, prev] = filings;
      const ageDays = (Date.now() - Date.parse(cur.period)) / 864e5;
      if (ageDays > 200) console.warn(`  ⚠ latest 13F is for ${cur.period}; this filer may have stopped filing or moved to a new CIK`);

      const existing = readJSON(outFile);
      const haveHist = new Map((existing?.history || []).map((h) => [h.acc, h]));
      const upToDate =
        !FORCE && existing && existing.accession === cur.acc && existing.prevAccession === (prev?.acc ?? null) &&
        filings.every((f) => haveHist.has(f.acc));

      if (upToDate) {
        const missing = existing.holdings.filter((h) => !h.ticker).map((h) => h.cusip);
        if (missing.length && (await mapCusips(missing, cusipMap))) {
          for (const h of [...existing.holdings, ...existing.sold]) h.ticker = cusipMap[h.cusip]?.ticker || h.ticker || null;
          writeJSON(outFile, existing);
          writeJSON(cusipFile, cusipMap);
        }
        console.log(`  unchanged (${cur.period})`);
        ok++;
        continue;
      }

      const curAgg = await loadQuarter(inv.cik, cur);
      if (!curAgg.holdings.length) throw new Error(`no holdings parsed from ${cur.acc}`);
      const prevAgg = prev ? await loadQuarter(inv.cik, prev) : null;
      const { sold, counts } = diffQuarters(curAgg, prevAgg);
      addFlows(curAgg, sold);

      const history = [];
      for (const f of filings) {
        if (f.acc === cur.acc) history.push(historyEntry(f, curAgg));
        else if (prev && f.acc === prev.acc) history.push(historyEntry(f, prevAgg));
        else if (haveHist.has(f.acc) && !FORCE) history.push(haveHist.get(f.acc));
        else {
          try {
            history.push(historyEntry(f, await loadQuarter(inv.cik, f)));
          } catch (e) {
            console.warn(`  history ${f.period} skipped: ${e.message}`);
          }
        }
      }
      history.sort((a, b) => a.period.localeCompare(b.period));

      await mapCusips([...curAgg.holdings, ...sold].map((h) => h.cusip), cusipMap);
      writeJSON(cusipFile, cusipMap);
      const tk = (h) => ({ ...h, ticker: cusipMap[h.cusip]?.ticker || null });

      writeJSON(outFile, {
        slug: inv.slug,
        entityName: sub.name,
        cik: pad(inv.cik),
        period: cur.period,
        filingDate: cur.filingDate,
        form: cur.form,
        accession: cur.acc,
        filingUrl: `${dirUrl(inv.cik, cur.acc)}/${cur.acc}-index.htm`,
        prevPeriod: prev?.period ?? null,
        prevAccession: prev?.acc ?? null,
        prevTotalValue: prevAgg?.total ?? null,
        totalValue: curAgg.total,
        holdingsCount: curAgg.holdings.length,
        counts,
        holdings: curAgg.holdings.map(tk),
        sold: sold.map(tk),
        history,
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ${cur.period}: ${curAgg.holdings.length} positions, $${(curAgg.total / 1e9).toFixed(2)}B, ${history.length} quarters of history`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${e.message}`);
    }
  }

  // Sector + company-name lookup for every ticker we hold (cached; only new tickers are fetched).
  try {
    const tickers = new Set();
    for (const f of fs.readdirSync(path.join(DATA, 'portfolios')).filter((f) => f.endsWith('.json'))) {
      const p = readJSON(path.join(DATA, 'portfolios', f));
      for (const h of [...(p?.holdings || []), ...(p?.sold || [])]) if (h.ticker) tickers.add(h.ticker);
    }
    const n = await updateSectors([...tickers], path.join(DATA, 'sectors.json'));
    console.log(`\nSectors: ${n} new tickers classified`);
  } catch (e) {
    console.warn(`Sectors skipped: ${e.message}`);
  }

  writeJSON(path.join(DATA, 'meta.json'), { ...readJSON(path.join(DATA, 'meta.json'), {}), portfoliosCheckedAt: new Date().toISOString() });
  console.log(`\nDone: ${ok} ok, ${failed} failed`);
  if (ok === 0 && failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
