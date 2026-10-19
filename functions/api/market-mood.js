// Cloudflare Pages Function: GET /api/market-mood
// Fetches the CNN Fear & Greed Index, caches it at the edge for 15 minutes, and falls back to the
// snapshot written by the daily news job if CNN is unreachable. Runs on the Workers free tier.
const UPSTREAM = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
const TTL = 900;

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/market-mood', request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let body;
  try {
    const res = await fetch(UPSTREAM, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://www.cnn.com/',
      },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const fg = (await res.json()).fear_and_greed;
    if (!fg || typeof fg.score !== 'number') throw new Error('bad payload');
    const r = (v) => (typeof v === 'number' ? Math.round(v) : null);
    body = {
      score: r(fg.score),
      rating: fg.rating,
      previousClose: r(fg.previous_close),
      previousWeek: r(fg.previous_1_week),
      previousMonth: r(fg.previous_1_month),
      previousYear: r(fg.previous_1_year),
      asOf: fg.timestamp || new Date().toISOString(),
      source: 'CNN Fear & Greed Index',
      live: true,
    };
  } catch {
    const snap = await fetch(new URL('/market-snapshot.json', request.url));
    if (!snap.ok) return json({ error: 'unavailable' }, 503, 60);
    body = { ...(await snap.json()), live: false };
  }

  const out = json(body, 200, TTL);
  waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

function json(data, status, maxAge) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}` },
  });
}
