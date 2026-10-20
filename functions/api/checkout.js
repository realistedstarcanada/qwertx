// Cloudflare Pages Function: GET or POST /api/checkout?plan=monthly|yearly[&email=...]
// Creates a Stripe Checkout session for QWERTx Pro and redirects to it.
// Needs the Cloudflare secret STRIPE_SECRET_KEY. Prices are looked up from the product, so changing a
// price in Stripe needs no code change. Promotion codes (e.g. AFTERHOURS) can be typed at checkout.
import pro from '../../config/pro.json';

const STRIPE = 'https://api.stripe.com/v1';

async function stripe(env, path, { method = 'GET', form } = {}) {
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

async function handle({ request, env }) {
  const url = new URL(request.url);
  const plan = (url.searchParams.get('plan') || 'yearly').toLowerCase();
  const cfg = pro.plans[plan];
  if (!cfg) return json({ error: 'Unknown plan' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Payments are not configured yet' }, 503);
  try {
    // The product's current recurring price (the default price if set, else the newest active one).
    const product = await stripe(env, `/products/${cfg.product}`);
    let price = typeof product.default_price === 'string' ? product.default_price : product.default_price?.id;
    if (!price) {
      const list = await stripe(env, `/prices?product=${cfg.product}&active=true&type=recurring&limit=1`);
      price = list.data?.[0]?.id;
    }
    if (!price) return json({ error: 'No active price for this plan' }, 500);
    const origin = url.origin;
    const form = {
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      success_url: `${origin}/pro/welcome.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pro.html?checkout=cancelled`,
      'subscription_data[metadata][plan]': plan,
      'metadata[plan]': plan,
    };
    const email = url.searchParams.get('email');
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) form.customer_email = email;
    const session = await stripe(env, '/checkout/sessions', { method: 'POST', form });
    if (url.searchParams.get('format') === 'json') return json({ url: session.url, mode: session.livemode ? 'live' : 'test' });
    return Response.redirect(session.url, 303);
  } catch (e) {
    return json({ error: 'Checkout could not start', detail: String(e.message || e).slice(0, 200) }, 502);
  }
}

export const onRequestGet = handle;
export const onRequestPost = handle;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
