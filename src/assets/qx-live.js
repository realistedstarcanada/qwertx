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
