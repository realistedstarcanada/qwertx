// POST /api/brief-vote { id, vote: 1 | -1, question? } — "Was this useful?" and "Ask a question" on the Brief.
// Signed-in members only; one vote per Brief per member (a new vote replaces the old one).
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { fail, json, nowIso, readBody, route, sameOrigin } from '../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!user) throw fail(401, 'Please sign in first.');
  const f = await readBody(request);
  const id = Number(f.id);
  const vote = f.vote === 1 || f.vote === '1' ? 1 : f.vote === -1 || f.vote === '-1' ? -1 : null;
  const question = f.question ? String(f.question).trim().slice(0, 1000) : null;
  if (!id || (vote == null && !question)) throw fail(422, 'Nothing to save.');
  const DB = await db(env);
  const b = await DB.prepare(`SELECT id FROM briefs WHERE id = ? AND status = 'published'`).bind(id).first();
  if (!b) throw fail(404, 'Brief not found.');
  await DB.prepare(`INSERT INTO brief_votes (brief_id, user_id, vote, question, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(brief_id, user_id) DO UPDATE SET vote = COALESCE(excluded.vote, brief_votes.vote), question = COALESCE(excluded.question, brief_votes.question), created_at = excluded.created_at`)
    .bind(id, user.id, vote, question, nowIso()).run();
  return json({ ok: true });
});
