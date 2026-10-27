// POST /api/billing-portal — opens Stripe's customer portal (change card, switch plan, cancel, invoices).
// One-time setup in Stripe: Settings → Billing → Customer portal → Save (in test mode and again in live mode).
import { currentUser } from '../../server/auth.js';
import { stripe } from '../../server/stripe.js';
import { fail, json, route, sameOrigin } from '../../server/util.js';

export const onRequestPost = route(async ({ request, env }) => {
  if (!sameOrigin(request)) throw fail(403, 'Forbidden');
  const user = await currentUser(request, env);
  if (!user) throw fail(401, 'Please sign in first.');
  if (!user.stripe_customer) throw fail(404, 'There is no billing account yet.');
  const origin = new URL(request.url).origin;
  const s = await stripe(env, '/billing_portal/sessions', { method: 'POST', form: { customer: user.stripe_customer, return_url: `${origin}/account.html#membership` } });
  return json({ ok: true, url: s.url });
});
