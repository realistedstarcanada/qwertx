#!/usr/bin/env node
// Daily job: pulls market headlines from the RSS feeds in config/news-feeds.json and a
// Fear & Greed snapshot, then writes data/news.json and data/market.json.
// Only headline, link, source and time are kept (no article text).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchRetry, readJSON, writeJSON } from './lib/net.mjs';
import { decodeXml } from './lib/thirteenf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const tag = (block, name) => {
  const r = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(block);
  return r ? decodeXml(r[1]).replace(/<[^>]+>/g, '').trim() : '';
};

export function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    let link = tag(b, 'link');
    if (!link) link = (/<link\b[^>]*href="([^"]+)"/i.exec(b) || [])[1] || '';
    const when = tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated');
    const t = Date.parse(when);
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, link, source, published: Number.isFinite(t) ? new Date(t).toISOString() : null });
  }
  return items;
}

async function news() {
  const cfg = readJSON(path.join(ROOT, 'config/news-feeds.json'));
  const all = [];
  for (const f of cfg.feeds) {
    try {
      const xml = await fetchRetry(f.url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml, application/xml, text/xml' } }, { tries: 2 });
      const items = parseFeed(xml, f.source);
      console.log(`• ${f.source}: ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.warn(`• ${f.source}: skipped (${e.message})`);
    }
  }
  const cutoff = Date.now() - (cfg.maxAgeHours || 72) * 3600e3;
  const seen = new Set();
  const items = all
    .filter((i) => !i.published || Date.parse(i.published) >= cutoff)
    .sort((a, b) => (b.published || '').localeCompare(a.published || ''))
    .filter((i) => {
      const k = i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(k) || seen.has(i.link)) return false;
      seen.add(k);
      seen.add(i.link);
      return true;
    })
    .slice(0, cfg.maxItems || 40);

  if (!items.length) {
    console.warn('No headlines fetched; keeping the previous news file.');
    return false;
  }
  writeJSON(path.join(DATA, 'news.json'), { updatedAt: new Date().toISOString(), items });
  return true;
}

async function market() {
  try {
    const d = await fetchRetry(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', Referer: 'https://www.cnn.com/' } },
      { type: 'json', tries: 2 },
    );
    const fg = d.fear_and_greed;
    if (!fg || typeof fg.score !== 'number') throw new Error('unexpected response');
    writeJSON(path.join(DATA, 'market.json'), {
      score: Math.round(fg.score),
      rating: fg.rating,
      previousClose: fg.previous_close != null ? Math.round(fg.previous_close) : null,
      previousWeek: fg.previous_1_week != null ? Math.round(fg.previous_1_week) : null,
      previousMonth: fg.previous_1_month != null ? Math.round(fg.previous_1_month) : null,
      previousYear: fg.previous_1_year != null ? Math.round(fg.previous_1_year) : null,
      asOf: fg.timestamp || new Date().toISOString(),
      source: 'CNN Fear & Greed Index',
    });
    console.log(`• Fear & Greed: ${Math.round(fg.score)} (${fg.rating})`);
  } catch (e) {
    console.warn(`• Fear & Greed: skipped (${e.message})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await news();
  await market();
}
