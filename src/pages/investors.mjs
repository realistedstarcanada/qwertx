import { esc, money, int, pct, date, quarter, signed, upDown } from '../lib/format.mjs';
import { chart, tkr, actBadge, wbar, sourceChip, rankList, vCard, pageHero, kpi, proCta, tip, guide } from '../parts.mjs';
import { GUIDES } from '../guides.mjs';

export function investorsIndex(d) {
  const body = `${pageHero({
    guide: GUIDES.investors,
    crumbs: [['Fund Managers']],
    eyebrow: 'Super investors',
    h1: `The ${d.live.length} super investors we track`,
    lead: `Value legends, activists, growth specialists and endowments, sorted by portfolio size, with holdings from each manager’s latest SEC 13F filing (${quarter(d.latestPeriod)}).`,
    img: 'article-read-portfolio.jpg',
    imgAlt: 'Abstract glowing blocks of different sizes forming a treemap mosaic',
  })}
<section class="section">
  <div class="container">
    <div class="row between center mb-32 reveal"><p class="mb-0" style="color:var(--muted)">Showing <b style="color:var(--text)">${d.live.length}</b> investors · <b style="color:var(--text)">${money(d.smart.value)}</b> in reported holdings</p>${sourceChip('Source: SEC EDGAR Form 13F-HR')}</div>
    <div class="v-grid">${d.live.map(vCard).join('')}</div>
  </div>
</section>
${d.institutions?.length ? `<section class="section-sm" id="institutions">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:24px"><div><div class="card-label" style="margin:0"><span>Canadian &amp; institutional money</span></div><h2 style="font-size:32px;margin:6px 0 0">Pension funds and large asset managers</h2></div><p>Big, diversified books, so they are kept out of the super investor rankings above. Their 13F filings show US-listed holdings only, which for Canadian managers is just part of what they own.</p></div>
    <div class="v-grid">${d.institutions.map(vCard).join('')}</div>
  </div>
</section>` : ''}
<section class="section-sm">
  <div class="container">
    <div class="row between center reveal" style="margin-bottom:20px"><div><div class="card-label" style="margin:0"><span>Compare</span></div><h2 style="font-size:32px;margin:6px 0 0">All portfolios side by side</h2></div>${sourceChip('Click a column to sort', 'fa-arrow-down-wide-short')}</div>
    <div class="table-wrap reveal"><table class="data" data-sortable>
      <caption class="sr-only">Super investor portfolios compared</caption>
      <thead><tr><th scope="col">Investor</th><th class="num" scope="col">Portfolio</th><th class="num" scope="col">Change</th><th class="num" scope="col">Positions</th><th class="num" scope="col">Top 10</th><th class="num" scope="col">Behaves like</th><th class="num" scope="col">Turnover</th><th scope="col">Top holdings</th><th class="num" scope="col">Filed</th></tr></thead>
      <tbody>${d.live
        .map((i) => {
          const p = i.p;
          return `<tr><td data-v="${esc(i.manager)}"><a href="/investors/${i.slug}.html" style="color:var(--text);font-weight:600">${esc(i.manager)}</a><div class="tkr-name">${esc(i.firm)}</div></td>
<td class="num" data-v="${p.totalValue}">${money(p.totalValue)}</td>
<td class="num" data-v="${p.valueChange ?? 0}"><span class="${upDown(p.valueChange)}">${p.valueChange != null ? signed(p.valueChange * 100) : '—'}</span></td>
<td class="num" data-v="${p.holdingsCount}">${p.holdingsCount}</td>
<td class="num" data-v="${p.top10.toFixed(2)}">${Math.round(p.top10)}%</td>
<td class="num" data-v="${p.effN.toFixed(2)}">${Math.round(p.effN)} bets</td>
<td class="num" data-v="${p.turnover ?? 0}">${p.turnover != null ? Math.round(p.turnover) + '%' : '—'}</td>
<td>${p.holdings.slice(0, 3).map((h) => tkr(h.label, h.stockSlug)).join(' ')}</td>
<td class="num" data-v="${p.filingDate}">${date(p.filingDate)}</td></tr>`;
        })
        .join('')}</tbody></table></div>
  </div>
</section>
${proInvestorsSection(d)}
${proCta}`;
  return { page: 'investors', path: '/investors.html', title: 'Super Investors: Latest 13F Portfolios', description: `Portfolios of ${d.live.length} super investors including Warren Buffett, Bill Ackman, Chris Hohn and Seth Klarman, decoded from their latest SEC 13F filings.`, body, charts: false };
}

export function investorPage(d, inv) {
  const p = inv.p;
  const top5 = p.holdings.slice(0, 5);
  const maxW = p.holdings[0]?.w || 1;
  const biggestBuy = p.flows.filter((f) => f.flow > 0)[0];
  const biggestSell = [...p.flows].reverse().filter((f) => f.flow < 0)[0];
  const c = p.counts || {};
  const tldr = [
    `<b>${esc(p.holdings[0].name)}${p.holdings[0].ticker ? ` (${esc(p.holdings[0].ticker)})` : ''}</b> is the largest position at <b>${pct(p.holdings[0].w)}</b> of a ${money(p.totalValue)} portfolio.`,
    biggestBuy ? `Biggest buy: ${biggestBuy.label === 'New position' ? 'opened a new position in' : 'added most to'} <b>${esc(biggestBuy.name)}</b>, about <b>${money(biggestBuy.flow)}</b> of new money.` : 'No meaningful buying this quarter.',
    biggestSell ? `Biggest sale: ${biggestSell.label === 'Sold out' ? 'sold out of' : 'trimmed'} <b>${esc(biggestSell.name)}</b>, about <b>${money(-biggestSell.flow)}</b>.` : 'No meaningful selling this quarter.',
    `${p.conviction} conviction: the top 10 holdings make up <b>${Math.round(p.top10)}%</b>, and the portfolio behaves like <b>${Math.round(p.effN)} equal-sized bets</b>.`,
  ];
  const legendSect = p.sectors.map(([n, v], i) => `<span><i style="background:${n === 'Other positions' || i >= 8 ? '#4a5468' : ['#c98500', '#3987e5', '#d95926', '#199e70', '#9085e9', '#d55181', '#008300', '#e66767'][i]}"></i>${esc(n)} ${Math.round(v)}%</span>`).join('');
  const stackLegend = p.stack.series.map((s, i) => `<span><i style="background:${s.name === 'Everything else' ? '#4a5468' : ['#c98500', '#3987e5', '#d95926', '#199e70', '#9085e9', '#d55181'][i]}"></i>${esc(s.name)}</span>`).join('');
  const histFirst = p.hist.values[0];
  const histLast = p.hist.values.at(-1);
  const filingsUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${Number(p.cik)}&type=13F-HR&dateb=&owner=include&count=40`;

  // Politician and insider activity in this investor's top holdings
  const cross = p.holdings.slice(0, 30).map((h) => {
    const pol = h.ticker ? d.politics.byTicker.get(h.ticker) || [] : [];
    const insB = h.ticker && d.insiders?.buyTickers?.[h.ticker];
    const insS = h.ticker && d.insiders?.sellTickers?.[h.ticker];
    return { h, pol, insB, insS };
  }).filter((x) => x.pol.length || x.insB);

  const body = `<section class="page-hero">
  <div class="hero-bg grid"></div>
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/investors.html">Fund Managers</a><span aria-hidden="true">/</span><span aria-current="page">${esc(inv.manager)}</span></nav>
    <div class="row row-wide center">
      <div class="col-7">
        <div class="eyebrow">Super investor portfolio</div>
        <h1>${esc(inv.manager)} portfolio</h1>
        <p class="lead maxw-640">Latest holdings of ${esc(inv.firm)} as of ${quarter(p.period)}: ${p.holdingsCount} positions worth ${money(p.totalValue)}, decoded into plain English.</p>
        <div class="row center mt-32" style="gap:16px">
          <span class="avatar avatar-lg" aria-hidden="true">${esc(inv.avatar)}</span>
          <div><div class="tags" style="margin-bottom:10px">${(inv.tags || []).map((t) => `<span class="tag tag-gold">${esc(t)}</span>`).join('')}</div><div class="mono" style="font-size:13px;color:var(--muted)">${esc(inv.meta || inv.firm)}</div></div>
        </div>
        <div class="row mt-32" style="gap:10px">${sourceChip(`SEC 13F${tip('13F')} · period ${quarter(p.period)} · filed ${date(p.filingDate)} · <a href="${esc(p.filingUrl)}" target="_blank" rel="noopener">View filing</a>`)}<span class="time-badge"><i class="fa-regular fa-clock" aria-hidden="true"></i>5-min briefing</span></div>
      </div>
      <div class="col-5">
        <div class="card">
          <div class="card-label"><span>Top 5 holdings</span><span>${quarter(p.period)}</span></div>
          <ul class="rank-list hero-rank">${top5.map((h, i) => `<li><span class="r">${i + 1}</span><span class="t">${tkr(h.label, h.stockSlug)}<small>${esc(h.name)}</small></span><span class="v">${wbar(h.w, maxW, 35)}${pct(h.w)}</span></li>`).join('')}</ul>
        </div>
      </div>
    </div>
  </div>
</section>${guide(GUIDES.investor(esc(inv.manager)))}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">Portfolio summary and charts</h2>
    <div class="tldr reveal">
      <div class="row between center mb-32" style="margin-bottom:18px"><div class="eyebrow" style="margin:0">The 30-second read</div><span class="time-badge"><i class="fa-solid fa-stopwatch" aria-hidden="true"></i>30 sec</span></div>
      <ul>${tldr.map((t) => `<li><i class="fa-solid fa-angle-right" aria-hidden="true"></i><span>${t}</span></li>`).join('')}</ul>
    </div>
    <div class="row mt-32">
      ${kpi('Portfolio value', money(p.totalValue), p.valueChange != null ? `<span class="${upDown(p.valueChange)}">${signed(p.valueChange * 100)}</span> vs ${quarter(p.prevPeriod)}` : 'First quarter tracked')}
      ${kpi('Positions', p.holdingsCount, p.prevPeriod ? `${c.new || 0} new · ${c.sold || 0} sold out` : '&nbsp;')}
      ${kpi(`Top-10 weight${tip('conviction')}`, `${Math.round(p.top10)}%`, `${p.conviction} conviction`)}
      ${kpi(`Behaves like${tip('bets')}`, `${Math.round(p.effN)} bets`, 'Effective number of positions')}
      ${kpi(`Turnover${tip('turnover')}`, p.turnover != null ? `${Math.round(p.turnover)}%` : '—', 'Portfolio traded this quarter')}
    </div>
  </div>
</section>

<section class="section-sm">
  <div class="container">
    <div class="card chart-card reveal">
      <div class="row between center" style="gap:12px"><div><div class="card-label"><span>01 · Holdings map</span></div><h3>Every box is a position, sized by its weight</h3></div><div class="legend" style="margin:0"><span><i style="background:var(--gold)"></i>New</span><span><i style="background:var(--teal)"></i>Added</span><span><i style="background:var(--coral)"></i>Trimmed</span><span><i style="background:#3c4660"></i>Unchanged</span></div></div>
      ${chart('tm', 'treemap', { items: p.holdings.slice(0, 40).map((h) => ({ ticker: h.label, name: h.name, value: h.value, weight: h.w, act: h.act, actLabel: h.actLabel })) }, { cls: 'chart chart-lg mt-32', label: `Treemap of ${inv.manager}'s holdings; the largest is ${p.holdings[0].label} at ${pct(p.holdings[0].w)}` })}
      <p class="caption"><b>What this means</b>${esc(p.holdings[0].name)} alone is ${Math.round(p.holdings[0].w)}% of the portfolio, and the top three make up ${Math.round(p.holdings.slice(0, 3).reduce((a, h) => a + h.w, 0))}%. Colors show what changed since last quarter, so you can spot fresh conviction at a glance.</p>
    </div>
  </div>
</section>

<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-2"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>02 · Sector allocation</span></div><h3>Where the money is</h3>
        ${chart('sect', 'donut', { items: p.sectors, center: `${Math.round(p.sectors[0][1])}%`, centerSub: p.sectors[0][0].toUpperCase() }, { label: `Donut chart of sector weights; largest is ${p.sectors[0][0]} at ${Math.round(p.sectors[0][1])}%` })}
        <div class="legend">${legendSect}</div>
        <p class="caption"><b>What this means</b>${esc(p.sectors[0][0])} is the biggest slice at ${Math.round(p.sectors[0][1])}% of the portfolio.</p>
      </div></div>
      <div class="col-2"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>03 · Concentration curve</span></div><h3>How focused is the portfolio?</h3>
        ${chart('curve', 'curve', { curve: p.curve, totalPositions: p.holdingsCount }, { label: `Concentration curve: the top 10 positions hold ${Math.round(p.top10)}% of the portfolio` })}
        <div class="legend"><span><i style="background:var(--gold)"></i>${esc(inv.manager)}</span><span><i style="background:var(--muted)"></i>Equal-weight benchmark</span></div>
        <p class="caption"><b>What this means</b>The steeper the gold curve rises above the dashed line, the more the portfolio depends on a few big bets. It behaves like ${Math.round(p.effN)} equal-sized positions.</p>
      </div></div>
    </div>
  </div>
</section>

<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-2"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>04 · Quarter activity</span><span>${quarter(p.prevPeriod)} → ${quarter(p.period)}</span></div><h3>Biggest buys and sells</h3>
        ${p.flows.length ? chart('flows', 'flows', { items: p.flows }, { label: 'Bar chart of the largest buys and sells this quarter' }) : '<p class="form-note">No changes to compare yet.</p>'}
        <div class="legend"><span><i style="background:var(--teal)"></i>Bought / added</span><span><i style="background:var(--coral)"></i>Sold / trimmed</span></div>
        <p class="caption"><b>What this means</b>${biggestBuy ? `The largest move was ${biggestBuy.label === 'New position' ? 'opening' : 'adding to'} ${esc(biggestBuy.name)}, worth about ${money(biggestBuy.flow)}.` : 'Little changed this quarter.'} Values are estimated at quarter-end prices.</p>
      </div></div>
      <div class="col-2"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>05 · Portfolio value</span><span>${p.hist.labels[0] || ''} → ${p.hist.labels.at(-1) || ''}</span></div><h3>${p.hist.labels.length >= 8 ? 'Two years' : `${p.hist.labels.length} quarters`} of reported value</h3>
        ${p.hist.values.length > 1 ? chart('val', 'value', p.hist, { label: 'Line chart of reported 13F portfolio value by quarter' }) : '<p class="form-note">History builds up as new quarters are filed.</p>'}
        <p class="caption"><b>What this means</b>Value changes with both market prices and new money in or out.${histFirst ? ` It moved from ${money(histFirst)} to ${money(histLast)} over ${p.hist.values.length} quarters.` : ''}</p>
      </div></div>
    </div>
  </div>
</section>

${p.stack.labels.length > 1 ? `<section class="section-sm">
  <div class="container">
    <div class="card chart-card reveal">
      <div class="card-label"><span>06 · Position history</span><span>Share of portfolio by quarter</span></div><h3>How today’s top positions grew over time</h3>
      ${chart('stack', 'stack', p.stack, { label: "Stacked area chart of the top positions' weights by quarter" })}
      <div class="legend">${stackLegend}</div>
      <p class="caption"><b>What this means</b>Wide, steady bands are long-term core holdings; bands that appear suddenly are recent bets.</p>
    </div>
  </div>
</section>` : ''}

<section class="section-sm" id="holdings">
  <div class="container">
    <div class="row between center mb-32 reveal" style="margin-bottom:20px"><div><div class="card-label" style="margin:0"><span>07 · Holdings</span></div><h2 style="font-size:32px;margin:6px 0 0">All ${p.holdingsCount} positions</h2></div>${sourceChip('Click a column to sort', 'fa-arrow-down-wide-short')}</div>
    <div class="table-wrap reveal">
      <table class="data" data-sortable>
        <caption class="sr-only">${esc(inv.manager)} 13F holdings for ${quarter(p.period)}</caption>
        <thead><tr><th class="num" scope="col">#</th><th scope="col">Stock</th><th scope="col">Sector</th><th class="num" scope="col">% of portfolio</th><th scope="col">Activity</th><th class="num" scope="col">Shares</th><th class="num" scope="col">Value</th></tr></thead>
        <tbody>${p.holdings
          .map((h) => `<tr><td data-v="${h.rank}" class="num">${h.rank}</td><td data-v="${esc(h.label)}">${tkr(h.label, h.stockSlug)}<div class="tkr-name">${esc(h.name)}</div></td><td data-v="${esc(h.sector)}">${esc(h.sector)}</td><td class="num" data-v="${h.w.toFixed(4)}">${wbar(h.w, maxW, 60)}${h.w.toFixed(2)}%</td><td data-v="${{ New: 4, Add: 3, Hold: 2, Trim: 1 }[h.act]}" title="${esc(h.actLabel)}">${actBadge(h.act)}${h.act === 'Add' || h.act === 'Trim' ? ` <span class="mono ${h.act === 'Add' ? 'up' : 'down'}" style="font-size:12px">${signed((h.sharesChangePct || 0) * 100, 0)}</span>` : ''}</td><td class="num" data-v="${h.shares}">${int(h.shares)}</td><td class="num" data-v="${h.value}">${money(h.value)}</td></tr>`)
          .join('')}</tbody>
      </table>
    </div>
    <p class="form-note mt-32" style="margin-top:14px">Values as reported at quarter end (${date(p.period)}). Activity compares share counts with the ${quarter(p.prevPeriod)} filing. Source: <a href="${esc(p.filingUrl)}" target="_blank" rel="noopener">SEC filing ${esc(p.accession)}</a> · <a href="${filingsUrl}" target="_blank" rel="noopener">all filings on EDGAR</a>.</p>
  </div>
</section>

<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-2"><div class="card reveal" style="height:100%"><div class="card-label"><span>08 · Sold out this quarter</span></div><h3>Positions closed</h3>${
        p.sold.length
          ? rankList(p.sold.sort((a, b) => b.prevValue - a.prevValue).slice(0, 12).map((h) => ({ r: '<i class="fa-solid fa-xmark" style="color:var(--coral)" aria-hidden="true"></i>', t: tkr(h.label, h.stockSlug), small: esc(h.name), v: `${money(h.prevValue)} at ${quarter(p.prevPeriod)}` })))
          : '<p>No positions were fully sold this quarter.</p>'
      }</div></div>
      <div class="col-2"><div class="card reveal" style="height:100%"><div class="card-label"><span>09 · About the investor</span></div><h3>${esc(inv.manager)}</h3><p>${esc(inv.about || '')}</p>
        <div class="accordion mt-32">${inv.philosophy?.length ? `<details open><summary>Philosophy in brief</summary><div class="acc-body"><ul class="list-check">${inv.philosophy.map((x) => `<li><i class="fa-solid fa-check" aria-hidden="true"></i><span>${esc(x)}</span></li>`).join('')}</ul></div></details>` : ''}<details><summary>How to read this page</summary><div class="acc-body">The 13F shows US-listed long positions at quarter end, filed up to 45 days later. It does not show short positions, cash, bonds (except convertibles) or most non-US holdings, so treat it as one view of the strategy, not the whole picture.</div></details></div>
      </div></div>
    </div>
  </div>
</section>

${cross.length ? `<section class="section-sm">
  <div class="container">
    <div class="card reveal">
      <div class="card-label"><span>10 · Other smart money</span><span>Politicians and insiders</span></div><h3>Who else is trading these holdings</h3>
      <ul class="rank-list">${cross.slice(0, 8).map((x) => `<li><span class="r">${String(x.h.rank).padStart(2, '0')}</span><span class="t">${tkr(x.h.label, x.h.stockSlug)} <b style="color:var(--text)">${esc(x.h.name)}</b><small>${[x.pol.length ? `${x.pol.length} congressional trade${x.pol.length > 1 ? 's' : ''} disclosed (${x.pol.filter((t) => t.type === 'buy').length} buys)` : '', x.insB ? `insiders bought ${money(x.insB.value)} in ${d.insiders.label}` : ''].filter(Boolean).join(' · ')}</small></span><span class="v">${pct(x.h.w)} of portfolio</span></li>`).join('')}</ul>
    </div>
  </div>
</section>` : ''}

${p.similar?.length ? `<section class="section-sm">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:28px"><div><div class="card-label" style="margin:0"><span>11 · Similar portfolios</span></div><h2 style="font-size:32px;margin:6px 0 0">Investors who think alike</h2></div><p>Cosine similarity of position weights (100 = identical portfolios). Chips show the biggest shared holdings.</p></div>
    <div class="row">${p.similar.map((s) => `<div class="col-3"><a class="card card-hover inv-card reveal" href="/investors/${s.inv.slug}.html"><div class="inv-top"><span class="avatar" aria-hidden="true">${esc(s.inv.avatar)}</span><div><div class="inv-name">${esc(s.inv.manager)}</div><div class="inv-firm">${esc(s.inv.firm)}</div></div></div><div><div class="meter-row"><span>Similarity</span><b>${s.score} / 100</b></div><div class="meter"><span style="width:${s.score}%"></span></div></div><div class="top3">${s.shared.map((t) => `<span class=chip><b>${esc(t)}</b></span>`).join('')}</div></a></div>`).join('')}</div>
  </div>
</section>` : ''}
${proCta}`;

  return {
    page: 'investors',
    path: `/investors/${inv.slug}.html`,
    title: `${inv.manager} Portfolio ${quarter(p.period)}: ${inv.firm} 13F Holdings`,
    description: `${inv.manager}'s ${inv.firm} portfolio: ${p.holdingsCount} positions worth ${money(p.totalValue)} as of ${quarter(p.period)}. Top holdings ${p.holdings.slice(0, 3).map((h) => h.label).join(', ')}, with buys, sells and sector charts.`,
    body,
    charts: true,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Person', name: inv.manager, worksFor: { '@type': 'Organization', name: inv.firm } },
  };
}

export function investorPending(inv) {
  return {
    page: 'investors',
    path: `/investors/${inv.slug}.html`,
    title: `${inv.manager} Portfolio`,
    description: `${inv.manager}'s ${inv.firm} portfolio from SEC 13F filings.`,
    noindex: true,
    body: pageHero({ crumbs: [['Fund Managers', '/investors.html'], [inv.manager]], eyebrow: 'Super investor portfolio', h1: `${esc(inv.manager)} portfolio`, lead: 'This portfolio fills in automatically on the next SEC data update.' }),
  };
}

const CAT_LABEL = { value: 'Value investor', growth: 'Growth and technology', activist: 'Activist', quant: 'Quant, macro and multi-strategy', canada: 'Canadian investor', more: 'Investor worth following' };

/** Public teaser for a manager whose full portfolio is part of QWERTx Pro: who they are and their top 5 holdings. */
export function investorTeaser(d, inv) {
  const p = inv.p;
  const top5 = p.holdings.slice(0, 5);
  const maxW = top5[0]?.w || 1;
  const cats = (inv.categories || []).map((c) => CAT_LABEL[c]).filter(Boolean);
  const moves = (p.counts?.new || 0) + (p.counts?.added || 0) + (p.counts?.reduced || 0) + (p.counts?.sold || 0);
  const body = `${pageHero({
    crumbs: [['Fund Managers', '/investors.html'], [inv.manager]],
    eyebrow: esc(cats[0] || 'Investor') + ' portfolio',
    h1: `${esc(inv.manager)} portfolio`,
    lead: esc(inv.about || `Latest US stock holdings of ${inv.firm}.`),
  })}
<section class="section-sm">
  <div class="container">
    <div class="row">
      ${kpi('Portfolio value', money(p.totalValue), `US-listed stocks, ${quarter(p.period)}`)}
      ${kpi('Positions', int(p.holdingsCount), p.topN ? `QWERTx Pro shows the top ${p.topN}` : 'All in QWERTx Pro')}
      ${kpi('Top 5 make up', pct(top5.reduce((a, h) => a + h.w, 0)), 'of the portfolio')}
      ${kpi('Latest filing', date(p.filingDate), `SEC 13F for ${quarter(p.period)}`)}
    </div>
    <div class="row mt-32">
      <div class="col-7 reveal"><div class="card">
        <div class="card-label"><span>Top 5 holdings</span><span>${quarter(p.period)}</span></div>
        <ul class="rank-list hero-rank">${top5.map((h, i) => `<li><span class="r">${i + 1}</span><span class="t">${tkr(h.label, h.stockSlug)}<small>${esc(h.name)}</small></span><span class="v">${wbar(h.w, maxW, 35)}${pct(h.w)}</span></li>`).join('')}</ul>
        <p class="form-note mt-32">${sourceChip(`SEC 13F${tip('13F')} · filed ${date(p.filingDate)} · <a href="${esc(p.filingUrl)}" target="_blank" rel="noopener">View filing</a>`)}</p>
      </div></div>
      <div class="col-5 reveal"><div class="card pro-teaser" style="height:100%">
        <div class="card-label"><span>QWERTx Pro</span></div>
        <h3>See the whole portfolio</h3>
        <ul class="list-check">
          <li><i class="fa-solid fa-check" aria-hidden="true"></i><span>All ${p.topN ? `top ${p.topN}` : int(p.holdingsCount)} positions with weights</span></li>
          <li><i class="fa-solid fa-check" aria-hidden="true"></i><span>${moves ? `${int(moves)} buys and sells` : 'Every buy and sell'} from the latest quarter</span></li>
          <li><i class="fa-solid fa-check" aria-hidden="true"></i><span>Which of <b>your</b> stocks ${esc(inv.manager)} owns, and an email when that changes</span></li>
        </ul>
        <div class="btn-row mt-32"><a class="btn btn-gold" href="/pro.html">See QWERTx Pro</a><a class="btn" href="/account.html#smart">I’m a member</a></div>
      </div></div>
    </div>
    ${(inv.philosophy || []).length ? `<div class="card mt-32 reveal"><div class="card-label"><span>How ${esc(inv.manager.split(' & ')[0])} invests</span>${(inv.tags || []).map((t) => `<span class="tag tag-gold">${esc(t)}</span>`).join(' ')}</div><ul class="list-check">${inv.philosophy.map((x) => `<li><i class="fa-solid fa-angle-right" aria-hidden="true"></i><span>${esc(x)}</span></li>`).join('')}</ul></div>` : ''}
  </div>
</section>
${proCta}`;
  return {
    page: 'investors',
    path: `/investors/${inv.slug}.html`,
    title: `${inv.manager} Portfolio: Top Holdings from the Latest 13F`,
    description: `${inv.manager} (${inv.firm}) latest 13F portfolio: ${int(p.holdingsCount)} US stock positions worth ${money(p.totalValue)} as of ${quarter(p.period)}. Top holdings: ${top5.map((h) => h.label).join(', ')}.`,
    body,
    charts: false,
  };
}

/** "More investors in QWERTx Pro" section for the Fund Managers page, grouped by category. */
export function proInvestorsSection(d) {
  const list = d.proOnly || [];
  if (!list.length) return '';
  const order = ['value', 'growth', 'activist', 'quant', 'canada', 'more'];
  const groups = order.map((c) => [c, list.filter((i) => (i.categories || [])[0] === c)]).filter(([, l]) => l.length);
  return `<section class="section-sm" id="more-investors">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:24px"><div><div class="card-label" style="margin:0"><span>QWERTx Pro</span></div><h2 style="font-size:32px;margin:6px 0 0">${list.length} more investor${list.length > 1 ? "s" : ""} in QWERTx Pro</h2></div><p>Growth funds, activists, quant giants and Canadian firms. See who they are and their top holdings here; their full portfolios, moves and alerts are part of Pro.</p></div>
    ${groups.map(([c, l]) => `<h3 class="mt-32" style="font-size:19px">${esc(CAT_LABEL[c])}s</h3><div class="v-grid">${l.sort((a, b) => b.p.totalValue - a.p.totalValue).map((i) => `<a class="v-card" href="/investors/${i.slug}.html"><span class="avatar" aria-hidden="true">${esc(i.avatar)}</span><b>${esc(i.manager)}</b><div class="firm">${esc(i.firm)}</div><div class="row"><span>${money(i.p.totalValue)}</span><span><i class="fa-solid fa-lock" aria-hidden="true"></i> Pro</span></div><div class="top3">${i.p.holdings.slice(0, 3).map((h) => `<span class="v-tk">${esc(h.label)}</span>`).join('')}</div></a>`).join('')}</div>`).join('')}
  </div>
</section>`;
}
