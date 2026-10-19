import { esc, money, int, pct, date, quarter } from './lib/format.mjs';
import {
  gauge, investorCard, rankList, newsItems, treemap, holdingsTable, soldTable,
  tickerChip, statusCell, weightBar, optBadge,
} from './components.mjs';

const pendingNotice = `<div class="notice">Portfolio data is on its way. It fills in automatically on the first scheduled update from SEC filings.</div>`;

/* ---------------- Home ---------------- */
export function home(d) {
  const liveN = d.live.length;
  const mostHeld = [...d.stocks]
    .sort((a, b) => b.investorCount - a.investorCount || b.combinedValue - a.combinedValue)
    .slice(0, 10);
  const buys = d.stocks
    .filter((s) => s.buyers > 0)
    .sort((a, b) => b.buyers - a.buyers || b.newBuyers - a.newBuyers || b.combinedValue - a.combinedValue)
    .slice(0, 8);
  const sells = [...d.stockByCusip.values()]
    .filter((s) => s.reducers > 0)
    .sort((a, b) => b.reducers - a.reducers || b.sellers.length - a.sellers.length || b.combinedValue - a.combinedValue)
    .slice(0, 8)
    .map((s) => ({ ...s, slug: s.holders.length ? s.slug : null }));

  const sellList = sells.length
    ? rankList(
        sells,
        { count: (s) => s.reducers, max: liveN, kind: 'sell', sub: (s) => `${s.sellers.length} sold out, ${s.reducers - s.sellers.length} trimmed` },
      )
    : '<p class="muted">Nothing to show yet.</p>';

  const body = `
<div class="wrap">
  <section class="hero">
    <div>
      <span class="eyebrow">Superinvestor portfolios, decoded</span>
      <h1>See what the world's best investors <em>actually own.</em></h1>
      <p class="lede">QWERTx tracks the latest SEC filings of legendary investors and turns them into clear visuals. Start simple, then go one click deeper whenever you want.</p>
      <div class="cta-row">
        <a class="btn btn-primary" href="/investors/">Browse superinvestors</a>
        <a class="btn" href="/stocks/">Most-held stocks</a>
      </div>
    </div>
    ${gauge(d.market)}
  </section>

  <div class="stats">
    <div><div class="stat-label">Superinvestors</div><div class="stat-value">${liveN || d.investors.length}</div></div>
    <div><div class="stat-label">Combined 13F value</div><div class="stat-value">${money(d.combinedValue)}</div></div>
    <div><div class="stat-label">Latest quarter</div><div class="stat-value">${quarter(d.latestPeriod)}</div></div>
    <div><div class="stat-label">Last filing</div><div class="stat-value">${date(d.lastFiling)}</div></div>
  </div>

  ${
    liveN
      ? `<section class="section">
    <div class="section-head"><div><h2>Most held by superinvestors</h2><p>Stocks owned by the most managers we track</p></div><a class="link-more" href="/stocks/">All stocks</a></div>
    <div class="card">${rankList(mostHeld, { count: (s) => s.investorCount, max: liveN, sub: (s) => `${money(s.combinedValue)} combined` })}</div>
  </section>

  <section class="section grid-2">
    <div>
      <div class="section-head"><div><h2>Biggest buys</h2><p>Most managers adding or opening, ${quarter(d.latestPeriod)}</p></div></div>
      <div class="card">${rankList(buys, { count: (s) => s.buyers, max: liveN, kind: 'buy', sub: (s) => (s.newBuyers ? `${s.newBuyers} new position${s.newBuyers > 1 ? 's' : ''}` : 'added to existing') })}</div>
    </div>
    <div>
      <div class="section-head"><div><h2>Biggest sells</h2><p>Most managers trimming or exiting</p></div></div>
      <div class="card">${sellList}</div>
    </div>
  </section>`
      : `<section class="section">${pendingNotice}</section>`
  }

  <section class="section">
    <div class="section-head"><div><h2>Superinvestors</h2><p>Click any manager for the full portfolio</p></div><a class="link-more" href="/investors/">Compare all</a></div>
    <div class="investor-grid">${d.investors.map(investorCard).join('')}</div>
  </section>

  <section class="section">
    <div class="section-head"><div><h2>Market news</h2><p>${d.news.updatedAt ? `Updated ${date(d.news.updatedAt)}` : 'Updated daily'}</p></div><a class="link-more" href="/news/">All headlines</a></div>
    <div class="card">${d.news.items.length ? newsItems(d.news.items.slice(0, 8)) : '<p class="muted">Headlines appear after the first daily update.</p>'}</div>
  </section>
</div>`;
  return {
    path: '/',
    title: 'Home',
    description: 'Superinvestor portfolios from SEC 13F filings, visualized. See what Buffett, Ackman, Klarman and other top investors own, plus market mood and daily news.',
    body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'QWERTx', url: 'https://qwertx.com/' },
  };
}

/* ---------------- Investors index ---------------- */
export function investorsIndex(d) {
  const rows = d.investors
    .map((inv) => {
      const p = inv.portfolio;
      if (!p) return `<tr><td><div class="cell-name"><div><span>${esc(inv.manager)}</span><small>${esc(inv.firm)}</small></div></div></td><td class="r faint" colspan="5">Pending first update</td></tr>`;
      return `<tr>
  <td data-v="${esc(inv.manager)}"><div class="cell-name"><div><a href="/investors/${esc(inv.slug)}/">${esc(inv.manager)}</a><small>${esc(inv.firm)}</small></div></div></td>
  <td class="r" data-v="${p.totalValue}">${money(p.totalValue)}</td>
  <td class="r" data-v="${p.holdingsCount}">${p.holdingsCount}</td>
  <td class="r hide-sm" data-v="${p.top10}">${pct(p.top10, 0)}</td>
  <td class="hide-sm"><div class="tops" style="display:flex;gap:6px">${p.holdings.slice(0, 3).map(tickerChip).join('')}</div></td>
  <td class="r" data-v="${p.period}">${quarter(p.period)}</td>
</tr>`;
    })
    .join('');
  const body = `<div class="wrap">
  <header class="page-head">
    <div class="crumbs"><a href="/">Home</a> / Superinvestors</div>
    <h1>Superinvestors</h1>
    <p class="sub">${d.investors.length} managers tracked from their latest SEC Form 13F filings. Tap a column to sort.</p>
  </header>
  <section class="section" style="margin-top:28px">
    <div class="table-wrap"><table class="data" data-sortable>
      <thead><tr><th data-sort="text">Manager</th><th class="r" data-sort="num">Portfolio</th><th class="r" data-sort="num">Positions</th><th class="r hide-sm" data-sort="num">Top 10</th><th class="hide-sm">Largest holdings</th><th class="r" data-sort="text">Quarter</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>
  <section class="section"><div class="investor-grid">${d.investors.map(investorCard).join('')}</div></section>
</div>`;
  return {
    path: '/investors/',
    title: 'Superinvestors',
    description: 'Compare the portfolios of top investors including Warren Buffett, Bill Ackman and Seth Klarman, from their latest 13F filings.',
    body,
  };
}

/* ---------------- Investor page ---------------- */
export function investorPage(d, inv) {
  const p = inv.portfolio;
  const c = p.counts || {};
  const chg = p.prevTotalValue ? (p.totalValue - p.prevTotalValue) / p.prevTotalValue : null;
  const body = `<div class="wrap">
  <header class="page-head">
    <div class="crumbs"><a href="/">Home</a> / <a href="/investors/">Superinvestors</a> / ${esc(inv.manager)}</div>
    <span class="eyebrow">${esc(inv.style || 'Portfolio')}</span>
    <h1 style="margin-top:10px">${esc(inv.manager)}</h1>
    <p class="sub">${esc(inv.firm)} · 13F holdings as of ${date(p.period)} (${quarter(p.period)})</p>
    <div class="meta-grid">
      <div><div class="stat-label">Portfolio value</div><div class="stat-value">${money(p.totalValue)}</div>${chg != null ? `<div class="${chg >= 0 ? 'up' : 'down'} num" style="font-size:13px">${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(1)}% vs ${quarter(p.prevPeriod)}</div>` : ''}</div>
      <div><div class="stat-label">Positions</div><div class="stat-value">${p.holdingsCount}</div></div>
      <div><div class="stat-label">Top 10 weight</div><div class="stat-value">${pct(p.top10, 0)}</div></div>
      <div><div class="stat-label">Filed with SEC</div><div class="stat-value">${date(p.filingDate)}</div><a class="link-more" style="font-size:12px" href="${esc(p.filingUrl)}" target="_blank" rel="noopener">View filing</a></div>
    </div>
    ${p.prevPeriod ? `<div class="chips"><span class="chip"><b>${c.new ?? 0}</b>new</span><span class="chip"><b>${c.added ?? 0}</b>added</span><span class="chip"><b>${c.reduced ?? 0}</b>trimmed</span><span class="chip"><b>${c.sold ?? 0}</b>sold out</span><span class="chip"><b>${c.unchanged ?? 0}</b>unchanged</span></div>` : ''}
  </header>

  <section class="section">
    <div class="section-head"><div><h2>Portfolio map</h2><p>Each tile is a position, sized by its share of the portfolio</p></div></div>
    ${treemap(p.holdings)}
  </section>

  <section class="section">
    <div class="section-head"><div><h2>All holdings</h2><p>${p.holdingsCount} positions · values as of quarter end</p></div><input class="filter" type="search" placeholder="Filter holdings…" data-filter="holdings" aria-label="Filter holdings"></div>
    ${holdingsTable(p)}
  </section>

  ${p.sold.length ? `<section class="section"><div class="section-head"><div><h2>Sold out</h2><p>Positions fully exited since ${quarter(p.prevPeriod)}</p></div></div>${soldTable(p)}</section>` : ''}
</div>`;
  return {
    path: `/investors/${inv.slug}/`,
    title: `${inv.manager} portfolio (${quarter(p.period)})`,
    description: `${inv.manager}'s ${inv.firm} portfolio: ${p.holdingsCount} positions worth ${money(p.totalValue)} as of ${quarter(p.period)}. Top holdings: ${p.holdings.slice(0, 3).map((h) => h.ticker || h.name).join(', ')}.`,
    body,
  };
}

export function investorPending(inv) {
  return {
    path: `/investors/${inv.slug}/`,
    title: `${inv.manager} portfolio`,
    description: `${inv.manager}'s ${inv.firm} portfolio from SEC 13F filings.`,
    body: `<div class="wrap"><header class="page-head"><div class="crumbs"><a href="/">Home</a> / <a href="/investors/">Superinvestors</a> / ${esc(inv.manager)}</div><h1>${esc(inv.manager)}</h1><p class="sub">${esc(inv.firm)}</p></header><section class="section">${pendingNotice}</section></div>`,
  };
}

/* ---------------- Stocks index ---------------- */
export function stocksIndex(d) {
  const list = [...d.stocks].sort((a, b) => b.investorCount - a.investorCount || b.combinedValue - a.combinedValue);
  const rows = list
    .map(
      (s) => `<tr>
  <td data-v="${esc(s.name)}"><div class="cell-name">${tickerChip(s)}<a href="/stocks/${esc(s.slug)}/">${esc(s.name)}</a></div></td>
  <td class="r" data-v="${s.investorCount}">${s.investorCount}</td>
  <td class="r" data-v="${s.combinedValue}">${money(s.combinedValue)}</td>
  <td class="r hide-sm" data-v="${s.avgWeight}">${pct(s.avgWeight)}</td>
  <td class="r hide-sm" data-v="${s.buyers}">${s.buyers ? `<span class="up">${s.buyers}</span>` : '<span class="faint">0</span>'}</td>
  <td class="r hide-sm" data-v="${s.reducers}">${s.reducers ? `<span class="down">${s.reducers}</span>` : '<span class="faint">0</span>'}</td>
</tr>`,
    )
    .join('');
  const body = `<div class="wrap">
  <header class="page-head">
    <div class="crumbs"><a href="/">Home</a> / Stocks</div>
    <h1>Stocks superinvestors own</h1>
    <p class="sub">${list.length} stocks across ${d.live.length} portfolios, ranked by how many managers hold them.</p>
  </header>
  <section class="section" style="margin-top:28px">
    ${list.length ? `<div class="section-head"><input class="filter" type="search" placeholder="Search by name or ticker…" data-filter="stocks" aria-label="Search stocks"></div>
    <div class="table-wrap"><table class="data" id="stocks" data-sortable>
      <thead><tr><th data-sort="text">Stock</th><th class="r" data-sort="num" aria-sort="descending">Held by</th><th class="r" data-sort="num">Combined value</th><th class="r hide-sm" data-sort="num">Avg weight</th><th class="r hide-sm" data-sort="num">Buying</th><th class="r hide-sm" data-sort="num">Selling</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : pendingNotice}
  </section>
</div>`;
  return {
    path: '/stocks/',
    title: 'Stocks held by superinvestors',
    description: 'Every stock held by the superinvestors QWERTx tracks, ranked by how many of them own it, with buying and selling activity.',
    body,
  };
}

/* ---------------- Stock page ---------------- */
export function stockPage(d, s) {
  const max = s.holders[0]?.h.weight || 1;
  const rows = s.holders
    .map(
      ({ inv, h }) => `<tr>
  <td data-v="${esc(inv.manager)}"><div class="cell-name"><div><a href="/investors/${esc(inv.slug)}/">${esc(inv.manager)}</a>${optBadge(h)}<small>${esc(inv.firm)}</small></div></div></td>
  <td class="r" data-v="${h.weight}">${weightBar(h.weight, max)}</td>
  <td class="r hide-sm" data-v="${h.shares}">${int(h.shares)}</td>
  <td class="r" data-v="${h.value}">${money(h.value)}</td>
  ${statusCell(h)}
</tr>`,
    )
    .join('');
  const sellers = s.sellers.length
    ? `<section class="section"><div class="section-head"><div><h2>Sold out last quarter</h2></div></div><div class="card"><ul class="news-list">${s.sellers
        .map(({ inv, h }) => `<li><a href="/investors/${esc(inv.slug)}/">${esc(inv.manager)}</a><div class="news-meta">Exited a ${pct(h.prevWeight)} position worth ${money(h.prevValue)}</div></li>`)
        .join('')}</ul></div></section>`
    : '';
  const label = s.ticker ? `${s.name} (${s.ticker})` : s.name;
  const body = `<div class="wrap">
  <header class="page-head">
    <div class="crumbs"><a href="/">Home</a> / <a href="/stocks/">Stocks</a> / ${esc(s.ticker || s.name)}</div>
    <div style="display:flex;gap:12px;align-items:center">${tickerChip(s)}<span class="faint mono" style="font-size:12px">CUSIP ${esc(s.cusip)}</span></div>
    <h1 style="margin-top:12px">${esc(s.name)}</h1>
    <p class="sub">Held by ${s.investorCount} of ${d.live.length} superinvestors we track</p>
    <div class="meta-grid">
      <div><div class="stat-label">Superinvestors</div><div class="stat-value">${s.investorCount}</div></div>
      <div><div class="stat-label">Combined value</div><div class="stat-value">${money(s.combinedValue)}</div></div>
      <div><div class="stat-label">Avg portfolio weight</div><div class="stat-value">${pct(s.avgWeight)}</div></div>
      <div><div class="stat-label">Buying / selling</div><div class="stat-value"><span class="up">${s.buyers}</span> / <span class="down">${s.reducers}</span></div></div>
    </div>
  </header>
  <section class="section">
    <div class="section-head"><div><h2>Who owns it</h2><p>Sorted by share of each manager's portfolio</p></div>${s.ticker ? `<a class="link-more" href="https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker.replace('.', '-'))}" target="_blank" rel="noopener nofollow">Live quote</a>` : ''}</div>
    <div class="table-wrap"><table class="data" data-sortable>
      <thead><tr><th data-sort="text">Manager</th><th class="r" data-sort="num">% of portfolio</th><th class="r hide-sm" data-sort="num">Shares</th><th class="r" data-sort="num">Value</th><th class="r" data-sort="num">Last quarter</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>
  ${sellers}
</div>`;
  return {
    path: `/stocks/${s.slug}/`,
    title: `${label}: superinvestor ownership`,
    description: `${label} is held by ${s.investorCount} superinvestors with ${money(s.combinedValue)} combined, based on the latest 13F filings.`,
    body,
  };
}

/* ---------------- News ---------------- */
export function newsPage(d) {
  const groups = new Map();
  for (const n of d.news.items) {
    const k = n.published ? date(n.published) : 'Recent';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  const body = `<div class="wrap">
  <header class="page-head">
    <div class="crumbs"><a href="/">Home</a> / News</div>
    <h1>Market news</h1>
    <p class="sub">Headlines from major financial publishers, refreshed every morning.${d.news.updatedAt ? ` Last update ${date(d.news.updatedAt)}.` : ''}</p>
  </header>
  <section class="section grid-2" style="margin-top:28px;align-items:start">
    <div class="card">${
      d.news.items.length
        ? [...groups].map(([day, items]) => `<div class="news-day">${esc(day)}</div>${newsItems(items)}`).join('')
        : '<p class="muted">Headlines appear after the first daily update.</p>'
    }</div>
    <div style="position:sticky;top:84px">${gauge(d.market)}</div>
  </section>
</div>`;
  return { path: '/news/', title: 'Market news', description: 'Daily stock market headlines and the Fear & Greed market mood gauge.', body };
}

/* ---------------- About ---------------- */
export function aboutPage() {
  const body = `<div class="wrap">
  <header class="page-head"><div class="crumbs"><a href="/">Home</a> / About</div><h1>About QWERTx</h1><p class="sub">After Work Investment Strategies</p></header>
  <section class="section prose" style="margin-top:24px">
    <p>QWERTx makes the portfolios of the world's best-known investors easy to explore. Whether you are new to investing or have been doing it for years, you can start with the big picture and dig into the detail one click at a time.</p>
    <h2>Where the data comes from</h2>
    <p>Large U.S. investment managers must file a Form 13F with the SEC every quarter listing their U.S. stock positions. We read those filings directly from SEC EDGAR, match each security to its ticker, and compare it with the previous quarter to show what was bought, trimmed or sold.</p>
    <h2>What 13F data can and can't tell you</h2>
    <ul>
      <li>Filings are due 45 days after each quarter ends, so positions may have changed since.</li>
      <li>They cover long U.S. equity positions and some options. Short positions, most foreign shares, bonds and cash are not included.</li>
      <li>Values are as of the quarter end, not today's prices.</li>
      <li>Share changes are not adjusted for stock splits, so a split can look like a purchase.</li>
    </ul>
    <h2>Market mood and news</h2>
    <p>The market mood gauge shows the CNN Fear &amp; Greed Index. Headlines are gathered each morning from major financial publishers and always link to the original article.</p>
    <h2>Important</h2>
    <p>Everything on QWERTx is for information and education. It is not investment advice or a recommendation to buy or sell any security. Copying another investor's trades carries risk, especially given the filing delay. Consider speaking with a licensed financial advisor about your own situation.</p>
  </section>
</div>`;
  return { path: '/about/', title: 'About', description: 'How QWERTx sources superinvestor portfolio data from SEC 13F filings, and what that data can and cannot tell you.', body };
}

export function notFound() {
  return {
    path: '/404.html',
    title: 'Page not found',
    description: 'This page could not be found.',
    body: `<div class="wrap"><header class="page-head"><h1>Page not found</h1><p class="sub">That page doesn't exist or has moved.</p><div class="cta-row"><a class="btn btn-primary" href="/">Go home</a><a class="btn" href="/investors/">Superinvestors</a></div></header></div>`,
  };
}
