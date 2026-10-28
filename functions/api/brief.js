// GET  /api/brief            — the latest published QWERTx Brief and the archive. Pro members get the full text;
//                              everyone else gets the title and opening paragraph. Admins also get drafts.
// GET  /api/brief?id=12      — one Brief (same rules).
// POST /api/brief            — admins only: { id?, title, body, tickers, publish } creates or updates a Brief.
//                              publish: true publishes it (and it leads the next Friday digest); false keeps a draft.
// Admins are the emails listed in the ADMIN_EMAILS setting (comma-separated).
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { isAdmin, isPro } from '../../server/pro.js';
import { fail, json, nowIso, readBody, route, sameOrigin } from '../../server/util.js';

export const teaser = (body) => String(body || '').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('## '))[0] || '';

function view(b, full) {
  return {
    id: b.id, title: b.title, status: b.status, publishedAt: b.published_at, updatedAt: b.updated_at,
    tickers: String(b.tickers || '').split(/[\s,]+/).filter(Boolean),
    body: full ? b.body : null, teaser: teaser(b.body), locked: !full,
    up: b.up ?? undefined, down: b.down ?? undefined,
  };
}

export const onRequestGet = route(async ({ request, env }) => {
  if (!env.DB) return json({ ok: true, latest: null, archive: [] });
  const DB = await db(env);
  const user = await currentUser(request, env);
  const admin = isAdmin(env, user);
  const full = admin || isPro(user);
  const id = Number(new URL(request.url).searchParams.get('id')) || null;
  const where = admin ? '1=1' : `status = 'published'`;
  const tally = `(SELECT COUNT(*) FROM brief_votes v WHERE v.brief_id = b.id AND v.vote = 1) AS up, (SELECT COUNT(*) FROM brief_votes v WHERE v.brief_id = b.id AND v.vote = -1) AS down`;
  const pick = id
    ? await DB.prepare(`SELECT b.*, ${tally} FROM briefs b WHERE id = ? AND ${where}`).bind(id).first()
    : await DB.prepare(`SELECT b.*, ${tally} FROM briefs b WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`).first();
  const { results: archive = [] } = await DB.prepare(`SELECT id, title, status, published_at, updated_at FROM briefs b WHERE ${where} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 30`).all();
  const myVote = pick && user ? await DB.prepare(`SELECT vote FROM brief_votes WHERE brief_id = ? AND user_id = ?`).bind(pick.id, user.id).first() : null;
  const out = pick ? view(pick, full) : null;
  if (out && !admin) { delete out.up; delete out.down; }
  return json({ ok: true, admin, latest: out, myVote: myVote?.vote ?? null, archive: archive.map((a) => ({ id: a.id, title: a.title, status: a.status, publishedAt: a.published_at, updatedAt: a.updated_at })) });
});

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!isAdmin(env, user)) throw fail(403, 'Only QWERTx admins can publish the Brief.');
  const f = await readBody(request);
  const title = String(f.title || '').trim().slice(0, 160);
  const body = String(f.body || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
  if (!title || !body) throw fail(422, 'Give the Brief a title and some text.');
  const tickers = String(f.tickers || '').toUpperCase().split(/[\s,;]+/).filter((t) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)).slice(0, 20).join(',');
  const publish = f.publish === true || f.publish === 'true';
  const DB = await db(env);
  const t = nowIso();
  let id = Number(f.id) || null;
  if (id) {
    const cur = await DB.prepare(`SELECT * FROM briefs WHERE id = ?`).bind(id).first();
    if (!cur) throw fail(404, 'Brief not found.');
    await DB.prepare(`UPDATE briefs SET title = ?, body = ?, tickers = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?`)
      .bind(title, body, tickers, publish ? 'published' : 'draft', t, publish ? cur.published_at || t : null, id).run();
  } else {
    const r = await DB.prepare(`INSERT INTO briefs (title, body, tickers, status, author, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(title, body, tickers, publish ? 'published' : 'draft', user.email, t, t, publish ? t : null).run();
    id = r.meta?.last_row_id;
  }
  return json({ ok: true, id, status: publish ? 'published' : 'draft' });
});
