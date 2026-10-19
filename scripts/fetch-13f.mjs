#!/usr/bin/env node
// Pulls the latest two 13F-HR filings for every investor in config/investors.json from SEC EDGAR,
// computes holdings, weights and quarter-over-quarter changes, and writes data/portfolios/<slug>.json.
//
// Usage: node scripts/fetch-13f.mjs [slug ...] [--force]
// Env:   SEC_USER_AGENT   "Your Name your@email.com" (SEC requires a contact in the User-Agent)
//        OPENFIGI_API_KEY optional, speeds up ticker lookups
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON } from './lib/net.mjs';
import { mapCusips } from './lib/figi.mjs';
import { parseInfoTable, aggregate, diffQuarters, pickFilings } from './lib/thirteenf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const UA = process.env.SEC_USER_AGENT || 'QWERTx admin@qwertx.com';
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const sec = (url, type = 'text') =>
  fetchRetry(url, { headers: { 'User-Agent': UA } }, { type, minGapMs: 150 }); // SEC limit is 10 req/s

const pad = (cik) => String(cik).replace(/\D/g, '').padStart(10, '0');
const dirUrl = (cik, acc) => `https://www.sec.gov/Archives/edgar/data/${Number(pad(cik))}/${acc.replace(/-/g, '')}`;

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
  // Fallback: the complete submission text file contains every document.
  return parseInfoTable(await sec(`${dirUrl(cik, acc)}/${acc}.txt`));
}

function enrich(h, cusipMap) {
  const m = cusipMap[h.cusip];
  return { ...h, ticker: m?.ticker || null };
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
      const filings = await pickFilings(sub, (f) => isRestatement(inv.cik, f));
      if (!filings.length) throw new Error('no 13F-HR filings found');
      const [cur, prev] = filings;
      const ageDays = (Date.now() - Date.parse(cur.period)) / 864e5;
      if (ageDays > 200) console.warn(`  ⚠ latest 13F is for ${cur.period}; this filer may have stopped filing or moved to a new CIK`);

      const existing = readJSON(outFile);
      if (!FORCE && existing && existing.accession === cur.acc && existing.prevAccession === (prev?.acc ?? null)) {
        // Same filings as last time. Still backfill tickers that failed to map before.
        const missing = existing.holdings.filter((h) => !h.ticker).map((h) => h.cusip);
        if (missing.length && (await mapCusips(missing, cusipMap))) {
          existing.holdings = existing.holdings.map((h) => enrich(h, cusipMap));
          existing.sold = existing.sold.map((h) => enrich(h, cusipMap));
          writeJSON(outFile, existing);
          writeJSON(cusipFile, cusipMap);
        }
        console.log(`  unchanged (${cur.period})`);
        ok++;
        continue;
      }

      const curAgg = aggregate(await infoTableRows(inv.cik, cur.acc), cur.filingDate);
      if (!curAgg.holdings.length) throw new Error(`no holdings parsed from ${cur.acc}`);
      const prevAgg = prev ? aggregate(await infoTableRows(inv.cik, prev.acc), prev.filingDate) : null;
      const { sold, counts } = diffQuarters(curAgg, prevAgg);

      await mapCusips([...curAgg.holdings, ...sold].map((h) => h.cusip), cusipMap);
      writeJSON(cusipFile, cusipMap);

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
        holdings: curAgg.holdings.map((h) => enrich(h, cusipMap)),
        sold: sold.map((h) => enrich(h, cusipMap)),
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ${cur.period}: ${curAgg.holdings.length} positions, $${(curAgg.total / 1e9).toFixed(2)}B`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${e.message}`);
    }
  }

  writeJSON(path.join(DATA, 'meta.json'), { ...readJSON(path.join(DATA, 'meta.json'), {}), portfoliosCheckedAt: new Date().toISOString() });
  console.log(`\nDone: ${ok} ok, ${failed} failed`);
  if (ok === 0 && failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
