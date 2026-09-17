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
  const timeoutMs = 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      headers: {'user-agent': 'UberBondSignal/2.0 (+research; contact via configured sender)'},
      signal: controller.signal
    });
    // A missing robots file is an observable absence of directives. A denied,
    // failed or malformed fetch is different: permission is unknown, so public
    // crawling must stop rather than silently treating the site as open.
    if (res.status === 404) return {available: true, status: 404, allow: [], disallow: [], crawlDelay: 0};
    if (!res.ok) return {available: false, status: Number(res.status || 0), error: 'robots-unavailable', allow: [], disallow: [], crawlDelay: 0};
    return {available: true, status: Number(res.status || 200), ...parseRobots(await res.text())};
  } catch { return {available: false, status: 0, error: 'robots-fetch-failed', allow: [], disallow: [], crawlDelay: 0}; }
  finally { clearTimeout(timer); }
}
