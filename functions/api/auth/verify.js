// POST /api/auth/verify { token } — exchanges a sign-in link's token for a session cookie.
// (The link opens /account.html, which posts the token here when the person clicks "Sign in".)
import { db } from '../../../server/db.js';
import { createSession, useLoginToken } from '../../../server/auth.js';
import { fail, json, readBody, route, sameOrigin } from '../../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const { token } = await readBody(request);
  const DB = await db(env);
  const res = await useLoginToken(DB, String(token || ''));
  if (!res) throw fail(400, 'This sign-in link has expired or was already used. Request a new one below.');
  const cookie = await createSession(DB, res.user.id);
  return json({ ok: true, next: res.next }, 200, { 'Set-Cookie': cookie });
});
