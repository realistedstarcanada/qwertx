// GET /api/me — the signed-in member, their plan, alert settings and watchlist (or { signedIn: false }).
import pro from '../../config/pro.json';
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { accountView } from '../../server/account.js';
import { json, route } from '../../server/util.js';

export const onRequestGet = route(async ({ request, env }) => {
  const base = { checkoutOpen: !!pro.checkoutOpen, testMode: pro.mode !== 'live', limits: pro.limits };
  if (!env.DB) return json({ signedIn: false, configured: false, ...base });
  const user = await currentUser(request, env);
  if (!user) return json({ signedIn: false, configured: true, ...base });
  return json({ ...base, ...(await accountView(await db(env), user, env)) });
});
