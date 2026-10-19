#!/usr/bin/env node
// Generates FICTIONAL demo data in .sample/ so the site can be previewed before the first real
// SEC data run. Managers and companies here are invented. Never deploy this data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, diffQuarters } from '../scripts/lib/thirteenf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.sample');
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const companies = 'Northwind Rail:NWR,Halcyon Foods:HLF,Ardent Semiconductor:ARDS,Bluepeak Energy:BPE,Cobalt Payments:CBP,Driftwood Insurance:DWI,Ember Software:EMB,Fathom Biotech:FTHM,Granite Homes:GRH,Harbor Logistics:HBL,Ironclad Security:IRC,Juniper Health:JNP,Keystone Bank:KSB,Lumen Retail:LMR,Meridian Media:MRD,Nimbus Cloud:NMB,Orchard Beverages:ORB,Pioneer Aerospace:PNA,Quarry Materials:QRM,Redwood Pharma:RDW,Summit Telecom:SMT,Tidewater Shipping:TDW,Umbra Motors:UMB,Vantage Brokerage:VTG,Willow Consumer:WLC,Xenon Devices:XND,Yardline Sports:YDL,Zephyr Airlines:ZPA,Atlas Chemicals:ATC,Beacon REIT:BCN'
  .split(',')
  .map((s, i) => {
    const [name, ticker] = s.split(':');
    return { name, ticker, cusip: `${String(100000 + i * 7919).slice(0, 6)}10${i % 10}`, price: 20 + rnd() * 400 };
  });

const managers = [
  ['Avery Stone', 'Stonebridge Capital', 'Concentrated value'],
  ['Morgan Hale', 'Halewood Partners', 'Quality compounders'],
  ['Riley Chen', 'Lantern Asset Management', 'Deep value'],
  ['Jordan Price', 'Price Street Advisors', 'Activist'],
  ['Casey Moreau', 'Moreau Family Office', 'Macro and growth'],
  ['Taylor Okafor', 'Okafor Global', 'Opportunistic'],
  ['Sam Lindqvist', 'Nordlys Capital', 'Quality compounders'],
  ['Pending Example', 'Not Yet Filed LLC', 'Value'],
];

const mkRows = (picks) =>
  picks.map(({ c, shares, put }) => ({
    issuer: c.name.toUpperCase() + ' INC', cls: 'COM', cusip: c.cusip, value: Math.round(shares * c.price),
    shares, shType: 'SH', putCall: put ? 'PUT' : '',
  }));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data/portfolios'), { recursive: true });
const cusipMap = {};
const investors = [];
managers.forEach(([manager, firm, style], mi) => {
  const slug = manager.toLowerCase().replace(/\s+/g, '-');
  investors.push({ slug, manager, firm, style, cik: String(9000000 + mi) });
  if (mi === managers.length - 1) return; // leave one without data to show the pending state
  const n = 6 + Math.floor(rnd() * 34);
  const pool = [...companies].sort(() => rnd() - 0.5).slice(0, n + 4);
  const prev = pool.slice(0, n).map((c, k) => ({ c, shares: Math.round((1e7 / (k + 1) ** 1.3) * (0.5 + rnd())) }));
  const cur = prev
    .filter(() => rnd() > 0.12)
    .map((p) => ({ ...p, shares: rnd() > 0.5 ? Math.round(p.shares * (0.6 + rnd() * 0.9)) : p.shares }))
    .concat(pool.slice(n, n + 2 + Math.floor(rnd() * 3)).map((c) => ({ c, shares: Math.round(5e5 + rnd() * 3e6) })));
  if (mi === 4) cur.push({ c: companies[0], shares: 400000, put: true });
  const a = aggregate(mkRows(cur), '2026-08-14');
  const b = aggregate(mkRows(prev), '2026-05-15');
  const { sold, counts } = diffQuarters(a, b);
  a.holdings.forEach((h) => (h.ticker = companies.find((c) => c.cusip === h.cusip).ticker));
  sold.forEach((h) => (h.ticker = companies.find((c) => c.cusip === h.cusip).ticker));
  fs.writeFileSync(
    path.join(OUT, 'data/portfolios', `${slug}.json`),
    JSON.stringify({
      slug, entityName: firm.toUpperCase(), cik: String(9000000 + mi), period: '2026-06-30', filingDate: '2026-08-14',
      form: '13F-HR', accession: 'sample', filingUrl: 'https://www.sec.gov/', prevPeriod: '2026-03-31', prevAccession: 'sample-prev',
      prevTotalValue: b.total, totalValue: a.total, holdingsCount: a.holdings.length, counts, holdings: a.holdings, sold,
      updatedAt: new Date().toISOString(),
    }),
  );
});
companies.forEach((c) => (cusipMap[c.cusip] = { ticker: c.ticker }));
fs.writeFileSync(path.join(OUT, 'investors.json'), JSON.stringify({ investors }, null, 2));
const now = Date.now();
fs.writeFileSync(
  path.join(OUT, 'data/news.json'),
  JSON.stringify({
    updatedAt: new Date(now).toISOString(),
    items: Array.from({ length: 14 }, (_, i) => ({
      title: ['Sample headline: stocks edge higher as yields ease', 'Sample headline: chipmakers lead tech rebound', 'Sample headline: oil slips on supply outlook', 'Sample headline: central bank holds rates steady'][i % 4] + ` (${i + 1})`,
      link: 'https://example.com/', source: ['Example Wire', 'Demo Markets', 'Sample Times'][i % 3],
      published: new Date(now - i * 3.7 * 3600e3).toISOString(),
    })),
  }),
);
fs.writeFileSync(
  path.join(OUT, 'data/market.json'),
  JSON.stringify({ score: 62, rating: 'greed', previousClose: 58, previousWeek: 47, previousMonth: 39, previousYear: 55, asOf: new Date(now).toISOString(), source: 'sample' }),
);
console.log(`Sample data → .sample/ (${investors.length} fictional investors)`);
