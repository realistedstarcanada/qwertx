// QWERTx Pro: end-to-end through the Functions with a fake Stripe and fake email, plus unit tests.
// Needs the JSON import hook: npm test sets it up.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { D1, assets, client, handle } from './harness/pages.mjs';
import { normalizeTicker, cleanPrefs, DEFAULT_PREFS, inQuietHours } from '../server/pro.js';
import { verifyWebhook } from '../server/stripe.js';
import { describe as describeEvent, wants } from '../server/alerts.js';
import { isoWeek } from '../server/cron.js';

const WEBHOOK_SECRET = 'whsec_test_123';
const today = new Date().toISOString().slice(0, 10);

// ---------- fake Stripe + Resend ----------
const stripe = { prices: [], sessions: [], subs: {}, deleted: [], calls: [] };
const mail = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = (init.method || 'GET').toUpperCase();
  const form = init.body && typeof init.body === 'string' && !init.body.startsWith('{') && !init.body.startsWith('[') ? Object.fromEntries(new URLSearchParams(init.body)) : null;
  const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.host === 'api.resend.com') {
    const body = JSON.parse(init.body);
    for (const m of [].concat(body)) mail.push(m);
    return ok({ id: 'em_1' });
  }
  if (url.host !== 'api.stripe.com') return realFetch(input, init);
  stripe.calls.push(`${method} ${url.pathname}`);
  const p = url.pathname.replace('/v1', '');
  if (p === '/prices' && method === 'GET') {
    const key = url.searchParams.get('lookup_keys[]');
    return ok({ data: stripe.prices.filter((x) => x.lookup_key === key && x.active) });
  }
  if (p === '/prices' && method === 'POST') {
    for (const x of stripe.prices) if (x.lookup_key === form.lookup_key) x.lookup_key = null;
    const price = { id: `price_${stripe.prices.length + 1}`, active: true, lookup_key: form.lookup_key, unit_amount: Number(form.unit_amount), currency: form.currency, product: form.product, recurring: { interval: form['recurring[interval]'] } };
    stripe.prices.push(price);
    return ok(price);
  }
  if (p === '/checkout/sessions' && method === 'POST') {
    const s = { id: `cs_test_${stripe.sessions.length + 1}`, url: `https://checkout.stripe.test/${stripe.sessions.length + 1}`, form };
    stripe.sessions.push(s);
    return ok(s);
  }
  if (p.startsWith('/subscriptions/') && method === 'GET') return ok(stripe.subs[p.split('/')[2]]);
  if (p.startsWith('/subscriptions/') && method === 'DELETE') { stripe.deleted.push(p.split('/')[2]); return ok({ id: p.split('/')[2], status: 'canceled' }); }
  if (p === '/billing_portal/sessions') return ok({ url: 'https://billing.stripe.test/p' });
  if (p.startsWith('/customers/')) return ok({ id: p.split('/')[2], email: 'someone@example.com' });
  return new Response(JSON.stringify({ error: { message: `fake stripe: ${method} ${p}` } }), { status: 404 });
};

function signed(event, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return { body, header: `t=${t},v1=${sig}` };
}

let env, web, cron;
before(() => {
  if (!fs.existsSync('dist/pro/index.json')) {
    const r = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
    assert.equal(r.status, 0, 'build failed');
  }
  env = {
    DB: new D1(),
    ASSETS: assets(),
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RESEND_API_KEY: 're_fake',
    MAIL_FROM: 'QWERTx <alerts@qwertx.test>',
    CRON_SECRET: 'cron-secret',
    SITE_URL: 'https://qwertx.test',
  };
  web = client(env);
  cron = (p) => handle(new Request('https://qwertx.test' + p, { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }), env).then((r) => r.json());
});

const lastLink = () => {
  const m = mail.at(-1);
  return /signin=([A-Za-z0-9_-]+)/.exec(m.text)[1];
};

test('sign in with an emailed link, once', async () => {
  let r = await web.req('GET', '/api/me');
  assert.equal(r.json.signedIn, false);
  r = await web.req('POST', '/api/auth/start', { body: { email: 'Alex@Example.com' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(mail.at(-1).to[0], 'alex@example.com');
  const token = lastLink();
  r = await web.req('POST', '/api/auth/verify', { body: { token } });
  assert.equal(r.status, 200, r.text);
  assert.ok(web.jar.qx_session);
  r = await web.req('POST', '/api/auth/verify', { body: { token } });
  assert.equal(r.status, 400, 'a link works only once');
  r = await web.req('GET', '/api/me');
  assert.equal(r.json.signedIn, true);
  assert.equal(r.json.email, 'alex@example.com');
  assert.equal(r.json.pro, false);
  assert.equal(r.json.limit, 3);
});

test('rejects requests from other sites and bad emails', async () => {
  let r = await web.req('POST', '/api/watchlist', { body: { tickers: ['AAPL'] }, headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  r = await web.req('POST', '/api/auth/start', { body: { email: 'not-an-email' } });
  assert.equal(r.status, 422);
});

test('free watchlist: clean-up, Canadian aliases, limit of 3', async () => {
  const r = await web.req('POST', '/api/watchlist', { body: { tickers: ['aapl', 'AAPL', 'RY.TO', 'XYZQ.TO', '$msft', 'BRK-B', '12345'] } });
  assert.equal(r.status, 200, r.text);
  const by = Object.fromEntries(r.json.results.map((x) => [x.input, x]));
  assert.equal(by.aapl.status, 'added');
  assert.equal(by.AAPL.status, 'duplicate');
  assert.equal(by['RY.TO'].status, 'mapped');
  assert.equal(by['RY.TO'].ticker, 'RY');
  assert.equal(by['XYZQ.TO'].status, 'not_covered');
  assert.equal(by.$msft.status, 'added');
  assert.equal(by['BRK-B'].status, 'limit');
  assert.equal(by['12345'].status, 'invalid');
  assert.deepEqual(r.json.watchlist.map((w) => w.ticker), ['AAPL', 'RY', 'MSFT']);
});

test('free members can only change digest settings', async () => {
  const r = await web.req('POST', '/api/prefs', { body: { mode: 'daily', weekly: false, minChange: 50 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.prefs.mode, 'instant');
  assert.equal(r.json.prefs.minChange, 10);
  assert.equal(r.json.prefs.weekly, false);
  await web.req('POST', '/api/prefs', { body: { weekly: true } });
});

test('founding checkout creates the configured price and links the account', async () => {
  const r = await web.req('POST', '/api/checkout?plan=founding&format=json');
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.url, /checkout\.stripe\.test/);
  const price = stripe.prices.find((p) => p.lookup_key === 'qx_pro_founding_usd_9900');
  assert.equal(price.unit_amount, 9900);
  assert.equal(price.recurring.interval, 'year');
  const s = stripe.sessions.at(-1).form;
  assert.equal(s['line_items[0][price]'], price.id);
  assert.equal(s.customer_email, 'alex@example.com');
  assert.equal(s['metadata[plan]'], 'founding');
  assert.ok(s.client_reference_id);
  // A second checkout reuses the price instead of creating another.
  await web.req('POST', '/api/checkout?plan=founding&format=json');
  assert.equal(stripe.prices.filter((p) => p.unit_amount === 9900).length, 1);
});

test('webhook: signature checked, membership activated once', async () => {
  const me = (await web.req('GET', '/api/me')).json;
  stripe.subs.sub_1 = { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { plan: 'founding' }, current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_x', metadata: {} } }] } };
  const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', client_reference_id: '1', customer_details: { email: me.email }, metadata: { plan: 'founding' } } } };
  const bad = signed(event, 'whsec_wrong');
  let r = await web.req('POST', '/api/stripe-webhook', { body: bad.body, raw: true, headers: { 'Stripe-Signature': bad.header } });
  assert.equal(r.status, 400);
  const good = signed(event);
  const mailsBefore = mail.length;
  r = await web.req('POST', '/api/stripe-webhook', { body: good.body, raw: true, headers: { 'Stripe-Signature': good.header } });
  assert.equal(r.status, 200, r.text);
  assert.equal(mail.length, mailsBefore + 1, 'welcome email with a sign-in link');
  assert.match(mail.at(-1).subject, /founding member/i);
  r = await web.req('POST', '/api/stripe-webhook', { body: good.body, raw: true, headers: { 'Stripe-Signature': good.header } });
  assert.equal(r.json.duplicate, true);
  const after = (await web.req('GET', '/api/me')).json;
  assert.equal(after.pro, true);
  assert.equal(after.founding, true);
  assert.equal(after.limit, 50);
  assert.equal(after.plan, 'founding');
  const st = await (await handle(new Request('https://qwertx.test/api/pro-status'), env)).json();
  assert.equal(st.founding.left, 499);
});

test('already-Pro members are not sent to checkout again', async () => {
  const r = await web.req('POST', '/api/checkout?plan=monthly&format=json');
  assert.match(r.json.url, /already=pro/);
});

test('Pro watchlist goes past 3 and keeps settings', async () => {
  let r = await web.req('POST', '/api/watchlist', { body: { tickers: 'BRK-B NVDA TSM' } });
  assert.deepEqual(r.json.watchlist.map((w) => w.ticker), ['AAPL', 'RY', 'MSFT', 'BRK.B', 'NVDA', 'TSM']);
  r = await web.req('POST', '/api/prefs', { body: { mode: 'instant', minChange: 5, managers: ['warren-buffett', 'BAD SLUG'], quiet: { on: false } } });
  assert.equal(r.json.prefs.minChange, 5);
  assert.deepEqual(r.json.prefs.managers, ['warren-buffett']);
});

test('optional position sizes and a display name', async () => {
  let r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'AAPL', amount: '$10,000' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.watchlist.find((w) => w.ticker === 'AAPL'), { ...r.json.watchlist.find((w) => w.ticker === 'AAPL'), amount: 10000, shares: null });
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'AAPL', shares: '12.5', amount: 5, paid: '190' } });
  const aapl = r.json.watchlist.find((w) => w.ticker === 'AAPL');
  assert.equal(aapl.shares, 12.5, 'shares win when both are sent');
  assert.equal(aapl.amount, null);
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'AAPL', shares: '-3' } });
  assert.equal(r.json.watchlist.find((w) => w.ticker === 'AAPL').shares, null, 'nonsense clears the size');
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'AAPL', shares: '5' } });
  assert.equal(r.status, 422, 'shares need the average price');
  r = await web.req('PATCH', '/api/watchlist', { body: { ticker: 'ZZZZ', shares: 1, paid: 2 } });
  assert.equal(r.status, 404);
  r = await web.req('POST', '/api/watchlist', { body: { items: [{ ticker: 'GOOG', amount: '8,000' }, { ticker: 'AMZN', shares: 10 }] } });
  assert.equal(r.json.watchlist.find((w) => w.ticker === 'GOOG').amount, 8000);
  assert.equal(r.json.watchlist.find((w) => w.ticker === 'AMZN').shares, null, 'shares without an average price are not saved');
  assert.equal(r.json.results.find((x) => x.ticker === 'AMZN').needsPrice, 10, 'and the member is asked for it');
  r = await web.req('POST', '/api/prefs', { body: { name: '  Harman <b>Gill</b> ' } });
  assert.equal(r.json.name, 'Harman bGill/b');
  await web.req('DELETE', '/api/watchlist?ticker=GOOG');
  await web.req('DELETE', '/api/watchlist?ticker=AMZN');
});

test('other share classes show the same company owners', () => {
  const goog = JSON.parse(fs.readFileSync('dist/pro/t/GOOG.json', 'utf8'));
  const googl = JSON.parse(fs.readFileSync('dist/pro/t/GOOGL.json', 'utf8'));
  assert.equal(goog.h.length, googl.h.length);
  assert.equal(goog.co, 'GOOGL');
  assert.ok(googl.px.p > 0, 'quarter-end price for valuing share counts');
});

test('alerts: baseline first, then only fresh events, emailed once', async () => {
  assert.equal((await handle(new Request('https://qwertx.test/api/internal/dispatch', { method: 'POST' }), env)).status, 401);
  const base = await cron('/api/internal/dispatch');
  assert.equal(base.baseline, true);
  // New filings appear: one Buffett move in AAPL (wanted), one in a stock nobody watches,
  // one below the 5% threshold, and one old filing that turned up late (digest only, no instant alert).
  const feed = JSON.parse(fs.readFileSync('dist/pro/events-recent.json', 'utf8'));
  const fresh = [
    { k: '13f', id: 'test:1', t: 'AAPL', at: today, m: 'warren-buffett', a: 'add', c: 12, w: 22.5, v: 1, p: '2026-09-30', u: 'https://www.sec.gov/x' },
    { k: '13f', id: 'test:2', t: 'ZZZZ', at: today, m: 'warren-buffett', a: 'new', c: null, w: 1, v: 1, p: '2026-09-30', u: null },
    { k: '13f', id: 'test:3', t: 'AAPL', at: today, m: 'warren-buffett', a: 'trim', c: -2, w: 22, v: 1, p: '2026-09-30', u: null },
    { k: 'cg', id: 'test:4', t: 'NVDA', at: '2026-01-02', who: 'Someone', p: 'D', ch: 'House', a: 'buy', amt: '$1,001 – $15,000', d: '2025-12-01', u: null },
    { k: 'cg', id: 'test:5', t: 'TSM', at: today, who: 'Pat Example', p: 'R', ch: 'Senate', a: 'buy', amt: '$15,001 – $50,000', d: today, u: null },
  ];
  env.ASSETS.overrides['/pro/events-recent.json'] = { ...feed, events: [...fresh, ...feed.events] };
  const mailsBefore = mail.length;
  const s = await cron('/api/internal/dispatch');
  assert.equal(s.ok, true);
  assert.equal(s.alerts, 2, JSON.stringify(s)); // Buffett AAPL add (manager filter allows it) + TSM senate buy
  assert.equal(s.emails, 1);
  assert.equal(mail.length, mailsBefore + 1);
  const m = mail.at(-1);
  assert.match(m.text, /Warren Buffett added 12% more AAPL shares/);
  assert.match(m.text, /filed /);
  assert.ok(m.headers['List-Unsubscribe']);
  const again = await cron('/api/internal/dispatch');
  assert.equal(again.alerts, 0);
  assert.equal(again.emails, 0);
});

test('daily summary members get one morning email instead', async () => {
  await web.req('POST', '/api/prefs', { body: { mode: 'daily' } });
  const feed = env.ASSETS.overrides['/pro/events-recent.json'];
  feed.events.unshift({ k: '13f', id: 'test:6', t: 'MSFT', at: today, m: 'warren-buffett', a: 'new', c: null, w: 3, v: 1, p: '2026-09-30', u: null });
  const s = await cron('/api/internal/dispatch');
  assert.equal(s.alerts, 1);
  assert.equal(s.emails, 0);
  const d = await cron('/api/internal/digest?kind=daily');
  assert.equal(d.sent, 1);
  assert.match(mail.at(-1).subject, /Your stocks today/);
});

test('weekly digest goes out once per week, quiet weeks included', async () => {
  const w = await cron('/api/internal/digest?kind=weekly');
  assert.equal(w.sent, 1);
  assert.equal(w.period, isoWeek());
  assert.match(mail.at(-1).text, /Where|stand|AAPL/);
  const again = await cron('/api/internal/digest?kind=weekly');
  assert.equal(again.sent, 0);
});

test('one-click unsubscribe stops alert emails', async () => {
  const token = /u=([A-Za-z0-9_-]+)/.exec(mail.at(-1).text)[1];
  const r = await web.req('GET', `/api/unsubscribe?u=${token}`);
  assert.equal(r.status, 200);
  const me = (await web.req('GET', '/api/me')).json;
  assert.equal(me.prefs.emailOff, true);
});

test('when Pro ends, stocks past the free limit are paused, not deleted', async () => {
  const sub = { ...stripe.subs.sub_1, status: 'canceled' };
  const ev = signed({ id: 'evt_2', type: 'customer.subscription.deleted', data: { object: sub } });
  const r = await web.req('POST', '/api/stripe-webhook', { body: ev.body, raw: true, headers: { 'Stripe-Signature': ev.header } });
  assert.equal(r.status, 200, r.text);
  const me = (await web.req('GET', '/api/me')).json;
  assert.equal(me.pro, false);
  assert.equal(me.watchlist.length, 6);
  assert.deepEqual(me.watchlist.filter((w) => w.active).map((w) => w.ticker), ['AAPL', 'RY', 'MSFT']);
});

test('delete account removes everything', async () => {
  const r = await web.req('DELETE', '/api/account');
  assert.equal(r.status, 200);
  const me = (await web.req('GET', '/api/me')).json;
  assert.equal(me.signedIn, false);
  const n = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM watchlist) + (SELECT COUNT(*) FROM alerts) AS n').first();
  assert.equal(n.n, 0);
});

// ---------- units ----------

test('ticker clean-up', () => {
  assert.deepEqual(normalizeTicker(' brk/b '), { ticker: 'BRK.B' });
  assert.deepEqual(normalizeTicker('TSX:CNR'), { ticker: 'CNI', from: 'TSX:CNR' });
  assert.deepEqual(normalizeTicker('T.TO'), { ticker: 'TU', from: 'T.TO' });
  assert.deepEqual(normalizeTicker('TECK.B.TO'), { ticker: 'TECK', from: 'TECK.B.TO' });
  assert.equal(normalizeTicker('T').ticker, 'T', 'bare T is AT&T, not Telus');
  assert.equal(normalizeTicker('L.TO').error, 'not_covered');
  assert.equal(normalizeTicker('').error, 'invalid');
});

test('alert preferences and quiet hours', () => {
  const p = cleanPrefs({ minChange: 7, snoozeUntil: '2000-01-01', quiet: { on: true, start: 22, end: 7, tz: 'America/Toronto' } }, DEFAULT_PREFS, { pro: true });
  assert.equal(p.minChange, 10, 'only offered thresholds');
  assert.equal(p.snoozeUntil, null, 'no snoozing into the past');
  // 03:00 UTC = 23:00 Toronto (EDT)
  assert.equal(inQuietHours(p, new Date('2026-10-20T03:00:00Z')), true);
  assert.equal(inQuietHours(p, new Date('2026-10-20T16:00:00Z')), false);
  const e = { k: '13f', a: 'add', c: 8, m: 'x' };
  assert.equal(wants(e, { ...p, minChange: 10 }), false);
  assert.equal(wants(e, { ...p, minChange: 5 }), true);
});

test('alert wording keeps the dates and never says buy or sell advice', () => {
  const d = describeEvent({ k: 'ins', t: 'ABC', n: 4, v: 2500000, s: '2026-09-01', e: '2026-09-20', win: 30 }, {});
  assert.match(d.text, /4 company insiders bought ABC shares on the open market between Sep 1, 2026 and Sep 20, 2026/);
  const c = describeEvent({ k: 'cg', t: 'NVDA', who: 'Jane Doe', p: 'D', ch: 'House', a: 'sell', amt: '$1,001 – $15,000', d: '2026-09-01', at: '2026-09-30' }, {});
  assert.match(c.detail, /29 days later/);
});

test('Stripe signatures expire after five minutes', async () => {
  const body = '{"id":"evt"}';
  const t = Math.floor(Date.now() / 1000) - 600;
  const sig = crypto.createHmac('sha256', 's').update(`${t}.${body}`).digest('hex');
  assert.equal(await verifyWebhook(body, `t=${t},v1=${sig}`, 's'), false);
  assert.equal(await verifyWebhook(body, `t=${t},v1=${sig}`, 's', t * 1000), true);
});

test('Pro data files stay small enough for a Worker to read', () => {
  assert.ok(fs.statSync('dist/pro/index.json').size < 400e3);
  assert.ok(fs.statSync('dist/pro/events-recent.json').size < 600e3);
  const idx = JSON.parse(fs.readFileSync('dist/pro/index.json', 'utf8'));
  assert.ok(idx.tickers.AAPL[1] > 0, 'AAPL has tracked owners');
  assert.equal(idx.managerOrder.length, Object.keys(idx.managers).length);
});
