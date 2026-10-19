/* QWERTx charts — Apache ECharts. Each chart lives in its own Elementor HTML widget:
   a <div id="..."> plus a QX_CHARTS.push({...}) block with its data. Colors follow the
   site theme and re-render on theme switch. */
(function () {
  'use strict';
  var charts = [];
  var CAT_DARK = ['#c98500', '#3987e5', '#d95926', '#199e70', '#9085e9', '#d55181', '#008300', '#e66767'];
  var CAT_LIGHT = ['#b07400', '#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#e87ba4', '#008300', '#e34948'];

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function T() {
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    return {
      light: light, text: css('--text'), text2: css('--text-2'), muted: css('--muted'), line: css('--line'), line2: css('--line-2'),
      surface: css('--surface'), surface2: css('--surface-2'), gold: css('--gold'), teal: css('--teal'), coral: css('--coral'),
      cat: light ? CAT_LIGHT : CAT_DARK, other: light ? '#9aa1b0' : '#4a5468', hold: light ? '#8f97a8' : '#3c4660',
      mono: "'JetBrains Mono', monospace", body: "'Inter', sans-serif"
    };
  }
  function money(v) {
    var a = Math.abs(v);
    var s = a >= 1e12 ? (a / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(0) + 'M' : (a / 1e3).toFixed(0) + 'K';
    return (v < 0 ? '−$' : '$') + s;
  }
  function tip(t) {
    return { backgroundColor: t.surface2, borderColor: t.line2, borderWidth: 1, padding: [10, 14], textStyle: { color: t.text, fontFamily: t.body, fontSize: 13 }, extraCssText: 'border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);' };
  }
  function axisBase(t) {
    return { axisLine: { lineStyle: { color: t.line2 } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11 }, splitLine: { lineStyle: { color: t.line, type: [3, 4] } } };
  }
  var actColor = function (t, a) { return a === 'New' ? t.gold : a === 'Add' ? t.teal : a === 'Trim' ? t.coral : t.hold; };

  var builders = {
    treemap: function (t, d) {
      return {
        tooltip: Object.assign(tip(t), { formatter: function (p) { var x = p.data; return '<b style="font-family:' + t.mono + '">' + x.ticker + '</b> · ' + x.full + '<br>' + x.weight.toFixed(2) + '% of portfolio · ' + money(x.value) + '<br><span style="color:' + actColor(t, x.act) + '">' + x.actLabel + '</span>'; } }),
        series: [{
          type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%', top: 0, left: 0, right: 0, bottom: 0,
          itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 6 },
          label: { show: true, formatter: function (p) { return '{t|' + p.data.ticker + '}\n{w|' + p.data.weight.toFixed(1) + '%}'; }, rich: { t: { fontFamily: t.mono, fontWeight: 700, fontSize: 13, color: '#0B0F1A' }, w: { fontFamily: t.mono, fontSize: 11, color: 'rgba(11,15,26,.75)', padding: [3, 0, 0, 0] } }, overflow: 'truncate' },
          upperLabel: { show: false },
          data: d.items.map(function (x) {
            var c = actColor(t, x.act);
            return { name: x.ticker, value: x.value, ticker: x.ticker, full: x.name, weight: x.weight, act: x.act, actLabel: x.actLabel, itemStyle: { color: c, opacity: x.act === 'Hold' ? 1 : 0.95 }, label: x.act === 'Hold' ? { rich: { t: { color: '#F1F3F8' }, w: { color: 'rgba(241,243,248,.7)' } } } : undefined };
          })
        }]
      };
    },
    donut: function (t, d) {
      return {
        tooltip: Object.assign(tip(t), { formatter: function (p) { return p.name + '<br><b>' + p.value.toFixed(1) + '%</b> of portfolio'; } }),
        series: [{
          type: 'pie', radius: ['56%', '82%'], center: ['50%', '50%'], padAngle: 1.2, itemStyle: { borderRadius: 4, borderColor: t.surface, borderWidth: 2 },
          label: { show: false }, emphasis: { scale: true, scaleSize: 5 },
          data: d.items.map(function (x, i) { return { name: x[0], value: x[1], itemStyle: { color: x[0] === 'Other positions' || i >= 8 ? t.other : t.cat[i] } }; })
        }],
        graphic: [{ type: 'text', left: 'center', top: '42%', style: { text: d.center || '', fill: t.text, font: '600 22px "Space Grotesk"', textAlign: 'center' } },
                  { type: 'text', left: 'center', top: '54%', style: { text: d.centerSub || '', fill: t.muted, font: '11px "JetBrains Mono"', textAlign: 'center' } }]
      };
    },
    curve: function (t, d) {
      var n = d.curve.length, xs = d.curve.map(function (_, i) { return i + 1; });
      var eq = xs.map(function (i) { return +(i / d.totalPositions * 100).toFixed(2); });
      return {
        grid: { left: 44, right: 16, top: 20, bottom: 36 },
        tooltip: Object.assign(tip(t), { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.line2 } }, formatter: function (ps) { var i = ps[0].dataIndex; return 'Top <b>' + (i + 1) + '</b> positions = <b>' + d.curve[i].toFixed(1) + '%</b> of the portfolio<br><span style="color:' + t.muted + '">Equal-weight benchmark: ' + eq[i].toFixed(1) + '%</span>'; } }),
        xAxis: Object.assign(axisBase(t), { type: 'category', data: xs, boundaryGap: false, name: 'Number of positions', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: t.muted, fontFamily: t.mono, fontSize: 11 } }),
        yAxis: Object.assign(axisBase(t), { type: 'value', max: 100, axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11, formatter: '{value}%' } }),
        series: [
          { name: 'Portfolio', type: 'line', data: d.curve, smooth: 0.25, symbol: 'circle', symbolSize: 6, showSymbol: n <= 12, lineStyle: { width: 2, color: t.gold }, itemStyle: { color: t.gold }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.gold + '55' }, { offset: 1, color: t.gold + '00' }] } } },
          { name: 'Equal weight', type: 'line', data: eq, symbol: 'none', lineStyle: { width: 1.5, type: [5, 5], color: t.muted } }
        ]
      };
    },
    flows: function (t, d) {
      var rows = d.items.slice().reverse();
      return {
        grid: { left: 8, right: 70, top: 8, bottom: 24, containLabel: true },
        tooltip: Object.assign(tip(t), { trigger: 'item', formatter: function (p) { var x = rows[p.dataIndex]; return '<b style="font-family:' + t.mono + '">' + x.ticker + '</b> · ' + x.name + '<br>' + x.label + ': <b>' + money(x.flow) + '</b>'; } }),
        xAxis: Object.assign(axisBase(t), { type: 'value', axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11, formatter: function (v) { return money(v); } } }),
        yAxis: Object.assign(axisBase(t), { type: 'category', data: rows.map(function (x) { return x.ticker; }), axisLabel: { color: t.text2, fontFamily: t.mono, fontSize: 12 }, splitLine: { show: false } }),
        series: [{ type: 'bar', barWidth: '58%', data: rows.map(function (x) { return { value: x.flow, itemStyle: { color: x.flow >= 0 ? t.teal : t.coral, borderRadius: x.flow >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } }; }),
          label: { show: true, position: 'right', formatter: function (p) { return money(p.value); }, color: t.muted, fontFamily: t.mono, fontSize: 11 } }]
      };
    },
    value: function (t, d) {
      return {
        grid: { left: 58, right: 16, top: 20, bottom: 30 },
        tooltip: Object.assign(tip(t), { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.line2 } }, formatter: function (ps) { var i = ps[0].dataIndex; return d.labels[i] + '<br>Reported value <b>' + money(d.values[i]) + '</b><br><span style="color:' + t.muted + '">' + d.counts[i] + ' positions</span>'; } }),
        xAxis: Object.assign(axisBase(t), { type: 'category', data: d.labels, boundaryGap: false }),
        yAxis: Object.assign(axisBase(t), { type: 'value', scale: true, axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11, formatter: function (v) { return money(v); } } }),
        series: [{ type: 'line', data: d.values, smooth: 0.3, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, color: t.gold }, itemStyle: { color: t.gold, borderColor: t.surface, borderWidth: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.gold + '40' }, { offset: 1, color: t.gold + '00' }] } } }]
      };
    },
    stack: function (t, d) {
      var series = d.series.map(function (s, i) {
        var c = s.name === 'Everything else' ? t.other : t.cat[i];
        return { name: s.name, type: 'line', stack: 'w', data: s.data, smooth: 0.2, symbol: 'none', lineStyle: { width: 0 }, areaStyle: { color: c, opacity: 0.9 }, itemStyle: { color: c }, emphasis: { focus: 'series' } };
      });
      return {
        grid: { left: 44, right: 16, top: 16, bottom: 30 },
        tooltip: Object.assign(tip(t), { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.line2 } }, formatter: function (ps) { var s = '<b>' + ps[0].axisValue + '</b>'; ps.slice().reverse().forEach(function (p) { if (p.value == null) return; s += '<br><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + p.color + ';margin-right:6px"></span>' + p.seriesName + ' <b style="font-family:' + t.mono + '">' + (+p.value).toFixed(1) + '%</b>'; }); return s; } }),
        xAxis: Object.assign(axisBase(t), { type: 'category', data: d.labels, boundaryGap: false }),
        yAxis: Object.assign(axisBase(t), { type: 'value', max: 100, axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11, formatter: '{value}%' } }),
        series: series
      };
    },
    vix: function (t, d) {
      var bands = [[0, 12, '#14A08F'], [12, 15, '#2DD4BF'], [15, 20, '#8A93A8'], [20, 30, '#F08A5D'], [30, 60, '#E5484D']];
      return {
        grid: { left: 40, right: 14, top: 14, bottom: 30 },
        tooltip: Object.assign(tip(t), { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.line2 } }, formatter: function (ps) { var v = ps[0].value; var z = v < 12 ? 'Extreme greed' : v < 15 ? 'Greed' : v < 20 ? 'Neutral' : v < 30 ? 'Fear' : 'Extreme fear'; return ps[0].axisValue + '<br>VIX <b style="font-family:' + t.mono + '">' + v.toFixed(2) + '</b> · ' + z; } }),
        xAxis: Object.assign(axisBase(t), { type: 'category', data: d.dates, boundaryGap: false, axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11, interval: Math.floor(d.dates.length / 6) } }),
        yAxis: Object.assign(axisBase(t), { type: 'value', min: 10, max: 35 }),
        series: [{ type: 'line', data: d.values, symbol: 'none', lineStyle: { width: 2, color: t.text }, z: 3,
          markArea: { silent: true, data: bands.map(function (b) { return [{ yAxis: b[0], itemStyle: { color: b[2], opacity: t.light ? 0.10 : 0.09 } }, { yAxis: b[1] }]; }) },
          markLine: { silent: true, symbol: 'none', label: { color: t.muted, fontFamily: t.mono, fontSize: 10, formatter: '{b}' }, lineStyle: { color: t.line2, type: [3, 4] }, data: [{ yAxis: 20, name: 'Fear 20' }, { yAxis: 15, name: 'Calm 15' }] } }]
      };
    },
    bars: function (t, d) {
      var rows = d.items.slice().reverse();
      return {
        grid: { left: 8, right: 40, top: 8, bottom: 20, containLabel: true },
        tooltip: Object.assign(tip(t), { formatter: function (p) { var x = rows[p.dataIndex]; return '<b style="font-family:' + t.mono + '">' + x.ticker + '</b> · ' + x.name + '<br>' + d.unit.replace('{v}', x.value); } }),
        xAxis: Object.assign(axisBase(t), { type: 'value', minInterval: 1 }),
        yAxis: Object.assign(axisBase(t), { type: 'category', data: rows.map(function (x) { return x.ticker; }), axisLabel: { color: t.text2, fontFamily: t.mono, fontSize: 12 }, splitLine: { show: false } }),
        series: [{ type: 'bar', barWidth: '56%', data: rows.map(function (x) { return x.value; }), itemStyle: { color: t.gold, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: t.muted, fontFamily: t.mono, fontSize: 11 } }]
      };
    },
    heatmap: function (t, d) {
      var data = [];
      d.matrix.forEach(function (row, yi) { row.forEach(function (v, xi) { data.push([xi, yi, v === null ? '-' : v]); }); });
      return {
        grid: { left: 8, right: 12, top: 8, bottom: 70, containLabel: true },
        tooltip: Object.assign(tip(t), { formatter: function (p) { var v = p.value[2]; return d.investors[p.value[1]] + '<br><b style="font-family:' + t.mono + '">' + d.stocks[p.value[0]] + '</b>: ' + (v === '-' ? 'not held' : v.toFixed(1) + '% of portfolio'); } }),
        xAxis: { type: 'category', data: d.stocks, axisLabel: { color: t.text2, fontFamily: t.mono, fontSize: 11, rotate: 0 }, axisLine: { show: false }, axisTick: { show: false }, splitArea: { show: false }, position: 'top' },
        yAxis: { type: 'category', data: d.investors, inverse: true, axisLabel: { color: t.text2, fontSize: 12 }, axisLine: { show: false }, axisTick: { show: false } },
        visualMap: { min: 0, max: d.max, calculable: false, orient: 'horizontal', left: 'center', bottom: 6, itemWidth: 12, itemHeight: 160, text: [d.max + '%+', '0%'], textStyle: { color: t.muted, fontFamily: t.mono, fontSize: 11 }, inRange: { color: t.light ? ['#fbf1dc', '#e9b04a', '#9a5f0c'] : ['#2a2414', '#b9862a', '#ffd27a'] } },
        series: [{ type: 'heatmap', data: data, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } }, label: { show: false } }]
      };
    }
  };

  function render(spec) {
    var el = document.getElementById(spec.el);
    if (!el || !window.echarts) return;
    var inst = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: 'canvas' });
    var t = T();
    var opt = builders[spec.type](t, spec.data);
    opt.backgroundColor = 'transparent';
    opt.animationDuration = 900;
    opt.textStyle = { fontFamily: t.body };
    inst.setOption(opt, true);
    return inst;
  }
  function init() {
    (window.QX_CHARTS || []).forEach(function (s) { var i = render(s); if (i) charts.push(i); });
    window.addEventListener('resize', function () { charts.forEach(function (c) { c.resize(); }); });
    document.addEventListener('qx:theme', function () { (window.QX_CHARTS || []).forEach(render); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
