/* QWERTx site behaviour — small, dependency-free. Each block maps to an Elementor feature:
   mobile menu (Nav Menu widget), theme toggle, market-status greeting, entrance animations
   (Motion Effects), counters (Counter widget), forms (Form widget), sortable tables. */
(function () {
  'use strict';
  var root = document.documentElement;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---- Theme (dark default, remembered per visitor) ---- */
  var saved = store('qx-theme');
  if (saved === 'light') root.setAttribute('data-theme', 'light');
  function syncThemeIcon() {
    var light = root.getAttribute('data-theme') === 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      b.innerHTML = light ? '<i class="fa-solid fa-moon" aria-hidden="true"></i>' : '<i class="fa-solid fa-sun" aria-hidden="true"></i>';
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-theme-toggle]');
    if (!t) return;
    var light = root.getAttribute('data-theme') === 'light';
    if (light) { root.removeAttribute('data-theme'); store('qx-theme', 'dark'); }
    else { root.setAttribute('data-theme', 'light'); store('qx-theme', 'light'); }
    syncThemeIcon();
    document.dispatchEvent(new CustomEvent('qx:theme'));
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncThemeIcon();

    /* ---- Mobile menu ---- */
    var toggle = document.querySelector('.menu-toggle');
    var panel = document.getElementById('mobile-nav');
    function setMenu(open) {
      if (!panel) return;
      panel.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.innerHTML = open ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    }
    if (toggle) {
      toggle.addEventListener('click', function () { setMenu(!panel.classList.contains('open')); });
      panel.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
      window.addEventListener('resize', function () { if (window.innerWidth > 1080) setMenu(false); });
    }

    /* ---- Market status greeting (US market hours, New York time) ---- */
    var pill = document.querySelector('[data-market-status]');
    if (pill) {
      try {
        var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
        var p = {}; parts.forEach(function (x) { p[x.type] = x.value; });
        var mins = (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10);
        var weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
        var label = pill.querySelector('.status-text');
        if (!weekend && mins >= 570 && mins < 960) { pill.classList.add('open'); label.textContent = 'Markets open · catch up after work tonight'; }
        else if (!weekend && mins >= 240 && mins < 570) { label.textContent = 'Pre-market · your morning briefing is ready'; }
        else if (weekend) { label.textContent = 'Weekend · time to review your watchlist'; }
        else { label.textContent = 'Markets closed · your after-work briefing is ready'; }
      } catch (e) { /* keep default text */ }
    }

    /* ---- Entrance animations ---- */
    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    } else { reveals.forEach(function (el) { el.classList.add('in'); }); }

    /* ---- Counters ---- */
    var counters = document.querySelectorAll('[data-count]');
    function runCounter(el) {
      var end = parseFloat(el.getAttribute('data-count'));
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var start = performance.now(), dur = 1400;
      function tick(now) {
        var t = Math.min(1, (now - start) / dur); var e = 1 - Math.pow(1 - t, 3);
        el.textContent = (end * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    if ('IntersectionObserver' in window) {
      var co = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { runCounter(en.target); co.unobserve(en.target); } });
      });
      counters.forEach(function (c) { co.observe(c); });
    }

    /* ---- Forms: validate, send to /api/form, and show the success state only once it is saved ---- */
    document.querySelectorAll('form[data-form]').forEach(function (form) {
      form.setAttribute('novalidate', '');
      var loadedAt = Date.now();
      // A field people never see; bots that fill every input give themselves away.
      var hp = document.createElement('input');
      hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
      form.appendChild(hp);
      form.querySelectorAll('.input').forEach(function (inp) {
        inp.addEventListener('input', function () { inp.removeAttribute('aria-invalid'); var er = document.getElementById(inp.id + '-error'); if (er) er.classList.remove('show'); });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = true, first = null;
        form.querySelectorAll('[required]').forEach(function (inp) {
          var v = (inp.value || '').trim();
          var bad = !v || (inp.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));
          var er = document.getElementById(inp.id + '-error');
          if (bad) { ok = false; inp.setAttribute('aria-invalid', 'true'); if (er) er.classList.add('show'); if (!first) first = inp; }
        });
        if (!ok) { first.focus(); return; }
        var btn = form.querySelector('button[type="submit"]');
        var errBox = form.querySelector('.form-send-error');
        if (!errBox) { errBox = document.createElement('p'); errBox.className = 'form-send-error'; errBox.setAttribute('role', 'alert'); (form.querySelector('.form-fields') || form).appendChild(errBox); }
        errBox.textContent = '';
        var body = { kind: form.getAttribute('data-form'), page: location.pathname, t: loadedAt, website: hp.value };
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach(function (inp) { if (inp !== hp) body[inp.name] = inp.value; });
        if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
        fetch('/api/form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { status: r.status, j: j }; }); })
          .then(function (res) {
            if (!res.j.ok) throw res;
            var success = form.querySelector('.form-success');
            form.querySelectorAll('.form-fields').forEach(function (f) { f.style.display = 'none'; });
            if (success) { success.classList.add('show'); success.focus && success.focus(); }
          })
          .catch(function (res) {
            var mail = 'support@qwertx.com';
            if (res && res.j && res.j.error === 'email') errBox.textContent = 'That email address doesn’t look right. Please check it and try again.';
            else if (body.kind === 'contact') errBox.innerHTML = 'Sorry, we couldn’t send that just now. Please email us at <a href="mailto:' + mail + '?subject=' + encodeURIComponent((body.topic || 'Question') + ' from ' + (body.name || '')) + '&body=' + encodeURIComponent(body.message || '') + '">' + mail + '</a>.';
            else errBox.innerHTML = 'Sorry, we couldn’t save that just now. Please try again in a minute, or email <a href="mailto:' + mail + '?subject=Subscribe">' + mail + '</a>.';
          })
          .then(function () { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } });
      });
    });

    /* ---- Sortable tables ---- */
    document.querySelectorAll('table[data-sortable]').forEach(function (table) {
      var ths = table.querySelectorAll('th');
      ths.forEach(function (th, idx) {
        th.setAttribute('tabindex', '0');
        function sort() {
          var asc = th.getAttribute('aria-sort') !== 'ascending';
          ths.forEach(function (o) { o.removeAttribute('aria-sort'); });
          th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
          var body = table.tBodies[0];
          var rows = Array.prototype.slice.call(body.rows).filter(function (r) { return !r.hasAttribute('data-fixed'); });
          var fixed = Array.prototype.slice.call(body.rows).filter(function (r) { return r.hasAttribute('data-fixed'); });
          rows.sort(function (a, b) {
            var x = a.cells[idx].getAttribute('data-v') || a.cells[idx].textContent.trim();
            var y = b.cells[idx].getAttribute('data-v') || b.cells[idx].textContent.trim();
            var nx = parseFloat(x), ny = parseFloat(y);
            var r = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y);
            return asc ? r : -r;
          });
          rows.concat(fixed).forEach(function (r) { body.appendChild(r); });
        }
        th.addEventListener('click', sort);
        th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
      });
    });

    /* ---- TradingView widgets: hide the fallback once the live iframe arrives ---- */
    document.querySelectorAll('.widget-frame, .tape').forEach(function (frame) {
      function check() { if (frame.querySelector('iframe')) { frame.classList.add('loaded'); var fb = frame.querySelector('.tape-fallback'); if (fb) fb.style.display = 'none'; return true; } return false; }
      if (!check() && 'MutationObserver' in window) {
        var mo = new MutationObserver(function () { if (check()) mo.disconnect(); });
        mo.observe(frame, { childList: true, subtree: true });
      }
    });

    var y = document.querySelector('[data-year]');
    if (y) y.textContent = new Date().getFullYear();
  });
})();
