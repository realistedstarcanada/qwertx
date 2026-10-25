// Cloudflare Pages Function: POST /api/form
// Saves newsletter sign-ups, Pro waitlist entries and contact messages to the D1 database bound as DB,
// and (when RESEND_API_KEY and MAIL_FROM are set) emails contact messages to CONTACT_TO (default support@qwertx.com).
// Tables are created on first use, so binding an empty D1 database is the only setup needed.
const KINDS = new Set(['newsletter', 'newsletter-footer', 'contact', 'waitlist']);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MAX = { name: 120, email: 254, topic: 60, message: 5000, risk: 40, horizon: 40, region: 80, page: 200 };

export async function onRequestPost({ request, env }) {
  let f;
  try {
    const ct = request.headers.get('Content-Type') || '';
    f = ct.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch { return json({ ok: false, error: 'bad_request' }, 400); }

  const kind = String(f.kind || '');
  if (!KINDS.has(kind)) return json({ ok: false, error: 'bad_kind' }, 400);
  // Bots: a hidden field humans never fill, and forms sent less than two seconds after the page loaded.
  if (f.website || (Number(f.t) && Date.now() - Number(f.t) < 2000)) return json({ ok: true });

  const v = {};
  for (const k of Object.keys(MAX)) if (f[k] != null) v[k] = String(f[k]).trim().slice(0, MAX[k]);
  v.email = (v.email || '').toLowerCase();
  if (!EMAIL.test(v.email)) return json({ ok: false, error: 'email' }, 422);
  if (kind === 'contact' && (!v.name || !v.message)) return json({ ok: false, error: 'missing' }, 422);

  const country = request.cf?.country || null;
  const now = new Date().toISOString();
  let saved = false, mailed = false;

  if (env.DB) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, email TEXT NOT NULL, name TEXT, data TEXT, page TEXT, country TEXT, created_at TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, source TEXT, consent TEXT, country TEXT, created_at TEXT NOT NULL, unsubscribed_at TEXT)`),
    ]);
    const data = JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k]) => !['email', 'name', 'page'].includes(k))));
    const stmts = [env.DB.prepare(`INSERT INTO submissions (kind, email, name, data, page, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(kind, v.email, v.name || null, data, v.page || null, country, now)];
    if (kind !== 'contact') {
      // CASL: keep what the person agreed to and when.
      const consent = kind === 'waitlist' ? 'Pro waitlist: emails about QWERTx Pro' : 'Quarterly smart money briefing emails';
      stmts.push(env.DB.prepare(`INSERT INTO subscribers (email, source, consent, country, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET unsubscribed_at = NULL`).bind(v.email, kind, consent, country, now));
    }
    await env.DB.batch(stmts);
    saved = true;
  }

  if (kind === 'contact' && env.RESEND_API_KEY && env.MAIL_FROM) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.CONTACT_TO || 'support@qwertx.com'],
        reply_to: v.email,
        subject: `[QWERTx contact] ${v.topic || 'Message'} from ${v.name}`,
        text: `${v.message}\n\n— ${v.name} <${v.email}>${country ? ` (${country})` : ''}\nTopic: ${v.topic || '-'}\nPage: ${v.page || '-'}`,
      }),
    });
    mailed = res.ok;
  }

  if (!saved && !mailed) return json({ ok: false, error: 'not_configured' }, 503);
  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
