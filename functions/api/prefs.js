// POST /api/prefs { name, mode, weekly, types, managers, minChange, snoozeUntil, quiet, emailOff } — profile and alert settings.
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { accountView } from '../../server/account.js';
import { cleanPrefs, isPro, prefsOf } from '../../server/pro.js';
import { fail, json, readBody, route, sameOrigin } from '../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!user) throw fail(401, 'Please sign in first.');
  const body = await readBody(request);
  const next = cleanPrefs(body, prefsOf(user), { pro: isPro(user) });
  const DB = await db(env);
  const name = 'name' in body ? String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 80) || null : user.name ?? null;
  await DB.prepare(`UPDATE users SET prefs = ?, name = ? WHERE id = ?`).bind(JSON.stringify(next), name, user.id).run();
  return json({ ok: true, ...(await accountView(DB, { ...user, name, prefs: JSON.stringify(next) }, env)) });
});
