# QWERTx

Super investor portfolios (SEC 13F), what politicians and corporate insiders are buying, a live Fear & Greed
gauge and plain-English market news. Built on the original QWERTx "After Hours" design. Static site with
zero npm dependencies, hosted free on Cloudflare Pages and kept fresh by GitHub Actions.

## What updates, and when

| Data | Script | Source | Schedule (workflow) |
|---|---|---|---|
| 22 super investor portfolios, 9 quarters of history, sectors | `scripts/fetch-13f.mjs` | SEC EDGAR 13F-HR, OpenFIGI, SEC company data | 1st of each month + the day after each 13F deadline (`update-portfolios.yml`) |
| Headlines | `scripts/fetch-news.mjs` | RSS feeds in `config/news-feeds.json` | Daily 07:00 and weekdays 17:30 Toronto (`update-news.yml`) |
| VIX history, index closes, yields, oil, gold, CNN Fear & Greed | `scripts/fetch-market.mjs` | Cboe, Yahoo Finance (FRED/Stooq fallback), CNN | Same as news |
| Politician trades | `scripts/fetch-congress.mjs` | House Clerk PTRs + Senate eFD, congress-legislators | Daily 08:15 (`update-disclosures.yml`) |
| Insider trades (quarterly) | `scripts/fetch-insiders.mjs` | SEC Insider Transactions Data Sets (Form 4) | Daily check; processes each new quarter once |
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

## Cloudflare Pages

Framework preset *None* · build command `npm run build` · output directory `dist`.
Optional env var `CF_ANALYTICS_TOKEN` for Cloudflare Web Analytics.

## Local

```bash
npm run dev    # build + preview at http://localhost:4321
npm test       # parser and formatting tests
```

## Data notes

13F filings are due 45 days after quarter end and only cover long U.S. equity positions (plus some options).
Congressional disclosures can arrive up to 45 days after a trade and report amount ranges; only electronic
filings are parsed. Insider data counts open-market purchases (P) and sales (S) on Form 4.
Nothing on the site is investment advice.
