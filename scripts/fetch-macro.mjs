#!/usr/bin/env node
// Economic data for Market Weather, from official sources only:
//   US: FRED (Federal Reserve Bank of St. Louis) series from BEA, BLS, the Federal Reserve and the Treasury.
//       Needs FRED_API_KEY (free). Copyrighted series (e.g. ICE bond indexes, U. Michigan sentiment) are not used.
//   Canada: Bank of Canada Valet API and Statistics Canada Web Data Service (no key).
// Writes data/macro.json = { updatedAt, series: { id: { label, source, unit, freq, obs: [[date, value], ...] } } }.
// History is kept monthly (last value of each month) back to 1960 where available, so percentiles mean something.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, readJSON, writeJSON } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/macro.json');

export const FRED = {
  us_gdp: { id: 'A191RL1Q225SBEA', label: 'Real GDP growth (annualised)', unit: '%', freq: 'q', source: 'BEA via FRED' },
  us_unemp: { id: 'UNRATE', label: 'Unemployment rate', unit: '%', freq: 'm', source: 'BLS via FRED' },
  us_sahm: { id: 'SAHMREALTIME', label: 'Sahm recession rule', unit: 'pts', freq: 'm', source: 'FRED' },
  us_cpi: { id: 'CPIAUCSL', units: 'pc1', label: 'Inflation (CPI, yearly)', unit: '%', freq: 'm', source: 'BLS via FRED' },
  us_10y: { id: 'DGS10', label: '10-year Treasury yield', unit: '%', freq: 'd', source: 'US Treasury via FRED' },
  us_curve: { id: 'T10Y3M', label: 'Yield curve (10-year minus 3-month)', unit: 'pts', freq: 'd', source: 'FRED' },
  us_fed: { id: 'DFEDTARU', label: 'Fed policy rate (upper bound)', unit: '%', freq: 'd', source: 'Federal Reserve via FRED' },
  us_nfci: { id: 'NFCI', label: 'Financial conditions (Chicago Fed NFCI)', unit: '', freq: 'w', source: 'Chicago Fed via FRED' },
  us_mortgage: { id: 'MORTGAGE30US', label: '30-year mortgage rate', unit: '%', freq: 'w', source: 'Freddie Mac via FRED' },
  us_equity: { id: 'NCBEILQ027S', label: 'US corporate equities, market value', unit: '$M', freq: 'q', source: 'Federal Reserve Z.1 via FRED' },
  us_gdp_level: { id: 'GDP', label: 'US GDP (nominal)', unit: '$B', freq: 'q', source: 'BEA via FRED' },
};

export const VALET = {
  ca_policy: { id: 'V39079', label: 'Bank of Canada policy rate', unit: '%', source: 'Bank of Canada' },
  ca_10y: { id: 'BD.CDN.10YR.DQ.YLD', label: '10-year Government of Canada yield', unit: '%', source: 'Bank of Canada' },
  ca_2y: { id: 'BD.CDN.2YR.DQ.YLD', label: '2-year Government of Canada yield', unit: '%', source: 'Bank of Canada' },
  ca_usdcad: { id: 'FXUSDCAD', label: 'USD / CAD', unit: '', source: 'Bank of Canada' },
};

export const STATCAN = {
  ca_unemp: { vector: 2062815, label: 'Unemployment rate', unit: '%', freq: 'm', source: 'Statistics Canada' },
  ca_cpi_index: { vector: 41690973, label: 'Consumer price index', unit: 'index', freq: 'm', source: 'Statistics Canada' },
  ca_gdp_index: { vector: 65201210, label: 'Real GDP (monthly)', unit: '$M', freq: 'm', source: 'Statistics Canada' },
};

/** Keep the last observation of each month (daily and weekly series), as [[YYYY-MM-DD, value], ...]. */
export function monthly(obs) {
  const by = new Map();
  for (const [d, v] of obs) if (Number.isFinite(v)) by.set(d.slice(0, 7), [d, v]);
  return [...by.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function parseFred(json) {
  return (json?.observations || []).map((o) => [o.date, o.value === '.' ? NaN : Number(o.value)]).filter(([, v]) => Number.isFinite(v));
}

export function parseValet(json, id) {
  return (json?.observations || []).map((o) => [o.d, o[id]?.v == null || o[id].v === '' ? NaN : Number(o[id].v)]).filter(([, v]) => Number.isFinite(v));
}

export function parseStatcan(json) {
  const pts = json?.[0]?.object?.vectorDataPoint || [];
  return pts.map((p) => [String(p.refPer).slice(0, 10), p.value == null || p.value === '' ? NaN : Number(p.value)]).filter(([, v]) => Number.isFinite(v));
}

async function run() {
  const prev = readJSON(OUT, { series: {} });
  const series = { ...(prev.series || {}) };
  const ok = [], failed = [];
  const key = process.env.FRED_API_KEY;
  const UA = { 'User-Agent': process.env.SEC_USER_AGENT || 'QWERTx admin@qwertx.com' };

  if (key) {
    for (const [k, s] of Object.entries(FRED)) {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${key}&file_type=json&observation_start=1960-01-01${s.units ? `&units=${s.units}` : ''}`;
        const obs = parseFred(await fetchRetry(url, { headers: UA }, { type: 'json', minGapMs: 600 }));
        if (!obs.length) throw new Error('no observations');
        series[k] = { label: s.label, source: s.source, unit: s.unit, freq: s.freq, obs: s.freq === 'q' ? obs : monthly(obs), last: obs.at(-1) };
        ok.push(k);
      } catch (e) {
        failed.push(`${k}: ${e.message}`);
      }
    }
  } else {
    console.warn('FRED_API_KEY not set: US series skipped (get a free key at fred.stlouisfed.org)');
  }

  for (const [k, s] of Object.entries(VALET)) {
    try {
      const obs = parseValet(await fetchRetry(`https://www.bankofcanada.ca/valet/observations/${s.id}/json?start_date=2000-01-01`, { headers: UA }, { type: 'json' }), s.id);
      if (!obs.length) throw new Error('no observations');
      series[k] = { label: s.label, source: s.source, unit: s.unit, freq: 'd', obs: monthly(obs), last: obs.at(-1) };
      ok.push(k);
    } catch (e) {
      failed.push(`${k}: ${e.message}`);
    }
  }

  try {
    const body = JSON.stringify(Object.values(STATCAN).map((s) => ({ vectorId: s.vector, latestN: 360 })));
    const res = await fetch('https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods', { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = await res.json();
    Object.entries(STATCAN).forEach(([k, s], i) => {
      const obs = parseStatcan([all[i]]);
      if (!obs.length) return failed.push(`${k}: no observations`);
      series[k] = { label: s.label, source: s.source, unit: s.unit, freq: s.freq, obs, last: obs.at(-1) };
      ok.push(k);
    });
  } catch (e) {
    failed.push(`statcan: ${e.message}`);
  }

  writeJSON(OUT, { updatedAt: new Date().toISOString(), series });
  console.log(`Macro: ${ok.length} series updated${failed.length ? `; failed: ${failed.join(' | ')}` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
