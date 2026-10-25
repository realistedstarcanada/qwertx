// Page chrome from the original QWERTx design: ticker tape, sticky header, mobile menu, footer.
import { esc, money, date, signed, upDown } from './lib/format.mjs';

export const NAV = [
  ['/investors.html', 'Fund Managers', 'investors'],
  ['/smart-money.html', 'Top Stocks', 'smart-money'],
  ['/politicians.html', 'Politicians', 'politicians'],
  ['/insiders.html', 'Insiders', 'insiders'],
  ['/market.html', 'Market Mood', 'market'],
  ['/calendar.html', 'Calendar', 'calendar'],
  ['/insights.html', 'Learn', 'insights'],
  ['/pro.html', 'Pro', 'pro'],
];
const MOBILE = [['/', 'Home', 'home'], ...NAV, ['/about.html', 'About', 'about'], ['/contact.html', 'Contact', 'contact']];

const TAPE_SYMBOLS = [
  ['FOREXCOM:SPXUSD', 'S&P 500'], ['FOREXCOM:NSXUSD', 'Nasdaq 100'], ['FOREXCOM:DJI', 'Dow 30'], ['CAPITALCOM:VIX', 'VIX'],
  ['TVC:USOIL', 'WTI Oil'], ['OANDA:XAUUSD', 'Gold'], ['NASDAQ:AAPL', 'Apple'], ['NYSE:BRK.B', 'Berkshire B'],
  ['NASDAQ:GOOGL', 'Alphabet'], ['NASDAQ:AMZN', 'Amazon'], ['NASDAQ:META', 'Meta'], ['NYSE:V', 'Visa'], ['BITSTAMP:BTCUSD', 'Bitcoin'],
];

export function tvWidget(script, config, { height, fallback = 'Live market widget loads here when you are online.' } = {}) {
  return `<div class="widget-body"${height ? ` style="height:${height}px"` : ''}>
  <div class="widget-fallback"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i>${esc(fallback)}</div>
  <div class="tradingview-widget-container" style="height:100%;width:100%">
    <div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>
    <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/${script}" async>
${JSON.stringify(config, null, 2)}
    </script>
  </div>
</div>`;
}

function tapeFallback(m) {
  const q = (x, fmt) => (x ? `<span>${esc(x.name)} <b>${fmt(x.value)}</b> <span class="${upDown(x.change)}">${signed(x.change * 100, 2)}</span></span>` : '');
  const n2 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parts = (m.indexes || []).map((x) => q(x, n2));
  if (m.vix) parts.push(`<span>VIX <b>${m.vix.last.toFixed(2)}</b></span>`);
  if (m.commodities?.wti) parts.push(q({ ...m.commodities.wti, name: 'WTI' }, (v) => '$' + n2(v)));
  if (m.commodities?.gold) parts.push(q({ ...m.commodities.gold, name: 'Gold' }, (v) => '$' + Math.round(v).toLocaleString('en-US')));
  if (m.fearGreed) parts.push(`<span>Fear &amp; Greed <b>${m.fearGreed.score}</b> ${esc(m.fearGreed.rating || '')}</span>`);
  const d = m.indexes?.[0]?.date || m.vix?.lastDate;
  if (d) parts.push(`<span>Close · ${date(d)}</span>`);
  return parts.join('');
}

export function layout({ site, d, page, title, description, path, body, jsonLd, noindex, charts }) {
  const fullTitle = path === '/' ? `${site.name} | Super Investor Portfolios, 13F Tracker and Market Mood` : `${title} | ${site.name}`;
  const canonical = site.url + (path === '/' ? '/' : path.replace(/\.html$/, '').replace(/\/index$/, '/'));
  const og = `${site.url}/assets/img/og-image.jpg`;
  const ld = [].concat(jsonLd || []);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${noindex ? 'noindex' : 'index, follow'}">
<meta name="theme-color" content="#0B0F1A">
<meta property="og:type" content="website">
<meta property="og:site_name" content="QWERTx">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${og}">
<link rel="icon" type="image/svg+xml" href="/assets/img/logo-mark.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,500&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/vendor/fontawesome/css/all.min.css">
<link rel="stylesheet" href="${site.assets.css}">
<link rel="stylesheet" href="${site.assets.extra}">
<script>try{if(localStorage.getItem('qx-theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}</script>
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
${site.analyticsToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${esc(site.analyticsToken)}"}'></script>` : ''}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="tape" aria-label="Live market ticker">
  <div class="tape-fallback" aria-hidden="true">${tapeFallback(d.market || {})}</div>
  <div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div>
    <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js" async>
${JSON.stringify({ symbols: TAPE_SYMBOLS.map(([proName, t]) => ({ proName, title: t })), showSymbolLogo: false, isTransparent: true, displayMode: 'adaptive', colorTheme: 'dark', locale: 'en' }, null, 2)}
    </script>
  </div>
</div>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="/" aria-label="QWERTx home"><img src="/assets/img/logo-qwertx-wordmark.svg" alt="QWERTx" width="200" height="34"></a>
    <nav class="nav" aria-label="Main">${NAV.map(([h, l, k]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div class="header-actions">
      <button class="icon-btn" type="button" data-theme-toggle aria-label="Switch to light mode"><i class="fa-solid fa-sun" aria-hidden="true"></i></button>
      <a class="btn btn-gold btn-sm" href="/pro.html#waitlist">Pro early access</a>
      <button class="icon-btn menu-toggle" type="button" aria-controls="mobile-nav" aria-expanded="false" aria-label="Open menu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile">${MOBILE.map(([h, l], i) => `<a class="m-link" href="${h}">${l}<span>${String(i + 1).padStart(2, '0')}</span></a>`).join('')}<a class="btn btn-gold" href="/pro.html#waitlist">Join the Pro waitlist</a></nav>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <div class="row row-wide">
      <div class="col-2 footer-brand" style="flex-basis:34%">
        <img src="/assets/img/logo-qwertx.svg" alt="QWERTx — After Work Investment Strategies" width="300" height="52">
        <p>Super investor portfolios, politician and insider trades, market sentiment and plain-English news for busy professionals. Every number links back to its official source.</p>
        <form class="inline-form" data-form="newsletter-footer" style="margin-top:18px">
          <div class="form-fields inline-form" style="width:100%">
            <label class="sr-only" for="f-email">Email address</label>
            <input class="input" id="f-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
            <button class="btn btn-gold" type="submit">Subscribe</button>
            <div class="field-error" id="f-email-error" style="flex-basis:100%">Enter a valid email address.</div>
          </div>
          <div class="form-success" role="status" tabindex="-1"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>You’re in. Look out for the next quarterly briefing.</div>
        </form>
      </div>
      <div class="col">
        <h2 class="footer-title">Explore</h2>
        <ul class="footer-links">
          <li><a href="/investors.html">Fund Managers</a></li>
          <li><a href="/smart-money.html">Top Stocks</a></li>
          <li><a href="/politicians.html">Politician Trades</a></li>
          <li><a href="/insiders.html">Insider Trades</a></li>
          <li><a href="/market.html">Market Mood</a></li>
          <li><a href="/insights.html">Learn</a></li>
        </ul>
      </div>
      <div class="col">
        <h2 class="footer-title">Company</h2>
        <ul class="footer-links">
          <li><a href="/about.html">About QWERTx</a></li>
          <li><a href="/about.html#methodology">Methodology</a></li>
          <li><a href="/pro.html">QWERTx Pro</a></li>
          <li><a href="/contact.html">Contact</a></li>
        </ul>
      </div>
      <div class="col">
        <h2 class="footer-title">Legal</h2>
        <ul class="footer-links">
          <li><a href="/disclaimer.html">Disclaimer</a></li>
          <li><a href="/privacy.html">Privacy Policy</a></li>
          <li><a href="/terms.html">Terms of Use</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </div>
    </div>
    <p class="disclaimer-mini">QWERTx provides general information for educational purposes only. It is not investment, financial, legal or tax advice, and it is not a recommendation to buy or sell any security. Holdings come from public SEC Form 13F filings, which are delayed by up to 45 days and do not show short positions, cash or most non-US holdings. Politician trades come from STOCK Act disclosures, which report amount ranges and can be filed up to 45 days after a trade. Insider trades come from SEC Form 4 data. Live market widgets are provided by TradingView. Do your own research or speak with a registered advisor before investing.</p>
    <div class="footer-bottom"><span>© <span data-year>${new Date().getFullYear()}</span> QWERTx · After Work Investment Strategies</span><span class="mono">Data: SEC EDGAR · House &amp; Senate disclosures · FRED · CNN · TradingView</span></div>
  </div>
</footer>
${charts ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js" defer></script>\n<script src="' + site.assets.charts + '" defer></script>' : ''}
<script src="${site.assets.main}"></script>
<script src="${site.assets.live}" defer></script>
</body>
</html>`;
}
