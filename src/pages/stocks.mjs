import { esc, money, int, pct, date, quarter } from '../lib/format.mjs';
import { tvWidget } from '../layout.mjs';
import { tkr, actBadge, wbar, sourceChip, kpi, pageHero, proCta, partyChip, tip } from '../parts.mjs';
import { titleish } from './home.mjs';

const liveChart = (s) =>
  s.ticker
    ? tvWidget('embed-widget-symbol-overview.js', { symbols: [[s.name, `${s.ticker}|1D`]], chartOnly: false, width: '100%', height: '100%', locale: 'en', colorTheme: 'dark', autosize: true, showVolume: false, hideDateRanges: false, scalePosition: 'right', scaleMode: 'Normal', noTimeScale: false, valuesTracking: '1', changeMode: 'price-and-percent', chartType: 'area', lineColor: '#F2B33D', topColor: 'rgba(242,179,61,0.25)', bottomColor: 'rgba(242,179,61,0)', isTransparent: true }, { height: 440 })
    : '<div class="widget-body" style="height:200px"><div class="widget-fallback">No live quote available for this security.</div></div>';

function congressTable(d, s, pol) {
  if (!pol.length) return '';
  return `<div class="mt-48 reveal"><div class="card-label"><span>Congressional trades in ${esc(s.label)}</span><span><a href="/politicians.html">All politician trades</a></span></div>
      <div class="table-wrap"><table class="data" style="min-width:620px"><thead><tr><th>Member</th><th>Type</th><th class="num">Amount ${tip('range')}</th><th class="num">Traded</th><th class="num">Disclosed</th></tr></thead><tbody>${pol
        .slice(0, 15)
        .map((t) => `<tr><td>${partyChip(t.party)} <span style="color:var(--text);font-weight:600">${esc(t.member)}</span><div class="tkr-name">${esc(t.chamber)}${t.state ? ' · ' + esc(t.state) : ''}</div></td><td>${t.type === 'buy' ? '<span class="act act-add">Buy</span>' : '<span class="act act-trim">Sell</span>'}</td><td class="num">${esc(t.amount?.label || '—')}</td><td class="num">${date(t.date)}</td><td class="num"><a href="${esc(t.source)}" target="_blank" rel="noopener nofollow">${date(t.filed)}</a></td></tr>`)
        .join('')}</tbody></table></div></div>`;
}

function insiderTable(d, s) {
  if (!s.ticker || !d.insiders) return '';
  const I = d.insiders;
  const buys = [...(I.topExecBuys || []), ...(I.topBuys || [])].filter((t) => t.ticker === s.ticker);
  const sells = [...(I.topExecSells || []), ...(I.topSells || [])].filter((t) => t.ticker === s.ticker);
  const seen = new Set();
  const rows = [...buys.map((t) => ({ ...t, kind: 'buy' })), ...sells.map((t) => ({ ...t, kind: 'sell' }))].filter((t) => {
    const k = t.acc + t.kind;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!rows.length) return '';
  return `<div class="mt-48 reveal"><div class="card-label"><span>Largest insider trades · ${esc(I.label)}</span><span><a href="/insiders.html">All insider trades</a></span></div>
      <div class="table-wrap"><table class="data" style="min-width:620px"><thead><tr><th>Insider</th><th>Type</th><th class="num">Value</th><th class="num">Price</th><th class="num">Date</th></tr></thead><tbody>${rows
        .slice(0, 10)
        .map((t) => `<tr><td><span style="color:var(--text);font-weight:600">${esc(titleish(t.owner))}</span><div class="tkr-name">${esc(t.role)}</div></td><td>${t.kind === 'buy' ? '<span class="act act-add">Buy</span>' : '<span class="act act-trim">Sell</span>'}${t.plan ? ` <span class="form-note">10b5-1 ${tip('10b5-1')}</span>` : ''}</td><td class="num">${money(t.value)}</td><td class="num">$${t.price.toFixed(2)}</td><td class="num">${date(t.date)}</td></tr>`)
        .join('')}</tbody></table></div></div>`;
}

export function stockPage(d, s) {
  if (!s.owners) return tradedStockPage(d, s);
  const N = d.live.length;
  const top = s.holders[0];
  const maxW = top?.w || 1;
  const pol = s.ticker ? d.politics.byTicker.get(s.ticker) || [] : [];
  const insB = s.ticker && d.insiders?.buyTickers?.[s.ticker];
  const insS = s.ticker && d.insiders?.sellTickers?.[s.ticker];
  const label = s.ticker ? `${s.name} (${s.ticker})` : s.name;
  const consensus = d.stocks.filter((x) => x.slug !== s.slug).slice(0, 8);

  const body = `${pageHero({
    crumbs: [['Top Stocks', '/smart-money.html'], [s.label]],
    eyebrow: `${esc(s.sector)} · owned by ${s.owners} fund manager${s.owners > 1 ? 's' : ''}`,
    h1: `Who owns ${esc(label)}?`,
    lead: `${s.owners} of the ${N} fund managers we track hold ${esc(s.name)}, worth ${money(s.value)} combined as of ${quarter(d.latestPeriod)}. ${esc(top.inv.manager)} has the biggest bet at ${pct(top.w)} of the portfolio.`,
  })}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">Ownership summary</h2>
    <div class="row">
      ${kpi('Fund manager owners', `${s.owners} / ${N}`, `${s.newBuyers} opened new positions`)}
      ${kpi('Combined value', money(s.value), 'At quarter-end prices')}
      ${kpi('Biggest weight', pct(top.w), esc(top.inv.manager))}
      ${kpi('Buyers / sellers', `<span class="up">${s.buyers}</span> / <span class="down">${s.sellCount}</span>`, `Changes in ${quarter(d.latestPeriod)}`)}
    </div>
    <div class="row mt-32">
      <div class="col-7 reveal"><div class="widget-frame"><div class="widget-head"><span>${esc(s.ticker || s.label)} · live price</span><span class=live>Live</span></div>${liveChart(s)}</div></div>
      <div class="col-5 reveal"><div class="card" style="height:100%"><div class="card-label"><span>Smart money take</span></div><h3>Why it matters</h3>
        <p>When several investors with very different styles own the same company, it’s often worth a closer look. ${esc(s.name)} appears in ${s.owners} of our ${N} portfolios.</p>
        <ul class="list-check"><li><i class="fa-solid fa-check" aria-hidden="true"></i><span>Largest holder: <a href="/investors/${top.inv.slug}.html">${esc(top.inv.manager)}</a> (${pct(top.w)} of portfolio)</span></li>
        <li><i class="fa-solid fa-check" aria-hidden="true"></i><span>${s.buyers} manager${s.buyers === 1 ? '' : 's'} bought or added this quarter</span></li>
        <li><i class="fa-solid fa-check" aria-hidden="true"></i><span>${s.sellCount} manager${s.sellCount === 1 ? '' : 's'} trimmed or sold out</span></li>
        ${pol.length ? `<li><i class="fa-solid fa-landmark" aria-hidden="true"></i><span>${pol.length} congressional trade${pol.length > 1 ? 's' : ''} disclosed recently (${pol.filter((t) => t.type === 'buy').length} buys, ${pol.filter((t) => t.type === 'sell').length} sells)</span></li>` : ''}
        ${insB || insS ? `<li><i class="fa-solid fa-user-tie" aria-hidden="true"></i><span>Company insiders in ${esc(d.insiders.label)}: ${insB ? `<span class="up">bought ${money(insB.value)}</span>` : 'no open-market buys'}${insS ? `, <span class="down">sold ${money(insS.value)}</span>` : ''}</span></li>` : ''}</ul>
        <p class="form-note mt-32">This is not a recommendation. Do your own research.</p></div></div>
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row between center reveal" style="margin-bottom:20px"><h2 style="font-size:30px;margin:0">Fund managers who own ${esc(s.label)}</h2>${sourceChip(`SEC 13F ${tip('13F')} · ${quarter(d.latestPeriod)}`)}</div>
    <div class="table-wrap reveal"><table class="data" data-sortable style="min-width:620px">
      <caption class="sr-only">Fund managers holding ${esc(s.name)}</caption>
      <thead><tr><th scope="col">Investor</th><th class="num" scope="col">% of portfolio</th><th scope="col">Activity</th><th class="num" scope="col">Shares</th><th class="num" scope="col">Value</th></tr></thead>
      <tbody>${s.holders
        .map((x) => `<tr><td data-v="${esc(x.inv.manager)}"><a href="/investors/${x.inv.slug}.html" style="color:var(--text);font-weight:600">${esc(x.inv.manager)}</a><div class="tkr-name">${esc(x.inv.firm)}</div></td><td class="num" data-v="${x.w.toFixed(4)}">${wbar(x.w, maxW, 60)}${x.w.toFixed(2)}%</td><td data-v="${x.act}">${actBadge(x.act)}</td><td class="num" data-v="${x.shares}">${int(x.shares)}</td><td class="num" data-v="${x.value}">${money(x.value)}</td></tr>`)
        .join('')}${s.sellers.map((x) => `<tr data-fixed><td><a href="/investors/${x.inv.slug}.html" style="color:var(--text);font-weight:600">${esc(x.inv.manager)}</a><div class="tkr-name">${esc(x.inv.firm)}</div></td><td class="num">0%</td><td>${actBadge('Sold')}</td><td class="num">${int(x.h.prevShares)}</td><td class="num">${money(x.h.prevValue)} <span class="form-note">prior qtr</span></td></tr>`).join('')}</tbody></table></div>
    ${congressTable(d, s, pol)}
    ${insiderTable(d, s)}
    <div class="mt-48 reveal"><div class="card-label"><span>More consensus stocks</span></div><div class="top3" style="gap:10px">${consensus.map((x) => `<a class="chip" href="/stocks/${x.slug}.html"><b>${esc(x.label)}</b> ${x.owners} owner${x.owners > 1 ? 's' : ''}</a>`).join('')}</div></div>
  </div>
</section>
${proCta}`;
  return {
    page: 'smart-money',
    path: `/stocks/${s.slug}.html`,
    title: `Who Owns ${label}? Fund Manager, Politician and Insider Activity`,
    description: `${s.owners} top fund managers own ${s.name}${s.ticker ? ` (${s.ticker})` : ''}, worth ${money(s.value)} combined as of ${quarter(d.latestPeriod)}. See who bought, who sold${pol.length ? ', congressional trades' : ''} and insider activity.`,
    body,
    charts: false,
  };
}

/** A stock no tracked fund manager owns, but politicians or insiders traded. */
function tradedStockPage(d, s) {
  const N = d.live.length;
  const pol = d.politics.byTicker.get(s.ticker) || [];
  const insB = d.insiders?.buyTickers?.[s.ticker];
  const insS = d.insiders?.sellTickers?.[s.ticker];
  const members = new Set(pol.map((t) => t.bioguide || t.member)).size;
  const label = `${s.name} (${s.ticker})`;
  const body = `${pageHero({
    crumbs: [['Top Stocks', '/smart-money.html'], [s.label]],
    eyebrow: `${s.sector ? esc(s.sector) + ' · ' : ''}not held by our fund managers`,
    h1: `Who’s trading ${esc(label)}?`,
    lead: `None of the ${N} fund managers we track own ${esc(s.name)} in their latest 13F filing${s.sellers.length ? ` (${s.sellers.length} sold out last quarter)` : ''}. Here is what politicians and company insiders did.`,
  })}
<section class="section-sm">
  <div class="container">
    <div class="row">
      ${kpi('Congress trades', pol.length, `${members} member${members === 1 ? '' : 's'} · recent disclosures`)}
      ${kpi('Congress buys / sells', `<span class="up">${pol.filter((t) => t.type === 'buy').length}</span> / <span class="down">${pol.filter((t) => t.type === 'sell').length}</span>`, 'Stock transactions')}
      ${kpi(`Insiders · ${d.insiders ? esc(d.insiders.label) : ''}`, insB ? `<span class="up">${money(insB.value)}</span>` : '—', insB ? `bought by ${insB.insiders} insider${insB.insiders > 1 ? 's' : ''}` : 'No open-market buys')}
      ${kpi('Insider sales', insS ? `<span class="down">${money(insS.value)}</span>` : '—', insS ? `by ${insS.insiders} insider${insS.insiders > 1 ? 's' : ''}` : 'No open-market sales')}
    </div>
    <div class="row mt-32"><div class="col reveal"><div class="widget-frame"><div class="widget-head"><span>${esc(s.ticker)} · live price</span><span class=live>Live</span></div>${liveChart(s)}</div></div></div>
    ${congressTable(d, s, pol)}
    ${insiderTable(d, s)}
    <p class="form-note mt-32">This is not a recommendation. Do your own research.</p>
  </div>
</section>
${proCta}`;
  return {
    page: 'smart-money',
    path: `/stocks/${s.slug}.html`,
    title: `${label}: Politician and Insider Trades`,
    description: `Recent congressional stock trades and insider buying and selling in ${s.name} (${s.ticker}), from official STOCK Act and SEC Form 4 filings.`,
    body,
    charts: false,
  };
}
