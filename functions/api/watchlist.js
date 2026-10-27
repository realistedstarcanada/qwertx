// POST   /api/watchlist { tickers: ["AAPL", "RY.TO", ...] } — add stocks (typed or from a CSV)
// DELETE /api/watchlist?ticker=AAPL                         — remove one stock
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
  const raw = Array.isArray(body.tickers) ? body.tickers : String(body.tickers || body.ticker || '').split(/[\s,;]+/);
  const inputs = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))].slice(0, 100);
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
    add.push(n);
    results.push({ input, ticker: n.ticker, status: n.from ? 'mapped' : 'added' });
  }
  if (add.length) {
    const now = nowIso();
    await DB.batch(add.map((n, i) => DB.prepare(`INSERT OR IGNORE INTO watchlist (user_id, ticker, input, added_at) VALUES (?, ?, ?, ?)`).bind(user.id, n.ticker, n.from || null, new Date(Date.parse(now) + i).toISOString())));
  }
  return json({ ok: true, results, ...(await accountView(DB, user)) });
});

export const onRequestDelete = route(async ({ request, env }) => {
  const user = await signedIn(request, env);
  const ticker = String(new URL(request.url).searchParams.get('ticker') || '').toUpperCase();
  const DB = await db(env);
  if (ticker === '*') await DB.prepare(`DELETE FROM watchlist WHERE user_id = ?`).bind(user.id).run();
  else await DB.prepare(`DELETE FROM watchlist WHERE user_id = ? AND ticker = ?`).bind(user.id, ticker).run();
  return json({ ok: true, ...(await accountView(DB, user)) });
});
