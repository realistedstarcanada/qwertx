#!/usr/bin/env node
// Economic calendar (US and Canada) and company earnings dates. Writes data/calendar.json.
// Economic events: TradingView's public economic-calendar feed (the one behind their widget).
// Earnings: Nasdaq's public earnings calendar, one request per weekday.
// The site keeps only the events and companies that matter; this file stores a little more so the build can choose.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON, sleep } from './lib/net.mjs';
import { loadData } from '../src/lib/data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'calendar.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DAY = 864e5;
const iso = (d) => d.toISOString().slice(0, 10);
const num = (s) => {
  if (s == null) return null;
  const n = Number(String(s).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) && String(s).trim() !== '' && !/N\/A|&nbsp;/i.test(String(s)) ? n : null;
};

async function economic(from, to) {
  const url = `https://economic-calendar.tradingview.com/events?from=${from.toISOString()}&to=${to.toISOString()}&countries=US,CA`;
  const j = await fetchRetry(url, { headers: { 'User-Agent': UA, Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' } }, { type: 'json', tries: 3 });
  if (j.status !== 'ok' || !Array.isArray(j.result)) throw new Error('unexpected calendar response');
  return j.result
    .filter((e) => (e.importance ?? -1) >= 0)
    .map((e) => ({
      id: e.id, country: e.country, title: e.title, date: e.date, period: e.period || '',
      actual: e.actual ?? null, forecast: e.forecast ?? null, previous: e.previous ?? null,
      unit: e.unit || '', scale: e.scale || '', importance: e.importance, source: e.source || '',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function earningsDay(day) {
  const j = await fetchRetry(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/', 'Accept-Language': 'en-US,en;q=0.9' },
  }, { type: 'json', tries: 3 });
  const rows = j?.data?.rows || [];
  return rows
    .map((r) => ({
      date: day,
      ticker: String(r.symbol || '').trim().replace('/', '.'),
      name: String(r.name || '').trim(),
      time: r.time === 'time-pre-market' ? 'bmo' : r.time === 'time-after-hours' ? 'amc' : '',
      marketCap: num(r.marketCap),
      quarter: r.fiscalQuarterEnding || '',
      epsForecast: num(r.epsForecast),
      estimates: num(r.noOfEsts),
      lastYearEps: num(r.lastYearEPS),
      eps: num(r.eps),
      surprise: num(r.surprise),
    }))
    .filter((r) => r.ticker && ((r.marketCap || 0) >= 10e9 || tracked.has(r.ticker)));
}

// Every stock that has a page on the site, so each one can show its next earnings date.
const FUNDLIKE = /\b(ETF|ETN|FUND|TRUST|ISHARES|SPDR|INDEX|PORTFOLIO|PROSHARES|INVESCO QQQ|VANGUARD|SELECT SECTOR|ACQUISITION|SPAC|WARRANTS?|UNITS?|RIGHTS?)\b/i;
let tracked = new Set();
function trackedStocks() {
  try {
    const d = loadData({ root: ROOT, dataDir: path.join(ROOT, 'data'), configPath: path.join(ROOT, 'config', 'investors.json') });
    return [...d.stockByTicker.values()].filter((s) => s.hasPage && s.ticker && /^[A-Z][A-Z.]{0,5}$/.test(s.ticker) && !FUNDLIKE.test(s.name || ''));
  } catch (e) { console.error('could not load tracked stocks:', e.message); return []; }
}

// Nasdaq's per-company page: "Earnings announcement* for MU: Dec 17, 2026". Used for the few companies the
// calendar sweep doesn't reach (reporting more than ~3 months out, or too small for the daily lists).
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
async function symbolDate(t) {
  const j = await fetchRetry(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(t.replace('.', '/'))}/earnings-date`, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/', 'Accept-Language': 'en-US,en;q=0.9' },
  }, { type: 'json', tries: 2 });
  const text = `${j?.data?.announcement || ''} ${j?.data?.reportText || ''}`;
  const m = /:\s*([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s*(20\d\d)/.exec(text);
  if (!m || !MON[m[1]]) return null;
  return { date: `${m[3]}-${String(MON[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`, estimated: /estimat|projected|\*/i.test(text) && !/confirmed/i.test(text) };
}

async function main() {
  const prev = readJSON(OUT, {});
  const now = new Date();
  const out = { updatedAt: now.toISOString(), econ: prev.econ || [], earnings: prev.earnings || [], symbolDates: prev.symbolDates || {} };
  const stocks = trackedStocks();
  tracked = new Set(stocks.map((s) => s.ticker));
  console.log(`tracked stocks: ${tracked.size}`);

  try {
    out.econ = await economic(new Date(now - 10 * DAY), new Date(+now + 45 * DAY));
    console.log(`economic events: ${out.econ.length}`);
  } catch (e) { console.error('economic calendar failed, keeping previous:', e.message); }

  // Weekdays from ~7 weeks back (so recent results show) to ~14 weeks ahead (one full reporting cycle).
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 49 * DAY);
  const end = new Date(+now + 98 * DAY);
  const earnings = [];
  let fails = 0;
  for (let d = start; d <= end; d = new Date(+d + DAY)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    try { earnings.push(...(await earningsDay(iso(d)))); } catch (e) { fails++; console.error('earnings', iso(d), e.message); }
    await sleep(350);
  }
  if (earnings.length && fails < 10) out.earnings = earnings;
  else console.error(`earnings: ${earnings.length} rows, ${fails} failed days; keeping previous`);
  console.log(`earnings rows: ${out.earnings.length}`);

  // Companies with no upcoming date in the sweep: ask Nasdaq per company, at most once a day each.
  const today = iso(now);
  const haveNext = new Set(out.earnings.filter((r) => r.date >= today).map((r) => r.ticker));
  for (const [t, x] of Object.entries(out.symbolDates)) if (!tracked.has(t) || (x.date && x.date < today && Date.parse(x.checked) < +now - 20 * 3600e3)) delete out.symbolDates[t];
  const todo = stocks.map((s) => s.ticker).filter((t) => !haveNext.has(t) && !(out.symbolDates[t] && Date.parse(out.symbolDates[t].checked) > +now - 20 * 3600e3));
  let got = 0, miss = 0, err = 0;
  const limit = Number(process.env.SYMBOL_LIMIT || 450);
  for (const t of todo.slice(0, limit)) {
    try {
      const r = await symbolDate(t);
      out.symbolDates[t] = { ...(r || { date: null }), checked: now.toISOString() };
      if (r && r.date >= today) got++; else miss++;
    } catch (e) { err++; if (err >= 25) { console.error('per-company lookups failing, stopping:', e.message); break; } }
    await sleep(250);
  }
  console.log(`per-company dates: ${todo.length} to check, ${got} found, ${miss} without a future date, ${err} errors`);
  writeJSON(OUT, out);
}

main().catch((e) => { console.error(e); process.exit(1); });
