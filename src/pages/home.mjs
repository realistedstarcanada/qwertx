import { esc, money, date, quarter, int, cleanName, signed, upDown } from '../lib/format.mjs';
import { chart, tkr, fearGreedCard, vixCard, vixChartData, newsletter, proCta, ownersLine, vRank, vCard } from '../parts.mjs';

export function movingCard(weekly) {
  const items = weekly.moving || [];
  if (!items.length) return '';
  return `<div class="card" style="height:100%"><div class="card-label"><span>What’s moving markets</span><span>${esc(weekly.weekLabel || '')}</span></div><ul class="list-check">${items
    .map((x) => `<li><i class="fa-solid ${esc(x.icon || 'fa-chart-line')}" aria-hidden="true"></i><div><b style="color:var(--text)">${esc(x.title)}.</b> ${esc(x.text)}</div></li>`)
    .join('')}</ul><a class="link-arrow mt-32" style="display:inline-flex" href="/market.html">Open Market Pulse <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>`;
}

export function trendingCards(d, cols = 'col-2') {
  return (d.weekly.trending || [])
    .map((t) => {
      const s = d.stockByTicker.get(t.ticker);
      const owners = s && s.owners ? `<b style="color:var(--text)">${s.owners} super investor${s.owners > 1 ? 's' : ''} own it:</b> ${ownersLine(s)}` : '<b style="color:var(--text)">No tracked super investor owns it.</b>';
      const pol = d.politics.byTicker.get(t.ticker);
      const polLine = pol && pol.length ? `<br><span style="color:var(--muted)">Members of Congress disclosed ${pol.length} trade${pol.length > 1 ? 's' : ''} recently.</span>` : '';
      return `<div class="${cols}"><article class="card angle reveal">
  <div class="tick">${tkr(t.ticker, s?.slug)}<span class="time-badge"><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(t.date || '')}</span></div>
  <h3>${esc(t.title)}</h3>
  <p><span class="lbl">What happened</span>${esc(t.happened)}</p>
  <p><span class="lbl">What it could mean</span>${esc(t.means)}</p>
  <div class="owners">${owners}${t.note ? `<br><span style="color:var(--gold)">${esc(t.note)}</span>` : ''}${polLine}</div>
</article></div>`;
    })
    .join('');
}

export function home(d) {
  const m = d.market || {};
  const sm = d.smart;
  const live = d.live;
  const N = live.length;
  const pq = d.politics.quarters[0];
  const iq = d.insiders;
  const q = quarter(d.latestPeriod);
  const stockSub = (s, extra) => `${s.ticker ? esc(s.ticker) + ' · ' : ''}${extra}`;
  const slugFor = (t) => {
    const s = d.stockByTicker.get(t);
    return s?.hasPage ? s.slug : null;
  };
  const n2 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const mostHeld = vRank(sm.owned.slice(0, 10).map((s) => ({ name: s.name, href: `/stocks/${s.slug}.html`, sub: stockSub(s, `${money(s.value)} combined`), n: s.owners })), { max: 12 });
  const buys = vRank(sm.mostBought.slice(0, 8).map((s) => ({ name: s.name, href: s.hasPage ? `/stocks/${s.slug}.html` : null, sub: stockSub(s, s.newBuyers ? `${s.newBuyers} new position${s.newBuyers > 1 ? 's' : ''}` : 'added to existing'), n: s.buyers })), { kind: 'buy' });
  const sells = vRank(sm.mostSold.slice(0, 8).map((s) => ({ name: s.name, href: s.hasPage ? `/stocks/${s.slug}.html` : null, sub: stockSub(s, `${s.sellers.length} sold out, ${s.sellCount - s.sellers.length} trimmed`), n: s.sellCount })), { kind: 'sell' });
  const congress = pq
    ? vRank(pq.mostBought.slice(0, 8).map((r) => ({ name: r.name, href: slugFor(r.ticker) ? `/stocks/${slugFor(r.ticker)}.html` : null, sub: `${esc(r.ticker)} · ${r.buys} purchase${r.buys > 1 ? 's' : ''}${r.parties.D && r.parties.R ? ' · both parties' : r.parties.D ? ' · Democrats' : r.parties.R ? ' · Republicans' : ''}`, n: r.buyers })), { kind: 'blue', empty: 'Trades appear after the first disclosure update.' })
    : '<p class="form-note">Trades appear after the first disclosure update.</p>';
  const clusters = iq
    ? vRank(iq.clusterBuys.slice(0, 8).map((c) => ({ name: cleanName(c.company), href: slugFor(c.ticker) ? `/stocks/${slugFor(c.ticker)}.html` : null, sub: `${esc(c.ticker)} · ${money(c.value)} bought`, n: c.insiders })), { kind: 'buy', empty: 'No cluster buys this quarter.' })
    : '<p class="form-note">Insider data appears after the first quarterly update.</p>';
  const idx = (m.indexes || []).slice(0, 4);

  const body = `
<section class="v-hero">
  <div class="container">
    <div class="v-hero-grid">
      <div>
        <div class="eyebrow">Superinvestor portfolios, decoded</div>
        <h1>See what the world’s best investors <em>actually own.</em></h1>
        <p class="lede">QWERTx tracks the latest SEC filings of ${N} legendary investors, plus what members of Congress and company insiders are buying, and turns it all into clear visuals. Start simple, then go one click deeper whenever you want.</p>
        <div class="btn-row">
          <a class="btn btn-gold" href="/investors.html">Browse superinvestors</a>
          <a class="btn" href="/smart-money.html">Most-held stocks</a>
        </div>
      </div>
      ${fearGreedCard(m.fearGreed)}
    </div>
    <div class="v-stats">
      <div><span class="k">Superinvestors</span><span class="v">${N}</span></div>
      <div><span class="k">Combined 13F value</span><span class="v">${money(sm.value)}</span></div>
      <div><span class="k">Latest quarter</span><span class="v">${q}</span></div>
      <div><span class="k">Last filing</span><span class="v">${date(d.latestFiling)}</span></div>
    </div>
  </div>
</section>

<section class="section-sm">
  <div class="container">
    <div class="v-block" style="margin-top:16px">
      <div class="v-head"><div><h2>Most held by superinvestors</h2><p>Stocks owned by the most managers we track · share classes combined</p></div><a class="v-more" href="/smart-money.html">All stocks</a></div>
      <div class="card">${mostHeld}</div>
    </div>

    <div class="v-block v-two">
      <div><div class="v-head"><div><h2>Biggest buys</h2><p>Most managers adding or opening, ${q}</p></div></div><div class="card">${buys}</div></div>
      <div><div class="v-head"><div><h2>Biggest sells</h2><p>Most managers trimming or exiting</p></div></div><div class="card">${sells}</div></div>
    </div>

    <div class="v-block">
      <div class="v-head"><div><h2>Superinvestors</h2><p>Click any manager for the full portfolio, charts and history</p></div><a class="v-more" href="/investors.html">Compare all ${N}</a></div>
      <div class="v-grid">${live.slice(0, 12).map(vCard).join('')}</div>
    </div>

    <div class="v-block v-two">
      <div><div class="v-head"><div><h2>What Congress is buying</h2><p>Members of Congress buying, ${pq ? esc(pq.label) : 'latest quarter'} · STOCK Act filings</p></div><a class="v-more" href="/politicians.html">All trades</a></div><div class="card">${congress}</div></div>
      <div><div class="v-head"><div><h2>Insider cluster buys</h2><p>Officers and directors buying their own stock, ${iq ? esc(iq.label) : 'latest quarter'}</p></div><a class="v-more" href="/insiders.html">All insiders</a></div><div class="card">${clusters}</div></div>
    </div>

    <div class="v-block">
      <div class="v-head"><div><h2>Market pulse</h2><p>The VIX “fear gauge” over the last 12 months and where the major indexes closed</p></div><a class="v-more" href="/market.html">Market Pulse</a></div>
      <div class="v-pulse">
        ${vixCard(m.vix)}
        <div class="card chart-card"><div class="card-label"><span>VIX · last 12 months</span><span>Cboe daily close</span></div>
          ${m.vix ? chart('vix-home', 'vix', vixChartData(m.vix), { cls: 'chart chart-sm', label: 'Line chart of the VIX over the last 12 months' }) : '<p class="form-note">Chart appears after the first market update.</p>'}
        </div>
      </div>
      ${idx.length ? `<div class="v-idx">${idx.map((x) => `<div><div class="n">${esc(x.name)}</div><div class="v">${n2(x.value)}</div><div class="c ${upDown(x.change)}">${signed(x.change * 100, 2)}</div></div>`).join('')}</div>` : ''}
    </div>

    ${(d.weekly.trending || []).length ? `<div class="v-block">
      <div class="v-head"><div><h2>Trending stocks, explained</h2><p>What happened, what it could mean and which super investors own it · ${esc(d.weekly.weekLabel || '')}</p></div></div>
      <div class="row">${trendingCards(d)}</div>
    </div>` : ''}

    <div class="v-block">
      <div class="v-head"><div><h2>Market news</h2><p>${d.news.updatedAt ? `Updated ${date(d.news.updatedAt)}` : 'Updated daily'}</p></div><a class="v-more" href="/market.html">All headlines</a></div>
      <div class="card">${d.news.items.length ? `<ul class="v-news">${d.news.items.slice(0, 8).map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener nofollow">${esc(n.title)}</a><div class="meta"><span class="src">${esc(n.source)}</span>${n.published ? `<time data-rel datetime="${esc(n.published)}">${date(n.published)}</time>` : ''}</div></li>`).join('')}</ul>` : '<p class="form-note">Headlines appear after the first daily update.</p>'}</div>
    </div>
  </div>
</section>
${proCta}
${newsletter('n')}`;

  return {
    page: 'home',
    path: '/',
    title: 'Home',
    description: `See what Warren Buffett, Bill Ackman and ${N - 2} other super investors own, what politicians and corporate insiders are buying, plus a live Fear & Greed gauge and daily market news.`,
    body,
    charts: true,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'QWERTx', alternateName: 'QWERTx — After Work Investment Strategies', url: 'https://qwertx.com/' },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'QWERTx', url: 'https://qwertx.com/', logo: 'https://qwertx.com/assets/img/logo-mark-512.png', slogan: 'After Work Investment Strategies' },
    ],
  };
}

/** "SMITH JOHN A" -> "John A Smith" for SEC reporting-owner names. */
export function titleish(name) {
  // SEC lists people as "LAST FIRST MIDDLE"; entities are left as they are.
  const s = String(name || '').trim();
  const entity = /\b(inc|llc|l\.?p|ltd|corp|corporation|trust|fund|partners|capital|holdings|group|co|company|plc|n\.?v|s\.?a|ag|gmbh|management|advisors|ventures|foundation|bank)\b\.?/i.test(s) || s.includes(',');
  const parts = s.split(/\s+/).map((w) => (/[a-z]/.test(s) ? w : w.charAt(0) + w.slice(1).toLowerCase()));
  if (entity) return /[a-z]/.test(s) ? s : parts.join(' ');
  return parts.length >= 2 ? [...parts.slice(1), parts[0]].join(' ') : parts.join(' ');
}
