// Turns disclosure events (dist/pro/events-recent.json) into plain-English alert lines, and decides
// which events a member wants. Shared by the dispatcher, the digests and the account page.

// Only disclosures filed this recently become alerts (older ones that show up late go to the digest).
export const ALERT_MAX_AGE_DAYS = 14;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const money = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v || 0)}`);

/** Does this member want this event? */
export function wants(e, prefs) {
  if (e.k === '13f') {
    if (!prefs.types.f13) return false;
    if (prefs.managers?.length && !prefs.managers.includes(e.m)) return false;
    if ((e.a === 'add' || e.a === 'trim') && Math.abs(e.c || 0) < (prefs.minChange ?? 10)) return false;
    return true;
  }
  if (e.k === 'cg') return !!prefs.types.cg;
  if (e.k === 'ins') return !!prefs.types.ins;
  return false;
}

/** { tag, text, detail, source } — text is one sentence; detail carries dates and the lag. */
export function describe(e, managers = {}) {
  if (e.k === '13f') {
    const m = managers[e.m]?.n || e.m;
    const pct = Math.abs(e.c || 0);
    const text =
      e.a === 'new' ? `${m} opened a new position in ${e.t} (${e.w}% of the portfolio).`
      : e.a === 'add' ? `${m} added ${pct}% more ${e.t} shares (now ${e.w}% of the portfolio).`
      : e.a === 'trim' ? `${m} trimmed ${e.t} by ${pct}% of shares (now ${e.w}% of the portfolio).`
      : `${m} sold the entire ${e.t} position.`;
    const lag = e.p ? days(e.p, e.at) : null;
    return {
      tag: e.a === 'new' ? 'New position' : e.a === 'add' ? 'Added' : e.a === 'trim' ? 'Trimmed' : 'Sold out',
      tone: e.a === 'new' || e.a === 'add' ? 'up' : 'down',
      text,
      detail: `13F holdings as of ${fmtDate(e.p)}, filed ${fmtDate(e.at)}${lag != null ? ` (${lag} days later; the trade happened some time in that quarter)` : ''}.`,
      source: e.u,
    };
  }
  if (e.k === 'cg') {
    const who = e.ch === 'President' ? 'President Donald J. Trump' : `${e.ch === 'Senate' ? 'Sen.' : 'Rep.'} ${e.who}${e.p ? ` (${e.p})` : ''}`;
    const lag = e.d ? days(e.d, e.at) : null;
    return {
      tag: e.a === 'buy' ? 'Politician buy' : 'Politician sell',
      tone: e.a === 'buy' ? 'up' : 'down',
      text: `${who} disclosed a ${e.a === 'buy' ? 'purchase' : 'sale'} of ${e.t}${e.amt ? `, ${e.amt}` : ''}.`,
      detail: `Traded ${fmtDate(e.d)}, disclosed ${fmtDate(e.at)}${lag != null && lag > 0 ? ` (${lag} days later)` : ''}. Amounts are reported as ranges.`,
      source: e.u,
    };
  }
  if (e.k === 'ins') {
    const window = e.win === 30 && e.s ? `between ${fmtDate(e.s)} and ${fmtDate(e.e)}` : `this quarter (latest ${fmtDate(e.e)})`;
    return {
      tag: 'Insider cluster',
      tone: 'up',
      text: `${e.n} company insiders bought ${e.t} shares on the open market ${window}, about ${money(e.v)} in total.`,
      detail: 'Officers and directors only. Open-market purchases from SEC Form 4; grants and option exercises are excluded.',
      source: e.u,
    };
  }
  return { tag: 'Update', tone: '', text: `New filing for ${e.t}.`, detail: '', source: e.u };
}
