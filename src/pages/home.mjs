import { esc, money, date, quarter, int, cleanName, signed, upDown } from '../lib/format.mjs';
import { chart, tkr, fearGreedCard, vixCard, vixChartData, newsletter, proCta, ownersLine, vRank, vCard, tip } from '../parts.mjs';

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

/** "This week in 60 seconds": four plain sentences, generated from the data. */
export function brief(d) {
  const m = d.market || {};
  const fg = m.fearGreed;
  const sm = d.smart;
  const N = d.live.length;
  const mb = sm.mostBought[0];
  const pq = d.politics.quarters[0];
  const pb = pq?.mostBought[0];
  const iq = d.insiders;
  const cb = iq?.clusterBuys[0];
  const page = (t) => {
    const s = d.stockByTicker.get(t);
    return s?.hasPage ? `/stocks/${s.slug}.html` : null;
  };
  const items = [
    fg && { icon: 'fa-gauge-high', k: 'Market mood', text: `Investors are in <b>${esc(fg.rating)}</b> mode (${fg.score}/100)${m.vix ? `, and the VIX closed at ${m.vix.last.toFixed(1)}` : ''}.`, href: '/market.html', cta: 'Market mood' },
    mb && { icon: 'fa-briefcase', k: 'Fund managers', text: `<b>${mb.buyers} of ${N}</b> top fund managers bought more <b>${esc(mb.name)}</b> in ${quarter(d.latestPeriod)}.`, href: page(mb.ticker) || '/smart-money.html', cta: 'See who' },
    pb && { icon: 'fa-landmark', k: 'Politicians', text: `<b>${pb.buyers} members of Congress</b> bought <b>${esc(pb.name)}</b>, the most-bought stock in ${esc(pq.label)}.`, href: page(pb.ticker) || '/politicians.html', cta: 'See trades' },
    cb && { icon: 'fa-user-tie', k: 'Insiders', text: `<b>${cb.insiders} executives</b> at <b>${esc(cleanName(cb.company))}</b> bought their own company’s stock in ${esc(iq.label)}.`, href: page(cb.ticker) || '/insiders.html', cta: 'See insiders' },
  ].filter(Boolean);
  if (!items.length) return '';
  return `<section class="v-brief-wrap" aria-labelledby="brief-h">
  <div class="container">
    <div class="v-brief">
      <div class="v-brief-head"><h2 id="brief-h">This week in 60 seconds</h2><span>Updated automatically from the latest filings</span></div>
      <div class="v-brief-grid">${items.map((x) => `<a class="v-brief-item" href="${x.href}"><span class="ic"><i class="fa-solid ${x.icon}" aria-hidden="true"></i></span><span class="k">${x.k}</span><p>${x.text}</p><span class="go">${x.cta} →</span></a>`).join('')}</div>
    </div>
  </div>
</section>`;
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
        <div class="eyebrow">After Work Investment Strategies</div>
        <h1>Follow the smart money, <em>not the noise.</em></h1>
        <p class="lede">For busy professionals who can’t watch the market all day. See what top fund managers, politicians and company insiders are actually buying, straight from official filings and explained in plain language.</p>
        <form class="v-search" role="search" action="/smart-money.html" data-search autocomplete="off">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" name="q" placeholder="Search a stock: Apple, NVDA, Tesla…" aria-label="Search a stock by name or ticker" aria-autocomplete="list" aria-controls="search-results" aria-expanded="false">
          <ul class="v-search-results" id="search-results" role="listbox" hidden></ul>
        </form>
        <div class="btn-row">
          <a class="btn btn-gold" href="/smart-money.html">See what they’re buying</a>
          <a class="btn" href="/investors.html">Browse superinvestors</a>
        </div>
        <ul class="v-proof">
          <li><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Official filings only</li>
          <li><i class="fa-solid fa-rotate" aria-hidden="true"></i>Updated automatically</li>
          <li><i class="fa-regular fa-clock" aria-hidden="true"></i>5-minute reads</li>
        </ul>
      </div>
      ${fearGreedCard(m.fearGreed)}
    </div>
  </div>
</section>

${brief(d)}

<section class="section-sm">
  <div class="container">
    <div class="v-block" style="margin-top:8px">
      <div class="v-head"><div><h2>Most held by fund managers ${tip('consensus')}</h2><p>From ${q} 13F filings ${tip('13F')} · filed by ${date(d.latestFiling)}</p></div><a class="v-more" href="/smart-money.html">All stocks</a></div>
      <div class="card">${mostHeld}</div>
    </div>

    <div class="v-block v-two">
      <div><div class="v-head"><div><h2>Biggest buys</h2><p>Most managers adding or opening, ${q}</p></div></div><div class="card">${buys}</div></div>
      <div><div class="v-head"><div><h2>Biggest sells</h2><p>Most managers trimming or exiting</p></div></div><div class="card">${sells}</div></div>
    </div>

    <div class="v-block">
      <div class="v-head"><div><h2>Fund managers we track</h2><p>Click any manager for the full portfolio, charts and history</p></div><a class="v-more" href="/investors.html">Compare all ${N}</a></div>
      <div class="v-grid">${live.slice(0, 12).map(vCard).join('')}</div>
    </div>

    <div class="v-block v-two">
      <div><div class="v-head"><div><h2>What Congress is buying ${tip('STOCK Act')}</h2><p>Members buying in ${pq ? esc(pq.label) : 'the latest quarter'} · disclosed through ${date(d.politics.lastFiled)}</p></div><a class="v-more" href="/politicians.html">All trades</a></div><div class="card">${congress}</div></div>
      <div><div class="v-head"><div><h2>Insider cluster buys ${tip('cluster')}</h2><p>Executives buying their own company’s stock · SEC Form 4, ${iq ? esc(iq.label) : 'latest quarter'}</p></div><a class="v-more" href="/insiders.html">All insiders</a></div><div class="card">${clusters}</div></div>
    </div>

    <div class="v-block">
      <div class="v-head"><div><h2>Market pulse ${tip('VIX')}</h2><p>The VIX “fear gauge” over 12 months and where the major indexes closed${m.vix ? ` · close ${date(m.vix.lastDate)}` : ''}</p></div><a class="v-more" href="/market.html">Market Pulse</a></div>
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
    description: `After Work Investment Strategies: follow the smart money, not the noise. See what top fund managers, members of Congress and company insiders are buying, from official filings, in plain English.`,
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
