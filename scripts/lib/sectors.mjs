// Ticker -> sector and clean company name, from SEC data (company_tickers.json + each company's SIC code).
// Cached in data/sectors.json so each ticker is looked up once.
import { readJSON, writeJSON } from './net.mjs';
import { sec } from './sec.mjs';

// Well-known names where the SIC code gives a misleading GICS-style sector.
const OVERRIDES = {
  GOOGL: 'Communication', GOOG: 'Communication', META: 'Communication', NFLX: 'Communication', DIS: 'Communication',
  CHTR: 'Communication', CMCSA: 'Communication', TMUS: 'Communication', VZ: 'Communication', T: 'Communication',
  SPOT: 'Communication', LYV: 'Communication', WBD: 'Communication', PARA: 'Communication', TTWO: 'Communication', EA: 'Communication',
  V: 'Financials', MA: 'Financials', PYPL: 'Financials', AXP: 'Financials', FI: 'Financials', FIS: 'Financials', SPGI: 'Financials', MCO: 'Financials', MSCI: 'Financials',
  AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary', BKNG: 'Consumer Discretionary', ABNB: 'Consumer Discretionary', CPNG: 'Consumer Discretionary', SE: 'Consumer Discretionary',
  UBER: 'Industrials', WMT: 'Consumer Staples', COST: 'Consumer Staples', KR: 'Consumer Staples',
  BRK: 'Financials', 'BRK.B': 'Financials', 'BRK.A': 'Financials',
};

export function sicToSector(sic) {
  const s = Number(sic);
  if (!s) return 'Other';
  const r = (a, b) => s >= a && s <= b;
  if ([1311, 1381, 1382, 1389, 2911, 4922, 4923].includes(s) || r(2900, 2999) || r(5171, 5172) || r(4610, 4619)) return 'Energy';
  if (r(100, 999)) return 'Consumer Staples';
  if (r(1000, 1499)) return 'Materials';
  if (s === 1531) return 'Consumer Discretionary';
  if (r(1500, 1799)) return 'Industrials';
  if (r(2000, 2199)) return 'Consumer Staples';
  if (r(2200, 2399)) return 'Consumer Discretionary';
  if (r(2400, 2499) || r(2600, 2699)) return 'Materials';
  if (r(2500, 2599)) return 'Consumer Discretionary';
  if (r(2700, 2799)) return 'Communication';
  if (r(2830, 2836)) return 'Health Care';
  if (r(2840, 2844)) return 'Consumer Staples';
  if (r(2800, 2899) || r(3000, 3399)) return 'Materials';
  if (r(3570, 3579) || r(3600, 3629) || r(3640, 3699)) return 'Technology';
  if (r(3630, 3639)) return 'Consumer Discretionary';
  if ([3711, 3713, 3714, 3715, 3716, 3751].includes(s)) return 'Consumer Discretionary';
  if (r(3400, 3569) || r(3580, 3599) || r(3700, 3799)) return 'Industrials';
  if (r(3840, 3851) || s === 3826) return 'Health Care';
  if (r(3800, 3899)) return 'Technology';
  if (r(3900, 3999)) return 'Consumer Discretionary';
  if (r(4800, 4899)) return 'Communication';
  if (r(4900, 4999)) return 'Utilities';
  if (r(4000, 4799)) return 'Industrials';
  if (s === 5122 || s === 5047) return 'Health Care';
  if (r(5140, 5149) || r(5180, 5182)) return 'Consumer Staples';
  if (r(5000, 5199)) return 'Industrials';
  if (r(5400, 5499) || s === 5912 || s === 5331) return 'Consumer Staples';
  if (r(5200, 5999)) return 'Consumer Discretionary';
  if (s === 6798 || r(6500, 6599)) return 'Real Estate';
  if (r(6000, 6799)) return 'Financials';
  if (r(7000, 7099) || r(7200, 7299) || r(7500, 7599) || r(7900, 7999)) return 'Consumer Discretionary';
  if (r(7370, 7379)) return 'Technology';
  if (r(7800, 7899)) return 'Communication';
  if (r(7300, 7399) || r(8700, 8799)) return 'Industrials';
  if (r(8000, 8099)) return 'Health Care';
  if (r(8200, 8299)) return 'Consumer Discretionary';
  return 'Other';
}

export async function updateSectors(tickers, file) {
  const cache = readJSON(file, {});
  const todo = tickers.filter((t) => !(t in cache));
  if (!todo.length) return 0;
  const list = await sec('https://www.sec.gov/files/company_tickers.json', 'json');
  const byTicker = new Map(Object.values(list).map((x) => [String(x.ticker).toUpperCase(), x]));
  let n = 0;
  for (const t of todo) {
    const hit = byTicker.get(t.toUpperCase().replace('.', '-')) || byTicker.get(t.toUpperCase());
    if (!hit) {
      cache[t] = { sector: OVERRIDES[t] || 'Funds & other', name: null, sic: null };
      continue;
    }
    try {
      const sub = await sec(`https://data.sec.gov/submissions/CIK${String(hit.cik_str).padStart(10, '0')}.json`, 'json');
      cache[t] = { sector: OVERRIDES[t] || sicToSector(sub.sic), name: hit.title, sic: sub.sic || null, sicDescription: sub.sicDescription || null };
      n++;
    } catch {
      cache[t] = { sector: OVERRIDES[t] || 'Other', name: hit.title, sic: null };
    }
    if (n % 50 === 0) writeJSON(file, cache);
  }
  writeJSON(file, cache);
  return n;
}

const NAME_NOISE = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|NV|N V|SA|S A|AG|SE|HLDGS?|HLDNGS|HOLDINGS?|GROUP|GRP|NEW|DEL|THE|COM|CL [A-Z]|CLASS [A-Z]|ADR|ADS|SPONSORED|SHS|ORD|LP|L P|LLC|TR|TRUST|INTL|INTERNATIONAL)\b/g;
export const normName = (s) =>
  String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ').replace(NAME_NOISE, ' ').replace(/\s+/g, ' ').trim();

/** Match 13F issuer names to SEC company tickers when CUSIP lookup fails. Mutates cusipMap. */
export async function matchByName(pairs, cusipMap) {
  const list = await sec('https://www.sec.gov/files/company_tickers.json', 'json');
  const byName = new Map();
  for (const x of Object.values(list)) {
    const k = normName(x.title);
    if (k && !byName.has(k)) byName.set(k, x);
  }
  let n = 0;
  for (const [cusip, issuer] of pairs) {
    let k = normName(issuer);
    let hit = byName.get(k);
    // 13F names are often truncated ("SEAGATE TECHNOLOGY HLDNGS PL"): drop a short trailing fragment.
    while (!hit && /\s\S{1,3}$/.test(k)) {
      k = k.replace(/\s\S{1,3}$/, '');
      hit = byName.get(k);
    }
    if (hit) {
      cusipMap[cusip] = { ...(cusipMap[cusip] || {}), ticker: String(hit.ticker).replace('-', '.'), name: hit.title, via: 'sec-name' };
      n++;
    }
  }
  return n;
}
