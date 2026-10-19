// Pure helpers for SEC Form 13F data: parsing, aggregation and quarter-over-quarter changes.
// No network access here, so everything in this file is unit-testable.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])
    .trim();
}

const toNum = (s) => {
  const n = parseFloat(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Parse a 13F information table (XML or a full .txt submission). Handles namespace prefixes. */
export function parseInfoTable(xml) {
  const s = String(xml).replace(/<(\/?)[A-Za-z0-9_.-]+:(?=[A-Za-z])/g, '<$1');
  const rows = [];
  const re = /<infoTable\b[^>]*>([\s\S]*?)<\/infoTable>/gi;
  let m;
  while ((m = re.exec(s))) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
      return r ? decodeXml(r[1]) : '';
    };
    rows.push({
      issuer: get('nameOfIssuer'),
      cls: get('titleOfClass'),
      cusip: get('cusip').toUpperCase(),
      value: toNum(get('value')),
      shares: toNum(get('sshPrnamt')),
      shType: get('sshPrnamtType').toUpperCase(),
      putCall: get('putCall').toUpperCase(),
    });
  }
  return rows;
}

/**
 * Value units: filings made on/after 2023-01-03 report whole dollars, earlier ones report $ thousands.
 * Some filers kept reporting thousands after the change, so check the median implied price too.
 */
export function valueMultiplier(rows, filingDate) {
  if (filingDate < '2023-01-03') return 1000;
  const prices = rows
    .filter((r) => r.shares > 0 && r.value > 0 && r.shType !== 'PRN' && !r.putCall)
    .map((r) => r.value / r.shares)
    .sort((a, b) => a - b);
  if (prices.length >= 3 && prices[Math.floor(prices.length / 2)] < 0.5) return 1000;
  return 1;
}

/** Merge duplicate lines (same CUSIP + put/call) and compute weights. */
export function aggregate(rows, filingDate) {
  const mult = valueMultiplier(rows, filingDate);
  const map = new Map();
  for (const r of rows) {
    if (!r.cusip) continue;
    const key = r.putCall ? `${r.cusip}:${r.putCall}` : r.cusip;
    const cur = map.get(key);
    if (cur) {
      cur.shares += r.shares;
      cur.value += r.value * mult;
    } else {
      map.set(key, {
        key,
        cusip: r.cusip,
        issuer: r.issuer,
        cls: r.cls,
        putCall: r.putCall || null,
        shType: r.shType || 'SH',
        shares: r.shares,
        value: r.value * mult,
      });
    }
  }
  const list = [...map.values()].sort((a, b) => b.value - a.value);
  const total = list.reduce((s, h) => s + h.value, 0);
  for (const h of list) h.weight = total ? h.value / total : 0;
  return { holdings: list, total };
}

/** Compare current holdings against the previous quarter. Mutates `cur` holdings with status fields. */
export function diffQuarters(cur, prev) {
  if (!prev) {
    for (const h of cur.holdings) {
      h.status = 'unknown';
      h.prevShares = null;
      h.sharesChangePct = null;
    }
    return { sold: [], counts: { new: 0, added: 0, reduced: 0, unchanged: 0, sold: 0 } };
  }
  const prevMap = new Map(prev.holdings.map((h) => [h.key, h]));
  const counts = { new: 0, added: 0, reduced: 0, unchanged: 0, sold: 0 };
  for (const h of cur.holdings) {
    const p = prevMap.get(h.key);
    if (!p) {
      h.status = 'new';
      h.prevShares = 0;
      h.sharesChangePct = null;
    } else {
      h.prevShares = p.shares;
      const chg = p.shares ? (h.shares - p.shares) / p.shares : 0;
      h.sharesChangePct = chg;
      h.status = chg > 0.005 ? 'added' : chg < -0.005 ? 'reduced' : 'unchanged';
    }
    counts[h.status]++;
  }
  const curKeys = new Set(cur.holdings.map((h) => h.key));
  const sold = prev.holdings
    .filter((p) => !curKeys.has(p.key))
    .map((p) => ({
      key: p.key,
      cusip: p.cusip,
      issuer: p.issuer,
      cls: p.cls,
      putCall: p.putCall,
      prevShares: p.shares,
      prevValue: p.value,
      prevWeight: p.weight,
    }));
  counts.sold = sold.length;
  return { sold, counts };
}

/**
 * Pick the filing to use for each reporting period.
 * Originals (13F-HR) win, unless a later amendment is a full restatement.
 * `isRestatement(filing)` is an async callback that inspects an amendment.
 */
export async function pickFilings(submissions, isRestatement) {
  const r = submissions?.filings?.recent;
  if (!r) return [];
  const byPeriod = new Map();
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    if (form !== '13F-HR' && form !== '13F-HR/A') continue;
    const f = { form, acc: r.accessionNumber[i], filingDate: r.filingDate[i], period: r.reportDate[i] };
    if (!f.period) continue;
    if (!byPeriod.has(f.period)) byPeriod.set(f.period, []);
    byPeriod.get(f.period).push(f);
  }
  const periods = [...byPeriod.keys()].sort().reverse();
  const out = [];
  for (const period of periods) {
    const cands = byPeriod.get(period).sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));
    let chosen = null;
    for (const c of cands) {
      if (c.form === '13F-HR') {
        chosen = chosen || c;
        break;
      }
      if (await isRestatement(c)) {
        chosen = c;
        break;
      }
    }
    if (chosen) out.push({ period, ...chosen });
    if (out.length >= 2) break;
  }
  return out;
}
