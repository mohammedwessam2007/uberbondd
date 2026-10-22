// Read-only public fetcher for the Inquiry Path Coherence Engine.
//
// Policy, enforced in code rather than in documentation:
//   - GET only, no cookies, no credentials, no form submission, no JS execution;
//   - every URL, including each redirect hop, must resolve to a public address;
//   - robots.txt is read first and its Disallow rules for `*` are honoured; a
//     5xx, 429 or unreachable robots.txt means complete disallow (RFC 9309);
//   - same-origin pages only, at most `maxPages`, chosen because their link
//     text or path names an inquiry step (contact, book, schedule, quote...);
//   - a fixed delay between requests and a hard byte ceiling per response;
//   - form-action hostnames are checked with a DNS lookup, never requested.
// The receipt counts every request so "read-only" is a number, not a promise.

import dns from 'node:dns/promises';
import { assertPublicUrl } from './security.mjs';
import { boundedSignal, abortable, unobservableProbe } from './inquiry-probe-budget.mjs';
import { fetchPublicPinned } from './inquiry-public-http.mjs';
import { extractInquirySurface, analyzeInquiryCoherence, compileCoherenceSnapshot } from './inquiry-path-coherence.mjs';

export const INQUIRY_PATH_PROBE_VERSION = 'uberbond.inquiry-path-probe-1.0.0';
export const PROBE_USER_AGENT = 'Mozilla/5.0 (compatible; UberBondInquiryPathProbe/1.0; read-only; no form submission)';
const INQUIRY_LINK_RX = /contact|book|schedul|appointment|quote|estimate|request|call|emergency|service-area|locations?\b|get-started|free-/i;
const MAX_BYTES = 2_000_000;

export function robotsDisallows(robotsText, path) {
  const rules = [];
  let applies = false;
  let sawRule = false;
  for (const rawLine of String(robotsText ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const field = match[1].toLowerCase();
    if (field === 'user-agent') {
      if (sawRule) { applies = false; sawRule = false; }
      if (match[2].trim() === '*' || /uberbond/i.test(match[2])) applies = true;
    } else if (field === 'disallow' || field === 'allow') {
      sawRule = true;
      if (applies && match[2].trim()) rules.push({ allow: field === 'allow', prefix: match[2].trim() });
    }
  }
  // RFC 9309: `*` matches any sequence, a trailing `$` anchors the end; the
  // longest matching rule wins and Allow wins a tie.
  const matches = prefix => new RegExp(`^${prefix.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\?\$$/, '$')}`).test(path);
  const matching = rules.filter(rule => matches(rule.prefix));
  if (!matching.length) return false;
  const longest = matching.sort((a, b) => b.prefix.length - a.prefix.length || Number(b.allow) - Number(a.allow))[0];
  return !longest.allow;
}

async function readCapped(response, signal) {
  if (!response.body?.getReader) { const text = await abortable(response.text(), signal); if (Buffer.byteLength(text) > MAX_BYTES) throw new ProbeRefusal('RESPONSE_BODY_TOO_LARGE'); return text; }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { void reader.cancel().catch(() => {}); throw new ProbeRefusal('RESPONSE_BODY_TOO_LARGE'); }
      chunks.push(Buffer.from(value));
    }
  } finally { try { reader.releaseLock(); } catch {} }
  return Buffer.concat(chunks).toString('utf8');
}

export function inquiryLinks(html, baseUrl, limit) {
  const origin = new URL(baseUrl).origin;
  const seen = new Set();
  const ranked = [];
  for (const match of String(html ?? '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    let url;
    try { url = new URL(match[1], baseUrl); } catch { continue; }
    if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
    url.hash = ''; url.search = '';
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?)$/i.test(url.pathname) || seen.has(url.href)) continue;
    const label = `${url.pathname} ${match[2].replace(/<[^>]+>/g, ' ')}`;
    if (!INQUIRY_LINK_RX.test(label)) continue;
    seen.add(url.href);
    ranked.push({ href: url.href, score: /contact|book|schedul|appointment/i.test(label) ? 2 : 1 });
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.href);
}

const MAX_REDIRECTS = 5;
const sameSite = (a, b) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
class ProbeRefusal extends Error { constructor(reason, detail) { super(reason); this.reason = reason; this.detail = detail; } }

export async function probeInquiryPath({ website, business = null, maxPages = 5, witnessImpl = null, delayMs = 1200, fetchImpl = fetchPublicPinned, lookupImpl = dns.lookup, urlGuard = assertPublicUrl, now = () => new Date(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), signal = null, maxSiteMs = 90_000, maxRssBytes = 750_000_000 } = {}) {
  const startTime = Date.now();
  const siteSignal = boundedSignal(signal, maxSiteMs);
  const start = new URL(website);
  let peakRssBytes = process.memoryUsage().rss;
  const checkBudget = () => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    if (siteSignal.aborted) throw new ProbeRefusal('SITE_TIME_BUDGET_EXHAUSTED');
    if (peakRssBytes > maxRssBytes) throw new ProbeRefusal('MEMORY_CEILING_EXCEEDED');
  };
  const failClosed = reason => ({ ...unobservableProbe(start.href, reason, Date.now() - startTime), runtimeMetrics: { wallClockMs: Date.now() - startTime, pagesFetched: pages.length, witnessUsed: false, peakRssBytes, outcome: reason }, readOnlyLedger: ledger });
  const ledger = { httpGetRequests: 0, robotsRequests: 0, dnsLookups: 0, formSubmissions: 0, messages: 0, spendCents: 0 };
  const refusals = [];
  let robots = '';
  // Redirects are followed by hand so every hop is checked for a public
  // address, the same site and robots before it is requested, and counted.
  const get = async (url, counter = 'httpGetRequests') => {
    let current = url;
    for (let hop = 0; ; hop += 1) {
      checkBudget();
      try { await abortable(urlGuard(current), siteSignal); } catch (error) { throw new ProbeRefusal('NON_PUBLIC_ADDRESS', String(error?.message ?? error)); }
      if (counter === 'httpGetRequests' && robotsDisallows(robots, new URL(current).pathname)) throw new ProbeRefusal('ROBOTS_DISALLOW', current);
      ledger[counter] += 1;
      const requestSignal = boundedSignal(siteSignal, 20_000);
      const response = await abortable(fetchImpl(current, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': PROBE_USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: requestSignal }), requestSignal);
      const location = response.status >= 300 && response.status < 400 ? response.headers?.get?.('location') : null;
      if (!location) return { status: response.status, finalUrl: current, body: await readCapped(response, requestSignal) };
      await response.body?.cancel?.();
      if (hop >= MAX_REDIRECTS) throw new ProbeRefusal('TOO_MANY_REDIRECTS', current);
      const next = new URL(location, current);
      if (!sameSite(next, start)) throw new ProbeRefusal('REDIRECTED_OFF_SITE', next.href);
      current = next.href;
    }
  };

  try {
    const response = await get(`${start.origin}/robots.txt`, 'robotsRequests');
    if (response.status >= 200 && response.status < 300) robots = response.body;
    else if (response.status === 429 || response.status >= 500) throw new ProbeRefusal('ROBOTS_UNAVAILABLE', String(response.status));
  } catch (error) {
    // Unreachable or failing robots.txt means complete disallow, not allow-all.
    refusals.push({ url: `${start.origin}/robots.txt`, reason: error instanceof ProbeRefusal ? error.reason : 'ROBOTS_UNAVAILABLE', detail: error?.detail ?? String(error?.cause?.code ?? error?.name ?? 'error') });
    robots = 'User-agent: *\nDisallow: /';
  }

  const pages = [];
  const queue = [start.href];
  const visited = new Set();
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    if (robotsDisallows(robots, new URL(url).pathname)) { refusals.push({ url, reason: 'ROBOTS_DISALLOW' }); continue; }
    if (pages.length) { try { await abortable(sleep(delayMs), siteSignal); } catch { return failClosed('SITE_TIME_BUDGET_EXHAUSTED'); } }
    try {
      checkBudget();
      const fetched = await get(url);
      // The site is asking us to slow down or is failing: stop, do not retry.
      if (fetched.status === 429 || fetched.status === 503) { refusals.push({ url, reason: 'SITE_RATE_LIMITED_OR_UNAVAILABLE', detail: String(fetched.status) }); break; }
      const surface = extractInquirySurface({ url: fetched.finalUrl, html: fetched.body, fetchedAt: now().toISOString(), status: fetched.status });
      pages.push(surface);
      if (pages.length === 1) for (const link of inquiryLinks(fetched.body, fetched.finalUrl, maxPages)) if (!visited.has(link)) queue.push(link);
    } catch (error) {
      if (error instanceof ProbeRefusal) refusals.push({ url, reason: error.reason, detail: error.detail });
      else refusals.push({ url, reason: 'FETCH_FAILED', detail: String(error?.cause?.code ?? error?.name ?? 'error') });
    }
  }

  if (siteSignal.aborted) return failClosed('SITE_TIME_BUDGET_EXHAUSTED');
  if (peakRssBytes > maxRssBytes) return failClosed('MEMORY_CEILING_EXCEEDED');
  const hostResolution = {};
  for (const host of new Set(pages.flatMap(page => page.forms.map(form => form.actionHost)).filter(Boolean))) {
    ledger.dnsLookups += 1;
    try { await abortable(lookupImpl(host), boundedSignal(siteSignal, 5000)); hostResolution[host] = 'RESOLVED'; }
    catch (error) { hostResolution[host] = error?.code === 'ENOTFOUND' ? 'NXDOMAIN' : 'ERROR'; }
  }

  const observedAt = now().toISOString();
  let analysis = analyzeInquiryCoherence({ pages, hostResolution, business: business ?? { website: start.href } });
  // Second witness only where the first one raised a call-button mismatch.
  let runtime = null;
  const contested = [...new Set(analysis.findings.filter(item => item.code === 'TEL_LABEL_DIALS_DIFFERENT_NUMBER').flatMap(item => item.evidence.map(entry => entry.url)))];
  if (witnessImpl && contested.length) {
    try { runtime = await abortable(witnessImpl({ urls: contested, signal: siteSignal }), siteSignal); } catch { return failClosed('BROWSER_WITNESS_UNOBSERVABLE'); }
    analysis = analyzeInquiryCoherence({ pages, hostResolution, runtimeWitness: runtime.witness, business: business ?? { website: start.href } });
  }
  if (siteSignal.aborted) return failClosed('SITE_TIME_BUDGET_EXHAUSTED');
  return {
    ok: true,
    probeVersion: INQUIRY_PATH_PROBE_VERSION,
    observedAt,
    website: start.href,
    pages: pages.map(({ url, status, fetchedAt, sourceSha256, byteLength, title }) => ({ url, status, fetchedAt, sourceSha256, byteLength, title })),
    refusals,
    hostResolution,
    analysis,
    snapshotMarkdown: compileCoherenceSnapshot({ analysis, observedAt }),
    readOnlyLedger: ledger,
    runtimeWitness: runtime ? { version: runtime.version, pages: Object.keys(runtime.witness), ledger: runtime.ledger } : null,
    businessEffectAuthority: 'NONE',
    runtimeMetrics: { wallClockMs: Date.now() - startTime, pagesFetched: pages.length, witnessUsed: Boolean(runtime), peakRssBytes: Math.max(peakRssBytes, process.memoryUsage().rss), outcome: 'COMPLETED' }
  };
}
