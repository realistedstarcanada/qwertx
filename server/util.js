// Small helpers shared by the Pages Functions in functions/api. Runs on Cloudflare (Web APIs only).

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export const nowIso = () => new Date().toISOString();

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function readBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  try {
    if (ct.includes('application/json')) return await request.json();
    if (ct.includes('form')) return Object.fromEntries(await request.formData());
  } catch {}
  return {};
}

/** State-changing requests must come from our own pages (blocks cross-site form posts). */
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // same-origin fetches from older browsers, server-to-server calls
  return origin === new URL(request.url).origin;
}

/** Fetch one of the site's own static files (dist/pro/*) from inside a Function. */
export async function asset(env, request, path, type = 'json') {
  const url = new URL(path, request.url);
  const res = env.ASSETS ? await env.ASSETS.fetch(new Request(url)) : await fetch(url);
  if (!res.ok) return null;
  return type === 'json' ? res.json() : res.text();
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Wraps a Function handler: errors with a .status become clean JSON responses. */
export const route = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return json({ ok: false, error: status === 503 ? 'not_configured' : status >= 500 ? 'server_error' : 'bad_request', message: status < 500 || status === 503 ? e.message : 'Something went wrong. Please try again.' }, status);
  }
};

export const fail = (status, message) => Object.assign(new Error(message), { status });
