// Parsers for the two "featured politician" disclosures:
//  - OGE Form 278e (the President's annual report): Part 6 lists every investment with a value range.
//  - House Financial Disclosure reports (annual Schedule A holdings, Schedule B and PTR transactions).

export const RANGES = [
  [1, 1000], [1001, 15000], [15001, 50000], [50001, 100000], [100001, 250000], [250001, 500000], [500001, 1000000],
  [1000001, 5000000], [5000001, 25000000], [25000001, 50000000], [50000001, 100000000],
];

/** "$1,000,001 - $5,000,000", "Over $50,000,000", "None (or less than $1,001)" -> {lo, hi, label} */
export function parseRange(s) {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (/^None|less than \$1,001/i.test(t)) return { lo: 0, hi: 1000, label: 'Under $1,001' };
  const over = /Over \$([\d,]+)/i.exec(t);
  if (over) { const lo = Number(over[1].replace(/,/g, '')) + 1; return { lo, hi: lo, label: `Over $${over[1]}`, open: true }; }
  const m = /\$([\d,]+)\s*(?:-|–|to)\s*\$([\d,]+)/.exec(t);
  if (!m) {
    // Some filers report an exact value instead of a range ("$15.00").
    const one = /^\$([\d,]+(?:\.\d{2})?)$/.exec(t);
    if (one) { const v = Math.round(Number(one[1].replace(/,/g, ''))); return { lo: v, hi: v, label: `$${v.toLocaleString('en-US')}`, exact: true }; }
    return null;
  }
  const lo = Number(m[1].replace(/,/g, '')), hi = Number(m[2].replace(/,/g, ''));
  return { lo, hi, label: `$${m[1]} – $${m[2]}` };
}

// ---------------------------------------------------------------- OGE 278e, Part 6

const VALUE = /(None \(or less than \$1,001\)|\$[\d,]+\s*(?:-|to)\s*\$[\d,]+|Over \$[\d,]+)/;
const ROW = new RegExp(`^\\s{0,6}(\\d{1,4}(?:\\.\\d{1,3})?)\\s{2,}(.+?)\\s{2,}(Yes|No|N\\/A)\\s{2,}${VALUE.source}`);

/** Investments in Part 6 of an OGE 278e text (pdftotext -layout). */
export function parse278eAssets(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^Part 6: Other Assets and Income/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^Part 7: Transactions/.test(l));
  if (start < 0) return [];
  const out = [];
  let account = '';
  let last = null;
  for (const raw of lines.slice(start, end > 0 ? end : undefined)) {
    const l = raw.replace(/\f/g, '');
    const acct = /^\s{2,}((?:INVESTMENT|BANK|BROKERAGE|RETIREMENT)[A-Z ]*ACCOUNT #\d+)\s*$/.exec(l);
    if (acct) { account = acct[1].trim(); last = null; continue; }
    const m = ROW.exec(l);
    if (m) {
      const v = parseRange(m[4]);
      const rest = l.slice(m.index + m[0].length).trim().split(/\s{2,}/);
      last = { n: m[1], desc: m[2].trim().replace(/^\*{3}/, ''), eif: m[3], account, ...v, income: rest.join(' · ').slice(0, 80) };
      out.push(last);
      continue;
    }
    // Wrapped description: an indented line with text in the description column and nothing else.
    if (last && /^\s{4,}\S/.test(l) && !/OGE Form|Instructions|Page|Description|Filer|Note:|Part 6/.test(l)) {
      const t = l.trim().split(/\s{2,}/)[0];
      if (t && t.length < 80 && !VALUE.test(t) && !/^(DIVIDEND|INTEREST|Capital|Gains|Dividend|None)/i.test(t)) last.desc += ' ' + t;
    } else if (!l.trim()) last = null;
  }
  return out;
}

/** Rough asset class for a 278e investment line. */
export function assetKind(desc) {
  const u = desc.toUpperCase();
  if (/MONEY MARKET|CASH\b|BANK ACCOUNT|DEPOSIT|SWEEP|TREASURY BILL|T-BILL/.test(u)) return 'cash';
  if (/\bTREASU|\bUST NOTE|U\.?S\.? TREAS/.test(u)) return 'treasury';
  if (/\bDUE\b.*\d{4}|\bNOTES?\b|\bBONDS?\b(?!.*ETF)|\bDEBS?\b|SENIOR (UN)?SECURED|\bREV\b|\bMUN\b|\bGO\b|\bRFDG\b/.test(u) && !/\bETF\b/.test(u)) return /\b(CNTY|AUTH|DIST|REV|SCH|CITY|STATE|ST\b|TWP|MUN|RFDG|GO\b|HOSP|HSG|UTIL)/.test(u) && !/\b(INC|CORP|LLC|CO|PLC)\b/.test(u) ? 'muni' : 'bond';
  if (/\bETF\b|ISHARES|SPDR|VANGUARD|INVESCO|INDEX FD|\bTRUST\b.*(GOLD|SILVER)|MINISHARES/.test(u)) return 'fund';
  if (/BITCOIN|ETHEREUM|\bCRYPTO|\bTOKEN|\$TRUMP|MEME/.test(u)) return 'crypto';
  return 'stock';
}

// ---------------------------------------------------------------- House FD reports (pdftotext -raw)

const HOUSE_NOISE = /^(Asset Owner|Asset Owner Value|ID Owner Asset|Type|Date Notification|Date|Amount Cap\.|Gains >|\$200\?|\$1,000\?|Filing ID #|\* For the complete|Clerk of the House|F I$|Name: Hon|Status:|State\/District|T$|P T R|F D R|I P O|Yes No|C S$|I CERTIFY|my knowledge|Digitally Signed)/;
const OWNER = /^(SP|JT|DC)\s+/;
const INCOMPLETE = /^(Stock|Common|Class|Account|Units|Shares|Ordinary|Corporation|Incorporated|Series|American|Depositary|Inc\.?|Corp|Company|Fund|Trust|LLC|L\.P\.|Ltd|Limited|plc|Group|Holdings|Technologies|Industries|\(\w+\))\b/;
const INCOME = /^(Dividends|Capital Gains|Interest|Rent|Partnership|Income|Grape|None|Royalties|Excepted|Tax-Deferred)/;
const AMT = /(\$[\d,]+\s*-\s*\$[\d,]+|Over \$[\d,]+|Spouse\/DC Over \$1,000,000|None|\$[\d,]+\.\d{2}(?=\s|$))/;

function houseEntries(lines, { tx = false } = {}) {
  // Each entry ends its name with an asset-type code like [ST], [OP], [RP].
  const entries = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const c = /\[([A-Z]{2})\]/.exec(l);
    if (c) {
      let name = l.slice(0, c.index).trim();
      // The name may have wrapped onto lines above ("Alphabet Inc. - Class A Common" / "Stock (GOOGL) [ST]"), and a
      // page break can split a row so the name and the transaction sit above the page header:
      // "International Business Machines P 06/16/2026 07/02/2026 $15,001 -" / (header) / "Corporation Common Stock (IBM)" / "[ST]".
      const txRe = /(?:^|\s)(?:P|S(?:\s*\(partial\))?|E)\s+\d{2}\/\d{2}\/\d{4}/;
      const txAfter = txRe.test(l.slice(c.index)) || txRe.test(lines[i + 1] || '');
      const isIncomplete = (t) => !t || /^[(\[a-z]/.test(t) || INCOMPLETE.test(t);
      const isData = (t) => /^([LDC]|F S|S O) :/.test(t) || (AMT.test(t) && !/[A-Za-z]{4}/.test(t.replace(/Over|None|Spouse\/DC/g, ''))) || INCOME.test(t);
      const hasTx = (t) => /^(?:(?:SP|JT|DC)\s+)?[A-Z0-9(][^:]*\s(?:P|S(?:\s*\(partial\))?|E)\s+\d{2}\/\d{2}\/\d{4}/.test(t) && !/^([LDC]|F S|S O) :/.test(t);
      const taken = [];
      // A page break can also fall after the transaction line, leaving only the end of the name and the code below
      // the header: "JT Virtus Artificial Intelligence &" / "Technology Opportunities Fund" / "S 09/23/2026 10/02/2026 $15,001 -" /
      // "$50,000" / (header) / "Common Shares of Beneficial Interest" / "(AIO) [ST]".
      const amtCont = (t) => /^(\$[\d,]+|Over \$[\d,]+)$/.test(t || '');
      const bareTx = (t) => /^(?:P|S(?:\s*\(partial\))?|E)\s+\d{2}\/\d{2}\/\d{4}/.test(t || '');
      let needName = false;
      for (let k = i - 1; k >= Math.max(0, i - (tx && !txAfter ? 8 : 3)); k--) {
        const prev = lines[k];
        if (!prev) break;
        const seeking = tx && !txAfter && !txRe.test(name);
        const need = needName || isIncomplete(name) || (seeking && (hasTx(prev) || bareTx(prev) || amtCont(prev) || (k === i - 1 && !isData(prev))));
        if (!need || (isData(prev) && !hasTx(prev) && !(seeking && amtCont(prev)))) break;
        // Only lines the previous entry has not used for its own transaction details.
        if (cur && !(cur.tail.length && cur.tail[cur.tail.length - 1] === prev)) break;
        if (cur) cur.tail.pop();
        taken.push(prev);
        name = prev + ' ' + name;
        if (/^(SP|JT|DC)\s/.test(prev)) break;
        if (bareTx(prev)) { needName = true; continue; }
        if (hasTx(prev)) break;
      }
      cur = { name: name.trim(), code: c[1], tail: [l.slice(c.index + c[0].length).trim()] };
      entries.push(cur);
    } else if (cur) cur.tail.push(l);
  }
  return entries.map((e) => {
    const after = e.tail.join('\n');
    const head = after.split(/\n(?=(?:[LDC]|F S) :)/)[0].replace(/\n/g, ' ').trim();
    const desc = (/(?:^|\n)D : ([\s\S]*?)(?=\n(?:[LC]|F S) :|$)/.exec(after) || [])[1];
    let nm = e.name, hd = head;
    const split = /\s((?:P|S(?:\s*\(partial\))?|E)\s+\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}\/\d{2}\/\d{4})?\s+\$[\d,]+(?:\s*-\s*(?:\$[\d,]+)?)?)\s/.exec(' ' + nm + ' ');
    if (split) { nm = (' ' + nm + ' ').replace(split[1], ' ').replace(/\s+/g, ' ').trim(); hd = (split[1] + ' ' + hd).trim(); }
    const owner = OWNER.exec(nm) ? OWNER.exec(nm)[1] : (/^(SP|JT|DC)\b/.exec(hd) || [])[1] || 'Self';
    const name = nm.replace(OWNER, '').trim();
    const ticker = (/\(([A-Z][A-Z.\-]{0,6})\)\s*$/.exec(name) || [])[1] || null;
    return { name, ticker, code: e.code, owner, head: hd.trim(), desc: desc ? desc.replace(/\s+/g, ' ').trim() : '' };
  });
}

const clip = (raw, from, to) => {
  const lines = raw.split('\n').map((l) => l.replace(/\f/g, '').trim()).filter(Boolean);
  const a = from ? lines.findIndex((l) => from.test(l)) : 0;
  const b = to ? lines.findIndex((l, i) => i > a && to.test(l)) : -1;
  return lines.slice(a < 0 ? 0 : a + (from ? 1 : 0), b < 0 ? undefined : b).filter((l) => !HOUSE_NOISE.test(l) && !/^S [A-I]:/.test(l));
};

/** Option details from a PTR description: "Purchased 20 call options with a strike price of $150 and an expiration date of 1/15/27." */
export function optionInfo(desc) {
  const m = /(\d[\d,]*) (call|put) options?.*?strike price of \$([\d.,]+).*?expiration date of (\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(desc || '');
  return m ? { contracts: Number(m[1].replace(/,/g, '')), right: m[2].toLowerCase(), strike: Number(m[3].replace(/,/g, '')), expires: m[4] } : null;
}

const isoDate = (s) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };

/** Schedule A of a House annual report: holdings at year end. */
export function parseHouseHoldings(raw) {
  return houseEntries(clip(raw, /^S A:/, /^S B:/)).map((e) => {
    const v = parseRange((AMT.exec(e.head.replace(/^(SP|JT|DC)\s+/, '')) || [])[1]);
    return { name: e.name, ticker: e.ticker, code: e.code, owner: e.owner, ...v, desc: e.desc, option: e.code === 'OP' ? optionInfo(e.desc) : null };
  }).filter((h) => h.lo != null);
}

/** Transactions from a House PTR (or Schedule B of an annual report). */
export function parseHouseTransactions(raw, { annual = false } = {}) {
  const lines = annual ? clip(raw, /^S B:/, /^S C:/) : clip(raw, null, null);
  return houseEntries(lines, { tx: true }).map((e) => {
    const h = e.head.replace(/^(SP|JT|DC)\s+/, '');
    const m = /^(P|S(?:\s*\(partial\))?|E)\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}\/\d{2}\/\d{4}))?\s+(.*)$/.exec(h) || /^(\d{2}\/\d{2}\/\d{4})\s+(P|S(?:\s*\(partial\))?|E)\s+(.*)$/.exec(h);
    if (!m) return null;
    const [type, date, rest] = /^\d/.test(m[1]) ? [m[2], m[1], m[3]] : [m[1], m[2], m[4]];
    const amt = parseRange((AMT.exec(rest) || [])[1]);
    if (!amt) return null;
    return {
      name: e.name, ticker: e.ticker, code: e.code, owner: e.owner,
      type: type.startsWith('P') ? 'buy' : type.startsWith('S') ? 'sell' : 'exchange', partial: /partial/.test(type),
      date: isoDate(date), ...amt, desc: e.desc, option: e.code === 'OP' ? optionInfo(e.desc) : null,
    };
  }).filter(Boolean);
}
