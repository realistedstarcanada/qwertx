// Market calendar: the economic releases that move markets and the big companies reporting earnings.
import { esc, date } from '../lib/format.mjs';
import { pageHero, newsletter } from '../parts.mjs';

const flag = (c) => `<span class="cal-flag" title="${c === 'CA' ? 'Canada' : 'United States'}">${c === 'CA' ? 'CA' : 'US'}</span>`;
const verdictChip = (v) => (v ? `<span class="cal-verdict v-${v.tone}">${esc(v.text)}</span>` : '');
const whenIcon = (t) => (t === 'bmo' ? '<i class="fa-solid fa-sun" aria-hidden="true"></i> Before open' : t === 'amc' ? '<i class="fa-solid fa-moon" aria-hidden="true"></i> After close' : '<i class="fa-regular fa-clock" aria-hidden="true"></i> Time not set');
const money = (n) => (n == null ? '' : `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`);

function nums(e) {
  const cell = (k, v, cls = '') => (v ? `<div class="${cls}"><span>${k}</span><b>${esc(v)}</b></div>` : '');
  if (e.key === 'election' || e.key === 'chair' || e.key === 'minutes') return '';
  // Rate decisions: the pill says it all until the decision is out.
  if ((e.key === 'fed' || e.key === 'boc') && !e.released) return '';
  return `<div class="cal-nums">${e.released ? cell('Actual', e.actual, 'is-actual') : ''}${cell('Forecast', e.forecast)}${cell(e.released ? 'Previous' : 'Last time', e.previous)}</div>`;
}

/** One economic release, explained. */
export function econRow(e, { compact = false } = {}) {
  const also = e.also.filter((a) => a.actual || a.previous || a.forecast);
  return `<li class="cal-ev${e.tier === 'big' ? ' is-big' : ''}">
  <div class="cal-when"><b>${esc(e.dayLabel)}</b><span>${esc(e.time)}</span></div>
  <div class="cal-ico" aria-hidden="true"><i class="fa-solid ${esc(e.icon)}"></i></div>
  <div class="cal-main">
    <div class="cal-title">${flag(e.country)}<span>${esc(e.name)}</span>${e.tier === 'big' ? '<span class="cal-tier">Market mover</span>' : ''}${e.period ? `<span class="cal-period">${esc(e.period)}</span>` : ''}</div>
    ${compact ? '' : `<p class="cal-what">${esc(e.what)}</p>
    <details class="cal-why"><summary>Why it matters</summary><p>${esc(e.why)}</p></details>`}
    ${also.length && !compact ? `<div class="cal-also">${also.map((a) => `<span>${esc(a.label)}: <b>${esc(a.actual || a.forecast || a.previous)}</b>${a.actual ? '' : a.forecast ? ' expected' : ' last time'}</span>`).join('')}</div>` : ''}
  </div>
  <div class="cal-side">${nums(e)}${verdictChip(e.verdict)}</div>
</li>`;
}

/** A company reporting earnings. */
export function earnCard(r) {
  const tag = r.slug ? 'a' : 'div';
  return `<${tag} class="earn-co"${r.slug ? ` href="/stocks/${esc(r.slug)}.html"` : ''}>
  <span class="tk">${esc(r.ticker)}</span>
  <span class="nm">${esc(r.stockName || r.name.replace(/,? (Inc|Corporation|Corp|Ltd|plc|N\.V\.|S\.A\.|Company)\.?\s*$/i, ''))}</span>
  <span class="when">${whenIcon(r.time)}</span>
  ${r.eps != null ? `<span class="eps">EPS <b>${money(r.eps)}</b>${r.epsForecast != null ? ` vs ${money(r.epsForecast)} est.` : ''}</span>${r.epsForecast != null ? `<span class="cal-verdict ${r.eps >= r.epsForecast ? 'v-good' : 'v-bad'}" style="align-self:flex-start;margin-top:4px">${r.eps > r.epsForecast ? 'Beat estimate' : r.eps === r.epsForecast ? 'Met estimate' : 'Missed estimate'}</span>` : ''}` : r.epsForecast != null ? `<span class="eps">EPS est. <b>${money(r.epsForecast)}</b>${r.lastYearEps != null ? ` · last year ${money(r.lastYearEps)}` : ''}</span>` : ''}
  ${r.owners ? `<span class="own"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> ${r.owners} fund manager${r.owners > 1 ? 's' : ''} own it</span>` : ''}
</${tag}>`;
}

export function earnDay(day, { max = 10 } = {}) {
  const shown = day.items.slice(0, max);
  const rest = day.items.slice(max);
  return `<div class="earn-day"><div class="earn-date"><b>${esc(day.label)}</b><span>${day.items.length} compan${day.items.length > 1 ? 'ies' : 'y'}</span></div>
  <div class="earn-grid">${shown.map(earnCard).join('')}</div>
  ${rest.length ? `<details class="earn-more"><summary>${rest.length} more reporting</summary><div class="earn-grid">${rest.map(earnCard).join('')}</div></details>` : ''}</div>`;
}

const legend = `<div class="cal-legend">
  <span><span class="cal-tier">Market mover</span> Can swing the whole market on the day</span>
  <span><b>Forecast</b> What economists expect, on average</span>
  <span><b>Hotter / cooler</b> Inflation above or below the forecast</span>
  <span><b>Stronger / weaker</b> The economy did better or worse than expected</span>
</div>`;

/** Compact "coming up" panel for the home and Market Mood pages. */
export function comingUp(c, { earnings = 8 } = {}) {
  if (!c) return '';
  const ev = c.weeks.flatMap((w) => w.events).filter((e) => e.tier === 'big' || c.weeks[0]?.events.includes(e)).slice(0, 5);
  const er = c.earnings.thisWeek.length ? c.earnings.thisWeek : c.earnings.weeks[0]?.days.flatMap((d) => d.items) || [];
  return `<div class="cal-coming">
  <div class="card"><div class="card-label"><span>Economic calendar</span><span>Times in ET</span></div><h3>Dates that can move markets</h3>
    ${ev.length ? `<ul class="cal-list is-compact">${ev.map((e) => econRow(e, { compact: true })).join('')}</ul>` : '<p class="form-note">No major releases scheduled in the next two weeks.</p>'}
    <a class="link-arrow" href="/calendar.html">Full calendar, explained <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>
  <div class="card"><div class="card-label"><span>Earnings</span><span>${c.earnings.thisWeek.length ? 'This week' : 'Coming up'}</span></div><h3>Big companies reporting</h3>
    ${er.length ? `<div class="earn-mini">${er.slice(0, earnings).map((r) => `<${r.slug ? `a href="/stocks/${esc(r.slug)}.html"` : 'span'} class="earn-pill"><b>${esc(r.ticker)}</b><span>${esc(new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }))} · ${r.time === 'bmo' ? 'AM' : r.time === 'amc' ? 'PM' : '—'}</span></${r.slug ? 'a' : 'span'}>`).join('')}</div>` : '<p class="form-note">No major earnings this week.</p>'}
    <a class="link-arrow" href="/calendar.html#earnings">All earnings dates <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>
</div>`;
}

export function calendarPage(d) {
  const c = d.calendar;
  const empty = '<p class="form-note">The calendar fills in after the next daily update.</p>';
  const body = `${pageHero({
    crumbs: [['Market Mood', '/market.html'], ['Calendar']],
    eyebrow: 'Market calendar',
    h1: 'What’s coming up, <span class="accent">and why it matters</span>',
    lead: 'The handful of economic reports and company earnings that actually move markets, in plain English. We skip the noise: no minor surveys, no speeches by every Fed official.',
  })}
<section class="section-sm">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:18px"><div><div class="eyebrow">Economy · US &amp; Canada</div><h2 style="font-size:34px">Key economic dates</h2></div><p>Times are Eastern. Forecasts are the average expectation of economists and fill in a few days before each release.</p></div>
    ${legend}
    ${c && c.weeks.length ? c.weeks.map((w) => `<div class="cal-week reveal"><div class="cal-week-head"><h3>${esc(w.label)}</h3><span>${esc(w.range || 'Only the biggest dates')}</span></div><ul class="cal-list">${w.events.map((e) => econRow(e)).join('')}</ul></div>`).join('') : empty}
  </div>
</section>
${c && c.recent.length ? `<section class="section-sm">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:18px"><div><div class="eyebrow">Just released</div><h2 style="font-size:34px">How the latest numbers came in</h2></div><p>The past week’s releases compared with what economists expected.</p></div>
    <div class="card reveal"><ul class="cal-list is-compact">${c.recent.filter((e) => e.actual || e.verdict).map((e) => econRow(e, { compact: true })).join('')}</ul></div>
  </div>
</section>` : ''}
<section class="section-sm" id="earnings">
  <div class="container">
    <div class="section-head reveal" style="margin-bottom:18px"><div><div class="eyebrow">Earnings season</div><h2 style="font-size:34px">Big companies reporting earnings</h2></div><p>Companies worth $50B or more, plus any stock several of our fund managers own. Tap a company for its owners and chart.</p></div>
    <div class="cal-legend"><span><i class="fa-solid fa-sun" aria-hidden="true"></i> <b>Before open</b> Results before 9:30 am ET</span><span><i class="fa-solid fa-moon" aria-hidden="true"></i> <b>After close</b> Results after 4 pm ET, so the stock reacts the next morning</span><span><b>EPS est.</b> Profit per share analysts expect</span></div>
    ${c && c.earnings.weeks.length ? c.earnings.weeks.map((w) => `<div class="cal-week reveal"><div class="cal-week-head"><h3>${esc(w.label)}</h3><span>${w.days.reduce((a, x) => a + x.items.length, 0)} companies</span></div>${w.days.map((x) => earnDay(x)).join('')}</div>`).join('') : empty}
    ${c && c.earnings.reported.length ? `<div class="cal-week reveal"><div class="cal-week-head"><h3>Recently reported</h3><span>Actual profit per share vs. the estimate</span></div><div class="earn-grid">${c.earnings.reported.map(earnCard).join('')}</div></div>` : ''}
    <p class="form-note" style="margin-top:14px">Sources: economic releases from TradingView’s public calendar, earnings dates from Nasdaq. Companies sometimes move their dates, so confirm on the company’s investor-relations page before acting.${c?.updatedAt ? ` Updated ${date(c.updatedAt)}.` : ''}</p>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="row row-wide">
      <div class="col-5 reveal"><div class="eyebrow">FAQ</div><h2>Using the calendar</h2><p class="lead">How busy investors can use this without trading on headlines.</p></div>
      <div class="col-7 reveal"><div class="accordion">
        <details open><summary>Why only a few events?</summary><div class="acc-body">Most calendars list hundreds of releases a month. Only a handful reliably move markets: interest-rate decisions, inflation, the jobs report and GDP. We show those, plus a few useful reads on consumers, housing and business, and skip the rest.</div></details>
        <details><summary>What does “hotter than expected” mean?</summary><div class="acc-body">Inflation came in above what economists forecast. That usually means interest rates stay higher for longer, which tends to weigh on stocks and bonds. “Cooler” is the opposite.</div></details>
        <details><summary>Should I trade around these dates?</summary><div class="acc-body">Prices can jump in either direction within seconds of a release, and professionals react faster than anyone can. For long-term investors these dates are mostly context: they explain why the market moved, not a signal to act.</div></details>
        <details><summary>What happens on earnings day?</summary><div class="acc-body">The company reports last quarter’s sales and profit and often updates its outlook. The stock can move sharply if results or guidance differ from what analysts expected. If it reports after the close, the move shows up the next morning.</div></details>
      </div></div>
    </div>
  </div>
</section>
${newsletter('cal')}`;
  return { page: 'calendar', path: '/calendar.html', title: 'Market Calendar: Economic Dates and Earnings, Explained', description: 'The economic reports and company earnings that move markets this week and next, explained in plain English: Fed and Bank of Canada decisions, inflation, jobs, GDP and big-company earnings dates.', body };
}
