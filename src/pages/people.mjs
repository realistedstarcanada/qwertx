// Featured politician portfolios: cards for the Politicians page and a full page per person.
import { esc, money, date, int } from '../lib/format.mjs';
import { chart, pageHero, newsletter, partyChip, vRank, tip, kpi } from '../parts.mjs';

const range = (lo, hi, open) => (lo === hi ? `${money(lo)}${open ? '+' : ''}` : `${money(lo)} – ${money(hi)}${open ? '+' : ''}`);
const shortRange = (x) => (x.open ? `Over ${money(x.lo - 1)}` : `${money(x.lo)} – ${money(x.hi)}`);
const tkrLink = (x) => (x.ticker ? (x.slug ? `<a class="tkr" href="/stocks/${esc(x.slug)}.html">${esc(x.ticker)}</a>` : `<span class="tkr">${esc(x.ticker)}</span>`) : '');
const typeBadge = (t) => (t.type === 'buy' ? '<span class="act act-add">Buy</span>' : t.type === 'sell' ? `<span class="act act-trim">${t.partial ? 'Sell (part)' : 'Sell'}</span>` : '<span class="act act-hold">Exchange</span>');

/** Big photo cards at the top of the Politicians page: who they are and their latest trades. */
export function featuredCards(people) {
  if (!people.length) return '';
  const mini = (t) => `<li><span class="d">${t.date ? esc(date(t.date)) : '—'}</span>${typeBadge(t)}<span class="a"><b>${esc(t.ticker || '')}</b> ${esc(t.name)}${/option/i.test(t.kindLabel) ? ' <small>(options)</small>' : ''}</span><span class="v">${esc(shortRange(t))}</span></li>`;
  return `<section class="section-sm fp-section">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:22px"><div><div class="eyebrow">Featured traders</div><h2 style="font-size:36px">What Trump and Pelosi are trading</h2></div><p>Their latest disclosed buys and sells, read from the official filings and checked line by line. Tap a name for every recent trade.</p></div>
    <div class="fp-grid">${people.map((p) => {
      // Latest trades: newest first, the biggest of each day first.
      const recent = p.trades.filter((t) => t.date && (t.type === 'buy' || t.type === 'sell')).slice().sort((a, b) => b.date.localeCompare(a.date) || b.lo - a.lo).slice(0, 5);
      return `<a class="fp-card reveal" href="/politicians/${esc(p.slug)}.html">
      <div class="fp-top">
        <img class="fp-photo" src="${esc(p.photo)}" alt="${esc(p.name)}" width="120" height="120" loading="lazy">
        <div><div class="fp-name">${esc(p.name)} ${partyChip(p.party)}</div><div class="fp-role">${esc(p.role)}</div></div>
      </div>
      <div class="fp-stats">
        <div><span>Latest report</span><b>${p.latestFiled ? esc(date(p.latestFiled)) : '—'}</b><small>Filed with ${p.slug === 'donald-trump' ? 'OGE' : 'the House'}</small></div>
        <div><span>Trades in ${esc(p.tradeStats.year)}</span><b>${int(p.tradeStats.count)}</b><small><span class="up">${int(p.tradeStats.buys)} buys</span> · <span class="down">${int(p.tradeStats.sells)} sells</span></small></div>
        <div><span>Bought / sold</span><b><span class="up">${money(p.tradeStats.buyEst)}</span> / <span class="down">${money(p.tradeStats.sellEst)}</span></b><small>Estimated</small></div>
      </div>
      ${recent.length ? `<div class="fp-recent-h">Most recent transactions</div><ul class="fp-mini">${recent.map(mini).join('')}</ul>` : ''}
      <div class="fp-cta">See all recent trades <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></div>
    </a>`;
    }).join('')}</div>
  </div>
</section>`;
}

function tradesTable(p, limit) {
  const row = (t) => `<tr><td class="num" data-v="${esc(t.date || '')}">${t.date ? date(t.date) : '—'}${t.approx ? ' <span class="form-note" title="Date read from a scanned page; may be off by a few days">≈</span>' : ''}</td><td data-v="${t.type}">${typeBadge(t)}</td><td data-v="${esc(t.ticker || t.name)}">${tkrLink(t)} <span style="color:var(--text);font-weight:600">${esc(t.name)}</span>${t.note ? `<div class="tkr-name">${esc(t.note)}</div>` : ''}</td><td>${esc(t.kindLabel)}</td><td class="num" data-v="${t.lo}">${t.unconfirmed ? '≈ ' : ''}${esc(shortRange(t))}</td></tr>`;
  const head = `<thead><tr><th class="num" scope="col">Traded</th><th scope="col">Type</th><th scope="col">Asset</th><th scope="col">Kind</th><th class="num" scope="col">Amount ${tip('range')}</th></tr></thead>`;
  const top = p.trades.slice(0, limit), rest = p.trades.slice(limit, 400);
  return `<div class="table-wrap"><table class="data" data-sortable style="min-width:720px"><caption class="sr-only">Recent trades by ${esc(p.name)}</caption>${head}<tbody>${top.map(row).join('')}</tbody></table></div>
  ${rest.length ? `<details class="fp-more"><summary>Show ${int(rest.length)} more trades</summary><div class="table-wrap"><table class="data" style="min-width:720px">${head}<tbody>${rest.map(row).join('')}</tbody></table></div></details>` : ''}`;
}

export function personPage(d, p) {
  const isTrump = p.slug === 'donald-trump';
  const hero = `<div class="fp-hero-id"><img src="${esc(p.photo)}" alt="${esc(p.name)}" width="112" height="112"><div><div class="fp-name">${esc(p.name)} ${partyChip(p.party)}</div><div class="fp-role">${esc(p.role)}</div></div></div>`;
  const body = `${pageHero({
    crumbs: [['Politicians', '/politicians.html'], [p.name]],
    eyebrow: 'Featured trader',
    h1: `What ${esc(p.name)} is <span class="accent">buying and selling</span>`,
    lead: p.intro,
    extra: hero,
  })}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">At a glance</h2>
    <div class="row">
      ${kpi('Latest report', p.latestFiled ? esc(date(p.latestFiled)) : '—', 'Trades are disclosed weeks later')}
      ${kpi(`Trades in ${esc(p.tradeStats.year)}`, int(p.tradeStats.count), `<span class="up">${int(p.tradeStats.buys)} buys</span> · <span class="down">${int(p.tradeStats.sells)} sells</span>`)}
      ${kpi(`Bought ${tip('range')}`, `<span class="up">${money(p.tradeStats.buyEst)}</span>`, 'Estimated from reported ranges')}
      ${kpi('Sold', `<span class="down">${money(p.tradeStats.sellEst)}</span>`, 'Estimated from reported ranges')}
    </div>
  </div>
</section>
<section class="section-sm" id="trades">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:18px"><div><div class="eyebrow">Recent transactions</div><h2 style="font-size:34px">Latest buys and sells</h2></div><p>${esc(p.tradeIntro)}</p></div>
    <div class="reveal">${tradesTable(p, isTrump ? 40 : 60)}</div>
    <p class="form-note" style="margin-top:14px">${p.tradesSource?.url ? `Source: <a href="${esc(p.tradesSource.url)}" target="_blank" rel="noopener nofollow">${esc(p.tradesSource.label)}</a>. ` : ''}Amounts are the ranges on the form; dollar totals use the midpoint of each range.</p>
  </div>
</section>
${p.topBought.length || p.topSold.length ? `<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-6 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Most bought</span><span>${esc(p.tradeStats.year)} · estimated dollars</span></div><h3>Biggest buys this year</h3>
        ${vRank(p.topBought.slice(0, 10).map((x) => ({ name: x.name, href: x.slug ? `/stocks/${x.slug}.html` : null, sub: `${x.ticker ? esc(x.ticker) + ' · ' : ''}${x.buys} buy${x.buys > 1 ? 's' : ''}`, value: money(x.buyEst) })), { kind: 'buy' })}</div></div>
      <div class="col-6 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Most sold</span><span>${esc(p.tradeStats.year)} · estimated dollars</span></div><h3>Biggest sells this year</h3>
        ${p.topSold.length ? vRank(p.topSold.slice(0, 10).map((x) => ({ name: x.name, href: x.slug ? `/stocks/${x.slug}.html` : null, sub: `${x.ticker ? esc(x.ticker) + ' · ' : ''}${x.sells} sale${x.sells > 1 ? 's' : ''}`, value: money(x.sellEst) })), { kind: 'sell' }) : '<p class="form-note">No sales reported this year.</p>'}</div></div>
    </div>
    ${isTrump && p.byMonth.length ? `<div class="card chart-card reveal" style="margin-top:24px"><div class="card-label"><span>Month by month</span><span>Estimated dollars</span></div><h3>Buying vs selling in ${esc(p.tradeStats.year)}</h3>
      ${chart('trump-months', 'split', { labels: p.byMonth.map((m) => m.label), buys: p.byMonth.map((m) => Math.round(m.buyEst)), sells: p.byMonth.map((m) => Math.round(m.sellEst)), money: true, buyLabel: 'Bought', sellLabel: 'Sold' }, { label: 'Bar chart of estimated dollars bought and sold each month' })}
      <div class="legend"><span><i style="background:var(--teal)"></i>Bought</span><span><i style="background:var(--coral)"></i>Sold</span></div>
      ${p.gaps.length ? `<p class="caption"><b>Missing months</b>No report yet for ${esc(p.gaps.join(', '))}. Reports can arrive weeks late.</p>` : ''}
    </div>` : ''}
  </div>
</section>` : ''}
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-6 reveal"><div class="card" style="height:100%"><div class="card-label"><span>How we checked this</span><span>Official sources only</span></div><h3>Verified against the original filings</h3>
        <ul class="fp-checks">${(p.checks?.lines || []).map((l) => `<li><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>${esc(l)}</span></li>`).join('')}</ul></div></div>
      <div class="col-6 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Official filings</span><span>${int(p.filings.length)} reports</span></div><h3>Read the original documents</h3>
        <ul class="rank-list">${p.filings.slice(0, 10).map((f) => `<li><span class="t"><a href="${esc(f.url)}" target="_blank" rel="noopener nofollow" style="color:var(--text)">${esc(f.label)}</a><small>Filed ${esc(date(f.filed))}</small></span><span class="v">${int(f.rows || 0)} lines</span></li>`).join('')}</ul></div></div>
    </div>
    <p class="form-note" style="margin-top:12px">Photo: ${esc(p.photoCredit)}. Information only, not investment advice. Disclosures arrive weeks after trades, so they show what happened, not what to do next.</p>
  </div>
</section>
${newsletter('fp-' + p.slug)}`;
  return {
    page: 'politicians', path: `/politicians/${p.slug}.html`,
    title: `${p.name} Stock Trades: Latest Buys and Sells`,
    description: `${p.name}'s latest disclosed stock trades: ${int(p.tradeStats.count)} trades in ${p.tradeStats.year}, biggest buys and sells, read from the official filings and checked line by line.`,
    body, charts: isTrump,
  };
}
