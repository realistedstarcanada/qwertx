// CUSIP -> ticker via OpenFIGI (free). Results are cached in data/cusip-map.json so
// only new CUSIPs are looked up each quarter. Set OPENFIGI_API_KEY for faster limits.
import { sleep } from './net.mjs';

// Bloomberg exchange codes for US venues (composite US plus individual exchanges).
const US = new Set(['US', 'UN', 'UW', 'UQ', 'UA', 'UR', 'UF', 'UP', 'UV', 'UD', 'UT', 'UX', 'UB', 'UC', 'UM', 'UO', 'UU']);

export async function mapCusips(cusips, cache, { retry = false } = {}) {
  const todo = [...new Set(cusips)].filter((c) => c && (!(c in cache) || (retry && !cache[c]?.ticker)));
  if (!todo.length) return 0;
  const key = process.env.OPENFIGI_API_KEY;
  const batch = key ? 100 : 10;
  const gap = key ? 300 : 2600; // stay under 25 requests/minute without a key
  let mapped = 0;
  for (let i = 0; i < todo.length; i += batch) {
    const chunk = todo.slice(i, i + batch);
    let res;
    for (let t = 0; t < 5; t++) {
      try {
        res = await fetch('https://api.openfigi.com/v3/mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { 'X-OPENFIGI-APIKEY': key } : {}) },
          body: JSON.stringify(chunk.map((c) => ({ idType: 'ID_CUSIP', idValue: c }))),
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        res = null;
      }
      if (res && res.status !== 429 && res.status < 500) break;
      await sleep(15000 * (t + 1));
    }
    if (!res || !res.ok) {
      console.warn(`  OpenFIGI unavailable (${res ? res.status : 'network'}); tickers will fill in next run`);
      return mapped;
    }
    const out = await res.json();
    out.forEach((r, j) => {
      const d = r.data || [];
      const us = d.filter((x) => US.has(x.exchCode) && x.ticker);
      const best = us.find((x) => x.exchCode === 'US' && x.marketSector === 'Equity') || us.find((x) => x.marketSector === 'Equity') || us[0];
      const pick = best || d.find((x) => x.marketSector === 'Equity') || d[0];
      cache[chunk[j]] = pick
        ? { ticker: best ? best.ticker.replace('/', '.').replace(/ .*$/, '') : null, name: pick.name || null, type: pick.securityType2 || null }
        : null;
      if (pick) mapped++;
    });
    await sleep(gap);
  }
  return mapped;
}
