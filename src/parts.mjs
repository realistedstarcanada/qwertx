// Reusable building blocks in the original QWERTx markup.
import { esc, money, pct, date, quarter, signed, upDown, int } from './lib/format.mjs';

export const chart = (id, type, data, { cls = 'chart', style = '', label = '' } = {}) =>
  `<div id="${id}" class="${cls}"${style ? ` style="${style}"` : ''} role="img" aria-label="${esc(label)}"></div>
<script>window.QX_CHARTS=window.QX_CHARTS||[];QX_CHARTS.push(${JSON.stringify({ el: id, type, data }).replace(/</g, '\\u003c')});</script>`;

export const tkr = (label, slug) => (slug ? `<a class="tkr" href="/stocks/${esc(slug)}.html">${esc(label)}</a>` : `<span class="tkr">${esc(label)}</span>`);

export const actBadge = (act) => {
  const m = { New: ['act-new', 'New'], Add: ['act-add', 'Added'], Trim: ['act-trim', 'Trimmed'], Hold: ['act-hold', 'Hold'], Sold: ['act-trim', 'Sold out'] };
  const [c, l] = m[act] || m.Hold;
  return `<span class="act ${c}">${l}</span>`;
};

export const wbar = (w, max = 100, px = 60) => `<span class="wbar" style="width:${Math.max(2, Math.round((w / (max || 1)) * px))}px"></span>`;

export const sourceChip = (html, icon = 'fa-shield-halved') => `<span class="source-chip"><i class="fa-solid ${icon}" aria-hidden="true"></i>${html}</span>`;

export function rankList(items) {
  return `<ul class="rank-list">${items
    .map((x, i) => `<li><span class="r">${x.r ?? String(i + 1).padStart(2, '0')}</span><span class="t">${x.t}${x.small ? `<small>${x.small}</small>` : ''}</span><span class="v">${x.v}</span></li>`)
    .join('')}</ul>`;
}

export function invCard(inv, { cls = 'col-3' } = {}) {
  const p = inv.p;
  if (!p) {
    return `<div class="${cls}"><div class="card inv-card reveal"><div class="inv-top"><span class="avatar" aria-hidden="true">${esc(inv.avatar)}</span><div><div class="inv-name">${esc(inv.manager)}</div><div class="inv-firm">${esc(inv.firm)}</div></div></div><p class="form-note">First data update pending.</p></div></div>`;
  }
  const top = p.holdings.slice(0, 3);
  return `<div class="${cls}"><a class="card card-hover inv-card reveal" href="/investors/${esc(inv.slug)}.html" aria-label="${esc(inv.manager)} portfolio">
  <div class="inv-top"><span class="avatar" aria-hidden="true">${esc(inv.avatar)}</span><div><div class="inv-name">${esc(inv.manager)}</div><div class="inv-firm">${esc(inv.firm)}</div></div></div>
  <div class="tags">${(inv.tags || []).slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  <div><div class="meter-row"><span>Conviction</span><b>${p.conviction} · top 10 = ${Math.round(p.top10)}%</b></div><div class="meter"><span style="width:${Math.min(100, Math.round(p.top10))}%"></span></div></div>
  <div class="inv-stats"><span>Portfolio<b>${money(p.totalValue)}</b></span><span>Stocks<b>${p.holdingsCount}</b></span><span>Period<b>${quarter(p.period)}</b></span></div>
  <div class="top3">${top.map((h) => `<span class="chip"><b>${esc(h.label)}</b> ${Math.round(h.w)}%</span>`).join('')}</div>
  <div class="source"><span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Updated on ${date(p.filingDate)}</span><span>View <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></div>
</a></div>`;
}

/* ---------- Fear & Greed (CNN) gauge: the "fear index on top" ---------- */
const FG_BANDS = [[0, 25, '#E5484D', 'Extreme fear'], [25, 45, '#F08A5D', 'Fear'], [45, 55, '#8A93A8', 'Neutral'], [55, 75, '#2DD4BF', 'Greed'], [75, 100, '#14A08F', 'Extreme greed']];
const pt = (s, r) => {
  const a = Math.PI - (s / 100) * Math.PI;
  return [100 + r * Math.cos(a), 100 - r * Math.sin(a)].map((n) => n.toFixed(2));
};
export function fearGreedCard(fg, { compact = false } = {}) {
  const score = fg?.score ?? null;
  const arcs = FG_BANDS.map(([a, b, c]) => {
    const [x1, y1] = pt(a + 0.7, 78);
    const [x2, y2] = pt(b - 0.7, 78);
    return `<path d="M${x1} ${y1} A78 78 0 0 1 ${x2} ${y2}" stroke="${c}" stroke-width="16" fill="none" stroke-linecap="butt"/>`;
  }).join('');
  const ticks = [0, 25, 50, 75, 100].map((s) => {
    const [x, y] = pt(s, 59);
    return `<text x="${x}" y="${(+y + 3).toFixed(1)}" text-anchor="middle" class="fg-tick">${s}</text>`;
  }).join('');
  const cmp = (l, v, f) => `<div><b class="mono" data-f="${f}">${v ?? '—'}</b><span>${l}</span></div>`;
  return `<div class="card fg-card${compact ? ' fg-compact' : ''}" data-fg data-score="${score ?? 50}">
  <div class="card-label"><span>Fear &amp; Greed Index</span><span class="fg-live" data-f="live">${fg ? `Close · ${date((fg.asOf || '').slice(0, 10))}` : 'Loading'}</span></div>
  <svg viewBox="0 0 200 112" class="fg-gauge" role="img" aria-label="Fear and Greed gauge reading ${score ?? 'unknown'}">
    ${arcs}${ticks}
    <g class="fg-needle" style="transform:rotate(${(((score ?? 50) / 100) * 180 - 90).toFixed(1)}deg)"><path d="M98 100 L100 30 L102 100 Z"/></g>
    <circle cx="100" cy="100" r="6.5" class="fg-hub"/><circle cx="100" cy="100" r="2.6" class="fg-hub-dot"/>
  </svg>
  <div class="fg-score"><span class="fg-num mono" data-f="score">${score ?? '—'}</span><span class="fg-rating" data-f="rating">${esc(fg?.rating || 'Loading…')}</span></div>
  <div class="fg-compare">${cmp('Prev close', fg?.previousClose, 'prev')}${cmp('1 week', fg?.previousWeek, 'week')}${cmp('1 month', fg?.previousMonth, 'month')}${compact ? '' : cmp('1 year', fg?.previousYear, 'year')}</div>
  <span class="source-chip"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Source: CNN Business Fear &amp; Greed Index</span>
</div>`;
}

/* ---------- VIX mood card (original design) ---------- */
export const vixZone = (v) => (v < 12 ? [5, 'Extreme greed'] : v < 15 ? [4, 'Greed'] : v < 20 ? [3, 'Neutral'] : v < 30 ? [2, 'Fear'] : [1, 'Extreme fear']);
const VIX_MEANS = {
  1: 'Panic-level volatility. Prices are swinging hard and investors are paying up for protection.',
  2: 'Investors expect bumpier markets than usual and are buying protection.',
  3: 'Volatility is near its long-run normal. Neither panic nor euphoria is driving prices.',
  4: 'Markets are calm and prices are steady. Investors feel comfortable taking risk.',
  5: 'Unusually calm. Complacency can build when nobody expects turbulence.',
};
export function vixCard(vix) {
  if (!vix) return '<div class="card gauge-card"><div class="card-label"><span>Market mood</span><span>VIX-based</span></div><p class="form-note">VIX data appears after the first market update.</p></div>';
  const [z, label] = vixZone(vix.last);
  const color = z === 3 ? 'var(--text)' : z <= 2 ? 'var(--coral)' : 'var(--teal)';
  return `<div class="card gauge-card">
  <div class="card-label"><span>Market mood</span><span>VIX-based</span></div>
  <div class="mood" style="color:${color}">${label}</div>
  <div class="mono" style="font-size:13px;color:var(--muted)">VIX ${vix.last.toFixed(2)} · close ${date(vix.lastDate)}</div>
  <div class="mood-scale" role="img" aria-label="Fear and greed scale, currently ${label}">${[1, 2, 3, 4, 5].map((i) => `<span class="z${i}${i === z ? ' on' : ''}"></span>`).join('')}</div>
  <div class="mood-legend"><span>Extreme fear</span><span>Neutral</span><span>Extreme greed</span></div>
  <p class="what-means"><b>What it means</b>${VIX_MEANS[z]}</p>
  <span class="source-chip"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Source: <a href="https://fred.stlouisfed.org/series/VIXCLS" target="_blank" rel="noopener">FRED · Cboe VIX</a></span>
</div>`;
}

export function vixChartData(vix) {
  const n = vix.dates.length;
  const from = Math.max(0, n - 253);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lbl = (iso) => `${+iso.slice(8, 10)} ${months[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`;
  return { dates: vix.dates.slice(from).map(lbl), values: vix.values.slice(from) };
}

export function indexCard(m) {
  const idx = m.indexes || [];
  if (!idx.length) return '<div class="card" style="height:100%"><div class="card-label"><span>Index close</span></div><p class="form-note">Index data appears after the first market update.</p></div>';
  const n2 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const week = idx.slice(0, 3).map((x) => `${x.name.split(' ')[0]} ${signed(x.week * 100, 1)}`).join(' · ');
  const extras = [
    m.rates?.tenYear && `10-year Treasury ${m.rates.tenYear.value.toFixed(2)}%`,
    m.commodities?.wti && `WTI $${n2(m.commodities.wti.value)}`,
    m.commodities?.brent && `Brent $${n2(m.commodities.brent.value)}`,
    m.commodities?.gold && `Gold $${Math.round(m.commodities.gold.value).toLocaleString('en-US')}`,
  ].filter(Boolean);
  return `<div class="card" style="height:100%"><div class="card-label"><span>Close · ${date(idx[0].date)}</span><span>Week: ${week}</span></div><h3>Where the major indexes closed</h3><div class="idx-row">${idx
    .map((x) => `<div class="idx"><div class="n">${esc(x.name)}</div><div class="v">${n2(x.value)}</div><div class="c ${upDown(x.change)}">${signed(x.change * 100, 2)}</div></div>`)
    .join('')}</div>${extras.length ? `<p class="mt-32 mb-0" style="font-size:14px;color:var(--muted)">${extras.join(' · ')}. Sources: FRED, Stooq.</p>` : ''}</div>`;
}

export const newsletter = (id = 'n') => `<section class="section-sm">
  <div class="container">
    <div class="card row between center reveal" style="padding:40px">
      <div class="col" style="min-width:280px">
        <div class="eyebrow">Quarterly briefing</div>
        <h2 style="font-size:clamp(26px,3vw,36px)">Get the 5-minute smart money briefing</h2>
        <p class="mb-0" style="color:var(--muted)">One email when the new 13F filings land: who bought, who sold, what politicians and insiders did, and what it might mean. No spam, unsubscribe anytime.</p>
      </div>
      <div class="col" style="min-width:300px">
        <form class="form" data-form="newsletter">
          <div class="form-fields form">
            <div class="field"><label for="${id}-email">Email address</label><input class="input" id="${id}-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><div class="field-error" id="${id}-email-error">Enter a valid email address.</div></div>
            <button class="btn btn-gold" type="submit">Send me the briefing <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
            <p class="form-note">By subscribing you agree to our <a href="/privacy.html">Privacy Policy</a>.</p>
          </div>
          <div class="form-success" role="status" tabindex="-1"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>You’re subscribed. The next briefing lands when the new quarter’s filings arrive.</div>
        </form>
      </div>
    </div>
  </div>
</section>`;

export const proCta = `<section class="section">
  <div class="container">
    <div class="cta-band row row-wide center reveal">
      <div class="col-7">
        <div class="eyebrow">Coming soon · QWERTx Pro</div>
        <h2>Professionally managed portfolios, built around your life.</h2>
        <p class="lead">We are building QWERTx Pro: portfolios matched to your risk profile and time horizon, managed by experienced financial advisors. Join the waitlist to hear first when it launches.</p>
        <div class="btn-row mt-32"><a class="btn btn-gold" href="/pro.html#waitlist">Join the Pro waitlist <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="btn btn-ghost" href="/pro.html">How Pro will work</a></div>
      </div>
      <div class="col-5"><img src="/assets/img/pro-hero-sm.jpg" alt="Glass panels of rising height lit in gold and teal, representing portfolios for different risk levels" width="800" height="450" loading="lazy" style="border-radius:16px;border:1px solid var(--line)"></div>
    </div>
  </div>
</section>`;

export const pageHero = ({ crumbs, eyebrow, h1, lead, img, imgAlt, extra = '' }) => `<section class="page-hero">
  <div class="hero-bg grid">${img ? `<img src="/assets/img/${img}" alt="${esc(imgAlt || '')}" width="1672" height="941" fetchpriority="high">` : ''}</div>
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a>${crumbs.map((c, i) => `<span aria-hidden="true">/</span>${i === crumbs.length - 1 ? `<span aria-current="page">${esc(c[0])}</span>` : `<a href="${c[1]}">${esc(c[0])}</a>`}`).join('')}</nav>
    ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
    <h1 class="maxw-760">${h1}</h1>
    ${lead ? `<p class="lead maxw-640">${lead}</p>` : ''}
    ${extra}
  </div>
</section>`;

export const kpi = (k, v, s) => `<div class="kpi reveal"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

export const partyChip = (p) => {
  const k = (p || '').charAt(0);
  const label = k === 'D' ? 'D' : k === 'R' ? 'R' : k === 'I' ? 'I' : '?';
  return `<span class="party party-${label}" title="${esc(p || 'Unknown party')}">${label}</span>`;
};

export const ownersLine = (s, max = 4) => {
  if (!s || !s.holders.length) return '';
  const head = s.holders.slice(0, max).map((x) => `<a href="/investors/${esc(x.inv.slug)}.html">${esc(x.inv.manager)}</a> (${x.w.toFixed(1)}%)`).join(', ');
  return head + (s.holders.length > max ? ` and ${s.holders.length - max} more` : '');
};

export { esc, money, pct, date, quarter, signed, upDown, int };
