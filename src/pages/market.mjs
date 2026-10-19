import { esc, date } from '../lib/format.mjs';
import { tvWidget } from '../layout.mjs';
import { chart, fearGreedCard, vixCard, vixChartData, indexCard, pageHero, newsletter } from '../parts.mjs';
import { trendingCards } from './home.mjs';

export function market(d) {
  const m = d.market || {};
  const w = d.weekly;
  const moving = (w.moving || []).map((x) => `<div class="col-3"><div class="card icon-box reveal" style="height:100%"><div class="icon"><i class="fa-solid ${esc(x.icon || 'fa-chart-line')}" aria-hidden="true"></i></div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div></div>`).join('');
  const news = (d.news.items || []).slice(0, 12);
  const body = `${pageHero({
    crumbs: [['Market Pulse']],
    eyebrow: 'Market pulse',
    h1: 'Market mood, <span class="accent">in one glance</span>',
    lead: 'CNN’s Fear &amp; Greed Index, a fear-and-greed reading built on the VIX, the stories moving markets and live data streams, explained for people too busy to watch the market all day.',
    img: 'market-pulse.jpg',
    imgAlt: 'Flowing waves of gold and teal light across a dark background, representing market sentiment',
  })}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">Market mood today</h2>
    <div class="row">
      <div class="col-4 reveal">${fearGreedCard(m.fearGreed, { compact: true })}</div>
      <div class="col-4 reveal">${vixCard(m.vix)}</div>
      <div class="col-4 reveal">${indexCard(m)}</div>
    </div>
    <div class="row mt-32">
      <div class="col reveal"><div class="card chart-card">
        <div class="card-label"><span>VIX · 12 months</span><span>Cboe daily close</span></div><h3>The fear gauge over the past year</h3>
        ${m.vix ? chart('vix', 'vix', vixChartData(m.vix), { label: 'VIX line chart over the last 12 months with fear and greed bands' }) : '<p class="form-note">Chart appears after the first market update.</p>'}
      </div></div>
    </div>
    <div class="row mt-32">
      <div class="col-5 reveal"><div class="card" style="height:100%"><div class="card-label"><span>How to read the VIX</span></div><h3>Fear and greed zones</h3><ul class="rank-list">${[
        ['#14A08F', 'Extreme greed', 'Unusually calm. Complacency can build.', 'Below 12'],
        ['#2DD4BF', 'Greed', 'Calm markets, steady prices.', '12 – 15'],
        ['#8A93A8', 'Neutral', 'Normal day-to-day turbulence.', '15 – 20'],
        ['#F08A5D', 'Fear', 'Investors pay up for protection.', '20 – 30'],
        ['#E5484D', 'Extreme fear', 'Panic selling, sharp daily swings.', 'Above 30'],
      ].map(([c, n, s, v]) => `<li><span class="r"><i class="fa-solid fa-circle" style="color:${c};font-size:10px" aria-hidden="true"></i></span><span class="t"><b style="color:var(--text)">${n}</b><small>${s}</small></span><span class="v">VIX ${v}</span></li>`).join('')}</ul></div></div>
      <div class="col-7 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Today’s headlines</span><span>${d.news.updatedAt ? 'Updated ' + date(d.news.updatedAt) : ''}</span></div><h3>What the financial press is covering</h3>
        ${news.length ? `<ul class="rank-list news-rank">${news.map((n) => `<li><span class="t"><a href="${esc(n.link)}" target="_blank" rel="noopener nofollow" style="color:var(--text)">${esc(n.title)}</a><small>${esc(n.source)}${n.published ? ' · <time data-rel datetime="' + esc(n.published) + '">' + date(n.published) + '</time>' : ''}</small></span></li>`).join('')}</ul>` : '<p class="form-note">Headlines appear after the first daily update.</p>'}
      </div></div>
    </div>
  </div>
</section>
${moving ? `<section class="section-sm">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:28px"><div><div class="eyebrow">This week</div><h2 style="font-size:36px">What’s moving markets</h2></div><p>${esc(w.weekLabel || '')}</p></div>
    <div class="row">${moving}</div>
  </div>
</section>` : ''}
<section class="section-sm">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:28px"><div><div class="eyebrow">Live</div><h2 style="font-size:36px">Live market dashboard</h2></div><p>These panels stream live data from TradingView during market hours.</p></div>
    <div class="row">
      <div class="col-2 reveal"><div class="widget-frame"><div class="widget-head"><span>VIX · live</span><span class=live>Live</span></div>${tvWidget('embed-widget-mini-symbol-overview.js', { symbol: 'CAPITALCOM:VIX', width: '100%', height: '100%', locale: 'en', dateRange: '1M', colorTheme: 'dark', isTransparent: true, autosize: true, largeChartUrl: '' }, { height: 300 })}</div></div>
      <div class="col-2 reveal"><div class="widget-frame"><div class="widget-head"><span>S&amp;P 500 sentiment gauge</span><span class=live>Live</span></div>${tvWidget('embed-widget-technical-analysis.js', { interval: '1D', width: '100%', isTransparent: true, height: '100%', symbol: 'FOREXCOM:SPXUSD', showIntervalTabs: true, displayMode: 'single', locale: 'en', colorTheme: 'dark' }, { height: 300 })}</div></div>
    </div>
    <div class="row mt-32">
      <div class="col reveal"><div class="widget-frame"><div class="widget-head"><span>S&amp;P 500 heatmap · today</span><span class=live>Live</span></div>${tvWidget('embed-widget-stock-heatmap.js', { exchanges: [], dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change', locale: 'en', symbolUrl: '', colorTheme: 'dark', hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%' }, { height: 520 })}</div></div>
    </div>
    <div class="row mt-32">
      <div class="col-7 reveal"><div class="widget-frame"><div class="widget-head"><span>Market news</span><span class=live>Live</span></div>${tvWidget('embed-widget-timeline.js', { feedMode: 'market', market: 'stock', isTransparent: true, displayMode: 'regular', width: '100%', height: '100%', colorTheme: 'dark', locale: 'en' }, { height: 560 })}</div></div>
      <div class="col-5 reveal"><div class="widget-frame"><div class="widget-head"><span>Economic calendar · US &amp; Canada</span><span class=live>Live</span></div>${tvWidget('embed-widget-events.js', { colorTheme: 'dark', isTransparent: true, width: '100%', height: '100%', locale: 'en', importanceFilter: '0,1', countryFilter: 'us,ca' }, { height: 560 })}</div></div>
    </div>
  </div>
</section>
${(w.trending || []).length ? `<section class="section-sm">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:28px"><div><div class="eyebrow">Smart money angle</div><h2 style="font-size:36px">Trending stocks, explained</h2></div><p>What happened, what it could mean and which super investors own it.</p></div>
    <div class="row">${trendingCards(d)}</div>
  </div>
</section>` : ''}
<section class="section">
  <div class="container">
    <div class="row row-wide">
      <div class="col-5 reveal"><div class="eyebrow">FAQ</div><h2>Reading the market without the noise</h2><p class="lead">Short answers to the questions we hear most from busy investors.</p><a class="link-arrow" href="/insights/vix-explained-fear-and-greed.html">Read: VIX explained <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>
      <div class="col-7 reveal"><div class="accordion">
        <details open><summary>What is the VIX?</summary><div class="acc-body">The Cboe Volatility Index measures how much movement options traders expect from the S&amp;P 500 over the next 30 days. It rises when investors rush to buy protection, which is why it’s called the fear gauge.</div></details>
        <details><summary>How is the QWERTx market mood calculated?</summary><div class="acc-body">We map the latest VIX close onto five zones: below 12 extreme greed, 12–15 greed, 15–20 neutral, 20–30 fear and above 30 extreme fear. It is a simple, transparent rule of thumb, not a prediction.</div></details>
        <details><summary>How is that different from CNN’s Fear &amp; Greed Index?</summary><div class="acc-body">CNN’s index blends seven indicators, including momentum, market breadth, put/call ratios, junk bond demand and the VIX. We show both: CNN’s for the broad picture, and our VIX reading because you can check it yourself.</div></details>
        <details><summary>Should I buy when the market is fearful?</summary><div class="acc-body">Fear often creates better prices for long-term investors, but nobody can reliably time the bottom. Decide based on your own plan, time horizon and risk tolerance, ideally with a registered advisor.</div></details>
      </div></div>
    </div>
  </div>
</section>
${newsletter('mk')}`;
  return { page: 'market', path: '/market.html', title: 'Market Pulse: Fear & Greed Index, VIX and Market News', description: 'Today’s market mood from the CNN Fear & Greed Index and the VIX, index closes, live market dashboards and the stories moving markets this week.', body, charts: true };
}
