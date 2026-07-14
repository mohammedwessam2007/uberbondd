import { absoluteUrl } from './utils.mjs';

export function parseRobots(text = '', agent = 'UberBondSignal') {
  const groups = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line || !line.includes(':')) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') { current = {agent: value.toLowerCase(), allow: [], disallow: [], crawlDelay: 0}; groups.push(current); }
    else if (current && key === 'allow') current.allow.push(value);
    else if (current && key === 'disallow') current.disallow.push(value);
    else if (current && key === 'crawl-delay') current.crawlDelay = Number(value) || 0;
  }
  const a = agent.toLowerCase();
  return groups.find(g => g.agent === a) || groups.find(g => g.agent === '*') || {allow: [], disallow: [], crawlDelay: 0};
}
export function isAllowed(url, rules) {
  const path = new URL(url).pathname || '/';
  const candidates = [
    ...(rules.allow || []).map(v => ({type: 'allow', v})),
    ...(rules.disallow || []).map(v => ({type: 'disallow', v}))
  ].filter(x => x.v && path.startsWith(x.v)).sort((a,b) => b.v.length - a.v.length);
  return !candidates.length || candidates[0].type === 'allow';
}
export async function getRobots(startUrl, fetcher = fetch) {
  const url = absoluteUrl('/robots.txt', startUrl);
  try {
    const res = await fetcher(url, {headers: {'user-agent': 'UberBondSignal/2.0 (+research; contact via configured sender)'}});
    if (!res.ok) return {allow: [], disallow: [], crawlDelay: 0};
    return parseRobots(await res.text());
  } catch { return {allow: [], disallow: [], crawlDelay: 0}; }
}
