// POST /api/prefs { mode, weekly, types, managers, minChange, snoozeUntil, quiet, emailOff } — alert settings.
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { accountView } from '../../server/account.js';
import { cleanPrefs, isPro, prefsOf } from '../../server/pro.js';
import { fail, json, readBody, route, sameOrigin } from '../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!user) throw fail(401, 'Please sign in first.');
  const next = cleanPrefs(await readBody(request), prefsOf(user), { pro: isPro(user) });
  const DB = await db(env);
  await DB.prepare(`UPDATE users SET prefs = ? WHERE id = ?`).bind(JSON.stringify(next), user.id).run();
  return json({ ok: true, ...(await accountView(DB, { ...user, prefs: JSON.stringify(next) })) });
});
