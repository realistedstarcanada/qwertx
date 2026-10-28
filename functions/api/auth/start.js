// POST /api/auth/start { email, next } — emails a one-time sign-in link. Creates the account on first use.
import { db } from '../../../server/db.js';
import { createLoginToken } from '../../../server/auth.js';
import { loginEmail, mailReady, sendMail } from '../../../server/mail.js';
import { EMAIL, fail, json, readBody, route, sameOrigin } from '../../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const f = await readBody(request);
  // Bots: a hidden field people never fill, and forms sent within two seconds of the page loading.
  if (f.website || (Number(f.t) && Date.now() - Number(f.t) < 2000)) return json({ ok: true });
  const email = String(f.email || '').trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) throw fail(422, 'Enter a valid email address.');
  const dev = env.DEV_SHOW_LINK === '1';
  if (!mailReady(env) && !dev) throw fail(503, 'Sign-in emails are not set up yet. Please try again soon.');

  const DB = await db(env);
  const token = await createLoginToken(DB, email, f.next);
  if (!token) throw fail(429, 'Too many sign-in links requested. Please wait an hour or use the latest email.');
  const site = env.SITE_URL || new URL(request.url).origin;
  const link = `${site}/account.html?signin=${encodeURIComponent(token)}`;
  const sent = await sendMail(env, loginEmail(env, { to: email, link }));
  if (!sent.ok && !dev) throw fail(502, 'We could not send the email. Please try again.');
  return json({ ok: true, ...(dev ? { devLink: link } : {}) });
});
