#!/usr/bin/env node
// Daily market snapshot: VIX history (12 months), index closes, 10-year yield, oil and gold, plus the
// CNN Fear & Greed Index. Sources: Cboe (VIX history), Yahoo Finance (closes), with FRED/Stooq fallbacks, and CNN. Writes data/market.json.
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
  const csv = await fetchRetry(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${from}`, { headers: { 'User-Agent': BROWSER_UA } }, { tries: 1 });
  return parseFredCsv(csv);
}

/** Daily closes from Yahoo Finance's chart endpoint (unofficial, widely used). */
async function yahoo(symbol, range = '3mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const j = await fetchRetry(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }, { type: 'json', tries: 3 });
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error('no chart result');
  const ts = r.timestamp || [];
  const close = r.indicators?.quote?.[0]?.close || [];
  return ts
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: close[i] }))
    .filter((x) => typeof x.value === 'number');
}

/** Full VIX history from Cboe's public CSV (DATE,OPEN,HIGH,LOW,CLOSE). */
async function cboeVix(days) {
  const csv = await fetchRetry('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { headers: { 'User-Agent': BROWSER_UA } }, { tries: 3 });
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(','))
    .map(([d, , , , c]) => {
      const [m, dd, y] = d.split('/');
      return { date: `${y}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`, value: Number(c) };
    })
    .filter((x) => x.date >= from && Number.isFinite(x.value));
}

const firstOk = async (label, ...fns) => {
  for (const fn of fns) {
    const r = await safe(label, fn);
    if (r && r.length) return r;
  }
  return null;
};

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
  const vix = await firstOk('VIX', () => cboeVix(380), () => yahoo('^VIX', '1y'), () => fred('VIXCLS', 380));
  const [spx, ndq, dji, rut, tnx, wti, brent, gold] = await Promise.all([
    firstOk('S&P 500', () => yahoo('^GSPC'), () => fred('SP500', 40)),
    firstOk('Nasdaq', () => yahoo('^IXIC'), () => fred('NASDAQCOM', 40)),
    firstOk('Dow', () => yahoo('^DJI'), () => fred('DJIA', 40)),
    firstOk('Russell 2000', () => yahoo('^RUT'), () => stooq('^rut')),
    firstOk('10Y', () => yahoo('^TNX'), () => fred('DGS10', 40)),
    firstOk('WTI', () => yahoo('CL=F'), () => fred('DCOILWTICO', 40)),
    firstOk('Brent', () => yahoo('BZ=F'), () => fred('DCOILBRENTEU', 40)),
    firstOk('Gold', () => yahoo('GC=F'), () => stooq('xauusd')),
  ]);
  const dgs10 = tnx;
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
