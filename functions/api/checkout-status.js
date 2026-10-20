// Cloudflare Pages Function: GET /api/checkout-status?session_id=cs_...
// Confirms a finished Stripe Checkout so the welcome page can greet the new member.
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id) || !env.STRIPE_SECRET_KEY) return json({ ok: false }, 400);
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!res.ok) return json({ ok: false }, 404);
  const s = await res.json();
  return json({ ok: s.status === 'complete', paid: s.payment_status === 'paid', email: s.customer_details?.email || null, plan: s.metadata?.plan || null, test: !s.livemode });
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
