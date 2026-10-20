#!/usr/bin/env node
// Economic calendar (US and Canada) and company earnings dates. Writes data/calendar.json.
// Economic events: TradingView's public economic-calendar feed (the one behind their widget).
// Earnings: Nasdaq's public earnings calendar, one request per weekday.
// The site keeps only the events and companies that matter; this file stores a little more so the build can choose.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON, sleep } from './lib/net.mjs';

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
    .filter((r) => r.ticker && (r.marketCap || 0) >= 10e9);
}

async function main() {
  const prev = readJSON(OUT, {});
  const now = new Date();
  const out = { updatedAt: now.toISOString(), econ: prev.econ || [], earnings: prev.earnings || [] };

  try {
    out.econ = await economic(new Date(now - 10 * DAY), new Date(+now + 45 * DAY));
    console.log(`economic events: ${out.econ.length}`);
  } catch (e) { console.error('economic calendar failed, keeping previous:', e.message); }

  // Weekdays from the start of this month (or a week back) to five weeks ahead.
  const start = new Date(Math.min(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1), +now - 7 * DAY));
  const end = new Date(+now + 35 * DAY);
  const earnings = [];
  let fails = 0;
  for (let d = start; d <= end; d = new Date(+d + DAY)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    try { earnings.push(...(await earningsDay(iso(d)))); } catch (e) { fails++; console.error('earnings', iso(d), e.message); }
    await sleep(350);
  }
  if (earnings.length && fails < 5) out.earnings = earnings;
  else console.error(`earnings: ${earnings.length} rows, ${fails} failed days; keeping previous`);
  console.log(`earnings rows (>$10B): ${out.earnings.length}`);
  writeJSON(OUT, out);
}

main().catch((e) => { console.error(e); process.exit(1); });
