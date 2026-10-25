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

test('House disclosures: holdings with value ranges, PTR trades with option details', async () => {
  const { parseHouseHoldings, parseHouseTransactions, parse278eAssets, parseRange } = await import('../scripts/lib/featured.mjs');
  const annual = `F D R
S A: A "U " I
Asset Owner Value of Asset Income Type(s) Income Tx. >
$1,000?
11 Zinfandel Lane - Home & Vineyard [RP] JT $5,000,001 -
$25,000,000
Grape Sales $100,001 -
$1,000,000
L : St. Helena/Napa, CA, US
Alphabet Inc. - Class A Common Stock (GOOGL)
[OP]
SP $1,000,001 -
$5,000,000
None
D : 50 call options with a strike price of $150 and an expiration date of 1/16/26.
Apple Inc. (AAPL) [ST] SP $5,000,001 -
$25,000,000
Capital Gains,
Dividends
Over $5,000,000
S B: T`;
  const h = parseHouseHoldings(annual);
  assert.equal(h.length, 3);
  assert.deepEqual([h[0].code, h[0].owner, h[0].lo], ['RP', 'JT', 5000001]);
  assert.equal(h[1].ticker, 'GOOGL');
  assert.equal(h[1].owner, 'SP');
  assert.equal(h[1].option.strike, 150);
  assert.equal(h[2].hi, 25000000);
  const ptr = `P T R
ID Owner Asset Transaction
SP Alphabet Inc. - Class A Common
Stock (GOOGL) [OP]
P 12/30/2025 12/30/2025 $250,001 -
$500,000
F S : New
D : Purchased 20 call options with a strike price of $150 and an expiration date of 1/15/27.
SP Apple Inc. - Common Stock (AAPL)
[ST]
S (partial) 12/24/2025 12/24/2025 $5,000,001 -
$25,000,000
F S : New
D : Sold 45,000 shares.`;
  const t = parseHouseTransactions(ptr);
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].ticker, t[0].type, t[0].date, t[0].option.contracts], ['GOOGL', 'buy', '2025-12-30', 20]);
  assert.deepEqual([t[1].ticker, t[1].type, t[1].partial, t[1].lo], ['AAPL', 'sell', true, 5000001]);
  const oge = `Part 6: Other Assets and Income
#      Description                                   EIF     Value                      Income Type     Income Amount
              INVESTMENT ACCOUNT #6
12     NVIDIA CORP                                   N/A     $5,000,001 - $25,000,000   None (or less than $201)
13     U.S. BROKERAGE ACCOUNT MONEY MARKET           N/A     Over $50,000,000
Part 7: Transactions`;
  const a = parse278eAssets(oge);
  assert.equal(a.length, 2);
  assert.equal(a[0].account, 'INVESTMENT ACCOUNT #6');
  assert.equal(a[1].open, true);
  assert.equal(parseRange('None (or less than $1,001)').hi, 1000);
});

test('House PTR rows split by a page break keep their name, owner and amount', async () => {
  const { parseHouseTransactions } = await import('../scripts/lib/featured.mjs');
  const text = `S O : 150 Main Street Trust > Bank of America
International Business Machines P 06/16/2026 07/02/2026 $15,001 -
ID Owner Asset Transaction
Type
Date Notification
Date
Amount Cap.
Gains >
$200?
Corporation Common Stock (IBM)
[ST]
$50,000
F S : New
S O : Merrill Lynch Tax Efficient Core
JT LyondellBasell Industries NV S 09/23/2025 10/07/2025 $1,001 - $15,000
ID Owner Asset Transaction
Gains >
$200?
Ordinary Shares Class A (LYB) [ST]
F S : New`;
  const r = parseHouseTransactions(text);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].ticker, r[0].name.startsWith('International Business Machines'), r[0].type, r[0].lo, r[0].hi], ['IBM', true, 'buy', 15001, 50000]);
  assert.deepEqual([r[1].ticker, r[1].owner, r[1].type, r[1].date], ['LYB', 'JT', 'sell', '2025-09-23']);
});

test('OGE 278-T: lowercase yes/no notification column and row numbers', async () => {
  const { parse278T } = await import('../scripts/lib/oge278t.mjs');
  const text = `1          BLACK BELT ENERGY GAS DIST AL GAS REV PJ G SER B B/E 4.00 % Due Oct 1, 2052        purchase        2/23/2026        no $100,001 - $250,000
2          COLORADO HLTH FACS AUTH REV COMSPIRIT HLTH SER A2 B/E 5.00 % Due Aug 1, 2026        purchase        2/23/2026        no $100,001 - $250,000
3          MAIN STREET NAT GAS INC GA GAS SPLY REV C B/E 4.00 % Due Mar 1, 2050               sale            2/23/2026        yes $500,001 - $1,000,000`;
  const r = parse278T(text, { year: 2026, minDate: '2026-01-01', maxDate: '2026-05-15' });
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.no), [1, 2, 3]);
  assert.deepEqual([r[2].type, r[2].lo, r[2].late], ['S', 500001, true]);
});

test('OGE classifier: OCR-damaged municipal bonds and bank deposits are not stocks', async () => {
  const { classify } = await import('../scripts/lib/oge278t.mjs');
  assert.equal(classify('Dorchester Cnty SC Sch Dist No 004 Go Bds 2023a S.000%'), 'muni');
  assert.equal(classify('NEW YORK NY CITY MUN WTR RN AUTH WTR & SWR SYS REV FORIS SUES DATED PRIOR TO'), 'muni');
  assert.equal(classify('FIRST HORIZON BK MEMPHIS TENN OUE'), 'corporate');
  for (const s of ['APPLE INC', 'FIFTH THIRD BANCORP', 'CITY HOLDING CO', 'PUBLIC STORAGE', 'STATE STREET CORP', 'FIRST CITIZENS BANCSHARES INC DEL CL A']) assert.equal(classify(s), 'stock', s);
});

test('form API saves sign-ups, rejects bad email and says when storage is missing', async () => {
  const { onRequestPost } = await import('../functions/api/form.js');
  const q = [];
  const DB = { prepare: (s) => ({ s, bind: (...a) => ({ s, a }) }), batch: async (x) => { q.push(...x); } };
  const req = (b) => new Request('https://x/api/form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await onRequestPost({ request: req({ kind: 'newsletter', email: 'A@B.co' }), env: { DB } })).status, 200);
  assert.ok(q.some((x) => /INSERT INTO subscribers/.test(x.s) && x.a[0] === 'a@b.co'));
  assert.equal((await onRequestPost({ request: req({ kind: 'newsletter', email: 'nope' }), env: { DB } })).status, 422);
  assert.equal((await onRequestPost({ request: req({ kind: 'contact', email: 'a@b.co', name: 'A', message: 'hi' }), env: {} })).status, 503);
});

test('OGE 278-T: heading fragments do not swallow the first row of a page', async () => {
  const { parse278T } = await import('../scripts/lib/oge278t.mjs');
  const text = ['Transactions', '#      Description', 'Received Over 30', 'Days Ago', '28', 'LOWER AL GAS DIST PJ 2 REV B/E 4.00 % Due Dec 1, 2050      Purchase      1/30/2025      $50,001 - $100,000',
    '29      YES', 'NORTHERN PALM BCH CNTY IMPT DIST FL 5.00 % Due Aug 1, 2025      Purchase      1/30/2025      $100,001 - $250,000'].join('\n');
  const rows = parse278T(text, { year: 2025, minDate: '2025-01-20', maxDate: '2025-08-19' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].no, 28);
  assert.match(rows[0].desc, /^LOWER AL GAS/);
  assert.equal(rows[1].no, 29);
  assert.match(rows[1].desc, /^NORTHERN PALM/);
});

test('House PTR: a page break between the transaction line and the asset code keeps the row', async () => {
  const { parseHouseTransactions } = await import('../scripts/lib/featured.mjs');
  const text = ['JT UnitedHealth Group Incorporated', 'Common Stock (UNH) [ST]', 'S 09/23/2026 10/02/2026 $15,001 -', '$50,000', 'F S : New', 'S O : Hern Family Foundation',
    'JT Virtus Artificial Intelligence &', 'Technology Opportunities Fund', 'S 09/23/2026 10/02/2026 $15,001 -', '$50,000',
    'Filing ID #20035588', 'ID Owner Asset Transaction', 'Type', 'Date Notification', 'Date', 'Amount Cap.', 'Gains >', '$200?',
    'Common Shares of Beneficial Interest', '(AIO) [ST]', 'F S : New'].join('\n');
  const rows = parseHouseTransactions(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticker, 'UNH');
  assert.equal(rows[1].ticker, 'AIO');
  assert.equal(rows[1].type, 'sell');
  assert.equal(rows[1].hi, 50000);
});
