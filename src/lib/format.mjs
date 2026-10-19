export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function money(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const f = (n, s) => `${v < 0 ? '-' : ''}$${n.toFixed(digits).replace(/\.0+$/, '')}${s}`;
  if (a >= 1e12) return f(a / 1e12, 'T');
  if (a >= 1e9) return f(a / 1e9, 'B');
  if (a >= 1e6) return f(a / 1e6, 'M');
  if (a >= 1e3) return f(a / 1e3, 'K');
  return `${v < 0 ? '-' : ''}$${Math.round(a)}`;
}

export const int = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US'));

export function pct(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const p = v * 100;
  if (p > 0 && p < 0.05 && d === 1) return '<0.1%';
  return `${p.toFixed(d)}%`;
}

export function signedPct(v, d = 0) {
  if (v == null || !Number.isFinite(v)) return '';
  const p = v * 100;
  const s = Math.abs(p) < 1 && p !== 0 ? p.toFixed(1) : p.toFixed(d);
  return `${p > 0 ? '+' : ''}${s}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function date(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function quarter(period) {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}

const KEEP_UPPER = new Set([
  'ETF', 'ADR', 'ADS', 'PLC', 'NV', 'SA', 'AG', 'SE', 'ASA', 'LP', 'LLC', 'II', 'III', 'IV', 'REIT', 'USA', 'US', 'AI',
  'NY', 'SPDR', 'ISHARES', 'TR', 'UK', 'AB', 'NA', 'HLDGS', 'DE', 'CV', 'BV', 'GE', 'IBM', 'AT&T', 'TJX', 'HP', 'CVS',
  'UPS', 'RH', 'NVR', 'CSX', 'PG&E', 'EOG', 'AES', 'KKR', 'MSCI', 'S&P', 'JPMORGAN', 'DR', 'ASML', 'TSMC', 'SPX',
]);
const SPECIAL = {
  ISHARES: 'iShares', JPMORGAN: 'JPMorgan', HLDGS: 'Hldgs', TR: 'Tr', DR: 'Dr', CO: 'Co', OF: 'of', IN: 'In',
  ON: 'On', TO: 'To', BY: 'By', MY: 'My', GO: 'Go', UP: 'Up', AN: 'An', AM: 'Am', OR: 'Or', AND: 'and',
};

/** "META PLATFORMS INC" -> "Meta Platforms Inc". Leaves mixed-case names alone. */
export function titleCase(name) {
  if (!name) return '';
  if (/[a-z]/.test(name)) return name;
  return name
    .split(/\s+/)
    .map((w) => {
      if (SPECIAL[w]) return SPECIAL[w];
      if (KEEP_UPPER.has(w)) return w;
      if (/^[A-Z]{1,2}$/.test(w) && w !== 'A') return w;
      return w
        .toLowerCase()
        .replace(/(^|[-/.&'(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
    })
    .join(' ');
}

export const slugify = (s) =>
  String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
