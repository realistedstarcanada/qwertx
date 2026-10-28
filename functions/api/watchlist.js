// POST   /api/watchlist { tickers: ["AAPL", "RY.TO", ...] }               — add stocks (typed)
//        /api/watchlist { items: [{ ticker, shares?, amount? }, ...] }     — add stocks with sizes (CSV)
// PATCH  /api/watchlist { ticker, shares?, amount?, paid? }                — set or clear a position size and price paid
// DELETE /api/watchlist?ticker=AAPL                                       — remove one stock
// A position size is optional and is either a number of shares or a dollar amount, never both.
// Both return the updated account view plus, for adds, what happened to each input.
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { accountView } from '../../server/account.js';
import { limitFor, normalizeTicker } from '../../server/pro.js';
import { asset, fail, json, nowIso, readBody, route, sameOrigin } from '../../server/util.js';

async function signedIn(request, env) {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!user) throw fail(401, 'Please sign in first.');
  return user;
}

export const onRequestPost = route(async ({ request, env }) => {
  const user = await signedIn(request, env);
  const body = await readBody(request);
  const items = Array.isArray(body.items)
    ? body.items.map((x) => ({ input: String(x.ticker || '').trim(), ...size(x) }))
    : (Array.isArray(body.tickers) ? body.tickers : String(body.tickers || body.ticker || '').split(/[\s,;]+/)).map((x) => ({ input: String(x).trim() }));
  const sizes = new Map(items.filter((x) => x.input).map((x) => [x.input, x]));
  const inputs = [...sizes.keys()].slice(0, 100);
  if (!inputs.length) throw fail(422, 'Type at least one ticker, for example AAPL.');

  const DB = await db(env);
  // Every ticker the SEC lists (built nightly). If the file isn't there yet, any well-formed ticker is accepted.
  const known = await asset(env, request, '/pro/known.txt', 'text');
  const { results: have = [] } = await DB.prepare(`SELECT ticker FROM watchlist WHERE user_id = ?`).bind(user.id).all();
  const owned = new Set(have.map((r) => r.ticker));
  const limit = limitFor(user);
  const results = [];
  const add = [];
  for (const input of inputs) {
    const n = normalizeTicker(input);
    if (n.error) { results.push({ input, status: n.error }); continue; }
    if (known && !known.includes(` ${n.ticker} `)) { results.push({ input, status: 'unknown' }); continue; }
    if (owned.has(n.ticker)) { results.push({ input, ticker: n.ticker, status: 'duplicate' }); continue; }
    if (owned.size >= limit) { results.push({ input, ticker: n.ticker, status: 'limit' }); continue; }
    owned.add(n.ticker);
    add.push({ ...n, ...sizes.get(input) });
    results.push({ input, ticker: n.ticker, status: n.from ? 'mapped' : 'added' });
  }
  if (add.length) {
    const now = nowIso();
    // With licensed prices switched on, remember today's price so performance since adding can be shown.
    const idx = await asset(env, request, '/pro/index.json');
    if (idx?.vendor) {
      await Promise.all(add.map(async (n) => { const t = await asset(env, request, `/pro/t/${encodeURIComponent(n.ticker)}.json`); n.price = t?.q?.p ?? null; }));
    }
    await DB.batch(add.map((n, i) => DB.prepare(`INSERT OR IGNORE INTO watchlist (user_id, ticker, input, added_at, shares, amount, added_price, paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(user.id, n.ticker, n.from || null, new Date(Date.parse(now) + i).toISOString(), n.shares ?? null, n.amount ?? null, n.price ?? null, n.paid ?? null)));
  }
  return json({ ok: true, results, ...(await accountView(DB, user, env)) });
});

export const onRequestPatch = route(async ({ request, env }) => {
  const user = await signedIn(request, env);
  const body = await readBody(request);
  const ticker = String(body.ticker || '').toUpperCase();
  const DB = await db(env);
  const sz = size(body);
  const res = await DB.prepare(`UPDATE watchlist SET shares = ?, amount = ?, paid = ? WHERE user_id = ? AND ticker = ?`).bind(sz.shares ?? null, sz.amount ?? null, sz.shares || sz.amount ? sz.paid ?? null : null, user.id, ticker).run();
  if (!res.meta?.changes) throw fail(404, 'That stock is not on your list.');
  return json({ ok: true, ...(await accountView(DB, user, env)) });
});

/** Optional position size: shares wins if both are given; anything not a sensible positive number is dropped.
 *  `paid` is the optional price paid per share, kept only alongside a size. */
export function size(x) {
  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n * 10000) / 10000 : null;
  };
  const paid = num(x.paid);
  const shares = num(x.shares);
  if (shares) return { shares, amount: null, paid };
  const amount = num(x.amount);
  return amount ? { shares: null, amount: Math.round(amount * 100) / 100, paid } : {};
}

export const onRequestDelete = route(async ({ request, env }) => {
  const user = await signedIn(request, env);
  const ticker = String(new URL(request.url).searchParams.get('ticker') || '').toUpperCase();
  const DB = await db(env);
  if (ticker === '*') await DB.prepare(`DELETE FROM watchlist WHERE user_id = ?`).bind(user.id).run();
  else await DB.prepare(`DELETE FROM watchlist WHERE user_id = ? AND ticker = ?`).bind(user.id, ticker).run();
  return json({ ok: true, ...(await accountView(DB, user, env)) });
});
