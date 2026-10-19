# QWERTx

Superinvestor portfolios from SEC 13F filings, a live market mood gauge and daily market news.
A static site with zero npm dependencies, hosted free on Cloudflare Pages and updated by GitHub Actions.

## How it works

| Piece | What it does | When |
|---|---|---|
| `scripts/fetch-13f.mjs` | Pulls the latest two 13F filings per investor from SEC EDGAR, works out holdings, weights and quarter-over-quarter changes, maps CUSIPs to tickers (OpenFIGI) | Monthly on the 1st, plus the day after each 13F deadline (Feb/May/Aug/Nov 16) |
| `scripts/fetch-news.mjs` | Pulls headlines from the RSS feeds in `config/news-feeds.json` and a Fear & Greed snapshot | Daily, 7am Toronto |
| `.github/workflows/*` | Run the two scripts above and commit any new data to `data/` | Scheduled, or **Actions → Run workflow** |
| `build.mjs` | Turns `config/` + `data/` into a complete static site in `dist/` | Every push (Cloudflare runs it) |
| `functions/api/market-mood.js` | Live Fear & Greed gauge, cached 15 min at the edge, falls back to the daily snapshot | On page view |

Every data commit triggers a Cloudflare rebuild, so the site is always current without a server.

## One-time setup

1. **GitHub:** create an empty repository (e.g. `qwertx`) and push this folder to `main`.
2. **Secret (recommended):** repo → Settings → Secrets and variables → Actions → New secret
   `SEC_USER_AGENT` = `QWERTx yourname@yourdomain.com`. The SEC asks automated clients to identify themselves.
   Optional: `OPENFIGI_API_KEY` (free at openfigi.com) makes ticker lookups faster.
3. **First data run:** repo → Actions → *Update superinvestor portfolios* → Run workflow. Then run *Update news and market mood*.
   The first portfolio run takes a few minutes because every security needs a ticker lookup; later runs are faster.
4. **Cloudflare Pages:** dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   - Framework preset: *None*
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable (optional): `CF_ANALYTICS_TOKEN` for Cloudflare Web Analytics
5. **Domain:** once the `*.pages.dev` preview looks right, add `qwertx.com` under the project's Custom domains and follow the DNS prompts.

## Everyday changes

- **Add or remove an investor:** edit `config/investors.json` (slug, name, firm, SEC CIK, and an `expect` word from the SEC entity name). Pushing the change runs the data workflow automatically.
- **Change news sources:** edit `config/news-feeds.json`.
- **More frequent news:** add cron lines in `.github/workflows/update-news.yml`, e.g. `'0 11,16,21 * * 1-5'`.

## Local preview

```bash
npm run sample   # fictional demo data → http://localhost:4321 (never deploy this)
npm run dev      # real data in data/ → http://localhost:4321
npm test         # unit tests for the 13F parser and news parser
```

## Data notes

13F filings are due 45 days after quarter end and only cover long U.S. equity positions (plus some options).
Values are as of quarter end. Share changes are not split-adjusted. Pre-2023 filings reported values in
thousands; the parser handles both units.

## Later: Pro membership

Logins and payments can be added with Cloudflare Pages Functions + Stripe Checkout (and an auth provider),
keeping public pages static and only gating the member-only data.
