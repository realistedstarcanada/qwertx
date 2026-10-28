// POST /api/stripe-webhook — keeps memberships in sync with Stripe.
// In Stripe (Developers → Webhooks) add this URL and the events:
//   checkout.session.completed, customer.subscription.created, customer.subscription.updated,
//   customer.subscription.deleted
// then save the signing secret in Cloudflare as STRIPE_WEBHOOK_SECRET.
import { db } from '../../server/db.js';
import { createLoginToken, findOrCreateUser } from '../../server/auth.js';
import { stripe, subFields, verifyWebhook } from '../../server/stripe.js';
import { sendMail, welcomeProEmail } from '../../server/mail.js';
import { json, nowIso } from '../../server/util.js';

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await verifyWebhook(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ ok: false, error: 'signature' }, 400);
  const event = JSON.parse(raw);
  const DB = await db(env);
  // Stripe can send the same event twice: handle each once.
  const first = await DB.prepare(`INSERT OR IGNORE INTO stripe_events (id, type, received_at) VALUES (?, ?, ?)`).bind(event.id, event.type, nowIso()).run();
  if (!first.meta?.changes) return json({ ok: true, duplicate: true });
  try {
    await handle(event, { env, DB, origin: env.SITE_URL || new URL(request.url).origin });
  } catch (e) {
    // Let Stripe retry later.
    await DB.prepare(`DELETE FROM stripe_events WHERE id = ?`).bind(event.id).run();
    console.error('webhook', event.type, e);
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
}

async function userFor(DB, env, { userId, customer, email }) {
  if (userId) {
    const u = await DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(Number(userId)).first();
    if (u) return u;
  }
  if (customer) {
    const u = await DB.prepare(`SELECT * FROM users WHERE stripe_customer = ?`).bind(customer).first();
    if (u) return u;
    if (!email) email = (await stripe(env, `/customers/${encodeURIComponent(customer)}`))?.email;
  }
  return email ? findOrCreateUser(DB, email) : null;
}

async function save(DB, user, f, founding) {
  await DB.prepare(`UPDATE users SET stripe_customer = ?, stripe_sub = ?, sub_status = ?, sub_plan = ?, period_end = ?, cancel_at_period_end = ?, founding = MAX(founding, ?) WHERE id = ?`)
    .bind(f.stripe_customer, f.stripe_sub, f.sub_status, f.sub_plan, f.period_end, f.cancel_at_period_end, founding ? 1 : 0, user.id)
    .run();
}

async function handle(event, { env, DB, origin }) {
  const o = event.data.object;
  if (event.type === 'checkout.session.completed') {
    if (o.mode !== 'subscription' || !o.subscription) return;
    const email = (o.customer_details?.email || o.customer_email || '').toLowerCase() || null;
    const user = await userFor(DB, env, { userId: o.client_reference_id, customer: o.customer, email });
    if (!user) return;
    const sub = await stripe(env, `/subscriptions/${encodeURIComponent(o.subscription)}`);
    const founding = (o.metadata?.plan || sub.metadata?.plan) === 'founding';
    await save(DB, user, subFields(sub), founding);
    // A sign-in link straight to the watchlist, so paying never ends in "now what?".
    const token = await createLoginToken(DB, user.email, '/account.html?welcome=pro');
    if (token) await sendMail(env, welcomeProEmail(env, { to: user.email, link: `${origin}/account.html?signin=${encodeURIComponent(token)}`, founding }));
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const customer = typeof o.customer === 'string' ? o.customer : o.customer?.id;
    const user = await userFor(DB, env, { userId: o.metadata?.user_id, customer });
    if (!user) return;
    // Ignore stale events for an older subscription when the member already has a newer one.
    if (user.stripe_sub && user.stripe_sub !== o.id && event.type !== 'customer.subscription.created' && user.sub_status && user.sub_status !== 'canceled') return;
    const f = subFields(o);
    if (event.type === 'customer.subscription.deleted') f.sub_status = 'canceled';
    await save(DB, user, f, o.metadata?.plan === 'founding');
  }
}
