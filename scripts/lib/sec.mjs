import { fetchRetry } from './net.mjs';

export const UA = process.env.SEC_USER_AGENT || 'QWERTx admin@qwertx.com';

/** SEC EDGAR request: identifies us per SEC policy and stays under 10 requests/second. */
export const sec = (url, type = 'text', opts = {}) =>
  fetchRetry(url, { headers: { 'User-Agent': UA }, ...opts }, { type, minGapMs: 150 });

export const pad = (cik) => String(cik).replace(/\D/g, '').padStart(10, '0');
export const dirUrl = (cik, acc) => `https://www.sec.gov/Archives/edgar/data/${Number(pad(cik))}/${acc.replace(/-/g, '')}`;
