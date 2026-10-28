# QWERTx

Super investor portfolios (SEC 13F), what politicians and corporate insiders are buying, a live Fear & Greed
gauge and plain-English market news. Built on the original QWERTx "After Hours" design. Static site with
zero npm dependencies, hosted free on Cloudflare Pages and kept fresh by GitHub Actions.

## What updates, and when

| Data | Script | Source | Schedule (workflow) |
|---|---|---|---|
| Super investor and institution portfolios (`config/investors.json`; `"group": "institution"` keeps big diversified books out of the Top Stocks rankings), 9 quarters of history, sectors | `scripts/fetch-13f.mjs` | SEC EDGAR 13F-HR, OpenFIGI, SEC company data | 1st of each month + the day after each 13F deadline (`update-portfolios.yml`) |
| Headlines | `scripts/fetch-news.mjs` | RSS feeds in `config/news-feeds.json` | Daily 07:00 and weekdays 17:30 Toronto (`update-news.yml`) |
| VIX history, index closes, yields, oil, gold, CNN Fear & Greed | `scripts/fetch-market.mjs` | Cboe, Yahoo Finance (FRED/Stooq fallback), CNN | Same as news |
| Politician trades | `scripts/fetch-congress.mjs` | House Clerk PTRs + Senate eFD, congress-legislators | Daily 08:15 (`update-disclosures.yml`) |
| Insider trades (quarterly) | `scripts/fetch-insiders.mjs` | SEC Insider Transactions Data Sets (Form 4) | Daily check; processes each new quarter once |
| Company events (8-K item numbers) for every stock on the site | `scripts/fetch-8k.mjs` | SEC EDGAR daily index + submissions | Same as politician trades |
| Economy and rates for Market Weather (US + Canada) | `scripts/fetch-macro.mjs` | FRED (public-domain series only), Bank of Canada Valet, Statistics Canada | Same as politician trades; FRED needs `FRED_API_KEY` |
| What's inside US ETFs (`config/etfs.json`; Canadian ETFs borrow a same-index US fund) | `scripts/fetch-etfs.mjs` | SEC Form N-PORT | Same as portfolios |
| Prices, analyst targets, earnings history — **internal testing** | `scripts/fetch-yahoo.mjs` | Yahoo Finance public pages (not licensed for public display) | Weekdays 18:30 Toronto (`update-prices.yml`), while `vendor.name` is `yahoo` |
| Licensed prices, analyst targets, earnings history (off until licensed) | `scripts/fetch-fmp.mjs` | Financial Modeling Prep | Same as politician trades, only when `vendor.enabled` |
| Live Fear & Greed on the page | `functions/api/market-mood.js` | CNN, cached 15 min at the edge | On page view |

Every data commit triggers a Cloudflare rebuild (`npm run build` → `dist/`).

## Everyday edits

- **Weekly editorial** (What's moving markets + Trending stocks explained): edit `content/weekly.json`.
  Owners, politician and insider activity for each trending ticker are added automatically.
- **Investors:** `config/investors.json` (CIK, profile text, tags). `previousCiks` covers managers who
  changed filing entity (Pershing Square, Greenlight/DME). Changing this file re-runs the portfolio job.
- **Content pages** (About, Pro, Contact, legal, Insights articles): `src/static/*.html`.
- **Design:** `public/assets/css/styles.css` (original design system) and `src/assets/qx-extra.css`.

## Secrets (repo → Settings → Secrets and variables → Actions)

- `SEC_USER_AGENT` = `QWERTx yourname@yourdomain.com` (recommended; SEC asks bots to identify themselves)
- `OPENFIGI_API_KEY` (optional, faster ticker lookups)
- `FRED_API_KEY` (free at fred.stlouisfed.org; fills the US half of Market Weather)
- `FMP_API_KEY` (only once a Financial Modeling Prep plan and display licence are in place)

## Cloudflare Pages

Framework preset *None* · build command `npm run build` · output directory `dist`.
Optional env var `CF_ANALYTICS_TOKEN` for Cloudflare Web Analytics.

## QWERTx Pro ("Your stocks, watched for you")

Members sign in with an emailed link at `/account.html`, add tickers (free: 3, Pro: 50), and see which tracked
managers own them, who bought or sold, and what politicians and insiders disclosed. New filings become email
alerts; everyone with a watchlist gets a Friday digest.

| Piece | Where |
|---|---|
| Ownership + alert data (built with the site) | `src/lib/pro-data.mjs` → `dist/pro/t/<TICKER>.json`, `index.json`, `events-recent.json` |
| Accounts, watchlist, settings, billing | `functions/api/{auth/*,me,watchlist,prefs,account,checkout,billing-portal,stripe-webhook,unsubscribe}.js` |
| Alerts and digests | `functions/api/internal/{dispatch,digest}.js`, called by `.github/workflows/pro-alerts.yml` |
| Shared server code | `server/` (D1 schema in `server/schema.sql`, created automatically) |
| Dashboard page | `src/pages/account.mjs` + `src/assets/qx-pro.js` |
| Plans and prices | `config/pro.json` (prices are created in Stripe from `amount` + `lookupKey`) |
| Toronto → New York tickers | `config/ticker-aliases.json` |
| Canadian ETFs (VEQT, XEQT, VFV…) kept as `.TO` | `config/etfs.json` |
| Market Weather | `src/lib/weather.mjs` → `dist/pro/weather.json` |
| The weekly QWERTx Brief | `functions/api/{brief,brief-vote}.js`, written on the QWERTx Brief tab by admins |

The Pro page has six tabs: My Portfolio (value, health cards, what you really own through ETFs, ETF scorecard),
Smart Money, Analyst Targets, Earnings & News, Market Weather and the QWERTx Brief. Anything that needs licensed
data (live prices, analyst targets, ETF returns) comes from `config/pro.json` → `vendor`. While the site is
internal-only it is Yahoo Finance (`internalTest: true`). **Before public launch** switch to the licensed feed
(`"name": "fmp"`, `displayLicence: true` once signed) or set `enabled` to `false`.

### Setup checklist

Cloudflare Pages → Settings → (Production and Preview):
- **D1 binding** `DB` → any empty D1 database (tables create themselves).
- **Secrets:** `STRIPE_SECRET_KEY` (test key first), `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET` (any long random string).
- **Variables:** `MAIL_FROM` = `QWERTx <alerts@qwertx.com>` (domain verified in Resend), `SITE_URL` = `https://qwertx.com`
  (or the pages.dev URL until the domain points here), optional `MAIL_POSTAL_ADDRESS` (CASL wants a mailing address in emails),
  optional `MAIL_REPLY_TO`.
- **Variable** `ADMIN_EMAILS` = comma-separated emails allowed to write and publish the QWERTx Brief.
- Preview only, for testing: `DEV_SHOW_LINK` = `1` shows the sign-in link on screen. Never set it on Production.

Stripe (test mode first, then again in live mode):
- Developers → Webhooks → add `https://<site>/api/stripe-webhook` with `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Settings → Billing → Customer portal → Save (needed for “Manage billing”).

GitHub → repo secrets: `PRO_SITE_URL` (same as `SITE_URL`) and `CRON_SECRET` (same value as Cloudflare).

Testing checkout before launch: `/account.html?checkout=test` or `/pro.html?checkout=test` show the buy buttons
while `checkoutOpen` is `false`. Card 4242 4242 4242 4242. Going live: switch to live Stripe keys, set
`"mode": "live"` and `"checkoutOpen": true` in `config/pro.json`.

## Local

```bash
npm run dev    # build + preview at http://localhost:4321
npm test       # parsers, formatting and the full Pro flow (fake Stripe and email, SQLite in place of D1)
```

## Data notes

13F filings are due 45 days after quarter end and only cover long U.S. equity positions (plus some options).
Congressional disclosures can arrive up to 45 days after a trade and report amount ranges; only electronic
filings are parsed. Insider data counts open-market purchases (P) and sales (S) on Form 4.
Nothing on the site is investment advice.
