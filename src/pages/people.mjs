// Featured politician portfolios: cards for the Politicians page and a full page per person.
import { esc, money, date, int } from '../lib/format.mjs';
import { chart, pageHero, newsletter, partyChip, vRank, tip, kpi } from '../parts.mjs';

const range = (lo, hi, open) => (lo === hi ? `${money(lo)}${open ? '+' : ''}` : `${money(lo)} – ${money(hi)}${open ? '+' : ''}`);
const shortRange = (x) => (x.open ? `Over ${money(x.lo - 1)}` : `${money(x.lo)} – ${money(x.hi)}`);
const tkrLink = (x) => (x.ticker ? (x.slug ? `<a class="tkr" href="/stocks/${esc(x.slug)}.html">${esc(x.ticker)}</a>` : `<span class="tkr">${esc(x.ticker)}</span>`) : '');
const typeBadge = (t) => (t.type === 'buy' ? '<span class="act act-add">Buy</span>' : t.type === 'sell' ? `<span class="act act-trim">${t.partial ? 'Sell (part)' : 'Sell'}</span>` : '<span class="act act-hold">Exchange</span>');

/** Big photo cards at the top of the Politicians page. */
export function featuredCards(people) {
  if (!people.length) return '';
  return `<section class="section-sm fp-section">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:22px"><div><div class="eyebrow">Featured portfolios</div><h2 style="font-size:36px">The most-watched portfolios in Washington</h2></div><p>Everything they own and every trade they report, from official filings. Tap a name for the full portfolio.</p></div>
    <div class="fp-grid">${people.map((p) => {
      // The biggest buys in the latest two months of reports, companies with tickers first.
      const last = p.trades.find((t) => t.type === 'buy')?.date || '';
      const since = last ? new Date(Date.parse(last) - 60 * 864e5).toISOString().slice(0, 10) : '';
      const pool = p.trades.filter((t) => t.type === 'buy' && t.date >= since).sort((a, b) => (b.ticker ? 1 : 0) - (a.ticker ? 1 : 0) || b.lo - a.lo || String(b.date).localeCompare(String(a.date)));
      const recent = [...new Map(pool.map((t) => [t.ticker || t.name, t])).values()].slice(0, 5);
      return `<a class="fp-card reveal" href="/politicians/${esc(p.slug)}.html">
      <div class="fp-top">
        <img class="fp-photo" src="${esc(p.photo)}" alt="${esc(p.name)}" width="120" height="120" loading="lazy">
        <div><div class="fp-name">${esc(p.name)} ${partyChip(p.party)}</div><div class="fp-role">${esc(p.role)}</div>
          <div class="fp-meta">Latest trade report ${p.latestFiled ? esc(date(p.latestFiled)) : '—'}</div></div>
      </div>
      <div class="fp-stats">
        <div><span>Reported holdings</span><b>${int(p.holdingsTotal.count)}</b><small>${p.asOf ? 'as of ' + esc(p.asOf) : ''}</small></div>
        <div><span>Total value</span><b>${range(p.holdingsTotal.lo, p.holdingsTotal.hi, p.holdingsTotal.open)}</b><small>Reported ranges</small></div>
        <div><span>Trades in ${esc(p.tradeStats.year)}</span><b>${int(p.tradeStats.count)}</b><small><span class="up">${int(p.tradeStats.buys)} buys</span> · <span class="down">${int(p.tradeStats.sells)} sells</span></small></div>
      </div>
      ${recent.length ? `<div class="fp-recent"><span>Recently bought</span>${recent.map((t) => `<em>${esc(t.ticker || t.name.replace(/,?\s*(LLC|L\.P\.|Inc\.?)$/i, '').split(' ').slice(0, 3).join(' '))}</em>`).join('')}</div>` : ''}
      <div class="fp-cta">See full portfolio <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></div>
    </a>`;
    }).join('')}</div>
  </div>
</section>`;
}

function holdingsTable(p, limit) {
  const max = Math.max(...p.holdings.map((h) => (h.lo + h.hi) / 2), 1);
  const row = (h, i) => `<tr><td class="num" data-v="${i + 1}">${i + 1}</td><td data-v="${esc(h.name)}">${tkrLink(h)} <span style="color:var(--text);font-weight:600">${esc(h.name)}</span>${h.note ? `<div class="tkr-name">${esc(h.note)}</div>` : ''}</td><td data-v="${esc(h.kindLabel)}">${esc(h.kindLabel)}</td><td class="num" data-v="${h.lo}">${esc(shortRange(h))}</td><td data-v="${h.lo}"><span class="fp-bar" style="width:${Math.max(2, Math.round((((h.lo + h.hi) / 2) / max) * 100))}%"></span></td></tr>`;
  const head = '<thead><tr><th class="num" scope="col">#</th><th scope="col">Holding</th><th scope="col">Type</th><th class="num" scope="col">Value range</th><th scope="col" style="width:22%">Relative size</th></tr></thead>';
  const top = p.holdings.slice(0, limit);
  const rest = p.holdings.slice(limit, 600);
  return `<div class="table-wrap"><table class="data" data-sortable style="min-width:680px"><caption class="sr-only">${esc(p.name)} holdings</caption>${head}<tbody>${top.map(row).join('')}</tbody></table></div>
  ${rest.length ? `<details class="fp-more"><summary>Show ${int(rest.length)} more holdings${p.holdings.length > 600 + limit ? ` (largest ${600 + limit} of ${int(p.holdings.length)})` : ''}</summary><div class="table-wrap"><table class="data" style="min-width:680px">${head}<tbody>${rest.map((h, i) => row(h, i + limit)).join('')}</tbody></table></div></details>` : ''}`;
}

function tradesTable(p, limit) {
  const row = (t) => `<tr><td class="num" data-v="${esc(t.date || '')}">${t.date ? date(t.date) : '—'}${t.approx ? ' <span class="form-note" title="Date or amount read from a scanned page">≈</span>' : ''}</td><td data-v="${t.type}">${typeBadge(t)}</td><td data-v="${esc(t.ticker || t.name)}">${tkrLink(t)} <span style="color:var(--text);font-weight:600">${esc(t.name)}</span>${t.note ? `<div class="tkr-name">${esc(t.note)}</div>` : ''}</td><td>${esc(t.kindLabel)}</td><td class="num" data-v="${t.lo}">${esc(shortRange(t))}</td></tr>`;
  const head = `<thead><tr><th class="num" scope="col">Traded</th><th scope="col">Type</th><th scope="col">Asset</th><th scope="col">Kind</th><th class="num" scope="col">Amount ${tip('range')}</th></tr></thead>`;
  const top = p.trades.slice(0, limit), rest = p.trades.slice(limit, 400);
  return `<div class="table-wrap"><table class="data" data-sortable style="min-width:720px"><caption class="sr-only">Recent trades by ${esc(p.name)}</caption>${head}<tbody>${top.map(row).join('')}</tbody></table></div>
  ${rest.length ? `<details class="fp-more"><summary>Show ${int(rest.length)} more trades</summary><div class="table-wrap"><table class="data" style="min-width:720px">${head}<tbody>${rest.map(row).join('')}</tbody></table></div></details>` : ''}`;
}

export function personPage(d, p) {
  const isTrump = p.slug === 'donald-trump';
  const stocksOnly = p.holdings.filter((h) => h.kind === 'stock');
  const lead = `${p.intro}`;
  const hero = `<div class="fp-hero-id"><img src="${esc(p.photo)}" alt="${esc(p.name)}" width="112" height="112"><div><div class="fp-name">${esc(p.name)} ${partyChip(p.party)}</div><div class="fp-role">${esc(p.role)}</div></div></div>`;
  const body = `${pageHero({
    crumbs: [['Politicians', '/politicians.html'], [p.name]],
    eyebrow: 'Featured portfolio',
    h1: `What ${esc(p.name)} owns <span class="accent">and trades</span>`,
    lead,
    extra: hero,
  })}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">At a glance</h2>
    <div class="row">
      ${kpi('Total reported value', range(p.holdingsTotal.lo, p.holdingsTotal.hi, p.holdingsTotal.open), p.asOf ? `As of ${esc(p.asOf)}` : 'Latest annual report')}
      ${kpi('Holdings', int(p.holdingsTotal.count), `${int(stocksOnly.length)} individual stocks`)}
      ${kpi(`Trades in ${esc(p.tradeStats.year)}`, int(p.tradeStats.count), `<span class="up">${int(p.tradeStats.buys)} buys</span> · <span class="down">${int(p.tradeStats.sells)} sells</span>`)}
      ${kpi(`Bought / sold ${tip('range')}`, `<span class="up">${money(p.tradeStats.buyEst)}</span> / <span class="down">${money(p.tradeStats.sellEst)}</span>`, 'Estimated from reported ranges')}
    </div>
  </div>
</section>
<section class="section-sm" id="portfolio">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:18px"><div><div class="eyebrow">Full portfolio</div><h2 style="font-size:34px">Everything on the latest annual report</h2></div><p>${esc(p.holdingsNote)}</p></div>
    <div class="row">
      <div class="col-4 reveal"><div class="card chart-card" style="height:100%"><div class="card-label"><span>What it’s made of</span><span>Share of value</span></div><h3>Portfolio mix</h3>
        ${chart(`mix-${p.slug}`, 'donut', { items: p.mix.map((m) => [m[0], m[1]]), center: range(p.holdingsTotal.lo, p.holdingsTotal.hi, p.holdingsTotal.open).replace(/\.0(?=[BMK])/g, ''), centerSub: 'reported value' }, { label: `Donut chart of ${p.name}'s portfolio by asset type` })}
        <ul class="fp-mix">${p.mix.map((m, i) => `<li><i style="background:var(--cat-${i + 1}, var(--gold))"></i><span>${esc(m[0])}</span><b>${m[1].toFixed(m[1] < 10 ? 1 : 0)}%</b></li>`).join('')}</ul>
      </div></div>
      <div class="col-8 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Largest holdings</span><span>${p.asOf ? 'As of ' + esc(p.asOf) : ''}</span></div><h3>Top ${Math.min(25, p.holdings.length)} by reported value</h3>
        ${holdingsTable(p, 25)}
        <p class="form-note" style="margin-top:12px">Values are the ranges on the form, not exact amounts. ${p.holdingsSource ? `Source: <a href="${esc(p.holdingsSource.url)}" target="_blank" rel="noopener nofollow">${esc(p.holdingsSource.label)}</a>.` : ''}</p>
      </div></div>
    </div>
  </div>
</section>
<section class="section-sm" id="trades">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:18px"><div><div class="eyebrow">Recent buys and sells</div><h2 style="font-size:34px">What ${esc(p.short)} has been trading</h2></div><p>${esc(p.tradeIntro)}</p></div>
    ${p.topBought.length || p.topSold.length ? `<div class="row" style="margin-bottom:24px">
      <div class="col-6 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Most bought</span><span>${esc(p.tradeStats.year)} · estimated dollars</span></div><h3>Biggest buys</h3>
        ${vRank(p.topBought.slice(0, 10).map((x) => ({ name: x.name, href: x.slug ? `/stocks/${x.slug}.html` : null, sub: `${x.ticker ? esc(x.ticker) + ' · ' : ''}${x.buys} buy${x.buys > 1 ? 's' : ''}`, value: money(x.buyEst) })), { kind: 'buy' })}</div></div>
      <div class="col-6 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Most sold</span><span>${esc(p.tradeStats.year)} · estimated dollars</span></div><h3>Biggest sells</h3>
        ${p.topSold.length ? vRank(p.topSold.slice(0, 10).map((x) => ({ name: x.name, href: x.slug ? `/stocks/${x.slug}.html` : null, sub: `${x.ticker ? esc(x.ticker) + ' · ' : ''}${x.sells} sale${x.sells > 1 ? 's' : ''}`, value: money(x.sellEst) })), { kind: 'sell' }) : '<p class="form-note">No sales reported this year.</p>'}</div></div>
    </div>` : ''}
    ${isTrump && p.byMonth.length ? `<div class="card chart-card reveal" style="margin-bottom:24px"><div class="card-label"><span>Month by month</span><span>Estimated dollars</span></div><h3>Buying vs selling in ${esc(p.tradeStats.year)}</h3>
      ${chart('trump-months', 'split', { labels: p.byMonth.map((m) => m.label), buys: p.byMonth.map((m) => Math.round(m.buyEst)), sells: p.byMonth.map((m) => Math.round(m.sellEst)), money: true, buyLabel: 'Bought', sellLabel: 'Sold' }, { label: 'Bar chart of estimated dollars bought and sold each month' })}
      <div class="legend"><span><i style="background:var(--teal)"></i>Bought</span><span><i style="background:var(--coral)"></i>Sold</span></div>
      ${p.gaps.length ? `<p class="caption"><b>Missing months</b>No report yet for ${esc(p.gaps.join(', '))}. Reports can arrive weeks late.</p>` : ''}
    </div>` : ''}
    <div class="reveal">${tradesTable(p, isTrump ? 40 : 60)}</div>
    <p class="form-note" style="margin-top:14px">${p.tradesSource?.url ? `Source: <a href="${esc(p.tradesSource.url)}" target="_blank" rel="noopener nofollow">${esc(p.tradesSource.label)}</a>. ` : ''}Amounts are reported ranges; dollar totals use the midpoint of each range.</p>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="card reveal"><div class="card-label"><span>Official filings</span><span>${int(p.filings.length)} reports</span></div><h3>Read the original documents</h3>
      <ul class="rank-list">${p.filings.slice(0, 12).map((f) => `<li><span class="t"><a href="${esc(f.url)}" target="_blank" rel="noopener nofollow" style="color:var(--text)">${esc(f.label)}</a><small>Filed ${esc(date(f.filed))}</small></span><span class="v">${int(f.rows || 0)} lines</span></li>`).join('')}</ul>
    </div>
    <p class="form-note" style="margin-top:12px">Photo: ${esc(p.photoCredit)}. Information only, not investment advice. Disclosures arrive weeks after trades, so they show what happened, not what to do next.</p>
  </div>
</section>
${newsletter('fp-' + p.slug)}`;
  return {
    page: 'politicians', path: `/politicians/${p.slug}.html`,
    title: `${p.name} Stock Portfolio and Trades`,
    description: `${p.name}'s full reported portfolio (${int(p.holdingsTotal.count)} holdings) and ${int(p.tradeStats.count)} disclosed trades in ${p.tradeStats.year}: biggest holdings, recent buys and sells, from official filings.`,
    body, charts: true,
  };
}
