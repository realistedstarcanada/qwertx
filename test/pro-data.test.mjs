// QWERTx Pro six-tab data: SEC 8-K index parsing, N-PORT ETF holdings, Market Weather maths, the weekly Brief,
// and Canadian ETF tickers. Needs the JSON import hook: npm test sets it up.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { D1, assets, client } from './harness/pages.mjs';
import { parseFormIndex, eightKsFrom } from '../scripts/fetch-8k.mjs';
import { parseNport, summarise } from '../scripts/fetch-etfs.mjs';
import { monthly, parseFred, parseValet, parseStatcan } from '../scripts/fetch-macro.mjs';
import { thin, shape } from '../scripts/fetch-fmp.mjs';
import { buildWeather, recessionProbability, percentile, sahm } from '../src/lib/weather.mjs';
import { normalizeTicker } from '../server/pro.js';
import { teaser } from '../functions/api/brief.js';
import { parseDirectory } from '../scripts/fetch-tsx.mjs';

test('EDGAR daily form index: rows parsed, dates normalised', () => {
  const idx = [
    'Description:           Daily Index of EDGAR Dissemination Feed by Form Type',
    'Form Type   Company Name                                                  CIK         Date Filed  File Name',
    '---------------------------------------------------------------------------------------------------------------------------------------------',
    '8-K         NVIDIA CORP                                                   1045810     20261022    edgar/data/1045810/0001045810-26-000101.txt',
    '8-K/A       Alphabet Inc.                                                 1652044     2026-10-21  edgar/data/1652044/0001652044-26-000077.txt',
    '10-Q        META PLATFORMS, INC.                                          1326801     20261030    edgar/data/1326801/0001326801-26-000210.txt',
  ].join('\n');
  const rows = parseFormIndex(idx);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { form: '8-K', company: 'NVIDIA CORP', cik: 1045810, date: '2026-10-22', file: 'edgar/data/1045810/0001045810-26-000101.txt' });
  assert.equal(rows[1].form, '8-K/A');
  assert.equal(rows[1].date, '2026-10-21');
  assert.equal(rows[2].company, 'META PLATFORMS, INC.');
});

test('8-K items come from the submissions JSON, only inside the window', () => {
  const sub = { cik: '0001045810', filings: { recent: {
    form: ['8-K', '10-Q', '8-K/A', '8-K'],
    filingDate: ['2026-10-22', '2026-10-20', '2026-09-01', '2026-01-05'],
    accessionNumber: ['0001045810-26-000101', '0001045810-26-000100', '0001045810-26-000090', '0001045810-26-000002'],
    primaryDocument: ['nvda-8k.htm', 'q.htm', '', 'old.htm'],
    items: ['2.02,9.01', '', '5.02', '8.01'],
  } } };
  const out = eightKsFrom(sub, '2026-07-01');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].items, ['2.02', '9.01']);
  assert.equal(out[0].amend, false);
  assert.equal(out[0].url, 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000101/nvda-8k.htm');
  assert.equal(out[1].amend, true);
  assert.match(out[1].url, /0001045810-26-000090-index\.htm$/, 'falls back to the filing index page');
  assert.deepEqual(eightKsFrom({}, '2026-01-01'), []);
});

test('N-PORT holdings: parsed, ranked, tickers filled from CUSIPs, weights by country and sector', () => {
  const xml = `<?xml version="1.0"?><edgarSubmission xmlns="http://www.sec.gov/edgar/nport"><formData>
    <genInfo><seriesId>S000002839</seriesId><seriesName>Vanguard 500 Index Fund</seriesName><repPdDate>2026-06-30</repPdDate></genInfo>
    <fundInfo><netAssets>1500000000000</netAssets></fundInfo>
    <invstOrSecs>
      <invstOrSec><name>Microsoft Corp</name><cusip>594918104</cusip><identifiers><ticker value="MSFT"/></identifiers><valUSD>100</valUSD><pctVal>6.5</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>
      <invstOrSec><name>NVIDIA Corp</name><cusip>67066G104</cusip><valUSD>120</valUSD><pctVal>7.25</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>
      <invstOrSec><name>Berkshire Hathaway Inc</name><cusip>084670702</cusip><identifiers><ticker value="BRK-B"/></identifiers><valUSD>30</valUSD><pctVal>1.6</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>
      <invstOrSec><name>Cash &amp; Equivalents</name><cusip>000000000</cusip><valUSD>1</valUSD><pctVal>0.1</pctVal><assetCat>STIV</assetCat><invCountry>US</invCountry></invstOrSec>
      <invstOrSec><name>Bad row</name><cusip>X</cusip><pctVal>N/A</pctVal></invstOrSec>
    </invstOrSecs></formData></edgarSubmission>`;
  const p = parseNport(xml);
  assert.equal(p.series, 'S000002839');
  assert.equal(p.period, '2026-06-30');
  assert.equal(p.netAssets, 1.5e12);
  assert.equal(p.holdings.length, 4, 'rows without a weight are skipped');
  assert.equal(p.holdings[3].name, 'Cash & Equivalents');
  const s = summarise(p, { cusipMap: { '67066G104': { ticker: 'NVDA' } }, sectors: { NVDA: { sector: 'Technology' }, MSFT: { sector: 'Technology' }, 'BRK.B': { sector: 'Financials' } } });
  assert.deepEqual(s.top.map((h) => h[0]), ['NVDA', 'MSFT', 'BRK.B', 'Cash & Equivalents']);
  assert.equal(s.top[0][1], 7.25);
  assert.equal(s.count, 4);
  assert.equal(s.top10, 15.5);
  assert.equal(s.sectors.Technology, 13.8);
  assert.equal(s.sectors['Cash & other'], 0.1);
  assert.equal(s.countries.US, 15.5);
});

test('macro parsers keep good numbers and the last reading of each month', () => {
  assert.deepEqual(parseFred({ observations: [{ date: '2026-01-02', value: '4.1' }, { date: '2026-01-03', value: '.' }] }), [['2026-01-02', 4.1]]);
  assert.deepEqual(parseValet({ observations: [{ d: '2026-01-02', V39079: { v: '2.25' } }, { d: '2026-01-03' }] }, 'V39079'), [['2026-01-02', 2.25]]);
  assert.deepEqual(parseStatcan([{ object: { vectorDataPoint: [{ refPer: '2026-09-01', value: 6.9 }, { refPer: '2026-10-01', value: null }] } }]), [['2026-09-01', 6.9]]);
  assert.deepEqual(monthly([['2026-01-02', 1], ['2026-01-30', 2], ['2026-02-27', 3], ['2026-02-28', NaN]]), [['2026-01-30', 2], ['2026-02-27', 3]]);
});

test('Market Weather maths: NY Fed recession model, percentiles, Sahm rule', () => {
  // NY Fed probit Φ(−0.5333 − 0.633 × spread): an inverted curve (−1 pt) is about even odds, a steep one (+2 pts) is low.
  assert.ok(Math.abs(recessionProbability(-1) - 54) < 1, String(recessionProbability(-1)));
  assert.ok(Math.abs(recessionProbability(0) - 29.7) < 1, String(recessionProbability(0)));
  assert.ok(recessionProbability(2) < 5);
  assert.ok(recessionProbability(0) > recessionProbability(1));
  const obs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v, i) => [`2016-0${(i % 9) + 1}-01`, v]);
  assert.equal(Math.round(percentile(obs, 10)), 100);
  assert.ok(percentile(obs, 1) <= 10);
  const flat = Array.from({ length: 24 }, (_, i) => [`2025-${String((i % 12) + 1).padStart(2, '0')}-01`, 4]);
  assert.ok(Math.abs(sahm(flat).at(-1)[1]) < 0.01, 'steady unemployment: no signal');
  const rising = flat.map(([d], i) => [d, i < 20 ? 4 : 5]);
  assert.ok(sahm(rising).at(-1)[1] >= 0.5, 'a one-point jump triggers it');
});

test('Market Weather: honest when data is missing, built from what is there', () => {
  const empty = buildWeather({});
  assert.equal(empty.us.headline, 'Gathering data');
  assert.equal(empty.ca.headline, 'Gathering data');
  for (const d of empty.us.dials) assert.ok(d.score == null || Number.isFinite(d.score));
  const insiders = { label: 'Q3 2026', totals: { buys: 300, sells: 1000 }, previous: [{ totals: { buys: 299, sells: 1000 } }] };
  const w = buildWeather({ insiders });
  const card = w.us.groups.flatMap((g) => g.cards).find((c) => /Insider buy\/sell/.test(c.name));
  assert.ok(card, 'insider ratio card');
  assert.match(card.meaning, /300 open-market buys vs\. 1,000 sales, about the same as the quarter before/);
  assert.equal(card.status, 'Steady');
  assert.ok(!JSON.stringify(w).includes('NaN'));
});

test('licensed vendor data is thinned and shaped, prices kept honest', () => {
  const days = Array.from({ length: 800 }, (_, i) => ({ date: new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10), price: 100 + i }));
  const h = thin(days);
  assert.ok(h.length < 120, `thinned to ${h.length}`);
  assert.equal(h.at(-1)[0], days.at(-1).date, 'latest close kept');
  assert.deepEqual(thin([]), []);
  const s = shape({ quote: [{ price: 190.5, changePercentage: 1.2, timestamp: 1793059200 }], hist: days.slice(-10), target: [{ targetLow: 140, targetHigh: 300, targetConsensus: 235, targetMedian: 240 }], grades: [{ strongBuy: 20, buy: 20, hold: 12, sell: 3, strongSell: 0, consensus: 'Buy' }], earnings: [] });
  assert.equal(s.q.p, 190.5);
  assert.equal(s.an.avg, 235);
  assert.equal(s.an.sb + s.an.b, 40);
});

test('Canadian ETFs keep their Toronto listing; Canadian stocks still map to New York', () => {
  assert.equal(normalizeTicker('VEQT').ticker, 'VEQT.TO');
  assert.equal(normalizeTicker('xeqt.to').ticker, 'XEQT.TO');
  assert.equal(normalizeTicker('TSX:VFV').ticker, 'VFV.TO');
  assert.equal(normalizeTicker('VOO').ticker, 'VOO');
  assert.equal(normalizeTicker('RY.TO').ticker, 'RY');
});

test('Brief teaser skips subheadings', () => {
  assert.equal(teaser('## This week\n\nFirst real paragraph.\n\nSecond.'), 'First real paragraph.');
  assert.equal(teaser(''), '');
});

// ---------- the Brief endpoints, end to end ----------
const mail = [];
const realFetch = globalThis.fetch;
let env;
before(() => {
  if (!fs.existsSync('dist/pro/index.json')) {
    const r = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
    assert.equal(r.status, 0, 'build failed');
  }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.host === 'api.resend.com') { for (const m of [].concat(JSON.parse(init.body))) mail.push(m); return new Response('{"id":"em"}', { status: 200 }); }
    return realFetch(input, init);
  };
  env = { DB: new D1(), ASSETS: assets(), RESEND_API_KEY: 're_fake', MAIL_FROM: 'QWERTx <a@qwertx.test>', CRON_SECRET: 'c', SITE_URL: 'https://qwertx.test', ADMIN_EMAILS: 'Editor@QWERTx.test, other@qwertx.test' };
});
async function signIn(email) {
  const web = client(env);
  await web.req('POST', '/api/auth/start', { body: { email } });
  const token = /signin=([A-Za-z0-9_-]+)/.exec(mail.at(-1).text)[1];
  const r = await web.req('POST', '/api/auth/verify', { body: { token } });
  assert.equal(r.status, 200, r.text);
  return web;
}

test('the Brief: admins write and publish, free members see a teaser, votes count once', async () => {
  const editor = await signIn('editor@qwertx.test');
  const reader = await signIn('reader@example.com');
  let r = await reader.req('POST', '/api/brief', { body: { title: 'x', body: 'y', publish: true } });
  assert.equal(r.status, 403, 'only admins publish');
  r = await editor.req('POST', '/api/brief', { body: { title: 'Draft only', body: 'Not yet.', publish: false } });
  assert.equal(r.json.status, 'draft');
  r = await reader.req('GET', '/api/brief');
  assert.equal(r.json.latest, null, 'drafts are hidden');
  assert.equal(r.json.archive.length, 0);
  r = await editor.req('POST', '/api/brief', { body: { title: 'Big tech reports', body: 'Opening line.\n\n## Next week\n\nThe rest, for Pro.', tickers: 'goog, amzn, $$$', publish: true } });
  assert.equal(r.json.status, 'published');
  const id = r.json.id;
  r = await reader.req('GET', '/api/brief');
  assert.equal(r.json.latest.title, 'Big tech reports');
  assert.equal(r.json.latest.locked, true);
  assert.equal(r.json.latest.body, null, 'free members do not get the full text');
  assert.equal(r.json.latest.teaser, 'Opening line.');
  assert.deepEqual(r.json.latest.tickers, ['GOOG', 'AMZN']);
  assert.equal(r.json.latest.up, undefined, 'vote tallies are for admins');
  r = await reader.req('POST', '/api/brief-vote', { body: { id, vote: 1 } });
  assert.equal(r.status, 200, r.text);
  r = await reader.req('POST', '/api/brief-vote', { body: { id, vote: -1, question: 'What about Canada?' } });
  assert.equal(r.status, 200);
  r = await editor.req('GET', '/api/brief');
  assert.equal(r.json.admin, true);
  assert.equal(r.json.latest.body.includes('The rest, for Pro.'), true);
  assert.equal(r.json.latest.up, 0);
  assert.equal(r.json.latest.down, 1, 'one vote per member, the latest wins');
  assert.equal(r.json.archive.length, 2, 'admins also see drafts');
  r = await client(env).req('POST', '/api/brief-vote', { body: { id, vote: 1 } });
  assert.equal(r.status, 401);
});

test('price paid per share is optional, kept only with a size, and cleared with it', async () => {
  const web = await signIn('holder@example.com');
  let r = await web.req('POST', '/api/watchlist', { body: { items: [{ ticker: 'NVDA', shares: '10', paid: '$1,20.50' }, { ticker: 'META', paid: '500' }] } });
  assert.equal(r.status, 200, r.text);
  const by = (j) => Object.fromEntries(j.watchlist.map((w) => [w.ticker, w]));
  assert.equal(by(r.json).NVDA.paid, 120.5);
  assert.equal(by(r.json).META.paid, null, 'no size, no price paid');
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'META', amount: '8000', paid: '612.3' } });
  assert.equal(by(r.json).META.amount, 8000);
  assert.equal(by(r.json).META.paid, 612.3);
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'META', paid: '612.3' } });
  assert.equal(by(r.json).META.amount, null);
  assert.equal(by(r.json).META.paid, null, 'removing the size removes the price paid');
});

test('TSX directory: every listing and share class, written as SYMBOL.TO', () => {
  const list = parseDirectory({ results: [
    { symbol: 'CGL', name: 'iShares Gold Bullion ETF', instruments: [{ symbol: 'CGL', name: 'iShares Gold Bullion ETF' }, { symbol: 'CGL.C', name: 'iShares Gold Bullion ETF (non-hedged)' }] },
    { symbol: 'BIP.UN', name: 'Brookfield Infrastructure Partners L.P.' },
    { symbol: 'bad symbol!', name: 'x' },
  ] });
  assert.deepEqual(list, { 'CGL.TO': 'iShares Gold Bullion ETF', 'CGL-C.TO': 'iShares Gold Bullion ETF (non-hedged)', 'BIP-UN.TO': 'Brookfield Infrastructure Partners L.P.' });
  assert.deepEqual(parseDirectory(null), {});
});

test('Yahoo test feed: quoteSummary and chart responses become the vendor shape', async () => {
  const { shapeYahoo, chartCloses, yahooSymbol } = await import('../scripts/fetch-yahoo.mjs');
  assert.equal(yahooSymbol('BRK.B'), 'BRK-B');
  assert.equal(yahooSymbol('BIP-UN.TO'), 'BIP-UN.TO');
  const closes = chartCloses({ chart: { result: [{ timestamp: [1760000000, 1760600000, 1761200000], indicators: { quote: [{ close: [180.1, null, 190.5] }] } }] } });
  assert.equal(closes.length, 2, 'missing closes dropped');
  const out = shapeYahoo({
    price: { regularMarketPrice: { raw: 190.5, fmt: '190.50' }, regularMarketChangePercent: { raw: 0.0123, fmt: '1.23%' }, currency: 'USD', regularMarketTime: { raw: 1761595200 }, longName: 'NVIDIA Corporation' },
    financialData: { targetLowPrice: { raw: 140 }, targetHighPrice: { raw: 300 }, targetMeanPrice: { raw: 235.2 }, targetMedianPrice: { raw: 240 }, numberOfAnalystOpinions: { raw: 55 }, recommendationKey: 'strong_buy' },
    recommendationTrend: { trend: [{ period: '0m', strongBuy: 20, buy: 25, hold: 8, sell: 2, strongSell: 0 }, { period: '-1m', strongBuy: 1 }] },
    earningsHistory: { history: [{ quarter: { raw: 1751241600, fmt: '2025-06-30' }, epsActual: { raw: 1.05 }, epsEstimate: { raw: 1.01 } }, { quarter: { fmt: '2025-09-30' }, epsActual: {} }] },
  }, closes);
  assert.equal(out.n, 'NVIDIA Corporation');
  assert.deepEqual(out.q, { p: 190.5, chg: 1.23, d: '2025-10-27', cur: 'USD' });
  assert.equal(out.an.avg, 235.2);
  assert.equal(out.an.sb + out.an.b + out.an.h + out.an.s, 55);
  assert.deepEqual(out.er, [{ d: '2025-06-30', a: 1.05, e: 1.01 }]);
  assert.equal(shapeYahoo(null).q, null);
  assert.equal(shapeYahoo({ price: { regularMarketPrice: 10 }, financialData: { targetMeanPrice: { raw: 12 } } }).an, null, 'no analysts, no targets');
});

test('holdings remember the currency they were typed in; Toronto tickers default to CAD', async () => {
  const web = await signIn('loonie@example.com');
  let r = await web.req('POST', '/api/watchlist', { body: { items: [{ ticker: 'RY.TO', shares: 40, paid: 135 }, { ticker: 'NVDA', shares: 10, paid: 120, cur: 'C$' }, { ticker: 'AAPL', amount: 5000 }] } });
  const by = (j) => Object.fromEntries(j.watchlist.map((w) => [w.ticker, w]));
  assert.equal(by(r.json).RY.cur, 'CAD', 'bought on the TSX, so Canadian dollars');
  assert.equal(by(r.json).NVDA.cur, 'CAD');
  assert.equal(by(r.json).AAPL.cur, null, 'otherwise the stock’s own currency');
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'AAPL', amount: 5000, cur: 'usd' } });
  assert.equal(by(r.json).AAPL.cur, 'USD');
  r = await web.req('POST', '/api/prefs', { body: { currency: 'CAD' } });
  assert.equal(r.json.prefs.currency, 'CAD', 'free members can pick the display currency');
  r = await web.req('POST', '/api/prefs', { body: { currency: 'EUR' } });
  assert.equal(r.json.prefs.currency, null);
});

test('SEC ID finder: reads EDGAR search hits and scores name matches', async () => {
  const { ciksFromSearch, nameScore } = await import('../scripts/resolve-ciks.mjs');
  const hits = { hits: { hits: [{ _source: { ciks: ['0001061768'], display_names: ['BAUPOST GROUP LLC/MA  (CIK 0001061768)'] } }, { _source: { ciks: ['0001061768'], display_names: ['BAUPOST GROUP LLC/MA  (CIK 0001061768)'] } }] } };
  assert.deepEqual(ciksFromSearch(hits), [{ cik: '0001061768', name: 'BAUPOST GROUP LLC/MA' }]);
  assert.deepEqual(ciksFromSearch(null), []);
  assert.equal(nameScore('Coatue Management', 'COATUE MANAGEMENT LLC'), 1);
  assert.equal(nameScore('Citadel Advisors', 'CITADEL ADVISORS LLC'), 1);
  assert.ok(nameScore('Jana Partners', 'JANUS HENDERSON GROUP PLC') < 0.5);
});
