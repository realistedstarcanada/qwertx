// DELETE /api/account — deletes the member and everything stored about them (watchlist, alerts,
// sessions). An active Pro subscription is cancelled immediately first, so no further charges happen.
import { db } from '../../server/db.js';
import { currentUser, sessionCookie } from '../../server/auth.js';
import { stripe } from '../../server/stripe.js';
import { ACTIVE } from '../../server/pro.js';
import { fail, json, route, sameOrigin } from '../../server/util.js';

export const onRequestDelete = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!user) throw fail(401, 'Please sign in first.');
  if (user.stripe_sub && ACTIVE.has(user.sub_status || '')) {
    await stripe(env, `/subscriptions/${encodeURIComponent(user.stripe_sub)}`, { method: 'DELETE' });
  }
  const DB = await db(env);
  await DB.batch([
    DB.prepare(`DELETE FROM watchlist WHERE user_id = ?`).bind(user.id),
    DB.prepare(`DELETE FROM alerts WHERE user_id = ?`).bind(user.id),
    DB.prepare(`DELETE FROM digests WHERE user_id = ?`).bind(user.id),
    DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(user.id),
    DB.prepare(`DELETE FROM login_tokens WHERE email = ?`).bind(user.email),
    DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.id),
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
});
