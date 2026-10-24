// Buyer-declared phone truth for a buyer-nominated inquiry-path check.
//
// A stranger auditing a site cannot tell call tracking or deliberate routing
// from an error, so inquiry-path-coherence holds unrelated-number mismatches
// as questions. A paying buyer can declare which numbers are theirs. Measured
// against that declaration, "this button dials a number you did not declare"
// is a checkable fact on any site, and a clean result is a verified routing
// record instead of an empty report.
//
// Input pages are extractInquirySurface() results. Pure; sends nothing.
import { normalizeTelHref, formatNanp } from './inquiry-path-coherence.mjs';

export function normalizeDeclaration(entries = []) {
  const numbers = new Map();
  const rejected = [];
  for (const entry of entries) {
    const normalized = normalizeTelHref(`tel:${entry?.number ?? ''}`);
    if (normalized.ok) numbers.set(normalized.key, String(entry.purpose ?? 'business line').slice(0, 80));
    else rejected.push({ number: String(entry?.number ?? ''), reason: normalized.reason });
  }
  return { numbers, rejected };
}

const clip = (value, n) => String(value ?? '').slice(0, n);
const ev = (page, excerpt) => ({ url: page.url, excerpt: clip(excerpt, 200), sourceSha256: page.sourceSha256 });

export function reconcileDeclaredNumbers({ pages = [], declared = [] } = {}) {
  const declaration = normalizeDeclaration(declared);
  if (!declaration.numbers.size) throw new Error('declaration must contain at least one valid North American number');
  const usable = pages.filter(page => page?.sourceSha256 && (page.status == null || (page.status >= 200 && page.status < 300)) && (page.observability ?? 'STATIC_HTML_READABLE') === 'STATIC_HTML_READABLE');
  const unobservable = pages.filter(page => page && !usable.includes(page)).map(page => ({ url: page.url, observability: page.status != null && (page.status < 200 || page.status >= 300) ? `HTTP_${page.status}` : (page.observability ?? 'UNKNOWN') }));
  const findings = [];
  const coverage = [];
  const seen = new Set();
  const tappable = new Set();
  const printed = new Map();

  for (const page of usable) {
    const tracking = page.callTracking?.length ? page.callTracking.join(', ') : null;
    for (const link of page.telLinks ?? []) {
      if (!link.normalized?.ok) continue; // malformed links are reported by inquiry-path-coherence
      const target = link.normalized.key;
      seen.add(target);
      tappable.add(target);
      const purpose = declaration.numbers.get(target) ?? null;
      coverage.push({ url: page.url, label: clip(link.anchorText, 80), dials: formatNanp(target), reaches: purpose ?? 'UNDECLARED' });
      if (purpose) continue;
      findings.push({
        code: 'DIALS_UNDECLARED_NUMBER',
        status: tracking ? 'NEEDS_CONFIRMATION' : 'VERIFIED_AGAINST_DECLARATION',
        title: `"${clip(link.anchorText, 60) || 'Call link'}" dials ${formatNanp(target)}, which is not one of your declared numbers`,
        why: 'A visitor who taps this control reaches a line you did not list as yours. If it is an old, unmonitored or forwarded-late number, the call is lost before anyone can book it.',
        thirtySecondCheck: `On a phone, open ${page.url} and tap "${clip(link.anchorText, 50)}". If the dialer shows one of your declared numbers, this finding is wrong.`,
        caveat: tracking ? `Call-tracking script detected (${tracking}); if you use dynamic number insertion, add your tracking pool numbers to the declaration and re-run.` : null,
        evidence: [ev(page, `<a href="${link.href}"> ${link.anchorText}`)],
      });
    }
    for (const phone of page.visiblePhones ?? []) {
      if (phone.fictional) continue;
      seen.add(phone.key);
      printed.set(phone.key, printed.get(phone.key) ?? ev(page, phone.excerpt));
      if (phone.role === 'REGULATORY_OR_FAX' || declaration.numbers.has(phone.key)) continue;
      findings.push({
        code: 'SHOWS_UNDECLARED_NUMBER',
        status: 'NEEDS_CONFIRMATION',
        title: `${formatNanp(phone.key)} is printed on the page but is not one of your declared numbers`,
        why: 'Visitors may call the number they read. It may be a partner, supplier or retired line; please confirm.',
        thirtySecondCheck: `Find "${phone.display}" on ${page.url}. If it belongs to someone else on purpose, this finding is wrong.`,
        caveat: null,
        evidence: [ev(page, phone.excerpt)],
      });
    }
    for (const phone of page.schema?.phones ?? []) {
      if (!phone.normalized?.ok) continue;
      seen.add(phone.normalized.key);
      if (declaration.numbers.has(phone.normalized.key)) continue;
      findings.push({
        code: 'SCHEMA_UNDECLARED_NUMBER',
        status: 'VERIFIED_AGAINST_DECLARATION',
        title: `The page tells search engines and AI assistants to call ${formatNanp(phone.normalized.key)}, which is not one of your declared numbers`,
        why: 'Structured data is what search results, maps and assistants read when they show a call button for you.',
        thirtySecondCheck: `Paste ${page.url} into Google's Rich Results Test and look at "telephone". If it shows one of your declared numbers, this finding is wrong.`,
        caveat: null,
        evidence: [ev(page, `telephone: ${phone.raw} (${phone.entityType})`)],
      });
    }
  }
  for (const [key, purpose] of declaration.numbers) {
    if (!printed.has(key) || tappable.has(key)) continue;
    findings.push({
      code: 'DECLARED_NUMBER_NOT_TAPPABLE',
      status: 'VERIFIED_AGAINST_DECLARATION',
      title: `Your ${purpose} ${formatNanp(key)} is printed, but no working call link on the pages read dials it`,
      why: 'On a phone the visitor must copy or memorise the number at the moment they decided to call; some call the next result instead.',
      thirtySecondCheck: `On a phone, open ${printed.get(key).url} and tap ${formatNanp(key)}. If the dialer opens with that number from a coded link, this finding is wrong.`,
      caveat: null,
      evidence: [printed.get(key)],
    });
  }
  const absent = [...declaration.numbers.entries()].filter(([key]) => !seen.has(key)).map(([key, purpose]) => ({ number: formatNanp(key), purpose }));
  // One finding per code and number: the same footer repeats on every page.
  const merged = new Map();
  for (const finding of findings) {
    const key = `${finding.code}|${finding.title}`;
    if (merged.has(key)) merged.get(key).evidence.push(...finding.evidence);
    else merged.set(key, { ...finding, evidence: [...finding.evidence] });
  }
  const deduped = [...merged.values()].map(f => ({ ...f, evidence: f.evidence.slice(0, 6), pagesAffected: new Set(f.evidence.map(e => e.url)).size }));
  const verdict = !usable.length ? 'NOT_OBSERVABLE' : deduped.length ? 'FINDINGS' : unobservable.length ? 'PARTIAL' : 'CLEAN';
  return { declaration: { accepted: [...declaration.numbers.entries()].map(([key, purpose]) => ({ number: formatNanp(key), purpose })), rejected: declaration.rejected }, pagesChecked: usable.length, unobservable, coverage, declaredButNotFound: absent, findings: deduped, verdict };
}

const esc = value => String(value ?? '').replace(/[|\r\n]+/g, ' ').replace(/[<>]/g, c => (c === '<' ? '&lt;' : '&gt;'));

// Standard-check findings that stay meaningful next to a declaration. Phone
// comparisons are superseded by the declaration; the rest are path defects.
export const PATH_DEFECT_CODES = new Set(['TEL_LINK_MALFORMED', 'FORM_SUBMITS_TO_NONEXISTENT_HOST', 'PHONE_SHOWN_BUT_NOT_TAPPABLE', 'STRUCTURED_DATA_UNPARSEABLE']);

export function renderDeclaredNumberReport(result, { site, checkedAt, label = '', pathDefects = [], refusals = [] } = {}) {
  const lines = [];
  lines.push(`# Inquiry-path check: ${esc(site)}`, '');
  if (label) lines.push(`> ${esc(label)}`, '');
  lines.push(`Checked ${esc(checkedAt)} · ${result.pagesChecked} page(s) read · verdict **${result.verdict}**`, '');
  lines.push('## Your declared numbers', '', ...result.declaration.accepted.map(d => `- ${d.number} (${esc(d.purpose)})`), '');
  if (result.declaration.rejected.length) lines.push('Not usable as declared: ' + result.declaration.rejected.map(r => `${esc(r.number)} (${r.reason})`).join(', '), '');
  lines.push('## Every call link we found and where it goes', '', '| Page | Link text | Dials | Reaches |', '|---|---|---|---|');
  for (const c of result.coverage) lines.push(`| ${esc(c.url)} | ${esc(c.label)} | ${c.dials} | ${esc(c.reaches)} |`);
  if (!result.coverage.length) lines.push('| (none) | | | |');
  lines.push('');
  lines.push('## Findings', '');
  if (result.verdict === 'NOT_OBSERVABLE') lines.push('No page could be read, so nothing was verified. This is not a clean result.', '');
  else if (result.verdict === 'PARTIAL') lines.push('Some pages could not be checked. The readable pages had no listed mismatches, but a complete clean result is NOT verified.', '');
  else if (!result.findings.length) lines.push('None. Every call link and published number on the pages read matches your declaration.', '');
  result.findings.forEach((f, i) => {
    lines.push(`### ${i + 1}. ${esc(f.title)}`, '', `*${f.status === 'VERIFIED_AGAINST_DECLARATION' ? 'Verified against your declaration' : 'Please confirm'}* · ${f.pagesAffected} page(s)`, '', esc(f.why), '', `**30-second check:** ${esc(f.thirtySecondCheck)}`, '');
    if (f.caveat) lines.push(`**Caveat:** ${esc(f.caveat)}`, '');
    lines.push('Evidence:', ...f.evidence.map(e => `- ${esc(e.url)}: \`${esc(e.excerpt)}\` (page SHA-256 ${e.sourceSha256.slice(0, 12)}…)`), '');
  });
  const defects = pathDefects.filter(f => PATH_DEFECT_CODES.has(f.code));
  if (defects.length) {
    lines.push('## Other path defects', '');
    for (const f of defects) lines.push(`- **${esc(f.title)}**. ${esc(f.why)} *30-second check:* ${esc(f.thirtySecondDisproof)}`);
    lines.push('');
  }
  if (result.declaredButNotFound.length) lines.push('## Declared but not found on the pages read', '', ...result.declaredButNotFound.map(d => `- ${d.number} (${esc(d.purpose)})`), '');
  if (result.unobservable.length) lines.push('## Pages we could not read', '', ...result.unobservable.map(u => `- ${esc(u.url)}: ${u.observability}`), '');
  if (refusals.length) lines.push('## Pages the probe refused or could not fetch', '', ...refusals.map(r => `- ${esc(r.url)}: ${esc(r.reason)}`), '');
  lines.push('## Scope', '', 'This check reads the public pages listed above as a visitor\'s browser receives them. It does not test call answering, forwarding, ad accounts or pages behind a login. A finding is a fact about your page, not an estimate of lost revenue.');
  return `${lines.join('\n')}\n`;
}
