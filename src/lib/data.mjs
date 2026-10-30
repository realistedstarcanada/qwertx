// Loads config/ + data/ and derives everything the pages need: per-investor metrics, cross-investor
// stock views, smart-money aggregates, similarity scores, politician and insider summaries.
import fs from 'node:fs';
import path from 'node:path';
import { cleanName, classSuffix, quarter, slugify, quarterKey } from './format.mjs';
import { loadTrump } from './trump.mjs';
import { buildCalendar } from './calendar.mjs';
import { loadPeople } from './people.mjs';

const readJSON = (f, fb = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return fb;
  }
};

const ACT = { new: 'New', added: 'Add', reduced: 'Trim', unchanged: 'Hold', unknown: 'Hold' };
const ACT_LABEL = { New: 'New position', Add: 'Added shares', Trim: 'Trimmed shares', Hold: 'No change in shares' };

export function convictionLabel(top10) {
  return top10 >= 85 ? 'Very high' : top10 >= 65 ? 'High' : top10 >= 45 ? 'Moderate' : 'Diversified';
}

export function loadData({ root, dataDir, configPath }) {
  const cfg = readJSON(configPath) || { investors: [] };
  const sectors = readJSON(path.join(dataDir, 'sectors.json'), {});
  const market = readJSON(path.join(dataDir, 'market.json'), {});
  const news = readJSON(path.join(dataDir, 'news.json'), { updatedAt: null, items: [] });
  const weekly = readJSON(path.join(root, 'content', 'weekly.json'), { moving: [], trending: [] });
  const congress = readJSON(path.join(dataDir, 'congress', 'trades.json'), { trades: [] });
  const insiderFiles = fs.existsSync(path.join(dataDir, 'insiders'))
    ? fs.readdirSync(path.join(dataDir, 'insiders')).filter((f) => /^\d{4}q[1-4]\.json$/.test(f)).sort().reverse()
    : [];
  const insiders = insiderFiles.map((f) => readJSON(path.join(dataDir, 'insiders', f))).filter(Boolean);

  // ---------- Investors ----------
  // Issuers held in more than one share class anywhere (GOOG/GOOGL, BRK.A/BRK.B) get a class label.
  const classes = new Map();
  for (const inv of cfg.investors) {
    const p = readJSON(path.join(dataDir, 'portfolios', `${inv.slug}.json`));
    for (const h of p?.holdings || []) {
      if (h.putCall || h.shType === 'PRN') continue;
      const k = h.cusip.slice(0, 6);
      if (!classes.has(k)) classes.set(k, new Set());
      classes.get(k).add(h.cusip);
    }
  }
  // ETF names from config/etfs.json: 13F filings name the trust ("iShares Tr"), not the fund.
  const etfCfg = readJSON(path.join(root, 'config', 'etfs.json'), { us: {} });
  const etfNames = Object.fromEntries(Object.entries(etfCfg.us || {}).map(([t, v]) => [t, v.name]));
  const nameFor = (h) => {
    const s = h.ticker && sectors[h.ticker];
    const base = (h.ticker && etfNames[h.ticker]) || cleanName((s && s.name) || h.issuer || h.cusip);
    if (h.putCall) return `${base} (${h.putCall === 'CALL' ? 'call options' : 'put options'})`;
    return base + ((classes.get(h.cusip.slice(0, 6))?.size || 0) > 1 ? classSuffix(h.cls) : '');
  };
  const sectorFor = (h) => {
    if (h.shType === 'PRN') return 'Bonds & notes';
    return (h.ticker && sectors[h.ticker]?.sector) || 'Other';
  };
  const issuerKey = (h) => h.cusip.slice(0, 6);

  const investors = cfg.investors.map((inv) => {
    const p = readJSON(path.join(dataDir, 'portfolios', `${inv.slug}.json`));
    if (!p) return { ...inv, p: null };
    const total = p.totalValue;
    const holdings = p.holdings.map((h, i) => {
      const act = ACT[h.status] || 'Hold';
      return {
        ...h,
        rank: i + 1,
        name: nameFor(h),
        label: h.ticker || nameFor(h).split(' ')[0],
        sector: sectorFor(h),
        w: h.weight * 100,
        act,
        actLabel: h.status === 'added' || h.status === 'reduced' ? `${act === 'Add' ? 'Added' : 'Trimmed'} ${Math.abs((h.sharesChangePct || 0) * 100).toFixed(0)}% of shares` : ACT_LABEL[act],
        issuer: issuerKey(h),
      };
    });
    const sold = (p.sold || []).map((h) => ({ ...h, name: nameFor(h), label: h.ticker || nameFor(h).split(' ')[0], issuer: issuerKey(h) }));
    const ws = holdings.map((h) => h.weight);
    const top10 = ws.slice(0, 10).reduce((a, b) => a + b, 0) * 100;
    const effN = 1 / ws.reduce((a, w) => a + w * w, 0);
    const buys = holdings.filter((h) => (h.flow || 0) > 0).reduce((a, h) => a + h.flow, 0);
    const sells = -[...holdings.filter((h) => (h.flow || 0) < 0), ...sold].reduce((a, h) => a + (h.flow || 0), 0);
    const avgVal = p.prevTotalValue ? (total + p.prevTotalValue) / 2 : total;
    const turnover = p.prevTotalValue ? (Math.min(buys, sells) / avgVal) * 100 : null;

    // Sector allocation
    const secMap = new Map();
    for (const h of holdings) secMap.set(h.sector, (secMap.get(h.sector) || 0) + h.w);
    let secItems = [...secMap.entries()].sort((a, b) => b[1] - a[1]);
    if (secItems.length > 9) {
      const rest = secItems.slice(8).reduce((a, x) => a + x[1], 0);
      secItems = [...secItems.slice(0, 8), ['Other positions', rest]];
    }
    secItems = secItems.map(([n, v]) => [n, +v.toFixed(2)]);

    // Concentration curve (cumulative weight of the top N positions)
    const curve = [];
    let cum = 0;
    for (const h of holdings.slice(0, Math.min(holdings.length, 30))) {
      cum += h.w;
      curve.push(+cum.toFixed(2));
    }

    // Flows: biggest buys and sells
    const flowRows = [
      ...holdings.filter((h) => Math.abs(h.flow || 0) > 0).map((h) => ({ ticker: h.label, name: h.name, flow: h.flow, label: h.act === 'New' ? 'New position' : h.flow > 0 ? 'Added' : 'Trimmed' })),
      ...sold.map((h) => ({ ticker: h.label, name: h.name, flow: h.flow || -h.prevValue, label: 'Sold out' })),
    ];
    const topBuys = flowRows.filter((r) => r.flow > 0).sort((a, b) => b.flow - a.flow).slice(0, 6);
    const topSells = flowRows.filter((r) => r.flow < 0).sort((a, b) => a.flow - b.flow).slice(0, 6);

    // History (value line + stacked weights of today's top 6 issuers)
    const hist = (p.history || []).slice(-9);
    const topIssuers = [];
    for (const h of holdings) {
      if (!topIssuers.find((x) => x.issuer === h.issuer)) topIssuers.push({ issuer: h.issuer, label: h.label, cusips: new Set() });
      if (topIssuers.length >= 6) break;
    }
    for (const h of holdings) {
      const t = topIssuers.find((x) => x.issuer === h.issuer);
      if (t) t.cusips.add(h.cusip);
    }
    const stackSeries = topIssuers.map((t) => ({
      name: t.label,
      data: hist.map((q) => +Object.entries(q.w || {}).filter(([c]) => c.slice(0, 6) === t.issuer).reduce((a, [, v]) => a + v, 0).toFixed(2)),
    }));
    const otherSeries = hist.map((_, i) => +Math.max(0, 100 - stackSeries.reduce((a, s) => a + s.data[i], 0)).toFixed(2));

    return {
      ...inv,
      p: {
        ...p,
        holdings,
        sold,
        top10,
        effN,
        conviction: convictionLabel(top10),
        turnover,
        buys,
        sells,
        valueChange: p.prevTotalValue ? (total - p.prevTotalValue) / p.prevTotalValue : null,
        sectors: secItems,
        curve,
        flows: [...topBuys, ...topSells.reverse()].sort((a, b) => b.flow - a.flow),
        hist: { labels: hist.map((q) => quarter(q.period)), values: hist.map((q) => q.total), counts: hist.map((q) => q.count) },
        stack: { labels: hist.map((q) => quarter(q.period)), series: [...stackSeries, { name: 'Everything else', data: otherSeries }] },
      },
    };
  });
  // Super investors drive the cross-investor views (Top Stocks, owner counts, heatmap). Large institutions
  // (pension funds, big asset managers: group "institution" in config) get their own pages and appear in
  // Pro watchlists, but don't swamp the "most owned" rankings with index-like books.
  // Managers marked "pro" in config appear only for Pro members: no public page, not in public rankings.
  const withDataAll = investors.filter((i) => i.p).sort((a, b) => b.p.totalValue - a.p.totalValue);
  const withData = withDataAll.filter((i) => !i.pro);
  const proOnly = withDataAll.filter((i) => i.pro);
  const live = withData.filter((i) => i.group !== 'institution');
  const institutions = withData.filter((i) => i.group === 'institution');
  const proOwnerCount = new Map(); // issuer -> how many Pro-only super investors hold it (shown as a teaser)
  for (const inv of proOnly) {
    if (inv.group === 'institution') continue;
    for (const k of new Set(inv.p.holdings.filter((h) => !h.putCall && h.shType !== 'PRN').map((h) => h.issuer))) proOwnerCount.set(k, (proOwnerCount.get(k) || 0) + 1);
  }

  // ---------- Similarity (cosine on issuer-level weights) ----------
  const vec = new Map(withData.map((i) => {
    const m = new Map();
    for (const h of i.p.holdings) if (!h.putCall && h.shType !== 'PRN') m.set(h.issuer, (m.get(h.issuer) || 0) + h.weight);
    return [i.slug, m];
  }));
  const norm = (m) => Math.sqrt([...m.values()].reduce((a, v) => a + v * v, 0));
  for (const a of withData) {
    const va = vec.get(a.slug);
    a.p.similar = withData
      .filter((b) => b.slug !== a.slug)
      .map((b) => {
        const vb = vec.get(b.slug);
        let dot = 0;
        const shared = [];
        for (const [k, w] of va) if (vb.has(k)) {
          dot += w * vb.get(k);
          shared.push({ k, s: w * vb.get(k) });
        }
        const score = dot / (norm(va) * norm(vb) || 1);
        const labels = shared.sort((x, y) => y.s - x.s).slice(0, 4).map((x) => a.p.holdings.find((h) => h.issuer === x.k)?.label).filter(Boolean);
        return { inv: b, score: Math.round(score * 100), shared: labels };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3);
  }

  // ---------- Stocks (share classes combined by issuer) ----------
  const stocks = new Map();
  for (const inv of live) {
    const per = new Map();
    for (const h of inv.p.holdings) {
      if (h.shType === 'PRN') continue;
      if (!per.has(h.issuer)) per.set(h.issuer, { inv, w: 0, value: 0, shares: 0, acts: new Set(), lines: [] });
      const x = per.get(h.issuer);
      x.w += h.w;
      x.value += h.value;
      x.shares += h.shares;
      x.acts.add(h.act);
      x.lines.push(h);
    }
    for (const [k, x] of per) {
      if (!stocks.has(k)) stocks.set(k, { issuer: k, classes: new Map(), holders: [], sellers: [], value: 0 });
      const s = stocks.get(k);
      for (const h of x.lines) s.classes.set(h.ticker || h.cusip, (s.classes.get(h.ticker || h.cusip) || 0) + h.value);
      // Net across share classes: adding GOOG while trimming more GOOGL is a trim, not an add.
      let act;
      if (x.lines.every((l) => l.act === 'New')) act = 'New';
      else if (x.acts.size === 1) act = [...x.acts][0];
      else {
        const before = x.lines.reduce((a, l) => a + (l.act === 'New' ? 0 : l.prevShares ?? l.shares), 0);
        const net = x.lines.reduce((a, l) => a + l.shares, 0) - before;
        act = net > 0 ? 'Add' : net < 0 ? 'Trim' : 'Hold';
      }
      s.holders.push({ inv, w: x.w, value: x.value, shares: x.shares, act, line: x.lines[0] });
      s.value += x.value;
      if (!s.sample || x.value > s.sampleValue) {
        s.sample = x.lines[0];
        s.sampleValue = x.value;
      }
    }
    for (const h of inv.p.sold) {
      if (h.shType === 'PRN') continue;
      if (!stocks.has(h.issuer)) stocks.set(h.issuer, { issuer: h.issuer, classes: new Map(), holders: [], sellers: [], value: 0, sample: h, sampleValue: 0 });
      stocks.get(h.issuer).sellers.push({ inv, h });
    }
  }
  for (const s of stocks.values()) {
    const primary = [...s.classes.entries()].sort((a, b) => b[1] - a[1])[0];
    const sampleTicker = primary ? primary[0] : s.sample.ticker || s.sample.cusip;
    const ticker = /^[A-Z.\-]{1,7}$/.test(sampleTicker) ? sampleTicker : s.sample.ticker || null;
    s.ticker = ticker;
    s.label = ticker || cleanName(s.sample.issuer);
    s.name = cleanName((ticker && sectors[ticker]?.name) || s.sample.issuer);
    s.sector = (ticker && sectors[ticker]?.sector) || 'Other';
    s.slug = ticker ? slugify(ticker) : s.issuer.toLowerCase();
    s.owners = s.holders.length;
    s.proOwners = proOwnerCount.get(s.issuer) || 0;
    s.holders.sort((a, b) => b.w - a.w);
    s.maxW = s.holders[0]?.w || 0;
    s.buyers = s.holders.filter((x) => x.act === 'New' || x.act === 'Add').length;
    s.newBuyers = s.holders.filter((x) => x.act === 'New').length;
    s.sellCount = s.holders.filter((x) => x.act === 'Trim').length + s.sellers.length;
    s.hasPage = s.owners > 0;
  }
  const stockList = [...stocks.values()].filter((s) => s.hasPage).sort((a, b) => b.owners - a.owners || b.value - a.value);
  const stockByTicker = new Map();
  for (const s of stocks.values()) {
    if (s.ticker) stockByTicker.set(s.ticker, s);
  }
  // Make every holding know its stock page
  for (const inv of withData) for (const h of [...inv.p.holdings, ...inv.p.sold]) {
    const s = stocks.get(h.issuer) || (h.ticker ? stockByTicker.get(h.ticker) : null);
    h.stockSlug = s && s.hasPage ? s.slug : null;
  }

  // ---------- Smart money aggregates ----------
  const latestPeriod = live.map((i) => i.p.period).sort().at(-1) || null;
  const smart = {
    value: live.reduce((a, i) => a + i.p.totalValue, 0),
    positions: live.reduce((a, i) => a + i.p.holdingsCount, 0),
    newPositions: live.reduce((a, i) => a + i.p.holdings.filter((h) => h.act === 'New').length, 0),
    avgTop10: live.length ? live.reduce((a, i) => a + i.p.top10, 0) / live.length : 0,
    owned: stockList.slice(0, 15),
    bigBets: stockList
      .map((s) => ({ s, n: s.holders.filter((x) => x.w >= 5).length }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n || b.s.maxW - a.s.maxW)
      .slice(0, 10),
    mostBought: [...stocks.values()].filter((s) => s.buyers > 0).sort((a, b) => b.buyers - a.buyers || b.newBuyers - a.newBuyers || b.value - a.value).slice(0, 10),
    mostSold: [...stocks.values()].filter((s) => s.sellCount > 0).sort((a, b) => b.sellCount - a.sellCount || b.value - a.value).slice(0, 10),
    newBets: live
      .flatMap((inv) => inv.p.holdings.filter((h) => h.act === 'New' && h.shType !== 'PRN').map((h) => ({ inv, h })))
      .sort((a, b) => b.h.value - a.h.value)
      .slice(0, 10),
  };
  const heatStocks = stockList.slice(0, 15);
  smart.heat = {
    stocks: heatStocks.map((s) => s.label),
    investors: live.map((i) => i.manager),
    matrix: live.map((inv) => heatStocks.map((s) => {
      const x = s.holders.find((h) => h.inv.slug === inv.slug);
      return x ? +x.w.toFixed(2) : null;
    })),
  };
  smart.heat.max = Math.min(30, Math.ceil(Math.max(5, ...smart.heat.matrix.flat().filter((v) => v != null)) / 5) * 5);

  // ---------- Politicians ----------
  const ctr = (congress.trades || []).filter((t) => t.ticker && (t.type === 'buy' || t.type === 'sell'));
  const qOf = (t) => quarterKey(t.date || t.filed);
  const qKeys = [...new Set(ctr.map(qOf).filter(Boolean))].sort().reverse();
  const politicsFor = (qk) => {
    const list = ctr.filter((t) => qOf(t) === qk);
    const byTicker = new Map();
    for (const t of list) {
      if (!byTicker.has(t.ticker)) byTicker.set(t.ticker, { ticker: t.ticker, asset: t.asset, company: t.company, buyers: new Set(), sellers: new Set(), buys: 0, sells: 0, buyValue: 0, sellValue: 0, parties: { D: 0, R: 0, I: 0 } });
      const x = byTicker.get(t.ticker);
      const who = t.bioguide || t.member;
      if (t.type === 'buy') {
        x.buys++;
        x.buyers.add(who);
        x.buyValue += t.amount?.mid || 0;
      } else {
        x.sells++;
        x.sellers.add(who);
        x.sellValue += t.amount?.mid || 0;
      }
      const party = (t.party || '').charAt(0);
      if (party in x.parties) x.parties[party]++;
    }
    const rows = [...byTicker.values()].map((x) => ({ ...x, buyers: x.buyers.size, sellers: x.sellers.size, stock: stockByTicker.get(x.ticker) || null, name: cleanName((sectors[x.ticker] && sectors[x.ticker].name) || x.company || String(x.asset || '').split('>').pop().replace(/\s*\(.*$/, '')) }));
    const byMember = new Map();
    for (const t of list) {
      const k = t.bioguide || t.member;
      if (!byMember.has(k)) byMember.set(k, { member: t.member, party: t.party, chamber: t.chamber, state: t.state, trades: 0, buys: 0, sells: 0, value: 0, tickers: new Map() });
      const m = byMember.get(k);
      m.trades++;
      m[t.type === 'buy' ? 'buys' : 'sells']++;
      m.value += t.amount?.mid || 0;
      m.tickers.set(t.ticker, (m.tickers.get(t.ticker) || 0) + 1);
    }
    const members = [...byMember.values()].map((m) => ({ ...m, top: [...m.tickers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]) })).sort((a, b) => b.trades - a.trades);
    const party = { D: { buys: 0, sells: 0 }, R: { buys: 0, sells: 0 }, I: { buys: 0, sells: 0 } };
    for (const t of list) {
      const k = (t.party || '').charAt(0);
      if (party[k]) party[k][t.type === 'buy' ? 'buys' : 'sells']++;
    }
    return {
      key: qk,
      label: qk ? `Q${qk.slice(5)} ${qk.slice(0, 4)}` : '—',
      trades: list.length,
      buys: list.filter((t) => t.type === 'buy').length,
      sells: list.filter((t) => t.type === 'sell').length,
      members: byMember.size,
      estValue: list.reduce((a, t) => a + (t.amount?.mid || 0), 0),
      mostBought: rows.filter((r) => r.buyers > 0).sort((a, b) => b.buyers - a.buyers || b.buyValue - a.buyValue).slice(0, 12),
      mostSold: rows.filter((r) => r.sellers > 0).sort((a, b) => b.sellers - a.sellers || b.sellValue - a.sellValue).slice(0, 12),
      biggest: list.filter((t) => t.type === 'buy').sort((a, b) => (b.amount?.mid || 0) - (a.amount?.mid || 0)).slice(0, 10),
      activeMembers: members.slice(0, 12),
      party,
      overlap: rows.filter((r) => r.buyers > 0 && r.stock && r.stock.owners > 0).sort((a, b) => b.buyers - a.buyers || b.stock.owners - a.stock.owners).slice(0, 8),
    };
  };
  const politics = {
    updatedAt: congress.updatedAt,
    lastFiled: ctr.map((t) => t.filed).filter(Boolean).sort().at(-1) || null,
    quarters: (() => {
      // Lead with the most recent quarter that has a meaningful share of disclosures; trades
      // keep arriving for ~45 days after a quarter ends, so a brand-new quarter starts thin.
      const qs = qKeys.slice(0, 3).map(politicsFor);
      const max = Math.max(0, ...qs.map((q) => q.trades));
      const i = qs.findIndex((q) => q.trades >= max * 0.5);
      return i > 0 ? [...qs.slice(i), ...qs.slice(0, i)] : qs;
    })(),
    latest: ctr.slice(0, 60),
    totalTrades: ctr.length,
    byTicker: (() => {
      const m = new Map();
      for (const t of ctr) {
        if (!m.has(t.ticker)) m.set(t.ticker, []);
        m.get(t.ticker).push(t);
      }
      return m;
    })(),
  };

  // ---------- Insiders ----------
  const ins = insiders[0] || null;
  const insiderView = ins
    ? {
        ...ins,
        label: `Q${ins.quarter.slice(5)} ${ins.quarter.slice(0, 4)}`,
        previous: insiders.slice(1).map((q) => ({ quarter: q.quarter, label: `Q${q.quarter.slice(5)} ${q.quarter.slice(0, 4)}`, totals: q.totals })),
        overlap: Object.entries(ins.buyTickers || {})
          .map(([t, v]) => ({ ticker: t, ...v, stock: stockByTicker.get(t) }))
          .filter((x) => x.stock && x.stock.owners > 0)
          .sort((a, b) => b.stock.owners - a.stock.owners || b.value - a.value)
          .slice(0, 10),
      }
    : null;

  // Stocks traded by Congress or insiders that no tracked fund manager owns still get a page,
  // so search and links always land somewhere useful.
  const extra = new Map();
  const addExtra = (ticker, name) => {
    if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,6}$/.test(ticker)) return;
    const own = stockByTicker.get(ticker);
    if ((own && own.hasPage) || extra.has(ticker)) return;
    extra.set(ticker, {
      ticker, label: ticker, name: cleanName((sectors[ticker] && sectors[ticker].name) || name || ticker), sector: (sectors[ticker] && sectors[ticker].sector) || null,
      slug: slugify(ticker), holders: [], sellers: own?.sellers || [], owners: 0, value: 0, buyers: 0, newBuyers: 0, sellCount: own?.sellers?.length || 0, maxW: 0, hasPage: true, extra: true,
    });
  };
  for (const t of ctr) addExtra(t.ticker, t.company || String(t.asset || '').split('>').pop().replace(/\s*\(.*$/, '').replace(/^(SP|JT|DC)\s+/, ''));
  if (ins) {
    for (const t of [...(ins.topBuys || []), ...(ins.topSells || []), ...(ins.topExecBuys || []), ...(ins.topExecSells || [])]) addExtra(t.ticker, t.company);
    for (const c of [...(ins.clusterBuys || []), ...(ins.topBuyCompanies || []), ...(ins.topSellCompanies || [])]) addExtra(c.ticker, c.company);
  }
  for (const [t, s] of extra) stockByTicker.set(t, s);
  const extraStocks = [...extra.values()];

  // President Trump's periodic transaction reports (OGE 278-T).
  const trump = loadTrump(dataDir, { stockByTicker, sectors });
  if (trump) for (const [t, x] of trump.byTicker) { const s = stockByTicker.get(t); if (s) s.trump = x; }

  // Featured politician portfolios (Trump, Pelosi).
  const people = loadPeople({ dataDir, trump, stockByTicker });

  // Economic calendar and earnings dates.
  const calendar = buildCalendar(readJSON(path.join(dataDir, 'calendar.json'), null), { stockByTicker });
  if (calendar) for (const [t, x] of calendar.earnings.nextByTicker) { const s = stockByTicker.get(t); if (s) s.nextEarnings = x; }
  if (calendar) for (const [t, x] of calendar.earnings.lastByTicker) { const s = stockByTicker.get(t); if (s) s.lastEarnings = x; }
  // Other share classes of the same company (GOOG and GOOGL, FOX and FOXA) report together.
  if (calendar) {
    const co = (s) => String(s.name || '').toLowerCase().replace(/\b(class|cl|series)\s*[a-z]\b|\b(inc|corp|corporation|co|plc|ltd|the)\b|[^a-z]/g, '');
    const byCo = new Map();
    for (const s of stockByTicker.values()) if (s.nextEarnings || s.lastEarnings) { const k = co(s); if (k.length > 3 && !byCo.has(k)) byCo.set(k, s); }
    for (const s of stockByTicker.values()) {
      if (s.nextEarnings || s.lastEarnings) continue;
      const m = byCo.get(co(s));
      if (m && m !== s) { s.nextEarnings = m.nextEarnings; s.lastEarnings = m.lastEarnings; }
    }
  }

  return {
    cfg,
    extraStocks,
    investors: investors.filter((i) => !i.pro),
    allInvestors: investors,
    live,
    institutions,
    proOnly,
    stocks: stockList,
    stockByTicker,
    smart,
    market,
    news,
    weekly,
    politics,
    trump,
    people,
    calendar,
    insiders: insiderView,
    sectors,
    latestPeriod,
    latestFiling: live.map((i) => i.p.filingDate).sort().at(-1) || null,
    quartersOfHistory: Math.max(0, ...live.map((i) => (i.p.history || []).length)),
  };
}
