// Market Weather: turns official economic data (data/macro.json), the market snapshot (data/market.json) and
// QWERTx's own smart-money aggregates into plain-English cards, five dials and one headline, for the US and Canada.
// Every number shown comes from a named source; anything missing is left out rather than estimated.

const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (iso, freq) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (freq === 'q') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (freq === 'm') return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** NY Fed yield-curve model: probability of a US recession 12 months ahead from the 10-year minus 3-month spread. */
export const recessionProbability = (spread) => phi(-0.5333 - 0.633 * spread) * 100;

/** Share (0–100) of history at or below the latest value. */
export function percentile(obs, value) {
  const xs = obs.map((o) => o[1]).filter(Number.isFinite);
  if (!xs.length || !Number.isFinite(value)) return null;
  return Math.round((xs.filter((x) => x <= value).length / xs.length) * 100);
}

const yoy = (obs) => {
  const by = new Map(obs.map(([d, v]) => [d.slice(0, 7), v]));
  return obs.map(([d, v]) => {
    const prev = by.get(`${Number(d.slice(0, 4)) - 1}${d.slice(4, 7)}`);
    return prev ? [d, (v / prev - 1) * 100] : null;
  }).filter(Boolean);
};

/** Sahm-style rule on any monthly unemployment series: 3-month average minus the lowest 3-month average of the prior 12 months. */
export function sahm(obs) {
  const avg3 = obs.map((o, i) => (i >= 2 ? [o[0], (obs[i][1] + obs[i - 1][1] + obs[i - 2][1]) / 3] : null)).filter(Boolean);
  return avg3.map((o, i) => (i >= 12 ? [o[0], o[1] - Math.min(...avg3.slice(i - 12, i).map((x) => x[1]))] : null)).filter(Boolean);
}

/**
 * What followed CAPE readings within 10% of today's: average, worst and best real (after-inflation) yearly return
 * over the next 10 years, from Shiller's own total-return series. Null when there are too few comparable months.
 */
export function capeFollowUp(cape, fwd10, now) {
  if (!cape?.length || !fwd10?.length || !(now > 0)) return null;
  const f = new Map(fwd10);
  const near = cape.filter(([d, v]) => f.has(d) && v >= now * 0.9 && v <= now * 1.1).map(([d]) => [d, f.get(d)]);
  if (near.length < 6) return null;
  const rs = near.map((o) => o[1]);
  const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
  const years = [...new Set(near.map(([d]) => d.slice(0, 4)))];
  const span = years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0];
  const sign = (x) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}%`;
  return `In the ${near.length} months with a similar CAPE and a full 10-year record (${span}), stocks returned ${sign(avg)} a year after inflation over the next decade (worst ${sign(Math.min(...rs))}, best ${sign(Math.max(...rs))}).`;
}

/** Month-end closes → latest % distance from the 10-month average, its history, and months on the same side. */
export function trendOf(closes) {
  const c = (closes || []).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (c.length < 10) return null;
  const hist = [];
  for (let i = 9; i < c.length; i++) {
    const avg = c.slice(i - 9, i + 1).reduce((a, [, v]) => a + v, 0) / 10;
    hist.push([c[i][0], (c[i][1] / avg - 1) * 100]);
  }
  const dist = hist.at(-1)[1], up = dist >= 0;
  let months = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i][1] >= 0 === up; i--) months++;
  return { dist, up, months, hist, date: c.at(-1)[0] };
}

function trendCard(id, name, t, date, source) {
  const s = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
  const c = card(id, { name, value: t.dist, digits: 1, unit: '%', date: date || t.date, freq: 'd', source, pos: clamp(50 + t.dist * 2.5), lo: '20% below', hi: '20% above',
    status: t.up ? 'Uptrend' : 'Downtrend', tone: t.up ? 'good' : 'bad',
    meaning: `${t.up ? 'Above' : 'Below'} its average of the last ten month-end closes${t.months > 1 ? ` for ${t.months} months in a row` : ' as of the latest month'}. This is the rule Meb Faber tested across a century of data: deep bear markets have taken prices below this line early on, while the cost is false alarms in choppy years.` });
  c.value = s(t.dist);
  return c;
}

function card(id, { name, value, unit = '', digits = 1, date, freq, source, obs, status, tone, meaning, lo, hi, pos }) {
  const p = pos ?? (obs ? percentile(obs, value) : null);
  const vals = obs ? obs.map((o) => o[1]) : [];
  const fmt = (v) => (v == null ? '' : `${v.toFixed(digits)}${unit}`);
  return {
    id, name, status, tone, meaning, source,
    value: fmt(value), raw: value, date: when(date, freq),
    pos: p == null ? 50 : Math.round(clamp(p) * 10) / 10,
    lo: lo ?? (vals.length ? fmt(Math.min(...vals)) : ''),
    hi: hi ?? (vals.length ? fmt(Math.max(...vals)) : ''),
    since: obs?.length ? obs[0][0].slice(0, 4) : null,
  };
}

const dial = (q, score, label, tone, sub) => ({ q, score: score == null ? null : Math.round(clamp(score)), label, tone, sub });

/**
 * Price and trend read together: valuation sets what the next decade is likely to return, the trend says whether
 * the market is currently rewarding or punishing risk. Historical description only, never an instruction.
 */
export function verdict(valScore, trend) {
  if (!trend) return null;
  if (valScore == null) {
    return trend.up
      ? 'The trend is up. Long-term valuation data for this market isn’t available yet, so read the trend alongside the economy and mood.'
      : 'The trend has turned down. Falls below the 10-month average have often been short false alarms, but every deep bear market started with one.';
  }
  const expensive = valScore >= 70;
  if (expensive && trend.up) return 'Expensive, but still rising. Expensive markets with an upward trend have often kept climbing for a while; the high price tends to show up later, as lower returns over the following decade.';
  if (expensive) return 'Expensive, and the trend has turned down. Historically this mix has carried the highest risk of a deep fall, though not every such signal led to one.';
  if (trend.up) return 'Reasonably priced and rising: historically the friendliest mix for long-term investors.';
  return 'Falling, but not expensive. Patience at times like this has usually been rewarded over the long run, even when the drop went further first.';
}

export function buildWeather({ macro, market, insiders, politics, live, valuation, concentration }) {
  const S = macro?.series || {};
  const has = (k) => S[k]?.obs?.length;
  const last = (k) => S[k]?.last || S[k]?.obs?.at(-1);

  // ---------- QWERTx Smart Money Pulse (shared) ----------
  const pulseCards = [];
  const pulseParts = [];
  if (insiders?.totals) {
    const t = insiders.totals, ratio = t.buys / Math.max(1, t.sells);
    const prevT = insiders.previous?.[0]?.totals;
    const prevRatio = prevT ? prevT.buys / Math.max(1, prevT.sells) : null;
    pulseParts.push(clamp(ratio / 0.6 * 100));
    pulseCards.push(card('ins', {
      name: `Insider buy/sell ratio · ${insiders.label}`, value: ratio, digits: 2, source: 'SEC Form 4 (open-market trades)',
      status: prevRatio == null ? 'Insiders selling' : prevRatio.toFixed(2) === ratio.toFixed(2) ? 'Steady' : ratio > prevRatio ? 'Rising' : 'Falling', tone: ratio >= 0.4 ? 'good' : 'mid', pos: clamp(ratio / 0.8 * 100), lo: 'All selling', hi: 'Buying',
      meaning: `${t.buys.toLocaleString('en-US')} open-market buys vs. ${t.sells.toLocaleString('en-US')} sales${prevRatio != null ? (prevRatio.toFixed(2) === ratio.toFixed(2) ? ', about the same as the quarter before' : `, ${ratio > prevRatio ? 'up' : 'down'} from ${prevRatio.toFixed(2)} the quarter before`) : ''}. Insiders always sell more than they buy; a rising ratio has often come near market lows.`,
    }));
  }
  const pq = politics?.quarters?.[0];
  if (pq?.trades) {
    const share = pq.buys / pq.trades;
    pulseParts.push(share * 100);
    pulseCards.push(card('cg', {
      name: `Congress trades · ${pq.label}`, value: share * 100, digits: 0, unit: '% buys', source: 'House and Senate disclosures',
      status: share > 0.55 ? 'Net buyers' : share < 0.45 ? 'Net sellers' : 'Balanced', tone: 'mid', pos: share * 100, lo: 'All selling', hi: 'All buying',
      meaning: `${pq.buys} purchases and ${pq.sells} sales disclosed by ${pq.members} members of Congress. Disclosures can arrive up to 45 days after a trade.`,
    }));
  }
  if (live?.length) {
    const buys = live.reduce((a, i) => a + (i.p.buys || 0), 0), sells = live.reduce((a, i) => a + (i.p.sells || 0), 0);
    const share = buys / Math.max(1, buys + sells);
    const news = live.reduce((a, i) => a + i.p.holdings.filter((h) => h.act === 'New').length, 0);
    pulseParts.push(share * 100);
    const b = (v) => `$${Math.round(v / 1e9)}B`;
    pulseCards.push(card('f13', {
      name: 'Tracked fund managers · last 13F', value: share * 100, digits: 0, unit: '% buys', source: 'SEC Form 13F',
      status: share > 0.55 ? 'Net buyers' : share < 0.45 ? 'Net sellers' : 'Balanced', tone: share >= 0.5 ? 'good' : 'mid', pos: share * 100, lo: 'All selling', hi: 'All buying',
      meaning: `Our ${live.length} super investors bought about ${b(buys)} and sold ${b(sells)} in their latest quarter, opening ${news} new positions.`,
    }));
  }
  const pulseScore = pulseParts.length ? pulseParts.reduce((a, b) => a + b, 0) / pulseParts.length : null;
  const pulseDial = dial('Smart Money Pulse', pulseScore, pulseScore == null ? 'No data' : pulseScore > 60 ? 'Buying' : pulseScore < 40 ? 'Selling' : 'Mixed', pulseScore == null ? 'mid' : pulseScore > 60 ? 'good' : 'mid', 'Insiders, Congress and fund managers');
  const pulse = { title: 'Smart Money Pulse', q: 'Only on QWERTx: what the people closest to the money are doing', cards: pulseCards };

  // ---------- Mood (shared, US-driven) ----------
  const moodCards = [];
  const fg = market?.fearGreed;
  const fgLabel = (s) => (s < 25 ? 'Extreme fear' : s < 45 ? 'Fear' : s <= 55 ? 'Neutral' : s <= 75 ? 'Greed' : 'Extreme greed');
  if (fg) {
    moodCards.push(card('fg', {
      name: 'CNN Fear & Greed', value: fg.score, digits: 0, source: 'CNN', date: String(fg.asOf || '').slice(0, 10),
      status: fgLabel(fg.score), tone: fg.score < 25 || fg.score > 75 ? 'bad' : 'mid', pos: fg.score, lo: 'Extreme fear', hi: 'Extreme greed',
      meaning: `${fg.previousWeek != null ? `${fg.score > fg.previousWeek ? 'Up' : fg.score < fg.previousWeek ? 'Down' : 'Unchanged'} from ${fg.previousWeek} a week ago` : 'Latest reading'}${fg.previousMonth != null ? ` and ${fg.previousMonth} a month ago` : ''}. Fear has often been a better time to buy than greed.`,
    }));
  }
  const vix = market?.vix;
  if (vix?.last != null) {
    const obs = (vix.dates || []).map((d, i) => [d, vix.values[i]]);
    const p = percentile(obs, vix.last);
    moodCards.push(card('vix', {
      name: 'VIX (expected volatility)', value: vix.last, digits: 2, source: 'Cboe', date: vix.lastDate, obs,
      status: vix.last < 15 ? 'Calm' : vix.last <= 25 ? 'Above normal' : 'Stressed', tone: vix.last < 15 ? 'good' : vix.last <= 25 ? 'mid' : 'bad',
      meaning: `Higher than ${p}% of days in the past year. Traders ${vix.last > 20 ? 'expect bigger swings than usual' : 'expect fairly normal swings'}.`,
    }));
  }
  const moodDial = fg ? dial('Are people scared?', 100 - fg.score, fgLabel(fg.score), fg.score < 25 || fg.score > 75 ? 'bad' : 'mid', `Fear & Greed ${fg.score} of 100`) : dial('Are people scared?', null, 'No data', 'mid', '');

  // ---------- United States ----------
  const us = { economy: [], valuation: [], money: [] };
  let econScore = null, valScore = null, moneyParts = [];
  // "Is money tight?" scores rates on fixed scales, not against post-2008 history (a decade near zero would
  // make any normal rate look tight). Policy rate: 0.5% = 0, 5% = 100. 10-year yield: 1% = 0, 6% = 100.
  const policyScore = (v) => clamp(((v - 0.5) / 4.5) * 100);
  const longScore = (v) => clamp(((v - 1) / 5) * 100);
  if (has('us_gdp')) {
    const [d, v] = last('us_gdp');
    us.economy.push(card('us_gdp', { name: 'Real GDP growth (annualised)', value: v, unit: '%', date: d, freq: 'q', source: S.us_gdp.source, obs: S.us_gdp.obs,
      status: v > 2.5 ? 'Strong' : v >= 1 ? 'Growing' : v >= 0 ? 'Slow' : 'Shrinking', tone: v >= 1 ? 'good' : v >= 0 ? 'mid' : 'bad',
      meaning: v >= 0 ? `The economy grew at a ${v.toFixed(1)}% yearly pace last quarter${v < 2 ? ', below its long-run pace of about 2%' : ''}.` : 'The economy shrank last quarter. Two shrinking quarters in a row is a common rule of thumb for recession.' }));
    econScore = 60 + (v > 2.5 ? 15 : v >= 1 ? 5 : v >= 0 ? -10 : -30);
  }
  if (has('us_unemp')) {
    const obs = S.us_unemp.obs, [d, v] = obs.at(-1), yearAgo = obs.at(-13)?.[1];
    us.economy.push(card('us_unemp', { name: 'Unemployment rate', value: v, unit: '%', date: d, freq: 'm', source: S.us_unemp.source, obs,
      status: yearAgo != null && v - yearAgo >= 0.5 ? 'Rising' : v < 4.5 ? 'Healthy' : 'Elevated', tone: yearAgo != null && v - yearAgo >= 0.5 ? 'bad' : v < 4.5 ? 'good' : 'mid',
      meaning: `${yearAgo != null ? `${v > yearAgo ? 'Up' : v < yearAgo ? 'Down' : 'Unchanged'} from ${yearAgo.toFixed(1)}% a year ago. ` : ''}A fast rise matters more than the level.` }));
  }
  if (has('us_sahm')) {
    const [d, v] = last('us_sahm');
    us.economy.push(card('us_sahm', { name: 'Sahm recession rule', value: v, digits: 2, date: d, freq: 'm', source: S.us_sahm.source, obs: S.us_sahm.obs, lo: '0', hi: '0.50 = signal', pos: clamp(v / 0.5 * 100),
      status: v >= 0.5 ? 'Recession signal' : v >= 0.3 ? 'Watch' : 'No signal', tone: v >= 0.5 ? 'bad' : v >= 0.3 ? 'mid' : 'good',
      meaning: 'Fires when unemployment rises 0.5 points above its recent low. It flagged every US recession since 1970, then gave its first false alarm in 2024, when a jump in job seekers rather than layoffs pushed unemployment up.' }));
    if (econScore != null) econScore += v >= 0.5 ? -20 : v >= 0.3 ? -10 : 0;
  }
  if (has('us_curve')) {
    const m = S.us_curve.obs.at(-1);
    const p = recessionProbability(m[1]);
    us.economy.push(card('us_rec', { name: 'Recession chance, next 12 months', value: p, unit: '%', digits: 0, date: m[0], freq: 'm', source: 'QWERTx, using the NY Fed yield-curve model', lo: '0%', hi: '100%', pos: p,
      status: p < 20 ? 'Low' : p <= 40 ? 'Elevated' : 'High', tone: p < 20 ? 'good' : p <= 40 ? 'mid' : 'bad',
      meaning: 'Based on the gap between 10-year and 3-month Treasury yields, the model the New York Fed publishes. The curve stayed inverted for a record two years in 2022–24 without a recession, so treat it as a warning light, not a forecast.' }));
    if (econScore != null && p > 40) econScore -= 10;
  }
  const ebp = valuation?.ebp;
  if (ebp?.prob?.length) {
    const [d, p] = ebp.prob.at(-1);
    us.economy.push(card('us_ebp_rec', { name: 'Recession chance, Fed bond model', value: p, unit: '%', digits: 0, date: d, freq: 'm', source: ebp.source || 'Federal Reserve Board', lo: '0%', hi: '100%', pos: p,
      status: p < 20 ? 'Low' : p <= 40 ? 'Elevated' : 'High', tone: p < 20 ? 'good' : p <= 40 ? 'mid' : 'bad',
      meaning: 'The Federal Reserve’s own 12-month recession model, built on the excess bond premium (see Money). Since the mid-1980s that premium has carried nearly all of the warning signal in corporate bond markets, and it flagged the 2008 recession early.' }));
    if (econScore != null) econScore += p > 40 ? -10 : p > 25 ? -5 : 0;
  }
  if (has('us_cpi')) {
    const [d, v] = last('us_cpi');
    us.economy.push(card('us_cpi', { name: 'Inflation (CPI, yearly)', value: v, unit: '%', date: d, freq: 'm', source: S.us_cpi.source, obs: S.us_cpi.obs,
      status: v > 4 ? 'High' : v > 2.5 ? 'Above target' : v >= 1 ? 'Near target' : 'Very low', tone: v > 4 ? 'bad' : v > 2.5 || v < 1 ? 'mid' : 'good',
      meaning: v > 2.5 ? 'Prices are rising faster than the Fed’s 2% goal, which keeps interest rates higher for longer.' : 'Close to the Fed’s 2% goal, which gives it room to cut rates.' }));
    if (econScore != null && v > 4) econScore -= 10;
  }
  // "Are stocks expensive?" Long-horizon gauges: each says roughly what the next 10 years may return, never when.
  // The dial is the weighted percentile of CAPE (double weight), household stock allocation and MarketCap/GVA.
  const V = valuation || {};
  const valParts = [];
  const pricey = (p) => ({ status: p >= 90 ? 'Very expensive' : p >= 70 ? 'Expensive' : p >= 30 ? 'Fair' : 'Cheap', tone: p >= 70 ? 'bad' : p >= 30 ? 'mid' : 'good' });
  const higherThan = (p, since) => (p >= 99 ? `Higher than almost every reading since ${since}` : `Higher than ${p}% of readings since ${since}`);
  const capeObs = V.shiller?.cape;
  let capeNow = null;
  if (capeObs?.length) {
    const [d, v] = capeObs.at(-1), p = percentile(capeObs, v);
    capeNow = { v, p };
    const f = capeFollowUp(capeObs, V.shiller.fwd10, v);
    us.valuation.push(card('us_cape', { name: 'Shiller CAPE', value: v, digits: 1, date: d, freq: 'm', source: V.shiller.source || 'Robert Shiller, Yale University', obs: capeObs, ...pricey(p),
      meaning: `Price ÷ the last ten years of inflation-adjusted profits: what investors pay for each dollar of normal earnings. ${higherThan(p, capeObs[0][0].slice(0, 4))}.${f ? ` ${f}` : ''} It says little about the next year.` }));
    valParts.push([p, 2]);
  }
  if (has('us_hh_equity')) {
    const obs = S.us_hh_equity.obs, [d, v] = obs.at(-1), p = percentile(obs, v);
    us.valuation.push(card('us_hh_equity', { name: 'Households’ money in stocks', value: v, unit: '%', digits: 1, date: d, freq: 'q', source: S.us_hh_equity.source, obs, ...pricey(p),
      meaning: `US households hold ${v.toFixed(0)}% of their savings and investments in stocks, directly or through funds and retirement plans. ${higherThan(p, obs[0][0].slice(0, 4))}. When almost everyone is already in, fewer new buyers are left; over the decades this has been one of the best guides to the next ten years’ returns.` }));
    valParts.push([p, 1]);
  }
  const quarterRatio = (num, den, scale) => {
    const by = new Map(den.map(([d, v]) => [d.slice(0, 7), v]));
    return num.map(([d, v]) => (by.get(d.slice(0, 7)) ? [d, v / scale / by.get(d.slice(0, 7))] : null)).filter(Boolean);
  };
  let gvaShown = false;
  if (has('us_equity') && has('us_gva')) {
    const ratio = quarterRatio(S.us_equity.obs, S.us_gva.obs, 1000);
    if (ratio.length) {
      const [d, v] = ratio.at(-1), p = percentile(ratio, v);
      us.valuation.push(card('us_gva', { name: 'Market cap ÷ company output', value: v, unit: '×', digits: 2, date: d, freq: 'q', source: 'Federal Reserve Z.1 and BEA via FRED', obs: ratio, ...pricey(p),
        meaning: `MarketCap/GVA: the market value of US non-financial companies ÷ what they produce in a year (gross value added). ${higherThan(p, ratio[0][0].slice(0, 4))}. A cleaner cousin of the Buffett Indicator; in John Hussman’s research it tracked the following 10–12 years of returns more closely than CAPE or price-to-earnings.` }));
      valParts.push([p, 1]);
      gvaShown = true;
    }
  }
  if (has('us_equity') && has('us_gdp_level')) {
    const ratio = quarterRatio(S.us_equity.obs, S.us_gdp_level.obs, 1000);
    if (ratio.length) {
      const [d, v] = ratio.at(-1), p = percentile(ratio, v);
      us.valuation.push(card('us_buffett', { name: 'Buffett Indicator', value: v, unit: '×', digits: 2, date: d, freq: 'q', source: 'Federal Reserve Z.1 and BEA via FRED', obs: ratio, ...pricey(p),
        meaning: `Warren Buffett’s famous yardstick: the value of US companies ÷ the size of the economy (GDP). ${higherThan(p, ratio[0][0].slice(0, 4))}. It reads high partly because big US companies now earn around 40% of their sales abroad, which GDP doesn’t count${gvaShown ? ', so use it alongside the measures above' : ''}.` }));
      if (!gvaShown) valParts.push([p, 1]);
    }
  }
  const wsum = valParts.reduce((a, [, w]) => a + w, 0);
  if (wsum) valScore = valParts.reduce((a, [p, w]) => a + p * w, 0) / wsum;

  // "Are stocks paying enough for the risk?" Two estimates of what stocks should earn above safe bonds.
  const prem = { cards: [] };
  const ecyObs = V.shiller?.ecy;
  let ecyNow = null;
  if (ecyObs?.length) {
    const [d, v] = ecyObs.at(-1), p = percentile(ecyObs, v);
    ecyNow = v;
    prem.cards.push(card('us_ecy', { name: 'Excess CAPE Yield', value: v, unit: '%', digits: 2, date: d, freq: 'm', source: V.shiller.source || 'Robert Shiller, Yale University', obs: ecyObs, pos: p,
      status: v < 1 ? 'Very thin' : v < 2.5 ? 'Thin' : v < 5 ? 'Normal' : 'Generous', tone: v < 1 ? 'bad' : v < 2.5 ? 'mid' : 'good',
      meaning: `Stocks vs. bonds after inflation, Shiller’s way: the CAPE earnings yield${capeNow ? ` (${(100 / capeNow.v).toFixed(1)}%)` : ''} minus the after-inflation 10-year Treasury yield. Stocks are priced to earn about ${v.toFixed(1)} points a year more than safe bonds, ${p <= 1 ? 'a thinner cushion than almost any month' : p <= 50 ? `less than in ${100 - p}% of months` : `more than in ${p}% of months`} since ${ecyObs[0][0].slice(0, 4)}. Below zero, as at the 2000 peak, bonds were the better deal.` }));
  }
  const erpObs = V.erp?.obs;
  if (erpObs?.length) {
    const [d, v] = erpObs.at(-1), p = percentile(erpObs, v);
    prem.cards.push(card('us_erp', { name: 'Implied risk premium (Damodaran)', value: v, unit: '%', digits: 2, date: d, freq: 'm', source: V.erp.source || 'Aswath Damodaran, NYU Stern', obs: erpObs, pos: p,
      status: v < 4 ? 'Thin' : p <= 25 && erpObs.length >= 36 ? 'Below average' : v <= 5.5 ? 'Normal' : 'Generous', tone: v < 4 || (p <= 25 && erpObs.length >= 36) ? 'mid' : 'good',
      meaning: `The extra yearly return over the 10-year Treasury that today’s S&P 500 price implies, if analysts’ forecasts of dividends, buybacks and profit growth come true. ${erpObs.length < 36 ? '' : p <= 1 ? `The lowest monthly reading since ${erpObs[0][0].slice(0, 4)}.` : `${p <= 50 ? `Lower than ${100 - p}%` : `Higher than ${p}%`} of monthly readings since ${erpObs[0][0].slice(0, 4)}.`}${ecyNow != null ? ` Shiller’s measure (${ecyNow.toFixed(1)}%) uses past profits instead of forecasts; the gap between the two is the optimism built into prices.` : ''}` }));
  }

  // "Is the trend up?" Month-end S&P 500 vs. its 10-month average (Meb Faber's rule) and index concentration.
  const trend = { cards: [] };
  const usTrend = trendOf(has('us_sp500') ? S.us_sp500.obs : null);
  if (usTrend) {
    trend.cards.push(trendCard('us_trend', 'S&P 500 vs. 10-month average', usTrend, has('us_sp500') ? (S.us_sp500.last || S.us_sp500.obs.at(-1))[0] : null, S.us_sp500.source));
  }
  if (concentration?.top10 > 0) {
    const v = concentration.top10;
    trend.cards.push(card('us_top10', { name: 'Top 10 stocks’ share of S&P 500', value: v, unit: '%', digits: 1, date: concentration.period, freq: 'd', source: `SEC Form N-PORT (${concentration.fund} holdings)`, pos: clamp(((v - 15) / 30) * 100), lo: '15%', hi: '45%',
      status: v >= 35 ? 'Near record' : v >= 27 ? 'Very concentrated' : 'Normal', tone: v >= 27 ? 'mid' : 'good',
      meaning: `$${v.toFixed(0)} of every $100 in an S&P 500 fund sits in just 10 companies${v >= 27 ? ', more than at the dot-com peak (about 27%)' : ''}. When a few giants carry the index, their results decide most of everyone’s returns, and the index looks more expensive than the typical stock in it.` }));
  }
  const tenY = has('us_10y') ? { obs: S.us_10y.obs, d: last('us_10y')[0], v: last('us_10y')[1], src: S.us_10y.source } : market?.rates?.tenYear ? { obs: null, d: market.rates.tenYear.date, v: market.rates.tenYear.value, src: 'US Treasury' } : null;
  if (tenY) {
    us.money.push(card('us_10y', { name: '10-year Treasury yield', value: tenY.v, unit: '%', digits: 2, date: tenY.d, freq: tenY.obs ? 'm' : 'd', source: tenY.src, obs: tenY.obs,
      status: tenY.v > 4.5 ? 'High' : tenY.v >= 3 ? 'Moderate' : 'Low', tone: tenY.v > 4.5 ? 'mid' : 'good',
      meaning: 'Sets the price of mortgages and loans. Higher yields make stocks and homes harder to justify.' }));
    moneyParts.push(longScore(tenY.v));
  }
  if (has('us_curve')) {
    const [d, v] = last('us_curve');
    us.money.push(card('us_curve', { name: 'Yield curve (10-year minus 3-month)', value: v, unit: ' pts', digits: 2, date: d, freq: 'm', source: S.us_curve.source, obs: S.us_curve.obs,
      status: v < 0 ? 'Inverted' : v < 0.5 ? 'Flat' : 'Normal', tone: v < 0 ? 'bad' : v < 0.5 ? 'mid' : 'good',
      meaning: v < 0 ? 'Short rates are above long rates. That has happened before most US recessions.' : 'Long rates above short rates is normal. When it turns negative, recessions have often followed.' }));
  }
  if (has('us_fed')) {
    const [d, v] = last('us_fed');
    us.money.push(card('us_fed', { name: 'Fed policy rate (upper bound)', value: v, unit: '%', digits: 2, date: d, freq: 'm', source: S.us_fed.source, obs: S.us_fed.obs,
      status: v >= 4 ? 'Restrictive' : v >= 2.5 ? 'Neutral' : 'Easy', tone: v >= 4 ? 'mid' : 'good',
      meaning: v >= 4 ? 'The Fed is holding rates high to cool inflation.' : 'Rates are close to or below neutral, which supports borrowing and spending.' }));
    moneyParts.push(policyScore(v));
  }
  if (has('us_nfci')) {
    const [d, v] = last('us_nfci');
    us.money.push(card('us_nfci', { name: 'Financial conditions (Chicago Fed)', value: v, digits: 2, date: d, freq: 'm', source: S.us_nfci.source, obs: S.us_nfci.obs, lo: 'Loose', hi: 'Tight',
      status: v > 0.5 ? 'Tight' : v > 0 ? 'Tightening' : v > -0.3 ? 'Normal' : 'Loose', tone: v > 0.5 ? 'bad' : v > 0 ? 'mid' : 'good',
      meaning: 'One number for how easy it is to borrow, from 105 measures of credit, stock and money markets. Above zero means tighter than average.' }));
    moneyParts.push(clamp((v + 1) * 50));
  }
  if (ebp?.obs?.length) {
    const [d, v] = ebp.obs.at(-1), p = percentile(ebp.obs, v);
    us.money.push(card('us_ebp', { name: 'Bond-market nerves (EBP)', value: v, unit: ' pts', digits: 2, date: d, freq: 'm', source: ebp.source || 'Federal Reserve Board', obs: ebp.obs, pos: p,
      status: v > 0.5 ? 'Stressed' : v > 0 ? 'Above normal' : 'Calm', tone: v > 0.5 ? 'bad' : v > 0 ? 'mid' : 'good',
      meaning: `The extra yield lenders demand from companies beyond their real default risk. It measures nerves, not fundamentals: sharp rises have come before most US recessions since 1973. ${p <= 25 ? 'Today it is lower than in ' + (100 - p) + '% of months, which also means lenders are relaxed, perhaps too relaxed.' : 'Higher than ' + p + '% of months since 1973.'}` }));
    moneyParts.push(p);
  }
  if (has('us_mortgage')) {
    const [d, v] = last('us_mortgage');
    us.money.push(card('us_mortgage', { name: '30-year mortgage rate', value: v, unit: '%', digits: 2, date: d, freq: 'm', source: S.us_mortgage.source, obs: S.us_mortgage.obs,
      status: v > 7 ? 'Very high' : v >= 5.5 ? 'High' : 'Moderate', tone: v > 7 ? 'bad' : v >= 5.5 ? 'mid' : 'good',
      meaning: 'What a typical US home buyer pays. It follows the 10-year Treasury yield.' }));
  }
  const moneyScore = moneyParts.filter((x) => x != null).length ? moneyParts.filter((x) => x != null).reduce((a, b) => a + b, 0) / moneyParts.filter((x) => x != null).length : null;

  const econDial = econScore == null ? dial('Is the economy OK?', null, 'Data coming soon', 'mid', '') : dial('Is the economy OK?', econScore, econScore >= 70 ? 'Strong' : econScore >= 50 ? 'Steady' : econScore >= 35 ? 'Slowing' : 'Weak', econScore >= 50 ? 'good' : econScore >= 35 ? 'mid' : 'bad', us.economy.slice(0, 2).map((c) => `${c.name.split(' (')[0]} ${c.value}`).join(' · '));
  const valSub = capeNow ? `Shiller CAPE ${capeNow.v.toFixed(1)}, higher than ${capeNow.p >= 99 ? 'almost all' : `${capeNow.p}%`} of history` : us.valuation[0] ? `${us.valuation[0].name.split(' (')[0]} ${us.valuation[0].value}` : '';
  const valDial = valScore == null ? dial('Are stocks expensive?', null, 'Data coming soon', 'mid', '') : dial('Are stocks expensive?', valScore, valScore >= 90 ? 'Very expensive' : valScore >= 70 ? 'Expensive' : valScore >= 30 ? 'Fair' : 'Cheap', valScore >= 70 ? 'bad' : valScore >= 30 ? 'mid' : 'good', valSub);
  const trendDial = (t, index) => (t ? dial('Is the trend up?', clamp(50 + t.dist * 2.5), t.up ? 'Rising' : 'Falling', t.up ? 'good' : 'bad', `${index} ${t.dist >= 0 ? '+' : '−'}${Math.abs(t.dist).toFixed(1)}% vs. 10-month average`) : dial('Is the trend up?', null, 'Data coming soon', 'mid', ''));
  const usTrendDial = trendDial(usTrend, 'S&P 500');
  const moneyDial = moneyScore == null ? dial('Is money tight?', null, tenY ? (tenY.v > 4.5 ? 'Tight' : 'Neutral') : 'Data coming soon', 'mid', tenY ? `10-year yield ${tenY.v.toFixed(2)}%` : '') : dial('Is money tight?', moneyScore, moneyScore > 60 ? 'Tight' : moneyScore >= 35 ? 'Neutral' : 'Easy', moneyScore > 75 ? 'bad' : moneyScore > 60 ? 'mid' : 'good', tenY ? `10-year yield ${tenY.v.toFixed(2)}%` : '');

  // ---------- Canada ----------
  const ca = { economy: [], money: [] };
  let caEcon = null;
  if (has('ca_gdp_index')) {
    const g = yoy(S.ca_gdp_index.obs);
    if (g.length) {
      const [d, v] = g.at(-1);
      ca.economy.push(card('ca_gdp', { name: 'Real GDP growth (vs. a year ago)', value: v, unit: '%', date: d, freq: 'm', source: S.ca_gdp_index.source, obs: g,
        status: v > 2.5 ? 'Strong' : v >= 1 ? 'Growing' : v >= 0 ? 'Slow' : 'Shrinking', tone: v >= 1 ? 'good' : v >= 0 ? 'mid' : 'bad',
        meaning: `Canada’s economy is ${v >= 0 ? `${v.toFixed(1)}% bigger` : `${Math.abs(v).toFixed(1)}% smaller`} than a year ago, adjusted for inflation.` }));
      caEcon = 60 + (v > 2.5 ? 15 : v >= 1 ? 5 : v >= 0 ? -10 : -30);
    }
  }
  if (has('ca_unemp')) {
    const obs = S.ca_unemp.obs, [d, v] = obs.at(-1), yearAgo = obs.at(-13)?.[1];
    ca.economy.push(card('ca_unemp', { name: 'Unemployment rate', value: v, unit: '%', date: d, freq: 'm', source: S.ca_unemp.source, obs,
      status: yearAgo != null && v - yearAgo >= 0.5 ? 'Rising' : v < 6 ? 'Healthy' : 'Elevated', tone: yearAgo != null && v - yearAgo >= 0.5 ? 'bad' : v < 6 ? 'good' : 'mid',
      meaning: `Labour Force Survey${yearAgo != null ? `; ${v > yearAgo ? 'up' : v < yearAgo ? 'down' : 'unchanged'} from ${yearAgo.toFixed(1)}% a year ago` : ''}.` }));
    const sh = sahm(obs);
    if (sh.length) {
      const [sd, sv] = sh.at(-1);
      ca.economy.push(card('ca_sahm', { name: 'Sahm-style rule (Canada)', value: sv, digits: 2, date: sd, freq: 'm', source: 'QWERTx, from Statistics Canada data', obs: sh, lo: '0', hi: '0.50 = signal', pos: clamp(sv / 0.5 * 100),
        status: sv >= 0.5 ? 'Recession signal' : sv >= 0.3 ? 'Watch' : 'No signal', tone: sv >= 0.5 ? 'bad' : sv >= 0.3 ? 'mid' : 'good',
        meaning: 'The same recession test the US uses, applied to Canada’s jobless rate.' }));
      if (caEcon != null) caEcon += sv >= 0.5 ? -20 : sv >= 0.3 ? -10 : 0;
    }
  }
  if (has('ca_cpi_index')) {
    const c = yoy(S.ca_cpi_index.obs);
    if (c.length) {
      const [d, v] = c.at(-1);
      ca.economy.push(card('ca_cpi', { name: 'Inflation (CPI, yearly)', value: v, unit: '%', date: d, freq: 'm', source: S.ca_cpi_index.source, obs: c,
        status: v > 4 ? 'High' : v > 2.5 ? 'Above target' : v >= 1 ? 'Near target' : 'Very low', tone: v > 4 ? 'bad' : v > 2.5 || v < 1 ? 'mid' : 'good',
        meaning: v > 2.5 ? 'Above the Bank of Canada’s 2% target.' : 'Close to the Bank of Canada’s 2% target.' }));
    }
  }
  let caMoneyParts = [];
  if (has('ca_policy')) {
    const [d, v] = last('ca_policy');
    ca.money.push(card('ca_policy', { name: 'Bank of Canada policy rate', value: v, unit: '%', digits: 2, date: d, freq: 'm', source: S.ca_policy.source, obs: S.ca_policy.obs,
      status: v >= 4 ? 'Restrictive' : v >= 2.25 ? 'Neutral' : 'Easy', tone: v >= 4 ? 'mid' : 'good',
      meaning: has('us_fed') ? `${v < last('us_fed')[1] ? 'Below' : 'Above'} the US Fed’s ${last('us_fed')[1].toFixed(2)}%, which ${v < last('us_fed')[1] ? 'tends to weaken' : 'tends to support'} the Canadian dollar.` : 'The Bank of Canada’s overnight rate target.' }));
    caMoneyParts.push(policyScore(v));
  }
  if (has('ca_10y')) {
    const [d, v] = last('ca_10y');
    ca.money.push(card('ca_10y', { name: '10-year Government of Canada yield', value: v, unit: '%', digits: 2, date: d, freq: 'm', source: S.ca_10y.source, obs: S.ca_10y.obs,
      status: v > 4 ? 'High' : v >= 2.5 ? 'Moderate' : 'Low', tone: v > 4 ? 'mid' : 'good', meaning: 'Drives five-year fixed mortgage rates in Canada.' }));
    caMoneyParts.push(longScore(v));
    if (has('ca_2y')) {
      const two = new Map(S.ca_2y.obs.map(([dd, vv]) => [dd.slice(0, 7), vv]));
      const curve = S.ca_10y.obs.map(([dd, vv]) => (two.has(dd.slice(0, 7)) ? [dd, vv - two.get(dd.slice(0, 7))] : null)).filter(Boolean);
      if (curve.length) {
        const [cd, cv] = curve.at(-1);
        ca.money.push(card('ca_curve', { name: 'Yield curve (10-year minus 2-year)', value: cv, unit: ' pts', digits: 2, date: cd, freq: 'm', source: S.ca_10y.source, obs: curve,
          status: cv < 0 ? 'Inverted' : cv < 0.5 ? 'Flat' : 'Normal', tone: cv < 0 ? 'bad' : cv < 0.5 ? 'mid' : 'good',
          meaning: 'Long rates above short rates is normal. An inverted curve has often come before slowdowns.' }));
      }
    }
  }
  if (has('ca_usdcad')) {
    const [d, v] = last('ca_usdcad');
    ca.money.push(card('ca_usdcad', { name: 'USD / CAD', value: v, digits: 3, date: d, freq: 'm', source: S.ca_usdcad.source, obs: S.ca_usdcad.obs,
      status: v > 1.38 ? 'Weak loonie' : v < 1.25 ? 'Strong loonie' : 'Middle of range', tone: 'mid',
      meaning: `One US dollar costs ${v.toFixed(2)} Canadian. A weaker loonie lifts the value of US stocks in Canadian dollars.` }));
  }
  const caTrend = trendOf(valuation?.tsx?.obs);
  const caTrendCards = caTrend ? [trendCard('ca_trend', 'TSX Composite vs. 10-month average', caTrend, null, valuation.tsx.source)] : [];
  const caTrendDial = trendDial(caTrend, 'TSX');
  const caMoneyScore = caMoneyParts.filter((x) => x != null).length ? caMoneyParts.filter((x) => x != null).reduce((a, b) => a + b, 0) / caMoneyParts.filter((x) => x != null).length : null;
  const caEconDial = caEcon == null ? dial('Is the economy OK?', null, 'Data coming soon', 'mid', '') : dial('Is the economy OK?', caEcon, caEcon >= 70 ? 'Strong' : caEcon >= 50 ? 'Steady' : caEcon >= 35 ? 'Slowing' : 'Weak', caEcon >= 50 ? 'good' : caEcon >= 35 ? 'mid' : 'bad', ca.economy.slice(0, 2).map((c) => `${c.name.split(' (')[0]} ${c.value}`).join(' · '));
  const caMoneyDial = caMoneyScore == null ? dial('Is money tight?', null, 'Data coming soon', 'mid', '') : dial('Is money tight?', caMoneyScore, caMoneyScore > 60 ? 'Tight' : caMoneyScore >= 35 ? 'Neutral' : 'Easy', caMoneyScore > 75 ? 'bad' : caMoneyScore > 60 ? 'mid' : 'good', has('ca_policy') ? `Policy rate ${last('ca_policy')[1].toFixed(2)}%` : '');

  const headline = (dials) => {
    const known = dials.filter((d) => d.score != null);
    if (known.length < 3) return { headline: 'Gathering data', icon: 'cloud', summary: 'Market Weather fills in as the official economic data loads.' };
    const bad = known.filter((d) => d.tone === 'bad').length, mid = known.filter((d) => d.tone === 'mid').length;
    const h = bad >= 3 ? 'Stormy' : bad === 2 || (bad === 1 && mid >= 2) ? 'Cloudy' : bad === 1 || mid >= 2 ? 'Partly cloudy' : 'Sunny';
    const words = { 'Is the economy OK?': 'the economy is', 'Are stocks expensive?': 'stocks look', 'Is the trend up?': 'the trend is', 'Is money tight?': 'money is', 'Are people scared?': 'investors feel', 'Smart Money Pulse': 'smart money is' };
    const parts = known.map((d) => `${words[d.q] || d.q} ${d.label.toLowerCase()}`);
    const s = parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';
    return { headline: h, icon: h === 'Sunny' ? 'sun' : h === 'Stormy' ? 'storm' : 'cloud', summary: s };
  };

  const usDials = [econDial, valDial, usTrendDial, moneyDial, moodDial, pulseDial];
  const caDials = [caEconDial, caTrendDial, caMoneyDial, moodDial, pulseDial];
  const groups = (o) => o.filter((g) => g.cards.length);
  return {
    updatedAt: macro?.updatedAt || null,
    us: { region: 'United States', ...headline(usDials), verdict: verdict(valScore, usTrend), dials: usDials, groups: groups([
      { title: 'Economy', q: 'Is the economy OK?', cards: us.economy },
      { title: 'Valuation', q: 'Are stocks expensive? (a guide to the next 10 years, not the next one)', cards: us.valuation },
      { title: 'Stocks vs. bonds', q: 'Are stocks paying enough extra for the risk?', cards: prem.cards },
      { title: 'Trend', q: 'Is the trend up? (the faster signal)', cards: trend.cards },
      { title: 'Money', q: 'Is money tight?', cards: us.money },
      { title: 'Mood', q: 'Are people scared?', cards: moodCards },
      pulse,
    ]) },
    ca: { region: 'Canada', ...headline(caDials), verdict: verdict(null, caTrend), dials: caDials, groups: groups([
      { title: 'Economy', q: 'Is the economy OK?', cards: ca.economy },
      { title: 'Trend', q: 'Is the trend up?', cards: caTrendCards },
      { title: 'Money', q: 'Is money tight?', cards: ca.money },
      { title: 'Mood', q: 'Are people scared? (US mood drives the TSX too)', cards: moodCards },
      pulse,
    ]) },
  };
}
