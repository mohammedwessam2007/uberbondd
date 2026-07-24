// White-label report generator (workstream 11). buildReportData is grounded exactly in its input
// -- it never adds a defect, a claim, or a number not already present in what it was given.
// renderReportHtml refuses to render (via claims.mjs's grounding guard) if any defect card is
// ungrounded or contains an unsupported claim. A report not explicitly `mode: 'agency_branded'` or
// `'ubberbond_branded'` with `commissioned: true` always carries the mission's exact demo
// watermark text -- "Demonstration, not commissioned client work." -- and that text cannot be
// suppressed by omission.
import crypto from 'node:crypto';
import { escapeHtml } from './utils.mjs';
import { findUnsupportedClaims } from './claims.mjs';

export class ReportError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ReportError';
    this.code = code;
  }
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function buildReportData({ project, websites = [], defectCards = [], evidenceItems = [], period, generatedAt = new Date() }) {
  if (!project) throw new ReportError('project-required');
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map(sev => [sev, defectCards.filter(c => c.severity === sev).length]));
  return {
    generatedAt: generatedAt.toISOString(), period,
    project: { id: project.id, organizationDomain: project.organizationDomain },
    websites: websites.map(w => ({ id: w.id, domain: w.domain })),
    executiveSummary: {
      totalDefects: defectCards.length, bySeverity, noDefectsFound: defectCards.length === 0,
      headline: defectCards.length === 0 ? 'No lead-path issues were found during this check.' : `${defectCards.length} lead-path issue(s) found across ${websites.length} site(s).`
    },
    technicalAppendix: { defects: defectCards.map(c => ({ id: c.id, websiteId: c.websiteId, category: c.category, severity: c.severity, checkKey: c.checkKey, reproduction: c.reproduction, confidence: c.confidence, limitations: c.limitations, evidenceRefs: c.evidenceRefs })) },
    evidenceLedger: evidenceItems.map(item => ({ id: item.id, websiteId: item.websiteId || item.data?.websiteId, sourceUrl: item.sourceUrl, sourceType: item.sourceType, rawHash: item.rawHash, capturedAt: item.capturedAt })),
    defectCards: defectCards.map(c => ({ id: c.id, category: c.category, severity: c.severity, cautiousConsequence: c.cautiousConsequence, recommendation: c.recommendation, effortHours: c.effortHours, reversibility: c.reversibility, authorizationRequired: c.authorizationRequired })),
    roadmap: buildRoadmap(defectCards),
    implementationScope: buildImplementationScopeItems(defectCards),
    limitations: [
      'This report reflects automated lead-path checks only; it is not a security audit or a guarantee of revenue impact.',
      'No form on any checked site was submitted; form presence and action availability are checked structurally only.',
      'Visual and mobile-viewport checks compare screenshot hashes, not a rendered pixel diff.',
      'Every claim in this report is linked to a specific evidence item captured during this diagnostic.'
    ]
  };
}

/** Highest severity first, ties broken by lowest effort first (quick wins surface earlier). */
export function buildRoadmap(defectCards = []) {
  return [...defectCards]
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || (a.effortHours || 0) - (b.effortHours || 0))
    .map((c, index) => ({ rank: index + 1, defectId: c.id, category: c.category, severity: c.severity, effortHours: c.effortHours }));
}

export function buildImplementationScopeItems(defectCards = []) {
  return defectCards.map(c => ({ defectId: c.id, description: c.recommendation, estimatedHours: c.effortHours, reversibility: c.reversibility, authorizationRequired: c.authorizationRequired }));
}

function assertReportGrounded(reportData) {
  const badClaims = reportData.defectCards.filter(c => findUnsupportedClaims(c.cautiousConsequence).length > 0 || findUnsupportedClaims(c.recommendation).length > 0);
  if (badClaims.length) throw new ReportError('unsupported-claim-in-report', badClaims.map(c => c.id).join(','));
  const ungrounded = reportData.technicalAppendix.defects.filter(d => !Array.isArray(d.evidenceRefs) || d.evidenceRefs.length === 0);
  if (ungrounded.length) throw new ReportError('ungrounded-defect-in-report', ungrounded.map(d => d.id).join(','));
  return true;
}

const DEMO_WATERMARK_TEXT = 'Demonstration, not commissioned client work.';

/** `mode`: 'agency_branded' | 'ubberbond_branded' | 'demo'. `commissioned` must be explicitly true
 * for agency_branded/ubberbond_branded to omit the watermark -- 'demo' mode always shows it
 * regardless of `commissioned`. */
export function renderReportHtml(reportData, { mode = 'demo', commissioned = false, brand = {} } = {}) {
  assertReportGrounded(reportData);
  const showWatermark = mode === 'demo' || !commissioned;
  const brandName = mode === 'ubberbond_branded' ? 'UberBond' : escapeHtml(brand.agencyDisplayName || 'UberBond Same-Day Diagnostic');
  const primaryColor = /^#[0-9a-f]{6}$/i.test(brand.primaryColor || '') ? brand.primaryColor : '#1d4ed8';
  const watermark = showWatermark ? `<div style="background:#b91c1c;color:#fff;padding:8px 16px;font-weight:bold;text-align:center;">${escapeHtml(DEMO_WATERMARK_TEXT)}</div>` : '';
  const defectList = reportData.defectCards.map(c => `<li><strong>${escapeHtml(c.severity)}</strong> -- ${escapeHtml(c.category)}: ${escapeHtml(c.cautiousConsequence)} <br><em>Recommendation:</em> ${escapeHtml(c.recommendation)}</li>`).join('');
  const roadmapList = reportData.roadmap.map(r => `<li>#${r.rank} -- ${escapeHtml(r.category)} (${escapeHtml(r.severity)}, ~${r.effortHours}h)</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${brandName} -- Revenue Leak Diagnostic Report</title>
<style>@media print { .no-print { display:none } } body{font-family:sans-serif;max-width:840px;margin:0 auto;padding:24px;} h1{color:${primaryColor};}</style>
</head><body>
${watermark}
<h1>${brandName} -- Revenue Leak Diagnostic Report</h1>
<p>Sites: ${reportData.websites.map(w => escapeHtml(w.domain)).join(', ')} -- period ${escapeHtml(String(reportData.period || ''))}</p>
<h2>Executive Summary</h2>
<p>${escapeHtml(reportData.executiveSummary.headline)}</p>
<h2>Defect Cards</h2>
<ul>${defectList || '<li>None found.</li>'}</ul>
<h2>Roadmap</h2>
<ol>${roadmapList || '<li>No items.</li>'}</ol>
<h2>Evidence Ledger</h2>
<p>${reportData.evidenceLedger.length} evidence item(s) captured, each independently hashed.</p>
<h2>Limitations</h2>
<ul>${reportData.limitations.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
</body></html>`;
}

export function renderReportMarkdown(reportData) {
  assertReportGrounded(reportData);
  const lines = [`# Revenue Leak Diagnostic Report`, '', `**Period:** ${reportData.period}`, '', '## Executive Summary', reportData.executiveSummary.headline, '', '## Defect Cards'];
  for (const c of reportData.defectCards) lines.push(`- **[${c.severity}] ${c.category}** -- ${c.cautiousConsequence} _Recommendation: ${c.recommendation}_`);
  lines.push('', '## Roadmap');
  for (const r of reportData.roadmap) lines.push(`${r.rank}. ${r.category} (${r.severity}, ~${r.effortHours}h)`);
  lines.push('', '## Limitations');
  for (const l of reportData.limitations) lines.push(`- ${l}`);
  return lines.join('\n');
}

export function renderReportJson(reportData) { assertReportGrounded(reportData); return JSON.stringify(reportData, null, 2); }

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function computeSignature(body, secret) {
  if (!secret || String(secret).length < 16) throw new ReportError('report-secret-not-configured');
  return crypto.createHmac('sha256', String(secret)).update(canonicalize(body)).digest('hex');
}
export function signReportManifest(reportData, secret) {
  return { signature: computeSignature(reportData, secret), algorithm: 'hmac-sha256', signedAt: new Date().toISOString() };
}
export function verifyReportManifest(reportData, manifest, secret) {
  if (!manifest?.signature) return { valid: false, reason: 'manifest-not-signed' };
  let expected;
  try { expected = computeSignature(reportData, secret); } catch (error) { return { valid: false, reason: error.code || 'report-secret-not-configured' }; }
  const a = Buffer.from(String(manifest.signature), 'hex'), b = Buffer.from(expected, 'hex');
  return (a.length === b.length && crypto.timingSafeEqual(a, b)) ? { valid: true, reason: '' } : { valid: false, reason: 'manifest-signature-mismatch' };
}
