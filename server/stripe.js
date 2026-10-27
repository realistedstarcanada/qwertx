// Minimal Stripe REST client for Workers (no SDK): API calls, price set-up and webhook signatures.
import pro from '../config/pro.json';
import { ACTIVE } from './pro.js';

const API = 'https://api.stripe.com/v1';

export async function stripe(env, path, { method = 'GET', form } = {}) {
  if (!env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Payments are not configured yet'), { status: 503 });
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `Stripe ${res.status}`), { status: 502 });
  return data;
}

const priceCache = new Map();
/**
 * The Stripe price for a plan in config/pro.json, found by its lookup key or created on first use.
 * If the amount in config changed but the key did not, a new price takes over the key; existing
 * subscribers stay on the price they signed up with.
 */
export async function priceFor(env, planKey) {
  const p = pro.plans[planKey];
  if (!p) throw Object.assign(new Error('Unknown plan'), { status: 400 });
  if (priceCache.has(p.lookupKey)) return priceCache.get(p.lookupKey);
  const found = await stripe(env, `/prices?active=true&lookup_keys[]=${encodeURIComponent(p.lookupKey)}&limit=1`);
  let price = found.data?.[0];
  const matches = price && price.unit_amount === p.amount && price.currency === (pro.currency || 'usd') && price.recurring?.interval === p.interval && price.product === p.product;
  if (!matches) {
    price = await stripe(env, '/prices', {
      method: 'POST',
      form: {
        product: p.product,
        unit_amount: String(p.amount),
        currency: pro.currency || 'usd',
        'recurring[interval]': p.interval,
        lookup_key: p.lookupKey,
        transfer_lookup_key: 'true',
        nickname: `QWERTx Pro · ${p.label}`,
        'metadata[plan]': planKey,
      },
    });
  }
  priceCache.set(p.lookupKey, price.id);
  return price.id;
}

/** Verifies the Stripe-Signature header (HMAC-SHA256 over "timestamp.body"), 5-minute tolerance. */
export async function verifyWebhook(rawBody, header, secret, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => timingSafeEqual(s, hex));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Copies a Stripe subscription's state onto our user row. */
export function subFields(sub) {
  const item = sub.items?.data?.[0];
  const end = sub.current_period_end || item?.current_period_end;
  return {
    stripe_customer: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_sub: sub.id,
    sub_status: sub.status,
    sub_plan: sub.metadata?.plan || item?.price?.metadata?.plan || null,
    period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at ? 1 : 0,
    active: ACTIVE.has(sub.status),
  };
}
