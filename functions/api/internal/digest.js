// POST /api/internal/digest?kind=daily        — daily summary for Pro members who chose it
// POST /api/internal/digest?kind=weekly&after=0 — Friday digest for everyone (repeat with the returned
//                                                "next" until it is null)
// Called by .github/workflows/pro-alerts.yml with "Authorization: Bearer <CRON_SECRET>".
import { db } from '../../../server/db.js';
import { authorized, sendPending, weekly } from '../../../server/cron.js';
import { asset, json, route } from '../../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!authorized(request, env)) return json({ ok: false }, 401);
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const index = await asset(env, request, '/pro/index.json');
  if (!index) return json({ ok: false, error: 'data files missing' }, 500);
  const DB = await db(env);
  const site = env.SITE_URL || url.origin;
  if (kind === 'daily') return json({ ok: true, sent: await sendPending({ DB, env, site, managers: index.managers, mode: 'daily' }) });
  if (kind === 'weekly') return json({ ok: true, ...(await weekly({ DB, env, site, index, after: Number(url.searchParams.get('after')) || 0 })) });
  return json({ ok: false, error: 'kind must be daily or weekly' }, 400);
});
