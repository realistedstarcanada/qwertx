// GET or POST /api/unsubscribe?u=<token> — one click turns off alert and digest emails.
// (POST is Gmail/Yahoo "List-Unsubscribe-Post" one-click; GET is the link in the email footer.)
import { db } from '../../server/db.js';
import { prefsOf } from '../../server/pro.js';
import { esc } from '../../server/util.js';

async function handle({ request, env }) {
  const u = new URL(request.url).searchParams.get('u') || '';
  let ok = false, email = null;
  if (/^[A-Za-z0-9_-]{10,60}$/.test(u) && env.DB) {
    const DB = await db(env);
    const user = await DB.prepare(`SELECT * FROM users WHERE unsub_token = ?`).bind(u).first();
    if (user) {
      const p = { ...prefsOf(user), emailOff: true };
      await DB.prepare(`UPDATE users SET prefs = ? WHERE id = ?`).bind(JSON.stringify(p), user.id).run();
      ok = true;
      email = user.email;
    }
  }
  if (request.method === 'POST') return new Response(null, { status: ok ? 200 : 400 });
  const msg = ok
    ? `<h1>You're unsubscribed</h1><p>${esc(email)} won't get QWERTx alert or digest emails any more. Your watchlist is still there.</p><p><a href="/account.html#alerts">Turn emails back on</a> any time.</p>`
    : `<h1>Link not recognised</h1><p>Sign in and change your email settings on your <a href="/account.html#alerts">account page</a>.</p>`;
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QWERTx emails</title><meta name="robots" content="noindex"><body style="font-family:system-ui,sans-serif;background:#0B0F1A;color:#F1F3F8;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><main style="max-width:480px;line-height:1.6">${msg}<p style="color:#8A93A8"><a href="/" style="color:#F5B83D">QWERTx home</a></p></main><style>a{color:#F5B83D}</style></body>`, { status: ok ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export const onRequestGet = handle;
export const onRequestPost = handle;
