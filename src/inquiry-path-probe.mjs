// Read-only public fetcher for the Inquiry Path Coherence Engine.
//
// Policy, enforced in code rather than in documentation:
//   - GET only, no cookies, no credentials, no form submission, no JS execution;
//   - robots.txt is read first and its Disallow rules for `*` are honoured;
//   - same-origin pages only, at most `maxPages`, chosen because their link
//     text or path names an inquiry step (contact, book, schedule, quote...);
//   - a fixed delay between requests and a hard byte ceiling per response;
//   - form-action hostnames are checked with a DNS lookup, never requested.
// The receipt counts every request so "read-only" is a number, not a promise.

import dns from 'node:dns/promises';
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
  const matching = rules.filter(rule => path.startsWith(rule.prefix.replace(/\*.*$/, '')));
  if (!matching.length) return false;
  const longest = matching.sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return !longest.allow;
}

async function readCapped(response) {
  if (!response.body?.getReader) return await response.text();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
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

export async function probeInquiryPath({ website, business = null, maxPages = 5, witnessImpl = null, delayMs = 1200, fetchImpl = globalThis.fetch, lookupImpl = dns.lookup, now = () => new Date(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const start = new URL(website);
  const ledger = { httpGetRequests: 0, robotsRequests: 0, dnsLookups: 0, formSubmissions: 0, messages: 0, spendCents: 0 };
  const refusals = [];
  const get = async (url, counter = 'httpGetRequests') => {
    ledger[counter] += 1;
    const response = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': PROBE_USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(20_000) });
    return { status: response.status, finalUrl: response.url || url, body: await readCapped(response) };
  };

  let robots = '';
  try {
    const response = await get(`${start.origin}/robots.txt`, 'robotsRequests');
    if (response.status >= 200 && response.status < 300) robots = response.body;
  } catch { /* unreachable robots.txt is treated as no rules */ }

  const pages = [];
  const queue = [start.href];
  const visited = new Set();
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    if (robotsDisallows(robots, new URL(url).pathname)) { refusals.push({ url, reason: 'ROBOTS_DISALLOW' }); continue; }
    if (pages.length) await sleep(delayMs);
    try {
      const fetched = await get(url);
      if (new URL(fetched.finalUrl).hostname.replace(/^www\./, '') !== start.hostname.replace(/^www\./, '')) { refusals.push({ url, reason: 'REDIRECTED_OFF_SITE', finalUrl: fetched.finalUrl }); continue; }
      const surface = extractInquirySurface({ url: fetched.finalUrl, html: fetched.body, fetchedAt: now().toISOString(), status: fetched.status });
      pages.push(surface);
      if (pages.length === 1) for (const link of inquiryLinks(fetched.body, fetched.finalUrl, maxPages)) if (!visited.has(link)) queue.push(link);
    } catch (error) {
      refusals.push({ url, reason: 'FETCH_FAILED', detail: String(error?.cause?.code ?? error?.name ?? 'error') });
    }
  }

  const hostResolution = {};
  for (const host of new Set(pages.flatMap(page => page.forms.map(form => form.actionHost)).filter(Boolean))) {
    ledger.dnsLookups += 1;
    try { await lookupImpl(host); hostResolution[host] = 'RESOLVED'; }
    catch (error) { hostResolution[host] = error?.code === 'ENOTFOUND' ? 'NXDOMAIN' : 'ERROR'; }
  }

  const observedAt = now().toISOString();
  let analysis = analyzeInquiryCoherence({ pages, hostResolution, business: business ?? { website: start.href } });
  // Second witness only where the first one raised a call-button mismatch.
  let runtime = null;
  const contested = [...new Set(analysis.findings.filter(item => item.code === 'TEL_LABEL_DIALS_DIFFERENT_NUMBER').flatMap(item => item.evidence.map(entry => entry.url)))];
  if (witnessImpl && contested.length) {
    runtime = await witnessImpl({ urls: contested });
    analysis = analyzeInquiryCoherence({ pages, hostResolution, runtimeWitness: runtime.witness, business: business ?? { website: start.href } });
  }
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
    businessEffectAuthority: 'NONE'
  };
}
