import { esc, money, int, date } from '../lib/format.mjs';
import { chart, tkr, rankList, sourceChip, kpi, pageHero, newsletter, partyChip } from '../parts.mjs';

const typeBadge = (t) => (t.type === 'buy' ? '<span class="act act-add">Buy</span>' : '<span class="act act-trim">Sell</span>');

export function politicians(d) {
  const P = d.politics;
  const q = P.quarters[0];
  const prev = P.quarters[1];
  const partyBar = (x) => {
    const tot = x.buys + x.sells || 1;
    return `<div class="split-bar" role="img" aria-label="${x.buys} buys and ${x.sells} sells"><span class="b" style="width:${(x.buys / tot) * 100}%"></span><span class="s" style="width:${(x.sells / tot) * 100}%"></span></div>`;
  };
  const empty = '<p class="form-note">Trades appear after the first disclosure update.</p>';

  const body = `${pageHero({
    crumbs: [['Politicians']],
    eyebrow: 'Congress trading tracker',
    h1: 'What politicians are <span class="accent">buying and selling</span>',
    lead: 'Members of Congress must disclose stock trades within 45 days under the STOCK Act. We read every electronic filing from the House Clerk and the Senate, and turn it into a quarterly scoreboard.',
    img: 'market-pulse.jpg',
    imgAlt: 'Flowing waves of gold and teal light across a dark background',
  })}
${q ? `<section class="section-sm">
  <div class="container">
    <h2 class="sr-only">This quarter at a glance</h2>
    <div class="row">
      ${kpi(`Trades · ${esc(q.label)}`, int(q.trades), prev ? `${int(prev.trades)} in ${esc(prev.label)}` : 'By transaction date')}
      ${kpi('Members trading', q.members, 'House and Senate')}
      ${kpi('Buys / sells', `<span class="up">${q.buys}</span> / <span class="down">${q.sells}</span>`, 'Stock transactions')}
      ${kpi('Estimated volume', money(q.estValue), 'Midpoint of reported ranges')}
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-7"><div class="card chart-card reveal" style="height:100%">
        <div class="card-label"><span>01 · Most bought</span><span>${esc(q.label)} · members buying</span></div><h3>Stocks Congress bought the most</h3>
        ${q.mostBought.length ? chart('pol-bought', 'bars', { items: q.mostBought.slice(0, 12).map((r) => ({ ticker: r.ticker, name: r.name, value: r.buyers })), unit: '{v} members bought' }, { cls: 'chart chart-lg', label: 'Bar chart of stocks bought by the most members of Congress' }) : empty}
        <p class="caption"><b>What this means</b>Counts are distinct members who disclosed a purchase. Spouse and joint accounts are included, as the law requires.</p>
      </div></div>
      <div class="col-5"><div class="card reveal" style="height:100%">
        <div class="card-label"><span>02 · Most sold</span><span>${esc(q.label)}</span></div><h3>Stocks Congress sold the most</h3>
        ${q.mostSold.length ? rankList(q.mostSold.slice(0, 10).map((r) => ({ t: tkr(r.ticker, r.stock?.hasPage ? r.stock.slug : null), small: esc(r.name), v: `<span class="down">${r.sellers} selling</span>` }))) : empty}
      </div></div>
    </div>
  </div>
</section>
<section class="section-sm">
  <div class="container">
    <div class="row">
      <div class="col-5"><div class="card reveal" style="height:100%">
        <div class="card-label"><span>03 · By party</span><span>${esc(q.label)}</span></div><h3>Who is buying, who is selling</h3>
        ${['D', 'R', 'I'].filter((k) => q.party[k].buys + q.party[k].sells).map((k) => `<div class="party-row"><div class="row between center">${partyChip(k)} <b style="color:var(--text)">${k === 'D' ? 'Democrats' : k === 'R' ? 'Republicans' : 'Independents'}</b><span class="mono" style="margin-left:auto;font-size:13px"><span class="up">${q.party[k].buys} buys</span> · <span class="down">${q.party[k].sells} sells</span></span></div>${partyBar(q.party[k])}</div>`).join('') || empty}
        <div class="legend"><span><i style="background:var(--teal)"></i>Buys</span><span><i style="background:var(--coral)"></i>Sells</span></div>
      </div></div>
      <div class="col-7"><div class="card reveal" style="height:100%">
        <div class="card-label"><span>04 · Most active</span><span>${esc(q.label)}</span></div><h3>Members with the most trades</h3>
        ${q.activeMembers.length ? rankList(q.activeMembers.slice(0, 10).map((m) => ({ t: `${partyChip(m.party)} <b style="color:var(--text)">${esc(m.member)}</b>`, small: `${esc(m.chamber)}${m.state ? ' · ' + esc(m.state) : ''} · ${m.top.map((t) => esc(t)).join(', ')}`, v: `${m.trades} trades · <span class="up">${m.buys}</span>/<span class="down">${m.sells}</span>` }))) : empty}
      </div></div>
    </div>
  </div>
</section>
${q.overlap.length ? `<section class="section-sm">
  <div class="container">
    <div class="card reveal">
      <div class="card-label"><span>05 · Smart money overlap</span></div><h3>Bought by Congress, owned by super investors</h3>
      <ul class="rank-list">${q.overlap.map((r) => `<li><span class="r">${tkr(r.ticker, r.stock.slug)}</span><span class="t"><b style="color:var(--text)">${esc(r.name)}</b><small>${r.buyers} member${r.buyers > 1 ? 's' : ''} bought · held by ${r.stock.holders.slice(0, 3).map((x) => esc(x.inv.manager)).join(', ')}${r.stock.owners > 3 ? ` +${r.stock.owners - 3}` : ''}</small></span><span class="v">${r.stock.owners} super investor${r.stock.owners > 1 ? 's' : ''}</span></li>`).join('')}</ul>
    </div>
  </div>
</section>` : ''}` : `<section class="section-sm"><div class="container"><div class="card">${empty}</div></div></section>`}
<section class="section-sm" id="latest">
  <div class="container">
    <div class="row between center reveal" style="margin-bottom:20px"><div><div class="card-label" style="margin:0"><span>06 · Latest disclosures</span></div><h2 style="font-size:32px;margin:6px 0 0">Recent congressional stock trades</h2></div>${sourceChip('House Clerk · Senate eFD')}</div>
    <div class="table-wrap reveal"><table class="data" data-sortable style="min-width:820px">
      <caption class="sr-only">Latest stock trades disclosed by members of Congress</caption>
      <thead><tr><th scope="col">Member</th><th scope="col">Stock</th><th scope="col">Type</th><th class="num" scope="col">Amount</th><th class="num" scope="col">Traded</th><th class="num" scope="col">Disclosed</th><th scope="col">Owner</th></tr></thead>
      <tbody>${P.latest
        .map((t) => {
          const s = d.stockByTicker.get(t.ticker);
          return `<tr><td data-v="${esc(t.member)}">${partyChip(t.party)} <span style="color:var(--text);font-weight:600">${esc(t.member)}</span><div class="tkr-name">${esc(t.chamber)}${t.state ? ' · ' + esc(t.state) + (t.district ? '-' + esc(t.district) : '') : ''}</div></td><td data-v="${esc(t.ticker)}">${tkr(t.ticker, s?.hasPage ? s.slug : null)}<div class="tkr-name">${esc(cleanAsset(t.asset))}</div></td><td data-v="${t.type}">${typeBadge(t)}${t.partial ? ' <span class="form-note">partial</span>' : ''}</td><td class="num" data-v="${t.amount?.mid || 0}">${esc(t.amount?.label || '—')}</td><td class="num" data-v="${t.date || ''}">${date(t.date)}</td><td class="num" data-v="${t.filed || ''}"><a href="${esc(t.source)}" target="_blank" rel="noopener nofollow">${date(t.filed)}</a></td><td>${esc(ownerLabel(t.owner))}</td></tr>`;
        })
        .join('')}</tbody></table></div>
    <p class="form-note" style="margin-top:14px">Amounts are the ranges members must report, not exact values. Only electronically filed reports with a stock ticker are included; scanned paper filings are skipped. Updated daily${P.updatedAt ? `, last on ${date(P.updatedAt)}` : ''}.</p>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="row row-wide">
      <div class="col-5 reveal"><div class="eyebrow">FAQ</div><h2>Reading congressional trades</h2><p class="lead">What the STOCK Act data can and can’t tell you.</p></div>
      <div class="col-7 reveal"><div class="accordion">
        <details open><summary>Where does this data come from?</summary><div class="acc-body">Periodic Transaction Reports filed with the Clerk of the House and the Secretary of the Senate. We read the official documents directly, then add party and state from the public congress-legislators dataset.</div></details>
        <details><summary>How fast is it?</summary><div class="acc-body">Members have up to 45 days after a trade to disclose it, and some file late. A quarter’s numbers keep growing for about six weeks after it ends.</div></details>
        <details><summary>Why are amounts shown as ranges?</summary><div class="acc-body">The law only requires a value band, such as $1,001–$15,000. Our dollar totals use the midpoint of each band, so treat them as rough estimates.</div></details>
        <details><summary>Should I copy politicians’ trades?</summary><div class="acc-body">Disclosures arrive weeks late, many trades are made by advisers or spouses, and amounts are imprecise. Use this as one input for research, not a signal to act on.</div></details>
      </div></div>
    </div>
  </div>
</section>
${newsletter('pol')}`;
  return { page: 'politicians', path: '/politicians.html', title: 'Congress Stock Trades: What Politicians Are Buying', description: `What members of Congress are buying and selling${q ? ` in ${q.label}` : ''}: most bought stocks, most active traders, party split and the latest STOCK Act disclosures from the House and Senate.`, body, charts: true };
}

export function cleanAsset(a) {
  return String(a || '')
    .replace(/^.*?(?:Joint Brokerage|Brokerage|IRA|Account|Trust)\s*[>\]]\s*/i, '')
    .replace(/^(?:F\s*S\s*:\s*\w+\s*)?(?:S\s*O\s*:\s*[^>]*>\s*)?/i, '')
    .replace(/^(?:SP|JT|DC)\s+/, '')
    .replace(/\s*\([A-Z0-9.\-]+\)\s*\[\w+\]\s*$/, '')
    .replace(/\s*-\s*Common Stock$/i, '')
    .replace(/\s+Common Stock$/i, '')
    .trim()
    .slice(0, 70);
}

const ownerLabel = (o) => ({ SP: 'Spouse', JT: 'Joint', DC: 'Dependent child', Self: 'Self', Spouse: 'Spouse', Joint: 'Joint' })[o] || o || 'Self';
