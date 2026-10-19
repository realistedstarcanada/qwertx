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
