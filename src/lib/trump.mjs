// President Trump's disclosed trades (OGE Form 278-T), shaped for the site.
import fs from 'node:fs';
import path from 'node:path';
import { cleanName, titleCase, quarterKey } from './format.mjs';
import { classify } from '../../scripts/lib/oge278t.mjs';

const CLASS = {
  stock: 'Individual stocks', fund: 'ETFs and funds', muni: 'Municipal bonds', corporate: 'Corporate bonds',
  treasury: 'Treasuries', preferred: 'Preferred shares',
};
const FUND_NAMES = {
  GOVT: 'iShares U.S. Treasury Bond ETF', IGOV: 'iShares International Treasury Bond ETF', VIG: 'Vanguard Dividend Appreciation ETF',
  BWX: 'SPDR Bloomberg International Treasury Bond ETF', VOO: 'Vanguard S&P 500 ETF', SPY: 'SPDR S&P 500 ETF Trust', IVV: 'iShares Core S&P 500 ETF',
  IWM: 'iShares Russell 2000 ETF', IWB: 'iShares Russell 1000 ETF', EFA: 'iShares MSCI EAFE ETF', IAU: 'iShares Gold Trust', GLD: 'SPDR Gold Shares',
  VGK: 'Vanguard FTSE Europe ETF', BSV: 'Vanguard Short-Term Bond ETF', XLC: 'Communication Services Select Sector SPDR', FCOM: 'Fidelity MSCI Communication Services ETF',
  SPHY: 'SPDR Portfolio High Yield Bond ETF', QQQ: 'Invesco QQQ Trust', XLK: 'Technology Select Sector SPDR', XLF: 'Financial Select Sector SPDR',
  XLE: 'Energy Select Sector SPDR', XLV: 'Health Care Select Sector SPDR', IMCB: 'iShares Morningstar Mid-Cap ETF', IOO: 'iShares Global 100 ETF', VTI: 'Vanguard Total Stock Market ETF',
};
const OCR_FIX = [[/\bDu[eo]\b/gi, 'Due'], [/\bB[I1l\/]E\b|\b8\/E\b/g, ''], [/\bBono\b/gi, 'Bond'], [/^[!1lI|]s[hl]?ar[eo]s\b/i, 'iShares'], [/\bE[l1]f\b/gi, 'ETF'], [/\bTr\b/g, '']];
const fix = (s) => OCR_FIX.reduce((a, [re, to]) => a.replace(re, to), s).replace(/\s{2,}/g, ' ').trim();

/** "COMMONWEALTH PA FING AUTH ... REV BIE 5.00 % Duo Jun 1 2027" -> "Commonwealth PA Fing Auth ... Rev · 5.00% · 2027" */
function bondName(desc) {
  const d = fix(desc);
  const coupon = (/(\d{1,2}\s?\.\s?\d{2,4})\s*%/.exec(d) || [])[1];
  const yr = (/(?:Due|DUE)\b[^\d]*(?:\d{1,2}\D{1,3})?(?:\d{1,2}\D{1,3})?(20\d\d|\d\d)\b/.exec(d) || [])[1];
  const issuer = d.split(/\s(?:\d{1,2}\s?\.\s?\d{2,4}\s*%|Due\b|DUE\b|SR\b|SER\b|SENIOR\b|REGS\b)/)[0].replace(/\s\d{1,3}$/, '');
  const parts = [titleCase(issuer.slice(0, 60))];
  if (coupon) parts.push(coupon.replace(/\s/g, '').replace(/0+$/, '').replace(/\.$/, '') + '%');
  if (yr) parts.push(yr.length === 2 ? '20' + yr : yr);
  return parts.join(' · ');
}

const mid = (r) => (r.lo + r.hi) / 2;
const monthLabel = (m) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', " '");

export function loadTrump(dataDir, { stockByTicker, sectors }) {
  const dir = path.join(dataDir, 'trump');
  let index;
  try { index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { return null; }
  const filings = [];
  const rows = [];
  for (const f of index.filings || []) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, f.id + '.json'), 'utf8')); } catch { continue; }
    const tx = d.transactions || [];
    filings.push({ ...f, buys: tx.filter((r) => r.type === 'P').length, sells: tx.filter((r) => r.type === 'S').length, est: tx.reduce((a, r) => a + mid(r), 0) });
    for (const r of tx) rows.push({ ...r, filing: f.id, filed: f.received || f.signed, src: f.url });
  }
  if (!rows.length) return null;
  filings.sort((a, b) => String(b.received || b.signed).localeCompare(String(a.received || a.signed)));

  // A readable name per ticker: our stock page name if we have one, otherwise the cleaned filing text.
  const nameFor = (r) => {
    if (r.tk && FUND_NAMES[r.tk]) return FUND_NAMES[r.tk];
    if (r.cls === 'muni' || r.cls === 'corporate' || r.cls === 'treasury') return bondName(r.desc);
    if (r.cls === 'fund') return titleCase(fix(r.desc));
    const s = r.tk && stockByTicker.get(r.tk);
    if (s) return s.name;
    if (r.tk && sectors[r.tk]?.name) return cleanName(sectors[r.tk].name);
    return cleanName(titleCase(r.desc.replace(/\s+(F|CL\s?[A-C]|CLASS\s+[A-C]|NEW|REIT)$/gi, '')));
  };
  for (const r of rows) {
    r.desc = r.desc.replace(/[\s:;,.\-_|]+$/, '');
    // Rows saved before the classifier learned OCR-damaged municipal bonds and bank deposits.
    if (r.cls === 'stock' && !r.tk) r.cls = classify(r.desc);
    // An unconfirmed reading above $25M is more likely an OCR slip than a real trade: count it in the $5M-$25M band.
    if (r.unverified && r.lo > 25000000) { r.lo = 5000001; r.hi = 25000000; r.capped = true; }
    r.name = nameFor(r);
    r.est = mid(r);
    r.q = quarterKey(r.date);
    r.m = r.date.slice(0, 7);
  }

  const summarize = (list) => {
    const buys = list.filter((r) => r.type === 'P');
    const sells = list.filter((r) => r.type === 'S');
    const by = new Map();
    for (const r of list) {
      if (r.type !== 'P' && r.type !== 'S') continue;
      if (r.cls !== 'stock' && r.cls !== 'fund' && r.cls !== 'preferred') continue;
      const key = r.tk || r.name.toUpperCase();
      const x = by.get(key) || { key, ticker: r.tk || null, name: r.name, cls: r.cls, buys: 0, sells: 0, buyEst: 0, sellEst: 0 };
      if (r.type === 'P') { x.buys++; x.buyEst += r.est; } else { x.sells++; x.sellEst += r.est; }
      by.set(key, x);
    }
    const names = [...by.values()].map((x) => ({ ...x, net: x.buyEst - x.sellEst, stock: x.ticker ? stockByTicker.get(x.ticker) || null : null }));
    const mix = Object.entries(CLASS).map(([k, label]) => {
      const l = list.filter((r) => r.cls === k);
      return { key: k, label, n: l.length, buyEst: l.filter((r) => r.type === 'P').reduce((a, r) => a + r.est, 0), sellEst: l.filter((r) => r.type === 'S').reduce((a, r) => a + r.est, 0) };
    }).filter((x) => x.n);
    const sectorBuys = new Map();
    for (const r of buys) {
      if (r.cls !== 'stock' || !r.tk) continue;
      const sec = sectors[r.tk]?.sector || stockByTicker.get(r.tk)?.sector;
      if (sec) sectorBuys.set(sec, (sectorBuys.get(sec) || 0) + r.est);
    }
    return {
      trades: list.length, buys: buys.length, sells: sells.length,
      buyEst: buys.reduce((a, r) => a + r.est, 0), sellEst: sells.reduce((a, r) => a + r.est, 0),
      buyLo: buys.reduce((a, r) => a + r.lo, 0), buyHi: buys.reduce((a, r) => a + r.hi, 0),
      companies: new Set(list.filter((r) => r.cls === 'stock').map((r) => r.tk || r.name)).size,
      topBought: names.filter((x) => x.buyEst > 0).sort((a, b) => b.buyEst - a.buyEst || b.buys - a.buys),
      topSold: names.filter((x) => x.sellEst > 0).sort((a, b) => b.sellEst - a.sellEst || b.sells - a.sells),
      mostTraded: names.slice().sort((a, b) => b.buys + b.sells - (a.buys + a.sells)),
      mix,
      sectors: [...sectorBuys].sort((a, b) => b[1] - a[1]),
      from: list.reduce((a, r) => (!a || r.date < a ? r.date : a), null),
      to: list.reduce((a, r) => (!a || r.date > a ? r.date : a), null),
    };
  };

  const years = [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort().reverse();
  const year = years[0];
  const ytd = summarize(rows.filter((r) => r.date.startsWith(year)));
  const quarters = [...new Set(rows.map((r) => r.q))].sort().reverse();
  const latestQ = quarters[0];
  const qLabel = (q) => `Q${q.slice(5)} ${q.slice(0, 4)}`;
  const latestFiling = filings.find((f) => f.rows) || filings[0];
  const latestRows = rows.filter((r) => r.filing === latestFiling.id);

  // Months with buys and sells, for the chart.
  const months = [...new Set(rows.filter((r) => r.date.startsWith(year)).map((r) => r.m))].sort();
  const byMonth = months.map((m) => {
    const l = rows.filter((r) => r.m === m);
    return { m, label: monthLabel(m), buyEst: l.filter((r) => r.type === 'P').reduce((a, r) => a + r.est, 0), sellEst: l.filter((r) => r.type === 'S').reduce((a, r) => a + r.est, 0), trades: l.length };
  });
  // Months in the year with no filing yet (reports lag by up to 45 days).
  const covered = new Set(months);
  const lastMonth = months.at(-1);
  const gaps = [];
  if (lastMonth) for (let i = 1; i <= Number(lastMonth.slice(5)); i++) { const m = `${year}-${String(i).padStart(2, '0')}`; if (!covered.has(m)) gaps.push(monthLabel(m)); }

  // Per ticker, for stock pages.
  const byTicker = new Map();
  for (const r of rows) {
    if (!r.tk || (r.type !== 'P' && r.type !== 'S')) continue;
    const x = byTicker.get(r.tk) || { buys: 0, sells: 0, buyEst: 0, sellEst: 0, last: null, trades: [] };
    if (r.type === 'P') { x.buys++; x.buyEst += r.est; } else { x.sells++; x.sellEst += r.est; }
    if (!x.last || r.date > x.last) x.last = r.date;
    x.trades.push(r);
    byTicker.set(r.tk, x);
  }
  for (const x of byTicker.values()) x.trades.sort((a, b) => b.date.localeCompare(a.date) || b.lo - a.lo);

  const ytdOverlap = ytd.topBought.filter((x) => x.stock && x.stock.owners > 0).slice(0, 10);

  return {
    updatedAt: index.updatedAt,
    source: index.source,
    annual: index.annual,
    filings,
    year,
    ytd,
    latestQ: { key: latestQ, label: qLabel(latestQ), ...summarize(rows.filter((r) => r.q === latestQ)) },
    latestFiling: { ...latestFiling, ...summarize(latestRows), biggest: latestRows.filter((r) => r.type).sort((a, b) => b.lo - a.lo || a.date.localeCompare(b.date)).slice(0, 15) },
    byMonth,
    gaps,
    byTicker,
    overlap: ytdOverlap,
    recent: rows.filter((r) => r.type === 'P' || r.type === 'S').sort((a, b) => b.date.localeCompare(a.date) || b.lo - a.lo).slice(0, 400),
    total: rows.length,
  };
}
