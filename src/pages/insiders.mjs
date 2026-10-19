import { esc, money, int, date, cleanName } from '../lib/format.mjs';
import { chart, tkr, rankList, vRank, sourceChip, kpi, pageHero, newsletter, tip } from '../parts.mjs';
import { titleish } from './home.mjs';

export function insiders(d) {
  const I = d.insiders;
  const slugOf = (t) => {
    const s = d.stockByTicker.get(t);
    return s?.hasPage ? s.slug : null;
  };
  const tradeRows = (list) =>
    list
      .map((t) => `<tr><td data-v="${esc(t.ticker)}">${tkr(t.ticker, slugOf(t.ticker))}<div class="tkr-name">${esc(cleanName(t.company))}</div></td><td data-v="${esc(t.owner)}"><span style="color:var(--text);font-weight:600">${esc(titleish(t.owner))}</span><div class="tkr-name">${esc(t.role)}</div></td><td class="num" data-v="${t.value}">${money(t.value)}</td><td class="num" data-v="${t.shares}">${int(t.shares)}</td><td class="num" data-v="${t.price}">$${t.price.toFixed(2)}</td><td class="num" data-v="${t.date}">${date(t.date)}</td><td>${t.plan ? '<span class="tag">10b5-1 plan</span>' : '<span class="form-note">—</span>'}</td><td><a href="https://www.sec.gov/Archives/edgar/data/${Number(t.issuerCik)}/${String(t.acc).replace(/-/g, '')}/${t.acc}-index.htm" target="_blank" rel="noopener nofollow" aria-label="Form 4 filing"><i class="fa-solid fa-arrow-up-right-from-square"></i></a></td></tr>`)
      .join('');
  const table = (id, caption, list) => `<div class="table-wrap reveal"><table class="data" data-sortable style="min-width:860px" id="${id}">
      <caption class="sr-only">${caption}</caption>
      <thead><tr><th scope="col">Company</th><th scope="col">Insider</th><th class="num" scope="col">Value</th><th class="num" scope="col">Shares</th><th class="num" scope="col">Price</th><th class="num" scope="col">Date</th><th scope="col">Plan</th><th scope="col"><span class="sr-only">Filing</span></th></tr></thead>
      <tbody>${tradeRows(list)}</tbody></table></div>`;

  if (!I) {
    return { page: 'insiders', path: '/insiders.html', title: 'Insider Trading Tracker', description: 'What company executives and directors are buying and selling, from SEC Form 4 filings.', body: pageHero({ crumbs: [['Insiders']], eyebrow: 'Insider trading tracker', h1: 'What executives are buying', lead: 'Insider data appears after the first quarterly update.' }) };
  }
  const T = I.totals;
  const months = Object.keys(I.monthly || {}).sort().slice(-6);
  const ratio = T.sellValue ? T.buyValue / T.sellValue : 0;
  const body = `${pageHero({
    crumbs: [['Insiders']],
    eyebrow: `Insider trading tracker · ${esc(I.label)}`,
    h1: 'What company insiders are <span class="accent">buying and selling</span>',
    lead: 'Officers, directors and large shareholders must report trades in their own company’s stock on SEC Form 4 within two business days. Insiders sell for many reasons, but they usually buy for one: they think the stock is cheap.',
    img: 'article-13f.jpg',
    imgAlt: 'Glowing financial documents and charts',
  })}
<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">${esc(I.label)} at a glance</h2>
    <div class="row">
      ${kpi('Open-market buys', `<span class="up">${int(T.buys)}</span>`, `${money(T.buyValue)} across ${int(T.buyCompanies)} companies`)}
      ${kpi('Open-market sells', `<span class="down">${int(T.sells)}</span>`, `${money(T.sellValue)} across ${int(T.sellCompanies)} companies`)}
      ${kpi('Buy / sell ratio', `${ratio.toFixed(2)}×`, 'By dollar value')}
      ${kpi(`Planned sales${tip('10b5-1')}`, `${Math.round((T.plannedSells / (T.sells || 1)) * 100)}%`, 'Made under 10b5-1 trading plans')}
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-7"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>01 · Cluster buys</span><span>3+ officers or directors buying</span></div><h3>Where several insiders bought at once${tip('cluster')}</h3>
        ${I.clusterBuys.length ? chart('clusters', 'bars', { items: I.clusterBuys.slice(0, 12).map((c) => ({ ticker: c.ticker, name: cleanName(c.company), value: c.insiders })), unit: '{v} insiders bought' }, { cls: 'chart chart-lg', label: 'Bar chart of companies where the most insiders bought shares' }) : '<p class="form-note">No cluster buys this quarter.</p>'}
        <p class="caption"><b>What this means</b>One insider buying can be noise. Several executives and directors buying in the same quarter is one of the stronger signals in public data, though it is never a guarantee.</p>
      </div></div>
      <div class="col-5"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>02 · Monthly flow</span><span>Number of trades</span></div><h3>Buying vs selling by month</h3>
        ${months.length ? chart('ins-monthly', 'split', { labels: months.map((m) => date(m + '-15').replace(/^\d+ /, '')), buys: months.map((m) => I.monthly[m].buy), sells: months.map((m) => I.monthly[m].sell) }, { label: 'Bar chart of insider buys and sells by month' }) : ''}
        <div class="legend"><span><i style="background:var(--teal)"></i>Buys</span><span><i style="background:var(--coral)"></i>Sells</span></div>
        <p class="caption"><b>What this means</b>Insiders almost always sell more than they buy, through stock awards and diversification. Watch for months when buying rises.</p>
      </div></div>
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-2"><div class="card reveal" style="height:100%"><div class="card-label"><span>03 · Top companies bought</span><span>${esc(I.label)}</span></div><h3>Most insider money in</h3>${vRank(I.topBuyCompanies.slice(0, 10).map((c) => ({ name: cleanName(c.company), href: slugOf(c.ticker) ? `/stocks/${slugOf(c.ticker)}.html` : null, sub: `${esc(c.ticker)} · ${c.insiders} insider${c.insiders > 1 ? 's' : ''}`, value: `<span class="up">${money(c.value)}</span>` })))}</div></div>
      <div class="col-2"><div class="card reveal" style="height:100%"><div class="card-label"><span>04 · Top companies sold</span><span>${esc(I.label)}</span></div><h3>Most insider money out</h3>${vRank(I.topSellCompanies.slice(0, 10).map((c) => ({ name: cleanName(c.company), href: slugOf(c.ticker) ? `/stocks/${slugOf(c.ticker)}.html` : null, sub: `${esc(c.ticker)} · ${c.insiders} insider${c.insiders > 1 ? 's' : ''}`, value: `<span class="down">${money(c.value)}</span>` })))}</div></div>
    </div>
  </div>
</section>
${I.overlap.length ? `<section class="section-sm">
  <div class="container">
    <div class="card reveal">
      <div class="card-label"><span>05 · Smart money overlap</span></div><h3>Insiders buying stocks super investors own</h3>
      <ul class="rank-list">${I.overlap.map((x, i) => `<li><span class="r">${String(i + 1).padStart(2, '0')}</span><span class="t">${tkr(x.ticker, x.stock.slug)} <b style="color:var(--text)">${esc(x.stock.name)}</b><small>${x.insiders} insider${x.insiders > 1 ? 's' : ''} bought ${money(x.value)} · held by ${x.stock.holders.slice(0, 3).map((h) => esc(h.inv.manager)).join(', ')}${x.stock.owners > 3 ? ` +${x.stock.owners - 3}` : ''}</small></span><span class="v">${x.stock.owners} super investor${x.stock.owners > 1 ? 's' : ''}</span></li>`).join('')}</ul>
    </div>
  </div>
</section>` : ''}
<section class="section-sm">
  <div class="container">
    <div class="row between center reveal" style="margin-bottom:20px"><div><div class="card-label" style="margin:0"><span>06 · Executive purchases</span></div><h2 style="font-size:32px;margin:6px 0 0">Largest buys by officers and directors</h2></div>${sourceChip('SEC Form 4 · code P')}</div>
    ${table('exec-buys', `Largest insider purchases by officers and directors, ${I.label}`, (I.topExecBuys || I.topBuys).slice(0, 25))}
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row between center reveal" style="margin-bottom:20px"><div><div class="card-label" style="margin:0"><span>07 · Executive sales</span></div><h2 style="font-size:32px;margin:6px 0 0">Largest sales by officers and directors</h2></div>${sourceChip('SEC Form 4 · code S')}</div>
    ${table('exec-sells', `Largest insider sales by officers and directors, ${I.label}`, (I.topExecSells || I.topSells).slice(0, 25))}
    <p class="form-note" style="margin-top:14px">Open-market purchases (code P) and sales (code S) reported on Form 4, dated in or shortly before ${esc(I.label)}. Large-shareholder and fund transactions are counted in the totals but left out of these two tables. Source: SEC Insider Transactions Data Sets, published quarterly.${I.previous?.length ? ` Previous quarters: ${I.previous.map((p) => `${esc(p.label)} ${int(p.totals.buys)} buys / ${int(p.totals.sells)} sells`).join(' · ')}.` : ''}</p>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="row row-wide">
      <div class="col-5 reveal"><div class="eyebrow">FAQ</div><h2>Reading insider trades</h2><p class="lead">Short answers to the questions we hear most.</p></div>
      <div class="col-7 reveal"><div class="accordion">
        <details open><summary>Who counts as an insider?</summary><div class="acc-body">Officers, directors and anyone owning more than 10% of a company’s shares. They must report trades in that company’s stock on SEC Form 4, usually within two business days.</div></details>
        <details><summary>What is a 10b5-1 plan?</summary><div class="acc-body">A pre-arranged trading plan set up in advance, often to sell shares on a schedule. Planned sales say little about an insider’s current view, so we flag them.</div></details>
        <details><summary>Why focus on purchases?</summary><div class="acc-body">Insiders sell for taxes, diversification or a new house. Buying with their own cash in the open market is rarer and more telling, especially when several insiders do it together.</div></details>
      </div></div>
    </div>
  </div>
</section>
${newsletter('ins')}`;
  return { page: 'insiders', path: '/insiders.html', title: `Insider Trading Tracker ${I.label}: What Executives Are Buying`, description: `Largest insider purchases and sales in ${I.label}, cluster buys where several executives bought at once, and insider buying in stocks super investors own. From SEC Form 4 data.`, body, charts: true };
}
