/* QWERTx Pro — "Your stocks, watched for you" (/account.html), in six tabs:
   My Portfolio · Smart Money · Analyst Targets · Earnings & News · Market Weather · QWERTx Brief.
   Everything shown comes from official filings and data built with the site (/pro/t/<TICKER>.json,
   /pro/index.json, /pro/weather.json) or from the member's own account (/api/*). Licensed prices and analyst
   targets appear only when the site has them switched on; until then those panels say so instead of guessing. */
(function () {
  'use strict';
  var root = document.getElementById('wl-root');
  if (!root) return;

  var params = new URLSearchParams(location.search);
  var TABS = [['portfolio', 'My Portfolio'], ['smart', 'Smart Money'], ['analyst', 'Analyst Targets'], ['earnings', 'Earnings & News'], ['weather', 'Market Weather'], ['brief', 'QWERTx Brief']];
  var S = { me: null, index: null, data: {}, results: null, status: null, notice: null, tab: null, drawer: false, region: 'us', filter: 'all', etf: null, sel: null, weather: undefined, brief: undefined, briefEdit: null };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var COLORS = ['#F5B83D', '#2DD4BF', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C', '#E2E8F0', '#94A3B8', '#34D399', '#FCA5A5'];

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  function fmtShort(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
  function money(v) { v = +v || 0; return v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v); }
  // Money in the member's display currency (USD or CAD). Prices in the other currency carry a US$ or C$ label.
  function usd(v) { return (v < 0 ? '−' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  var CA_ZONES = /^America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Glace_Bay|Goose_Bay|Whitehorse|Dawson|Dawson_Creek|Fort_Nelson|Yellowknife|Inuvik|Iqaluit|Rankin_Inlet|Resolute|Cambridge_Bay|Swift_Current|Atikokan|Creston|Thunder_Bay|Nipigon|Rainy_River|Blanc-Sablon)$/;
  function guessCcy() { try { return CA_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'CAD' : 'USD'; } catch (e) { return 'USD'; } }
  function ccy() { return (S.me && S.me.prefs && S.me.prefs.currency) || S.ccyGuess || (S.ccyGuess = guessCcy()); }
  /** The currency a ticker trades in: from the price feed, else Toronto listings are CAD and the rest USD. */
  function nativeCcy(t) { var d = S.data[t]; return (d && d.q && d.q.cur === 'CAD') || /\.TO$/.test(t) ? 'CAD' : 'USD'; }
  /** Currency a member most likely typed for a holding: what they chose, else CAD for a Toronto ticker they typed. */
  function typedCcy(w) { return w.cur || (w.input && /(\.TO|^TSX|^TSE|:CA|:CN)/i.test(w.input) ? 'CAD' : nativeCcy(w.ticker)); }
  function rate() { return S.index && S.index.fx && S.index.fx.USDCAD; }
  /** Converts between USD and CAD at the Bank of Canada rate; without a rate, amounts are left as they are. */
  function conv(v, from, to) { if (v == null || from === to || !rate()) return v; return from === 'USD' ? v * rate() : v / rate(); }
  function sym(c) { return c === ccy() ? '$' : c === 'CAD' ? 'C$' : 'US$'; }
  function price(v, c) { return sym(c) + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(v, d) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 1 : d) + '%'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; if (!r.ok && !j.message) j.message = 'Something went wrong. Please try again.'; return j; }); })
      .catch(function () { return { _status: 0, message: 'You seem to be offline. Please try again.' }; });
  }
  function getJSON(url) { return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function mname(slug) { var m = S.index && S.index.managers[slug]; return m ? m.n : slug; }
  function stockHref(d) { return d && d.s ? '/stocks/' + d.s + '.html' : null; }
  function tkr(t, d) { var h = stockHref(d); return h ? '<a class="tkr" href="' + h + '">' + esc(t) + '</a>' : '<span class="tkr">' + esc(t) + '</span>'; }
  function isEtf(t) { var d = S.data[t]; return !!(d && d.etf); }
  function label(k) { return '<div class="px-label">' + k + '</div>'; }
  function soon(title, text) { return '<div class="px-soon"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i><div><b>' + title + '</b><p>' + text + '</p></div></div>'; }
  function lock(text) { return '<div class="px-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i><span>' + text + ' <a href="#" data-open="membership">See QWERTx Pro</a></span></div>'; }
  function cleanUrl(keep) {
    var u = new URL(location.href);
    ['signin', 'welcome', 'already', 'add'].forEach(function (k) { if (!keep || keep.indexOf(k) < 0) u.searchParams.delete(k); });
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }

  // ---------- boot ----------
  var token = params.get('signin');
  if (params.get('add')) store('qx-pending-add', params.get('add'));
  var hash = location.hash.replace('#', '');
  if (TABS.some(function (t) { return t[0] === hash; })) S.tab = hash;
  if (hash === 'alerts' || hash === 'membership') S.drawer = true;
  if (token) { cleanUrl(['welcome']); renderFinish(token); }
  else load();

  function load() {
    Promise.all([api('GET', '/api/me'), getJSON('/pro/index.json'), getJSON('/pro/search.json')]).then(function (r) {
      S.me = r[0];
      S.secList = r[2] || [];
      S.names = {}; S.secList.forEach(function (x) { S.names[x[0]] = x[1]; });
      S.index = r[1] || { managers: {}, managerOrder: [], tickers: {}, etfs: {} };
      if (params.get('welcome') === 'pro') S.notice = { tone: 'gold', html: '<b>Welcome to QWERTx Pro.</b> Add the stocks and ETFs you own below. Alerts start as soon as a new filing touches one of them.' };
      if (params.get('already') === 'pro') S.notice = { tone: 'gold', html: 'You already have QWERTx Pro, so there was nothing to buy. Manage your plan in Settings.' };
      cleanUrl();
      if (!S.me.signedIn) return renderSignedOut();
      var pending = store('qx-pending-add');
      if (pending) { store('qx-pending-add', null); return addTickers(pending.split(/[\s,;]+/)); }
      loadStocks().then(render);
    });
  }

  function loadStocks() {
    var list = (S.me.watchlist || []).map(function (w) { return w.ticker; }).filter(function (t) {
      if (t in S.data) return false;
      if (S.index && S.index.tickers && !S.index.tickers[t]) { S.data[t] = null; return false; }
      return true;
    });
    return Promise.all(list.map(function (t) { return getJSON('/pro/t/' + encodeURIComponent(t) + '.json').then(function (d) { S.data[t] = d; }); }));
  }

  // ---------- signed out ----------
  function renderSignedOut(sent) {
    var configured = S.me && S.me.configured !== false;
    var pendingAdd = store('qx-pending-add');
    root.innerHTML =
      '<div class="row row-wide">' +
      '<div class="col-2"><div class="card wl-signin">' +
      '<div class="card-label"><span>Free account</span><span>No password needed</span></div>' +
      '<h2>See who owns what you own</h2>' +
      '<p>Enter your email and we’ll send you a one-time sign-in link. A free account watches ' + esc((S.me && S.me.limits && S.me.limits.free) || 3) + ' stocks or ETFs with a weekly digest' + (pendingAdd ? ', starting with <b>' + esc(pendingAdd.toUpperCase()) + '</b>' : '') + '.</p>' +
      (sent ? '<div class="wl-done" role="status" tabindex="-1"><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i><div><b>Check your inbox.</b><br>We sent a sign-in link to ' + esc(sent.email) + '. It works once and expires in 30 minutes.' + (sent.devLink ? '<br><a href="' + esc(sent.devLink) + '">Local test link</a>' : '') + '</div></div>'
        : '<form id="wl-login" class="form" novalidate>' +
          '<div class="field"><label for="wl-email">Email</label><input class="input" id="wl-email" type="email" name="email" autocomplete="email" placeholder="you@example.com" required></div>' +
          '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">' +
          '<button class="btn btn-gold" type="submit"' + (configured ? '' : ' disabled') + '>Email me a sign-in link <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>' +
          '<p class="form-note wl-err" role="alert"></p>' +
          '<p class="form-note">By signing up you agree to get emails about your watchlist. Unsubscribe anytime. See our <a href="/privacy.html">Privacy Policy</a>.</p>' +
          '</form>') +
      '</div></div>' +
      '<div class="col-2"><div class="wl-how">' +
      '<div class="card-label"><span>How it works</span></div>' +
      '<ol class="wl-steps">' +
      '<li><b>Add the stocks and ETFs you own.</b> Type tickers or upload a CSV. VEQT, XEQT, VFV and other Canadian ETFs work too.</li>' +
      '<li><b>See the smart money instantly.</b> Which of the ' + Object.keys((S.index && S.index.managers) || {}).length + ' tracked fund managers own them, who just bought or sold, and what politicians and insiders disclosed.</li>' +
      '<li><b>Get told when it changes.</b> An email the day a new filing touches your stocks, with the filing date and a link to the source.</li>' +
      '</ol>' +
      '<p class="form-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Position sizes are optional. We never ask for account numbers or a brokerage login. Delete everything with one click.</p>' +
      '</div></div></div>';
    var form = document.getElementById('wl-login');
    if (!form) { var d = root.querySelector('.wl-done'); if (d) d.focus(); return; }
    var loadedAt = Date.now();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      var err = form.querySelector('.wl-err');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Enter a valid email address.'; form.email.setAttribute('aria-invalid', 'true'); form.email.focus(); return; }
      var btn = form.querySelector('button'); btn.disabled = true; err.textContent = '';
      api('POST', '/api/auth/start', { email: email, website: form.website.value, t: loadedAt, next: '/account.html' }).then(function (j) {
        btn.disabled = false;
        if (!j.ok) { err.textContent = j.message; return; }
        renderSignedOut({ email: email, devLink: j.devLink });
      });
    });
  }

  function renderFinish(tok) {
    root.innerHTML = '<div class="card wl-signin maxw-640"><div class="card-label"><span>Sign in</span></div><h2>Finish signing in</h2><p>Click the button to sign in to QWERTx on this device.</p>' +
      '<button class="btn btn-gold" type="button" id="wl-finish">Sign in <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button><p class="form-note wl-err" role="alert"></p></div>';
    var b = document.getElementById('wl-finish');
    b.focus();
    b.addEventListener('click', function () {
      b.disabled = true;
      api('POST', '/api/auth/verify', { token: tok }).then(function (j) {
        if (!j.ok) { b.disabled = false; root.querySelector('.wl-err').innerHTML = esc(j.message) + ' <a href="/account.html">Get a new link</a>.'; return; }
        location.replace(j.next || '/account.html');
      });
    });
  }

  // ---------- portfolio model ----------
  function addTickers(list) {
    list = list.map(function (x) { return typeof x === 'object' ? x : { ticker: String(x).trim() }; }).filter(function (x) { return x.ticker; });
    if (!list.length) return Promise.resolve();
    return api('POST', '/api/watchlist', { items: list }).then(function (j) {
      if (!j.ok) { S.results = [{ status: 'error', input: j.message }]; return render(); }
      S.me = Object.assign(S.me, j);
      S.results = j.results;
      S.tab = 'portfolio';
      var fresh = (j.results || []).filter(function (r) { return r.status === 'added' || r.status === 'mapped'; });
      S.prefill = S.prefill || {};
      fresh.forEach(function (r) { if (r.needsPrice) S.prefill[r.ticker] = r.needsPrice; });
      var needs = fresh.filter(function (r) { return r.needsPrice; });
      var sizeless = needs.length ? needs : fresh.filter(function (r) { var w = (S.me.watchlist || []).filter(function (x) { return x.ticker === r.ticker; })[0]; return w && !w.shares && !w.amount; });
      S.openPos = needs.length || sizeless.length === 1 ? sizeless[0].ticker : null;
      return loadStocks().then(function () { render(); if (S.openPos) { var f = root.querySelector('form[data-pos="' + S.openPos + '"]'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.n.focus({ preventScroll: true }); } } });
    });
  }

  /** What a position is worth. kind: live (licensed price), quarter (13F quarter-end price), entered (dollar amount as typed). */
  /** What a position is worth. kind: live (licensed price), paid (shares × the member's average price),
      entered (dollar amount as typed). Shares without an average price have no value until one is added. */
  function value(w) {
    var d = S.data[w.ticker] || {}, live = d.q && d.q.p;
    var nat = nativeCcy(w.ticker), typed = typedCcy(w), out = ccy();
    var C = function (v, from) { return conv(v, from, out); };
    var sh = w.shares || (w.amount && w.paid ? w.amount / w.paid : null);
    if (live) {
      // Book cost stays in the currency it was typed in, so a Canadian's gain on a US stock includes the dollar's move.
      if (sh) return { now: C(sh * live, nat), invested: w.paid ? C(sh * w.paid, typed) : w.amount ? C(w.amount, typed) : w.addedPrice ? C(sh * w.addedPrice, nat) : null, kind: 'live' };
      if (w.amount && w.addedPrice) return { now: C(w.amount * live / w.addedPrice, typed), invested: C(w.amount, typed), kind: 'live' };
    }
    if (w.amount) return { now: C(w.amount, typed), invested: C(w.amount, typed), kind: 'entered' };
    if (w.shares && w.paid) return { now: C(w.shares * w.paid, typed), invested: C(w.shares * w.paid, typed), kind: 'paid' };
    return null;
  }

  function model() {
    var wl = (S.me.watchlist || []).filter(function (w) { return w.active; });
    var rows = wl.map(function (w) { return { w: w, t: w.ticker, d: S.data[w.ticker] || null, v: value(w) }; });
    var sized = rows.filter(function (r) { return r.v; });
    var total = sized.reduce(function (a, r) { return a + r.v.now; }, 0);
    var invested = sized.every(function (r) { return r.v.invested != null; }) ? sized.reduce(function (a, r) { return a + r.v.invested; }, 0) : null;
    var allLive = sized.length && sized.every(function (r) { return r.v.kind === 'live'; });
    // Look inside ETFs: add up each company across direct shares and every ETF that holds it.
    var expo = {}, countries = {}, sectors = {}, etfNoData = 0, etfRows = [];
    var key = function (t) { return t === 'GOOGL' ? 'GOOG' : t === 'BRK.A' ? 'BRK.B' : t; };
    sized.forEach(function (r) {
      var e = r.d && r.d.etf;
      if (!e) {
        var k = key(r.t);
        expo[k] = expo[k] || { d: 0, via: {} };
        expo[k].d += r.v.now;
        var where = /\.TO$/.test(r.t) ? 'Canada' : 'United States';
        countries[where] = (countries[where] || 0) + r.v.now;
        var sec = (r.d && r.d.sec) || 'Other';
        sectors[sec] = (sectors[sec] || 0) + r.v.now;
        return;
      }
      etfRows.push(r);
      if (!e.top) { etfNoData += r.v.now; countries['Not yet known'] = (countries['Not yet known'] || 0) + r.v.now; sectors['Not yet known'] = (sectors['Not yet known'] || 0) + r.v.now; return; }
      e.top.forEach(function (h) {
        var k = key(h[0]);
        if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(k)) return;
        expo[k] = expo[k] || { d: 0, via: {} };
        expo[k].via[r.t] = (expo[k].via[r.t] || 0) + r.v.now * h[1] / 100;
      });
      var cTotal = 0;
      Object.keys(e.countries || {}).forEach(function (c) { var nm = countryName(c); countries[nm] = (countries[nm] || 0) + r.v.now * e.countries[c] / 100; cTotal += e.countries[c]; });
      if (cTotal < 99) countries.Other = (countries.Other || 0) + r.v.now * (100 - cTotal) / 100;
      Object.keys(e.sectors || {}).forEach(function (s) { sectors[s] = (sectors[s] || 0) + r.v.now * e.sectors[s] / 100; });
    });
    var top = Object.keys(expo).map(function (k) { var x = expo[k]; var via = Object.keys(x.via).reduce(function (a, t) { return a + x.via[t]; }, 0); return { t: k, d: x.d, via: x.via, tot: x.d + via }; })
      .sort(function (a, b) { return b.tot - a.tot; }).slice(0, 10);
    return { rows: rows, sized: sized, total: total, invested: invested, allLive: allLive, top: top, countries: countries, sectors: sectors, etfRows: etfRows, etfNoData: etfNoData };
  }
  var CN = { US: 'United States', CA: 'Canada', JP: 'Japan', GB: 'United Kingdom', FR: 'France', DE: 'Germany', CH: 'Switzerland', NL: 'Netherlands', TW: 'Taiwan', CN: 'China', KR: 'South Korea', IN: 'India', AU: 'Australia', IE: 'Ireland', DK: 'Denmark', SE: 'Sweden', ES: 'Spain', IT: 'Italy', BR: 'Brazil', HK: 'Hong Kong' };
  function countryName(c) { return CN[c] || c; }

  // ---------- page ----------
  function render() {
    var me = S.me, pro = !!me.pro;
    var tab = S.tab || store('qx-tab') || 'portfolio';
    if (!TABS.some(function (t) { return t[0] === tab; })) tab = 'portfolio';
    S.tab = tab;
    var planLabel = pro ? (me.founding ? 'Pro · Founding member' : 'Pro') : 'Free';
    var html = '<div class="px-top"><div><span class="wl-plan' + (pro ? ' pro' : '') + '">' + esc(planLabel) + '</span>' + (me.name ? ' <b class="wl-name">' + esc(me.name) + '</b>' : '') + ' <span class="wl-email">' + esc(me.email) + '</span></div>' +
      '<div class="px-top-actions"><button type="button" class="px-gear" data-act="drawer" aria-expanded="' + (S.drawer ? 'true' : 'false') + '" aria-controls="px-drawer"><i class="fa-solid fa-gear" aria-hidden="true"></i> Settings</button><button type="button" class="linklike" data-act="logout">Sign out</button></div></div>';
    html += '<nav class="px-tabs" aria-label="Pro sections">' + TABS.map(function (t, i) {
      var on = t[0] === tab;
      return '<button type="button" data-tab="' + t[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '" class="px-tab' + (on ? ' on' : '') + '"><span class="n">0' + (i + 1) + '</span>' + esc(t[1]) + '</button>';
    }).join('') + '</nav>';
    if (S.notice) html += '<div class="wl-notice ' + S.notice.tone + '">' + S.notice.html + '</div>';
    if (S.drawer) html += '<div id="px-drawer" class="px-drawer">' + alertsHtml(me, pro) + membershipHtml(me, pro) + '</div>';
    var M = model();
    if (!lget('qx-welcome')) html += welcomeHtml();
    html += '<div class="px-panel">' + introHtml(tab) + ({ portfolio: tabPortfolio, smart: tabSmart, analyst: tabAnalyst, earnings: tabEarnings, weather: tabWeather, brief: tabBrief }[tab])(M, pro) + (tab === 'smart' ? dirHtml(pro) : '') + '</div>';
    html += '<p class="px-foot">QWERTx provides information from public filings for education. It is not investment advice or a recommendation to buy or sell any security. Fund holdings come from 13F and N-PORT filings made up to 45–60 days after each quarter; politician trades can be disclosed up to 45 days after the trade.</p>';
    root.innerHTML = html;
    bind();
    if (tab === 'smart' && S.dir === undefined) { S.dir = null; getJSON('/pro/managers.json').then(function (j) { S.dir = j || false; render(); }); }
    if (tab === 'weather' && S.weather === undefined) { S.weather = null; getJSON('/pro/weather.json').then(function (w) { S.weather = w || false; render(); }); }
    if (tab === 'brief' && S.brief === undefined) { S.brief = null; api('GET', '/api/brief').then(function (b) { S.brief = b && b.ok ? b : false; render(); }); }
    if (S.drawer && !S.status) getJSON('/api/pro-status').then(function (s) { if (s) { S.status = s; var el = document.getElementById('wl-seats'); if (el) el.textContent = seatsText(s); } });
  }

  // ---------- Plain-English guidance for people new to investing ----------
  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  var GUIDE = {
    portfolio: ['Everything you own in one place: what it is worth, how spread out it is, and what is really inside your ETFs.', [
      ['Portfolio value', 'Your shares times today’s price (or the amount you entered), in the currency you pick at the top right.'],
      ['Biggest company', 'If one company is more than about 20% of everything, a bad day for it is a bad day for you. Many investors keep any single stock below that.'],
      ['Top 10 companies', 'How much of your money sits in your 10 biggest companies, counting what is inside your ETFs. The higher it is, the less spread out you are.'],
      ['What you really own', 'An ETF is a basket of companies. VOO holds about 500. We add up each company across your own shares and your ETFs, so you can see when you own the same stock twice.'],
    ]],
    smart: ['Who has been buying or selling the stocks you own: well-known fund managers, big institutions, members of Congress, the President and the companies’ own executives.', [
      ['Green and red', 'Green means more buyers than sellers, red means more sellers. Grey means no recent moves. It is context, not a signal to buy or sell.'],
      ['Fund managers', 'Large US funds must report their US stock holdings each quarter (SEC Form 13F), up to 45 days after the quarter ends. So these moves are weeks or months old.'],
      ['Insiders', 'Executives and directors trading their own company’s shares (SEC Form 4). Selling is common, for taxes or planned sales. Several insiders buying at once is rarer and more telling.'],
      ['Politicians', 'Members of Congress must disclose trades within 45 days, as amount ranges such as $1,001–$15,000, not exact figures.'],
    ]],
    analyst: ['Where Wall Street analysts expect each of your stocks to be in 12 months, and what that would mean for your own positions.', [
      ['The bar', 'The grey band runs from the lowest to the highest analyst target. The white line is today’s price and the gold dot the average target.'],
      ['Room to run', 'The gap between the average target and today’s price. +20% means analysts, on average, see the stock 20% higher in a year.'],
      ['Agreement', 'A wide band means analysts disagree a lot. Buy, hold and sell counts show how many analysts recommend each.'],
      ['A word of caution', 'Targets are opinions and tend to be optimistic. Use them as one view among many, never as a promise.'],
    ]],
    earnings: ['When your companies next report their results, whether they beat expectations last time, and any major official news.', [
      ['Earnings per share (EPS)', 'The company’s profit divided by its number of shares. Analysts estimate it before each report.'],
      ['Beat or missed', 'Beat means the company earned more than analysts expected. Stocks often move sharply on report days, up or down.'],
      ['Major news', 'Big events such as a new CEO, a takeover or layoffs must be filed with the SEC on Form 8-K within four business days. We show those, straight from the filing.'],
    ]],
    weather: ['The big picture in four plain questions: is the economy OK, are stocks expensive, is money tight, and are people scared?', [
      ['The dials', 'Each dial sums up several official indicators. Green is calm, gold is mixed, red is a warning.'],
      ['Like a weather forecast', 'It tells you the conditions, not what to do. Markets can stay expensive or scared for a long time, and trying to time them rarely works.'],
      ['The cards', 'Each card shows one indicator, where it sits in its own history, what it means and where the number comes from.'],
    ]],
    brief: ['A short weekly note from the QWERTx team: what moved markets, what the smart money did and what to watch next week, in plain English.', [
      ['When it arrives', 'Every weekend, on this tab and at the top of the Friday email.'],
      ['Your stocks', 'Stocks you own are highlighted in gold when the Brief mentions them.'],
      ['Ask us', 'Use the question box under each Brief. We read every one and answer the common ones in the next Brief.'],
    ]],
  };
  function introHtml(tab) {
    var g = GUIDE[tab]; if (!g) return '';
    var key = 'qx-howto-' + tab, seen = lget(key);
    return '<div class="px-intro"><p class="px-intro-what">' + esc(g[0]) + '</p><details class="px-howto" data-howto="' + tab + '"' + (seen === 'closed' ? '' : seen ? ' open' : ' open') + '><summary>How to read this</summary><dl>' +
      g[1].map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl></details></div>';
  }
  function welcomeHtml() {
    var lines = [['My Portfolio', 'what you own and how spread out it is'], ['Smart Money', 'who is buying and selling your stocks'], ['Analyst Targets', 'what Wall Street expects next year'], ['Earnings & News', 'report dates and big company news'], ['Market Weather', 'the economy and market mood at a glance'], ['QWERTx Brief', 'our weekly note in plain English']];
    return '<section class="card px-welcome" aria-label="Welcome"><div><div class="px-label">New here? Start with this</div><h2 class="px-h2">Six tabs, one question each</h2><ol>' +
      lines.map(function (l, i) { return '<li><button type="button" class="linklike" data-tab-go="' + TABS[i][0] + '">' + esc(l[0]) + '</button> · ' + esc(l[1]) + '</li>'; }).join('') +
      '</ol><p class="form-note">Everything here comes from official filings and public market data. It explains what is happening; it never tells you what to buy or sell.</p></div><button type="button" class="btn btn-sm" data-act="welcome-done">Got it</button></section>';
  }

  // ---------- Tab 1 · My Portfolio ----------
  function addBox(me) {
    var used = (me.watchlist || []).length, limit = me.limit;
    return '<section class="card px-add" aria-label="Add stocks and ETFs"><div class="px-add-head"><h2>Add your stocks and ETFs</h2><span class="form-note">' + used + ' of ' + limit + ' used' + (me.pro ? '' : ' · <a href="#" data-open="membership">Pro watches 50</a>') + '</span></div>' +
      '<form id="wl-add-form" class="wl-add-form"><div class="px-ac"><label class="sr-only" for="wl-input">Search by ticker or company name</label><input class="input" id="wl-input" name="tickers" placeholder="Search a ticker or company: AAPL, Shopify, VOO, XEQT" autocomplete="off" autocapitalize="characters" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="px-ac-list"' + (used >= limit ? ' disabled' : '') + '>' +
      '<ul class="px-ac-list" id="px-ac-list" role="listbox" aria-label="Matching stocks and ETFs" hidden></ul></div>' +
      '<button class="btn btn-gold" type="submit"' + (used >= limit ? ' disabled' : '') + '>Add</button></form>' +
      '<p class="form-note">Separate tickers with commas or spaces. Or <label class="linklike" for="wl-csv">upload a CSV</label><input id="wl-csv" type="file" accept=".csv,text/csv" hidden> from your broker (Symbol or Ticker column, plus Shares with Average cost, or Amount, and Currency) · <a href="/assets/qwertx-watchlist-template.csv" download>CSV template</a></p>' +
      resultsHtml() + '</section>';
  }

  function tabPortfolio(M, pro) {
    var me = S.me, wl = me.watchlist || [];
    var html = '';
    if (!wl.length) {
      return addBox(me) + '<div class="card wl-empty"><i class="fa-solid fa-binoculars" aria-hidden="true"></i><h3>Start with the 5 stocks or ETFs you own</h3><p>You’ll see right away which tracked fund managers hold them and who just bought or sold.</p>' +
        '<div class="btn-row">' + ['AAPL', 'MSFT', 'AMZN', 'VOO', 'XEQT'].map(function (t) { return '<button class="btn btn-sm" type="button" data-add="' + t + '">+ ' + t + '</button>'; }).join('') + '</div></div>';
    }
    var stocks = M.rows.filter(function (r) { return !(r.d && r.d.etf); });
    var managers = {}, owned = 0;
    stocks.forEach(function (r) { if (r.d && r.d.h && r.d.h.length) { owned++; r.d.h.forEach(function (h) { managers[h[0]] = 1; }); } });

    // Hero: value + chart (live prices) or an honest note
    var kinds = {}; M.sized.forEach(function (r) { kinds[r.v.kind] = 1; });
    var bits = [];
    if (kinds.live) bits.push('live prices');
    if (kinds.entered) bits.push('the amounts you entered');
    if (kinds.paid) bits.push('your average prices');
    var basis = bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0];
    var gl = M.sized.filter(function (r) { return r.v.kind === 'live' && r.v.invested; });
    var glNow = gl.reduce(function (a, r) { return a + r.v.now; }, 0), glIn = gl.reduce(function (a, r) { return a + r.v.invested; }, 0);
    var gain = gl.length ? glNow - glIn : null;
    html += '<div class="px-grid2">';
    var mixed = M.sized.some(function (r) { return typedCcy(r.w) !== ccy() || nativeCcy(r.t) !== ccy(); });
    var fxNote = mixed && rate() ? ' Converted at US$1 = C$' + rate().toFixed(4) + ' (' + esc(S.index.fx.source) + ', ' + fmtShort(S.index.fx.d) + ').' : mixed ? ' Exchange rate not loaded yet, so US and Canadian dollars are added as they are.' : '';
    html += '<section class="card px-hero" aria-label="Portfolio value"><div class="px-hero-h">' + label('Portfolio value · ' + (ccy() === 'CAD' ? 'Canadian dollars' : 'US dollars')) +
      '<div class="px-seg small" role="group" aria-label="Show totals in">' + ['USD', 'CAD'].map(function (c) { return '<button type="button" data-ccy="' + c + '" aria-pressed="' + (ccy() === c) + '"' + (ccy() === c ? ' class="on"' : '') + '>' + c + '</button>'; }).join('') + '</div></div>' +
      (M.sized.length ? '<div class="px-big">' + usd(M.total) + '</div>' +
        (gain != null ? '<div class="px-gain ' + (gain >= 0 ? 'up' : 'down') + '">' + (gain >= 0 ? '+' : '−') + usd(Math.abs(gain)) + ' (' + pct(gain / glIn * 100) + ') ' + (gl.length === M.sized.length ? 'on what you paid' : 'on the ' + plural(gl.length, 'holding') + ' with an average price') + '</div>' : '') +
        '<p class="form-note">From ' + basis + '.' + fxNote + ' ' + plural(M.sized.length, 'position') + ' with a size' + (M.rows.length > M.sized.length ? ', ' + (M.rows.length - M.sized.length) + ' without' : '') + '.' +
          (M.rows.some(function (r) { return r.w.shares && !r.v; }) ? ' Holdings in shares count once you add their average price.' : '') + '</p>'
        : '<div class="px-big muted">—</div><p class="form-note">Add how much you own on each holding (optional) to see your total, your weights and what you really own.</p>') +
      (M.sized.some(function (r) { return r.d && r.d.hist && r.d.q; }) ? perfChart(M) : soon('Performance tracking starts with live prices', 'Once live price data is switched on, this charts how your current holdings have moved over the past year.')) +
      '</section>';

    // Health cards
    var cards = [];
    if (M.top.length && M.total) {
      var t0 = M.top[0], p0 = t0.tot / M.total * 100;
      cards.push(health('Biggest company', p0.toFixed(0) + '%', p0, '#F5B83D', esc(t0.t) + (Object.keys(t0.via).length ? ', counting your shares plus what your ETFs hold.' : ' is your biggest single position.')));
    }
    var stockVal = stocks.reduce(function (a, r) { return a + (r.v ? r.v.now : 0); }, 0);
    var smartVal = stocks.reduce(function (a, r) { return a + (r.v && r.d && r.d.h && r.d.h.length ? r.v.now : 0); }, 0);
    if (stocks.length) cards.push(health('Smart money overlap', stockVal ? Math.round(smartVal / stockVal * 100) + '%' : owned + '/' + stocks.length, stockVal ? smartVal / stockVal * 100 : owned / stocks.length * 100, '#2DD4BF', stockVal ? 'Of the money in your stocks is in companies a tracked fund manager also owns.' : 'Of your stocks are owned by a tracked fund manager.'));
    if (M.top.length && M.total) {
      var t10 = M.top.reduce(function (a, x) { return a + x.tot; }, 0) / M.total * 100;
      cards.push(health('Top 10 companies', t10.toFixed(0) + '%', t10, '#F87171', 'Share of everything you own that sits in your 10 biggest companies' + (M.etfRows.some(function (r) { return r.d.etf.top; }) ? ', counting inside your ETFs.' : M.etfRows.length ? ' you hold directly. ETFs are counted once their holdings load.' : '.')));
    }
    var next = stocks.filter(function (r) { return r.d && r.d.e && r.d.e.d >= today(); }).sort(function (a, b) { return a.d.e.d.localeCompare(b.d.e.d); })[0];
    if (next) cards.push(health('Next earnings', fmtShort(next.d.e.d), 100, '#60A5FA', esc(next.t) + ' reports ' + esc(next.d.e.l) + (next.d.e.t === 'amc' ? ' after the close' : next.d.e.t === 'bmo' ? ' before the open' : '') + '.'));
    html += '<section class="px-health" aria-label="Portfolio health">' + cards.join('') + '</section></div>';

    // Allocation + country/sector
    if (M.sized.length) {
      html += '<div class="px-grid2">';
      html += '<section class="card" aria-label="Where your money is"><h2 class="px-h2">Where your money is</h2><div class="px-donut-wrap">' + donut(M) + '<div class="px-legend">' +
        M.sized.slice().sort(function (a, b) { return b.v.now - a.v.now; }).map(function (r, i) { return '<div><span class="sw" style="background:' + COLORS[i % COLORS.length] + '"></span><b>' + esc(r.t) + '</b><span class="m">' + usd(r.v.now) + '</span><span class="p">' + (r.v.now / M.total * 100).toFixed(1) + '%</span></div>'; }).join('') + '</div></div></section>';
      html += '<section class="card" aria-label="By country and sector"><h2 class="px-h2">By country and sector</h2>' + '<p class="form-note">' + (M.etfRows.length ? 'Looking inside your ETFs. ' : '') + 'Stocks you hold directly count where they’re listed.</p>' + splitBar(M.countries, M.total) + bars(M.sectors, M.total, 6) +
        (M.etfNoData ? '<p class="form-note">' + usd(M.etfNoData) + ' is in ETFs whose holdings we can’t see yet (shown as “Not yet known”).</p>' : '') + '</section>';
      html += '</div>';
    }

    // Holdings table
    html += addBox(me);
    html += '<section class="card" aria-label="Your holdings"><h2 class="px-h2">Your holdings <span class="form-note">' + plural(stocks.length, 'stock') + ' · ' + plural(M.rows.length - stocks.length, 'ETF') + '</span></h2><div class="px-table-wrap"><table class="px-table"><thead><tr><th>Holding</th><th>Your position</th><th>Weight</th><th class="num">Value</th><th>Smart money</th><th>Earnings</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      (me.watchlist || []).map(function (w) { return holdingRow(w, M); }).join('') + '</tbody></table></div>' +
      '<p class="form-note">Values use ' + basis + '. Amounts are shown as you entered them.</p></section>';

    // What you really own
    if (M.etfRows.some(function (r) { return r.d.etf.top; }) && M.top.length) html += reallyOwn(M);
    // ETF scorecard
    var etfs = (me.watchlist || []).filter(function (w) { return isEtf(w.ticker); });
    if (etfs.length) html += etfCard(etfs, M);
    return html;
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function health(k, v, bar, color, s) {
    return '<div class="card px-hc">' + label(k) + '<div class="px-hv" style="color:' + color + '">' + v + '</div><div class="px-meter"><span style="width:' + Math.max(2, Math.min(100, bar)).toFixed(0) + '%;background:' + color + '"></span></div><p>' + s + '</p></div>';
  }
  function donut(M) {
    var C = 2 * Math.PI * 56, cum = 0;
    var segs = M.sized.slice().sort(function (a, b) { return b.v.now - a.v.now; }).map(function (r, i) {
      var len = r.v.now / M.total * C;
      var s = '<circle cx="80" cy="80" r="56" fill="none" stroke="' + COLORS[i % COLORS.length] + '" stroke-width="22" stroke-dasharray="' + Math.max(0, len - 2).toFixed(2) + ' ' + (C - len + 2).toFixed(2) + '" stroke-dashoffset="' + (-cum).toFixed(2) + '"></circle>';
      cum += len;
      return s;
    }).join('');
    return '<svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Donut chart of your holdings by value"><g transform="rotate(-90 80 80)">' + segs + '</g><text x="80" y="76" text-anchor="middle" fill="#8A93A8" font-size="11" font-family="IBM Plex Mono, monospace">' + M.sized.length + ' HOLDINGS</text><text x="80" y="96" text-anchor="middle" fill="currentColor" font-size="16" font-family="IBM Plex Mono, monospace">' + money(M.total) + '</text></svg>';
  }
  function splitBar(obj, total) {
    var keys = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    var cols = ['#60A5FA', '#F472B6', '#A78BFA', '#2DD4BF', '#FB923C', '#94A3B8', '#E2E8F0'];
    return '<div class="px-split" aria-label="' + esc(keys.map(function (k) { return k + ' ' + Math.round(obj[k] / total * 100) + '%'; }).join(', ')) + '">' + keys.map(function (k, i) { return '<span style="width:' + (obj[k] / total * 100).toFixed(1) + '%;background:' + cols[i % cols.length] + '"></span>'; }).join('') + '</div>' +
      '<div class="px-split-key">' + keys.slice(0, 6).map(function (k, i) { return '<span><i style="background:' + cols[i % cols.length] + '"></i>' + esc(k) + ' <b>' + Math.round(obj[k] / total * 100) + '%</b></span>'; }).join('') + '</div>';
  }
  function bars(obj, total, n) {
    return Object.keys(obj).filter(function (k) { return k !== 'Other' && k !== 'Not yet known'; }).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, n).map(function (k) {
      var p = obj[k] / total * 100;
      return '<div class="px-bar"><div class="px-bar-l"><span>' + esc(k) + '</span><b>' + Math.round(p) + '%</b></div><div class="px-bar-t"><span style="width:' + p.toFixed(1) + '%"></span></div></div>';
    }).join('');
  }
  function perfChart(M) {
    // Portfolio value over time from licensed weekly closes, vs. SPY, both rebased to 100 at the earliest add date.
    // Today's holdings held unchanged over the past year, from licensed weekly closes (an illustration, not your actual history).
    var rows = M.sized.filter(function (r) { return r.d && r.d.hist && r.d.hist.length && r.d.q && r.d.q.p; });
    if (!rows.length) return '';
    var yearAgo = addDays(-365);
    var dates = rows[0].d.hist.map(function (h) { return h[0]; }).filter(function (d) { return d >= yearAgo; });
    if (dates.length < 8) return '';
    var at = function (hist, d) { var p = null; for (var i = 0; i < hist.length && hist[i][0] <= d; i++) p = hist[i][1]; return p; };
    var series = dates.map(function (d) {
      return rows.reduce(function (a, r) { var p = at(r.d.hist, d); return a + (p ? r.v.now / r.d.q.p * p : r.v.now); }, 0);
    });
    var min = Math.min.apply(null, series), max = Math.max.apply(null, series), W = 520, H = 120;
    var pts = series.map(function (v, i) { return (i / (series.length - 1) * W).toFixed(1) + ',' + (H - 8 - (v - min) / ((max - min) || 1) * (H - 24)).toFixed(1); });
    var chg = (series[series.length - 1] / series[0] - 1) * 100, col = chg >= 0 ? '#2DD4BF' : '#F87171';
    return '<div class="px-perf">' + label('Your current holdings over the past year') + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none" role="img" aria-label="Your current holdings moved ' + pct(chg) + ' over the past year"><polyline points="0,' + H + ' ' + pts.join(' ') + ' ' + W + ',' + H + '" fill="' + col + '" fill-opacity=".1" stroke="none"></polyline><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2.5" vector-effect="non-scaling-stroke"></polyline></svg>' +
      '<div class="px-lohi"><span>' + fmtShort(dates[0]) + '</span><span class="' + (chg >= 0 ? 'up' : 'down') + '">' + pct(chg) + ' if held all year</span><span>' + fmtShort(dates[dates.length - 1]) + '</span></div></div>';
  }
  function chip(text, tone) { return '<span class="px-chip ' + (tone || '') + '">' + text + '</span>'; }
  function holdingRow(w, M) {
    var t = w.ticker, d = S.data[t], v = value(w);
    var name = (d && d.n) || (S.index.tickers[t] && S.index.tickers[t][0]) || (S.names && S.names[t]) || '';
    var caOnly = /\.TO$/.test(t) && !(d && d.etf);
    var weight = v && M.total ? v.now / M.total * 100 : null;
    var sm = '', er = '';
    if (d && d.etf) {
      sm = chip(d.etf.count ? d.etf.count.toLocaleString('en-US') + ' holdings' : 'ETF', '');
      er = '<a href="#etf-card" data-etf="' + esc(t) + '">Look inside →</a>';
    } else if (caOnly) {
      sm = '<span title="US fund-manager, politician and insider filings only cover US-listed shares.">' + chip('Toronto listing', '') + '</span>';
    } else if (d) {
      var b = (d.h || []).filter(function (h) { return h[2] === 'New' || h[2] === 'Add'; }).length, s = (d.h || []).filter(function (h) { return h[2] === 'Trim'; }).length + (d.x || []).length;
      sm = (d.h || []).length || s ? chip(b + '↑ ' + s + '↓', b > s ? 'up' : s > b ? 'down' : '') : chip('No tracked owner', '');
      if (d.le && d.le.est != null && d.le.d >= addDays(-50)) er = chip(d.le.eps >= d.le.est ? 'Beat' : 'Missed', d.le.eps >= d.le.est ? 'up' : 'down');
      else if (d.e && d.e.d >= today()) er = chip(fmtShort(d.e.d), '');
    }
    var pos = w.amount ? sym(typedCcy(w)) + Math.round(w.amount).toLocaleString('en-US') : w.shares ? (+w.shares).toLocaleString('en-US') + ' shares' : '<span class="muted">—</span>';
    if (w.paid && w.shares) pos += '<div class="tkr-name">avg. ' + price(+w.paid, typedCcy(w)) + ' a share</div>';
    return '<tr' + (w.active ? '' : ' class="paused"') + '><td>' + tkr(t, d) + (w.input ? ' <span class="tag" title="Matched from the Toronto listing">from ' + esc(w.input) + '</span>' : '') + (w.active ? '' : ' <span class="tag tag-gold">Paused</span>') + '<div class="tkr-name">' + esc(name) + '</div>' + (d && d.q && d.q.p ? '<div class="tkr-name mono">' + price(d.q.p, nativeCcy(t)) + (d.q.chg != null ? ' <span class="' + (d.q.chg >= 0 ? 'up' : 'down') + '">' + pct(d.q.chg, 2) + '</span>' : '') + '</div>' : '') + '</td>' +
      '<td>' + pos + ' <button type="button" class="linklike" data-edit="' + esc(t) + '">' + (w.amount || w.shares ? 'Edit' : 'Add size') + '</button>' + posForm(w) + '</td>' +
      '<td>' + (weight != null ? '<div class="px-wbar"><span style="width:' + Math.min(100, weight * 2.5).toFixed(0) + '%"></span></div><span class="mono">' + weight.toFixed(1) + '%</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td class="num mono">' + (v ? usd(v.now) + (v.kind === 'paid' ? '<div class="tkr-name">at your average price</div>' : '') + (v.kind === 'live' && v.invested ? '<div class="tkr-name ' + (v.now >= v.invested ? 'up' : 'down') + '">' + (v.now >= v.invested ? '+' : '−') + usd(Math.abs(v.now - v.invested)) + ' (' + pct((v.now / v.invested - 1) * 100) + ')</div>' : '') : w.shares ? '<button type="button" class="linklike" data-edit="' + esc(t) + '">Add average price</button>' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + sm + '</td><td>' + er + '</td>' +
      '<td><button class="icon-btn wl-remove" type="button" data-remove="' + esc(t) + '" aria-label="Remove ' + esc(t) + '"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></td></tr>';
  }
  function addDays(n) { return new Date(Date.now() + n * 864e5).toISOString().slice(0, 10); }
  function posForm(w) {
    var t = esc(w.ticker), unit = w.amount ? 'amount' : 'shares', open = S.openPos === w.ticker;
    return '<form class="wl-pos-form" data-pos="' + t + '" novalidate' + (open ? '' : ' hidden') + '>' +
      '<label class="px-pf"><span>You own</span><span class="px-pf-row"><input class="input input-sm" name="n" inputmode="decimal" placeholder="' + (unit === 'shares' ? '10' : '10,000') + '" value="' + esc(w.shares || w.amount || (S.prefill && S.prefill[w.ticker]) || '') + '" aria-label="How much of ' + t + ' you own">' +
      '<select class="input input-sm" name="unit" aria-label="Shares or dollars"><option value="shares"' + (unit === 'shares' ? ' selected' : '') + '>shares</option><option value="amount"' + (unit === 'amount' ? ' selected' : '') + '>$ invested</option></select></span></label>' +
      '<label class="px-pf px-pf-paid"' + (unit === 'shares' ? '' : ' hidden') + '><span>Average price per share <b class="px-req" aria-hidden="true">*</b></span><input class="input input-sm" name="paid" inputmode="decimal" placeholder="$150.00" aria-required="true" value="' + esc(w.shares && w.paid ? w.paid : '') + '" aria-label="Average price you paid per share of ' + t + ' (required)"></label>' +
      '<label class="px-pf"><span>In</span><select class="input input-sm" name="cur" aria-label="Currency of the amount or average price">' + ['USD', 'CAD'].map(function (c) { return '<option value="' + c + '"' + (typedCcy(w) === c ? ' selected' : '') + '>' + (c === 'USD' ? 'US$' : 'C$') + '</option>'; }).join('') + '</select></label>' +
      '<span class="px-pf-act"><button class="btn btn-sm btn-gold" type="submit">Save</button>' + (w.shares || w.amount ? '<button class="linklike" type="button" data-clear="' + t + '">Remove size</button>' : '<button class="linklike" type="button" data-edit="' + t + '">Later</button>') + '</span>' +
      '<p class="form-note px-pf-note" role="status">' + (unit === 'shares' ? 'Your broker shows it as “average cost” or “book cost per share”.' : 'The dollar amount you put in.') + '</p></form>';
  }
  function resultsHtml() {
    if (!S.results || !S.results.length) return '';
    var msg = {
      added: function (r) { return '<b>' + esc(r.ticker) + '</b> added' + (r.needsPrice ? '. Add your average price per share to include your ' + (+r.needsPrice).toLocaleString('en-US') + ' shares' : ''); },
      mapped: function (r) { return '<b>' + esc(r.input) + '</b> added as its ' + esc(r.listing || 'New York') + ' listing <b>' + esc(r.ticker) + '</b>' + (r.needsPrice ? '. Add your average price per share to include your ' + (+r.needsPrice).toLocaleString('en-US') + ' shares' : ''); },
      duplicate: function (r) { return '<b>' + esc(r.ticker) + '</b> is already on your list'; },
      limit: function (r) { return '<b>' + esc(r.ticker) + '</b> not added: your plan watches ' + S.me.limit + (S.me.pro ? '' : ' (<a href="#" data-open="membership">Pro watches 50</a>)'); },
      unknown: function (r) { return '<b>' + esc(r.input) + '</b> isn’t a ticker we recognise. Check the spelling?'; },
      invalid: function (r) { return '<b>' + esc(r.input) + '</b> doesn’t look like a ticker'; },
      not_covered: function (r) { return '<b>' + esc(r.input) + '</b> only trades in Canada and isn’t covered yet. Fund manager 13F filings cover US-listed shares only'; },
      error: function (r) { return esc(r.input); },
    };
    return '<ul class="wl-results" role="status">' + S.results.map(function (r) {
      var ok = (r.status === 'added' || r.status === 'mapped') && !r.needsPrice;
      return '<li class="' + (ok ? 'ok' : 'warn') + '"><i class="fa-solid ' + (ok ? 'fa-check' : 'fa-circle-info') + '" aria-hidden="true"></i><span>' + (msg[r.status] || msg.error)(r) + '</span></li>';
    }).join('') + '</ul>';
  }
  function reallyOwn(M) {
    var max = M.top[0].tot;
    var etfT = M.etfRows.filter(function (r) { return r.d.etf.top; }).map(function (r) { return r.t; });
    var cols = { direct: '#F5B83D' }, palette = ['#E2E8F0', '#FB923C', '#A78BFA', '#60A5FA'];
    etfT.forEach(function (t, i) { cols[t] = palette[i % palette.length]; });
    var rows = M.top.map(function (x) {
      var segs = '<span style="width:' + (x.d / x.tot * 100).toFixed(1) + '%;background:' + cols.direct + '"></span>' + etfT.map(function (t) { return x.via[t] ? '<span style="width:' + (x.via[t] / x.tot * 100).toFixed(1) + '%;background:' + cols[t] + '"></span>' : ''; }).join('');
      return '<div class="px-ro"><b class="mono">' + esc(x.t) + '</b><div class="px-ro-bar" style="width:' + Math.max(3, x.tot / max * 100).toFixed(1) + '%">' + segs + '</div><span class="mono">' + usd(x.tot) + ' <span class="muted">' + (x.tot / M.total * 100).toFixed(1) + '%</span></span></div>';
    }).join('');
    var insights = [];
    var multi = M.top.filter(function (x) { return x.d > 0 && Object.keys(x.via).length; })[0];
    if (multi) insights.push(['You own ' + multi.t + ' ' + (Object.keys(multi.via).length + 1 === 2 ? 'two' : 'three') + ' ways', (multi.tot / M.total * 100).toFixed(1) + '%', '#F5B83D', usd(multi.d) + ' in your own shares' + Object.keys(multi.via).map(function (t) { return ', ' + usd(multi.via[t]) + ' inside ' + t; }).join('') + '.']);
    var us = M.countries['United States'] || 0;
    if (us) insights.push(['How American you are', Math.round(us / M.total * 100) + '% US', '#60A5FA', 'Of your money is in US companies' + (M.countries.Canada ? ', ' + Math.round(M.countries.Canada / M.total * 100) + '% in Canada.' : '.') + (etfT.length > 1 ? ' Holding several broad ETFs mostly repeats the same big US companies.' : '')]);
    var t10 = M.top.reduce(function (a, x) { return a + x.tot; }, 0);
    insights.push(['Ten companies, a big share', Math.round(t10 / M.total * 100) + '%', '#F87171', 'Your 10 biggest companies add up to ' + usd(t10) + ' of your ' + usd(M.total) + '.']);
    return '<section class="card px-really" aria-label="What you really own"><div class="px-h2row"><h2 class="px-h2">What you really own</h2><span class="form-note">Your shares plus the companies inside your ETFs, added up</span></div><div class="px-grid2 tight"><div>' + label('Your 10 biggest companies, everything combined') + rows +
      '<div class="px-split-key"><span><i style="background:#F5B83D"></i>Shares you own directly</span>' + etfT.map(function (t) { return '<span><i style="background:' + cols[t] + '"></i>Inside ' + esc(t) + '</span>'; }).join('') + '</div></div><div class="px-insights">' +
      insights.map(function (i) { return '<div class="px-ins"><div class="px-ins-h"><span>' + esc(i[0]) + '</span><b style="color:' + i[2] + '">' + esc(i[1]) + '</b></div><p>' + esc(i[3]) + '</p></div>'; }).join('') + '</div></div></section>';
  }
  var KIND = {
    core: ['Core holding', 'A broad, low-maintenance fund meant to sit at the centre of a portfolio.'],
    growth: ['Growth tilt', 'Leans towards fast-growing companies, mostly technology. Expect bigger swings than the overall market.'],
    sector: ['Sector bet', 'Concentrated in one industry. Good for a view on that sector; not a whole portfolio on its own.'],
    dividend: ['Income focus', 'Picks companies that pay higher dividends. Often steadier, usually less growth.'],
    international: ['International', 'Companies outside North America, for spreading risk beyond the US and Canada.'],
    commodity: ['Commodity-linked', 'Moves with a commodity. Gold-miner funds typically swing more than gold itself.'],
    bonds: ['Bonds', 'Lends money to governments and companies. Usually much steadier than stocks.'],
    cash: ['Cash', 'Holds high-interest savings deposits at banks. Steady, earns interest, little growth.'],
    thematic: ['Thematic', 'A concentrated bet on a theme or a manager’s picks. Can rise and fall sharply.'],
    allocation: ['All-in-one portfolio', 'A complete portfolio in one ticker, holding several other ETFs and rebalanced for you.'],
  };
  function etfCard(etfs, M) {
    var t = S.etf && etfs.some(function (w) { return w.ticker === S.etf; }) ? S.etf : etfs[0].ticker;
    var d = S.data[t], e = d.etf, k = KIND[e.kind] || KIND.core;
    var w = etfs.filter(function (x) { return x.ticker === t; })[0], v = value(w);
    var sw = etfs.length > 1 ? '<div class="px-seg" role="group" aria-label="Choose an ETF">' + etfs.map(function (x) { return '<button type="button" data-etf="' + esc(x.ticker) + '" aria-pressed="' + (x.ticker === t ? 'true' : 'false') + '"' + (x.ticker === t ? ' class="on"' : '') + '>' + esc(x.ticker) + '</button>'; }).join('') + '</div>' : '';
    var body = '';
    if (e.top) {
      var src = e.proxy ? 'Holdings shown from ' + e.proxy + ', a US fund that tracks the same index (' + esc(e.index) + '), as of ' + fmtDate(e.period) + '.' : 'From its SEC Form N-PORT filing for ' + fmtDate(e.period) + (e.filed ? ', filed ' + fmtDate(e.filed) : '') + '.';
      var conc = e.top10;
      body += '<div class="px-grid4">' +
        '<div class="px-sub">' + label('Concentration') + '<div class="px-hv">' + conc.toFixed(0) + '%</div><div class="px-meter"><span style="width:' + Math.min(100, conc) + '%;background:#F87171"></span></div><p>in its 10 biggest holdings, out of ' + (e.count || 0).toLocaleString('en-US') + '. ' + (conc > 50 ? 'Very concentrated.' : conc > 30 ? 'Fairly concentrated at the top.' : 'Well spread out.') + '</p></div>' +
        '<div class="px-sub">' + label('What’s inside') + e.top.slice(0, 6).map(function (h) { return '<div class="px-bar"><div class="px-bar-l"><span>' + esc(h[0]) + '</span><b>' + h[1].toFixed(1) + '%</b></div><div class="px-bar-t"><span style="width:' + Math.min(100, h[1] * 5).toFixed(1) + '%;background:#FB923C"></span></div></div>'; }).join('') + '</div>' +
        '<div class="px-sub">' + label('Countries') + splitBar(renameCountries(e.countries), 100) + '</div>' +
        '<div class="px-sub">' + label('Sectors') + bars(e.sectors, 100, 5) + '</div></div>' +
        '<p class="form-note">' + src + (e.url ? ' <a href="' + esc(e.url) + '" target="_blank" rel="noopener">Official filing</a>' : '') + '</p>';
    } else {
      body += soon('Holdings for ' + esc(t) + ' are coming soon', esc(e.ca ? 'Canadian ETFs don’t file holdings with the SEC. We’ll show what’s inside once issuer data is connected.' : 'We haven’t loaded this fund’s latest SEC filing yet. It updates monthly.'));
    }
    var retTitle = d.hist && d.hist.length > 40 ? returnsHtml(d, w) : soon('Returns, risk and fees arrive with live data', '1, 3, 5 and 10-year returns with dividends, a risk score from its real ups and downs, and its annual fee in dollars on your position.');
    return '<section id="etf-card" class="card px-etf" aria-label="ETF scorecard"><div class="px-h2row"><div>' + label('ETF scorecard') + '<h2 class="px-h2"><span class="mono">' + esc(t) + '</span> · ' + esc(d.n) + '</h2><p class="form-note">' + esc(e.index ? 'Tracks the ' + e.index + ' index' : 'Actively managed') + (v ? ' · your position ' + usd(v.now) : '') + '</p></div>' + sw + '</div>' +
      body + retTitle +
      '<div class="px-verdict"><span class="px-role">' + esc(k[0]) + '</span><div><p>' + esc(k[1]) + (e.top ? ' ' + (e.top10 > 40 ? 'Its biggest 10 holdings are ' + e.top10.toFixed(0) + '% of it, so a few companies drive most of the result.' : 'No single company dominates it.') : '') + '</p><p class="form-note">A description of the fund, not a recommendation for your situation.</p></div></div></section>';
  }
  /** Price returns over 1/3/5/10 years (annualised past 1 year) and a risk read from the worst fall, from licensed closes. */
  function returnsHtml(d) {
    var h = d.hist, last = h[h.length - 1], p = d.q && d.q.p ? d.q.p : last[1];
    var back = function (yrs) {
      var target = new Date(Date.parse(last[0]) - yrs * 365.25 * 864e5).toISOString().slice(0, 10);
      if (h[0][0] > addDaysFrom(target, 20)) return null;
      var x = null; for (var i = 0; i < h.length && h[i][0] <= target; i++) x = h[i][1];
      return x || h[0][1];
    };
    var cells = [1, 3, 5, 10].map(function (y) {
      var b = back(y);
      if (!b) return '<div><span class="px-label">' + y + ' year' + (y > 1 ? 's' : '') + '</span><b class="muted">—</b><span class="tkr-name">not enough history</span></div>';
      var tot = p / b - 1, ann = y > 1 ? Math.pow(1 + tot, 1 / y) - 1 : tot;
      return '<div><span class="px-label">' + y + ' year' + (y > 1 ? 's' : '') + '</span><b class="mono ' + (ann >= 0 ? 'up' : 'down') + '">' + pct(ann * 100) + '</b><span class="tkr-name">' + (y > 1 ? 'a year · ' + pct(tot * 100, 0) + ' total' : 'total') + '</span></div>';
    }).join('');
    var peak = 0, dd = 0;
    h.forEach(function (x) { peak = Math.max(peak, x[1]); dd = Math.min(dd, x[1] / peak - 1); });
    var risk = dd > -0.2 ? ['Lower', '#2DD4BF'] : dd > -0.35 ? ['Medium', '#F5B83D'] : ['Higher', '#F87171'];
    return '<div class="px-rets">' + cells + '<div><span class="px-label">Risk</span><b style="color:' + risk[1] + '">' + risk[0] + '</b><span class="tkr-name">worst fall ' + pct(dd * 100, 0) + ' since ' + h[0][0].slice(0, 4) + '</span></div></div>' +
      '<p class="form-note">Price returns from licensed closing prices, before dividends and fees. Past returns don’t predict future ones.</p>';
  }
  function addDaysFrom(iso, n) { return new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10); }
  function renameCountries(c) { var o = {}; Object.keys(c || {}).forEach(function (k) { var n = countryName(k); o[n] = (o[n] || 0) + c[k]; }); return o; }

  // ---------- Tab 2 · Smart Money ----------
  function tabSmart(M, pro) {
    var all = (S.me.watchlist || []).filter(function (w) { return w.active && !isEtf(w.ticker); });
    var stocks = all.filter(function (w) { return !/\.TO$/.test(w.ticker); });
    var caOnly = all.filter(function (w) { return /\.TO$/.test(w.ticker); }).map(function (w) { return w.ticker; });
    var caNote = caOnly.length ? esc(caOnly.join(', ')) + (caOnly.length > 1 ? ' trade' : ' trades') + ' only in Toronto, and US fund-manager, politician and insider filings only cover US-listed shares.' : '';
    if (!stocks.length) return soon('Add a US-listed stock to see the smart money', (caNote ? caNote + ' ' : '') + 'This tab shows which fund managers, politicians and insiders are buying or selling the stocks you own. ETFs are explained on My Portfolio.');
    var cell = function (b, s, note) {
      var tot = b + s, net = b - s, a = tot ? Math.min(0.55, 0.18 + Math.abs(net) / tot * 0.6) : 0;
      var bg = !tot || !net ? 'var(--px-cell)' : net > 0 ? 'rgba(45,212,191,' + a.toFixed(2) + ')' : 'rgba(248,113,113,' + a.toFixed(2) + ')';
      return '<div class="px-cell" style="background:' + bg + '"><b class="mono">' + (tot ? b + '↑ ' + s + '↓' : '—') + '</b><span>' + esc(note) + '</span></div>';
    };
    var rows = stocks.map(function (w) {
      var d = S.data[w.ticker] || {};
      var h = d.h || [], ih = d.ih || [], cg = (d.cg || []).filter(function (x) { return x.ch !== 'President'; }), pr = (d.cg || []).filter(function (x) { return x.ch === 'President'; });
      var fb = h.filter(function (x) { return x[2] === 'New' || x[2] === 'Add'; }).length, fs = h.filter(function (x) { return x[2] === 'Trim'; }).length + (d.x || []).length;
      var ib = ih.filter(function (x) { return x[2] === 'New' || x[2] === 'Add'; }).length, is = ih.filter(function (x) { return x[2] === 'Trim'; }).length;
      var cb = cg.filter(function (x) { return x.a === 'buy'; }).length, cs = cg.length - cb;
      var pb = pr.filter(function (x) { return x.a === 'buy'; }).length, ps = pr.length - pb;
      var inb = d.cl ? d.cl.i : d.ib ? d.ib.i : 0, ins = d.is ? d.is.i : 0;
      return '<div class="px-hrow"><div class="px-hname">' + tkr(w.ticker, d) + '<span class="tkr-name">' + esc(d.n || '') + '</span></div>' +
        cell(fb, fs, h.length ? plural(h.length, 'holder') + ((d.x || []).length ? ' · ' + d.x.length + ' sold out' : '') : (d.x || []).length ? d.x.length + ' sold out' : 'none tracked') +
        cell(ib, is, ih.length ? plural(ih.length, 'institution') : 'none') +
        cell(cb, cs, cg.length ? 'disclosed, 6 months' : 'none') +
        cell(pb, ps, pr.length ? 'disclosed, 6 months' : 'none') +
        cell(inb, ins, d.cl ? 'buying cluster' : inb || ins ? 'insiders, ' + (S.index.insiderQuarter || 'quarter') : 'no open-market trades') + '</div>';
    }).join('');
    var html = '<section class="card" aria-label="Who is buying and selling your stocks"><div class="px-h2row"><h2 class="px-h2">Who is buying and selling your stocks</h2><span class="form-note">Buys ↑ vs. sells ↓ · fund managers from their last 13F · politicians and insiders from recent disclosures</span></div>' +
      '<div class="px-heat-wrap"><div class="px-heat"><div class="px-hrow head"><div></div><div>Fund managers</div><div>Institutions</div><div>Congress</div><div>President</div><div>Insiders</div></div>' + rows + '</div></div>' +
      '<div class="px-split-key"><span><i style="background:rgba(45,212,191,.45)"></i>More buying</span><span><i style="background:var(--px-cell)"></i>Balanced or none</span><span><i style="background:rgba(248,113,113,.45)"></i>More selling</span><span class="muted">Many insider sales are planned in advance; clusters of insider buying are the rarer signal.</span></div>' + (caNote ? '<p class="form-note">Not shown: ' + caNote + '</p>' : '') + '</section>';

    var feed = activity(stocks);
    var filters = [['all', 'All'], ['fund', 'Fund managers'], ['pol', 'Politicians'], ['ins', 'Insiders']];
    var shown = feed.filter(function (e) { return S.filter === 'all' || e.k === S.filter; });
    var limit = pro ? (S.more ? 60 : 12) : 4;
    html += '<div class="px-grid2"><section class="card" aria-label="Recent activity"><div class="px-h2row"><h2 class="px-h2">Recent activity</h2><div class="px-seg small" role="group" aria-label="Filter activity">' +
      filters.map(function (f) { return '<button type="button" data-filter="' + f[0] + '" aria-pressed="' + (S.filter === f[0] ? 'true' : 'false') + '"' + (S.filter === f[0] ? ' class="on"' : '') + '>' + f[1] + '</button>'; }).join('') + '</div></div>' +
      (shown.length ? '<ol class="px-feed">' + shown.slice(0, limit).map(function (e) {
        return '<li><div class="px-fd">' + esc(e.date) + '<span class="px-ftag">' + esc(e.tag) + '</span></div><div><div><b class="mono ' + (e.buy ? 'up' : 'down') + '">' + esc(e.t) + '</b> · ' + esc(e.text) + '</div><div class="tkr-name">' + esc(e.detail) + (e.u ? ' · <a href="' + esc(e.u) + '" target="_blank" rel="noopener nofollow">Filing</a>' : '') + '</div></div></li>';
      }).join('') + '</ol>' : '<p class="muted">Nothing in this category yet.</p>') +
      (pro && shown.length > limit ? '<button type="button" class="btn btn-sm" data-act="more">Show ' + Math.min(48, shown.length - limit) + ' more</button>' : '') +
      (!pro && shown.length > limit ? lock((shown.length - limit) + ' more moves in your stocks.') : '') + '</section>';
    html += twins(stocks, pro) + '</div>';
    return html;
  }
  function activity(stocks) {
    var out = [];
    stocks.forEach(function (w) {
      var t = w.ticker, d = S.data[t] || {};
      var pres = {};
      (d.cg || []).forEach(function (x) {
        if (x.ch === 'President') { var g = pres[x.f] = pres[x.f] || { b: 0, s: 0, f: x.f, u: x.u, from: x.d, to: x.d }; if (x.a === 'buy') g.b++; else g.s++; if (x.d < g.from) g.from = x.d; if (x.d > g.to) g.to = x.d; return; }
        var key = x.who + '|' + x.a + '|' + x.d + '|' + x.f + '|' + x.amt, prev = out.filter(function (e) { return e.key === key && e.t === t; })[0];
        if (prev) { prev.n++; prev.text = prev.base + ' (' + prev.n + ' trades, each ' + x.amt + ')'; return; }
        var base = (x.ch === 'Senate' ? 'Sen. ' : 'Rep. ') + x.who + (x.p ? ' (' + x.p + ')' : '') + ' ' + (x.a === 'buy' ? 'bought' : 'sold');
        out.push({ k: 'pol', key: key, n: 1, base: base, sort: x.f || x.d, date: fmtShort(x.f || x.d), tag: 'Congress', t: t, buy: x.a === 'buy',
          text: base + (x.amt ? ' ' + x.amt : ''), detail: 'Traded ' + fmtShort(x.d) + ' · disclosed ' + fmtDate(x.f), u: x.u });
      });
      Object.keys(pres).forEach(function (f) {
        var g = pres[f], parts = [];
        if (g.b) parts.push(plural(g.b, 'purchase')); if (g.s) parts.push(plural(g.s, 'sale'));
        out.push({ k: 'pol', sort: f, date: fmtShort(f), tag: 'President', t: t, buy: g.b >= g.s, text: 'President Trump disclosed ' + parts.join(' and '), detail: 'Traded ' + (g.from === g.to ? fmtShort(g.from) : fmtShort(g.from) + '–' + fmtShort(g.to)) + ' · OGE Form 278-T filed ' + fmtDate(f), u: g.u });
      });
      var mv = function (list, inst) {
        (list || []).forEach(function (h) {
          if (h[2] === 'Hold') return;
          var m = S.index.managers[h[0]] || {};
          var txt = h[2] === 'New' ? 'opened a new position' : h[2] === 'Add' ? 'added ' + Math.abs(h[3] || 0) + '% more shares' : 'trimmed ' + Math.abs(h[3] || 0) + '% of their shares';
          out.push({ k: 'fund', sort: m.filed || '', date: fmtShort(m.filed), tag: inst ? 'Institution' : '13F', t: t, buy: h[2] !== 'Trim', text: mname(h[0]) + ' ' + txt, detail: 'Now ' + h[1].toFixed(h[1] < 1 ? 2 : 1) + '% of their portfolio · holdings as of ' + fmtDate(m.period), u: m.url });
        });
      };
      mv(d.h, false); mv(d.ih, true);
      (d.x || []).forEach(function (slug) { var m = S.index.managers[slug] || {}; out.push({ k: 'fund', sort: m.filed || '', date: fmtShort(m.filed), tag: '13F', t: t, buy: false, text: mname(slug) + ' sold the entire position', detail: 'Holdings as of ' + fmtDate(m.period), u: m.url }); });
      if (d.cl) out.push({ k: 'ins', sort: d.cl.e || '', date: fmtShort(d.cl.e), tag: 'Insiders', t: t, buy: true, text: plural(d.cl.i, 'officer or director', 'officers and directors') + ' bought on the open market', detail: (d.cl.s ? fmtShort(d.cl.s) + '–' + fmtShort(d.cl.e) + ' · ' : '') + 'about ' + money(d.cl.v) + ' · SEC Form 4' });
      else if (d.ib) out.push({ k: 'ins', sort: '0', date: S.index.insiderQuarter || '', tag: 'Insiders', t: t, buy: true, text: plural(d.ib.i, 'insider') + ' bought shares on the open market', detail: 'About ' + money(d.ib.v) + ' · SEC Form 4' });
      if (d.is) out.push({ k: 'ins', sort: '0', date: S.index.insiderQuarter || '', tag: 'Insiders', t: t, buy: false, text: plural(d.is.i, 'insider') + ' sold shares on the open market', detail: 'About ' + money(d.is.v) + ' · many sales are planned in advance' });
    });
    return out.sort(function (a, b) { return String(b.sort).localeCompare(String(a.sort)); });
  }
  function twins(stocks, pro) {
    var by = {};
    stocks.forEach(function (w) { ((S.data[w.ticker] || {}).h || []).forEach(function (h) { (by[h[0]] = by[h[0]] || []).push(w.ticker); }); });
    var list = Object.keys(by).map(function (m) { return { m: m, t: by[m] }; }).filter(function (x) { return x.t.length >= (stocks.length > 2 ? 2 : 1); }).sort(function (a, b) { return b.t.length - a.t.length; }).slice(0, 8);
    if (!list.length) return '<section class="card"><h2 class="px-h2">Your portfolio twins</h2><p class="muted">None of the tracked managers own more than one of your stocks yet.</p></section>';
    var shown = pro ? list : list.slice(0, 2);
    return '<section class="card" aria-label="Your portfolio twins"><h2 class="px-h2">Your portfolio twins</h2><p class="form-note">Tracked managers who own the most of the same stocks as you. Gold squares are the stocks you share.</p>' +
      shown.map(function (x) {
        return '<div class="px-twin"><a href="/investors/' + esc(x.m) + '.html">' + esc(mname(x.m)) + '</a><div class="px-twin-cells">' + stocks.map(function (w) { var on = x.t.indexOf(w.ticker) >= 0; return '<span class="' + (on ? 'on' : '') + '" title="' + esc(w.ticker) + '">' + esc(w.ticker) + '</span>'; }).join('') + '</div><b class="mono">' + x.t.length + '/' + stocks.length + '</b></div>';
      }).join('') + (!pro && list.length > 2 ? lock((list.length - 2) + ' more managers who think like you.') : '') + '</section>';
  }

  // ---------- Investor directory (Smart Money tab) ----------
  var CATS = [
    ['value', 'Value investors', 'Buy good businesses when they look cheap and hold them for years. The classic Warren Buffett approach.'],
    ['growth', 'Growth and technology', 'Back fast-growing companies, often in technology, AI, chips and software. Bigger swings, bigger potential.'],
    ['activist', 'Activists and special situations', 'Buy large stakes and push companies to change: new directors, spin-offs, buybacks or a sale.'],
    ['quant', 'Quant, macro and multi-strategy', 'Huge funds holding thousands of stocks, often briefly, and betting on the economy. Good for spotting broad trends, not for copying.'],
    ['canada', 'Canadian investors', 'Canadian pension funds and investment firms that report their US-listed holdings.'],
    ['more', 'More investors worth following', 'Respected managers with distinctive styles, from patient small-company investors to sustainability specialists.'],
  ];
  function bn(v) { return v >= 1e12 ? '$' + (v / 1e12).toFixed(1) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : '$' + Math.round(v / 1e6) + 'M'; }
  function dirHtml(pro) {
    if (S.dir == null) return '<section class="card"><p class="form-note"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading the investor directory…</p></section>';
    if (S.dir === false) return '';
    var mine = {}; (S.me.watchlist || []).forEach(function (w) { mine[w.ticker === 'GOOGL' ? 'GOOG' : w.ticker] = 1; });
    var all = Object.keys(S.dir).map(function (k) { var m = S.dir[k]; m.slug = k; var sh = {}; m.top.forEach(function (h) { var k = h[0] === 'GOOGL' ? 'GOOG' : h[0] === 'BRK.A' ? 'BRK.B' : h[0]; if (mine[k]) sh[k] = 1; }); m.shared = Object.keys(sh).length; return m; });
    var cat = S.dirCat || 'all', q = (S.dirQ || '').toLowerCase();
    var list = all.filter(function (m) { return (cat === 'all' || m.c.indexOf(cat) >= 0) && (!q || (m.n + ' ' + m.f).toLowerCase().indexOf(q) >= 0); })
      .sort(function (a, b) { return b.shared - a.shared || b.v - a.v; });
    var c = CATS.filter(function (x) { return x[0] === cat; })[0];
    var html = '<section class="card px-dir" aria-label="All tracked investors"><div class="px-h2row"><div><h2 class="px-h2">All ' + all.length + ' tracked investors</h2><p class="form-note">From each firm’s latest 13F filing. Sorted by how many of your stocks they own, then by size.</p></div>' +
      '<label class="sr-only" for="px-dir-q">Search investors</label><input class="input input-sm" id="px-dir-q" placeholder="Search a name or firm" value="' + esc(S.dirQ || '') + '"></div>' +
      '<div class="px-seg small px-dir-cats" role="group" aria-label="Investor category">' + [['all', 'All']].concat(CATS.map(function (x) { return [x[0], x[1]]; })).map(function (x) {
        var n = x[0] === 'all' ? all.length : all.filter(function (m) { return m.c.indexOf(x[0]) >= 0; }).length;
        return '<button type="button" data-dircat="' + x[0] + '" aria-pressed="' + (cat === x[0]) + '"' + (cat === x[0] ? ' class="on"' : '') + '>' + esc(x[1]) + ' <span class="muted">' + n + '</span></button>';
      }).join('') + '</div>' + (c ? '<p class="px-dir-desc">' + esc(c[2]) + '</p>' : '') +
      '<div class="px-dir-grid">' + list.map(function (m) { return dirCard(m, mine, pro); }).join('') + '</div>' + (list.length ? '' : '<p class="muted">No investor matches that search.</p>') + '</section>';
    return html;
  }
  function dirCard(m, mine, pro) {
    var open = S.dirOpen === m.slug, locked = m.p && !pro;
    var head = '<button type="button" class="px-dir-h" data-diropen="' + esc(m.slug) + '" aria-expanded="' + open + '"><span class="px-dir-n"><b>' + esc(m.n) + '</b>' + (m.g ? ' <span class="px-chip">Institution</span>' : '') + '<span class="tkr-name">' + esc(m.f) + '</span></span>' +
      '<span class="px-dir-k"><b class="mono">' + bn(m.v) + '</b><span class="tkr-name">' + m.k.toLocaleString('en-US') + ' positions</span></span></button>';
    var chips = '<div class="px-dir-top">' + m.top.slice(0, 6).map(function (h) { var own = mine[h[0] === 'GOOGL' ? 'GOOG' : h[0]]; return '<span class="px-chip' + (own ? ' gold' : '') + '" title="' + h[1] + '% of the portfolio">' + esc(h[0]) + '</span>'; }).join('') +
      (m.shared ? '<span class="form-note">owns ' + plural(m.shared, 'of your stocks', 'of your stocks') + ' in its top 12</span>' : '') + '</div>';
    var body = '';
    if (open) {
      if (locked) body = lock(esc(m.n) + '’s full portfolio and moves are part of QWERTx Pro.');
      else {
        var max = m.top[0] ? m.top[0][1] : 1;
        body = '<div class="px-dir-body"><p>' + esc(m.a) + '</p>' + (m.t.length ? '<div>' + m.t.map(function (t) { return '<span class="px-chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
          '<div class="px-grid2 tight"><div>' + label('Biggest positions' + (m.topN ? ' (we keep its top ' + m.topN + ')' : '')) + m.top.map(function (h) {
            var own = mine[h[0] === 'GOOGL' ? 'GOOG' : h[0]];
            return '<div class="px-bar"><div class="px-bar-l"><span>' + (own ? '<b class="gold">' + esc(h[0]) + '</b> · you own' : esc(h[0])) + (h[2] === 'New' ? ' <span class="px-chip up">New</span>' : h[2] === 'Add' ? ' <span class="px-chip up">Added</span>' : h[2] === 'Trim' ? ' <span class="px-chip down">Trimmed</span>' : '') + '</span><b>' + h[1].toFixed(1) + '%</b></div><div class="px-bar-t"><span style="width:' + Math.max(2, h[1] / max * 100).toFixed(1) + '%;background:' + (own ? '#F5B83D' : 'var(--teal)') + '"></span></div></div>';
          }).join('') + '</div><div>' + label('Biggest moves last quarter') + (m.moves.length ? m.moves.map(function (x) { return '<span class="px-chip ' + (x[1] === 'Trim' || x[1] === 'Sold' ? 'down' : 'up') + '">' + esc(x[0]) + ' · ' + (x[1] === 'New' ? 'new' : x[1] === 'Add' ? 'added' : x[1] === 'Trim' ? 'trimmed' : 'sold out') + '</span>'; }).join('') : '<p class="muted">No big changes.</p>') +
          '<p class="form-note">Holdings as of ' + fmtDate(m.period) + ', filed ' + fmtDate(m.filed) + '. <a href="' + esc(m.url) + '" target="_blank" rel="noopener">Official filing</a>' + (m.p ? '' : ' · <a href="/investors/' + esc(m.slug) + '.html">Full profile</a>') + '</p></div></div></div>';
      }
    }
    return '<article class="px-dir-card' + (open ? ' open' : '') + '">' + head + chips + body + '</article>';
  }

  // ---------- Tab 3 · Analyst Targets ----------
  function tabAnalyst(M, pro) {
    var stocks = (S.me.watchlist || []).filter(function (w) { return w.active && !isEtf(w.ticker); });
    var withAn = stocks.filter(function (w) { var d = S.data[w.ticker]; return d && d.an && d.q && d.q.p; });
    if (!S.index.vendor || !withAn.length) {
      return '<section class="card px-analyst-empty"><h2 class="px-h2">What Wall Street expects from your stocks</h2>' +
        soon('Analyst targets are coming soon', (S.index.vendor ? 'None of your stocks has analyst coverage in the latest data update yet. Once it does, this tab shows' : 'Analyst price targets and ratings are licensed data. Once QWERTx’s data licence is in place, this tab shows') + ' for each of your stocks the lowest, average and highest 12-month target next to today’s price, the buy/hold/sell split, and what your own positions would be worth if the targets are right.') +
        '<p class="form-note">Until then, the <a href="#" data-tab-go="earnings">Earnings &amp; News</a> tab shows whether your companies beat analysts’ expectations, from the official earnings calendar.</p></section>';
    }
    if (!pro) return '<section class="card"><h2 class="px-h2">What Wall Street expects from your stocks</h2>' + lock('Analyst targets and your personal scenarios are part of QWERTx Pro.') + '</section>';
    var info = withAn.map(function (w) {
      var d = S.data[w.ticker], a = d.an, p = d.q.p, v = value(w);
      var n = (a.sb || 0) + (a.b || 0) + (a.h || 0) + (a.s || 0) + (a.ss || 0);
      var buy = ((a.sb || 0) + (a.b || 0)) / (n || 1), sell = ((a.s || 0) + (a.ss || 0)) / (n || 1);
      return { w: w, t: w.ticker, d: d, a: a, p: p, v: v, n: n, buy: buy, sell: sell, up: (a.avg / p - 1) * 100, spread: (a.high - a.low) / a.avg,
        consensus: sell > 0.2 ? 'Mixed' : buy >= 0.75 ? 'Strong buy' : buy >= 0.55 ? 'Buy' : 'Hold' };
    });
    var sel = info.filter(function (x) { return x.t === S.sel; })[0] || info[0];
    var sized = info.filter(function (x) { return x.v; });
    var now = sized.reduce(function (a, x) { return a + x.v.now; }, 0);
    var at = function (k) { return sized.reduce(function (a, x) { return a + x.v.now * x.a[k] / x.p; }, 0); };
    var html = '<div class="px-h2row"><h2 class="px-h2 big">What Wall Street expects from your stocks</h2><span class="form-note">12-month analyst price targets · ' + esc(S.index.vendorLabel || 'licensed data') + '</span></div><div class="px-grid2">';
    if (sized.length) {
      var avg = at('avg'), lo = at('low'), hi = at('high');
      var X = function (v) { return (10 + (v - Math.min(lo, now) * 0.97) / (hi * 1.02 - Math.min(lo, now) * 0.97) * 500).toFixed(1); };
      html += '<section class="card">' + label('If analysts are right, in 12 months your stocks are worth') + '<div class="px-big gold">' + usd(avg) + ' <span class="px-gain ' + (avg >= now ? 'up' : 'down') + '">' + pct((avg / now - 1) * 100) + '</span></div><p class="form-note">vs. ' + usd(now) + ' today, using each stock’s average target. ETFs are explained on My Portfolio.</p>' +
        '<svg viewBox="0 0 520 96" width="100%" height="96" role="img" aria-label="Your stocks today ' + usd(now) + ', at average targets ' + usd(avg) + '"><rect x="10" y="40" width="500" height="14" rx="7" fill="var(--px-track)"></rect><rect x="' + X(lo) + '" y="40" width="' + (X(hi) - X(lo)).toFixed(1) + '" height="14" rx="7" fill="var(--px-band)"></rect><line x1="' + X(now) + '" y1="30" x2="' + X(now) + '" y2="64" stroke="currentColor" stroke-width="3"></line><text x="' + X(now) + '" y="22" text-anchor="middle" fill="currentColor" font-size="13" font-family="IBM Plex Mono, monospace">Today ' + usd(now) + '</text><circle cx="' + X(avg) + '" cy="47" r="10" fill="#F5B83D"></circle><text x="' + X(avg) + '" y="84" text-anchor="middle" fill="#F5B83D" font-size="13" font-family="IBM Plex Mono, monospace">Average ' + usd(avg) + '</text></svg>' +
        '<div class="px-lohi"><span>Every lowest target: ' + usd(lo) + '</span><span>Every highest target: ' + usd(hi) + '</span></div></section>';
    }
    var ranked = info.slice().sort(function (a, b) { return b.up - a.up; });
    html += '<section class="card"><h3 class="px-h3">Room to run, ranked</h3><p class="form-note">Average target vs. today’s price. Click a stock for your scenarios.</p>' + ranked.map(function (x) {
      var c = Math.max(-20, Math.min(30, x.up)), left = c >= 0 ? 40 : 40 + c / 50 * 100, width = Math.abs(c) / 50 * 100;
      return '<button type="button" class="px-uprow' + (x.t === sel.t ? ' on' : '') + '" data-sel="' + esc(x.t) + '" aria-pressed="' + (x.t === sel.t ? 'true' : 'false') + '"><b class="mono">' + esc(x.t) + '</b><span class="px-uptrack"><span class="zero"></span><span class="bar ' + (x.up >= 0 ? 'up' : 'down') + '" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></span></span><span class="mono ' + (x.up >= 0 ? 'up' : 'down') + '">' + pct(x.up, 0) + '</span><span class="px-cons">' + esc(x.consensus) + '</span></button>';
    }).join('') + '</section></div>';
    html += '<section class="px-tcards">' + info.map(function (x) {
      var lo = Math.min(x.a.low, x.p) * 0.95, hi = Math.max(x.a.high, x.p) * 1.03;
      var X = function (v) { return 8 + (v - lo) / (hi - lo) * 344; };
      var anc = function (v) { return v < 60 ? 'start' : v > 300 ? 'end' : 'middle'; };
      var pX = X(x.p), aX = X(x.a.avg);
      var seg = [((x.a.sb || 0) + (x.a.b || 0)), x.a.h || 0, ((x.a.s || 0) + (x.a.ss || 0))];
      return '<button type="button" class="card px-tcard' + (x.t === sel.t ? ' on' : '') + '" data-sel="' + esc(x.t) + '" aria-pressed="' + (x.t === sel.t ? 'true' : 'false') + '"><span class="px-tc-h"><b class="mono">' + esc(x.t) + '</b><span class="mono ' + (x.up >= 0 ? 'up' : 'down') + '">' + pct(x.up, 0) + '</span></span>' +
        '<svg viewBox="0 0 360 74" width="100%" height="74" role="img" aria-label="' + esc(x.t) + ' price ' + x.p.toFixed(2) + ', average target ' + x.a.avg + '"><rect x="8" y="32" width="344" height="10" rx="5" fill="var(--px-track)"></rect><rect x="' + X(x.a.low).toFixed(1) + '" y="32" width="' + (X(x.a.high) - X(x.a.low)).toFixed(1) + '" height="10" rx="5" fill="var(--px-band)"></rect><line x1="' + pX.toFixed(1) + '" y1="24" x2="' + pX.toFixed(1) + '" y2="50" stroke="currentColor" stroke-width="3"></line><text x="' + pX.toFixed(1) + '" y="16" text-anchor="' + anc(pX) + '" fill="currentColor" font-size="12.5" font-family="IBM Plex Mono, monospace">Today ' + sym(nativeCcy(x.t)) + x.p.toFixed(0) + '</text><circle cx="' + aX.toFixed(1) + '" cy="37" r="8" fill="#F5B83D"></circle><text x="' + aX.toFixed(1) + '" y="68" text-anchor="' + anc(aX) + '" fill="#F5B83D" font-size="12.5" font-family="IBM Plex Mono, monospace">Target ' + sym(nativeCcy(x.t)) + Math.round(x.a.avg) + '</text></svg>' +
        '<span class="px-lohi"><span>Lowest ' + sym(nativeCcy(x.t)) + Math.round(x.a.low) + '</span><span>' + (x.spread < 0.5 ? 'Analysts mostly agree' : x.spread < 0.8 ? 'Some disagreement' : 'Wide disagreement') + '</span><span>Highest ' + sym(nativeCcy(x.t)) + Math.round(x.a.high) + '</span></span>' +
        '<span class="px-ratings">' + ['Buy', 'Hold', 'Sell'].map(function (l, i) { var wv = seg[i] / (x.n || 1) * 100; return '<span class="' + l.toLowerCase() + '" style="width:' + wv.toFixed(1) + '%">' + (wv >= 16 ? seg[i] + ' ' + l : wv >= 7 ? seg[i] : '') + '</span>'; }).join('') + '</span></button>';
    }).join('') + '</section>';
    if (sel.v) {
      var sc = [['If the lowest target hits', sel.a.low], ['If the average target hits', sel.a.avg], ['If the highest target hits', sel.a.high]].map(function (s) { return { l: s[0], t: s[1], v: sel.v.now * s[1] / sel.p }; });
      var mx = Math.max(sc[2].v, sel.v.now) * 1.05;
      html += '<section class="card px-scen"><div class="px-h2row"><h3 class="px-h3">Your ' + esc(sel.t) + ' position in 12 months</h3><span class="form-note">Worth ' + usd(sel.v.now) + ' today</span></div>' + sc.map(function (s, i) {
        var dlt = s.v - sel.v.now;
        return '<div class="px-sc"><div class="px-bar-l"><span>' + s.l + ' <span class="muted">· ' + sym(nativeCcy(sel.t)) + Math.round(s.t) + '</span></span><span><b class="mono">' + usd(s.v) + '</b> <span class="mono ' + (dlt >= 0 ? 'up' : 'down') + '">' + (dlt >= 0 ? '+' : '−') + usd(Math.abs(dlt)) + '</span></span></div><div class="px-sc-t"><span style="width:' + (s.v / mx * 100).toFixed(1) + '%;background:' + (i === 1 ? '#F5B83D' : dlt >= 0 ? '#2DD4BF' : '#F87171') + '"></span><i style="left:' + (sel.v.now / mx * 100).toFixed(1) + '%"></i></div></div>';
      }).join('') + '<p class="form-note">White line = your position today. Targets tend to run optimistic; read them as a direction, not a promise.</p></section>';
    }
    return html;
  }

  // ---------- Tab 4 · Earnings & News ----------
  var ITEMS = {
    '1.01': ['Major deal', 'gold'], '1.02': ['Deal ended', 'gold'], '1.03': ['Bankruptcy', 'down'], '2.01': ['Acquisition or sale completed', 'gold'], '2.02': ['Earnings release', 'up'],
    '2.03': ['New debt', ''], '2.05': ['Restructuring or layoffs', 'down'], '2.06': ['Write-down', 'down'], '3.01': ['Listing notice', 'down'], '3.02': ['Shares issued', ''],
    '4.01': ['Auditor change', 'down'], '4.02': ['Past results unreliable', 'down'], '5.01': ['Change in control', 'gold'], '5.02': ['Leadership change', 'gold'], '5.03': ['Bylaws changed', ''],
    '5.07': ['Shareholder vote', ''], '7.01': ['Investor update', ''], '8.01': ['Other news', ''],
  };
  var MAJOR = ['1.01', '1.02', '1.03', '2.01', '2.02', '2.05', '2.06', '3.01', '4.01', '4.02', '5.01', '5.02'];
  function tabEarnings(M) {
    var stocks = (S.me.watchlist || []).filter(function (w) { return w.active && !isEtf(w.ticker); });
    if (!stocks.length) return soon('Add a stock to see its earnings and news', 'Upcoming earnings dates, whether results beat expectations, and major company events from official SEC filings.');
    var t0 = today(), horizon = addDays(120);
    var up = stocks.map(function (w) { return { w: w, d: S.data[w.ticker] || {} }; }).filter(function (x) { return x.d.e && x.d.e.d >= t0 && x.d.e.d <= horizon; }).sort(function (a, b) { return a.d.e.d.localeCompare(b.d.e.d); });
    var html = '<section class="card" aria-label="Upcoming earnings"><h2 class="px-h2">Coming up: your next earnings reports</h2>';
    if (up.length) {
      var span = (Date.parse(horizon) - Date.parse(t0)) / 864e5;
      html += '<svg viewBox="0 0 1000 120" width="100%" height="120" role="img" aria-label="Timeline of upcoming earnings: ' + esc(up.map(function (x) { return x.w.ticker + ' ' + x.d.e.l; }).join(', ')) + '"><line x1="90" y1="60" x2="980" y2="60" stroke="var(--px-band)" stroke-width="2"></line><circle cx="90" cy="60" r="6" fill="currentColor"></circle><text x="72" y="65" text-anchor="end" fill="var(--muted)" font-size="13" font-family="IBM Plex Mono, monospace">Today</text>' +
        up.map(function (x, i) { var X = 100 + (Date.parse(x.d.e.d) - Date.parse(t0)) / 864e5 / span * 870; return '<circle cx="' + X.toFixed(1) + '" cy="60" r="10" fill="#F5B83D"></circle><text x="' + X.toFixed(1) + '" y="' + (i % 2 ? 100 : 30) + '" text-anchor="middle" fill="currentColor" font-size="15" font-weight="600" font-family="IBM Plex Mono, monospace">' + esc(x.w.ticker) + '</text><text x="' + X.toFixed(1) + '" y="' + (i % 2 ? 116 : 14) + '" text-anchor="middle" fill="var(--muted)" font-size="12" font-family="IBM Plex Mono, monospace">' + esc(fmtShort(x.d.e.d)) + '</text>'; }).join('') + '</svg>' +
        '<div class="px-grid4">' + up.map(function (x) { var v = value(x.w); return '<div class="px-sub"><b class="mono">' + esc(x.w.ticker) + '</b> <span class="muted">· ' + esc(x.d.e.l) + (x.d.e.est ? ' (expected)' : '') + '</span><p>' + (x.d.e.eps != null ? 'Expected EPS <b>$' + x.d.e.eps.toFixed(2) + '</b>' : 'Estimate not published yet') + (x.d.e.t === 'amc' ? ' · after the close' : x.d.e.t === 'bmo' ? ' · before the open' : '') + '</p>' + (v && M.total ? '<p class="muted">' + (v.now / M.total * 100).toFixed(1) + '% of your portfolio</p>' : '') + '</div>'; }).join('') + '</div>';
    } else html += '<p class="muted">None of your stocks have a report date in the next four months yet.</p>';
    html += '</section><div class="px-grid2">';
    html += '<section class="card" aria-label="Did they beat expectations"><h2 class="px-h2">Did they beat expectations?</h2><p class="form-note">Earnings per share vs. the analysts’ estimate, from the earnings calendar.</p>' + stocks.map(function (w) {
      var d = S.data[w.ticker] || {};
      var hist = (d.er || []).slice(0, 8).reverse();
      var dots = hist.length ? '<span class="px-dots" aria-label="Last ' + hist.length + ' quarters, oldest first">' + hist.map(function (e) { return '<i class="' + (e.e == null ? '' : e.a >= e.e ? 'b' : 'm') + '" title="' + esc(e.d) + '"></i>'; }).join('') + '</span>' : '';
      if (d.le && d.le.est != null) {
        var s = (d.le.eps / d.le.est - 1) * 100 * (d.le.est < 0 ? -1 : 1), beat = d.le.eps >= d.le.est;
        return '<div class="px-res"><b class="mono">' + esc(w.ticker) + '</b><div><div><span class="' + (beat ? 'up' : 'down') + '">' + (beat ? 'Beat' : 'Missed') + '</span>: $' + d.le.eps.toFixed(2) + ' vs. $' + d.le.est.toFixed(2) + ' expected (' + pct(s) + ')</div><div class="tkr-name">Reported ' + esc(d.le.l) + (d.le.q ? ' for the quarter to ' + esc(d.le.q.replace('/', ' ')) : '') + '</div></div>' + dots + '</div>';
      }
      if (d.e) return '<div class="px-res"><b class="mono">' + esc(w.ticker) + '</b><div><div>Reports ' + esc(d.e.l) + '</div><div class="tkr-name">' + (d.e.eps != null ? 'Expected $' + d.e.eps.toFixed(2) + ' a share' : 'Estimate not published yet') + '</div></div>' + dots + '</div>';
      return '<div class="px-res"><b class="mono">' + esc(w.ticker) + '</b><div class="muted">No recent report in the calendar</div>' + dots + '</div>';
    }).join('') + '</section>';
    var ev = [];
    stocks.forEach(function (w) { ((S.data[w.ticker] || {}).k8 || []).forEach(function (k) { ev.push({ t: w.ticker, k: k }); }); });
    ev.sort(function (a, b) { return b.k.d.localeCompare(a.k.d); });
    var major = ev.filter(function (x) { return (x.k.i || []).some(function (i) { return MAJOR.indexOf(i) >= 0; }); });
    var minor = ev.length - major.length;
    html += '<section class="card" aria-label="Major company events"><h2 class="px-h2">Major news only</h2><p class="form-note">Straight from the companies’ official SEC 8-K filings, last 4 months.</p>' +
      (major.length ? major.slice(0, 14).map(function (x) {
        var items = (x.k.i || []).filter(function (i) { return ITEMS[i] && i !== '9.01'; });
        return '<div class="px-news"><div class="px-news-h"><b class="mono">' + esc(x.t) + '</b>' + items.map(function (i) { return '<span class="px-chip ' + ITEMS[i][1] + '">' + esc(ITEMS[i][0]) + '</span>'; }).join('') + '<span class="tkr-name">' + fmtDate(x.k.d) + (x.k.a ? ' · amended' : '') + '</span></div><a href="' + esc(x.k.u) + '" target="_blank" rel="noopener nofollow">Read the filing</a></div>';
      }).join('') : '<p class="muted">' + (S.index.k8 ? 'No major company events filed in the last 4 months.' : 'Company events from SEC 8-K filings load with the next data update.') + '</p>') +
      (minor ? '<p class="form-note">Plus ' + plural(minor, 'routine filing') + ' (investor updates, shareholder votes, other news) not shown.</p>' : '') + '</section></div>';
    return html;
  }

  // ---------- Tab 5 · Market Weather ----------
  function gauge(d) {
    var L = Math.PI * 64, sc = d.score == null ? 0 : d.score, a = Math.PI * (1 - sc / 100);
    var col = d.tone === 'good' ? '#2DD4BF' : d.tone === 'bad' ? '#F87171' : '#F5B83D';
    return '<div class="px-dial">' + label(esc(d.q)) + '<svg width="160" height="92" viewBox="0 0 160 92" role="img" aria-label="' + esc(d.q + ': ' + d.label) + '"><path d="M16 82 A64 64 0 0 1 144 82" fill="none" stroke="var(--px-band)" stroke-width="14" stroke-linecap="round"></path>' +
      (d.score == null ? '' : '<path d="M16 82 A64 64 0 0 1 144 82" fill="none" stroke="' + col + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (L * sc / 100).toFixed(1) + ' ' + L.toFixed(1) + '"></path><line x1="80" y1="82" x2="' + (80 + 50 * Math.cos(a)).toFixed(1) + '" y2="' + (82 - 50 * Math.sin(a)).toFixed(1) + '" stroke="currentColor" stroke-width="3" stroke-linecap="round"></line>') +
      '<circle cx="80" cy="82" r="6" fill="currentColor"></circle></svg><div class="px-dial-l" style="color:' + col + '">' + esc(d.label) + '</div><div class="px-dial-s">' + esc(d.sub || '') + '</div></div>';
  }
  function tabWeather(M, pro) {
    if (S.weather == null) return '<section class="card"><p class="form-note"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading Market Weather…</p></section>';
    if (S.weather === false) return soon('Market Weather is updating', 'The economic data could not be loaded right now. Please try again in a minute.');
    var w = S.weather[S.region] || S.weather.us;
    var icon = w.icon === 'sun' ? '<circle cx="42" cy="32" r="18" fill="none" stroke="#F5B83D" stroke-width="3"></circle>' : w.icon === 'storm' ? '<path d="M24 50h40a12 12 0 0 0 0-24 16 16 0 0 0-30-4 11 11 0 0 0-10 28z" fill="var(--px-cell)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"></path><path d="M44 52l-6 10h8l-6 10" fill="none" stroke="#F5B83D" stroke-width="3"></path>' : '<circle cx="30" cy="24" r="14" fill="none" stroke="#F5B83D" stroke-width="3"></circle><path d="M24 54h40a12 12 0 0 0 0-24 16 16 0 0 0-30-4 11 11 0 0 0-10 28z" fill="var(--px-cell)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"></path>';
    var html = '<section class="card px-weather"><div class="px-h2row"><div class="px-wx-h"><svg width="84" height="74" viewBox="0 0 84 74" aria-hidden="true">' + icon + '</svg><div>' + label('Market weather · ' + esc(w.region)) + '<div class="px-wx-title">' + esc(w.headline) + '</div><p>' + esc(w.summary) + '</p></div></div>' +
      '<div class="px-seg" role="group" aria-label="Country">' + [['us', 'United States'], ['ca', 'Canada']].map(function (r) { return '<button type="button" data-region="' + r[0] + '" aria-pressed="' + (S.region === r[0] ? 'true' : 'false') + '"' + (S.region === r[0] ? ' class="on"' : '') + '>' + r[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="px-dials">' + w.dials.map(gauge).join('') + '</div></section>';
    if (!pro) return html + lock('The indicators behind each dial, with what they mean and where they sit in history, are part of QWERTx Pro.');
    html += w.groups.map(function (g) {
      return '<section class="px-wgroup" aria-label="' + esc(g.title) + '"><div class="px-h2row"><h2 class="px-h2">' + esc(g.title) + '</h2><span class="form-note">' + esc(g.q) + '</span></div><div class="px-wcards">' + g.cards.map(function (c) {
        var col = c.tone === 'good' ? '#2DD4BF' : c.tone === 'bad' ? '#F87171' : '#F5B83D';
        return '<article class="card px-wcard"><div class="px-wc-h"><span>' + esc(c.name) + '</span><span class="px-chip ' + (c.tone === 'good' ? 'up' : c.tone === 'bad' ? 'down' : 'gold') + '">' + esc(c.status) + '</span></div><div class="px-wc-v">' + esc(c.value) + '</div>' +
          '<div class="px-band" aria-label="' + esc(c.name + ' sits at ' + c.pos + '% of its range') + '"><div class="t"><span style="width:' + c.pos + '%;background:' + col + '"></span><i style="left:' + c.pos + '%"></i></div><div class="lh"><span>' + esc(c.lo) + '</span><span>' + esc(c.hi) + '</span></div></div>' +
          '<p>' + esc(c.meaning) + '</p><div class="px-src">' + esc(c.source) + (c.date ? ' · ' + esc(c.date) : '') + (c.since ? ' · history since ' + esc(c.since) : '') + '</div></article>';
      }).join('') + '</div></section>';
    }).join('');
    return html;
  }

  // ---------- Tab 6 · QWERTx Brief ----------
  function md(text) {
    return String(text || '').split(/\n\s*\n/).map(function (p) {
      p = p.trim();
      if (!p) return '';
      if (p.indexOf('## ') === 0) return '<h3>' + esc(p.slice(3)) + '</h3>';
      return '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function tabBrief(M, pro) {
    if (S.brief == null) return '<section class="card"><p class="form-note"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading the Brief…</p></section>';
    var B = S.brief || { latest: null, archive: [] }, b = B.latest;
    var mine = {}; (S.me.watchlist || []).forEach(function (w) { mine[w.ticker] = 1; });
    var html = '<div class="px-brief">';
    if (b) {
      html += '<article class="card px-brief-main">' + label('The QWERTx Brief · ' + esc(fmtDate(b.publishedAt || b.updatedAt)) + (b.status === 'draft' ? ' · DRAFT' : '')) + '<h2 class="px-brief-title">' + esc(b.title) + '</h2>' +
        (b.locked ? '<div class="px-brief-body"><p>' + esc(b.teaser) + '</p></div>' + lock('The full Brief arrives every weekend for Pro members.') : '<div class="px-brief-body">' + md(b.body) + '</div>') +
        (b.tickers.length ? '<div class="px-brief-t"><span class="form-note">Stocks in this Brief:</span>' + b.tickers.map(function (t) { return '<span class="px-chip ' + (mine[t] ? 'gold' : '') + '">' + esc(t) + (mine[t] ? ' · you own' : '') + '</span>'; }).join('') + '</div>' : '') +
        (b.status === 'published' ? '<div class="px-brief-fb"><span>Was this useful?</span><button type="button" class="px-vote' + (B.myVote === 1 ? ' on' : '') + '" data-vote="1" aria-pressed="' + (B.myVote === 1) + '" aria-label="Yes, useful"><i class="fa-regular fa-thumbs-up" aria-hidden="true"></i></button><button type="button" class="px-vote' + (B.myVote === -1 ? ' on' : '') + '" data-vote="-1" aria-pressed="' + (B.myVote === -1) + '" aria-label="Not useful"><i class="fa-regular fa-thumbs-down" aria-hidden="true"></i></button>' +
          '<form class="px-ask" id="px-ask"><label class="sr-only" for="px-q">Ask a question</label><input class="input input-sm" id="px-q" name="q" placeholder="Ask a question about this Brief" maxlength="1000"><button class="btn btn-sm" type="submit">Send</button><span class="form-note" role="status"></span></form></div>' : '') +
        (B.admin && b.up != null ? '<p class="form-note">Admin: ' + b.up + ' found it useful, ' + b.down + ' didn’t.</p>' : '') + '</article>';
    } else {
      html += '<article class="card px-brief-main">' + label('The QWERTx Brief') + '<h2 class="px-brief-title">The first Brief is on its way</h2><p class="muted">Every weekend, a short, plain-English note on what moved markets, what smart money did and what to watch next week. It also opens the Friday email.</p></article>';
    }
    html += '<aside class="px-brief-side">';
    if (B.archive && B.archive.length) html += '<section class="card"><h3 class="px-h3">Past Briefs</h3><ol class="px-arch">' + B.archive.map(function (a) { return '<li><button type="button" class="linklike" data-brief="' + a.id + '">' + esc(a.title) + '</button><span class="tkr-name">' + esc(fmtDate(a.publishedAt || a.updatedAt)) + (a.status === 'draft' ? ' · draft' : '') + '</span></li>'; }).join('') + '</ol></section>';
    html += '<section class="card"><h3 class="px-h3">Arrives in your inbox</h3><p class="form-note">Each Brief also opens the Friday email, right above the summary of your own stocks.</p></section>';
    if (B.admin) html += briefEditor(b);
    html += '</aside></div>';
    return html;
  }
  function briefEditor(b) {
    var e = S.briefEdit || { id: '', title: '', body: '', tickers: '' };
    return '<section class="card px-editor" aria-label="Write the Brief"><h3 class="px-h3">Write the Brief <span class="tag tag-gold">Admin</span></h3>' +
      '<form id="px-brief-form" class="form"><input type="hidden" name="id" value="' + esc(e.id) + '">' +
      '<div class="field"><label for="pb-title">Headline</label><input class="input" id="pb-title" name="title" maxlength="160" value="' + esc(e.title) + '" required></div>' +
      '<div class="field"><label for="pb-body">Text</label><textarea class="input" id="pb-body" name="body" rows="12" placeholder="Blank lines start a new paragraph. ## makes a subheading. **bold**.">' + esc(e.body) + '</textarea></div>' +
      '<div class="field"><label for="pb-t">Stocks mentioned</label><input class="input" id="pb-t" name="tickers" placeholder="GOOG, AMZN" value="' + esc(e.tickers) + '"></div>' +
      '<div class="btn-row"><button class="btn" type="submit" data-publish="0">Save draft</button><button class="btn btn-gold" type="submit" data-publish="1">Publish</button>' + (b ? '<button class="linklike" type="button" data-act="edit-brief">Edit the one shown</button>' : '') + (e.id ? '<button class="linklike" type="button" data-act="new-brief">Start a new one</button>' : '') + '</div><p class="form-note" role="status" id="pb-note">' + (e.id ? 'Editing Brief #' + esc(e.id) + '.' : 'Publishing makes it the latest Brief and puts it in the next Friday email.') + '</p></form></section>';
  }

  // ---------- Settings drawer: alerts + membership ----------
  function alertsHtml(me, pro) {
    var p = me.prefs || {};
    var dis = pro ? '' : ' disabled';
    var proTag = pro ? '' : ' <span class="tag tag-gold">Pro</span>';
    var snoozed = p.snoozeUntil && Date.parse(p.snoozeUntil) > Date.now();
    var hours = []; for (var i = 0; i < 24; i++) hours.push(i);
    var hourOpts = function (sel) { return hours.map(function (h) { return '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + (h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? '12 pm' : (h - 12) + ' pm') + '</option>'; }).join(''); };
    var mgrs = Object.keys(S.index.managers || {}).map(function (slug) { return '<label class="wl-check"><input type="checkbox" name="mgr" value="' + esc(slug) + '"' + ((p.managers || []).indexOf(slug) >= 0 ? ' checked' : '') + dis + '> ' + esc(mname(slug)) + '</label>'; }).join('');
    return '<section class="wl-section" id="alerts" aria-labelledby="alerts-h"><div class="section-head"><div><div class="eyebrow">Settings</div><h2 id="alerts-h">Alerts and emails</h2></div>' +
      '<p>' + (pro ? 'Instant alerts go out within about an hour of a filing appearing. You also get a Friday digest, even in quiet weeks.' : 'Free accounts get a Friday digest of everything that touched their stocks. Pro adds instant alerts and controls.') + '</p></div>' +
      '<form id="wl-prefs" class="card wl-prefs">' +
      '<fieldset><legend>Your name</legend><label class="sr-only" for="wl-name">Name</label><input class="input input-sm" id="wl-name" name="name" maxlength="80" value="' + esc(me.name || '') + '" placeholder="Optional" style="max-width:320px"></fieldset>' +
      '<fieldset><legend>Delivery' + proTag + '</legend>' +
      '<label class="wl-radio"><input type="radio" name="mode" value="instant"' + (p.mode !== 'daily' ? ' checked' : '') + dis + '> Instant: an email when a new filing lands</label>' +
      '<label class="wl-radio"><input type="radio" name="mode" value="daily"' + (p.mode === 'daily' ? ' checked' : '') + dis + '> One summary email each morning</label>' +
      '<label class="wl-check"><input type="checkbox" name="weekly"' + (p.weekly !== false ? ' checked' : '') + '> Friday digest of my stocks and the QWERTx Brief</label></fieldset>' +
      '<fieldset><legend>What to alert on' + proTag + '</legend>' +
      '<label class="wl-check"><input type="checkbox" name="t_f13"' + (p.types && p.types.f13 ? ' checked' : '') + dis + '> Fund manager moves (13F): new positions, sales and changes of at least ' +
      '<select class="input input-sm" name="minChange"' + dis + '>' + [1, 5, 10, 25, 50].map(function (n) { return '<option' + (n === p.minChange ? ' selected' : '') + ' value="' + n + '">' + n + '%</option>'; }).join('') + '</select> of shares</label>' +
      '<label class="wl-check"><input type="checkbox" name="t_cg"' + (p.types && p.types.cg ? ' checked' : '') + dis + '> Politician and President trades (when the disclosure is filed)</label>' +
      '<label class="wl-check"><input type="checkbox" name="t_ins"' + (p.types && p.types.ins ? ' checked' : '') + dis + '> Insider buying clusters: 3+ officers or directors buying on the open market within 30 days</label>' +
      '<details class="wl-mgrs"' + ((p.managers || []).length ? ' open' : '') + '><summary>Only these fund managers' + ((p.managers || []).length ? ' (' + p.managers.length + ' chosen)' : ' (all by default)') + '</summary><div class="wl-mgr-grid">' + mgrs + '</div></details></fieldset>' +
      '<fieldset><legend>Quiet time' + proTag + '</legend>' +
      '<label class="wl-check"><input type="checkbox" name="q_on"' + (p.quiet && p.quiet.on ? ' checked' : '') + dis + '> No instant emails between <select class="input input-sm" name="q_start"' + dis + '>' + hourOpts(p.quiet ? p.quiet.start : 22) + '</select> and <select class="input input-sm" name="q_end"' + dis + '>' + hourOpts(p.quiet ? p.quiet.end : 7) + '</select> <span class="form-note">(' + esc(tz(p)) + ')</span></label>' +
      '<div class="wl-snooze">' + (snoozed ? '<span>Alerts snoozed until <b>' + fmtDate(p.snoozeUntil) + '</b>.</span> <button type="button" class="btn btn-sm" data-snooze="0"' + dis + '>Resume now</button>'
        : '<span>Snooze instant alerts:</span> <button type="button" class="btn btn-sm" data-snooze="1"' + dis + '>1 day</button> <button type="button" class="btn btn-sm" data-snooze="7"' + dis + '>1 week</button>') + '</div></fieldset>' +
      '<fieldset><legend>Email</legend><label class="wl-check"><input type="checkbox" name="emailOff"' + (p.emailOff ? ' checked' : '') + '> Pause all alert and digest emails</label></fieldset>' +
      '<div class="wl-prefs-foot"><button class="btn btn-gold" type="submit">Save settings</button><span class="form-note wl-saved" role="status"></span></div>' +
      '</form></section>';
  }
  function tz(p) { try { return (p.quiet && p.quiet.tz) || Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'America/Toronto'; } }
  function seatsText(s) { return s && s.founding ? (s.founding.left > 0 ? s.founding.left + ' of ' + s.founding.seats + ' founding seats left' : 'All founding seats are taken') : ''; }
  function membershipHtml(me, pro) {
    var testCheckout = params.get('checkout') === 'test';
    var canBuy = me.checkoutOpen || testCheckout;
    var plan = { monthly: 'Monthly · US$15 / month', yearly: 'Yearly · US$144 / year', founding: 'Founding member · US$99 / year, locked while you stay subscribed' }[me.plan] || 'Pro';
    var inner;
    if (pro) {
      inner = '<div class="card-label"><span>Your plan</span>' + (me.testMode ? '<span>Test mode</span>' : '') + '</div><h3>' + esc(plan) + '</h3>' +
        '<p>' + (me.status === 'past_due' ? '<b>We couldn’t take your last payment.</b> Update your card to keep Pro. ' : '') + (me.periodEnd ? (me.cancelAtPeriodEnd ? 'Pro ends on ' : 'Renews on ') + '<b>' + fmtDate(me.periodEnd) + '</b>.' : '') + '</p>' +
        (me.hasBilling ? '<div class="btn-row"><button class="btn" type="button" data-act="portal">Manage billing, plan or cancel</button></div>' : '');
    } else {
      inner = '<div class="card-label"><span>Your plan</span></div><h3>Free · watch ' + me.limits.free + ' stocks or ETFs, Friday digest</h3>' +
        '<p>Pro watches up to 50, emails you the day a filing touches one of them, and unlocks the full Smart Money feed, Market Weather indicators, analyst targets and the weekly Brief.</p>' +
        (canBuy
          ? (testCheckout && !me.checkoutOpen ? '<p class="form-note"><b>Test checkout:</b> use card 4242 4242 4242 4242, any future date, any CVC. No real money moves.</p>' : '') +
            '<div class="wl-plans">' +
            planBtn('founding', 'Founding member', 'US$99', '/ year', '<span id="wl-seats">' + seatsText(S.status) + '</span> · price locked while you stay subscribed', true) +
            planBtn('yearly', 'Yearly', 'US$144', '/ year', 'Two months free vs. monthly') +
            planBtn('monthly', 'Monthly', 'US$15', '/ month', 'Cancel anytime') + '</div>'
          : '<div class="btn-row"><a class="btn btn-gold" href="/pro.html">See what Pro includes</a></div><p class="form-note">Pro opens soon. You’ll get an email with the founding-member offer (US$99/year for the first 500).</p>');
    }
    return '<section class="wl-section" id="membership" aria-labelledby="mem-h"><div class="section-head"><div><div class="eyebrow">Settings</div><h2 id="mem-h">Your plan</h2></div></div>' +
      '<div class="card wl-membership">' + inner + '</div>' +
      '<div class="card wl-danger"><div><h3>Delete my account</h3><p class="form-note">Removes your email, watchlist, alert history and settings right away.' + (pro ? ' Your Pro subscription is cancelled immediately, without a refund for the remaining time.' : '') + '</p></div><button class="btn btn-sm" type="button" data-act="delete">Delete account</button></div>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-sm" type="button" data-act="drawer">Close settings</button></div></section>';
  }
  function planBtn(key, lbl, price, per, note, featured) {
    return '<button type="button" class="wl-planbtn' + (featured ? ' featured' : '') + '" data-plan="' + key + '"><span class="card-label"><span>' + esc(lbl) + '</span>' + (featured ? '<span>Best value</span>' : '') + '</span><span class="p">' + price + ' <small>' + per + '</small></span><span class="form-note">' + note + '</span></button>';
  }

  // ---------- ticker search (add box) ----------
  /** Everything a member can add, with names: the stocks and ETFs QWERTx covers first, then (once loaded) every
      ticker the SEC lists. */
  function searchList() {
    if (S.search) return S.search;
    var mine = {}; (S.me.watchlist || []).forEach(function (w) { mine[w.ticker] = 1; });
    var seen = {}, out = [];
    Object.keys(S.index.tickers || {}).forEach(function (t) {
      var r = S.index.tickers[t], e = S.index.etfs && S.index.etfs[t];
      seen[t] = 1;
      out.push({ t: t, n: r[0] || '', l: (r[0] || '').toLowerCase(), etf: !!e, ca: /\.TO$/.test(t), own: r[1] || 0, cov: 1 });
    });
    (S.secList || []).forEach(function (x) { if (!seen[x[0]]) out.push({ t: x[0], n: x[1], l: String(x[1]).toLowerCase(), cov: 0, ca: /\.TO$/.test(x[0]), etf: /\bETF\b/i.test(x[1]) }); });
    S.search = out;
    return out;
  }
  function matches(q) {
    q = q.trim();
    if (!q) return [];
    var Q = q.toUpperCase().replace(/^\$/, '').replace(/^TSX:/, ''), lq = q.toLowerCase();
    var scored = [];
    searchList().forEach(function (x) {
      var base = x.t.replace(/\.TO$/, ''), sc = -1;
      if (x.t === Q || base === Q || x.t === Q.replace(/\.TO$/, '')) sc = 100;
      else if (x.t.indexOf(Q) === 0) sc = 80 - x.t.length;
      else if (lq.length >= 2 && (' ' + x.l).indexOf(' ' + lq) >= 0) sc = 50 - Math.min(20, x.l.indexOf(lq)) + ((' ' + x.l + ' ').indexOf(' ' + lq + ' ') >= 0 ? 12 : 0);
      else if (lq.length >= 3 && x.l.indexOf(lq) >= 0) sc = 20;
      if (sc < 0) return;
      scored.push([sc + (x.cov ? 6 : 0) + Math.min(4, x.own || 0), x]);
    });
    return scored.sort(function (a, b) { return b[0] - a[0] || a[1].t.localeCompare(b[1].t); }).slice(0, 8).map(function (s) { return s[1]; });
  }
  function autocomplete(input, list) {
    if (!input || !list) return;
    var items = [], active = -1;
    var mine = {}; (S.me.watchlist || []).forEach(function (w) { mine[w.ticker] = 1; });
    // What is being typed: the text after the last comma; if that phrase matches no name, just its last word.
    var token = function () {
      var v = input.value, i = Math.max(v.lastIndexOf(','), v.lastIndexOf(';'));
      var head = v.slice(0, i + 1), q = v.slice(i + 1);
      if (/\S\s+\S/.test(q.trim()) && !matches(q).length) { var j = q.replace(/\s+$/, '').lastIndexOf(' '); head += q.slice(0, j + 1); q = q.slice(j + 1); }
      return { head: head, q: q };
    };
    var close = function () { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    var paint = function () {
      list.innerHTML = items.map(function (x, i) {
        var tag = mine[x.t] ? '<span class="px-chip">On your list</span>' : x.ca ? '<span class="px-chip">' + (x.etf ? 'Canadian ETF' : 'Toronto') + '</span>' : x.etf ? '<span class="px-chip">ETF</span>' : x.own ? '<span class="px-chip gold">' + plural(x.own, 'fund manager') + '</span>' : '';
        return '<li role="option" id="px-ac-' + i + '" data-i="' + i + '" aria-selected="' + (i === active) + '"' + (i === active ? ' class="on"' : '') + '><b class="mono">' + esc(x.t) + '</b><span class="nm">' + esc(x.n) + '</span>' + tag + '</li>';
      }).join('');
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'px-ac-' + active); else input.removeAttribute('aria-activedescendant');
    };
    var pick = function (i) {
      var x = items[i]; if (!x) return;
      var h = token().head;
      input.value = (h ? h.replace(/\s*$/, ' ') : '') + x.t + ', ';
      close(); input.focus();
    };
    var update = function () { var q = token().q; items = q.trim() ? matches(q) : []; active = items.length ? 0 : -1; paint(); };
    input.addEventListener('input', update);
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    list.addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.getAttribute('data-i')); } });
  }

  // ---------- events ----------
  function on(sel, ev, fn) { root.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, function (e) { fn(e, el); }); }); }
  function bind() {
    on('[data-tab]', 'click', function (e, b) { S.tab = b.getAttribute('data-tab'); store('qx-tab', S.tab); history.replaceState(null, '', '#' + S.tab); render(); window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); });
    on('[data-tab-go]', 'click', function (e, b) { e.preventDefault(); S.tab = b.getAttribute('data-tab-go'); store('qx-tab', S.tab); render(); });
    root.querySelectorAll('details[data-howto]').forEach(function (d) { d.addEventListener('toggle', function () { lset('qx-howto-' + d.getAttribute('data-howto'), d.open ? 'open' : 'closed'); }); });
    on('[data-open]', 'click', function (e) { e.preventDefault(); S.drawer = true; render(); var el = document.getElementById('membership'); if (el) el.scrollIntoView({ behavior: 'smooth' }); });
    on('[data-filter]', 'click', function (e, b) { S.filter = b.getAttribute('data-filter'); S.more = false; render(); });
    on('[data-region]', 'click', function (e, b) { S.region = b.getAttribute('data-region'); render(); });
    on('[data-dircat]', 'click', function (e, b) { S.dirCat = b.getAttribute('data-dircat'); S.dirOpen = null; render(); });
    on('[data-diropen]', 'click', function (e, b) { var k = b.getAttribute('data-diropen'); S.dirOpen = S.dirOpen === k ? null : k; render(); var el = root.querySelector('[data-diropen="' + k + '"]'); if (el) el.focus({ preventScroll: true }); });
    var dq = document.getElementById('px-dir-q');
    if (dq) dq.addEventListener('input', function () { S.dirQ = dq.value; clearTimeout(S.dirT); S.dirT = setTimeout(function () { var pos = dq.selectionStart; render(); var n = document.getElementById('px-dir-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 200); });
    on('[data-ccy]', 'click', function (e, b) {
      var c = b.getAttribute('data-ccy');
      S.me.prefs = Object.assign({}, S.me.prefs, { currency: c });
      render();
      api('POST', '/api/prefs', { currency: c });
    });
    on('[data-sel]', 'click', function (e, b) { S.sel = b.getAttribute('data-sel'); render(); });
    on('[data-etf]', 'click', function (e, b) { e.preventDefault(); S.etf = b.getAttribute('data-etf'); render(); var el = document.getElementById('etf-card'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    var add = document.getElementById('wl-add-form');
    if (add) {
      add.addEventListener('submit', function (e) { e.preventDefault(); var v = add.tickers.value; if (!v.trim()) return; add.querySelector('button[type="submit"]').disabled = true; addTickers(v.split(/[\s,;]+/)); });
      autocomplete(add.tickers, document.getElementById('px-ac-list'));
    }
    var csv = document.getElementById('wl-csv');
    if (csv) csv.addEventListener('change', function () {
      var f = csv.files && csv.files[0];
      if (!f) return;
      if (f.size > 2e6) { S.results = [{ status: 'error', input: 'That file is too large. Export just your holdings, or use the template.' }]; return render(); }
      f.text().then(function (text) {
        var t = tickersFromCsv(text);
        if (!t.length) { S.results = [{ status: 'error', input: 'We couldn’t find a Symbol or Ticker column in that file. Try the CSV template.' }]; return render(); }
        addTickers(t);
      });
    });
    on('[data-edit]', 'click', function (e, b) { var f = root.querySelector('form[data-pos="' + b.getAttribute('data-edit') + '"]'); var wantPaid = /average price/i.test(b.textContent); f.hidden = wantPaid ? false : !f.hidden; S.openPos = f.hidden ? null : b.getAttribute('data-edit'); if (!f.hidden) { if (wantPaid) { f.unit.value = 'shares'; f.querySelector('.px-pf-paid').hidden = false; } (wantPaid ? f.paid : f.n).focus(); } });
    on('form[data-pos]', 'submit', function (e, f) {
      e.preventDefault();
      var num = function (v) { var n = Number(String(v).replace(/[$,\s]/g, '')); return n > 0 ? n : null; };
      var note = f.querySelector('.px-pf-note'), shares = f.unit.value === 'shares';
      if (!num(f.n.value)) { note.textContent = shares ? 'Enter how many shares you own.' : 'Enter the dollar amount you put in.'; f.n.focus(); return; }
      if (shares && !num(f.paid.value)) { note.textContent = 'Enter your average price per share. Your broker shows it as “average cost”.'; f.paid.setAttribute('aria-invalid', 'true'); f.paid.focus(); return; }
      var body = { ticker: f.getAttribute('data-pos') };
      body[f.unit.value] = f.n.value;
      if (shares) body.paid = f.paid.value;
      body.cur = f.cur.value;
      S.openPos = null;
      if (S.prefill) delete S.prefill[body.ticker];
      savePos(body);
    });
    on('form[data-pos] select[name="unit"]', 'change', function (e, sel) {
      var f = sel.form, shares = sel.value === 'shares';
      f.querySelector('.px-pf-paid').hidden = !shares;
      f.n.placeholder = shares ? '10' : '10,000';
      f.querySelector('.px-pf-note').textContent = shares ? 'Your broker shows it as “average cost” or “book cost per share”.' : 'The dollar amount you put in.';
    });
    on('[data-clear]', 'click', function (e, b) { savePos({ ticker: b.getAttribute('data-clear') }); });
    on('[data-add]', 'click', function (e, b) { addTickers([b.getAttribute('data-add')]); });
    on('[data-remove]', 'click', function (e, b) {
      api('DELETE', '/api/watchlist?ticker=' + encodeURIComponent(b.getAttribute('data-remove'))).then(function (j) { if (j.ok) { S.me = Object.assign(S.me, j); S.results = null; render(); } });
    });
    var prefs = document.getElementById('wl-prefs');
    if (prefs) {
      prefs.addEventListener('submit', function (e) { e.preventDefault(); savePrefs(prefs, {}); });
      prefs.querySelectorAll('[data-snooze]').forEach(function (b) { b.addEventListener('click', function () { var n = +b.getAttribute('data-snooze'); savePrefs(prefs, { snoozeUntil: n ? new Date(Date.now() + n * 864e5).toISOString() : null }, true); }); });
    }
    on('[data-plan]', 'click', function (e, b) {
      b.disabled = true;
      api('POST', '/api/checkout?format=json&plan=' + b.getAttribute('data-plan')).then(function (j) { if (j.url) location.href = j.url; else { b.disabled = false; alert(j.message || 'Checkout could not start.'); } });
    });
    on('[data-vote]', 'click', function (e, b) {
      var v = +b.getAttribute('data-vote');
      api('POST', '/api/brief-vote', { id: S.brief.latest.id, vote: v }).then(function (j) { if (j.ok) { S.brief.myVote = v; render(); } });
    });
    var ask = document.getElementById('px-ask');
    if (ask) ask.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = ask.q.value.trim(), note = ask.querySelector('[role="status"]');
      if (!q) return;
      api('POST', '/api/brief-vote', { id: S.brief.latest.id, question: q }).then(function (j) { note.textContent = j.ok ? 'Sent. Thanks!' : j.message; if (j.ok) ask.q.value = ''; });
    });
    on('[data-brief]', 'click', function (e, b) { api('GET', '/api/brief?id=' + b.getAttribute('data-brief')).then(function (j) { if (j.ok) { S.brief = j; render(); } }); });
    var bf = document.getElementById('px-brief-form');
    if (bf) {
      var publish = false;
      bf.querySelectorAll('[data-publish]').forEach(function (b) { b.addEventListener('click', function () { publish = b.getAttribute('data-publish') === '1'; }); });
      bf.addEventListener('submit', function (e) {
        e.preventDefault();
        var body = { id: bf.id.value || null, title: bf.title.value, body: bf.body.value, tickers: bf.tickers.value, publish: publish };
        var note = document.getElementById('pb-note');
        note.textContent = 'Saving…';
        api('POST', '/api/brief', body).then(function (j) {
          if (!j.ok) { note.textContent = j.message; return; }
          S.briefEdit = j.status === 'draft' ? { id: j.id, title: body.title, body: body.body, tickers: body.tickers } : null;
          api('GET', '/api/brief' + (j.status === 'draft' ? '?id=' + j.id : '')).then(function (b) { S.brief = b; render(); });
        });
      });
    }
    on('[data-act]', 'click', function (e, b) {
      var act = b.getAttribute('data-act');
      if (act === 'drawer') { S.drawer = !S.drawer; render(); if (S.drawer) { var d = document.getElementById('px-drawer'); if (d) d.scrollIntoView({ behavior: 'smooth' }); } }
      if (act === 'edit-brief' && S.brief && S.brief.latest) { var L = S.brief.latest; S.briefEdit = { id: L.id, title: L.title, body: L.body || '', tickers: (L.tickers || []).join(', ') }; render(); }
      if (act === 'more') { S.more = true; render(); }
      if (act === 'welcome-done') { lset('qx-welcome', '1'); render(); }
      if (act === 'new-brief') { S.briefEdit = null; render(); }
      if (act === 'logout') api('POST', '/api/auth/logout').then(function () { location.href = '/account.html'; });
      if (act === 'portal') { b.disabled = true; api('POST', '/api/billing-portal').then(function (j) { if (j.url) location.href = j.url; else { b.disabled = false; alert(j.message); } }); }
      if (act === 'delete') {
        var warn = 'Delete your QWERTx account and everything stored about you?' + (S.me.pro ? '\n\nYour Pro subscription will be cancelled immediately.' : '') + '\n\nThis cannot be undone.';
        if (!confirm(warn)) return;
        b.disabled = true;
        api('DELETE', '/api/account').then(function (j) { if (j.ok) location.href = '/?account=deleted'; else { b.disabled = false; alert(j.message); } });
      }
    });
  }

  function savePos(body) {
    api('PATCH', '/api/watchlist', body).then(function (j) {
      if (j.ok) { S.me = Object.assign(S.me, j); S.results = null; render(); return; }
      var f = root.querySelector('form[data-pos="' + body.ticker + '"]'), note = f && f.querySelector('.px-pf-note');
      if (note) { f.hidden = false; note.textContent = j.message; } else alert(j.message);
    });
  }
  function savePrefs(form, extra, quiet) {
    var g = function (n) { return form.elements[n]; };
    var body = { weekly: g('weekly').checked, emailOff: g('emailOff').checked, name: g('name').value };
    if (S.me.pro) {
      body.mode = (form.querySelector('input[name="mode"]:checked') || {}).value || 'instant';
      body.types = { f13: g('t_f13').checked, cg: g('t_cg').checked, ins: g('t_ins').checked };
      body.minChange = +g('minChange').value;
      body.managers = [].slice.call(form.querySelectorAll('input[name="mgr"]:checked')).map(function (x) { return x.value; });
      body.quiet = { on: g('q_on').checked, start: +g('q_start').value, end: +g('q_end').value, tz: tz(S.me.prefs) };
    }
    Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    var note = form.querySelector('.wl-saved');
    note.textContent = 'Saving…';
    api('POST', '/api/prefs', body).then(function (j) {
      if (!j.ok) { note.textContent = j.message; return; }
      S.me = Object.assign(S.me, j);
      if (quiet) render(); else note.textContent = 'Saved.';
    });
  }
  function tickersFromCsv(text) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var delim = [',', ';', '\t'].sort(function (a, b) { return lines[0].split(b).length - lines[0].split(a).length; })[0];
    var split = function (l) { var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var c = l[i]; if (c === '"') q = !q; else if (c === delim && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(function (x) { return x.trim(); }); };
    var rows = lines.map(split);
    var hi = -1, col = 0, qcol = -1, acol = -1, pcol = -1, ccol = -1;
    for (var r = 0; r < Math.min(rows.length, 15) && hi < 0; r++) {
      for (var c = 0; c < rows[r].length; c++) if (/^(symbol|ticker|ticker symbol|security symbol|stock symbol|code)$/i.test(rows[r][c])) { hi = r; col = c; break; }
    }
    if (hi >= 0) rows[hi].forEach(function (h, c) {
      if (qcol < 0 && /^(shares|quantity|qty|units|number of shares)$/i.test(h)) qcol = c;
      if (acol < 0 && /^(amount|market value|value|total value|position value)( \((us\$|usd|cad|c\$)\))?$/i.test(h)) acol = c;
      if (ccol < 0 && /^(currency|ccy|cur|price currency|book currency)$/i.test(h)) ccol = c;
      if (pcol < 0 && /^(price paid|paid|purchase price|avg(\.)? cost|average cost|average price|avg(\.)? price|cost per share|book cost per share|acb per share)( \((us\$|usd|cad|c\$)\))?$/i.test(h)) pcol = c;
    });
    var data = hi >= 0 ? rows.slice(hi + 1) : rows;
    var out = [], seen = {};
    data.forEach(function (row) {
      var v = (row[col] || '').trim().toUpperCase();
      if (!/^[A-Z$][A-Z0-9.\-:\/ ]{0,15}$/.test(v) || seen[v]) return;
      seen[v] = 1;
      var item = { ticker: v };
      if (qcol >= 0 && row[qcol]) item.shares = row[qcol];
      else if (acol >= 0 && row[acol]) item.amount = row[acol];
      if (pcol >= 0 && row[pcol] && (item.shares || item.amount)) item.paid = row[pcol];
      if (ccol >= 0 && /^(USD|CAD|US\$|C\$)$/i.test(row[ccol] || '')) item.cur = row[ccol].toUpperCase();
      out.push(item);
    });
    return out.slice(0, 100);
  }
})();
