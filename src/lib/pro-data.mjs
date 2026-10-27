// QWERTx Pro data, written at build time next to the site:
//   dist/pro/t/<TICKER>.json   — per ticker: which tracked managers own it, who bought, trimmed or exited,
//                                recent Congress / President trades, insider activity and next earnings.
//                                Powers the "who owns what you own" view on /account.html.
//   dist/pro/index.json        — every covered ticker with its name and owner counts, tracked managers and
//                                the Canadian-listing aliases. Used for input checks, teasers and digests.
//   dist/pro/events-recent.json — one stable-id event per disclosed trade filed in the last few weeks.
//                                /api/internal/dispatch turns new events into alerts for watchlists.
// Files are split this way so no request has to parse more than a few hundred kilobytes.
// Everything here comes from the same official filings the public pages use.

const r2 = (x) => Math.round(x * 100) / 100;
const daysAgo = (iso, now) => (now - Date.parse(iso)) / 864e5;

// Events older than this (by filing date) are left out of events.json entirely.
const EVENT_WINDOW_DAYS = 150;
// Congress and President trades shown in the ownership view.
const TRADE_VIEW_DAYS = 180;
// Events the alert dispatcher sees. It only alerts on disclosures filed in the last 14 days anyway.
const RECENT_EVENT_DAYS = 21;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function buildProData(d, { now = Date.now(), aliases = {} } = {}) {
  const managers = {};
  const institutions = d.institutions || [];
  for (const inv of [...d.live, ...institutions]) {
    managers[inv.slug] = {
      ...(inv.group === 'institution' ? { g: 'i' } : {}),
      n: inv.manager,
      f: inv.firm,
      period: inv.p.period,
      filed: inv.p.filingDate,
      prev: inv.p.prevPeriod || null,
      url: inv.p.filingUrl,
    };
  }

  const stocks = {};
  const get = (s, ticker) => {
    const t = ticker || s?.ticker;
    if (!t || !TICKER.test(t)) return null;
    if (!stocks[t]) stocks[t] = { n: s?.name || t, s: s?.hasPage ? s.slug : null, sec: s?.sector || null, h: [], x: [], cg: [] };
    return stocks[t];
  };

  // ---- Fund managers (13F) ----
  for (const s of d.stockByTicker.values()) {
    if (!s.ticker) continue;
    if (!s.holders?.length && !s.sellers?.length) continue;
    const o = get(s);
    if (!o) continue;
    // [manager slug, portfolio weight %, action, % change in shares, value $]
    o.h = (s.holders || []).map((x) => [x.inv.slug, r2(x.w), x.act, x.line?.sharesChangePct != null && x.act !== 'New' ? Math.round(x.line.sharesChangePct * 100) : null, Math.round(x.value)]);
    o.x = [...new Set((s.sellers || []).map((x) => x.inv.slug))];
    if (s.nextEarnings) o.e = { d: s.nextEarnings.date, l: s.nextEarnings.label, t: s.nextEarnings.time || '', est: !!s.nextEarnings.estimated };
  }

  // ---- Institutions (pension funds, large asset managers): kept apart from the super investor counts ----
  for (const inv of institutions) {
    const per = new Map();
    for (const h of inv.p.holdings) {
      if (!TICKER.test(h.ticker || '') || h.putCall || h.shType === 'PRN') continue;
      const x = per.get(h.ticker) || { w: 0, v: 0, act: h.act, chg: h.sharesChangePct };
      x.w += h.w;
      x.v += h.value;
      per.set(h.ticker, x);
    }
    for (const [t, x] of per) {
      const o = get(d.stockByTicker.get(t), t);
      if (!o) continue;
      (o.ih ||= []).push([inv.slug, r2(x.w), x.act, x.chg != null && x.act !== 'New' ? Math.round(x.chg * 100) : null, Math.round(x.v)]);
    }
  }

  // ---- Congress ----
  for (const [ticker, trades] of d.politics.byTicker) {
    const recent = trades.filter((t) => t.filed && daysAgo(t.filed, now) <= TRADE_VIEW_DAYS);
    if (!recent.length) continue;
    const o = get(d.stockByTicker.get(ticker), ticker);
    if (!o) continue;
    for (const t of recent) o.cg.push({ who: t.member, p: (t.party || '').charAt(0), ch: t.chamber, a: t.type, amt: t.amount?.label || null, d: t.date, f: t.filed, u: t.source });
  }

  // ---- President (OGE 278-T) ----
  for (const s of d.stockByTicker.values()) {
    if (!s.ticker || !s.trump?.trades?.length) continue;
    const recent = s.trump.trades.filter((t) => t.filed && daysAgo(t.filed, now) <= TRADE_VIEW_DAYS && (t.type === 'P' || t.type === 'S' || t.type === 'S (partial)'));
    if (!recent.length) continue;
    const o = get(s);
    if (!o) continue;
    for (const t of recent) o.cg.push({ who: 'Donald J. Trump', p: 'R', ch: 'President', a: t.type === 'P' ? 'buy' : 'sell', amt: rangeLabel(t.lo, t.hi), d: t.date, f: t.filed, u: t.src });
  }
  for (const o of Object.values(stocks)) o.cg.sort((a, b) => (b.f || '').localeCompare(a.f || '') || (b.d || '').localeCompare(a.d || ''));
  for (const o of Object.values(stocks)) o.cg = o.cg.slice(0, 12);

  // ---- Insiders (Form 4, open-market only) ----
  const I = d.insiders;
  const insiderQuarter = I ? I.label : null;
  if (I) {
    for (const [t, v] of Object.entries(I.buyTickers || {})) {
      const o = stocks[t] || (d.stockByTicker.get(t) ? get(d.stockByTicker.get(t), t) : null);
      if (o) o.ib = { i: v.insiders, v: v.value };
    }
    for (const [t, v] of Object.entries(I.sellTickers || {})) {
      const o = stocks[t];
      if (o) o.is = { i: v.insiders, v: v.value };
    }
    for (const c of clustersOf(I)) {
      const o = stocks[c.ticker];
      if (o) o.cl = { i: c.insiders, v: Math.round(c.value), s: c.start || null, e: c.end || c.last || null };
    }
  }

  // Drop empty trade lists to keep the file small.
  for (const o of Object.values(stocks)) {
    if (!o.cg.length) delete o.cg;
    if (!o.x.length) delete o.x;
    if (!o.h.length) delete o.h;
  }

  const generatedAt = new Date(now).toISOString();
  const ownership = { generatedAt, insiderQuarter, managers, stocks };
  // [name, managers holding, bought (new or added), trimmed, exited, stock page slug,
  //  holders as positions in managerOrder, next earnings date or null]
  const managerOrder = Object.keys(managers).filter((m) => !managers[m].g);
  const pos = new Map(managerOrder.map((m, i) => [m, i]));
  const tickers = {};
  for (const [t, o] of Object.entries(stocks)) {
    const h = o.h || [];
    tickers[t] = [o.n, h.length, h.filter((x) => x[2] === 'New' || x[2] === 'Add').length, h.filter((x) => x[2] === 'Trim').length, (o.x || []).length, o.s, h.map((x) => pos.get(x[0])), o.e?.d || null];
  }
  const index = { generatedAt, insiderQuarter, managers, managerOrder, aliases, tickers };
  const events = buildEvents(d, { now });
  const recentEvents = events.filter((e) => daysAgo(e.at, now) <= RECENT_EVENT_DAYS);
  return { ownership, index, events, recentEvents };
}

function rangeLabel(lo, hi) {
  if (!lo && !hi) return null;
  const f = (v) => '$' + Number(v).toLocaleString('en-US');
  return hi ? `${f(lo)} – ${f(hi)}` : `Over ${f(lo)}`;
}

// 30-day clusters (3+ distinct officers or directors buying on the open market within 30 days) when the
// insider job has produced them; otherwise the quarter-level clusters, flagged as such.
function clustersOf(I) {
  if (Array.isArray(I.clusters30)) return I.clusters30.map((c) => ({ ...c, window: 30 }));
  return (I.clusterBuys || []).map((c) => ({ ...c, window: 'quarter' }));
}

export function buildEvents(d, { now = Date.now() } = {}) {
  const out = [];
  const recent = (iso) => iso && daysAgo(iso, now) <= EVENT_WINDOW_DAYS;

  // 13F: new positions, changes in shares and full exits, one event per manager per company per filing.
  for (const inv of [...d.live, ...(d.institutions || [])]) {
    const p = inv.p;
    if (!recent(p.filingDate)) continue;
    const seen = new Set();
    const base = { k: '13f', at: p.filingDate, m: inv.slug, p: p.period, u: p.filingUrl };
    for (const h of p.holdings) {
      if (!TICKER.test(h.ticker || '') || h.putCall || h.shType === 'PRN' || seen.has(h.issuer)) continue;
      if (h.act === 'Hold') continue;
      seen.add(h.issuer);
      const a = h.act === 'New' ? 'new' : h.act === 'Add' ? 'add' : 'trim';
      out.push({ ...base, id: `13f:${p.accession}:${h.issuer}`, t: h.ticker, a, c: a === 'new' ? null : Math.round((h.sharesChangePct || 0) * 100), w: r2(h.w), v: Math.round(h.value) });
    }
    for (const h of p.sold) {
      if (!TICKER.test(h.ticker || '') || h.putCall || h.shType === 'PRN' || seen.has(h.issuer)) continue;
      // Still holds another share class of the same company: not an exit.
      if (p.holdings.some((x) => x.issuer === h.issuer && !x.putCall)) continue;
      seen.add(h.issuer);
      out.push({ ...base, id: `13f:${p.accession}:${h.issuer}`, t: h.ticker, a: 'exit', c: -100, w: 0, v: 0 });
    }
  }

  // Congress (STOCK Act PTRs).
  for (const trades of d.politics.byTicker.values()) {
    for (const t of trades) {
      if (!recent(t.filed) || !t.id) continue;
      out.push({ k: 'cg', id: `cg:${t.id}`, t: t.ticker, at: t.filed, who: t.member, p: (t.party || '').charAt(0), ch: t.chamber, a: t.type, amt: t.amount?.label || null, d: t.date, u: t.source });
    }
  }

  // President (OGE 278-T).
  for (const s of d.stockByTicker.values()) {
    if (!s.ticker || !s.trump?.trades) continue;
    for (const t of s.trump.trades) {
      if (!recent(t.filed) || !(t.type === 'P' || String(t.type).startsWith('S'))) continue;
      out.push({ k: 'cg', id: `pres:${t.filing}:${t.no}`, t: s.ticker, at: t.filed, who: 'Donald J. Trump', p: 'R', ch: 'President', a: t.type === 'P' ? 'buy' : 'sell', amt: rangeLabel(t.lo, t.hi), d: t.date, u: t.src });
    }
  }

  // Insider clusters.
  const I = d.insiders;
  if (I) {
    for (const c of clustersOf(I)) {
      const at = c.filed || c.end || c.last;
      if (!recent(at)) continue;
      out.push({ k: 'ins', id: `ins:${I.quarter}:${c.ticker}:${c.start || 'q'}`, t: c.ticker, at, n: c.insiders, v: Math.round(c.value), s: c.start || null, e: c.end || c.last || null, win: c.window, u: c.issuerCik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.issuerCik}&type=4&dateb=&owner=include&count=40` : null });
    }
  }

  const ids = new Set();
  return out.filter((e) => !ids.has(e.id) && ids.add(e.id)).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
