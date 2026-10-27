// Lets Node import JSON the way Cloudflare's bundler does (import x from './a.json', no attributes).
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.json') && context.importAttributes?.type !== 'json') {
    const { readFile } = await import('node:fs/promises');
    return { format: 'module', source: 'export default ' + (await readFile(new URL(url), 'utf8')), shortCircuit: true };
  }
  return next(url, context);
}`),
);
