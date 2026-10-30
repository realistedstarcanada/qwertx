#!/usr/bin/env node
// Finds the SEC CIK for each manager in config/investor-candidates.json and checks that it really files 13F
// holdings reports. Writes data/cik-candidates.json: for each manager, every match found with its exact SEC
// name, whether it files 13F-HR, its latest 13F date and how many it has filed, plus the best pick.
// Nothing here changes config/investors.json; a person reviews the picks first.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON } from './lib/net.mjs';
import { sec, pad } from './lib/sec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/cik-candidates.json');

const words = (s) => String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !['THE', 'LLC', 'LP', 'L', 'P', 'INC', 'CO', 'CORP', 'LTD', 'MANAGEMENT', 'CAPITAL', 'GROUP', 'INVESTMENT', 'INVESTMENTS', 'PARTNERS', 'ASSET', 'ADVISORS', 'FUND', 'FUNDS', '&', 'AND'].includes(w));

/** Pulls (cik, name) pairs out of an EDGAR full-text search response. Exported for tests. */
export function ciksFromSearch(json) {
  const out = new Map();
  for (const h of json?.hits?.hits || []) {
    const src = h._source || {};
    (src.display_names || []).forEach((dn, i) => {
      const m = /^(.*?)\s*\(CIK (\d{10})\)/.exec(dn);
      if (m) out.set(m[2], m[1].trim());
      else if (src.ciks?.[i]) out.set(src.ciks[i], dn);
    });
  }
  return [...out].map(([cik, name]) => ({ cik, name }));
}

/** How well an SEC entity name matches what we searched for (0-1). Exported for tests. */
export function nameScore(query, name) {
  const q = words(query), n = new Set(words(name));
  if (!q.length) return 0;
  return q.filter((w) => n.has(w)).length / q.length;
}

async function search(q) {
  const found = [];
  const since = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
  const urls = [
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${q}"`)}&forms=13F-HR&dateRange=custom&startdt=${since}`,
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${q}"`)}&forms=13F-HR`,
  ];
  const errors = [];
  for (const u of urls) {
    try {
      found.push(...ciksFromSearch(await sec(u, 'json')));
      if (found.length) break;
    } catch (e) {
      errors.push(e.message.slice(0, 160));
    }
  }
  return { found, errors };
}

async function check(cik) {
  const sub = await sec(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, 'json');
  const r = sub.filings?.recent || {};
  const idx = (r.form || []).map((f, i) => (f === '13F-HR' || f === '13F-HR/A' ? i : -1)).filter((i) => i >= 0);
  return {
    cik: pad(cik), name: sub.name, formerNames: (sub.formerNames || []).map((f) => f.name).slice(0, 3),
    stateOfInc: sub.stateOfIncorporation || null, city: sub.addresses?.business?.city || null,
    files13F: idx.length > 0, count13F: idx.length, last13F: idx.length ? r.filingDate[idx[0]] : null, lastPeriod: idx.length ? r.reportDate[idx[0]] : null,
  };
}

async function run() {
  const { candidates } = readJSON(path.join(ROOT, 'config/investor-candidates.json'));
  const have = new Set((readJSON(path.join(ROOT, 'config/investors.json'))?.investors || []).map((i) => pad(i.cik)));
  const out = {};
  for (const c of candidates) {
    const seen = new Map(), errors = [];
    for (const q of c.q) {
      const r = await search(q);
      errors.push(...r.errors);
      for (const x of r.found) if (!seen.has(x.cik)) seen.set(x.cik, { ...x, score: nameScore(q, x.name) });
    }
    const ranked = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6);
    const checked = [];
    for (const x of ranked) {
      if (x.score < 0.5) continue;
      try { checked.push({ ...(await check(x.cik)), score: x.score }); } catch (e) { errors.push(`check ${x.cik}: ${e.message.slice(0, 120)}`); }
    }
    const recent = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const pick = checked.filter((x) => x.files13F && x.last13F >= recent).sort((a, b) => b.score - a.score || b.count13F - a.count13F)[0] || null;
    out[c.slug] = { manager: c.manager, firm: c.firm, pick: pick ? { cik: pick.cik, name: pick.name, last13F: pick.last13F, lastPeriod: pick.lastPeriod, alreadyTracked: have.has(pick.cik) } : null, checked, errors: errors.slice(0, 4) };
    console.log(`${c.slug}: ${pick ? `${pick.cik} ${pick.name} (last 13F ${pick.last13F})` : `no current 13F filer found (${checked.length} checked)`}`);
  }
  writeJSON(OUT, { at: new Date().toISOString(), results: out });
  const n = Object.values(out).filter((x) => x.pick).length;
  console.log(`${n}/${candidates.length} managers matched to a current 13F filer → data/cik-candidates.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
