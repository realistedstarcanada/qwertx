import fs from 'node:fs';
import path from 'node:path';
import { titleCase, slugify } from './format.mjs';

const readJSON = (f, fb = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return fb;
  }
};

export const stockSlug = (h) => (h.ticker ? slugify(h.ticker) : h.cusip.toLowerCase());

function displayName(h) {
  return titleCase(h.issuer || '') || h.cusip;
}

/** Load config + generated data and derive cross-investor views. */
export function loadData({ root, dataDir, configPath }) {
  const cfg = readJSON(configPath) || { investors: [] };
  const news = readJSON(path.join(dataDir, 'news.json'), { updatedAt: null, items: [] });
  const market = readJSON(path.join(dataDir, 'market.json'), null);

  const investors = cfg.investors.map((inv) => {
    const p = readJSON(path.join(dataDir, 'portfolios', `${inv.slug}.json`));
    if (!p) return { ...inv, portfolio: null };
    const prep = (h) => ({ ...h, name: displayName(h), slug: stockSlug(h) });
    const holdings = p.holdings.map(prep);
    const top10 = holdings.slice(0, 10).reduce((s, h) => s + h.weight, 0);
    return { ...inv, portfolio: { ...p, holdings, sold: (p.sold || []).map(prep), top10 } };
  });

  // Cross-investor stock view, keyed by CUSIP (option lines roll up into the same stock).
  const stocks = new Map();
  const touch = (h) => {
    if (!stocks.has(h.cusip)) {
      stocks.set(h.cusip, { cusip: h.cusip, ticker: h.ticker, name: h.name, slug: h.slug, holders: [], sellers: [], combinedValue: 0 });
    }
    const s = stocks.get(h.cusip);
    if (!s.ticker && h.ticker) {
      s.ticker = h.ticker;
      s.slug = h.slug;
    }
    return s;
  };
  for (const inv of investors) {
    if (!inv.portfolio) continue;
    for (const h of inv.portfolio.holdings) {
      const s = touch(h);
      s.holders.push({ inv, h });
      s.combinedValue += h.value;
    }
    for (const h of inv.portfolio.sold) touch(h).sellers.push({ inv, h });
  }
  for (const s of stocks.values()) {
    s.investorCount = new Set(s.holders.map((x) => x.inv.slug)).size;
    s.buyers = new Set(s.holders.filter((x) => x.h.status === 'new' || x.h.status === 'added').map((x) => x.inv.slug)).size;
    s.newBuyers = new Set(s.holders.filter((x) => x.h.status === 'new').map((x) => x.inv.slug)).size;
    s.reducers = new Set(s.holders.filter((x) => x.h.status === 'reduced').map((x) => x.inv.slug)).size + new Set(s.sellers.map((x) => x.inv.slug)).size;
    s.avgWeight = s.holders.reduce((a, x) => a + x.h.weight, 0) / Math.max(1, s.investorCount);
    s.holders.sort((a, b) => b.h.weight - a.h.weight);
  }
  // Slug collisions (two CUSIPs, same ticker, e.g. share classes) get the CUSIP appended.
  const bySlug = new Map();
  for (const s of stocks.values()) {
    if (bySlug.has(s.slug)) s.slug = `${s.slug}-${s.cusip.toLowerCase()}`;
    bySlug.set(s.slug, s);
  }
  const stockList = [...stocks.values()].filter((s) => s.holders.length);
  for (const inv of investors) {
    if (!inv.portfolio) continue;
    for (const h of [...inv.portfolio.holdings, ...inv.portfolio.sold]) {
      const s = stocks.get(h.cusip);
      h.slug = s.slug;
      h.hasPage = s.holders.length > 0;
    }
  }

  const live = investors.filter((i) => i.portfolio);
  const periods = live.map((i) => i.portfolio.period).sort();
  return {
    investors,
    live,
    stocks: stockList,
    stockByCusip: stocks,
    news,
    market,
    latestPeriod: periods.at(-1) || null,
    combinedValue: live.reduce((s, i) => s + i.portfolio.totalValue, 0),
    lastFiling: live.map((i) => i.portfolio.filingDate).sort().at(-1) || null,
  };
}
