export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** $299.3B, $19.5B, $934M, $95M, $12K — matches the original QWERTx design. */
export function money(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  let s;
  if (a >= 1e12) s = (a / 1e12).toFixed(2) + 'T';
  else if (a >= 1e9) s = (a / 1e9).toFixed(1) + 'B';
  else if (a >= 1e6) s = (a / 1e6).toFixed(0) + 'M';
  else if (a >= 1e3) s = (a / 1e3).toFixed(0) + 'K';
  else s = Math.round(a).toString();
  return (v < 0 ? '−$' : '$') + s;
}

export const int = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US'));

export function pct(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(d)}%`;
}

export function signed(v, d = 1, suffix = '%') {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(d);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}${suffix}`;
}

export const upDown = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "14 Aug 2026" */
export function date(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "14 Oct 25" for chart axes */
export function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

export function quarter(period) {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}
export const quarterOf = (iso) => (iso ? quarter(iso.slice(0, 7) + '-01') : '—');
export const quarterKey = (iso) => (iso ? `${iso.slice(0, 4)}q${Math.ceil(Number(iso.slice(5, 7)) / 3)}` : null);

const KEEP_UPPER = new Set(['ETF', 'ADR', 'ADS', 'PLC', 'NV', 'SA', 'AG', 'SE', 'ASA', 'LP', 'LLC', 'II', 'III', 'IV', 'REIT', 'USA', 'US', 'AI', 'NY', 'SPDR', 'UK', 'AB', 'NA', 'IBM', 'TJX', 'HP', 'CVS', 'UPS', 'RH', 'NVR', 'CSX', 'EOG', 'AES', 'KKR', 'MSCI', 'ASML', 'TSMC', 'SPX', 'QQQ', 'PDD', 'JD', 'DR', 'CRH', 'GE', 'HCA', 'ICE', 'CME', 'AMD', 'ASM', 'SAP', 'BHP', 'RTX', 'TE', 'WR', 'ON', 'LKQ', 'AON', 'DXC', 'FMC', 'CF', 'MGM', 'BJ', 'AMC', 'ODP', 'CNX', 'NRG', 'OGE', 'MDU', 'PG&E', 'AT&T', 'S&P']);
const SPECIAL = { ISHARES: 'iShares', JPMORGAN: 'JPMorgan', HLDGS: 'Holdings', HLDG: 'Holding', CO: 'Co', OF: 'of', AND: 'and', THE: 'The', INTL: 'International', TECHNOLOGIES: 'Technologies', CORPORATION: 'Corporation', MCDONALDS: "McDonald's", PAYPAL: 'PayPal', MASTERCARD: 'Mastercard', NVIDIA: 'NVIDIA', MOODYS: "Moody's", LOWES: "Lowe's", MACYS: "Macy's", DOLLARAMA: 'Dollarama' };

/** "META PLATFORMS INC" -> "Meta Platforms Inc". Leaves mixed-case names alone. */
export function titleCase(name) {
  if (!name) return '';
  if (/[a-z]/.test(name)) return name;
  return name
    .split(/\s+/)
    .map((w) => {
      if (SPECIAL[w]) return SPECIAL[w];
      if (KEEP_UPPER.has(w)) return w;
      return w.toLowerCase().replace(/(^|[-/.&'(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
    })
    .join(' ');
}

/** "Apple Inc." -> "Apple", "Coca-Cola Co" -> "Coca-Cola", "Taiwan Semiconductor Manufacturing Co Ltd" -> "Taiwan Semiconductor Manufacturing" */
export function cleanName(name) {
  let s = titleCase(String(name || '').trim()).replace(/\s*\/[A-Z]{2,3}\/?$/i, '');
  const SUFFIX = /[,\s]+(Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|Limited|PLC|plc|N\.?V\.?|S\.?A\.?|AG|SE|Holdings?|Hldgs|Group|Del|De|New|The|Com|Cl [A-Z]|Class [A-Z]|LP|L\.P\.|LLC|ADR|ADS|Sponsored|Spon|Each)\.?$/i;
  for (let i = 0; i < 4; i++) {
    const t = s.replace(SUFFIX, '');
    if (t === s || t.length < 2) break;
    s = t;
  }
  return s.replace(/\s+&$/, '').trim();
}

/** "(Class A)" etc. from a 13F title of class like "CAP STK CL A" or "CL B". */
export function classSuffix(cls) {
  const m = /\bC(?:L|LASS)\s*([A-C])\b/i.exec(cls || '');
  return m ? ` (Class ${m[1].toUpperCase()})` : '';
}

export const slugify = (s) =>
  String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const initials = (name) =>
  String(name)
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
