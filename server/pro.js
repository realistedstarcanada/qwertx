// QWERTx Pro rules: who counts as Pro, watchlist limits, alert preferences and ticker clean-up.
import pro from '../config/pro.json';
import aliasCfg from '../config/ticker-aliases.json';

export const LIMITS = pro.limits;
export const ACTIVE = new Set(['active', 'trialing', 'past_due']); // past_due: Stripe is retrying the card

export const isPro = (u) => !!u && ACTIVE.has(u.sub_status || '');
export const limitFor = (u) => (isPro(u) ? LIMITS.pro : LIMITS.free);

export const DEFAULT_PREFS = {
  mode: 'instant', // instant | daily (Pro only; free members get the weekly digest)
  weekly: true, // Friday digest
  types: { f13: true, cg: true, ins: true },
  managers: [], // empty = every tracked manager
  minChange: 10, // % change in shares that counts as a meaningful add or trim
  snoozeUntil: null, // ISO date
  quiet: { on: false, start: 22, end: 7, tz: 'America/Toronto' },
  emailOff: false, // unsubscribed from alert and digest emails (sign-in links still work)
};

export function prefsOf(u) {
  let p = {};
  try { p = JSON.parse(u?.prefs || '{}'); } catch {}
  return { ...DEFAULT_PREFS, ...p, types: { ...DEFAULT_PREFS.types, ...(p.types || {}) }, quiet: { ...DEFAULT_PREFS.quiet, ...(p.quiet || {}) } };
}

/** Accepts only known keys with sane values. Free members can only change digest/email settings. */
export function cleanPrefs(input, current, { pro: isProUser }) {
  const p = { ...current };
  const bool = (v) => v === true || v === 'true' || v === 'on' || v === 1;
  if ('weekly' in input) p.weekly = bool(input.weekly);
  if ('emailOff' in input) p.emailOff = bool(input.emailOff);
  if (!isProUser) return p;
  if (input.mode === 'instant' || input.mode === 'daily') p.mode = input.mode;
  if (input.types && typeof input.types === 'object') for (const k of ['f13', 'cg', 'ins']) if (k in input.types) p.types[k] = bool(input.types[k]);
  if (Array.isArray(input.managers)) p.managers = input.managers.filter((s) => /^[a-z0-9-]{2,60}$/.test(s)).slice(0, 40);
  if (input.minChange != null) {
    const n = Number(input.minChange);
    if ([1, 5, 10, 25, 50].includes(n)) p.minChange = n;
  }
  if ('snoozeUntil' in input) {
    const v = input.snoozeUntil;
    p.snoozeUntil = v && !Number.isNaN(Date.parse(v)) && Date.parse(v) > Date.now() ? new Date(Math.min(Date.parse(v), Date.now() + 31 * 864e5)).toISOString() : null;
  }
  if (input.quiet && typeof input.quiet === 'object') {
    const h = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : d);
    p.quiet = {
      on: bool(input.quiet.on),
      start: h(input.quiet.start, p.quiet.start),
      end: h(input.quiet.end, p.quiet.end),
      tz: /^[A-Za-z_]+\/[A-Za-z_]+$/.test(input.quiet.tz || '') ? input.quiet.tz : p.quiet.tz,
    };
  }
  return p;
}

export function inQuietHours(prefs, now = new Date()) {
  const q = prefs.quiet;
  if (!q?.on) return false;
  let hour;
  try {
    hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: q.tz }).format(now));
  } catch {
    hour = now.getUTCHours();
  }
  return q.start > q.end ? hour >= q.start || hour < q.end : hour >= q.start && hour < q.end;
}

export const isSnoozed = (prefs, now = Date.now()) => !!prefs.snoozeUntil && Date.parse(prefs.snoozeUntil) > now;

/**
 * Turns what someone typed into the ticker we track.
 *   "aapl" -> AAPL · "BRK-B" / "BRK/B" -> BRK.B · "RY.TO" / "TSX:RY" / "RY:CA" -> RY (US listing)
 * Returns { ticker } or { error: 'invalid' | 'not_covered', input }.
 */
export function normalizeTicker(raw, aliases = aliasCfg.aliases) {
  const input = String(raw || '').trim().toUpperCase().replace(/^\$/, '');
  if (!input || input.length > 16) return { error: 'invalid', input };
  let tsx = null;
  let m;
  if ((m = /^(?:TSX|TSE|XTSE)\s*[:\-]\s*([A-Z0-9.\-/]+)$/.exec(input))) tsx = m[1];
  else if ((m = /^([A-Z0-9.\-/]+?)(?:\.TO|\.TSX|:TSX|:CA|:CN|-T|\.CN| CN)$/.exec(input))) tsx = m[1];
  if (tsx) {
    const key = tsx.replace(/[./]/g, '-') + '.TO'; // TECK.B -> TECK-B.TO, BIP.UN -> BIP-UN.TO
    const us = aliases[key] || aliases[tsx + '.TO'];
    return us ? { ticker: us, from: input } : { error: 'not_covered', input };
  }
  const t = input.replace(/[\/-]([A-Z])$/, '.$1').replace(/\s+/g, '');
  if (!/^[A-Z][A-Z0-9]{0,6}(\.[A-Z])?$/.test(t)) return { error: 'invalid', input };
  return { ticker: t };
}
