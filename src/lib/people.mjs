// Featured politicians with full portfolios: President Trump (OGE reports) and Nancy Pelosi (House reports).
// One common shape so the cards and pages render the same way for both.
import fs from 'node:fs';
import path from 'node:path';
import { cleanName, titleCase, date } from './format.mjs';

const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const mid = (x) => (x.lo + x.hi) / 2;

const KIND_LABEL = {
  stock: 'Stock', fund: 'ETF / fund', bond: 'Corporate bond', muni: 'Municipal bond', treasury: 'US Treasury', cash: 'Cash',
  option: 'Call options', realestate: 'Real estate', private: 'Private investment', other: 'Other',
};
const MIX_LABEL = {
  stock: 'Individual stocks', fund: 'ETFs and funds', bond: 'Corporate bonds', muni: 'Municipal bonds', treasury: 'US Treasuries', cash: 'Cash and money market',
  option: 'Stock options', realestate: 'Real estate', private: 'Private businesses and partnerships', other: 'Other',
};
// House asset-type codes: https://fd.house.gov/reference/asset-type-codes.aspx
const HOUSE_KIND = { ST: 'stock', OP: 'option', RP: 'realestate', OL: 'private', AB: 'private', PS: 'private', BA: 'cash', MF: 'fund', EF: 'fund', GS: 'treasury', CS: 'bond', OT: 'other', IP: 'other' };

function mixOf(holdings) {
  const tot = holdings.reduce((a, h) => a + mid(h), 0) || 1;
  const by = new Map();
  for (const h of holdings) by.set(h.kind, (by.get(h.kind) || 0) + mid(h));
  return [...by].sort((a, b) => b[1] - a[1]).map(([k, v]) => [MIX_LABEL[k] || k, Number(((v / tot) * 100).toFixed(1)), k]);
}

function linkStock(ticker, stockByTicker) {
  const s = ticker && stockByTicker.get(ticker);
  return s && s.hasPage ? s.slug : null;
}

function tradeLeaders(trades, year, stockByTicker) {
  const by = new Map();
  for (const t of trades.filter((x) => x.date && x.date.startsWith(year))) {
    const k = t.ticker || t.name;
    const x = by.get(k) || { name: t.name, ticker: t.ticker, slug: t.slug, buyEst: 0, sellEst: 0, buys: 0, sells: 0 };
    if (t.type === 'buy') { x.buyEst += mid(t); x.buys++; } else if (t.type === 'sell') { x.sellEst += mid(t); x.sells++; }
    by.set(k, x);
  }
  const all = [...by.values()];
  return {
    topBought: all.filter((x) => x.buyEst > 0).sort((a, b) => b.buyEst - a.buyEst),
    topSold: all.filter((x) => x.sellEst > 0).sort((a, b) => b.sellEst - a.sellEst),
  };
}

function stats(trades, year) {
  const y = trades.filter((t) => t.date && t.date.startsWith(year));
  const b = y.filter((t) => t.type === 'buy'), s = y.filter((t) => t.type === 'sell');
  return { year, count: y.length, buys: b.length, sells: s.length, buyEst: b.reduce((a, t) => a + mid(t), 0), sellEst: s.reduce((a, t) => a + mid(t), 0) };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "US TREASUR NT 4.25%01/30UST NOTE DUE 01/31/30" -> "US Treasury note · 4.25% · due Jan 2030" */
function bondLabel(desc, kind) {
  const coupon = (/(\d{1,2}(?:\.\d{1,4})?)\s*%/.exec(desc) || [])[1];
  const due = /DUE\s+(\d{2})\/(\d{2})\/(\d{2,4})/i.exec(desc);
  const when = due ? `due ${MON[Number(due[1]) - 1] || ''} ${due[3].length === 2 ? '20' + due[3] : due[3]}` : '';
  const issuer = kind === 'treasury' ? 'US Treasury note' : titleCase(desc.split(/\s(?:DUE|SR|SENIOR|NOTES?|BE\/R|REG|\d{1,2}(?:\.\d+)?\s*%)\b/i)[0]).slice(0, 60);
  return [issuer, coupon ? `${Number(coupon)}%` : '', when].filter(Boolean).join(' · ');
}

function trumpPerson(trump, dataDir, stockByTicker) {
  const h = read(path.join(dataDir, 'trump/holdings.json'));
  const holdings = (h?.holdings || []).map((x) => {
    const s = x.ticker && stockByTicker.get(x.ticker);
    const name = x.kind === 'cash' ? 'Cash and money market funds' : s ? s.name : x.kind === 'stock' || x.kind === 'fund' ? cleanName(titleCase(x.desc.replace(/^SPDR SERIES TRUST STATE STREET |^ISHARES TRUST |^INVESCO EXCHANGE TRADED FUND TRUST |^VANGUARD INDEX FUNDS |^SELECT SECTOR SPDR TRUST STATE STREET /i, ''))) : x.kind === 'treasury' || x.kind === 'bond' || x.kind === 'muni' ? bondLabel(x.desc, x.kind) : titleCase(x.desc).slice(0, 90);
    return { name, ticker: x.ticker, slug: linkStock(x.ticker, stockByTicker), kind: x.kind, kindLabel: KIND_LABEL[x.kind] || x.kind, lo: x.lo, hi: x.hi, open: x.open, note: x.accounts > 1 ? `Held in ${x.accounts} accounts` : '' };
  });
  const trades = (trump?.recent || []).map((r) => ({
    date: r.date, type: r.type === 'P' ? 'buy' : 'sell', name: r.name, ticker: r.tk || null, slug: linkStock(r.tk, stockByTicker),
    kindLabel: { stock: 'Stock', fund: 'ETF / fund', muni: 'Municipal bond', corporate: 'Corporate bond', treasury: 'US Treasury', preferred: 'Preferred' }[r.cls] || 'Other',
    lo: r.lo, hi: r.hi, src: r.src, approx: r.approx || r.capped,
  }));
  const year = trump?.year || String(new Date().getUTCFullYear());
  return {
    slug: 'donald-trump', name: 'Donald J. Trump', short: 'Trump', role: 'President of the United States', party: 'R', photo: '/assets/img/people/donald-trump.jpg',
    photoCredit: 'Official portrait by Daniel Torok, The White House (public domain)',
    intro: 'The President files a yearly financial report and a periodic transaction report for trades with the Office of Government Ethics. His assets are held in a revocable trust overseen by his son Donald Trump Jr. The reports cover accounts in his name and do not say who chooses each trade.',
    tradeIntro: 'Trades from his periodic transaction reports. The President’s filings are scanned paper, so we read them with text recognition and match company names to tickers; a small share of names or dates may be off by a little.',
    holdingsNote: 'Investment accounts only. His businesses and real estate (golf clubs, hotels, Mar-a-Lago, the Trump Media stake) are reported separately and are not included here.',
    asOf: h?.year ? `31 Dec ${h.year}` : null,
    holdingsSource: h ? { label: `OGE Form 278e annual report${h.received ? `, received ${date(h.received)}` : ''}`, url: h.url } : null,
    tradesSource: trump ? { label: 'OGE Form 278-T periodic transaction reports', url: trump.filings?.[0]?.url } : null,
    filings: (trump?.filings || []).map((f) => ({ label: `Periodic transaction report · trades ${f.from ? date(f.from) : ''} to ${f.to ? date(f.to) : ''}`, filed: f.received || f.signed, url: f.url, rows: f.rows })),
    holdings,
    holdingsTotal: { lo: holdings.reduce((a, x) => a + x.lo, 0), hi: holdings.reduce((a, x) => a + x.hi, 0), count: holdings.length, stocks: holdings.filter((x) => x.kind === 'stock').length, open: holdings.some((x) => x.open) },
    mix: mixOf(holdings),
    trades,
    tradeStats: trump ? { year, count: trump.ytd.trades, buys: trump.ytd.buys, sells: trump.ytd.sells, buyEst: trump.ytd.buyEst, sellEst: trump.ytd.sellEst } : stats(trades, year),
    ...tradeLeaders(trades, year, stockByTicker),
    topBought: (trump?.ytd.topBought || []).map((x) => ({ name: x.name, ticker: x.ticker, slug: linkStock(x.ticker, stockByTicker), buyEst: x.buyEst, buys: x.buys })),
    topSold: (trump?.ytd.topSold || []).map((x) => ({ name: x.name, ticker: x.ticker, slug: linkStock(x.ticker, stockByTicker), sellEst: x.sellEst, sells: x.sells })),
    byMonth: trump?.byMonth || [],
    gaps: trump?.gaps || [],
    mixTrades: trump?.ytd.mix || [],
    latestFiled: trump?.filings?.[0] ? trump.filings[0].received || trump.filings[0].signed : null,
  };
}

function housePerson(slug, meta, dataDir, stockByTicker) {
  const d = read(path.join(dataDir, `featured/${slug}.json`));
  if (!d) return null;
  const docs = Object.entries(d.docs || {}).map(([id, x]) => ({ id, ...x }));
  const annual = docs.find((x) => x.id === d.annualDoc) || docs.filter((x) => x.kind === 'annual').sort((a, b) => String(b.filed).localeCompare(String(a.filed)))[0];
  const nameOf = (x) => {
    const s = x.ticker && stockByTicker.get(x.ticker);
    if (s) return s.name;
    return x.name.replace(/\s*\([A-Z.\-]+\)\s*$/, '').replace(/\s+-\s+(Class [A-C] )?Common Stock$/i, '').replace(/,?\s*(Class [A-C]|Common Stock)$/i, '').trim();
  };
  const holdings = (annual?.holdings || []).filter((x) => x.hi > 1000).map((x) => {
    const kind = HOUSE_KIND[x.code] || 'other';
    const o = x.option;
    return {
      name: nameOf(x), ticker: x.ticker, slug: linkStock(x.ticker, stockByTicker), kind, kindLabel: KIND_LABEL[kind] || x.code, lo: x.lo, hi: x.hi, open: x.open,
      note: o ? `${o.contracts} ${o.right} contracts, strike $${o.strike}, expire ${o.expires}` : x.owner === 'SP' ? 'Spouse' : x.owner === 'JT' ? 'Joint' : '',
    };
  }).sort((a, b) => b.lo - a.lo || b.hi - a.hi);
  const seen = new Set();
  const trades = docs.filter((x) => x.kind === 'ptr').sort((a, b) => String(b.filed).localeCompare(String(a.filed))).flatMap((doc) => doc.transactions.map((t) => ({ ...t, filed: doc.filed, src: doc.url })))
    .filter((t) => { const k = [t.date, t.ticker || t.name, t.code, t.type, t.lo].join('|'); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((t) => {
      const kind = HOUSE_KIND[t.code] || 'other';
      const o = t.option;
      let note = t.desc || '';
      if (o && /^Purchased/i.test(note)) note = `Bought ${o.contracts} ${o.right} options (the right to buy ${(o.contracts * 100).toLocaleString('en-US')} shares at $${o.strike}) expiring ${o.expires}`;
      return { date: t.date, type: t.type, partial: t.partial, name: nameOf(t), ticker: t.ticker, slug: linkStock(t.ticker, stockByTicker), kindLabel: KIND_LABEL[kind] || t.code, lo: t.lo, hi: t.hi, filed: t.filed, src: t.src, note: note.slice(0, 220) };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.lo - a.lo);
  const year = trades[0]?.date?.slice(0, 4) || String(new Date().getUTCFullYear());
  return {
    slug, ...meta,
    asOf: annual?.year ? `31 Dec ${annual.year}` : null,
    holdingsSource: annual ? { label: `House annual financial disclosure, filed ${date(annual.filed)}`, url: annual.url } : null,
    tradesSource: { label: 'House periodic transaction reports', url: trades[0]?.src },
    filings: docs.sort((a, b) => String(b.filed).localeCompare(String(a.filed))).map((x) => ({ label: x.kind === 'annual' ? `Annual report (${x.year})` : 'Periodic transaction report', filed: x.filed, url: x.url, rows: x.kind === 'annual' ? x.holdings.length : x.transactions.length })),
    holdings,
    holdingsTotal: { lo: holdings.reduce((a, x) => a + x.lo, 0), hi: holdings.reduce((a, x) => a + x.hi, 0), count: holdings.length, stocks: holdings.filter((x) => x.kind === 'stock').length, open: holdings.some((x) => x.open) },
    mix: mixOf(holdings),
    trades,
    tradeStats: stats(trades, year),
    ...tradeLeaders(trades, year, stockByTicker),
    byMonth: [],
    gaps: [],
    latestFiled: docs.filter((x) => x.kind === 'ptr').map((x) => x.filed).sort().at(-1) || null,
  };
}

export function loadPeople({ dataDir, trump, stockByTicker }) {
  const people = [];
  if (trump || read(path.join(dataDir, 'trump/holdings.json'))) people.push(trumpPerson(trump, dataDir, stockByTicker));
  const pelosi = housePerson('nancy-pelosi', {
    name: 'Nancy Pelosi', short: 'Pelosi', role: 'U.S. Representative, California · Former Speaker of the House', party: 'D', photo: '/assets/img/people/nancy-pelosi.jpg',
    photoCredit: 'Official photo by John Harrington, Office of the Speaker (public domain)',
    intro: 'Members of Congress file a yearly financial disclosure with every asset and a periodic transaction report within 45 days of each trade. Almost all of the Pelosi family’s stock trades are made by her husband, Paul Pelosi, an investor; the law requires her to report them.',
    tradeIntro: 'Trades from her periodic transaction reports, newest first. Many are call options: contracts that let the buyer purchase shares at a set price before a set date, a leveraged bet that the stock will rise.',
    holdingsNote: 'Everything on the annual report: stocks, options, real estate, private partnerships and bank accounts. Most holdings belong to her husband or are held jointly.',
  }, dataDir, stockByTicker);
  if (pelosi) people.push(pelosi);
  return people;
}
