// POST /api/internal/universe — every distinct ticker on any watchlist (no member details), for the licensed
// data job (scripts/fetch-fmp.mjs). "Authorization: Bearer <CRON_SECRET>".
import { db } from '../../../server/db.js';
import { authorized } from '../../../server/cron.js';
import { json, route } from '../../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!authorized(request, env)) return json({ ok: false }, 401);
  const { results = [] } = await (await db(env)).prepare(`SELECT DISTINCT ticker FROM watchlist ORDER BY ticker`).all();
  return json({ ok: true, tickers: results.map((r) => r.ticker) });
});
