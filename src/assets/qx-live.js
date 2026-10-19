/* QWERTx live bits: Fear & Greed gauge refresh (via /api/market-mood) and relative times. */
(function () {
  'use strict';
  function zone(s) { return s < 25 ? 1 : s < 45 ? 2 : s < 55 ? 3 : s < 75 ? 4 : 5; }
  function setGauge(card, d) {
    var s = Number(d.score);
    if (!isFinite(s)) return;
    card.setAttribute('data-zone', zone(s));
    var n = card.querySelector('.v-needle');
    if (n) n.style.transform = 'rotate(' + (s / 100 * 180 - 90).toFixed(1) + 'deg)';
    function put(f, v) { var el = card.querySelector('[data-f="' + f + '"]'); if (el && v != null) el.textContent = v; }
    put('score', Math.round(s)); put('rating', d.rating); put('prev', d.previousClose); put('week', d.previousWeek);
    put('month', d.previousMonth); put('year', d.previousYear);
    var live = card.querySelector('[data-f="live"]');
    if (live && d.live) { live.textContent = 'Live · CNN Fear & Greed Index'; live.classList.add('is-live'); }
  }
  function init() {
    var cards = document.querySelectorAll('[data-fg]');
    cards.forEach(function (c) { c.setAttribute('data-zone', zone(Number(c.getAttribute('data-score')))); });
    if (cards.length) {
      fetch('/api/market-mood').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d) cards.forEach(function (c) { setGauge(c, d); });
      }).catch(function () {});
    }
    document.querySelectorAll('time[data-rel]').forEach(function (t) {
      var s = (Date.now() - Date.parse(t.getAttribute('datetime'))) / 1000;
      if (!isFinite(s) || s < 0) return;
      t.textContent = s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) === 1 ? 'yesterday' : Math.round(s / 86400) + ' days ago';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Stock search: loads a small index on first use, matches ticker or name. */
(function () {
  'use strict';
  function init() {
    document.querySelectorAll('form[data-search]').forEach(function (form) {
      var input = form.querySelector('input');
      var list = form.querySelector('.v-search-results');
      var index = null, loading = null, hits = [], sel = -1;
      function load() {
        if (index || loading) return loading;
        loading = fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (d) { index = d; return d; }).catch(function () { index = []; });
        return loading;
      }
      function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function hint(x) {
        var p = [];
        if (x.o) p.push(x.o + ' fund manager' + (x.o > 1 ? 's' : '') + ' own it');
        if (x.c) p.push(x.c + ' Congress trade' + (x.c > 1 ? 's' : ''));
        if (x.b) p.push('insiders buying');
        return p.join(' · ') || 'View details';
      }
      function render() {
        if (!input.value.trim()) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
        list.innerHTML = hits.length
          ? hits.map(function (x, i) { return '<li role="option" id="sr-' + i + '" aria-selected="' + (i === sel) + '"><a href="/stocks/' + x.s + '.html"><span class="t">' + esc(x.t) + '</span><span><span class="n">' + esc(x.n) + '</span><span class="h">' + esc(hint(x)) + '</span></span></a></li>'; }).join('')
          : '<li class="empty">No match yet. We cover stocks held by our fund managers or traded by politicians and insiders.</li>';
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }
      function search() {
        var q = input.value.trim().toLowerCase();
        sel = -1;
        if (!q || !index) { hits = []; render(); return; }
        var scored = [];
        index.forEach(function (x) {
          var t = x.t.toLowerCase(), n = x.n.toLowerCase(), score = 0;
          if (t === q) score = 100; else if (t.indexOf(q) === 0) score = 70; else if (n.indexOf(q) === 0) score = 60; else if (n.indexOf(' ' + q) > -1) score = 40; else if (q.length > 3 && n.indexOf(q) > -1) score = 20;
          if (score) scored.push([score + Math.min(15, (x.o || 0) * 2 + (x.c ? 2 : 0)), x]);
        });
        hits = scored.sort(function (a, b) { return b[0] - a[0]; }).slice(0, 7).map(function (a) { return a[1]; });
        render();
      }
      input.addEventListener('focus', load);
      input.addEventListener('input', function () { var p = load(); if (index) search(); else if (p) p.then(search); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!hits.length) return;
          sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
          render();
          input.setAttribute('aria-activedescendant', 'sr-' + sel);
        } else if (e.key === 'Escape') { list.hidden = true; }
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var x = hits[sel > -1 ? sel : 0];
        if (x) location.href = '/stocks/' + x.s + '.html';
      });
      document.addEventListener('click', function (e) { if (!form.contains(e.target)) list.hidden = true; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Mobile menu: start the list just below the header (the ticker tape and header heights vary by device). */
(function () {
  'use strict';
  function init() {
    var btn = document.querySelector('.menu-toggle');
    var nav = document.getElementById('mobile-nav');
    var header = document.querySelector('.site-header');
    if (!btn || !nav || !header) return;
    function place() { nav.style.paddingTop = Math.max(80, Math.round(header.getBoundingClientRect().bottom) + 8) + 'px'; }
    btn.addEventListener('click', place);
    window.addEventListener('resize', function () { if (nav.classList.contains('open')) place(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
