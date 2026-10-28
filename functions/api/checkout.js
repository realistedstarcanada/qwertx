// GET or POST /api/checkout?plan=monthly|yearly|founding — starts Stripe Checkout for QWERTx Pro.
// Signed-in members are linked to their account; everyone else gives their email on Stripe's page and the
// webhook creates their account and emails a sign-in link. Founding seats are capped (config/pro.json).
import pro from '../../config/pro.json';
import { db } from '../../server/db.js';
import { currentUser } from '../../server/auth.js';
import { priceFor, stripe } from '../../server/stripe.js';
import { isPro } from '../../server/pro.js';
import { EMAIL, fail, json, route } from '../../server/util.js';

export async function foundingSeatsLeft(env) {
  const seats = pro.plans.founding?.seats || 0;
  if (!seats || !env.DB) return seats;
  const row = await (await db(env)).prepare(`SELECT COUNT(*) AS n FROM users WHERE founding = 1`).first();
  return Math.max(0, seats - (row?.n || 0));
}

async function handle({ request, env }) {
  const url = new URL(request.url);
  const plan = (url.searchParams.get('plan') || 'yearly').toLowerCase();
  if (!pro.plans[plan]) throw fail(400, 'Unknown plan');
  if (!env.STRIPE_SECRET_KEY) throw fail(503, 'Payments are not configured yet');
  const asJson = url.searchParams.get('format') === 'json';
  const go = (to) => (asJson ? json({ url: to }) : Response.redirect(to, 303));

  const user = env.DB ? await currentUser(request, env) : null;
  if (user && isPro(user)) return go(`${url.origin}/account.html?already=pro`);
  if (plan === 'founding' && (await foundingSeatsLeft(env)) <= 0) return go(`${url.origin}/pro.html?founding=full#pricing`);

  const form = {
    mode: 'subscription',
    'line_items[0][price]': await priceFor(env, plan),
    'line_items[0][quantity]': '1',
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    success_url: `${url.origin}/pro/welcome.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/pro.html?checkout=cancelled#pricing`,
    'metadata[plan]': plan,
    'subscription_data[metadata][plan]': plan,
  };
  if (user) {
    form.client_reference_id = String(user.id);
    form['subscription_data[metadata][user_id]'] = String(user.id);
    if (user.stripe_customer) form.customer = user.stripe_customer;
    else form.customer_email = user.email;
  } else {
    const email = url.searchParams.get('email');
    if (email && EMAIL.test(email)) form.customer_email = email;
  }
  const session = await stripe(env, '/checkout/sessions', { method: 'POST', form });
  return go(session.url);
}

export const onRequestGet = route(handle);
export const onRequestPost = route(handle);
