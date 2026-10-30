import { esc, money, pct, quarter } from '../lib/format.mjs';
import { chart, tkr, rankList, vRank, sourceChip, kpi, pageHero, newsletter, tip } from '../parts.mjs';
import { GUIDES } from '../guides.mjs';

export function smartMoney(d) {
  const sm = d.smart;
  const N = d.live.length;
  const top = sm.owned[0];
  const grand = d.stocks.slice(0, 30);
  const body = `${pageHero({
    guide: GUIDES.smart,
    crumbs: [['Top Stocks']],
    eyebrow: 'Smart money stats',
    h1: 'What the smartest money owns, <span class="accent">all at once</span>',
    lead: `We combine all ${N} super investor portfolios (${quarter(d.latestPeriod)}) to find consensus picks, big bets and the moves that many managers made at the same time.`,
    img: 'article-read-portfolio.jpg',
    imgAlt: 'Abstract glowing treemap blocks in gold and teal',
  })}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">Smart money at a glance</h2>
    <div class="row">
      ${kpi('Value tracked', money(sm.value), `Across ${N} portfolios`)}
      ${kpi('Positions', sm.positions.toLocaleString('en-US'), 'In the latest filings')}
      ${kpi('New positions', sm.newPositions, `Opened in ${quarter(d.latestPeriod)}`)}
      ${kpi('Avg. top-10 weight', `${Math.round(sm.avgTop10)}%`, 'Super investors concentrate')}
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-7"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>01 · Consensus</span><span>Number of investors holding</span></div><h3>The most widely owned stocks${tip('consensus')}</h3>
        ${chart('owned', 'bars', { items: sm.owned.map((s) => ({ ticker: s.label, name: s.name, value: s.owners })), unit: 'Held by {v} investors' }, { cls: 'chart chart-lg', label: top ? `Bar chart: ${top.name} is held by ${top.owners} of ${N} investors` : 'Bar chart of the most widely owned stocks' })}
        <p class="caption"><b>What this means</b>${top ? `${esc(top.name)} is owned by ${top.owners} of our ${N} investors.` : ''} Consensus isn’t proof of a good investment, but it shows where very different styles agree.</p>
      </div></div>
      <div class="col-5"><div class="card reveal" style="height:100%">
        <div class="card-label"><span>02 · Big bets</span><span>≥5% for 2+ investors</span></div><h3>Shared high-conviction bets</h3>
        ${vRank(sm.bigBets.map(({ s, n }) => ({ name: s.name, href: `/stocks/${s.slug}.html`, sub: `${esc(s.label)} · biggest bet ${Math.round(s.maxW)}% of a portfolio`, n })), { max: 8 })}
      </div></div>
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-3"><div class="card reveal" style="height:100%"><div class="card-label"><span>03 · Most bought</span><span>${quarter(d.latestPeriod)}</span></div><h3>Where buyers agreed</h3>${vRank(sm.mostBought.map((s) => ({ name: s.name, href: s.hasPage ? `/stocks/${s.slug}.html` : null, sub: `${esc(s.label)}${s.newBuyers ? ` · ${s.newBuyers} new` : ''}`, n: s.buyers })), { kind: 'buy', max: 10 })}</div></div>
      <div class="col-3"><div class="card reveal" style="height:100%"><div class="card-label"><span>04 · Most sold</span><span>${quarter(d.latestPeriod)}</span></div><h3>Where sellers agreed</h3>${vRank(sm.mostSold.map((s) => ({ name: s.name, href: s.hasPage ? `/stocks/${s.slug}.html` : null, sub: `${esc(s.label)}${s.sellers.length ? ` · ${s.sellers.length} sold out` : ''}`, n: s.sellCount })), { kind: 'sell', max: 10 })}</div></div>
      <div class="col-3"><div class="card reveal" style="height:100%"><div class="card-label"><span>05 · Biggest new bets</span><span>By value</span></div><h3>Largest fresh positions</h3>${vRank(sm.newBets.map(({ inv, h }) => ({ name: h.name, href: h.stockSlug ? `/stocks/${h.stockSlug}.html` : null, sub: `${esc(h.label)} · ${esc(inv.manager)}`, value: money(h.value) })))}</div></div>
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="card chart-card reveal">
      <div class="card-label"><span>06 · Overlap map</span><span>% of each portfolio</span></div><h3>Who owns what: ${N} investors × ${sm.heat.stocks.length} consensus stocks</h3>
      <p class="chart-sub">Brighter cells mean a bigger share of that investor’s portfolio. Empty cells mean not held.</p>
      ${chart('heat', 'heatmap', sm.heat, { style: `height:${Math.max(420, N * 30 + 80)}px`, label: `Heatmap of portfolio weights for ${N} investors across the most widely held stocks` })}
      <p class="caption"><b>What this means</b>Read across a row to see an investor’s overlap with the crowd, or down a column to see who is most committed to a stock.</p>
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row between center reveal" style="margin-bottom:20px"><div><div class="card-label" style="margin:0"><span>07 · Grand portfolio</span></div><h2 style="font-size:32px;margin:6px 0 0">Top 30 stocks across all super investors</h2></div>${sourceChip('Click a column to sort', 'fa-arrow-down-wide-short')}</div>
    <div class="table-wrap reveal"><table class="data" data-sortable>
      <caption class="sr-only">Most widely held stocks across ${N} super investors, ${quarter(d.latestPeriod)}</caption>
      <thead><tr><th class="num" scope="col">#</th><th scope="col">Stock</th><th scope="col">Sector</th><th class="num" scope="col">Owners</th><th class="num" scope="col">Max weight</th><th class="num" scope="col">Buyers / sellers</th><th class="num" scope="col">Combined value</th><th scope="col">Top holders</th></tr></thead>
      <tbody>${grand
        .map((s, i) => `<tr><td class="num" data-v="${i + 1}">${i + 1}</td><td data-v="${esc(s.label)}">${tkr(s.label, s.slug)}<div class="tkr-name">${esc(s.name)}</div></td><td data-v="${esc(s.sector)}">${esc(s.sector)}</td><td class="num" data-v="${s.owners}">${s.owners}</td><td class="num" data-v="${s.maxW.toFixed(3)}">${pct(s.maxW)}</td><td class="num" data-v="${s.buyers - s.sellCount}"><span class="up">+${s.buyers}</span> / <span class="down">−${s.sellCount}</span></td><td class="num" data-v="${s.value}">${money(s.value)}</td><td>${s.holders.slice(0, 3).map((x) => `<a href="/investors/${x.inv.slug}.html">${esc(x.inv.manager)}</a>`).join(', ')}${s.holders.length > 3 ? ` +${s.holders.length - 3}` : ''}</td></tr>`)
        .join('')}</tbody></table></div>
    <p class="form-note" style="margin-top:14px">Share classes are combined (for example GOOG and GOOGL). Sellers include full exits. Convertible bonds are excluded.</p>
  </div>
</section>
${newsletter('sm')}`;
  return { page: 'smart-money', path: '/smart-money.html', title: 'Smart Money Stats: Most Owned, Bought and Sold Stocks', description: `Consensus picks, big bets, most bought and most sold stocks across ${N} super investor portfolios from the latest 13F filings (${quarter(d.latestPeriod)}).`, body, charts: true };
}
