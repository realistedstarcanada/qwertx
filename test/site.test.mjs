import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, money, quarterKey, titleCase } from '../src/lib/format.mjs';
import { parseHousePtrText, parseSenatePtrHtml, parseAmount, normType } from '../scripts/fetch-congress.mjs';
import { toIsoDate } from '../scripts/fetch-insiders.mjs';
import { sicToSector, normName } from '../scripts/lib/sectors.mjs';
import { parseFredCsv } from '../scripts/fetch-market.mjs';

test('company names are cleaned for display', () => {
  assert.equal(cleanName('APPLE INC'), 'Apple');
  assert.equal(cleanName('BROOKFIELD Corp /ON/'), 'Brookfield');
  assert.equal(cleanName('COCA COLA CO'), 'Coca-Cola');
  assert.equal(cleanName('Taiwan Semiconductor Manufacturing Co Ltd'), 'Taiwan Semiconductor Manufacturing');
  assert.equal(titleCase('META PLATFORMS INC'), 'Meta Platforms Inc');
});

test('money and quarter formatting match the original design', () => {
  assert.equal(money(299253556000), '$299.3B');
  assert.equal(money(934000000), '$934M');
  assert.equal(money(-1.7e9), '−$1.7B');
  assert.equal(quarterKey('2026-08-14'), '2026q3');
});

test('House PTR text: ticker, type, dates, amount and owner', () => {
  const text = `SP NVIDIA Corporation - Common Stock (NVDA) [ST] S (partial) 08/31/2026 09/14/2026 $1,001 - $15,000
F S : New
JT Chevron Corporation Common Stock (CVX) [ST] S 09/23/2026 10/02/2026 $15,001 - $50,000`;
  const rows = parseHousePtrText(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticker, 'NVDA');
  assert.equal(rows[0].type, 'sell');
  assert.equal(rows[0].partial, true);
  assert.equal(rows[0].date, '2026-08-31');
  assert.equal(rows[0].amount.low, 1001);
  assert.equal(rows[1].ticker, 'CVX');
  assert.equal(rows[1].amount.high, 50000);
});

test('Senate PTR table rows', () => {
  const html = `<table><tbody><tr><td>1</td><td>09/04/2026</td><td>Spouse</td><td><a href="#">JPM</a></td><td>JP Morgan Chase &amp; Co.</td><td>Stock</td><td>Sale (Partial)</td><td>$15,001 - $50,000</td><td>--</td></tr></tbody></table>`;
  const [r] = parseSenatePtrHtml(html);
  assert.equal(r.ticker, 'JPM');
  assert.equal(r.asset, 'JP Morgan Chase & Co.');
  assert.equal(r.type, 'sell');
  assert.equal(r.partial, true);
  assert.equal(r.amount.mid, 32500.5);
});

test('amount ranges and transaction types', () => {
  assert.equal(parseAmount('Over $50,000,000').low, 50000000);
  assert.equal(normType('Purchase'), 'buy');
  assert.equal(normType('P'), 'buy');
  assert.equal(normType('Sale (Full)'), 'sell');
  assert.equal(normType('Exchange'), 'exchange');
});

test('insider dates, sectors, name matching and FRED CSV', () => {
  assert.equal(toIsoDate('15-JUL-2026'), '2026-07-15');
  assert.equal(sicToSector(3571), 'Technology');
  assert.equal(sicToSector(6798), 'Real Estate');
  assert.equal(sicToSector(2834), 'Health Care');
  assert.equal(sicToSector(1311), 'Energy');
  assert.equal(normName('NEBIUS GROUP N.V.'), 'NEBIUS');
  assert.deepEqual(parseFredCsv('DATE,VIXCLS\n2026-10-15,16.46\n2026-10-16,.\n'), [{ date: '2026-10-15', value: 16.46 }]);
});

test('calendar: plain-English verdicts, one row per release, big earnings only', async () => {
  const { buildCalendar } = await import('../src/lib/calendar.mjs');
  const cal = {
    updatedAt: '2026-10-20T12:00:00Z',
    econ: [
      { id: '1', country: 'US', title: 'Inflation Rate YoY', date: '2026-10-14T12:30:00.000Z', period: 'Sep', actual: 3.7, forecast: 3.6, previous: 3.4, unit: '%', scale: '', importance: 1 },
      { id: '2', country: 'US', title: 'Core Inflation Rate YoY', date: '2026-10-14T12:30:00.000Z', period: 'Sep', actual: 2.6, forecast: 2.5, previous: 2.4, unit: '%', scale: '', importance: 1 },
      { id: '3', country: 'US', title: 'Fed Interest Rate Decision', date: '2026-10-28T18:00:00.000Z', period: '', actual: null, forecast: 4, previous: 4, unit: '%', scale: '', importance: 1 },
      { id: '4', country: 'US', title: 'Initial Jobless Claims', date: '2026-10-15T12:30:00.000Z', period: 'Oct/10', actual: 210, forecast: 200, previous: 198, unit: '', scale: 'K', importance: 0 },
      { id: '5', country: 'US', title: 'API Crude Oil Stock Change', date: '2026-10-21T20:30:00.000Z', period: '', actual: null, forecast: null, previous: 1, unit: '', scale: 'M', importance: 0 },
    ],
    earnings: [
      { date: '2026-10-21', ticker: 'META', name: 'Meta Platforms, Inc.', time: 'amc', marketCap: 1.8e12, epsForecast: 6.54 },
      { date: '2026-10-21', ticker: 'TINY', name: 'Tiny Co', time: 'bmo', marketCap: 12e9, epsForecast: 0.1 },
      { date: '2026-10-28', ticker: 'GOOG', name: 'Alphabet Inc.', time: 'amc', marketCap: 4e12 },
      { date: '2026-10-28', ticker: 'GOOGL', name: 'Alphabet Inc.', time: 'amc', marketCap: 4e12 },
    ],
  };
  const c = buildCalendar(cal, { now: new Date('2026-10-20T16:00:00Z') });
  const cpi = c.recent.find((e) => e.key === 'cpi');
  assert.equal(cpi.verdict.text, 'Hotter than expected');
  assert.equal(cpi.also[0].actual, '2.6%');
  assert.equal(c.recent.find((e) => e.key === 'claims').verdict.text, 'Weaker than expected');
  const fed = c.weeks.flatMap((w) => w.events).find((e) => e.key === 'fed');
  assert.equal(fed.verdict.text, 'Expected: hold at 4.00%');
  assert.equal(fed.time, '2:00 pm ET');
  assert.ok(!c.weeks.flatMap((w) => w.events).some((e) => /Crude/.test(e.title)), 'noise is filtered out');
  const tickers = c.earnings.weeks.flatMap((w) => w.days.flatMap((d) => d.items.map((r) => r.ticker)));
  assert.deepEqual(tickers.sort(), ['GOOG', 'META']);
  assert.equal(c.earnings.nextByTicker.get('META').label, 'Wed Oct 21');
});
