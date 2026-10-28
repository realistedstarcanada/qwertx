// POST /api/auth/logout — ends this browser's session.
import { endSession } from '../../../server/auth.js';
import { fail, json, route, sameOrigin } from '../../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  return json({ ok: true }, 200, { 'Set-Cookie': await endSession(request, env) });
});
