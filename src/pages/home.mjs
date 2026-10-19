import { esc, money, date, quarter, int } from '../lib/format.mjs';
import { tvWidget } from '../layout.mjs';
import { chart, tkr, invCard, fearGreedCard, vixCard, vixChartData, indexCard, newsletter, proCta, ownersLine, partyChip } from '../parts.mjs';

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
  const pq = d.politics.quarters[0];
  const iq = d.insiders;
  const box = (icon, label, s, line, sub) =>
    s
      ? `<div class="col-4"><div class="card icon-box card-hover reveal" style="height:100%">
  <div class="icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></div>
  <div class="card-label"><span>${label}</span></div>
  <h3>${tkr(s.label, s.slug)} <span style="font-weight:500;color:var(--muted);font-size:16px">${esc(s.name)}</span></h3>
  <p style="color:var(--text);font-family:var(--font-mono);font-size:14px;margin-bottom:6px">${line}</p>
  <p>${sub}</p>
</div></div>`
      : '';
  const names = (arr) => {
    const n = arr.map((x) => x.inv.manager);
    return n.length > 3 ? `${n.slice(0, 3).join(', ')} and others` : n.join(', ').replace(/, ([^,]*)$/, ' and $1');
  };
  const mb = sm.mostBought[0];
  const ms = sm.mostSold[0];
  const mo = sm.owned[0];
  const nb = sm.newBets[0];

  const body = `
<section class="hero">
  <div class="hero-bg grid"><img src="/assets/img/hero-home.jpg" alt="A home office at night with stock charts glowing on a laptop and monitor, and a city skyline through the window" width="1672" height="941" fetchpriority="high"></div>
  <div class="container">
    <div class="row row-wide center hero-split">
      <div class="col-7"><div class="hero-content">
        <div class="status-pill" data-market-status><span class="status-dot" aria-hidden="true"></span><span class="status-text">Markets closed · your after-work briefing is ready</span></div>
        <h1>See what the world’s best investors own. <span class="accent">In the time you have after work.</span></h1>
        <p class="lead">QWERTx turns the quarterly SEC filings of ${live.length} legendary investors into clear visuals, and tracks what politicians and company insiders are buying, plus live market sentiment and plain-English news.</p>
        <div class="btn-row mt-32">
          <a class="btn btn-gold" href="/investors.html">Explore super investors <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
          <a class="btn" href="/market.html"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i> Check market mood</a>
        </div>
        <div class="hero-meta"><span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Sourced from SEC, House and Senate filings</span><span><i class="fa-solid fa-rotate" aria-hidden="true"></i>Latest period: ${quarter(d.latestPeriod)}</span><span><i class="fa-solid fa-ban" aria-hidden="true"></i>No paid picks</span></div>
      </div></div>
      <div class="col-5 hero-gauge">${fearGreedCard(m.fearGreed)}</div>
    </div>
  </div>
</section>

<section class="trust" aria-label="QWERTx at a glance">
  <div class="container"><div class="row">
    <div class="trust-item"><div class="counter"><span data-count="${live.length}">${live.length}</span></div><div class="counter-label">Super investors tracked</div></div>
    <div class="trust-item"><div class="counter"><span class="unit">$</span><span data-count="${Math.round(sm.value / 1e9)}">${Math.round(sm.value / 1e9)}</span><span class="unit">B</span></div><div class="counter-label">Portfolio value tracked</div></div>
    <div class="trust-item"><div class="counter"><span data-count="${d.politics.totalTrades}">${d.politics.totalTrades}</span></div><div class="counter-label">Politician trades tracked</div></div>
    <div class="trust-item"><div class="counter"><span data-count="${iq ? iq.totals.buys + iq.totals.sells : 0}">${iq ? int(iq.totals.buys + iq.totals.sells) : 0}</span></div><div class="counter-label">Insider trades ${iq ? 'in ' + iq.label : 'per quarter'}</div></div>
  </div></div>
</section>

<section class="section bg-grid" id="market-pulse">
  <div class="container">
    <div class="section-head reveal">
      <div><div class="eyebrow"><span class="num">01</span> / Market pulse</div><h2>How scared is the market today?</h2></div>
      <p>The VIX measures how much turbulence investors expect over the next 30 days. We translate it into a simple fear-and-greed reading, next to CNN’s Fear &amp; Greed Index above.</p>
    </div>
    <div class="row">
      <div class="col-4 reveal">${vixCard(m.vix)}</div>
      <div class="col-7 reveal" style="flex-grow:2">
        <div class="card chart-card" style="height:100%">
          <div class="card-label"><span>VIX · last 12 months</span><span>Daily close</span></div>
          <h3>Fear spikes fade, but they come back</h3>
          <p class="chart-sub">Shaded bands show the fear-and-greed zones. Hover to read any day.</p>
          ${m.vix ? chart('vix-home', 'vix', vixChartData(m.vix), { cls: 'chart chart-sm', label: 'Line chart of the VIX over the last 12 months' }) : '<p class="form-note">Chart appears after the first market update.</p>'}
        </div>
      </div>
    </div>
    <div class="row mt-32">
      <div class="col-5 reveal">${indexCard(m)}</div>
      <div class="col-7 reveal">${movingCard(d.weekly)}</div>
    </div>
  </div>
</section>

<section class="section section-alt" id="investors">
  <div class="container">
    <div class="section-head reveal">
      <div><div class="eyebrow"><span class="num">02</span> / Super investors</div><h2>Legendary portfolios, decoded</h2></div>
      <p>Each card shows the latest filing date, portfolio size, conviction level and the top three holdings. Open one for the full visual breakdown.</p>
    </div>
    <div class="row">${live.slice(0, 12).map((i) => invCard(i)).join('')}</div>
    <div class="text-center mt-48"><a class="btn btn-gold" href="/investors.html">View all ${live.length} super investors <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head reveal">
      <div><div class="eyebrow"><span class="num">03</span> / This quarter</div><h2>Smart money moves in ${quarter(d.latestPeriod)}</h2></div>
      <p>Computed across all ${live.length} portfolios by comparing each investor’s latest 13F with the quarter before.</p>
    </div>
    <div class="row">
      ${box('fa-arrow-trend-up', 'Most bought', mb, `${mb?.buyers} investors bought or added`, mb ? `Bought by ${names(mb.holders.filter((x) => x.act === 'New' || x.act === 'Add'))}.` : '')}
      ${box('fa-arrow-trend-down', 'Most sold', ms, `${ms?.sellCount} investors trimmed or exited`, ms ? `Sold by ${names([...ms.holders.filter((x) => x.act === 'Trim'), ...ms.sellers])}.` : '')}
      ${box('fa-users', 'Most widely owned', mo, `Held by ${mo?.owners} of ${live.length} investors`, mo ? `Combined stake worth ${money(mo.value)} across our tracked portfolios.` : '')}
      ${nb ? box('fa-bolt', 'Biggest new bet', d.stockByTicker.get(nb.h.ticker) || { label: nb.h.label, name: nb.h.name }, `${money(nb.h.value)} new position`, `Opened by ${esc(nb.inv.manager)} (${esc(nb.inv.firm)}) in ${quarter(nb.inv.p.period)}.`) : ''}
    </div>
    <div class="text-center mt-48"><a class="btn" href="/smart-money.html">See all smart money stats <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head reveal">
      <div><div class="eyebrow"><span class="num">04</span> / Follow the insiders</div><h2>What politicians and executives are buying</h2></div>
      <p>Members of Congress must disclose stock trades under the STOCK Act; company insiders file SEC Form 4. We turn both into a quarterly scoreboard.</p>
    </div>
    <div class="row">
      <div class="col-2"><div class="card reveal" style="height:100%">
        <div class="card-label"><span>Politicians</span><span>${pq ? esc(pq.label) : 'Latest'}</span></div>
        <h3>Most bought by members of Congress</h3>
        ${pq && pq.mostBought.length ? `<ul class="rank-list">${pq.mostBought.slice(0, 6).map((r, i) => `<li><span class="r">${String(i + 1).padStart(2, '0')}</span><span class="t">${tkr(r.ticker, r.stock?.slug)}<small>${esc(r.name)}</small></span><span class="v"><span class="up">${r.buyers} buying</span></span></li>`).join('')}</ul>` : '<p class="form-note">Trades appear after the first disclosure update.</p>'}
        <a class="link-arrow mt-32" style="display:inline-flex" href="/politicians.html">All politician trades <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      </div></div>
      <div class="col-2"><div class="card reveal" style="height:100%">
        <div class="card-label"><span>Corporate insiders</span><span>${iq ? esc(iq.label) : 'Latest'}</span></div>
        <h3>Largest insider purchases</h3>
        ${iq ? `<ul class="rank-list">${iq.topBuys.slice(0, 6).map((t, i) => `<li><span class="r">${String(i + 1).padStart(2, '0')}</span><span class="t">${tkr(t.ticker, d.stockByTicker.get(t.ticker)?.hasPage ? d.stockByTicker.get(t.ticker).slug : null)}<small>${esc(titleish(t.owner))} · ${esc(t.role)}</small></span><span class="v"><span class="up">${money(t.value)}</span></span></li>`).join('')}</ul>` : '<p class="form-note">Insider data appears after the first quarterly update.</p>'}
        <a class="link-arrow mt-32" style="display:inline-flex" href="/insiders.html">All insider trades <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      </div></div>
    </div>
  </div>
</section>

${(d.weekly.trending || []).length ? `<section class="section">
  <div class="container">
    <div class="section-head reveal">
      <div><div class="eyebrow"><span class="num">05</span> / Smart money angle</div><h2>Trending stocks, and what they mean</h2></div>
      <p>The stories moving markets this week, explained in plain English and matched with the super investors who own each stock.</p>
    </div>
    <div class="row">${trendingCards(d)}</div>
  </div>
</section>` : ''}

<section class="section section-alt">
  <div class="container">
    <div class="section-head reveal">
      <div><div class="eyebrow"><span class="num">06</span> / Live feed</div><h2>Latest market news and today’s movers</h2></div>
      <p>Streaming headlines and the most active US stocks, updated throughout the trading day.</p>
    </div>
    <div class="row">
      <div class="col-7 reveal"><div class="widget-frame"><div class="widget-head"><span>Market news</span><span class=live>Live</span></div>${tvWidget('embed-widget-timeline.js', { feedMode: 'market', market: 'stock', isTransparent: true, displayMode: 'regular', width: '100%', height: '100%', colorTheme: 'dark', locale: 'en' }, { height: 520 })}</div></div>
      <div class="col-5 reveal"><div class="widget-frame"><div class="widget-head"><span>Trending US stocks</span><span class=live>Live</span></div>${tvWidget('embed-widget-hotlists.js', { colorTheme: 'dark', dateRange: '1D', exchange: 'US', showChart: true, locale: 'en', largeChartUrl: '', isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, width: '100%', height: '100%' }, { height: 520 })}</div></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="text-center maxw-640 mx-auto mb-48 reveal"><div class="eyebrow"><span class="num">07</span> / How it works</div><h2>From public filing to clear insight</h2><p class="lead">Built for people with day jobs: everything you need in one short session.</p></div>
    <div class="row">
      <div class="col-3"><div class="card icon-box reveal" style="height:100%"><span class="step-num">01</span><div class="icon"><i class="fa-solid fa-file-contract" aria-hidden="true"></i></div><h3>Filings land</h3><p>Fund managers file 13Fs every quarter, insiders file Form 4 within two business days, and members of Congress disclose trades within 45 days.</p></div></div>
      <div class="col-3"><div class="card icon-box reveal" style="height:100%"><span class="step-num">02</span><div class="icon"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i></div><h3>We decode the data</h3><p>We read each filing straight from the official source, compare it with the last one and calculate conviction, turnover and consensus, all shown as clear visuals.</p></div></div>
      <div class="col-3"><div class="card icon-box reveal" style="height:100%"><span class="step-num">03</span><div class="icon"><i class="fa-solid fa-mug-hot" aria-hidden="true"></i></div><h3>You decide in minutes</h3><p>Read the 30-second summary, explore the charts and check the original filing yourself. Then do your own research.</p></div></div>
    </div>
  </div>
</section>
${proCta}
${newsletter('n')}`;

  return {
    page: 'home',
    path: '/',
    title: 'Home',
    description: `Track what Warren Buffett, Bill Ackman and ${live.length - 2} other super investors own, what politicians and corporate insiders are buying, plus a live fear and greed gauge and plain-English market news.`,
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
