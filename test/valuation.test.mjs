// Market Weather long-term gauges: Shiller, Damodaran and Fed EBP parsers, the Excel reader, the 10-month trend,
// what similar CAPE readings were followed by, and the full weather build with every new source present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { shillerDate, excelMonth, parseShiller, parseDamodaran, parseEbp, parseYahooMonthly, findLinks } from '../scripts/fetch-valuation.mjs';
import { buildWeather, trendOf, capeFollowUp, verdict } from '../src/lib/weather.mjs';

const months = (startYear, n) => Array.from({ length: n }, (_, i) => `${startYear + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`);
const shillerNum = (d) => Number(`${d.slice(0, 4)}.${d.slice(5, 7)}`); // 2026.10 → 2026.1, exactly as Shiller's sheet stores it

test('Shiller dates: decimal months, October has lost its trailing zero', () => {
  assert.equal(shillerDate(1871.01), '1871-01-01');
  assert.equal(shillerDate(2026.1), '2026-10-01');
  assert.equal(shillerDate('2026.09'), '2026-09-01');
  assert.equal(shillerDate(2026.12), '2026-12-01');
  assert.equal(shillerDate('Date'), null);
  assert.equal(shillerDate(null), null);
});

test('Excel month cells: ISO strings, US dates and day-count serials', () => {
  assert.equal(excelMonth('2026-10-01'), '2026-10-01');
  assert.equal(excelMonth('2026-10-15 00:00:00'), '2026-10-01');
  assert.equal(excelMonth('10/1/2026'), '2026-10-01');
  assert.equal(excelMonth(46296), '2026-10-01'); // Excel serial for 1 Oct 2026
  assert.equal(excelMonth('S&P 500'), null);
  assert.equal(excelMonth(4.42), null);
});

function shillerSheet({ ecyAsFraction = true } = {}) {
  const ds = months(1990, 12 * 37); // 1990-01 … 2026-12
  const rows = [
    ['Stock market data used in "Irrational Exuberance"'], [], [], [], [], [],
    [null, 'S&P', 'Dividend', 'Earnings', 'Consumer', null, 'Long', 'Real'],
    ['Date', 'P', 'D', 'E', 'CPI', 'Date Fraction', 'Rate GS10', 'Real Price', 'Real Dividend', 'Real Total Return Price', 'Real Earnings', 'Real TR Scaled Earnings', 'CAPE', null, 'TR CAPE', null, 'Excess CAPE\nYield'],
  ];
  ds.forEach((d, i) => {
    const cape = 20 + i * 0.05; // slowly rising valuation
    const ecy = 4 - i * 0.008; // and a shrinking premium
    const tr = 100 * 1.005 ** i; // ~6.2% a year real
    rows.push([shillerNum(d), 1000 + i, 20, 50, 200 + i * 0.5, null, 4.5, 1000, 20, tr, 50, 50, i > ds.length - 3 ? null : cape, null, cape * 1.05, null, ecyAsFraction ? ecy / 100 : ecy]);
  });
  rows.push([null, null, null]);
  return rows;
}

test('Shiller sheet: header found by name, ECY scaled to percent, 10-year forward real return computed', () => {
  const s = parseShiller(shillerSheet());
  assert.equal(s.cape[0][0], '1990-01-01');
  assert.equal(s.cape.length, 12 * 37 - 2, 'months without a CAPE yet are skipped');
  assert.ok(Math.abs(s.ecy[0][1] - 4) < 1e-6, `ECY in percent: ${s.ecy[0][1]}`);
  assert.equal(s.fwd10[0][0], '1990-01-01');
  assert.ok(Math.abs(s.fwd10[0][1] - (1.005 ** 12 - 1) * 100) < 0.01, `forward return ${s.fwd10[0][1]}`);
  assert.equal(s.fwd10.at(-1)[0], '2016-12-01', 'no forward return without ten more years of data');
  const pct = parseShiller(shillerSheet({ ecyAsFraction: false }));
  assert.ok(Math.abs(pct.ecy[0][1] - 4) < 1e-6, 'ECY already in percent stays as is');
  assert.throws(() => parseShiller([['nothing here']]), /header row/);
});

test('Damodaran monthly ERP: title rows skipped, trailing-12-month column preferred, fractions become percent', () => {
  const rows = [
    ['Implied Equity Risk Premiums by month'],
    [],
    ['Start of month', 'S&P 500', 'T.Bond Rate', 'ERP (T12m with sustainable payout)', 'ERP (T12m)', 'ERP (Normalized)'],
  ];
  months(2008, 12 * 18 + 11).slice(8).forEach((d, i) => rows.push([i % 2 ? d : 39692 + Math.round(i * 30.44), 1200 + i, 0.04, 0.05, 0.045 - i * 0.00003, 0.05]));
  const erp = parseDamodaran(rows);
  assert.equal(erp[0][0], '2008-09-01');
  assert.ok(Math.abs(erp[0][1] - 4.5) < 1e-6, `first ${erp[0][1]}`);
  assert.equal(erp.at(-1)[0], '2026-11-01');
  assert.ok(erp.every(([, v]) => v > 3 && v < 5));
  assert.throws(() => parseDamodaran([['Year', 'Something']]), /ERP/);
});

test('Fed excess bond premium CSV: EBP in points, recession probability in percent', () => {
  const lines = ['date,gz_spread,ebp,est_prob'];
  months(1973, 600).forEach((d, i) => lines.push(`${d},${(1.5 + Math.sin(i / 9)).toFixed(4)},${(Math.sin(i / 9) * 0.5).toFixed(4)},${(0.1 + 0.05 * Math.sin(i / 9)).toFixed(4)}`));
  const e = parseEbp(lines.join('\n'));
  assert.equal(e.ebp.length, 600);
  assert.equal(e.ebp[0][0], '1973-01-01');
  assert.ok(e.prob.every(([, v]) => v >= 5 && v <= 15), 'probabilities scaled to percent');
  const us = parseEbp(['date,ebp,est_prob', ...months(2000, 30).map((d) => `${Number(d.slice(5, 7))}/1/${d.slice(0, 4)},0.1,12.5`)].join('\n'));
  assert.equal(us.ebp[0][0], '2000-01-01');
  assert.equal(us.prob[0][1], 12.5, 'already in percent');
  assert.throws(() => parseEbp('when,what\n1,2'), /header/);
});

test('Yahoo monthly bars and page links', () => {
  const ts = months(2024, 3).map((d) => Date.parse(d) / 1000);
  assert.deepEqual(parseYahooMonthly({ chart: { result: [{ timestamp: ts, indicators: { quote: [{ close: [25000.123, null, 26000] }] } }] } }), [['2024-01-01', 25000.12], ['2024-03-01', 26000]]);
  const html = '<a href="https://img1.wsimg.com/blobby/go/x/downloads/ie_data.xls?ver=17&amp;x=1">Data</a><a href="/other.pdf">x</a><a href="pc/implprem/ERPbymonth.xlsx">ERP</a>';
  assert.deepEqual(findLinks(html, 'https://shillerdata.com/', /ie_data\.xls/i), ['https://img1.wsimg.com/blobby/go/x/downloads/ie_data.xls?ver=17&x=1']);
  assert.deepEqual(findLinks(html, 'https://pages.stern.nyu.edu/~adamodar/', /ERPbymonth\.xlsx?$/i), ['https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx']);
});

test('Excel reader (sheet2json.py) turns a workbook into rows with ISO dates', (t) => {
  const probe = spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  if (probe.status !== 0) return t.skip('python3 with openpyxl not installed here');
  const file = path.join(os.tmpdir(), `qx-test-${process.pid}.xlsx`);
  const make = spawnSync('python3', ['-c', `
import openpyxl, datetime
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Notes'; ws['A1'] = 'read me'
d = wb.create_sheet('Data'); d.append(['Start of month', 'ERP (T12m)']); d.append([datetime.datetime(2026, 10, 1), 0.0442]); d.append([None, None])
wb.save('${file}')`], { encoding: 'utf8' });
  assert.equal(make.status, 0, make.stderr);
  const out = spawnSync('python3', ['scripts/lib/sheet2json.py', file], { encoding: 'utf8' });
  fs.rmSync(file, { force: true });
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.deepEqual(j.sheets, ['Notes', 'Data']);
  assert.equal(j.sheet, 'Data', 'the data sheet is picked by name');
  assert.deepEqual(j.rows, [['Start of month', 'ERP (T12m)'], ['2026-10-01', 0.0442]], 'trailing empty rows dropped');
  assert.deepEqual(parseDamodaran([...j.rows, ...months(2025, 13).map((d) => [d, 0.045])]).at(-1), ['2026-10-01', 4.42]);
});

test('10-month trend: distance from the average and how long it has held', () => {
  const up = months(2020, 30).map((d, i) => [d, 100 + i]);
  const t = trendOf(up);
  assert.ok(t.up && t.dist > 0);
  assert.equal(t.months, 21, 'above the line every month it could be measured');
  const fall = [...up, ...months(2022, 7).slice(6).map((d) => [d, 80])];
  const f = trendOf(fall);
  assert.equal(f.up, false);
  assert.equal(f.months, 1);
  assert.equal(trendOf(up.slice(0, 9)), null, 'needs ten months');
});

test('What similar CAPE readings were followed by, and the price-and-trend verdict', () => {
  const cape = months(1990, 240).map((d, i) => [d, 20 + (i % 40)]);
  const fwd = cape.map(([d], i) => [d, 10 - (i % 40) / 4]);
  const s = capeFollowUp(cape, fwd, 55);
  assert.match(s, /^In the \d+ months with a similar CAPE and a full 10-year record \(\d{4}–\d{4}\), stocks returned [−\d.]+% a year after inflation/);
  assert.equal(capeFollowUp(cape, fwd, 300), null, 'nothing comparable: say nothing');
  assert.match(verdict(95, { up: true }), /^Expensive, but still rising/);
  assert.match(verdict(95, { up: false }), /highest risk/);
  assert.match(verdict(20, { up: false }), /Patience/);
  assert.match(verdict(null, { up: true }), /valuation data for this market isn’t available/);
  assert.equal(verdict(50, null), null);
});

test('Market Weather with every long-term source: new groups, dials and verdict, no NaN', () => {
  const q = (startYear, n, f) => Array.from({ length: n }, (_, i) => [`${startYear + Math.floor(i / 4)}-${String((i % 4) * 3 + 1).padStart(2, '0')}-01`, f(i)]);
  const series = {
    us_equity: { source: 'Federal Reserve Z.1 via FRED', obs: q(1960, 266, (i) => 500000 * 1.02 ** i) },
    us_gdp_level: { source: 'BEA via FRED', obs: q(1960, 266, (i) => 500 * 1.015 ** i) },
    us_gva: { source: 'BEA via FRED', obs: q(1960, 266, (i) => 300 * 1.015 ** i) },
    us_hh_equity: { source: 'Federal Reserve Z.1 via FRED', obs: q(1952, 298, (i) => 20 + i / 10) },
    us_sp500: { source: 'S&P Dow Jones Indices via FRED', obs: months(2016, 130).map((d, i) => [d, 2000 + i * 40]), last: ['2026-11-04', 7200] },
  };
  const shillerRows = shillerSheet();
  const sh = parseShiller(shillerRows);
  const valuation = {
    shiller: { source: 'Robert Shiller, Yale University (shillerdata.com)', ...sh },
    erp: { source: 'Aswath Damodaran, NYU Stern', obs: months(2008, 218).slice(8).map((d, i) => [d, 6 - i / 100]) },
    ebp: { source: 'Federal Reserve Board', obs: months(1973, 640).map((d, i) => [d, Math.sin(i / 9) * 0.5]), prob: months(1973, 640).map((d) => [d, 14]) },
    tsx: { source: 'Yahoo Finance (S&P/TSX Composite)', obs: months(2022, 47).map((d, i) => [d, 20000 - i * 50]) },
  };
  const w = buildWeather({ macro: { series }, valuation, concentration: { top10: 36.4, period: '2026-06-30', fund: 'IVV' } });
  const titles = w.us.groups.map((g) => g.title);
  for (const t of ['Valuation', 'Stocks vs. bonds', 'Trend', 'Money', 'Economy']) assert.ok(titles.includes(t), `${t} group`);
  const cards = Object.fromEntries(w.us.groups.flatMap((g) => g.cards).map((c) => [c.id, c]));
  for (const id of ['us_cape', 'us_hh_equity', 'us_gva', 'us_buffett', 'us_ecy', 'us_erp', 'us_trend', 'us_top10', 'us_ebp', 'us_ebp_rec']) assert.ok(cards[id], `${id} card`);
  assert.match(cards.us_cape.meaning, /Higher than almost every reading since 1990/);
  assert.match(cards.us_erp.meaning, /Shiller’s measure \(\d\.\d%\) uses past profits/);
  assert.match(cards.us_buffett.meaning, /40% of their sales abroad/);
  assert.equal(cards.us_trend.value.startsWith('+'), true);
  assert.equal(cards.us_trend.date, 'Nov 4, 2026', 'trend dated by the latest close');
  assert.equal(cards.us_top10.status, 'Near record');
  const dials = Object.fromEntries(w.us.dials.map((d) => [d.q, d]));
  assert.equal(dials['Is the trend up?'].label, 'Rising');
  assert.match(dials['Are stocks expensive?'].sub, /^Shiller CAPE \d+\.\d, higher than (almost all|\d+%) of history$/);
  assert.match(w.us.verdict, /^Expensive, but still rising/);
  assert.match(w.us.summary, /the trend is rising/);
  const caDials = Object.fromEntries(w.ca.dials.map((d) => [d.q, d]));
  assert.equal(caDials['Is the trend up?'].label, 'Falling');
  assert.ok(w.ca.groups.find((g) => g.title === 'Trend').cards[0].name.includes('TSX'));
  assert.ok(!JSON.stringify(w).includes('NaN'));
  assert.ok(JSON.stringify(w).length < 60000, 'history stays out of the file the browser loads');
});
