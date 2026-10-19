import { esc } from './lib/format.mjs';

const NAV = [
  ['/', 'Home'],
  ['/investors/', 'Superinvestors'],
  ['/stocks/', 'Stocks'],
  ['/news/', 'News'],
  ['/about/', 'About'],
];

export function layout({ site, title, description, path, body, assets, jsonLd }) {
  const fullTitle = path === '/' ? `${site.name} · ${site.tagline}` : `${title} · ${site.name}`;
  const url = site.url + path;
  const section = path === '/' ? '/' : '/' + path.split('/')[1] + '/';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#080c17">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,500&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap">
<link rel="stylesheet" href="${assets.css}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
${site.analyticsToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${esc(site.analyticsToken)}"}'></script>` : ''}
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="${esc(site.name)} home"><span class="brand-mark">QWERT<span>x</span></span><span class="brand-tag">${esc(site.tagline)}</span></a>
    <nav class="nav" aria-label="Main">
      ${NAV.map(([href, label]) => `<a href="${href}"${href === section ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div>
      <a class="brand" href="/"><span class="brand-mark">QWERT<span>x</span></span></a>
      <p style="margin-top:8px">${esc(site.tagline)}</p>
      <nav>${NAV.slice(1).map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
    </div>
    <div>
      <p>Portfolio data comes from public SEC Form 13F filings, which show long U.S. equity positions as of each quarter end and are filed up to 45 days later. They don't include short positions, most non-U.S. holdings, bonds or cash, so they are a partial view.</p>
      <p>QWERTx is for information and education only and is not investment advice. Do your own research or speak to a licensed advisor before investing.</p>
      <p>© ${new Date().getFullYear()} QWERTx. Headlines link to their original publishers.</p>
    </div>
  </div>
</footer>
<script src="${assets.js}" defer></script>
</body>
</html>`;
}
