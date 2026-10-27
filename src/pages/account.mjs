// /account.html — "Your stocks, watched for you": sign-in, watchlist, alert settings and membership.
// The page is a shell; src/assets/qx-pro.js fills it from /api/me and /pro/*.json.
import { pageHero } from '../parts.mjs';

export function accountPage() {
  return {
    page: 'account',
    path: '/account.html',
    noindex: true,
    pro: true,
    title: 'My stocks',
    description: 'Your watchlist on QWERTx: see which super investors, politicians and insiders own and trade the stocks you own, and get an email when a new filing lands.',
    body: `${pageHero({ crumbs: [['My stocks']], eyebrow: 'Your stocks, watched for you', h1: 'Follow the smart money, <span class="accent">starting with the stocks you own</span>', lead: 'Add your stocks and see in seconds which tracked fund managers own them, who just bought or sold, and what politicians and insiders disclosed. Information from official filings, never buy or sell advice.' })}
<section class="section-sm wl-app">
  <div class="container">
    <div id="wl-root" aria-live="polite"><div class="card"><p class="form-note"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading your stocks…</p></div></div>
    <noscript><div class="card"><p>This page needs JavaScript to show your watchlist.</p></div></noscript>
  </div>
</section>`,
  };
}
