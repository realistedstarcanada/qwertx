/* QWERTx Pro — "Your stocks, watched for you" (/account.html).
   Signs people in with an emailed link, keeps their watchlist, shows who owns what they own
   (from /pro/t/<TICKER>.json, built from official filings) and holds their alert settings. */
(function () {
  'use strict';
  var root = document.getElementById('wl-root');
  if (!root) return;

  var params = new URLSearchParams(location.search);
  var S = { me: null, index: null, data: {}, results: null, status: null, notice: null };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  function fmtShort(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
  function money(v) { v = +v || 0; return v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; if (!r.ok && !j.message) j.message = 'Something went wrong. Please try again.'; return j; }); })
      .catch(function () { return { _status: 0, message: 'You seem to be offline. Please try again.' }; });
  }
  function getJSON(url) { return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function mname(slug) { var m = S.index && S.index.managers[slug]; return m ? m.n : slug; }
  function stockHref(t, d) { return d && d.s ? '/stocks/' + d.s + '.html' : null; }
  function cleanUrl(keep) {
    var u = new URL(location.href);
    ['signin', 'welcome', 'already', 'add'].forEach(function (k) { if (!keep || keep.indexOf(k) < 0) u.searchParams.delete(k); });
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }

  // ---------- boot ----------
  var token = params.get('signin');
  if (params.get('add')) store('qx-pending-add', params.get('add'));
  if (token) { cleanUrl(['welcome']); renderFinish(token); }
  else load();

  function load() {
    Promise.all([api('GET', '/api/me'), getJSON('/pro/index.json')]).then(function (r) {
      S.me = r[0];
      S.index = r[1] || { managers: {}, managerOrder: [], tickers: {} };
      if (params.get('welcome') === 'pro') S.notice = { tone: 'gold', html: '<b>Welcome to QWERTx Pro.</b> Add the stocks you own below. Alerts start as soon as a new filing touches one of them.' };
      if (params.get('already') === 'pro') S.notice = { tone: 'gold', html: 'You already have QWERTx Pro, so there was nothing to buy. Manage your plan under Membership.' };
      cleanUrl();
      if (!S.me.signedIn) return renderSignedOut();
      var pending = store('qx-pending-add');
      if (pending) { store('qx-pending-add', null); return addTickers(pending.split(/[\s,;]+/)); }
      loadStocks().then(render);
    });
  }

  function loadStocks() {
    var list = (S.me.watchlist || []).map(function (w) { return w.ticker; }).filter(function (t) { if (t in S.data) return false; if (S.index && S.index.tickers && !S.index.tickers[t]) { S.data[t] = null; return false; } return true; });
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
      '<p>Enter your email and we’ll send you a one-time sign-in link. A free account watches ' + esc((S.me && S.me.limits && S.me.limits.free) || 3) + ' stocks with a weekly digest' + (pendingAdd ? ', starting with <b>' + esc(pendingAdd.toUpperCase()) + '</b>' : '') + '.</p>' +
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
      '<li><b>Add the stocks you own.</b> Type tickers or upload a CSV. Canadian listings like RY.TO work when the company also trades in New York.</li>' +
      '<li><b>See the smart money instantly.</b> Which of the ' + Object.keys((S.index && S.index.managers) || {}).length + ' tracked fund managers own them, who just bought or sold, and what politicians and insiders disclosed.</li>' +
      '<li><b>Get told when it changes.</b> An email the day a new filing touches your stocks, with the filing date and a link to the source.</li>' +
      '</ol>' +
      '<p class="form-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> We store ticker symbols only: no share counts, no account numbers, no brokerage login. Delete everything with one click.</p>' +
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

  // ---------- signed in ----------
  function addTickers(list) {
    list = list.map(function (x) { return String(x).trim(); }).filter(Boolean);
    if (!list.length) return Promise.resolve();
    return api('POST', '/api/watchlist', { tickers: list }).then(function (j) {
      if (!j.ok) { S.results = [{ status: 'error', input: j.message }]; return render(); }
      S.me = Object.assign(S.me, j);
      S.results = j.results;
      return loadStocks().then(render);
    });
  }

  function render() {
    var me = S.me;
    var pro = !!me.pro;
    var wl = me.watchlist || [];
    var planLabel = pro ? (me.founding ? 'Pro · Founding member' : 'Pro') : 'Free';
    var html = '';
    html += '<div class="wl-bar"><div><span class="wl-plan' + (pro ? ' pro' : '') + '">' + esc(planLabel) + '</span> <span class="wl-email">' + esc(me.email) + '</span></div>' +
      '<nav class="wl-links" aria-label="Account"><a href="#alerts">Alert settings</a><a href="#membership">Membership</a><button type="button" class="linklike" data-act="logout">Sign out</button></nav></div>';
    if (S.notice) html += '<div class="wl-notice ' + S.notice.tone + '">' + S.notice.html + '</div>';

    // Add stocks
    var used = wl.length, limit = me.limit;
    html += '<div class="card wl-add"><div class="wl-add-head"><h2>Add your stocks</h2><span class="form-note">' + used + ' of ' + limit + ' used' + (pro ? '' : ' · <a href="#membership">Pro watches 50</a>') + '</span></div>' +
      '<form id="wl-add-form" class="wl-add-form"><label class="sr-only" for="wl-input">Tickers</label><input class="input" id="wl-input" name="tickers" placeholder="AAPL, MSFT, RY.TO" autocomplete="off" autocapitalize="characters" spellcheck="false"' + (used >= limit ? ' disabled' : '') + '>' +
      '<button class="btn btn-gold" type="submit"' + (used >= limit ? ' disabled' : '') + '>Add</button></form>' +
      '<p class="form-note">Separate tickers with commas or spaces. Or <label class="linklike" for="wl-csv">upload a CSV</label><input id="wl-csv" type="file" accept=".csv,text/csv" hidden> from your broker (we read the Symbol or Ticker column) · <a href="/assets/qwertx-watchlist-template.csv" download>CSV template</a></p>' +
      resultsHtml() + '</div>';

    if (!wl.length) {
      html += '<div class="card wl-empty"><i class="fa-solid fa-binoculars" aria-hidden="true"></i><h3>Start with 5 stocks you own</h3><p>You’ll see right away which tracked fund managers hold them and who just bought or sold.</p>' +
        '<div class="btn-row">' + ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'BRK.B'].map(function (t) { return '<button class="btn btn-sm" type="button" data-add="' + t + '">+ ' + t + '</button>'; }).join('') + '</div></div>';
    } else {
      html += summaryHtml(wl, pro);
      html += '<div class="wl-cards">' + wl.map(function (w) { return cardHtml(w, pro); }).join('') + '</div>';
    }
    html += alertsHtml(me, pro);
    html += membershipHtml(me, pro);
    root.innerHTML = html;
    bind();
    if (me.pro !== undefined && !S.status) getJSON('/api/pro-status').then(function (s) { if (s) { S.status = s; var el = document.getElementById('wl-seats'); if (el) el.textContent = seatsText(s); } });
  }

  function resultsHtml() {
    if (!S.results || !S.results.length) return '';
    var msg = {
      added: function (r) { return '<b>' + esc(r.ticker) + '</b> added'; },
      mapped: function (r) { return '<b>' + esc(r.input) + '</b> added as its New York listing <b>' + esc(r.ticker) + '</b>'; },
      duplicate: function (r) { return '<b>' + esc(r.ticker) + '</b> is already on your list'; },
      limit: function (r) { return '<b>' + esc(r.ticker) + '</b> not added: your plan watches ' + S.me.limit + ' stocks' + (S.me.pro ? '' : ' (<a href="#membership">Pro watches 50</a>)'); },
      unknown: function (r) { return '<b>' + esc(r.input) + '</b> isn’t a US-listed ticker we recognise. Check the spelling?'; },
      invalid: function (r) { return '<b>' + esc(r.input) + '</b> doesn’t look like a ticker'; },
      not_covered: function (r) { return '<b>' + esc(r.input) + '</b> only trades in Canada. Fund manager 13F filings cover US-listed shares only, so there’s nothing to track yet'; },
      error: function (r) { return esc(r.input); },
    };
    return '<ul class="wl-results" role="status">' + S.results.map(function (r) {
      var ok = r.status === 'added' || r.status === 'mapped';
      return '<li class="' + (ok ? 'ok' : 'warn') + '"><i class="fa-solid ' + (ok ? 'fa-check' : 'fa-circle-info') + '" aria-hidden="true"></i><span>' + (msg[r.status] || msg.error)(r) + '</span></li>';
    }).join('') + '</ul>';
  }

  function summaryHtml(wl, pro) {
    var owned = 0, managers = {}, bought = 0, trimmed = 0, exited = 0, cg = 0;
    wl.forEach(function (w) {
      var d = S.data[w.ticker];
      if (!d) return;
      if (d.h && d.h.length) owned++;
      (d.h || []).forEach(function (h) { managers[h[0]] = 1; if (h[2] === 'New' || h[2] === 'Add') bought++; if (h[2] === 'Trim') trimmed++; });
      exited += (d.x || []).length;
      cg += (d.cg || []).length;
    });
    var nm = Object.keys(managers).length;
    var lead = nm ? '<b>' + plural(nm, 'smart-money investor') + ' own' + (nm === 1 ? 's' : '') + ' your stocks.</b>' : '<b>None of the tracked fund managers own your stocks right now.</b>';
    return '<p class="wl-lead">' + lead + ' Last quarter they bought ' + plural(bought, 'time') + ', trimmed ' + plural(trimmed, 'time') + ' and sold out ' + plural(exited, 'time') + '.</p>' +
      '<div class="kpis">' +
      kpi('Stocks watched', wl.length, 'of ' + S.me.limit + ' on your plan') +
      kpi('Owned by smart money', owned + ' / ' + wl.length, 'held by a tracked fund manager') +
      kpi('Investors involved', nm, 'of ' + (S.index.managerOrder || []).length + ' tracked managers') +
      kpi('Politician trades', cg, 'disclosed in the last 6 months') +
      '</div>';
  }
  function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>'; }

  var ACT = { New: ['act-new', 'New'], Add: ['act-add', 'Added'], Trim: ['act-trim', 'Trimmed'], Hold: ['act-hold', 'Held'] };

  function story(t, d) {
    // "You own AAPL. David Tepper opened a new position, Duan Yongping trimmed 6%, and 4 others held steady."
    var parts = [], held = 0;
    (d.h || []).forEach(function (h) {
      if (h[2] === 'New') parts.push(mname(h[0]) + ' opened a new position');
      else if (h[2] === 'Add') parts.push(mname(h[0]) + ' added ' + Math.abs(h[3] || 0) + '%');
      else if (h[2] === 'Trim') parts.push(mname(h[0]) + ' trimmed ' + Math.abs(h[3] || 0) + '%');
      else held++;
    });
    (d.x || []).forEach(function (m) { parts.push(mname(m) + ' sold out'); });
    if (!parts.length && !held) return '';
    var s = parts.slice(0, 4);
    if (parts.length > 4) s.push(plural(parts.length - 4, 'other move'));
    if (held) s.push(plural(held, 'other manager') + ' held steady');
    if (!parts.length) return 'You own ' + t + '. ' + plural(held, 'tracked manager') + ' held ' + (held === 1 ? 'its' : 'their') + ' position' + (held === 1 ? '' : 's') + ' steady last quarter.';
    var last = s.pop();
    return 'You own ' + t + '. ' + (s.length ? s.join(', ') + ' and ' + last : last) + ' last quarter.';
  }

  function agreeBar(d) {
    var h = d.h || [], add = 0, hold = 0, trim = 0, out = (d.x || []).length;
    h.forEach(function (x) { if (x[2] === 'New' || x[2] === 'Add') add++; else if (x[2] === 'Trim') trim++; else hold++; });
    var total = add + hold + trim + out;
    if (!total) return '';
    var seg = function (n, cls) { return n ? '<span class="' + cls + '" style="flex:' + n + '"></span>' : ''; };
    return '<div class="wl-agree"><div class="wl-agree-bar" aria-hidden="true">' + seg(add, 'a') + seg(hold, 'h') + seg(trim, 't') + seg(out, 'x') + '</div>' +
      '<div class="wl-agree-key"><span><i class="a"></i>' + add + ' bought</span><span><i class="h"></i>' + hold + ' held</span><span><i class="t"></i>' + trim + ' trimmed</span><span><i class="x"></i>' + out + ' sold out</span></div></div>';
  }

  function cardHtml(w, pro) {
    var t = w.ticker, d = S.data[t];
    var idx = S.index.tickers[t];
    var name = (d && d.n) || (idx && idx[0]) || '';
    var href = stockHref(t, d);
    var head = '<header class="wl-card-head"><div>' + (href ? '<a class="tkr" href="' + href + '">' + esc(t) + '</a>' : '<span class="tkr">' + esc(t) + '</span>') +
      (name && name !== t ? ' <span class="tkr-name">' + esc(name) + '</span>' : '') +
      (w.input ? ' <span class="tag" title="Matched from the Toronto listing">from ' + esc(w.input) + '</span>' : '') +
      (w.active ? '' : ' <span class="tag tag-gold" title="Over your plan’s limit">Paused</span>') +
      '</div><button class="icon-btn wl-remove" type="button" data-remove="' + esc(t) + '" aria-label="Remove ' + esc(t) + '"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>';
    if (!d) {
      return '<article class="card wl-card">' + head + '<p class="wl-story muted">No tracked fund manager, politician or insider has disclosed a trade in ' + esc(t) + ' recently. We’ll email you if that changes.</p></article>';
    }
    var body = '';
    var st = story(t, d);
    if (st) body += '<p class="wl-story">' + esc(st) + '</p>';
    body += agreeBar(d);
    var h = (d.h || []).slice().sort(function (a, b) { return b[1] - a[1]; });
    if (h.length) {
      var show = pro ? h : h.slice(0, 2);
      body += '<table class="wl-holders"><thead><tr><th>Fund manager</th><th class="num">Portfolio</th><th>Last quarter</th></tr></thead><tbody>' +
        show.map(function (x) {
          var a = ACT[x[2]] || ACT.Hold;
          var chg = x[2] === 'Add' || x[2] === 'Trim' ? ' ' + (x[3] > 0 ? '+' : '') + x[3] + '%' : '';
          return '<tr><td><a href="/investors/' + esc(x[0]) + '.html">' + esc(mname(x[0])) + '</a></td><td class="num">' + x[1].toFixed(x[1] < 1 ? 2 : 1) + '%</td><td><span class="act ' + a[0] + '">' + a[1] + chg + '</span></td></tr>';
        }).join('') +
        (pro ? '' : h.length > 2 ? '<tr class="wl-locked"><td colspan="3"><i class="fa-solid fa-lock" aria-hidden="true"></i> ' + plural(h.length - 2, 'more manager') + ' with <a href="#membership">Pro</a></td></tr>' : '') +
        (pro && d.x && d.x.length ? d.x.map(function (m) { return '<tr><td><a href="/investors/' + esc(m) + '.html">' + esc(mname(m)) + '</a></td><td class="num">0%</td><td><span class="act act-sold">Sold out</span></td></tr>'; }).join('') : '') +
        '</tbody></table>';
    }
    var meta = [];
    if (d.ih && d.ih.length) {
      var ih = d.ih.slice().sort(function (a, b) { return b[4] - a[4]; });
      meta.push('<div class="wl-meta-block"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> ' + (pro
        ? 'Also held by ' + ih.map(function (x) { var a = ACT[x[2]] || ACT.Hold; return '<a href="/investors/' + esc(x[0]) + '.html">' + esc(mname(x[0])) + '</a> (' + x[1].toFixed(x[1] < 1 ? 2 : 1) + '%' + (x[2] !== 'Hold' ? ', ' + a[1].toLowerCase() + (x[3] ? ' ' + (x[3] > 0 ? '+' : '') + x[3] + '%' : '') : '') + ')'; }).join(', ') + '.'
        : 'Also held by ' + plural(ih.length, 'pension fund or large asset manager', 'pension funds and large asset managers') + '. <a href="#membership">See which with Pro</a>') + '</div>');
    }
    if (d.cg && d.cg.length) {
      var buys = d.cg.filter(function (x) { return x.a === 'buy'; }).length;
      if (pro) {
        meta.push('<div class="wl-meta-block"><div class="card-label"><span>Politicians · last 6 months</span></div><ul class="wl-trades">' + d.cg.slice(0, 4).map(function (x) {
          return '<li><span class="act ' + (x.a === 'buy' ? 'act-add">Buy' : 'act-trim">Sell') + '</span> ' + esc(x.ch === 'President' ? 'President Trump' : x.who) + (x.p && x.ch !== 'President' ? ' (' + esc(x.p) + ')' : '') + (x.amt ? ' · ' + esc(x.amt) : '') + '<small>Traded ' + fmtShort(x.d) + ', disclosed ' + (x.u ? '<a href="' + esc(x.u) + '" target="_blank" rel="noopener nofollow">' + fmtDate(x.f) + '</a>' : fmtDate(x.f)) + '</small></li>';
        }).join('') + '</ul></div>');
      } else {
        meta.push('<div class="wl-meta-block"><i class="fa-solid fa-landmark" aria-hidden="true"></i> ' + plural(d.cg.length, 'politician trade') + ' disclosed in the last 6 months (' + buys + ' buy' + (buys === 1 ? '' : 's') + '). <a href="#membership">Details with Pro</a></div>');
      }
    }
    if (d.cl) meta.push('<div class="wl-meta-block"><i class="fa-solid fa-users" aria-hidden="true"></i> <b>Insider cluster:</b> ' + plural(d.cl.i, 'officer or director', 'officers and directors') + ' bought on the open market' + (d.cl.s ? ' between ' + fmtShort(d.cl.s) + ' and ' + fmtShort(d.cl.e) : '') + ', about ' + money(d.cl.v) + '.</div>');
    else if (d.ib) meta.push('<div class="wl-meta-block"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> Insiders: ' + plural(d.ib.i, 'insider') + ' bought shares on the open market in ' + esc(S.index.insiderQuarter || 'the latest quarter') + (pro ? ' (' + money(d.ib.v) + ')' : '') + '.</div>');
    if (d.is && pro) meta.push('<div class="wl-meta-block"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> ' + plural(d.is.i, 'insider') + ' sold (' + money(d.is.v) + ') in ' + esc(S.index.insiderQuarter || 'the latest quarter') + '. Many insider sales are planned in advance.</div>');
    if (d.e) meta.push('<div class="wl-meta-block"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Next earnings: <b>' + esc(d.e.l) + '</b>' + (d.e.est ? ' (expected)' : '') + (d.e.t === 'amc' ? ' · after the close' : d.e.t === 'bmo' ? ' · before the open' : '') + '</div>');
    if (meta.length) body += '<div class="wl-meta">' + meta.join('') + '</div>';
    var filed = (d.h || []).map(function (x) { return S.index.managers[x[0]]; }).filter(Boolean);
    if (filed.length) {
      var period = filed.map(function (m) { return m.period; }).sort().pop();
      var last = filed.map(function (m) { return m.filed; }).sort().pop();
      body += '<p class="form-note wl-lag"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Fund holdings as of ' + fmtDate(period) + ', from 13F filings made by ' + fmtDate(last) + '. Managers have 45 days after each quarter to file, so these show where they stood, not what they hold today.</p>';
    }
    return '<article class="card wl-card' + (w.active ? '' : ' paused') + '">' + head + body + '</article>';
  }

  // ---------- alerts ----------
  function alertsHtml(me, pro) {
    var p = me.prefs || {};
    var lock = pro ? '' : ' disabled';
    var proTag = pro ? '' : ' <span class="tag tag-gold">Pro</span>';
    var snoozed = p.snoozeUntil && Date.parse(p.snoozeUntil) > Date.now();
    var hours = []; for (var i = 0; i < 24; i++) hours.push(i);
    var hourOpts = function (sel) { return hours.map(function (h) { return '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + (h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? '12 pm' : (h - 12) + ' pm') + '</option>'; }).join(''); };
    var mgrs = Object.keys(S.index.managers || {}).map(function (slug) { return '<label class="wl-check"><input type="checkbox" name="mgr" value="' + esc(slug) + '"' + ((p.managers || []).indexOf(slug) >= 0 ? ' checked' : '') + lock + '> ' + esc(mname(slug)) + '</label>'; }).join('');
    return '<section class="wl-section" id="alerts" aria-labelledby="alerts-h"><div class="section-head"><div><div class="eyebrow">Alerts</div><h2 id="alerts-h">How we tell you</h2></div>' +
      '<p>' + (pro ? 'Instant alerts go out within about an hour of a filing appearing. You also get a Friday digest, even in quiet weeks.' : 'Free accounts get a Friday digest of everything that touched their stocks. Pro adds instant alerts and controls.') + '</p></div>' +
      '<form id="wl-prefs" class="card wl-prefs">' +
      '<fieldset><legend>Delivery' + proTag + '</legend>' +
      '<label class="wl-radio"><input type="radio" name="mode" value="instant"' + (p.mode !== 'daily' ? ' checked' : '') + lock + '> Instant: an email when a new filing lands</label>' +
      '<label class="wl-radio"><input type="radio" name="mode" value="daily"' + (p.mode === 'daily' ? ' checked' : '') + lock + '> One summary email each morning</label>' +
      '<label class="wl-check"><input type="checkbox" name="weekly"' + (p.weekly !== false ? ' checked' : '') + '> Friday digest of my stocks</label></fieldset>' +
      '<fieldset><legend>What to alert on' + proTag + '</legend>' +
      '<label class="wl-check"><input type="checkbox" name="t_f13"' + (p.types && p.types.f13 ? ' checked' : '') + lock + '> Fund manager moves (13F): new positions, sales and changes of at least ' +
      '<select class="input input-sm" name="minChange"' + lock + '>' + [1, 5, 10, 25, 50].map(function (n) { return '<option' + (n === p.minChange ? ' selected' : '') + ' value="' + n + '">' + n + '%</option>'; }).join('') + '</select> of shares</label>' +
      '<label class="wl-check"><input type="checkbox" name="t_cg"' + (p.types && p.types.cg ? ' checked' : '') + lock + '> Politician and President trades (when the disclosure is filed)</label>' +
      '<label class="wl-check"><input type="checkbox" name="t_ins"' + (p.types && p.types.ins ? ' checked' : '') + lock + '> Insider buying clusters: 3+ officers or directors buying on the open market within 30 days</label>' +
      '<details class="wl-mgrs"' + ((p.managers || []).length ? ' open' : '') + '><summary>Only these fund managers' + ((p.managers || []).length ? ' (' + p.managers.length + ' chosen)' : ' (all by default)') + '</summary><div class="wl-mgr-grid">' + mgrs + '</div></details></fieldset>' +
      '<fieldset><legend>Quiet time' + proTag + '</legend>' +
      '<label class="wl-check"><input type="checkbox" name="q_on"' + (p.quiet && p.quiet.on ? ' checked' : '') + lock + '> No instant emails between <select class="input input-sm" name="q_start"' + lock + '>' + hourOpts(p.quiet ? p.quiet.start : 22) + '</select> and <select class="input input-sm" name="q_end"' + lock + '>' + hourOpts(p.quiet ? p.quiet.end : 7) + '</select> <span class="form-note">(' + esc(tz(p)) + ')</span></label>' +
      '<div class="wl-snooze">' + (snoozed ? '<span>Alerts snoozed until <b>' + fmtDate(p.snoozeUntil) + '</b>.</span> <button type="button" class="btn btn-sm" data-snooze="0"' + lock + '>Resume now</button>'
        : '<span>Snooze instant alerts:</span> <button type="button" class="btn btn-sm" data-snooze="1"' + lock + '>1 day</button> <button type="button" class="btn btn-sm" data-snooze="7"' + lock + '>1 week</button>') + '</div></fieldset>' +
      '<fieldset><legend>Email</legend><label class="wl-check"><input type="checkbox" name="emailOff"' + (p.emailOff ? ' checked' : '') + '> Pause all alert and digest emails</label></fieldset>' +
      '<div class="wl-prefs-foot"><button class="btn btn-gold" type="submit">Save settings</button><span class="form-note wl-saved" role="status"></span></div>' +
      '</form></section>';
  }
  function tz(p) { try { return (p.quiet && p.quiet.tz) || Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'America/Toronto'; } }

  // ---------- membership ----------
  function seatsText(s) { return s && s.founding ? (s.founding.left > 0 ? s.founding.left + ' of ' + s.founding.seats + ' founding seats left' : 'All founding seats are taken') : ''; }
  function membershipHtml(me, pro) {
    var testCheckout = params.get('checkout') === 'test';
    var canBuy = me.checkoutOpen || testCheckout;
    var plan = { monthly: 'Monthly · US$15 / month', yearly: 'Yearly · US$144 / year', founding: 'Founding member · US$99 / year, locked while you stay subscribed' }[me.plan] || 'Pro';
    var inner;
    if (pro) {
      inner = '<div class="card-label"><span>Your plan</span>' + (me.testMode ? '<span>Test mode</span>' : '') + '</div><h3>' + esc(plan) + '</h3>' +
        '<p>' + (me.status === 'past_due' ? '<b>We couldn’t take your last payment.</b> Update your card to keep Pro. ' : '') + (me.periodEnd ? (me.cancelAtPeriodEnd ? 'Pro ends on ' : 'Renews on ') + '<b>' + fmtDate(me.periodEnd) + '</b>.' : '') + '</p>' +
        '<div class="btn-row"><button class="btn" type="button" data-act="portal">Manage billing, plan or cancel</button></div>';
    } else {
      inner = '<div class="card-label"><span>Your plan</span></div><h3>Free · watch ' + me.limits.free + ' stocks, Friday digest</h3>' +
        '<p>Pro watches up to 50 stocks, emails you the day a filing touches one of them, and shows every manager, politician and insider move in full.</p>' +
        (canBuy
          ? (testCheckout && !me.checkoutOpen ? '<p class="form-note"><b>Test checkout:</b> use card 4242 4242 4242 4242, any future date, any CVC. No real money moves.</p>' : '') +
            '<div class="wl-plans">' +
            planBtn('founding', 'Founding member', 'US$99', '/ year', '<span id="wl-seats">' + seatsText(S.status) + '</span> · price locked while you stay subscribed', true) +
            planBtn('yearly', 'Yearly', 'US$144', '/ year', 'Two months free vs. monthly') +
            planBtn('monthly', 'Monthly', 'US$15', '/ month', 'Cancel anytime') + '</div>'
          : '<div class="btn-row"><a class="btn btn-gold" href="/pro.html">See what Pro includes</a></div><p class="form-note">Pro opens soon. You’ll get an email with the founding-member offer (US$99/year for the first 500).</p>');
    }
    return '<section class="wl-section" id="membership" aria-labelledby="mem-h"><div class="section-head"><div><div class="eyebrow">Membership</div><h2 id="mem-h">Your plan</h2></div></div>' +
      '<div class="card wl-membership">' + inner + '</div>' +
      '<div class="card wl-danger"><div><h3>Delete my account</h3><p class="form-note">Removes your email, watchlist, alert history and settings right away.' + (pro ? ' Your Pro subscription is cancelled immediately, without a refund for the remaining time.' : '') + '</p></div><button class="btn btn-sm" type="button" data-act="delete">Delete account</button></div>' +
      '</section>';
  }
  function planBtn(key, label, price, per, note, featured) {
    return '<button type="button" class="wl-planbtn' + (featured ? ' featured' : '') + '" data-plan="' + key + '"><span class="card-label"><span>' + esc(label) + '</span>' + (featured ? '<span>Best value</span>' : '') + '</span><span class="p">' + price + ' <small>' + per + '</small></span><span class="form-note">' + note + '</span></button>';
  }

  // ---------- events ----------
  function bind() {
    var add = document.getElementById('wl-add-form');
    if (add) add.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = add.tickers.value; add.querySelector('button').disabled = true;
      addTickers(v.split(/[\s,;]+/));
    });
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
    root.querySelectorAll('[data-add]').forEach(function (b) { b.addEventListener('click', function () { addTickers([b.getAttribute('data-add')]); }); });
    root.querySelectorAll('[data-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-remove');
        api('DELETE', '/api/watchlist?ticker=' + encodeURIComponent(t)).then(function (j) { if (j.ok) { S.me = Object.assign(S.me, j); S.results = null; render(); } });
      });
    });
    var prefs = document.getElementById('wl-prefs');
    if (prefs) {
      prefs.addEventListener('submit', function (e) { e.preventDefault(); savePrefs(prefs, {}); });
      prefs.querySelectorAll('[data-snooze]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = +b.getAttribute('data-snooze');
          savePrefs(prefs, { snoozeUntil: n ? new Date(Date.now() + n * 864e5).toISOString() : null }, true);
        });
      });
    }
    root.querySelectorAll('[data-plan]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        api('POST', '/api/checkout?format=json&plan=' + b.getAttribute('data-plan')).then(function (j) {
          if (j.url) location.href = j.url; else { b.disabled = false; alert(j.message || 'Checkout could not start.'); }
        });
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'logout') api('POST', '/api/auth/logout').then(function () { location.href = '/account.html'; });
        if (act === 'portal') { b.disabled = true; api('POST', '/api/billing-portal').then(function (j) { if (j.url) location.href = j.url; else { b.disabled = false; alert(j.message); } }); }
        if (act === 'delete') {
          var warn = 'Delete your QWERTx account and everything stored about you?' + (S.me.pro ? '\n\nYour Pro subscription will be cancelled immediately.' : '') + '\n\nThis cannot be undone.';
          if (!confirm(warn)) return;
          b.disabled = true;
          api('DELETE', '/api/account').then(function (j) { if (j.ok) location.href = '/?account=deleted'; else { b.disabled = false; alert(j.message); } });
        }
      });
    });
  }

  function savePrefs(form, extra, quiet) {
    var g = function (n) { return form.elements[n]; };
    var body = {
      weekly: g('weekly').checked,
      emailOff: g('emailOff').checked,
    };
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
      if (quiet) { render(); location.hash = 'alerts'; } else { note.textContent = 'Saved.'; }
    });
  }

  function tickersFromCsv(text) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var delim = [',', ';', '\t'].sort(function (a, b) { return lines[0].split(b).length - lines[0].split(a).length; })[0];
    var split = function (l) { var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var c = l[i]; if (c === '"') q = !q; else if (c === delim && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(function (x) { return x.trim(); }); };
    var rows = lines.map(split);
    var hi = -1, col = 0;
    for (var r = 0; r < Math.min(rows.length, 15) && hi < 0; r++) {
      for (var c = 0; c < rows[r].length; c++) if (/^(symbol|ticker|ticker symbol|security symbol|stock symbol|code)$/i.test(rows[r][c])) { hi = r; col = c; break; }
    }
    var data = hi >= 0 ? rows.slice(hi + 1) : rows;
    var out = [];
    data.forEach(function (row) { var v = (row[col] || '').trim(); if (/^[A-Za-z$][A-Za-z0-9.\-:\/ ]{0,15}$/.test(v) && out.indexOf(v.toUpperCase()) < 0) out.push(v.toUpperCase()); });
    return out.slice(0, 100);
  }
})();
