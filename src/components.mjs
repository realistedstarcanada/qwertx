import { esc, money, int, pct, signedPct, date, quarter } from './lib/format.mjs';
import { squarify } from './lib/treemap.mjs';

/* ---------- Market mood gauge ---------- */
const BANDS = [
  [0, 25, '#f2766b', 'Extreme fear'],
  [25, 45, '#f0a35e', 'Fear'],
  [45, 55, '#8d97ad', 'Neutral'],
  [55, 75, '#7fd8c4', 'Greed'],
  [75, 100, '#2fd4b5', 'Extreme greed'],
];
const pt = (s, r) => {
  const a = Math.PI - (s / 100) * Math.PI;
  return [100 + r * Math.cos(a), 100 - r * Math.sin(a)].map((n) => n.toFixed(2));
};

export function gauge(market) {
  const score = market?.score ?? null;
  const arcs = BANDS.map(([a, b, color]) => {
    const [x1, y1] = pt(a + 0.6, 78);
    const [x2, y2] = pt(b - 0.6, 78);
    return `<path d="M${x1} ${y1} A78 78 0 0 1 ${x2} ${y2}" stroke="${color}" stroke-width="18" fill="none"/>`;
  }).join('');
  const ticks = [0, 25, 50, 75, 100]
    .map((s) => {
      const [x, y] = pt(s, 58);
      return `<text x="${x}" y="${Number(y) + 3}" text-anchor="middle" font-size="7" fill="#66718a" font-family="IBM Plex Mono, monospace">${s}</text>`;
    })
    .join('');
  const cmp = (label, v, f) =>
    `<div><span class="num" data-f="${f}">${v ?? '—'}</span><span>${label}</span></div>`;
  return `<section class="card mood" data-mood data-score="${score ?? 50}" aria-labelledby="mood-h">
  <div class="mood-head"><h2 id="mood-h">Market mood</h2><span class="eyebrow">Fear &amp; Greed</span></div>
  <svg viewBox="0 0 200 112" role="img" aria-label="Fear and Greed gauge">
    ${arcs}${ticks}
    <text x="14" y="110" font-size="8" fill="#f2766b" font-family="IBM Plex Sans, sans-serif">Fear</text>
    <text x="186" y="110" font-size="8" fill="#2fd4b5" text-anchor="end" font-family="IBM Plex Sans, sans-serif">Greed</text>
    <g class="needle" style="transform: rotate(${(((score ?? 50) / 100) * 180 - 90).toFixed(1)}deg)">
      <path d="M98 100 L100 32 L102 100 Z" fill="#e9ecf3"/>
    </g>
    <circle cx="100" cy="100" r="6" fill="#e9ecf3"/><circle cx="100" cy="100" r="2.5" fill="#080c17"/>
  </svg>
  <div class="mood-score"><span class="value" data-f="score">${score ?? '—'}</span><span class="label" data-f="rating">${esc(market?.rating ?? 'Loading…')}</span></div>
  <div class="mood-compare">${cmp('Prev close', market?.previousClose, 'prev')}${cmp('1 week ago', market?.previousWeek, 'week')}${cmp('1 month ago', market?.previousMonth, 'month')}</div>
  <p class="mood-foot" data-f="asof">${market ? `Snapshot ${esc(date(market.asOf))} · CNN Fear &amp; Greed Index` : 'CNN Fear &amp; Greed Index'}</p>
</section>`;
}

/* ---------- Small pieces ---------- */
export const tickerChip = (h) =>
  h.ticker ? `<span class="tk">${esc(h.ticker)}</span>` : `<span class="tk none" title="CUSIP ${esc(h.cusip)}">—</span>`;

export const optBadge = (h) => (h.putCall ? ` <span class="badge opt">${h.putCall === 'CALL' ? 'Call' : 'Put'}</span>` : '');

export function statusCell(h) {
  const v =
    h.status === 'new' ? 1000 : h.status === 'added' || h.status === 'reduced' ? (h.sharesChangePct ?? 0) * 100 : 0;
  let inner = '<span class="faint">—</span>';
  if (h.status === 'new') inner = '<span class="badge new">New</span>';
  else if (h.status === 'added') inner = `<span class="badge added">Added</span> <span class="up">${signedPct(h.sharesChangePct)}</span>`;
  else if (h.status === 'reduced') inner = `<span class="badge reduced">Trimmed</span> <span class="down">${signedPct(h.sharesChangePct)}</span>`;
  else if (h.status === 'unchanged') inner = '<span class="badge unchanged">No change</span>';
  return `<td class="r" data-v="${v.toFixed(2)}">${inner}</td>`;
}

export const stockLink = (h, text) =>
  h.hasPage === false ? esc(text) : `<a href="/stocks/${esc(h.slug)}/">${esc(text)}</a>`;

export function weightBar(w, max) {
  const width = Math.max(2, Math.round((w / (max || 1)) * 100));
  return `<span class="wbar"><span class="track"><i style="width:${width}%"></i></span>${pct(w)}</span>`;
}

/* ---------- Treemap ---------- */
export function treemap(holdings, limit = 30) {
  const top = holdings.slice(0, limit).filter((h) => h.value > 0);
  const rest = holdings.slice(limit);
  const items = top.map((h) => ({ hold: h, value: h.value }));
  const restVal = rest.reduce((s, h) => s + h.value, 0);
  if (restVal > 0) items.push({ other: rest.length, value: restVal, weight: rest.reduce((s, h) => s + h.weight, 0) });
  const W = 500;
  const H = 300;
  const tiles = squarify(items, 0, 0, W, H)
    .map((t) => {
      const size = t.w < 36 || t.h < 26 ? 'xs' : t.w < 70 || t.h < 46 ? 'sm' : '';
      const style = `left:${((t.x / W) * 100).toFixed(3)}%;top:${((t.y / H) * 100).toFixed(3)}%;width:${((t.w / W) * 100).toFixed(3)}%;height:${((t.h / H) * 100).toFixed(3)}%`;
      if (t.other) {
        return `<div class="tile s-other ${size}" style="${style}" title="${t.other} smaller positions · ${pct(t.weight)}"><span class="t">+${t.other} more</span><span class="w">${pct(t.weight)}</span></div>`;
      }
      const h = t.hold;
      const label = h.ticker || h.name.split(' ')[0];
      const title = `${h.name}${h.putCall ? ` (${h.putCall.toLowerCase()})` : ''} · ${pct(h.weight)} · ${money(h.value)}`;
      const tag = h.hasPage === false ? 'div' : 'a';
      const href = h.hasPage === false ? '' : ` href="/stocks/${esc(h.slug)}/"`;
      return `<${tag} class="tile s-${h.status || 'unknown'} ${size}"${href} style="${style}" title="${esc(title)}"><span class="t">${esc(label)}${h.putCall ? ' ⓞ' : ''}</span><span class="w">${pct(h.weight)}</span></${tag}>`;
    })
    .join('');
  return `<div class="treemap" role="img" aria-label="Portfolio map: tile size shows each position's share of the portfolio">${tiles}</div>
<div class="legend"><span><i style="background:#127a68"></i>New position</span><span><i style="background:#0f5a50"></i>Added</span><span><i style="background:#1f2c47"></i>No change</span><span><i style="background:#6b2e2b"></i>Trimmed</span><span>ⓞ Options position</span></div>`;
}

/* ---------- Holdings table ---------- */
export function holdingsTable(p, id = 'holdings') {
  const max = p.holdings[0]?.weight || 1;
  const rows = p.holdings
    .map(
      (h, i) => `<tr>
  <td class="r faint hide-sm" data-v="${i + 1}">${i + 1}</td>
  <td data-v="${esc(h.name)}"><div class="cell-name">${tickerChip(h)}<div>${stockLink(h, h.name)}${optBadge(h)}<small>${esc(h.cls || '')}</small></div></div></td>
  <td class="r" data-v="${h.weight}">${weightBar(h.weight, max)}</td>
  <td class="r hide-sm" data-v="${h.shares}">${int(h.shares)}</td>
  <td class="r" data-v="${h.value}">${money(h.value)}</td>
  ${statusCell(h)}
</tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table class="data" id="${id}" data-sortable>
<thead><tr><th class="r hide-sm" data-sort="num">#</th><th data-sort="text">Stock</th><th class="r" data-sort="num">% of portfolio</th><th class="r hide-sm" data-sort="num">Shares</th><th class="r" data-sort="num">Value</th><th class="r" data-sort="num">vs ${quarter(p.prevPeriod)}</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

export function soldTable(p) {
  if (!p.sold.length) return '';
  const rows = p.sold
    .sort((a, b) => b.prevValue - a.prevValue)
    .map(
      (h) => `<tr>
  <td><div class="cell-name">${tickerChip(h)}<div>${stockLink(h, h.name)}${optBadge(h)}</div></div></td>
  <td class="r" data-v="${h.prevWeight}">${pct(h.prevWeight)}</td>
  <td class="r hide-sm" data-v="${h.prevShares}">${int(h.prevShares)}</td>
  <td class="r" data-v="${h.prevValue}">${money(h.prevValue)}</td>
</tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table class="data" data-sortable>
<thead><tr><th data-sort="text">Stock</th><th class="r" data-sort="num">Was % of portfolio</th><th class="r hide-sm" data-sort="num">Shares sold</th><th class="r" data-sort="num">Value in ${quarter(p.prevPeriod)}</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

/* ---------- Investor card ---------- */
export function investorCard(inv) {
  const p = inv.portfolio;
  if (!p) {
    return `<div class="card inv-card"><div><h3>${esc(inv.manager)}</h3><div class="firm">${esc(inv.firm)}</div></div><p class="pending">First data update pending</p></div>`;
  }
  const top = p.holdings.slice(0, 5);
  return `<a class="card inv-card" href="/investors/${esc(inv.slug)}/">
  <div><h3>${esc(inv.manager)}</h3><div class="firm">${esc(inv.firm)} · ${esc(inv.style || '')}</div></div>
  <div class="spark" title="Top 5 positions">${top.map((h) => `<i style="width:${(h.weight * 100).toFixed(2)}%"></i>`).join('')}</div>
  <div class="tops">${top.slice(0, 4).map((h) => tickerChip(h)).join('')}</div>
  <div class="row"><span>Portfolio</span><b>${money(p.totalValue)}</b></div>
  <div class="row"><span>Positions · ${quarter(p.period)}</span><b>${p.holdingsCount}</b></div>
</a>`;
}

/* ---------- Ranked list with dot meter ---------- */
export function rankList(items, { count, max, kind = '', sub }) {
  if (!items.length) return '<p class="muted">Nothing to show yet.</p>';
  return `<ol class="rank-list">${items
    .map((s, i) => {
      const n = count(s);
      const dots = Array.from({ length: Math.min(max, 12) }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
      return `<li><span class="rank-n">${String(i + 1).padStart(2, '0')}</span>
  <span class="rank-name">${s.slug ? `<a href="/stocks/${esc(s.slug)}/">${esc(s.name)}</a>` : `<span>${esc(s.name)}</span>`}<small>${s.ticker ? esc(s.ticker) + ' · ' : ''}${sub(s)}</small></span>
  <span class="rank-meter"><span class="dots ${kind}" aria-hidden="true">${dots}</span><span class="num">${n}</span></span></li>`;
    })
    .join('')}</ol>`;
}

/* ---------- News ---------- */
export function newsItems(items) {
  return `<ul class="news-list">${items
    .map(
      (n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener nofollow">${esc(n.title)}</a>
  <div class="news-meta"><span class="src">${esc(n.source)}</span>${n.published ? `<time data-rel datetime="${esc(n.published)}">${esc(date(n.published))}</time>` : ''}</div></li>`,
    )
    .join('')}</ul>`;
}
