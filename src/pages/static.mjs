// Content pages kept from the original QWERTx design (about, pro, contact, legal, insights).
import fs from 'node:fs';
import path from 'node:path';

const PAGES = {
  'about.html': 'about', 'contact.html': 'contact', 'disclaimer.html': 'legal', 'privacy.html': 'legal', 'terms.html': 'legal',
  'pro.html': 'pro', 'insights.html': 'insights',
  'insights/how-to-read-a-superinvestor-portfolio.html': 'insights',
  'insights/vix-explained-fear-and-greed.html': 'insights',
  'insights/what-is-a-13f-filing.html': 'insights',
};

export function staticPages(root) {
  return Object.entries(PAGES).map(([file, page]) => {
    const raw = fs.readFileSync(path.join(root, 'src/static', file), 'utf8');
    const meta = (k) => ((new RegExp(`<!--${k}:([\\s\\S]*?)-->`).exec(raw) || [])[1] || '').trim();
    const jsonLd = [...raw.matchAll(/<!--jsonld:([\s\S]*?)-->/g)].map((m) => JSON.parse(m[1]));
    const body = raw.replace(/<!--(title|description|jsonld):[\s\S]*?-->\n?/g, '');
    const title = meta('title').replace(/\s*\|\s*QWERTx$/, '');
    return { page, path: `/${file}`, title, description: meta('description'), body, jsonLd, charts: /QX_CHARTS/.test(body) };
  });
}
