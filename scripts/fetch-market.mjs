#!/usr/bin/env node
// Daily market snapshot: VIX history (12 months), index closes, 10-year yield, oil and gold, plus the
// CNN Fear & Greed Index. Sources: FRED (St. Louis Fed), Stooq and CNN. Writes data/market.json.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'market.json');
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** FRED series as [{date, value}] (missing values dropped). */
export function parseFredCsv(csv) {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => c[1] && c[1] !== '.' && !Number.isNaN(Number(c[1])))
    .map((c) => ({ date: c[0], value: Number(c[1]) }));
}

async function fred(id, days) {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const csv = await fetchRetry(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${from}`, { headers: { 'User-Agent': BROWSER_UA } }, { tries: 3 });
  return parseFredCsv(csv);
}

async function stooq(symbol) {
  const csv = await fetchRetry(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`, { headers: { 'User-Agent': BROWSER_UA } }, { tries: 2 });
  const rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  return rows.filter((r) => r[4] && !Number.isNaN(Number(r[4]))).map((r) => ({ date: r[0], value: Number(r[4]) })).slice(-30);
}

const quote = (name, series, opts = {}) => {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const weekAgo = series[Math.max(0, series.length - 6)];
  return {
    name,
    value: last.value,
    date: last.date,
    change: (last.value - prev.value) / prev.value,
    changeAbs: last.value - prev.value,
    week: (last.value - weekAgo.value) / weekAgo.value,
    ...opts,
  };
};

async function safe(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`• ${label}: skipped (${e.message})`);
    return null;
  }
}

export async function fetchFearGreed() {
  const d = await fetchRetry(
    'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
    { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', Referer: 'https://www.cnn.com/' } },
    { type: 'json', tries: 2 },
  );
  const fg = d.fear_and_greed;
  if (!fg || typeof fg.score !== 'number') throw new Error('unexpected response');
  const r = (v) => (typeof v === 'number' ? Math.round(v) : null);
  return {
    score: r(fg.score), rating: fg.rating, previousClose: r(fg.previous_close), previousWeek: r(fg.previous_1_week),
    previousMonth: r(fg.previous_1_month), previousYear: r(fg.previous_1_year), asOf: fg.timestamp || new Date().toISOString(),
    source: 'CNN Fear & Greed Index',
  };
}

async function run() {
  const prev = readJSON(OUT, {});
  const vix = await safe('VIX', () => fred('VIXCLS', 380));
  const [spx, ndq, dji, dgs10, wti, brent, rut, gold] = await Promise.all([
    safe('S&P 500', () => fred('SP500', 40)),
    safe('Nasdaq', () => fred('NASDAQCOM', 40)),
    safe('Dow', () => fred('DJIA', 40)),
    safe('10Y', () => fred('DGS10', 40)),
    safe('WTI', () => fred('DCOILWTICO', 40)),
    safe('Brent', () => fred('DCOILBRENTEU', 40)),
    safe('Russell 2000', () => stooq('^rut')),
    safe('Gold', () => stooq('xauusd')),
  ]);
  const fearGreed = await safe('Fear & Greed', fetchFearGreed);

  const out = {
    updatedAt: new Date().toISOString(),
    fearGreed: fearGreed || prev.fearGreed || null,
    vix: vix?.length ? { dates: vix.map((x) => x.date), values: vix.map((x) => x.value), last: vix.at(-1).value, lastDate: vix.at(-1).date } : prev.vix || null,
    indexes: [quote('S&P 500', spx), quote('Nasdaq', ndq), quote('Dow 30', dji), quote('Russell 2000', rut)].filter(Boolean),
    rates: { tenYear: quote('10-year Treasury', dgs10, { unit: '%' }) },
    commodities: { wti: quote('WTI oil', wti, { unit: '$' }), brent: quote('Brent oil', brent, { unit: '$' }), gold: quote('Gold', gold, { unit: '$' }) },
  };
  if (!out.indexes.length && prev.indexes) out.indexes = prev.indexes;
  writeJSON(OUT, out);
  console.log(`• VIX ${out.vix?.last} (${out.vix?.lastDate}), ${out.indexes.length} indexes, F&G ${out.fearGreed?.score ?? '—'}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
