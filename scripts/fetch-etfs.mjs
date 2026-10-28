#!/usr/bin/env node
// What's inside each US ETF in config/etfs.json, from its latest public SEC Form N-PORT filing (official, free).
// Funds publish N-PORT for the last month of each quarter, about 60 days later, so this is a quarterly picture.
// Writes data/etfs/<TICKER>.json = { t, name, series, period, filed, url, netAssets, count, top: [[ticker|name, pct, country]],
// countries: { US: pct, ... }, sectors: { Technology: pct, ... }, top10 }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON } from './lib/net.mjs';
import { sec, pad } from './lib/sec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/etfs');
const TOP = 60;

const tag = (xml, name) => {
  const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml);
  return m ? m[1].trim() : null;
};
const attr = (xml, name, a) => {
  const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*\\b${a}="([^"]*)"`).exec(xml);
  return m ? m[1] : null;
};
const unxml = (s) => (s == null ? s : s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));

/** Parses an N-PORT primary_doc.xml. Exported for tests. */
export function parseNport(xml) {
  const genInfo = tag(xml, 'genInfo') || '';
  const fundInfo = tag(xml, 'fundInfo') || '';
  const holdings = [];
  const re = /<(?:\w+:)?invstOrSec\b[^>]*>([\s\S]*?)<\/(?:\w+:)?invstOrSec>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const pct = Number(tag(b, 'pctVal'));
    if (!Number.isFinite(pct)) continue;
    holdings.push({
      name: unxml(tag(b, 'name')) || unxml(tag(b, 'title')) || '',
      cusip: (tag(b, 'cusip') || '').toUpperCase(),
      ticker: (attr(b, 'ticker', 'value') || '').toUpperCase() || null,
      pct,
      usd: Number(tag(b, 'valUSD')) || 0,
      asset: tag(b, 'assetCat') || attr(b, 'assetConditional', 'assetCat') || null,
      country: tag(b, 'invCountry') || null,
    });
  }
  return {
    series: tag(genInfo, 'seriesId'),
    seriesName: unxml(tag(genInfo, 'seriesName')),
    period: tag(genInfo, 'repPdDate'),
    netAssets: Number(tag(fundInfo, 'netAssets')) || null,
    holdings,
  };
}

/** Summarises parsed holdings: top N with tickers, country and sector weights, concentration. Exported for tests. */
export function summarise(parsed, { cusipMap = {}, sectors = {} } = {}) {
  const hs = parsed.holdings.filter((h) => h.pct > 0).sort((a, b) => b.pct - a.pct);
  const tick = (h) => {
    const t = h.ticker && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(h.ticker) ? h.ticker : cusipMap[h.cusip]?.ticker || null;
    return t ? t.replace(/-([A-Z])$/, '.$1') : null;
  };
  const countries = {}, secs = {};
  let total = 0;
  for (const h of hs) {
    total += h.pct;
    const c = h.country || 'Other';
    countries[c] = (countries[c] || 0) + h.pct;
    const t = tick(h);
    const s = h.asset && !/^E[CP]$/.test(h.asset) ? (h.asset === 'DBT' ? 'Bonds' : h.asset === 'STIV' ? 'Cash & other' : 'Other') : (t && sectors[t]?.sector) || 'Other';
    secs[s] = (secs[s] || 0) + h.pct;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const norm = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r1(v)]));
  return {
    period: parsed.period,
    netAssets: parsed.netAssets,
    count: hs.length,
    top: hs.slice(0, TOP).map((h) => [tick(h) || h.name.slice(0, 40), Math.round(h.pct * 100) / 100, h.country || null]),
    top10: r1(hs.slice(0, 10).reduce((a, h) => a + h.pct, 0)),
    countries: norm(countries),
    sectors: norm(secs),
    covered: r1(total),
  };
}

async function latestFiling(cik, seriesId) {
  // EDGAR accepts a series ID where a CIK goes; the Atom feed lists that series' own filings.
  const atom = await sec(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${seriesId}&type=NPORT-P&dateb=&owner=include&count=10&output=atom`);
  const entries = [...atom.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((e) => ({
    acc: (/<accession-number>([^<]+)<\/accession-number>/.exec(e[1]) || [])[1] || (/accession-number=([0-9-]+)/.exec(e[1]) || [])[1],
    date: (/<filing-date>([^<]+)<\/filing-date>/.exec(e[1]) || [])[1],
    form: (/<filing-type>([^<]+)<\/filing-type>/.exec(e[1]) || [])[1],
  })).filter((e) => e.acc && (!e.form || e.form.startsWith('NPORT-P')));
  if (!entries.length) throw new Error(`no NPORT-P filings found for ${seriesId}`);
  return entries[0];
}

async function run() {
  const cfg = readJSON(path.join(ROOT, 'config/etfs.json'), { us: {} });
  const cusipMap = readJSON(path.join(ROOT, 'data/cusip-map.json'), {});
  const sectors = readJSON(path.join(ROOT, 'data/sectors.json'), {});
  const mf = await sec('https://www.sec.gov/files/company_tickers_mf.json', 'json');
  const fi = Object.fromEntries(mf.fields.map((f, i) => [f, i]));
  const bySymbol = new Map(mf.data.map((r) => [String(r[fi.symbol]).toUpperCase(), { cik: r[fi.cik], series: r[fi.seriesId] }]));
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0;
  for (const [t, meta] of Object.entries(cfg.us || {})) {
    try {
      const id = bySymbol.get(t);
      if (!id?.series) throw new Error('not in the SEC fund list (not a 40-Act fund, so no N-PORT)');
      const prev = readJSON(path.join(OUT, `${t}.json`));
      const f = await latestFiling(id.cik, id.series);
      if (prev?.acc === f.acc) { ok++; continue; }
      const url = `https://www.sec.gov/Archives/edgar/data/${Number(id.cik)}/${f.acc.replace(/-/g, '')}/primary_doc.xml`;
      const parsed = parseNport(await sec(url));
      if (parsed.series && parsed.series !== id.series) throw new Error(`filing is for ${parsed.series}, expected ${id.series}`);
      const sum = summarise(parsed, { cusipMap, sectors });
      writeJSON(path.join(OUT, `${t}.json`), { t, name: meta.name, index: meta.index || null, series: id.series, cik: pad(id.cik), acc: f.acc, filed: f.date || null, url: url.replace('primary_doc.xml', ''), source: 'SEC Form N-PORT', ...sum });
      console.log(`  ${t}: ${sum.count} holdings as of ${sum.period}, top 10 = ${sum.top10}%`);
      ok++;
    } catch (e) {
      console.warn(`  ${t}: ${e.message}`);
    }
  }
  console.log(`ETFs: ${ok}/${Object.keys(cfg.us || {}).length} up to date`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
