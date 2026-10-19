import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/** fetch with retries on network errors, 429 and 5xx. Throws on other HTTP errors. */
export async function fetchRetry(url, opts = {}, { tries = 4, type = 'text', minGapMs = 0 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (minGapMs) await gate(minGapMs);
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} ${url}`);
        await sleep(1500 * 2 ** i);
        continue;
      }
      if (!res.ok) {
        const e = new Error(`HTTP ${res.status} ${url}`);
        e.fatal = true;
        throw e;
      }
      return type === 'json' ? await res.json() : await res.text();
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw lastErr;
}

let lastCall = 0;
async function gate(gap) {
  const wait = lastCall + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}
