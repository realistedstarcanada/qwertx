// Fuzzy company-name -> ticker matching for OCR'd broker descriptions ("MICROSOFT CORP", "EPAMSYSINC",
// "INTUmVE SURGICAL INC", "ATMUS FILTRATION TECHNOL"). Exact key first, then truncated prefix, then
// bigram similarity. Entries earlier in the list win ties (pass well-known names first).

const ABBR = {
  INTL: 'INTERNATIONAL', INTERNTNL: 'INTERNATIONAL', INDS: 'INDUSTRIES', IND: 'INDUSTRIES', COS: 'COMPANIES', MATLS: 'MATERIALS',
  SYS: 'SYSTEMS', HLDGS: 'HOLDINGS', HLDG: 'HOLDING', TECHNOL: 'TECHNOLOGIES', TECH: 'TECHNOLOGIES', TECHS: 'TECHNOLOGIES',
  SVCS: 'SERVICES', SVC: 'SERVICE', PPTYS: 'PROPERTIES', PPTY: 'PROPERTY', FINL: 'FINANCIAL', COMMUNICATIONS: 'COMMUNICATIONS',
  COMMNS: 'COMMUNICATIONS', PHARMACEUTICALS: 'PHARMACEUTICALS', PHARMA: 'PHARMACEUTICALS', MGMT: 'MANAGEMENT', LABS: 'LABORATORIES',
  ELEC: 'ELECTRIC', RUBR: 'RUBBER', WHSL: 'WHOLESALE', AMER: 'AMERICA', AMERN: 'AMERICAN', NATL: 'NATIONAL', CORP: '', MFG: 'MANUFACTURING',
  BANCORPORATION: 'BANCORP', TR: '', ENTMT: 'ENTERTAINMENT', SOLUTNS: 'SOLUTIONS', SOLTNS: 'SOLUTIONS', GEN: 'GENERAL', MTRS: 'MOTORS',
  RES: 'RESOURCES', SCIENTIF: 'SCIENTIFIC', INSTRS: 'INSTRUMENTS', PRODS: 'PRODUCTS', PETE: 'PETROLEUM', HEALTHCARE: 'HEALTHCARE',
  DISNEY: 'DISNEY', WALT: 'WALT', SEMICONDUCTOR: 'SEMICONDUCTOR', SEMICONDUCTORS: 'SEMICONDUCTOR',
};
const NOISE = new Set(['INC', 'INCORPORATED', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'NV', 'SA', 'AG', 'SE', 'NEW', 'DEL',
  'THE', 'COM', 'CL', 'CLASS', 'A', 'B', 'C', 'ADR', 'ADS', 'SPONSORED', 'SHS', 'ORD', 'LP', 'LLC', 'REIT', 'F', 'COMMON', 'STOCK',
  'UNSOLICITED', 'CAP', 'STK', 'PAR', 'USD', 'ORDINARY', 'SHARES', 'SH', 'N', 'V', 'L', 'P', 'OHIO', 'MD', 'DE', 'NY']);

// Common OCR confusions inside words.
const ocr = (s) => s.replace(/(?<=[A-Z])0(?=[A-Z])|^0(?=[A-Z])/g, 'O').replace(/(?<=[A-Z])1(?=[A-Z])/g, 'I').replace(/(?<=[A-Z])5(?=[A-Z])/g, 'S').replace(/(?<=[A-Z])8(?=[A-Z])/g, 'B').replace(/(?<=[A-Z])2(?=[A-Z])/g, 'Z');

const GENERIC = /(TECHNOLOGIES|TECHNOLOGY|HOLDINGS|HOLDING|GROUP|PHARMACEUTICALS?|COMMUNICATIONS|SYSTEMS|INTERNATIONAL|SERVICES|FINANCIAL|INDUSTRIES|COMPANIES|THERAPEUTICS|BIOSCIENCES|SOLUTIONS|ENTERPRISES|PARTNERS|PROPERTIES|ELECTRONICS|SEMICONDUCTOR|GLOBAL|AMERICAN|NATIONAL|ENERGY|BANCSHARES|BANCORP|RESOURCES|MATERIALS|PRODUCTS|INSTRUMENTS|SCIENTIFIC|WORLDWIDE|LABORATORIES|NETWORKS|SOFTWARE|AND)/g;
const core = (k) => k.replace(GENERIC, '');

export function nameKey(s) {
  let u = ocr(String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' '));
  // Glued suffixes from OCR: "EPAMSYSINC", "NETFLIXINC", "OKLOINC", "ROBLOXCORP".
  u = u.replace(/(?<=[A-Z]{3})(INC|CORP|LTD|PLC)\b/g, ' $1');
  const ws = u.split(/\s+/).filter(Boolean);
  // OCR'd "CORP": "Coro", "Core", "Corn", "Coll>".
  if (ws.length > 1 && /^(CORO|CORE|CORN|COLL|COIP|CORD|COFP|COM|COR|CORPORATIO\w*)$/.test(ws[ws.length - 1])) ws.pop();
  const words = ws.map((w) => (w in ABBR ? ABBR[w] : w)).filter((w) => w && !NOISE.has(w));
  return words.join('');
}

function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function dice(a, b) {
  let inter = 0, total = 0;
  for (const [g, n] of a) { total += n; const k = b.get(g); if (k) inter += Math.min(n, k); }
  for (const n of b.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

/** @param {{name:string,ticker:string}[]} entries ordered by priority */
export function buildMatcher(entries, { loose = false } = {}) {
  const exact = new Map();
  const list = [];
  for (const e of entries) {
    const k = nameKey(e.name);
    if (!k || k.length < 2) continue;
    if (!exact.has(k)) { exact.set(k, e); const c = core(k); list.push({ k, e, g: bigrams(k), c, cg: bigrams(c) }); }
  }
  return function match(desc) {
    const k = nameKey(desc);
    if (!k || k.length < 3) return null;
    if (exact.has(k)) return { ...exact.get(k), how: 'exact', score: 1 };
    // Broker descriptions are truncated at ~24 characters: "ATMUS FILTRATION TECHNOL".
    if (k.length >= 8) {
      const p = list.find((x) => x.k.startsWith(k) || (x.k.length >= 8 && k.startsWith(x.k) && x.k.length / k.length > 0.7));
      if (p) return { ...p.e, how: 'prefix', score: 0.95 };
    }
    // Fuzzy: the distinctive part of the name (without TECHNOLOGIES, HOLDINGS...) must agree, not just the boilerplate.
    const g = bigrams(k), c = core(k), cg = bigrams(c);
    if (c.length < 4) return null;
    let best = null;
    for (const x of list) {
      if (x.c.length < 3 || Math.abs(x.c.length - c.length) > Math.max(2, c.length * 0.3)) continue;
      const sc = dice(cg, x.cg);
      if (sc < (loose ? 0.6 : 0.72)) continue;
      const full = dice(g, x.g);
      if (full < (loose ? 0.6 : 0.75)) continue;
      const s = (sc * 2 + full) / 3;
      if (!best || s > best.s) best = { s, x };
    }
    const need = loose ? (c.length <= 5 ? 0.8 : 0.64) : c.length <= 5 ? 0.86 : c.length <= 8 ? 0.78 : 0.74;
    if (best && best.s >= need) return { ...best.x.e, how: 'fuzzy', score: Number(best.s.toFixed(2)) };
    return null;
  };
}
