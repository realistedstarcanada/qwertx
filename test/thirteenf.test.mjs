import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfoTable, aggregate, diffQuarters, pickFilings, valueMultiplier } from '../scripts/lib/thirteenf.mjs';
import { parseFeed } from '../scripts/fetch-news.mjs';

// Shape mirrors a real EDGAR information table, including the ns1: prefix some filers use.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>037833100</ns1:cusip><ns1:value>2000000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>10000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
    <ns1:investmentDiscretion>DFND</ns1:investmentDiscretion>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>037833100</ns1:cusip><ns1:value>1000000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>5000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>AT&amp;T INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>00206r102</ns1:cusip><ns1:value>1,000,000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>40000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>SPDR S&amp;P 500 ETF TR</ns1:nameOfIssuer><ns1:titleOfClass>TR UNIT</ns1:titleOfClass>
    <ns1:cusip>78462F103</ns1:cusip><ns1:value>1000000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>2000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
    <ns1:putCall>Put</ns1:putCall>
  </ns1:infoTable>
</ns1:informationTable>`;

test('parses namespaced info tables and entities', () => {
  const rows = parseInfoTable(XML);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].issuer, 'AT&T INC');
  assert.equal(rows[2].cusip, '00206R102');
  assert.equal(rows[2].value, 1000000);
  assert.equal(rows[3].putCall, 'PUT');
});

test('aggregates duplicate lines and computes weights (post-2023 dollars)', () => {
  const agg = aggregate(parseInfoTable(XML), '2026-08-14');
  assert.equal(agg.total, 5000000);
  assert.equal(agg.holdings.length, 3);
  const aapl = agg.holdings[0];
  assert.equal(aapl.cusip, '037833100');
  assert.equal(aapl.shares, 15000);
  assert.equal(aapl.weight, 0.6);
  assert.ok(agg.holdings.some((h) => h.key === '78462F103:PUT'));
});

test('pre-2023 filings are in thousands', () => {
  assert.equal(valueMultiplier([], '2022-11-14'), 1000);
  const agg = aggregate(parseInfoTable(XML), '2022-11-14');
  assert.equal(agg.total, 5000000000);
});

test('detects filers that still report thousands after 2023', () => {
  const rows = [1, 2, 3].map((i) => ({ shares: 1000 * i, value: 150 * i, shType: 'SH', putCall: '' }));
  assert.equal(valueMultiplier(rows, '2025-02-14'), 1000);
});

test('quarter diff: new, added, reduced, sold', () => {
  const mk = (list) => {
    const holdings = list.map(([key, shares, value]) => ({ key, cusip: key, shares, value }));
    const total = holdings.reduce((s, h) => s + h.value, 0);
    holdings.forEach((h) => (h.weight = h.value / total));
    return { holdings, total };
  };
  const prev = mk([['A', 100, 10], ['B', 100, 10], ['C', 100, 10], ['D', 100, 10]]);
  const cur = mk([['A', 150, 15], ['B', 50, 5], ['C', 100, 10], ['E', 10, 1]]);
  const { sold, counts } = diffQuarters(cur, prev);
  assert.deepEqual(counts, { new: 1, added: 1, reduced: 1, unchanged: 1, sold: 1 });
  assert.equal(sold[0].key, 'D');
  assert.equal(cur.holdings[0].sharesChangePct, 0.5);
});

test('picks originals, and restated amendments over originals', async () => {
  const sub = {
    filings: {
      recent: {
        form: ['13F-HR/A', '13F-HR', '13F-HR', '4', '13F-HR'],
        accessionNumber: ['a3', 'a2', 'a1', 'x', 'a0'],
        filingDate: ['2026-09-01', '2026-08-14', '2026-05-15', '2026-05-01', '2026-02-14'],
        reportDate: ['2026-06-30', '2026-06-30', '2026-03-31', '', '2025-12-31'],
      },
    },
  };
  let r = await pickFilings(sub, async () => false);
  assert.deepEqual(r.map((f) => f.acc), ['a2', 'a1']);
  r = await pickFilings(sub, async () => true);
  assert.deepEqual(r.map((f) => f.acc), ['a3', 'a1']);
});

test('parses RSS with CDATA', () => {
  const rss = `<rss><channel><item><title><![CDATA[Stocks rally & bonds slip]]></title>
    <link>https://example.com/a</link><pubDate>Mon, 19 Oct 2026 13:00:00 GMT</pubDate></item>
    <item><title>No link</title></item></channel></rss>`;
  const items = parseFeed(rss, 'Test');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Stocks rally & bonds slip');
  assert.equal(items[0].published, '2026-10-19T13:00:00.000Z');
});
