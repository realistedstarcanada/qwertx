// QWERTx client script: sortable tables, table filter, live market mood, relative times.
(() => {
  // Sortable tables: <th data-sort="num|text">, cells carry data-v for the raw value.
  document.querySelectorAll('table[data-sortable]').forEach((table) => {
    const ths = [...table.querySelectorAll('thead th')];
    ths.forEach((th, idx) => {
      if (!th.dataset.sort) return;
      th.tabIndex = 0;
      const go = () => {
        const asc = th.getAttribute('aria-sort') === 'descending';
        ths.forEach((t) => t.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        const tbody = table.tBodies[0];
        const num = th.dataset.sort === 'num';
        const val = (tr) => {
          const td = tr.children[idx];
          const v = td?.dataset.v ?? td?.textContent.trim() ?? '';
          return num ? parseFloat(v) || 0 : v.toLowerCase();
        };
        [...tbody.rows]
          .sort((a, b) => {
            const x = val(a);
            const y = val(b);
            return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1);
          })
          .forEach((tr) => tbody.appendChild(tr));
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
    });
  });

  // Text filter: <input data-filter="tableId">
  document.querySelectorAll('input[data-filter]').forEach((input) => {
    const table = document.getElementById(input.dataset.filter);
    if (!table) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      [...table.tBodies[0].rows].forEach((tr) => {
        tr.hidden = q && !tr.textContent.toLowerCase().includes(q);
      });
    });
  });

  // Relative times: <time data-rel datetime="...">
  const rel = (iso) => {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (!Number.isFinite(s)) return null;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  };
  document.querySelectorAll('time[data-rel]').forEach((t) => {
    const r = rel(t.getAttribute('datetime'));
    if (r) t.textContent = r;
  });

  // Live market mood (falls back to the snapshot already rendered in the page).
  const mood = document.querySelector('[data-mood]');
  if (mood) {
    const setNeedle = (score) => {
      const needle = mood.querySelector('.needle');
      if (needle) needle.style.transform = `rotate(${(score / 100) * 180 - 90}deg)`;
    };
    setNeedle(Number(mood.dataset.score || 50));
    fetch('/api/market-mood')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (typeof d.score !== 'number') return;
        setNeedle(d.score);
        const put = (sel, v) => {
          const el = mood.querySelector(sel);
          if (el && v != null) el.textContent = v;
        };
        put('[data-f=score]', Math.round(d.score));
        put('[data-f=rating]', d.rating);
        put('[data-f=prev]', d.previousClose);
        put('[data-f=week]', d.previousWeek);
        put('[data-f=month]', d.previousMonth);
        const foot = mood.querySelector('[data-f=asof]');
        if (foot) foot.textContent = 'Live · CNN Fear & Greed Index';
      })
      .catch(() => {});
  }
})();
