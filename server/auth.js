// Passwordless sign-in. A one-time link is emailed; opening it shows a "Sign in" button that POSTs the
// token (so mail scanners that pre-open links can't use it up). Sessions are random tokens stored hashed.
import { db } from './db.js';
import { cookies, nowIso, randomToken, sha256 } from './util.js';

export const SESSION_COOKIE = 'qx_session';
const SESSION_DAYS = 60;
const LINK_MINUTES = 30;

export async function currentUser(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || !env.DB) return null;
  const DB = await db(env);
  const row = await DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(token), nowIso()).first();
  return row || null;
}

export async function findOrCreateUser(DB, email) {
  email = email.toLowerCase();
  const found = await DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first();
  if (found) return found;
  await DB.prepare(`INSERT OR IGNORE INTO users (email, created_at, unsub_token) VALUES (?, ?, ?)`).bind(email, nowIso(), randomToken(18)).run();
  return DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first();
}

/** Creates a one-time sign-in token. Returns null when this address asked too often. */
export async function createLoginToken(DB, email, next) {
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const recent = await DB.prepare(`SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?`).bind(email, hourAgo).first();
  if ((recent?.n || 0) >= 5) return null;
  const token = randomToken(32);
  const now = Date.now();
  await DB.batch([
    DB.prepare(`DELETE FROM login_tokens WHERE expires_at < ?`).bind(new Date(now - 864e5).toISOString()),
    DB.prepare(`INSERT INTO login_tokens (token_hash, email, next, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`).bind(await sha256(token), email, safeNext(next), new Date(now).toISOString(), new Date(now + LINK_MINUTES * 60e3).toISOString()),
  ]);
  return token;
}

/** Uses a sign-in token once. Returns { user, next } or null. */
export async function useLoginToken(DB, token) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await DB.prepare(`SELECT * FROM login_tokens WHERE token_hash = ?`).bind(hash).first();
  if (!row || row.used_at || row.expires_at < nowIso()) return null;
  const res = await DB.prepare(`UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`).bind(nowIso(), hash).run();
  if (!res.meta?.changes) return null;
  const user = await findOrCreateUser(DB, row.email);
  await DB.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(nowIso(), user.id).run();
  return { user, next: row.next || '/account.html' };
}

export async function createSession(DB, userId) {
  const token = randomToken(32);
  const now = Date.now();
  await DB.batch([
    DB.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(new Date(now).toISOString()),
    DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).bind(await sha256(token), userId, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 864e5).toISOString()),
  ]);
  return sessionCookie(token, SESSION_DAYS * 86400);
}

export async function endSession(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (token && env.DB) await (await db(env)).prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  return sessionCookie('', 0);
}

export const sessionCookie = (value, maxAge) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/** Only same-site paths are allowed as a post-sign-in destination. */
export function safeNext(next) {
  return typeof next === 'string' && /^\/[A-Za-z0-9/_\-.?=&#%]*$/.test(next) && !next.startsWith('//') ? next.slice(0, 200) : '/account.html';
}
