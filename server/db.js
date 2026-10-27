// D1 schema for QWERTx Pro. Tables are created on first use, so binding an empty D1 database as DB is
// the only setup. The same statements live in server/schema.sql for anyone who prefers migrations.
// Privacy: a watchlist is only ticker symbols. No share counts, cost basis or brokerage details are stored.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    stripe_customer TEXT,
    stripe_sub TEXT,
    sub_status TEXT,
    sub_plan TEXT,
    period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    founding INTEGER NOT NULL DEFAULT 0,
    prefs TEXT NOT NULL DEFAULT '{}',
    unsub_token TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS users_customer ON users(stripe_customer)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, next TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS watchlist (user_id INTEGER NOT NULL, ticker TEXT NOT NULL, input TEXT, added_at TEXT NOT NULL, PRIMARY KEY (user_id, ticker))`,
  `CREATE INDEX IF NOT EXISTS watchlist_ticker ON watchlist(ticker)`,
  `CREATE TABLE IF NOT EXISTS events_seen (id TEXT PRIMARY KEY, ticker TEXT, at TEXT, seen_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS alerts (user_id INTEGER NOT NULL, event_id TEXT NOT NULL, ticker TEXT NOT NULL, event TEXT NOT NULL, created_at TEXT NOT NULL, emailed_at TEXT, channel TEXT, PRIMARY KEY (user_id, event_id))`,
  `CREATE INDEX IF NOT EXISTS alerts_pending ON alerts(emailed_at, created_at)`,
  `CREATE TABLE IF NOT EXISTS digests (user_id INTEGER NOT NULL, kind TEXT NOT NULL, period TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY (user_id, kind, period))`,
  `CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT, received_at TEXT NOT NULL)`,
];

let ready = false;
export async function db(env) {
  if (!env.DB) throw Object.assign(new Error('Database not configured'), { status: 503 });
  if (!ready) {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    ready = true;
  }
  return env.DB;
}

export const SCHEMA_SQL = SCHEMA.map((s) => s + ';').join('\n');
