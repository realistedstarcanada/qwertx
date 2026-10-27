// Scheduled work, triggered by .github/workflows/pro-alerts.yml with Authorization: Bearer CRON_SECRET.
import { ALERT_MAX_AGE_DAYS, wants } from './alerts.js';
import { alertEmail, sendBatch, weeklyEmail } from './mail.js';
import { inQuietHours, isPro, isSnoozed, limitFor, prefsOf } from './pro.js';
import { nowIso } from './util.js';

export function authorized(request, env) {
  const h = request.headers.get('Authorization') || '';
  return !!env.CRON_SECRET && h === `Bearer ${env.CRON_SECRET}`;
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const placeholders = (n) => Array(n).fill('?').join(',');

/** Watchlist rows for these tickers with each member's rank, so stocks beyond a plan's limit are skipped. */
async function watchersOf(DB, tickers) {
  const rows = [];
  for (const part of chunk(tickers, 90)) {
    const { results = [] } = await DB.prepare(
      `WITH ranked AS (SELECT user_id, ticker, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_at, ticker) AS rn FROM watchlist)
       SELECT r.user_id, r.ticker, r.rn, u.email, u.prefs, u.sub_status, u.unsub_token FROM ranked r JOIN users u ON u.id = r.user_id
       WHERE r.ticker IN (${placeholders(part.length)})`,
    ).bind(...part).all();
    rows.push(...results);
  }
  return rows.filter((r) => r.rn <= limitFor(r));
}

/**
 * 1) Records which events are new since the last run (the very first run only takes a baseline).
 * 2) Creates an alert row for every member watching an affected stock who wants that kind of event.
 * 3) Emails pending alerts to Pro members on instant alerts who aren't snoozed or in quiet hours.
 */
export async function dispatch({ DB, env, site, events, managers, now = new Date() }) {
  const stats = { events: events.length, fresh: 0, alerts: 0, emails: 0, baseline: false };
  const seenBefore = (await DB.prepare(`SELECT COUNT(*) AS n FROM events_seen`).first())?.n || 0;
  const t = nowIso();
  const fresh = [];
  for (const part of chunk(events, 50)) {
    const res = await DB.batch(part.map((e) => DB.prepare(`INSERT OR IGNORE INTO events_seen (id, ticker, at, seen_at) VALUES (?, ?, ?, ?)`).bind(e.id, e.t, e.at, t)));
    part.forEach((e, i) => { if (res[i].meta?.changes) fresh.push(e); });
  }
  if (!seenBefore) {
    stats.baseline = true;
    return stats;
  }
  const maxAge = ALERT_MAX_AGE_DAYS * 864e5;
  const alertable = fresh.filter((e) => now - Date.parse(e.at) <= maxAge);
  stats.fresh = alertable.length;

  if (alertable.length) {
    const byTicker = new Map();
    for (const e of alertable) {
      if (!byTicker.has(e.t)) byTicker.set(e.t, []);
      byTicker.get(e.t).push(e);
    }
    const watchers = await watchersOf(DB, [...byTicker.keys()]);
    const inserts = [];
    for (const w of watchers) {
      const prefs = prefsOf(w);
      for (const e of byTicker.get(w.ticker) || []) {
        if (!wants(e, prefs)) continue;
        inserts.push(DB.prepare(`INSERT OR IGNORE INTO alerts (user_id, event_id, ticker, event, created_at) VALUES (?, ?, ?, ?, ?)`).bind(w.user_id, e.id, e.t, JSON.stringify(e), t));
      }
    }
    for (const part of chunk(inserts, 50)) await DB.batch(part);
    stats.alerts = inserts.length;
  }

  stats.emails = await sendPending({ DB, env, site, managers, now, mode: 'instant' });
  // Housekeeping: old event ids can't come back (they fall out of events-recent.json), old alerts aren't shown.
  await DB.batch([
    DB.prepare(`DELETE FROM events_seen WHERE seen_at < ?`).bind(new Date(now - 90 * 864e5).toISOString()),
    DB.prepare(`DELETE FROM alerts WHERE created_at < ?`).bind(new Date(now - 180 * 864e5).toISOString()),
  ]);
  return stats;
}

/**
 * Emails pending alerts as one message per member. mode 'instant': Pro members on instant alerts (held
 * during snooze and quiet hours, and anything older than two days is left for the weekly digest).
 * mode 'daily': Pro members who chose a daily summary.
 */
export async function sendPending({ DB, env, site, managers, now = new Date(), mode }) {
  const since = new Date(now - (mode === 'daily' ? 3 : 2) * 864e5).toISOString();
  const { results = [] } = await DB.prepare(
    `SELECT a.user_id, a.event_id, a.event, u.email, u.prefs, u.sub_status, u.unsub_token FROM alerts a JOIN users u ON u.id = a.user_id
     WHERE a.emailed_at IS NULL AND a.created_at > ? ORDER BY a.user_id, a.created_at LIMIT 2000`,
  ).bind(since).all();
  const byUser = new Map();
  for (const r of results) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { user: { id: r.user_id, email: r.email, unsub_token: r.unsub_token, sub_status: r.sub_status, prefs: r.prefs }, rows: [] });
    byUser.get(r.user_id).rows.push(r);
  }
  const msgs = [];
  const done = [];
  for (const { user, rows } of byUser.values()) {
    const prefs = prefsOf(user);
    if (!isPro(user) || prefs.emailOff || prefs.mode !== mode) continue;
    if (mode === 'instant' && (isSnoozed(prefs, +now) || inQuietHours(prefs, now))) continue;
    const events = rows.map((r) => JSON.parse(r.event)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
    msgs.push(alertEmail(env, { site, user, events, managers, daily: mode === 'daily' }));
    done.push(...rows.map((r) => [r.user_id, r.event_id]));
  }
  if (!msgs.length) return 0;
  const sent = await sendBatch(env, msgs);
  if (sent) {
    const t = nowIso();
    for (const part of chunk(done, 50)) await DB.batch(part.map(([u, id]) => DB.prepare(`UPDATE alerts SET emailed_at = ?, channel = ? WHERE user_id = ? AND event_id = ?`).bind(t, mode, u, id)));
  }
  return sent;
}

export const isoWeek = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y = x.getUTCFullYear();
  const w = Math.ceil(((x - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
};

/**
 * Friday digest for everyone with a watchlist who hasn't turned it off. Sent in pages of `pageSize`
 * members (the workflow calls again with ?after=<last id> until done). Quiet weeks still get an email.
 */
export async function weekly({ DB, env, site, index, after = 0, pageSize = 60, now = new Date() }) {
  const period = isoWeek(now);
  const { results: users = [] } = await DB.prepare(
    `SELECT u.* FROM users u WHERE u.id > ? AND EXISTS (SELECT 1 FROM watchlist w WHERE w.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM digests d WHERE d.user_id = u.id AND d.kind = 'weekly' AND d.period = ?) ORDER BY u.id LIMIT ?`,
  ).bind(after, period, pageSize).all();
  if (!users.length) return { sent: 0, next: null, period };
  const ids = users.map((u) => u.id);
  const since = new Date(now - 7 * 864e5).toISOString();
  const [{ results: wl = [] }, { results: al = [] }] = await DB.batch([
    DB.prepare(`SELECT user_id, ticker FROM watchlist WHERE user_id IN (${placeholders(ids.length)}) ORDER BY user_id, added_at, ticker`).bind(...ids),
    DB.prepare(`SELECT user_id, event_id, event FROM alerts WHERE user_id IN (${placeholders(ids.length)}) AND created_at > ? ORDER BY created_at DESC`).bind(...ids, since),
  ]);
  const order = index.managerOrder || Object.keys(index.managers || {});
  const msgs = [];
  const sentIds = [];
  for (const user of users) {
    const prefs = prefsOf(user);
    if (prefs.emailOff || prefs.weekly === false) {
      sentIds.push(user.id); // nothing to send this week, don't look again
      continue;
    }
    const pro = isPro(user);
    const tickers = wl.filter((r) => r.user_id === user.id).map((r) => r.ticker).slice(0, limitFor(user));
    const snapshot = tickers.map((t) => {
      const x = index.tickers[t];
      if (!x) return { t, name: t, owners: 0, bought: 0, trimmed: 0, exited: 0, holders: [], earnings: null };
      const e = x[7] && Date.parse(x[7]) - now < 14 * 864e5 && Date.parse(x[7]) >= now - 864e5 ? x[7] : null;
      return { t, name: x[0], owners: x[1], bought: x[2], trimmed: x[3], exited: x[4], holders: (x[6] || []).map((i) => order[i]), earnings: e ? fmtShort(e) : null };
    });
    const events = al.filter((r) => r.user_id === user.id).map((r) => JSON.parse(r.event)).filter((e) => tickers.includes(e.t));
    msgs.push(weeklyEmail(env, { site, user, events, managers: index.managers, snapshot, pro }));
    sentIds.push(user.id);
  }
  const sent = msgs.length ? await sendBatch(env, msgs) : 0;
  if (sent || !msgs.length) {
    const t = nowIso();
    await DB.batch([
      ...sentIds.map((id) => DB.prepare(`INSERT OR IGNORE INTO digests (user_id, kind, period, sent_at) VALUES (?, 'weekly', ?, ?)`).bind(id, period, t)),
      // Anything still pending is covered by this digest.
      DB.prepare(`UPDATE alerts SET emailed_at = ?, channel = 'weekly' WHERE emailed_at IS NULL AND user_id IN (${placeholders(sentIds.length)})`).bind(t, ...sentIds),
    ]);
  }
  return { sent, next: users.length === pageSize ? users.at(-1).id : null, period };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtShort(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
