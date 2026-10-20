// Economic calendar and earnings, shaped for busy readers: only the releases that move markets,
// each with a plain-English name, what it measures, why it matters and how the result compared.

const TZ = 'America/New_York';

// dir: how to describe a result above the forecast. heat = inflation, strong = economy/jobs, weak = higher is worse (jobless claims).
// tier: big = can move the whole market on the day; watch = worth knowing.
export const CATALOG = [
  { key: 'fed', country: 'US', titles: ['Fed Interest Rate Decision'], name: 'Fed interest-rate decision', tier: 'big', group: 'Interest rates', icon: 'fa-building-columns', dir: 'rate', fmt: 'rate',
    what: 'The Federal Reserve sets the benchmark US interest rate (shown as the top of its target range).',
    why: 'Rates drive mortgage and loan costs and how much investors will pay for stocks. The press conference 30 minutes later often moves markets more than the decision.' },
  { key: 'boc', country: 'CA', titles: ['BoC Interest Rate Decision'], name: 'Bank of Canada rate decision', tier: 'big', group: 'Interest rates', icon: 'fa-building-columns', dir: 'rate', fmt: 'rate',
    what: 'The Bank of Canada sets its overnight policy rate.',
    why: 'It moves Canadian mortgage rates, the loonie and bank and real-estate stocks.' },
  { key: 'cpi', country: 'US', titles: ['Inflation Rate YoY'], also: [['Core Inflation Rate YoY', 'Core (no food or energy)']], name: 'US inflation (CPI)', tier: 'big', group: 'Inflation', icon: 'fa-cart-shopping', dir: 'heat', fmt: 'pct',
    what: 'How much consumer prices rose over the past 12 months.',
    why: 'Hotter inflation makes rate cuts less likely, which usually weighs on stocks and bonds.' },
  { key: 'pce', country: 'US', titles: ['Core PCE Price Index YoY', 'Core PCE Price Index MoM', 'PCE Price Index YoY'], also: [['PCE Price Index YoY', 'Headline PCE, past year'], ['Personal Spending MoM', 'Consumer spending, month']], name: 'The Fed’s favourite inflation gauge (PCE)', tier: 'big', group: 'Inflation', icon: 'fa-gauge-high', dir: 'heat', fmt: 'pct',
    what: 'Price changes across everything households buy, the measure the Fed targets at 2%.',
    why: 'It tells you how close the Fed is to its goal, and so how close rate cuts or hikes are.' },
  { key: 'ppi', country: 'US', titles: ['PPI MoM'], name: 'Wholesale prices (PPI)', tier: 'watch', group: 'Inflation', icon: 'fa-industry', dir: 'heat', fmt: 'pctchg',
    what: 'Prices businesses pay each other, a month earlier.',
    why: 'An early hint of where consumer prices are heading.' },
  { key: 'nfp', country: 'US', titles: ['Non Farm Payrolls'], also: [['Unemployment Rate', 'Unemployment rate'], ['Average Hourly Earnings YoY', 'Wage growth, past year']], name: 'US jobs report', tier: 'big', group: 'Jobs', icon: 'fa-briefcase', dir: 'strong', fmt: 'jobs',
    what: 'Jobs added last month, plus the unemployment rate and wage growth.',
    why: 'The single most watched monthly number. Too strong can mean higher rates for longer; too weak raises recession worries.' },
  { key: 'claims', country: 'US', titles: ['Initial Jobless Claims'], name: 'Weekly jobless claims', tier: 'watch', group: 'Jobs', icon: 'fa-user-minus', dir: 'weak', fmt: 'k',
    what: 'How many people filed for unemployment benefits for the first time last week.',
    why: 'The fastest read on layoffs. A steady climb is an early warning sign.' },
  { key: 'jolts', country: 'US', titles: ['JOLTs Job Openings'], name: 'Job openings (JOLTS)', tier: 'watch', group: 'Jobs', icon: 'fa-door-open', dir: 'strong', fmt: 'm',
    what: 'Unfilled job openings across the US.',
    why: 'Shows whether employers are still hiring or pulling back.' },
  { key: 'gdp', country: 'US', titles: ['GDP Growth Rate QoQ Adv', 'GDP Growth Rate QoQ Second Est', 'GDP Growth Rate QoQ Final', 'GDP Growth Rate QoQ'], name: 'US economic growth (GDP)', tier: 'big', group: 'Growth', icon: 'fa-chart-line', dir: 'strong', fmt: 'pct',
    what: 'How fast the US economy grew last quarter, at an annual pace.',
    why: 'The broadest scorecard of the economy. Two negative quarters in a row is the textbook recession.' },
  { key: 'retail', country: 'US', titles: ['Retail Sales MoM'], name: 'US retail sales', tier: 'watch', group: 'Consumers', icon: 'fa-bag-shopping', dir: 'strong', fmt: 'pctchg',
    what: 'Change in spending at stores and online last month.',
    why: 'Consumers drive about two-thirds of the economy, so this is a direct read on demand.' },
  { key: 'ism', country: 'US', titles: ['ISM Manufacturing PMI'], name: 'Factory activity (ISM)', tier: 'watch', group: 'Business', icon: 'fa-gears', dir: 'strong', fmt: 'index',
    what: 'A survey of factory managers. Above 50 means activity is growing.',
    why: 'One of the first readings each month on how businesses are doing.' },
  { key: 'isms', country: 'US', titles: ['ISM Services PMI'], name: 'Services activity (ISM)', tier: 'watch', group: 'Business', icon: 'fa-store', dir: 'strong', fmt: 'index',
    what: 'The same survey for service businesses, most of the US economy. Above 50 means growth.',
    why: 'Services drive jobs and spending, so weakness here matters more than in factories.' },
  { key: 'umich', country: 'US', titles: ['Michigan Consumer Sentiment Prel', 'Michigan Consumer Sentiment Final'], name: 'Consumer sentiment', tier: 'watch', group: 'Consumers', icon: 'fa-face-smile', dir: 'strong', fmt: 'index',
    what: 'How confident Americans feel about their finances and the economy.',
    why: 'Gloomy shoppers tend to spend less in the months that follow.' },
  { key: 'conf', country: 'US', titles: ['CB Consumer Confidence'], name: 'Consumer confidence', tier: 'watch', group: 'Consumers', icon: 'fa-face-smile', dir: 'strong', fmt: 'index',
    what: 'The Conference Board’s survey of how households see jobs and business conditions.',
    why: 'A second read on consumer mood, with more weight on the job market.' },
  { key: 'homes', country: 'US', titles: ['Existing Home Sales'], name: 'Existing home sales', tier: 'watch', group: 'Housing', icon: 'fa-house', dir: 'strong', fmt: 'm-homes',
    what: 'Previously owned homes sold last month, at an annual pace.',
    why: 'Shows how mortgage rates are hitting the housing market.' },
  { key: 'starts', country: 'US', titles: ['Housing Starts'], name: 'New home construction', tier: 'watch', group: 'Housing', icon: 'fa-helmet-safety', dir: 'strong', fmt: 'm-homes',
    what: 'New homes builders started last month, at an annual pace.',
    why: 'Matters for builders, building materials and the wider economy.' },
  { key: 'durable', country: 'US', titles: ['Durable Goods Orders MoM'], name: 'Big-ticket orders (durable goods)', tier: 'watch', group: 'Business', icon: 'fa-truck', dir: 'strong', fmt: 'pctchg',
    what: 'Orders for long-lasting goods like machinery, cars and aircraft.',
    why: 'A hint at how much companies plan to invest.' },
  { key: 'minutes', country: 'US', titles: ['FOMC Minutes'], name: 'Fed meeting minutes', tier: 'watch', group: 'Interest rates', icon: 'fa-file-lines', dir: 'none',
    what: 'Notes from the Fed’s last meeting, released three weeks later.',
    why: 'Reveals how many officials lean toward cutting or raising rates.' },
  { key: 'chair', country: 'US', match: /^Fed Chair .* (Speech|Testimony)$/, name: 'Fed Chair speaks', tier: 'watch', group: 'Interest rates', icon: 'fa-microphone', dir: 'none',
    what: 'A public speech or testimony by the head of the Federal Reserve.',
    why: 'Any hint about the next rate move can shift markets within minutes.' },
  { key: 'election', country: 'US', match: /Elections?$/, name: 'US election day', tier: 'big', group: 'Politics', icon: 'fa-check-to-slot', dir: 'none',
    what: 'Voters choose members of Congress and other offices.',
    why: 'Control of Congress shapes taxes, spending and regulation, so results can move sectors and the dollar.' },
  { key: 'cacpi', country: 'CA', titles: ['Inflation Rate YoY'], also: [['Core Inflation Rate YoY', 'Core (no food or energy)']], name: 'Canada inflation (CPI)', tier: 'big', group: 'Inflation', icon: 'fa-cart-shopping', dir: 'heat', fmt: 'pct',
    what: 'How much Canadian consumer prices rose over the past 12 months.',
    why: 'The main input to the Bank of Canada’s next rate decision.' },
  { key: 'cajobs', country: 'CA', titles: ['Employment Change'], also: [['Unemployment Rate', 'Unemployment rate']], name: 'Canada jobs report', tier: 'big', group: 'Jobs', icon: 'fa-briefcase', dir: 'strong', fmt: 'jobs',
    what: 'Jobs added in Canada last month, and the unemployment rate.',
    why: 'Moves the loonie and expectations for Bank of Canada rates.' },
  { key: 'cagdp', country: 'CA', titles: ['GDP MoM', 'GDP Growth Rate QoQ'], name: 'Canada economic growth (GDP)', tier: 'watch', group: 'Growth', icon: 'fa-chart-line', dir: 'strong', fmt: 'pctchg',
    what: 'How fast Canada’s economy grew.',
    why: 'Tells you whether Canada is gaining speed or sliding toward recession.' },
  { key: 'caretail', country: 'CA', titles: ['Retail Sales MoM', 'Retail Sales MoM Final'], name: 'Canada retail sales', tier: 'watch', group: 'Consumers', icon: 'fa-bag-shopping', dir: 'strong', fmt: 'pctchg',
    what: 'Change in Canadian store and online sales.',
    why: 'A direct read on Canadian household spending.' },
];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calendar parts of an instant in New York time. */
function et(isoStr) {
  const d = new Date(isoStr);
  // Date-only events (elections, holidays) arrive as midnight UTC: keep their calendar day.
  if (/T00:00:00(\.000)?Z$/.test(isoStr)) { const day = isoStr.slice(0, 10); return { day, hour: 0, minute: 0, weekday: WD[d.getUTCDay()] }; }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
}
const dayLabel = (day) => { const d = new Date(day + 'T12:00:00Z'); return `${WD[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const timeLabel = (h, m) => (h === 0 && m === 0 ? 'All day' : `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} ET`);
const mondayOf = (day) => { const d = new Date(day + 'T12:00:00Z'); const w = (d.getUTCDay() + 6) % 7; return new Date(+d - w * 864e5).toISOString().slice(0, 10); };

export function fmtValue(v, e, fmt) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  v = Number(v);
  const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');
  switch (fmt) {
    case 'rate': return `${v.toFixed(2)}%`;
    case 'pct': return `${v.toFixed(1)}%`;
    case 'pctchg': return `${sign(v)}${Math.abs(v).toFixed(1)}%`;
    case 'jobs': return `${sign(v)}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}K jobs`;
    case 'k': return `${Math.round(v)}K`;
    case 'm': return `${v.toFixed(2)}M`;
    case 'm-homes': return e.scale === 'K' ? `${(v / 1000).toFixed(2)}M` : `${v.toFixed(2)}M`;
    case 'index': return v.toFixed(1);
    default: return `${v}${e.unit === '%' ? '%' : e.scale || ''}`;
  }
}

/** Compare actual vs forecast in words a non-economist can use. */
function verdict(c, a, f, p) {
  if (c.dir === 'rate') {
    const base = a ?? f;
    if (a != null && p != null) return a < p ? { tone: 'down', text: `Cut to ${a.toFixed(2)}%` } : a > p ? { tone: 'up', text: `Raised to ${a.toFixed(2)}%` } : { tone: 'flat', text: `Held at ${a.toFixed(2)}%` };
    if (f != null && p != null) return { tone: 'pending', text: f < p ? `Expected: a cut to ${f.toFixed(2)}%` : f > p ? `Expected: a hike to ${f.toFixed(2)}%` : `Expected: hold at ${p.toFixed(2)}%` };
    if (p != null) return { tone: 'pending', text: `Current rate ${p.toFixed(2)}%` };
    return base == null ? null : null;
  }
  if (a == null || f == null || c.dir === 'none') return null;
  const diff = a - f;
  const tol = Math.max(Math.abs(f) * 0.005, c.fmt === 'pct' || c.fmt === 'pctchg' ? 0.05 : 0.0001);
  if (Math.abs(diff) <= tol) return { tone: 'flat', text: 'In line with forecast' };
  const above = diff > 0;
  if (c.dir === 'heat') return above ? { tone: 'hot', text: 'Hotter than expected' } : { tone: 'cool', text: 'Cooler than expected' };
  if (c.dir === 'weak') return above ? { tone: 'bad', text: 'Weaker than expected' } : { tone: 'good', text: 'Stronger than expected' };
  return above ? { tone: 'good', text: 'Stronger than expected' } : { tone: 'bad', text: 'Weaker than expected' };
}

/** "Sep" -> "Sep data", "Oct/17" -> "week to Oct 17", plus what the number measures. */
function periodLabel(e) {
  let p = e.period || '';
  const wk = /^([A-Z][a-z]{2})\/(\d{2})$/.exec(p);
  if (wk) p = `week to ${wk[1]} ${Number(wk[2])}`;
  else if (/^([A-Z][a-z]{2}|Q[1-4])$/.test(p)) p = `${p} data`;
  const m = / YoY$/.test(e.title) ? 'past 12 months' : / MoM( |$)/.test(e.title) ? 'vs. prior month' : / QoQ/.test(e.title) ? 'annual pace' : '';
  return [p, m].filter(Boolean).join(' · ');
}

function pick(c, e) {
  if (e.country !== c.country) return -1;
  if (c.match) return c.match.test(e.title) ? 0 : -1;
  return c.titles.indexOf(e.title);
}

/**
 * @param {object} cal data/calendar.json
 * @param {{now?: Date, stockByTicker?: Map}} opts
 */
export function buildCalendar(cal, { now = new Date(), stockByTicker = new Map() } = {}) {
  if (!cal) return null;
  const today = et(now.toISOString()).day;
  const thisMon = mondayOf(today);
  const nextMon = new Date(Date.parse(thisMon + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10);
  const weekAfter = new Date(Date.parse(thisMon + 'T12:00:00Z') + 14 * 864e5).toISOString().slice(0, 10);

  // ---- Economic events: one row per release, using the catalog's primary series. ----
  const econ = cal.econ || [];
  const rows = [];
  for (const c of CATALOG) {
    const hits = econ.map((e) => [pick(c, e), e]).filter(([i]) => i > -1);
    // Group by release day; keep the best-ranked title of each release.
    const byDay = new Map();
    for (const [rank, e] of hits) {
      const t = et(e.date);
      const k = t.day + (c.key === 'claims' ? '' : '');
      const cur = byDay.get(k);
      if (!cur || rank < cur.rank) byDay.set(k, { rank, e, t });
    }
    for (const { e, t } of byDay.values()) {
      const also = (c.also || [])
        .map(([title, label]) => {
          const x = econ.find((y) => y.country === c.country && y.title === title && et(y.date).day === t.day);
          if (!x || title === e.title) return null;
          const f = title.includes('Unemployment') || title.includes('Earnings') || title.includes('Inflation') || title.includes('PCE') ? 'pct' : title.includes('Spending') ? 'pctchg' : c.fmt;
          return { label, actual: fmtValue(x.actual, x, f), forecast: fmtValue(x.forecast, x, f), previous: fmtValue(x.previous, x, f) };
        })
        .filter(Boolean);
      const a = e.actual, f = e.forecast, p = e.previous;
      rows.push({
        key: c.key, id: e.id, country: c.country, name: c.name, tier: c.tier, group: c.group, icon: c.icon, what: c.what, why: c.why,
        period: periodLabel(e), title: e.title, iso: e.date, day: t.day, dayLabel: dayLabel(t.day), time: timeLabel(t.hour, t.minute), sort: e.date,
        released: a != null || (c.dir === 'none' && t.day < today),
        actual: fmtValue(a, e, c.fmt), forecast: fmtValue(f, e, c.fmt), previous: fmtValue(p, e, c.fmt),
        verdict: verdict(c, a, f, p), also,
      });
    }
  }
  rows.sort((x, y) => x.sort.localeCompare(y.sort) || (x.tier === 'big' ? -1 : 1));

  const upcoming = rows.filter((r) => r.day >= today && !r.released);
  const recent = rows.filter((r) => r.day < today || r.released).filter((r) => r.day >= new Date(Date.parse(today + 'T12:00:00Z') - 9 * 864e5).toISOString().slice(0, 10)).reverse();
  const weeks = [
    { key: 'this', label: 'This week', from: thisMon, to: nextMon },
    { key: 'next', label: 'Next week', from: nextMon, to: weekAfter },
    { key: 'later', label: 'Later', from: weekAfter, to: '9999' },
  ].map((w) => ({ ...w, range: rangeLabel(w.from, w.to), events: upcoming.filter((r) => r.day >= w.from && r.day < w.to && (w.key !== 'later' || r.tier === 'big')) }))
    .filter((w) => w.events.length);

  // ---- Earnings: big companies plus anything our fund managers own. ----
  const earn = (cal.earnings || []).map((r) => {
    const s = stockByTicker.get(r.ticker);
    return { ...r, owners: s?.owners || 0, slug: s?.hasPage ? s.slug : null, stockName: s?.name || null };
  });
  // One row per company (GOOG and GOOGL report together).
  const seen = new Map();
  for (const r of earn) {
    const k = r.date + '|' + r.name.toLowerCase().replace(/[^a-z]/g, '').replace(/(class[abc]|inc|corp|corporation|plc|ltd|co)$/g, '');
    const cur = seen.get(k);
    if (!cur || r.owners > cur.owners || (r.owners === cur.owners && r.slug && !cur.slug)) seen.set(k, r);
  }
  earn.splice(0, earn.length, ...seen.values());
  const major = (r) => (r.marketCap || 0) >= 50e9 || (r.owners >= 2 && (r.marketCap || 0) >= 10e9);
  const upcomingEarn = earn.filter((r) => r.date >= today && major(r)).sort((a, b) => a.date.localeCompare(b.date) || timeRank(a) - timeRank(b) || (b.marketCap || 0) - (a.marketCap || 0));
  const earnWeeks = [];
  for (const r of upcomingEarn) {
    const wk = mondayOf(r.date);
    let w = earnWeeks.find((x) => x.monday === wk);
    if (!w) { w = { monday: wk, label: wk === thisMon ? 'This week' : wk === nextMon ? 'Next week' : `Week of ${dayLabel(wk).slice(4)}`, days: [] }; earnWeeks.push(w); }
    let d = w.days.find((x) => x.day === r.date);
    if (!d) { d = { day: r.date, label: dayLabel(r.date), items: [] }; w.days.push(d); }
    d.items.push(r);
  }
  for (const w of earnWeeks) for (const d of w.days) d.items.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
  const reported = earn.filter((r) => r.date < today && major(r) && r.eps != null).sort((a, b) => b.date.localeCompare(a.date) || (b.marketCap || 0) - (a.marketCap || 0));
  const nextByTicker = new Map();
  for (const r of earn.filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date))) if (!nextByTicker.has(r.ticker)) nextByTicker.set(r.ticker, { date: r.date, label: dayLabel(r.date), time: r.time, epsForecast: r.epsForecast });

  return {
    updatedAt: cal.updatedAt,
    today,
    todayLabel: dayLabel(today),
    weeks,
    recent,
    nextBig: upcoming.filter((r) => r.tier === 'big').slice(0, 4),
    earnings: {
      weeks: earnWeeks.slice(0, 5),
      count: upcomingEarn.length,
      thisWeek: upcomingEarn.filter((r) => r.date < nextMon).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)),
      reported: reported.slice(0, 12),
      nextByTicker,
    },
  };
}

const timeRank = (r) => (r.time === 'bmo' ? 0 : r.time === 'amc' ? 2 : 1);
function rangeLabel(from, to) {
  if (to === '9999') return '';
  const end = new Date(Date.parse(to + 'T12:00:00Z') - 3 * 864e5).toISOString().slice(0, 10);
  const a = new Date(from + 'T12:00:00Z'), b = new Date(end + 'T12:00:00Z');
  return a.getUTCMonth() === b.getUTCMonth() ? `${MON[a.getUTCMonth()]} ${a.getUTCDate()}–${b.getUTCDate()}` : `${MON[a.getUTCMonth()]} ${a.getUTCDate()} – ${MON[b.getUTCMonth()]} ${b.getUTCDate()}`;
}
