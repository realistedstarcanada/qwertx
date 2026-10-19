// Squarified treemap (Bruls, Huizing & van Wijk). Input sorted by value desc.
export function squarify(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const nodes = items.map((i) => ({ item: i, a: i.value * scale }));
  const out = [];
  let rect = { x, y, w, h };
  let row = [];

  const worst = (r, side) => {
    const s = r.reduce((acc, n) => acc + n.a, 0);
    let max = -Infinity;
    let min = Infinity;
    for (const n of r) {
      if (n.a > max) max = n.a;
      if (n.a < min) min = n.a;
    }
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  const place = (r) => {
    const s = r.reduce((acc, n) => acc + n.a, 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h;
      let cy = rect.y;
      for (const n of r) {
        const ch = n.a / cw;
        out.push({ ...n.item, x: rect.x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w;
      let cx = rect.x;
      for (const n of r) {
        const cw = n.a / ch;
        out.push({ ...n.item, x: cx, y: rect.y, w: cw, h: ch });
        cx += cw;
      }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };

  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(rect.w, rect.h);
    const n = nodes[i];
    if (!row.length || worst([...row, n], side) <= worst(row, side)) {
      row.push(n);
      i++;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}
