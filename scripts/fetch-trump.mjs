// President Trump's periodic transaction reports (OGE Form 278-T), from the Office of Government Ethics.
// Finds his filings in the OGE public index, reads each new PDF's OCR text layer, parses every row,
// maps company names to tickers and writes data/trump/<filing>.json plus data/trump/index.json.
//
//   node scripts/fetch-trump.mjs [--force] [--debug]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchRetry, readJSON, writeJSON, sleep } from './lib/net.mjs';
import { parse278T, classify, cleanDesc } from './lib/oge278t.mjs';
import { buildMatcher, nameKey } from './lib/namematch.mjs';
import { parse278eAssets, assetKind } from './lib/featured.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'data/trump');
const B = 'https://extapps2.oge.gov/201/Presiden.nsf';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; QWERTx research; admin@qwertx.com)' };
const FORCE = process.argv.includes('--force');
const DEBUG = process.argv.includes('--debug');
const cfg = readJSON(path.join(ROOT, 'config/trump.json'), {});
const dbg = [];
const log = (...a) => { console.log(...a); dbg.push(a.join(' ')); };

const abs = (h) => new URL(h.replace(/&amp;/g, '&'), B + '/').href;
const fileName = (u) => decodeURIComponent(u.split('/$FILE/')[1] || u.split('/').pop());

/** Signed date from file names like "Donald-J-Trump.09.17.2026-278T.pdf" or "Trump, Donald J.-05.08.2026-278T(2).pdf". */
function nameDate(n) {
  const m = /(\d{1,2})[.\-_](\d{1,2})[.\-_](20\d\d)/.exec(n) || /(\d{1,2})\.(\d{1,2})\.(\d{2})\b/.exec(n);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// The OGE site lists the President's reports on their own page, and also in "Filings by Date" and the T index.
const LIST_PAGES = [
  `${B}/f53dcc215a28dcbb85258ccb0066175a?OpenForm`,
  `${B}/PAS%20Filings%20by%20Date?OpenView&Count=1000`,
  `${B}/PAS%20IndexA?OpenView&RestrictToCategory=T&ExpandView&Count=1000`,
];

async function discover() {
  const found = new Map();
  const docs = new Set();
  for (const [n, page] of LIST_PAGES.entries()) {
    let html;
    try { html = await fetchRetry(page, { headers: UA }); } catch (e) { log('list page error', page, e.message); continue; }
    if (DEBUG) fs.writeFileSync(path.join(ROOT, `data/_debug/oge-list-${n}.html`), html);
    // Look at each table row (or the whole page when it has no rows) for Trump links.
    const chunks = /<tr[\s>]/i.test(html) ? html.split(/<tr[\s>]/i) : html.split(/<(?:li|p|div)[\s>]/i);
    let hits = 0;
    for (const r of chunks) {
      const text = r.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      for (const [, h, label] of r.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const hay = decodeURIComponent(h.replace(/%(?![0-9A-F]{2})/gi, '%25')) + ' ' + label + ' ' + text;
        if (!/Trump/i.test(hay) || /Trump,?\s+(Jr|Eric|Lara|Melania)|Jr\.?\b/i.test(label + ' ' + h)) continue;
        const u = abs(h);
        hits++;
        if (/\$FILE\/.*\.pdf/i.test(u) || /\.pdf($|\?)/i.test(u)) found.set(u, label.replace(/<[^>]+>/g, '').trim());
        else if (/Presiden\.nsf\/[^?]*(\?OpenDocument|[0-9a-f]{32})/i.test(u) && !/OpenView|OpenForm/i.test(u)) docs.add(u);
      }
    }
    log(`list ${n}: ${hits} Trump links`);
    await sleep(400);
  }
  for (const d of docs) {
    try {
      const html = await fetchRetry(d, { headers: UA });
      for (const [, h] of html.matchAll(/href=["']([^"']+\$FILE[^"']+\.pdf[^"']*)["']/gi)) found.set(abs(h), d);
    } catch (e) { log('doc error', d, e.message); }
    await sleep(300);
  }
  return found;
}

async function tickerMatcher() {
  const entries = [];
  // 13F issuer names use the same broker abbreviations as the OGE reports, so they go first.
  const pdir = path.join(ROOT, 'data/portfolios');
  for (const f of fs.readdirSync(pdir).filter((f) => f.endsWith('.json'))) {
    for (const h of readJSON(path.join(pdir, f), {}).holdings || []) if (h.ticker && h.issuer) entries.push({ name: h.issuer, ticker: h.ticker });
  }
  try {
    const list = await fetchRetry('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'QWERTx admin@qwertx.com' } }, { type: 'json' });
    for (const x of Object.values(list)) entries.push({ name: x.title, ticker: x.ticker });
    log('SEC tickers', Object.keys(list).length);
  } catch (e) { log('SEC tickers unavailable', e.message); }
  for (const [t, v] of Object.entries(readJSON(path.join(ROOT, 'data/sectors.json'), {}))) if (v.name) entries.push({ name: v.name, ticker: t });
  const match = buildMatcher(entries);
  const overrides = cfg.overrides || {};
  const funds = Object.entries(cfg.funds || {});
  return (desc, cls) => {
    const k = nameKey(desc);
    if (overrides[k]) return { ticker: overrides[k], how: 'override' };
    if (cls === 'fund') {
      const u = desc.toUpperCase().replace(/!SHARES|1SHARES|LSHARES/g, 'ISHARES').replace(/[^A-Z0-9&. -]/g, ' ').replace(/\s+/g, ' ');
      const f = funds.find(([n]) => u.includes(n));
      return f ? { ticker: f[1], how: 'fund' } : null;
    }
    if (cls !== 'stock' && cls !== 'preferred') return null;
    return match(desc);
  };
}

/**
 * Text for one filing. The OGE copies are scans; some carry Adobe's OCR layer, some none. Our own OCR
 * (table rules removed, then Tesseract) reads cleaner, so both are parsed and the better result wins.
 */
function pdfTexts(url, file) {
  execFileSync('curl', ['-sSL', '--fail', '--retry', '5', '--retry-delay', '15', '--retry-all-errors', '-m', '300', '-A', UA['User-Agent'], '-o', file, url]);
  const texts = [];
  try { texts.push(['ocr', execFileSync('bash', [path.join(ROOT, 'scripts/ocr-pdf.sh'), file], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')]); } catch (e) { log('  OCR failed', String(e.stderr || e.message).slice(0, 300)); }
  try { texts.push(['layer', execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8')]); } catch {}
  return texts;
}

const quality = (rows) => rows.filter((r) => r.type && !r.approx).length;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (DEBUG) fs.mkdirSync(path.join(ROOT, 'data/_debug'), { recursive: true });
  const index = readJSON(path.join(OUT, 'index.json'), { filings: [] });
  const known = new Map(index.filings.map((f) => [f.url, f]));
  const found = await discover();
  for (const s of [...(cfg.seeds || []), ...(cfg.annual || [])]) if (!found.has(s)) found.set(s, 'seed');
  log(`PDF links: ${found.size}`);

  const filings = [];
  let annual = index.annual || null;
  for (const url of found.keys()) {
    const name = fileName(url);
    const signed = nameDate(name);
    if (/annual|278e|nominee/i.test(name) && !/278-?T/i.test(name)) {
      const sd = signed || ((/(20\d\d)/.exec(name) || [])[1] ? `${/(20\d\d)/.exec(name)[1]}-06-30` : null);
      if (sd && (!annual || sd > annual.signed)) annual = { url, name, signed: sd };
      continue;
    }
    if (!/278-?T|transaction|PTR/i.test(name)) { if (DEBUG) dbg.push('skip ' + name); continue; }
    if (signed && signed < (cfg.since || '2025-01-20')) continue;
    filings.push({ url, name, signed });
  }
  filings.sort((a, b) => String(a.signed).localeCompare(String(b.signed)));

  const match = await tickerMatcher();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oge-'));
  const parsed = [];
  for (const f of filings) {
    const id = (f.signed || 'x') + '-' + f.name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(-40);
    const file = path.join(OUT, id + '.json');
    const prev = known.get(f.url) && readJSON(file);
    if (prev && prev.transactions?.length && !FORCE) { parsed.push({ meta: { ...prev, transactions: undefined }, rows: prev.transactions, file }); continue; }
    let texts;
    try { texts = pdfTexts(f.url, path.join(tmp, 'f.pdf')); } catch (e) { log('download failed', f.name, String(e.stderr || e.message).slice(0, 300)); continue; }
    if (!texts.length) continue;
    const all = texts.map((t) => t[1]).join('\n');
    const received = (/OGE\s*Received:?\s*([\d]{1,2}\/[\d]{1,2}\/20\d\d)/i.exec(all) || [])[1];
    const recIso = received ? new Date(received).toISOString().slice(0, 10) : null;
    const end = recIso || f.signed;
    const year = Number((end || '2026').slice(0, 4));
    const minDate = new Date(Date.parse(end) - 200 * 864e5).toISOString().slice(0, 10);
    const tries = texts.map(([how, text]) => ({ how, text, rows: parse278T(text, { year, minDate, maxDate: end }) }));
    // Our Tesseract pass reads amounts more reliably than the scan's own OCR layer; use it unless it lost rows.
    const ocr = tries.find((t) => t.how === 'ocr'), layer = tries.find((t) => t.how === 'layer');
    const pick = ocr && (!layer || ocr.rows.length >= layer.rows.length * 0.9) ? ocr : tries.sort((a, b) => quality(b.rows) - quality(a.rows))[0];
    const other = tries.find((t) => t !== pick);
    const { how, text, rows } = pick;
    // Double check: line up the two readings by printed row number and compare amount and type.
    // Triple check: where they disagree on anything above $50,000, read that page a third time
    // (higher resolution, different layout mode) and take the answer two readings agree on.
    const check = { agreed: 0, resolved: 0, unresolved: 0, single: 0 };
    if (other) {
      const same = (a, b) => a && b && a.lo === b.lo && a.type === b.type;
      const near = (a, b) => nameKey(a.desc).slice(0, 4) === nameKey(b.desc).slice(0, 4) || Math.abs(Date.parse(a.date) - Date.parse(b.date)) < 2 * 864e5;
      const byNo = new Map(other.rows.filter((r) => r.no).map((r) => [r.no, r]));
      const disputed = [];
      for (const r of rows) {
        const o = r.no && byNo.get(r.no);
        if (!o || !near(r, o)) { check.single++; if (r.lo > 50000) disputed.push([r, null]); continue; }
        if (same(r, o)) { check.agreed++; r.checked = 2; continue; }
        if (Math.max(r.lo, o.lo) > 50000 || r.type !== o.type) disputed.push([r, o]); else { check.agreed++; r.checked = 2; r.lo = Math.min(r.lo, o.lo); r.hi = r.lo === o.lo ? o.hi : r.hi; }
      }
      const pages = [...new Set(disputed.map(([r]) => r.page))].sort((a, b) => a - b);
      const third = new Map();
      for (const pg of pages) {
        try {
          const t = execFileSync('bash', [path.join(ROOT, 'scripts/ocr-pdf.sh'), path.join(tmp, 'f.pdf')], { env: { ...process.env, OCR_FIRST: String(pg), OCR_LAST: String(pg), OCR_DPI: '400', OCR_PSM: '4' }, maxBuffer: 64 << 20 }).toString('utf8');
          for (const x of parse278T(t, { year, minDate, maxDate: end })) if (x.no) third.set(x.no, x);
        } catch (e) { log('  third reading failed on page', pg, String(e.message).slice(0, 120)); }
      }
      for (const [r, o] of disputed) {
        const t3 = third.get(r.no);
        const votes = [r, o, t3 && near(r, t3) ? t3 : null].filter(Boolean);
        const pickVote = votes.find((v) => votes.filter((w) => w.lo === v.lo && w.type === v.type).length >= 2);
        if (pickVote) { Object.assign(r, { lo: pickVote.lo, hi: pickVote.hi, type: pickVote.type, checked: votes.length }); check.resolved++; }
        else {
          // No two readings agree: keep the most conservative amount and flag it.
          const lo = Math.min(...votes.map((v) => v.lo));
          const v = votes.find((x) => x.lo === lo);
          Object.assign(r, { lo: v.lo, hi: v.hi, unverified: true });
          check.unresolved++;
        }
      }
      log(`  checks: ${check.agreed} rows agree in two readings, ${check.resolved} settled by a third reading (${pages.length} pages), ${check.unresolved} unresolved, ${check.single} read once`);
    }
    if (DEBUG) for (const t of tries) fs.writeFileSync(path.join(ROOT, 'data/_debug', `${id}.${t.how}.txt`), t.text);
    const lastNo = Math.max(0, ...[...text.matchAll(/^\s{0,20}(\d{1,4})\s{2,}\S/gm)].map((m) => Number(m[1])).filter((n) => n < 20000));
    const meta = { id, url: f.url, name: f.name, signed: f.signed, received: recIso, printedRows: Math.max(0, ...rows.map((r) => r.no || 0)) || null, text: how, check };
    parsed.push({ meta, rows, file });
    log(`${f.name}: ${tries.map((t) => `${t.how} ${t.rows.length} rows/${quality(t.rows)} clean`).join(', ')}; printed ${lastNo}; using ${how}`);
    await sleep(800);
  }

  // Each report covers a few consecutive weeks. A date far outside that window is an OCR slip:
  // replace it with the date of the row before it (rows are listed roughly in date order).
  for (const p of parsed) {
    const ds = p.rows.map((r) => r.date).filter(Boolean).sort();
    if (ds.length < 20) continue;
    const lo = Date.parse(ds[Math.floor(ds.length * 0.02)]) - 10 * 864e5, hi = Date.parse(ds[Math.floor(ds.length * 0.98)]) + 10 * 864e5;
    let prev = null, fixed = 0;
    for (const r of p.rows) {
      const t = Date.parse(r.date);
      if (t < lo || t > hi) { if (prev) { r.date = prev; r.approx = true; fixed++; } }
      else prev = r.date;
    }
    if (fixed) log(`  ${p.meta.name}: ${fixed} out-of-range dates set to neighbours`);
  }

  // Map names to tickers on every run, so better overrides apply to old filings too.
  const unmapped = new Map();
  const learned = [];
  for (const p of parsed) for (const r of p.rows) {
    r.desc = cleanDesc(r.desc);
    r.cls = classify(r.desc);
    delete r.tk; delete r.fz;
    const m = match(r.desc, r.cls);
    if (m) { r.tk = m.ticker; if (m.how === 'fuzzy') r.fz = m.score; if (m.how === 'exact' || m.how === 'override') learned.push({ name: r.desc, ticker: m.ticker }); }
  }
  // Second pass: OCR-damaged names matched loosely against names already seen in these filings.
  const loose = buildMatcher(learned, { loose: true });
  for (const p of parsed) for (const r of p.rows) {
    if (r.tk || r.cls !== 'stock') continue;
    const m = loose(r.desc);
    if (m) { r.tk = m.ticker; r.fz = m.score; }
    else { const k = r.desc.replace(/\s+/g, ' '); unmapped.set(k, (unmapped.get(k) || 0) + (r.lo + r.hi) / 2); }
  }
  const out = [];
  for (const { meta, rows, file } of parsed) {
    const m = {
      ...meta, rows: rows.length,
      from: rows.reduce((a, r) => (!a || r.date < a ? r.date : a), null), to: rows.reduce((a, r) => (!a || r.date > a ? r.date : a), null),
      mapped: rows.filter((r) => r.tk).length, stocks: rows.filter((r) => r.cls === 'stock').length, untyped: rows.filter((r) => !r.type).length,
    };
    writeJSON(file, { ...m, transactions: rows });
    log(`${m.name}: ${m.rows} rows, ${m.mapped}/${m.stocks} stocks mapped, ${m.untyped} untyped, ${m.from}..${m.to}`);
    out.push(m);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!out.length && index.filings.length) { log('Nothing parsed; keeping previous index'); return; }
  // Holdings from the latest annual report (Part 6 of OGE Form 278e), re-read only when a new report appears.
  if (annual) {
    const hfile = path.join(OUT, 'holdings.json');
    const prevH = readJSON(hfile);
    if (!prevH || prevH.url !== annual.url || FORCE) {
      try {
        const file = path.join(os.tmpdir(), 'annual.pdf');
        execFileSync('curl', ['-sSL', '--fail', '--retry', '5', '--retry-delay', '15', '--retry-all-errors', '-m', '900', '-A', UA['User-Agent'], '-o', file, annual.url]);
        const text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 1 << 30 }).toString('utf8');
        const year = (/Year \(Annual Report only\):\s*(20\d\d)/.exec(text) || [])[1] || null;
        const received = (/OGE Received:?\s*(\d{1,2}\/\d{1,2}\/20\d\d)/.exec(text) || [])[1];
        const lines = parse278eAssets(text);
        const byName = new Map();
        for (const a of lines) {
          const kind = assetKind(a.desc);
          const k = kind === 'cash' ? 'CASH' : nameKey(a.desc) || a.desc;
          const x = byName.get(k) || { desc: kind === 'cash' ? 'Cash and money market funds' : a.desc, kind, lo: 0, hi: 0, lines: 0, accounts: new Set(), open: false };
          x.lo += a.lo; x.hi += a.hi; x.lines++; x.accounts.add(a.account); x.open = x.open || !!a.open;
          byName.set(k, x);
        }
        const holdings = [...byName.values()].map((x) => {
          const cls = x.kind === 'fund' ? 'fund' : x.kind === 'stock' ? 'stock' : 'other';
          const m = cls === 'other' ? null : match(x.desc, cls);
          return { desc: x.desc, kind: x.kind, ticker: m?.ticker || null, lo: x.lo, hi: x.hi, open: x.open || undefined, lines: x.lines, accounts: x.accounts.size };
        }).filter((h) => h.hi > 1000).sort((a, b) => b.lo - a.lo || b.hi - a.hi);
        writeJSON(hfile, { url: annual.url, name: annual.name, year, received: received ? new Date(received).toISOString().slice(0, 10) : null, accounts: new Set(lines.map((l) => l.account)).size, lines: lines.length, holdings });
        log(`annual report: ${lines.length} investment lines, ${holdings.length} holdings, ${holdings.filter((h) => h.ticker).length} with tickers`);
      } catch (e) { log('annual report failed', e.message.slice(0, 200)); }
    }
  }
  writeJSON(path.join(OUT, 'index.json'), { updatedAt: new Date().toISOString(), source: `${B}/PAS+Index?OpenView`, annual, filings: out });
  if (DEBUG) {
    fs.mkdirSync(path.join(ROOT, 'data/_debug'), { recursive: true });
    const top = [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k, v]) => `${Math.round(v)}\t${k}\t${nameKey(k)}`);
    fs.writeFileSync(path.join(ROOT, 'data/_debug/trump.txt'), dbg.join('\n') + '\n\nUNMAPPED (est value, desc, key)\n' + top.join('\n') + '\n');
  }
}

main()
  .catch((e) => { log('FAILED', e.stack || e.message); process.exitCode = 1; })
  .finally(() => { try { fs.writeFileSync(path.join(OUT, 'last-run.log'), dbg.slice(-200).join('\n') + '\n'); } catch {} });
