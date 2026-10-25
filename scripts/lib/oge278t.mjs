// Parser for OGE Form 278-T (Periodic Transaction Report) PDFs, read through `pdftotext -layout`.
// The President's reports are scanned paper with an OCR text layer, so every field is read defensively:
// the date and the amount range anchor each row; the type and description tolerate OCR noise.

export const BUCKETS = [
  [1001, 15000], [15001, 50000], [50001, 100000], [100001, 250000], [250001, 500000],
  [500001, 1000000], [1000001, 5000000], [5000001, 25000000], [25000001, 50000000], [50000001, 100000000],
];

// Fix the letters OCR most often swaps for digits inside numbers.
const digitize = (s) => s.replace(/[Oo]/g, '0').replace(/[Il|!]/g, '1').replace(/[Ss]/g, '5').replace(/[Bb]/g, '8').replace(/[Dd]/g, '0').replace(/\?/g, '2');

/** "$1 000 001 - $5 D00 000" -> [1000001, 5000000] (snapped to a standard OGE bucket). */
export function parseAmount(raw) {
  const s = raw.replace(/S(?=[\d ]{2})/g, '$');
  const over = /over\s*\$?\s*50/i.test(s);
  if (over) return BUCKETS[BUCKETS.length - 1];
  const parts = s.split(/\s*[-–—•·~]\s*|\s+(?=\$)/).map((p) => digitize(p).replace(/[^\d]/g, '')).filter((p) => p.length >= 3);
  if (!parts.length) return null;
  const lo = Number(parts[0]);
  // Lower bounds always end in 001; pick the bucket whose lower bound matches best, else nearest by digits.
  if (parts[1]) {
    const hi = Number(parts[1]);
    const m = BUCKETS.find((b) => b[1] === hi);
    if (m) return m;
  }
  let best = null;
  for (const b of BUCKETS) {
    if (String(b[0]) === String(lo)) return b;
    const d = Math.abs(Math.log10(lo || 1) - Math.log10(b[0]));
    if (!best || d < best.d) best = { b, d };
  }
  return best && best.d < 0.15 ? best.b : null;
}

/** OCR dates: "8/312026", "8/1017026", "813/2026", "8/ 31/2026", "B/28/2026", "8/31/?026". Returns ISO or null. */
export function parseDate(raw, { year, maxMonth, minDate, maxDate } = {}) {
  let s = digitize(raw.replace(/\s+/g, '').replace(/^V/, '1/')).replace(/[^\d/]/g, '');
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  let mo, d, y;
  if (m) [, mo, d, y] = m;
  else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\d)?(20\d\d|\d0\d\d|\d{3})$/.exec(s.replace(/\/(\d{1,2})1?7?0(2\d)$/, '/$1/20$2')))) [, mo, d, y] = m;
  else if ((m = /^(\d)(\d{1,2})\/(\d{4})$/.exec(s))) [, mo, d, y] = m; // "813/2026": first slash read as nothing
  else if ((m = /^(\d{1,2})[\/1](\d{2})[\/1][27]?0(2\d)$/.exec(s))) { [, mo, d] = m; y = '20' + m[3]; } // "712412026", "8/1017026": slashes read as 1
  else return null;
  mo = Number(mo); d = Number(d); y = Number(String(y).length === 4 ? y : year);
  if (!/^20\d\d$/.test(String(y)) || (year && Math.abs(y - year) > 1)) y = year || y;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) { d = Number(String(d).slice(0, 1)); if (!d) return null; }
  if (maxMonth && y === year && mo > maxMonth) return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const ok = (x) => !isNaN(Date.parse(x)) && !(minDate && x < minDate) && !(maxDate && x > maxDate);
  if (ok(iso)) return iso;
  // Year misread ("2025" for "2026"): keep month/day if they fit the filing's window.
  if (year && y !== year) { const alt = `${year}${iso.slice(4)}`; if (ok(alt)) return alt; }
  return null;
}

/**
 * "lourchase", "IDUrchaso", "IPUn:huo", "salo", "Sale (Partial)" -> 'P' | 'S' | 'E' | ''.
 * strict=false is for the type column, where anything long that is not a sale is a purchase
 * (the President's reports only use Purchase, Sale and Exchange).
 */
export function parseType(raw, strict = true) {
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (/exch/.test(s)) return 'E';
  if ((/sa[il1]?[eo]|^sal|ale$/.test(s) || /^sa/.test(s)) && !/rch|urc/.test(s)) return 'S';
  if (/rch|urc|rcl|cha[sd]|chas|ura|utal|chase|chaso|ase$|pur|our|haso|aso$|asc$/.test(s)) return 'P';
  if (!strict) {
    const t = raw.replace(/\s/g, '');
    if (/^[sS5$][a-z0-9]{2,4}$/.test(t) && t.length <= 5) return 'S';
    if (t.length >= 6 && /[a-z]/.test(t)) return 'P';
  }
  return '';
}

const MUNI = /\b(REV|CNTY|DIST|AUTH|SCH|MUD|CITY|COMMN|HSG|HOSP|ARPT|UTILS?|TWP|BORO|FING|OBLIG|RFDG|IMPT|GO|PUB|TRAN|WTR|SWR|INDPT|ISD|PSF|ST|BLDG|TOB|HLTH|EDL?|FACS|MTG|CTF|PARTN|TAX|LN|MUN|PORT|TPK|TOLL)\b/;

const STATES = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR)\b/g;
const CORP_DEBT = /\b(INC|CORP|CO|TIER|LLC|LP|PLC|SENIOR|UNSEC\w*|SUB|REGS|144A|HLDGS|HOLDINGS|BANK|BANCORP|FINL|N\s?A|TECHN\w*|GROUP|MTN|PERP)\b/g;

/** Rough asset class from the description: muni, corporate, preferred, treasury, fund or stock. */
export function classify(desc) {
  const u = desc.toUpperCase();
  if (/\bE[TL1I][FP]S?\b|[I!L1|]S[HL]{1,2}AR[EO]S|\bSPDR\b|SELECT SECTOR|INDEX FDS|EXCHANGE.TRADED|\bVANGUARD\b|\bFD TR\b/.test(u) || (/\bTR\b/.test(u) && /RUSS|S&P|S&O|MSCI|NASDAQ|GLOBAL 100|1000|2000|500/.test(u))) return 'fund';
  if (/TREAS(URY)?\b.*(NOTE|BILL|BOND)|UNITED STATES TREAS|\bUS T(REAS)?\b.*\bDUE\b|T-BILL/.test(u)) return 'treasury';
  if (/\bPFD\b|PREFERRED|DEP SHS|DEPOSITARY|\bPERP\b/.test(u)) return 'preferred';
  const isDebt = /%\s*D[UO][EO]|\bDU[EO]\b|\bNOTES?\b|\bBONDS?\b|\bB\/E\b|\bDEB\b|\d\s?\.\s?\d{2,4}\s*%|\d\.\d+"|\bS"/.test(u);
  if (isDebt) {
    const muni = (u.match(MUNI_G) || []).length + Math.min(1, (u.match(STATES) || []).length);
    const corp = (u.match(CORP_DEBT) || []).length;
    return muni > corp ? 'muni' : 'corporate';
  }
  if (/\b(FUND|FD|PORTFOLIO|TRUST)\b/.test(u) && !/\b(INC|CORP|REIT|BANCORP)\b/.test(u)) return 'fund';
  // Municipal bonds whose coupon or "Due" OCR'd badly ("S.000%", "BE/R/"): several municipal words, or one plus a state.
  const muniWords = (u.match(MUNI_G) || []).length + (u.match(/\b(BDS|REVS|CNTY|UNIV|SYS|PROG|COLLEGE|SCH|DIST|FDG|VARATE|PUTBND|CALLABLE)\b/g) || []).length;
  if (muniWords >= 3 || (muniWords >= 2 && (u.match(STATES) || []).length) || (muniWords >= 1 && /\d%/.test(u))) return 'muni';
  // Coupons OCR'd with letters ("S.000%", "G.9B02%") and bank deposits ("FIRST HORIZON BK MEMPHIS TENN").
  if (/[\dSOGB]\.[\dOSB]{2,4}\s*%/.test(u) || /\bBK\b.*\b(TENN|N\s?A|CD)\b|\bCERT(IFICATE)? OF DEP|\bCD\b/.test(u)) return 'corporate';
  return 'stock';
}
const MUNI_G = new RegExp(MUNI.source, 'g');

const HEADER = /OGE Form|Office of Gov|Periodic Transaction|Filer|Page \d|Notification|Received|Description|Instructions|public form|account numbers|Certif|Signature|Comments of|Transactions?\b|Last Name|Position|Digitally signed|GOVERNMENT ETHICS|follow .*instructions/i;
const AMOUNT = /(?:^|\s)((?:[Ss$]{1,2}\s?\d[\d.,\s]{2,}|ss[o0]|Over\s)[^]*)$/;

/**
 * Parse the layout text of one 278-T into rows.
 * Each row ends with the amount range; the columns before it are, from the right:
 * Yes/No, date, type, description (which may wrap onto lines above).
 * @param {string} text pdftotext -layout output
 * @param {{year:number, maxMonth?:number}} ctx filing year and month (dates after it are OCR noise)
 */
export function parse278T(text, ctx = {}) {
  const rows = [];
  let buf = [];
  let lastDate = null;
  let page = 1;
  let loneNo = null;
  for (const raw of text.split(/\n/)) {
    page += (raw.match(/\f/g) || []).length;
    const line = raw.replace(/\f/g, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (HEADER.test(line) && !/\$\s?\d/.test(line)) { buf = []; continue; }
    const am = AMOUNT.exec(line);
    if (!am || !/\d{3}/.test(am[1].replace(/\s/g, ''))) {
      const t = line.trim();
      if (/^\d{1,4}$/.test(t)) { loneNo = Number(t); continue; }
      if (t.length > 2) buf.push(t);
      if (buf.length > 3) buf.shift();
      continue;
    }
    const amount = parseAmount(am[1]);
    let before = line.slice(0, am.index).replace(/\s+$/, '');
    // Trailing Yes/No (and stray bullets) belongs to the notification column.
    let late;
    before = before.replace(/\s*[•·.,‘'’]?\s*\b([YVyv][eoa][s5aotl]|[Nn][o0e])\s*[•·.]?\s*$/, (_, x) => { late = /^[YVyv]/.test(x); return ''; });
    let cols = [...buf.flatMap((b) => b.split(/\s{2,}/)), ...before.trim().split(/\s{2,}/)].map((c) => c.trim()).filter(Boolean);
    buf = [];
    if (!amount) continue;
    // Find the type column: the right-most short column that reads as purchase/sale.
    let ti = -1;
    const dateLike = (c) => /\d/.test(c) && /[\/'"•n]|\d{5,}/.test(c) && c.length <= 14;
    if (cols.length >= 3 && dateLike(cols[cols.length - 1])) {
      const c = cols[cols.length - 2];
      if (c.length <= 14 && /[a-z■:]/.test(c) && parseType(c, false)) ti = cols.length - 2;
    }
    if (ti < 0) {
      for (let i = cols.length - 1; i >= Math.max(0, cols.length - 3); i--) {
        if (cols[i].length <= 16 && !/\d{2}/.test(cols[i]) && parseType(cols[i])) { ti = i; break; }
      }
    }
    const type = ti > -1 ? parseType(cols[ti], false) : '';
    const dateCol = ti > -1 ? cols.slice(ti + 1).join(' ') : (cols.length ? cols[cols.length - 1] : '');
    let date = parseDate(dateCol, ctx);
    const approx = !date;
    if (!date) date = lastDate;
    if (date) lastDate = date;
    let descCols = ti > -1 ? cols.slice(0, ti) : cols.slice(0, -1);
    // The printed row number (first column), used to line up independent readings of the same form.
    const noM = /^[•.\-|\s]*(\d{1,4})(?:\s|$)/.exec(descCols[0] || '');
    let no = noM ? Number(noM[1]) : loneNo;
    loneNo = null;
    descCols = descCols.filter((c) => !/^[•.\-\s]*\d{1,4}$/.test(c)).map((c) => c.replace(/^[•.\-]?\s*\d{1,4}\s+(?=\S)/, ''));
    let desc = descCols.join(' ').replace(/\s{2,}/g, ' ').replace(/^.*\bAmount\b\s*/i, '').trim();
    let typ2 = type;
    if (!typ2) { const w = /\s(\S{5,12})$/.exec(desc); if (w && parseType(w[1]) && /[a-z]/.test(w[1])) { typ2 = parseType(w[1]); desc = desc.slice(0, w.index); } }
    if (!typ2) { const tw = desc.split(/\s+/).slice(-4).find((w) => /[a-z:\\•■]/.test(w) && w.length >= 4 && parseType(w) && !/^(Inc|Corp|Com)\.?$/i.test(w)); if (tw) typ2 = parseType(tw); }
    if (!typ2) {
      // "Sale" read as "11110", "SIIIO", "Ille", "Ulo".
      const sg = /\s([S5Il1|U][Il1|]{1,3}[o0eO]|1{3,4}0|[I1l]ll?e)\s*$/.exec(desc);
      if (sg) { typ2 = 'S'; desc = desc.slice(0, sg.index); }
    }
    if (!typ2) {
      // A purchase garble glued to the name with a single space: "ROPER TECHNOLOGIES INC DUrt:NIIO", "LKQ CORP lou".
      const g = /\s((?=\S*[a-z:•■\-])\S{1,10}|IOU|IO U|DU|PUICNISO|DUICNISO)(?:\s+\S{1,10})?\s*$/.exec(desc);
      if (g && !/^(Inc|Corp|Co|Ltd|Plc|Com|Group|Trust|Holdings|Hldgs)\.?,?$/i.test(g[1]) && !/^[A-Z][a-z]+$/.test(g[1]) && !/sa[l1i]/i.test(g[1])) { typ2 = 'P'; desc = desc.slice(0, g.index); }
    }
    desc = cleanDesc(desc);
    if (!date || !/[A-Za-z]{3,}/.test(desc) || NOISE_ROW.test(desc)) continue;
    rows.push({ no: no || undefined, page, desc, type: typ2, date, approx: approx || undefined, late, lo: amount[0], hi: amount[1] });
  }
  // Drop row numbers that break the running order (OCR noise), then fill runs of missing numbers
  // between two known ones when the count fits exactly. Row numbers line up independent readings.
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i - 1]?.no, b = rows[i + 1]?.no, n = rows[i].no;
    if (n && a && b && (n <= a || n >= b)) delete rows[i].no;
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].no) continue;
    let j = i;
    while (j < rows.length && !rows[j].no) j++;
    const a = i > 0 ? rows[i - 1].no : 0, b = j < rows.length ? rows[j].no : null;
    if (b != null && b - a - 1 === j - i) for (let k = i; k < j; k++) rows[k].no = a + (k - i) + 1;
    i = j;
  }
  return rows;
}

const BOILER = /\s(?:Sol+[il1|]?[cdtl]|Unsol|Ave?r[ao]|[A4]\s?[-~]\s?Unit|Unit\s+P|Your\s+Br|D[il1]s[ca]|Dbc|Exer|Exorc|Allocated|E1TT|Ord[eo]r|Tran\w*\s+Your|IDEU\b)/i;
const NOISE_ROW = /Not[il1t]{1,3}[fcn]?[il1]?c?[a■:]?t|^Not[il1]|R.?[ce].{0,3}[il1]?[v9w]e?d|Over\s?30|\.\.r\s?30|Aa[oe]\s*$|Da[vy][as]\s?A|Description|\bAmount\b|^[^A-Za-z]*$/i;

/** Strip broker boilerplate, trailing dates and stray type words from an OCR'd description. */
export function cleanDesc(desc) {
  let s = ' ' + desc.replace(/[“”‘’"`]/g, '') + ' ';
  const b = BOILER.exec(s);
  if (b && b.index > 4) s = s.slice(0, b.index);
  s = s.replace(/\s\d{1,2}\s?\/\s?\d{1,2}\s?\/?\s?\d{2,4}\b.*$/, ' ').replace(/\s\d{6,8}\s*$/, ' ');
  // Trailing type words and flags: "UNSOLICITED pun:hose", "aalo", "N•rehasa".
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\s+(UNSOLICITED|SOLICITED)\s*$/i, ' ');
    const w = /\s(\S{3,11})\s*$/.exec(s);
    if (w && /[a-z:\\•■]/.test(w[1]) && parseType(w[1]) && !/^(Inc|Corp|Co|Ltd|Plc|Com|Group|Trust)\.?$/i.test(w[1])) s = s.slice(0, w.index) + ' ';
  }
  // Misread row numbers in front of the name: "“4 Allstate Corp", "uu Apollo", "mo, Centerpoint".
  s = s.replace(/^\s*(?:(?=\S*[^A-Za-z&.\s]|[a-z]{1,3}\b)\S{1,4}\s+)+(?=[A-Z])/, ' ');
  return s.replace(/\s+(COM|COMMON STOCK|USD\s?0\.\d+|NEW)\s*$/i, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-_.,~'"`]+|[\s\-_.,~'"`]+$/g, '').trim();
}

/** Midpoint estimate used for sorting and totals (disclosures are ranges). */
export const mid = (r) => Math.round((r.lo + r.hi) / 2);
