#!/usr/bin/env node
// Agency Revenue Leak scan: turns a list of web-design/marketing agency websites
// into reviewed, ready-to-send first-touch drafts for the Agency Revenue Leak
// Proof Pack (docs/OFFER_QUARTET_OCT_2026_10_OF_10.md, offer 1).
//
// For each agency it:
//   1. reads the agency's own site (robots.txt respected, public addresses only);
//   2. keeps a generic company inbox the agency publishes on its own site
//      (info@, hello@ ...), never a guessed or personal address;
//   3. finds client websites linked from its portfolio pages and keeps the
//      home-service ones (HVAC, plumbing, electrical, roofing ...);
//   4. probes each client site read-only and keeps only hard, path-breaking
//      defects (dead form host, invalid business schema, broken tel: link);
//   5. probes again to confirm each defect reproduces (second witness);
//   6. writes a draft only when 1-5 all hold. Otherwise DO_NOT_SEND with a reason.
//
// It sends nothing. Sending is a separate, founder-approved step
// (scripts/agency-leak-send.py).
//
//   node scripts/agency-leak-scan.mjs agencies.txt --out out --name "Mohamed"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeInquiryPath, robotsDisallows, PROBE_USER_AGENT } from '../src/inquiry-path-probe.mjs';
import { visibleText, decodeEntities } from '../src/inquiry-path-coherence.mjs';
import { classifyRecipientInbox } from '../src/recipient-address-classifier.mjs';
import { claimKeyOf } from '../src/inquiry-findings.mjs';
import { assertPublicUrl } from '../src/security.mjs';

export const SCAN_VERSION = 'uberbond.agency-leak-scan.v1';
// Only defects a stranger can state without knowing the business's call tracking.
export const PITCHABLE_CODES = Object.freeze(['FORM_SUBMITS_TO_NONEXISTENT_HOST', 'STRUCTURED_DATA_UNPARSEABLE', 'TEL_LINK_MALFORMED']);
const PORTFOLIO = /portfolio|our-work|\/work(?:\/|$)|clients|case-stud|projects|showcase|examples|results|success/i;
const CONTACT = /contact/i;
const HOME_SERVICE = /\b(hvac|heating|cooling|air condition\w*|furnace|plumb\w*|drain|sewer|water heater|electric(?:al|ian)s?|roof\w*|garage door|pest control|septic|insulation|gutter)\b/i;
const NOT_CLIENT = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|youtu|tiktok|pinterest|google|goo|gstatic|googleapis|apple|microsoft|bing|yelp|bbb|angi|homeadvisor|thumbtack|nextdoor|wordpress|wp|w3|schema|cloudflare|jsdelivr|unpkg|gravatar|vimeo|wistia|hubspot|hubspotusercontent|calendly|typeform|gohighlevel|leadconnectorhq|clutch|upcity|designrush|g2|capterra|trustpilot|github|medium|shopify|squarespace|wix|webflow|godaddy|mailchimp|zoom|vercel|netlify|amazonaws|adobe|cdn)\.[a-z.]+$/i;
const hostOf = u => new URL(u).hostname.toLowerCase().replace(/^www\./, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function extractLinks(html, baseUrl) {
  const out = []; const seen = new Set();
  for (const m of String(html).matchAll(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(decodeEntities(m[2]).trim(), baseUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = '';
    const key = url.href; if (seen.has(key)) continue; seen.add(key);
    out.push({ href: key, text: visibleText(m[3]).slice(0, 80) });
  }
  return out;
}
export const portfolioPages = (links, agencyHost, limit = 3) => links.filter(l => hostOf(l.href) === agencyHost && (PORTFOLIO.test(new URL(l.href).pathname) || PORTFOLIO.test(l.text))).slice(0, limit).map(l => l.href);
export const contactPages = (links, agencyHost, limit = 2) => links.filter(l => hostOf(l.href) === agencyHost && (CONTACT.test(new URL(l.href).pathname) || CONTACT.test(l.text))).slice(0, limit).map(l => l.href);
// Project pages one level below a portfolio page (e.g. /portfolio/acme-plumbing).
export const projectPages = (links, portfolioUrl, agencyHost, limit = 10) => {
  const base = new URL(portfolioUrl).pathname.replace(/\/+$/, '');
  return links.filter(l => hostOf(l.href) === agencyHost && new URL(l.href).pathname.replace(/\/+$/, '').startsWith(`${base}/`)).slice(0, limit).map(l => l.href);
};
export function externalSites(links, agencyHost) {
  const out = new Map();
  for (const l of links) {
    const host = hostOf(l.href);
    if (host === agencyHost || host.endsWith(`.${agencyHost}`) || NOT_CLIENT.test(host)) continue;
    if (!out.has(host)) out.set(host, `https://${new URL(l.href).hostname}/`);
  }
  return [...out.values()];
}
export const isHomeServiceSite = html => HOME_SERVICE.test(`${(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? ''} ${visibleText(html).slice(0, 4000)}`);

// Generic company inboxes the agency itself publishes on its own pages.
export function companyInboxes(html, pageUrl, agencyHost, observedAt) {
  const found = new Map();
  const text = `${String(html).replace(/mailto:/gi, ' ')} ${visibleText(html)}`;
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g)) {
    const email = m[0].toLowerCase().replace(/\.$/, '');
    if (found.has(email)) continue;
    const at = Math.max(0, m.index - 120);
    const verdict = classifyRecipientInbox({ email, company: { siteHost: agencyHost }, source: { publicationType: 'OWN_SITE_PAGE', url: pageUrl, observedAt, excerpt: text.slice(at, m.index + email.length + 120) } });
    if (verdict.addressClass === 'GENERIC_CORPORATE_ROLE_INBOX') found.set(email, { email, pageUrl });
  }
  return [...found.values()];
}

export const pitchableFindings = receipt => (receipt?.analysis?.findings ?? []).filter(f => f.firstTouchUse === 'MAY_STATE_AS_OBSERVED_FACT' && PITCHABLE_CODES.includes(f.code));

const PLAIN = {
  FORM_SUBMITS_TO_NONEXISTENT_HOST: c => `the contact form on ${c} sends to a web address that no longer exists, so those inquiries go nowhere`,
  STRUCTURED_DATA_UNPARSEABLE: c => `the business information Google and AI assistants read on ${c} is broken code, so they ignore its name, phone and hours`,
  TEL_LINK_MALFORMED: c => `a tap-to-call button on ${c} is malformed, so tapping it on a phone does not place the call`
};
export function draftEmail({ agencyName, clientHost, finding, senderName }) {
  const line = (PLAIN[finding.code] ?? (c => `I found a broken contact path on ${c}`))(clientHost);
  const subject = `${clientHost} contact issue`;
  const body = [`Hi ${agencyName} team,`, '', `I noticed ${clientHost} in your portfolio. While checking it I found that ${line}.`, '', 'I wrote up the evidence, with a 30-second way to confirm it yourself, so you can fix it before the client notices. Want me to send it?', '', senderName].join('\n');
  return { subject, body, words: body.split(/\s+/).filter(Boolean).length };
}
export function evidenceArtifact({ agencyName, clientSite, finding, observedAt, reproducedAt }) {
  return [`# Contact-path defect on ${clientSite}`, '', `Prepared for ${agencyName}. Observed ${observedAt}; observed again by an independent second check ${reproducedAt}.`, '', `**What is wrong:** ${finding.title}`, '', `**Why it matters:** ${finding.why ?? ''}`, '', `**Check it yourself in 30 seconds:** ${finding.thirtySecondDisproof ?? ''}`, '', '**Evidence:**', ...(finding.evidence ?? []).map(e => `- ${e.url ?? ''}: \`${String(e.excerpt ?? '').slice(0, 300)}\``), '', 'Read-only check of public pages. No form was submitted and no call was placed. A finding describes the page at the time it was checked.', ''].join('\n');
}

export function politeFetcher({ fetchImpl = globalThis.fetch, urlGuard = assertPublicUrl, delayMs = 1000 } = {}) {
  const robots = new Map(); let requests = 0;
  async function raw(url) {
    let current = url;
    for (let hop = 0; hop < 5; hop += 1) {
      await urlGuard(current);
      requests += 1;
      const res = await fetchImpl(current, { redirect: 'manual', headers: { 'user-agent': PROBE_USER_AGENT, accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), current).href; continue; }
      return { status: res.status, url: current, text: res.ok ? (await res.text()).slice(0, 2_000_000) : '' };
    }
    return { status: 0, url: current, text: '' };
  }
  async function get(url) {
    const origin = new URL(url).origin;
    if (!robots.has(origin)) { const r = await raw(`${origin}/robots.txt`).catch(() => ({ status: 0, text: '' })); robots.set(origin, r.status === 200 ? r.text : r.status >= 500 || r.status === 0 ? 'User-agent: *\nDisallow: /' : ''); }
    if (robotsDisallows(robots.get(origin), new URL(url).pathname)) return { status: 0, url, text: '', refused: 'ROBOTS_DISALLOW' };
    await sleep(delayMs);
    return raw(url).catch(e => ({ status: 0, url, text: '', refused: String(e?.code ?? e?.message ?? e).slice(0, 80) }));
  }
  return { get, requests: () => requests };
}

export async function scanAgency(agencyUrl, { fetcher = politeFetcher(), probe = w => probeInquiryPath({ website: w, maxPages: 4 }), now = () => new Date().toISOString(), maxClients = 4 } = {}) {
  const result = { agencyUrl, agencyName: null, email: null, clients: [], verified: [], status: 'DO_NOT_SEND', reason: null };
  let agencyHost; try { agencyHost = hostOf(agencyUrl); } catch { result.reason = 'BAD_URL'; return result; }
  const home = await fetcher.get(agencyUrl);
  if (!home.text) { result.reason = home.refused ?? `AGENCY_SITE_UNREADABLE_${home.status}`; return result; }
  result.agencyName = (decodeEntities((home.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '').split(/\s[|–—-]\s/)[0].trim() || agencyHost).slice(0, 60);
  const links = extractLinks(home.text, home.url);
  const inboxes = companyInboxes(home.text, home.url, agencyHost, now());
  for (const c of contactPages(links, agencyHost)) { if (inboxes.length) break; const p = await fetcher.get(c); inboxes.push(...companyInboxes(p.text, p.url, agencyHost, now())); }
  if (!inboxes.length) { result.reason = 'NO_PUBLISHED_COMPANY_INBOX'; return result; }
  result.email = inboxes[0].email; result.emailSource = inboxes[0].pageUrl;

  const candidates = new Set();
  for (const p of portfolioPages(links, agencyHost)) {
    const page = await fetcher.get(p); const plinks = extractLinks(page.text, page.url || p);
    externalSites(plinks, agencyHost).forEach(s => candidates.add(s));
    for (const proj of projectPages(plinks, p, agencyHost)) { if (candidates.size >= 12) break; const pp = await fetcher.get(proj); externalSites(extractLinks(pp.text, pp.url || proj), agencyHost).forEach(s => candidates.add(s)); }
  }
  for (const site of [...candidates].slice(0, 12)) {
    if (result.clients.length >= maxClients) break;
    const h = await fetcher.get(site);
    if (h.text && isHomeServiceSite(h.text)) result.clients.push(site);
  }
  if (!result.clients.length) { result.reason = 'NO_HOME_SERVICE_CLIENT_SITES_FOUND'; return result; }

  for (const site of result.clients) {
    const first = await probe(site).catch(() => null);
    const found = pitchableFindings(first);
    if (!found.length) continue;
    const observedAt = now();
    const second = await probe(site).catch(() => null);
    const again = new Set(pitchableFindings(second).map(f => `${f.code}|${claimKeyOf(f)}`));
    for (const f of found) if (again.has(`${f.code}|${claimKeyOf(f)}`)) result.verified.push({ clientSite: site, clientHost: hostOf(site), finding: f, observedAt, reproducedAt: now() });
    if (result.verified.length) break; // one solid defect is enough for a first touch
  }
  if (!result.verified.length) { result.reason = 'NO_VERIFIED_DEFECT'; return result; }
  result.status = 'SEND_CANDIDATE'; result.reason = null;
  return result;
}

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
export function writeOutputs(results, outDir, senderName) {
  fs.mkdirSync(path.join(outDir, 'drafts'), { recursive: true }); fs.mkdirSync(path.join(outDir, 'artifacts'), { recursive: true });
  const rows = [['id', 'agency', 'agency_site', 'to', 'client_site', 'defect', 'status', 'reason', 'subject', 'draft_file', 'artifact_file', 'approve'].join(',')];
  results.forEach((r, i) => {
    const id = String(i + 1).padStart(3, '0'); let subject = ''; let draftFile = ''; let artifactFile = '';
    if (r.status === 'SEND_CANDIDATE') {
      const v = r.verified[0]; const d = draftEmail({ agencyName: r.agencyName, clientHost: v.clientHost, finding: v.finding, senderName });
      subject = d.subject; draftFile = `drafts/${id}.txt`; artifactFile = `artifacts/${id}.md`;
      fs.writeFileSync(path.join(outDir, draftFile), `${d.body}\n`);
      fs.writeFileSync(path.join(outDir, artifactFile), evidenceArtifact({ agencyName: r.agencyName, clientSite: v.clientSite, finding: v.finding, observedAt: v.observedAt, reproducedAt: v.reproducedAt }));
    }
    rows.push([id, r.agencyName, r.agencyUrl, r.email, r.verified[0]?.clientSite ?? r.clients.join(' '), r.verified[0]?.finding.code ?? '', r.status, r.reason ?? '', subject, draftFile, artifactFile, ''].map(csvCell).join(','));
  });
  fs.writeFileSync(path.join(outDir, 'review.csv'), `${rows.join('\n')}\n`);
  fs.writeFileSync(path.join(outDir, 'scan.jsonl'), `${results.map(r => JSON.stringify({ ...r, version: SCAN_VERSION })).join('\n')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const listFile = args.find(a => !a.startsWith('--') && a !== opt('--out') && a !== opt('--name'));
  const outDir = opt('--out') ?? 'out'; const senderName = opt('--name');
  if (!listFile || !senderName) { console.error('usage: node scripts/agency-leak-scan.mjs agencies.txt --out out --name "Your Name"'); process.exit(2); }
  const urls = [...new Set(fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s)))];
  const results = [];
  for (const [i, url] of urls.entries()) {
    process.stdout.write(`[${i + 1}/${urls.length}] ${url} ... `);
    const r = await scanAgency(url).catch(e => ({ agencyUrl: url, clients: [], verified: [], status: 'DO_NOT_SEND', reason: `ERROR_${String(e?.message ?? e).slice(0, 60)}` }));
    results.push(r); console.log(r.status === 'SEND_CANDIDATE' ? `SEND_CANDIDATE (${r.verified[0].finding.code} on ${r.verified[0].clientHost})` : `DO_NOT_SEND: ${r.reason}`);
    writeOutputs(results, outDir, senderName);
  }
  const n = results.filter(r => r.status === 'SEND_CANDIDATE').length;
  console.log(`\nDone. ${n} of ${results.length} agencies have a verified draft. Review ${path.join(outDir, 'review.csv')}. Nothing was sent.`);
}
