// Deterministic buyer-facing renderer. Source evidence is data, not instructions.
// No timestamp is invented; missing discovery times remain UNKNOWN.
export const AUDIT_REPORT_VERSION = 'uberbond.verified-inquiry-report-1.0.0';
const plain = value => value == null ? 'UNKNOWN' : String(value);
const md = value => plain(value).replace(/[\\`*_{}\[\]()#+!|<>]/g, '\\$&').replace(/[\r\n]+/g, ' ');
const html = value => plain(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = value => { try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null; return url.href; } catch { return null; } };
const summary = (arr, fallback) => Array.isArray(arr) && arr.length ? arr : fallback;
function normalized(input) {
  const items = Array.isArray(input.deliveredItems) ? input.deliveredItems : [];
  const receipt = input.receipt ?? {};
  const approved = input.approvedWebsite ?? items[0]?.website ?? null;
  return {
    sourceClass: input.sourceClass ?? 'UNSPECIFIED_EVIDENCE_UNVERIFIED',
    title: input.title ?? 'Verified Website Inquiry Audit',
    approved, scanAt: input.scanAt ?? null, pages: summary(input.pagesExamined, []),
    items: items.filter(item => item?.evidence?.length && item.verifiedAt && item.claim && item.disproveIn30Seconds),
    questions: summary(input.questions, []), clean: summary(input.cleanChecks, []), unobservable: summary(input.unobservableChecks, receipt.notObservable ?? []),
    receipt, price: input.price ?? 'Proposed $99 direct pilot, one site up to ten public pages; only after acceptance of scope.',
    support: input.support ?? 'One factual correction pass included. Disproven finding: remove and refund or do not invoice its agreed share, subject to approved written terms. Support contact must be provided before purchase.',
    accepted: input.deliveryAcceptance ?? { status: 'NOT_EVIDENCED' }
  };
}
export function renderInquiryAudit(input = {}) {
  const data = normalized(input);
  const lines = [
    `# ${md(data.title)}`,
    '', `**Evidence class:** ${md(data.sourceClass)}`,
    `**Approved website:** ${md(data.approved)}`,
    `**Scan timestamp:** ${md(data.scanAt)}`,
    `**Pages examined:** ${data.pages.length} recorded`,
    '', '## Scope and restrictions',
    'Read-only checks of up to ten publicly accessible pages of the approved website. No phone calls, form submissions, authentication, security exploitation, or access to private infrastructure. Customer must be authorized to commission checks.',
    '', '## Verified findings'
  ];
  if (!data.items.length) lines.push('No independently supported finding is recorded in this input. That does not establish the site is defect-free.');
  for (const [index, item] of data.items.entries()) {
    lines.push('', `### ${index + 1}. ${md(item.claim)}`, `- Website: ${md(item.website)}`, `- Defect class: ${md(item.defect)}`, `- Discovered: ${md(item.discoveredAt)}`, `- Re-verified: ${md(item.verifiedAt)}`, '- Business/financial impact: UNKNOWN', `- Reproduce or disprove: ${md(item.disproveIn30Seconds)}`);
    for (const evidence of item.evidence) lines.push(`- Source: ${md(evidence.url)} | HTML: \`${md(evidence.excerpt)}\` | Source SHA-256: ${md(evidence.sourceSha256)}`);
  }
  const list = (title, values, empty) => { lines.push('', `## ${title}`); if (!values.length) lines.push(empty); else for (const item of values) lines.push(`- ${md(typeof item === 'string' ? item : JSON.stringify(item))}`); };
  list('Questions requiring human confirmation', data.questions, 'None supplied.');
  list('Clean checks', data.clean, 'No explicit clean checks supplied.');
  list('Unobservable checks', data.unobservable, 'None supplied. An unobservable check is never a billable defect.');
  lines.push('', '## Billing and financial status',
    `- Run mode / evidence: ${md(data.sourceClass)}`,
    `- Platform charge events claimed in input: ${md(data.receipt.charged ?? 0)} (not proof of provider settlement)`,
    `- Final collected payment: NOT EVIDENCED`,
    `- Cleared contribution profit: NOT EVIDENCED`,
    'A provider charge event, receipt, or invoice is not proof of cleared funds.',
    '', '## Delivery acceptance',
    `- Buyer acceptance: ${md(data.accepted.status)}`,
    'Delivery is accepted only by explicit buyer confirmation of the agreed scope. Silence is not acceptance.',
    '', '## Price, corrections and support', md(data.price), md(data.support),
    '', '## Commercial limitations and exclusions',
    'No assertion that a mismatch loses customers or revenue. Different telephone destinations may be legitimate routing or call tracking. No conversion analysis, revenue attribution, guarantees of completeness or uninterrupted website availability. Historical demonstration reports are NOT current independently verified findings.',
    '', '## Reproducibility and provenance',
    'Open each URL in a normal browser, inspect the displayed inquiry control, and compare it with the destination shown by the browser or dialer. A number mismatch alone is not proof of malfunction. Ask the business to confirm its intended routing. If current behavior differs, treat this report as superseded rather than charging for that claim.',
    ''
  );
  const markdown = lines.join('\n');
  // HTML is constructed from the same normalized records, not by interpreting
  // source-controlled or website-supplied Markdown as HTML.
  const section = (heading, values, empty) => `<section><h2>${html(heading)}</h2>${values.length ? `<ul>${values.map(item => `<li>${html(typeof item === 'string' ? item : JSON.stringify(item))}</li>`).join('')}</ul>` : `<p>${html(empty)}</p>`}</section>`;
  const findings = data.items.length ? data.items.map((item, index) => `<article><h3>${index + 1}. ${html(item.claim)}</h3><p><b>Website:</b> ${html(item.website)}<br><b>Defect class:</b> ${html(item.defect)}<br><b>Discovered:</b> ${html(item.discoveredAt)}<br><b>Re-verified:</b> ${html(item.verifiedAt)}<br><b>Commercial impact:</b> UNKNOWN</p><p><b>Reproduce or disprove:</b> ${html(item.disproveIn30Seconds)}</p><ul>${item.evidence.map(e => `<li>Source: ${safeUrl(e.url) ? `<a rel="noreferrer noopener" href="${html(safeUrl(e.url))}">${html(e.url)}</a>` : html(e.url)}<pre>${html(e.excerpt)}</pre><small>SHA-256: ${html(e.sourceSha256)}</small></li>`).join('')}</ul></article>`).join('') : '<p>No supported finding is recorded. This does not establish a defect-free site.</p>';
  const htmlReport = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; navigate-to https: http:"><title>${html(data.title)}</title><style>body{font:16px/1.6 system-ui,Arial,sans-serif;max-width:850px;margin:3rem auto;padding:0 1.2rem;color:#17202d}h1,h2{color:#173b5c}section,article{border-top:1px solid #d9e0e6;padding:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f3f6;padding:1rem;border-radius:.4rem}small{color:#506178}article{padding:1rem 0}a{color:#005b9f}</style></head><body><h1>${html(data.title)}</h1><p><b>Evidence class:</b> ${html(data.sourceClass)}<br><b>Approved website:</b> ${html(data.approved)}<br><b>Scan timestamp:</b> ${html(data.scanAt)}<br><b>Pages examined:</b> ${data.pages.length} recorded</p><section><h2>Scope and restrictions</h2><p>Read-only public inquiry checks, up to ten pages. No calls, form submissions, authentication or security testing. Customer authorization required.</p></section><section><h2>Verified findings</h2>${findings}</section>${section('Questions requiring human confirmation',data.questions,'None supplied.')}${section('Clean checks',data.clean,'None supplied.')}${section('Unobservable checks',data.unobservable,'None supplied; unobservable is never billable.')}<section><h2>Billing and financial status</h2><p>Source: ${html(data.sourceClass)}. Input charge events: ${html(data.receipt.charged ?? 0)}; this is not provider payment evidence. Collected payment: NOT EVIDENCED. Cleared profit: NOT EVIDENCED.</p></section><section><h2>Delivery acceptance</h2><p>${html(data.accepted.status)}. Explicit buyer confirmation required; silence is not acceptance.</p></section><section><h2>Price, corrections and support</h2><p>${html(data.price)}</p><p>${html(data.support)}</p></section><section><h2>Commercial limitations and what was not tested</h2><p>No estimated lost calls, leads, conversions or revenue. Routing differences may be legitimate. No conversion analysis, private endpoints, login, calls, form submission or completeness guarantee. Historical observations must be rechecked.</p></section><section><h2>Human reproduction and disproof</h2><p>Open each cited page. Compare printed and dialed numbers, and confirm intended routing with the business. Historical reports cannot establish current behavior.</p></section></body></html>`;
  return { markdown, html: htmlReport, findingCount: data.items.length, sourceClass: data.sourceClass };
}
