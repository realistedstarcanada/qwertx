// POST /api/internal/dispatch — turns newly disclosed trades into watchlist alerts and emails instant ones.
// Called hourly by .github/workflows/pro-alerts.yml with "Authorization: Bearer <CRON_SECRET>".
import { db } from '../../../server/db.js';
import { authorized, dispatch } from '../../../server/cron.js';
import { asset, json, route } from '../../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!authorized(request, env)) return json({ ok: false }, 401);
  const [feed, index] = await Promise.all([asset(env, request, '/pro/events-recent.json'), asset(env, request, '/pro/index.json')]);
  if (!feed || !index) return json({ ok: false, error: 'data files missing' }, 500);
  const stats = await dispatch({ DB: await db(env), env, site: env.SITE_URL || new URL(request.url).origin, events: feed.events, managers: index.managers });
  return json({ ok: true, generatedAt: feed.generatedAt, ...stats });
});
