// Shapes a stored report from the production crawler + deterministic audit
// rules. GitHub Actions screenshots are intentionally ephemeral and are never
// represented as durable evidence in Cash Engine Lite.
import net from 'node:net';
import { isPrivateIp } from './security.mjs';

const PROFILE = Object.freeze({
  'missing-title': { group: 'seo-title', reach: 5, effort: 1 },
  'thin-title': { group: 'seo-title', reach: 5, effort: 1 },
  'missing-description': { group: 'seo-description', reach: 4, effort: 1 },
  'missing-h1': { group: 'seo-heading', reach: 5, effort: 2 },
  'excessive-h1': { group: 'seo-heading', reach: 4, effort: 2 },
  noindex: { group: 'seo-indexing', reach: 5, effort: 1 },
  'generic-hero': { group: 'positioning-message', reach: 5, effort: 3 },
  'thin-hero': { group: 'positioning-message', reach: 5, effort: 2 },
  'premium-positioning': { group: 'positioning-message', reach: 5, effort: 3 },
  'no-cta': { group: 'conversion-action', reach: 5, effort: 2 },
  'cta-below-fold': { group: 'conversion-action', reach: 5, effort: 2 },
  'cta-clutter': { group: 'conversion-action', reach: 4, effort: 3 },
  'mobile-primary-action-hidden': { group: 'mobile-action', reach: 4, effort: 2 },
  'mobile-overflow': { group: 'mobile-layout', reach: 4, effort: 3 },
  'small-touch-targets': { group: 'mobile-controls', reach: 4, effort: 2 },
  'missing-alt': { group: 'accessibility-images', reach: 3, effort: 2 },
  'unlabeled-form': { group: 'accessibility-forms', reach: 4, effort: 2 },
  'broken-links': { group: 'broken-paths', reach: 4, effort: 2 },
  'weak-contact-path': { group: 'contact-path', reach: 5, effort: 2 },
  'https-not-enforced': { group: 'secure-transport', reach: 5, effort: 3 },
  'slow-dom-content-loaded': { group: 'page-readiness', reach: 5, effort: 4 },
  'medical-trust': { group: 'industry-trust', reach: 4, effort: 3 },
  'arabic-opportunity': { group: 'localization', reach: 3, effort: 5 },
  'thin-discovery': { group: 'crawl-coverage', reach: 2, effort: 4 }
});

const ALLOWED_EVIDENCE_TYPES = new Set(['page_observation', 'page_metadata', 'measurement', 'url_observation']);
const ALLOWED_MEASUREMENT_UNITS = new Set(['ms', 's', 'bytes', 'count', 'px', '%']);
const MIN_CUSTOMER_CONFIDENCE = 0.72;
const DEGRADED_CRAWL_ABSENCE_CODES = new Set([
  'no-cta',
  'weak-contact-path',
  'missing-h1',
  'missing-title',
  'missing-description',
  'thin-discovery',
  'mobile-primary-action-hidden'
]);
const MEDICAL_INDUSTRY_CODES = new Set([
  'healthcare', 'medical-practice', 'hospital', 'dental-practice',
  'pharmacy', 'physiotherapy', 'therapy-practice'
]);
const GULF_COUNTRY_CODES = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM']);

function safeText(value, max = 500) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function containsUnsafeDetail(value) {
  const text = String(value || '');
  if (/\b(?:localhost|DATABASE_URL|node_modules)\b|file:\/\/|\/workspace\/|\/root\/|[a-z]:\\|postgres(?:ql)?:\/\/|authorization\s*:\s*bearer|(?:api[_-]?key|secret|access[_-]?token)\s*[:=]/i.test(text)) return true;
  if (/(?:^|[\s\[(])(?:::1|::|f[cd][0-9a-f:]+|fe[89ab][0-9a-f:]+)(?:$|[\s\])])/i.test(text)) return true;
  const addresses = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  return addresses.some(address => net.isIP(address) && isPrivateIp(address));
}

function safeEvidenceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local')) return null;
    if (net.isIP(host) && isPrivateIp(host)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function normalizeEvidence(raw, fallbackUrl, fallbackExcerpt) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const type = ALLOWED_EVIDENCE_TYPES.has(source.type) ? source.type : 'page_observation';
  const url = safeEvidenceUrl(source.url || fallbackUrl);
  if (!url) return null;

  if (type === 'measurement') {
    const metric = safeText(source.metric, 120);
    const value = Number(source.value);
    const unit = safeText(source.unit, 16);
    const context = safeText(source.context, 40);
    if (!metric || !Number.isFinite(value) || !ALLOWED_MEASUREMENT_UNITS.has(unit) || context !== 'laboratory') return null;
    return { type, url, metric, value, unit, context };
  }

  if (type === 'page_metadata' || type === 'url_observation') {
    const field = safeText(source.field, 80);
    const observedValue = safeText(source.observedValue, 500);
    if (!field || !observedValue || containsUnsafeDetail(observedValue)) return null;
    return { type, url, field, observedValue };
  }

  const excerpt = safeText(source.excerpt || fallbackExcerpt, 500);
  if (!excerpt || containsUnsafeDetail(excerpt)) return null;
  return { type, url, excerpt };
}

function sanitizeFinding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const code = safeText(raw.code, 120).toLowerCase();
  const title = safeText(raw.title, 200);
  const implication = safeText(raw.implication, 500);
  const service = safeText(raw.service, 200);
  const category = safeText(raw.category || 'General', 80);
  const excerpt = safeText(raw.evidenceExcerpt, 500);
  if (!code || !title || !implication || containsUnsafeDetail(title) || containsUnsafeDetail(implication)) return null;
  const evidence = normalizeEvidence(raw.evidence, raw.evidenceUrl, excerpt);
  if (!evidence) return null;
  const evidenceExcerpt = evidence.type === 'measurement'
    ? `${evidence.metric}: ${evidence.value} ${evidence.unit} (${evidence.context} observation).`
    : evidence.type === 'page_observation'
      ? evidence.excerpt
      : `${evidence.field}: ${evidence.observedValue}`;
  const severity = Math.max(1, Math.min(5, Math.round(Number(raw.severity) || 1)));
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  return {
    code, title, severity, confidence, category, implication, service,
    evidenceUrl: evidence.url, evidenceExcerpt, evidence,
    // Internal eligibility signal. It is removed before any report JSON is built.
    safeForOutreach: raw.safeForOutreach !== false
  };
}

function hasVerifiedVerticalContext(finding, context) {
  const metadata = context?.verifiedMetadata;
  if (finding.code === 'medical-trust') {
    return metadata?.industry?.verified === true &&
      MEDICAL_INDUSTRY_CODES.has(safeText(metadata.industry.code, 80).toLowerCase());
  }
  if (finding.code === 'arabic-opportunity') {
    return metadata?.market?.verified === true &&
      GULF_COUNTRY_CODES.has(safeText(metadata.market.countryCode, 2).toUpperCase());
  }
  return true;
}

function publicFinding(finding) {
  const { safeForOutreach: _internalEligibility, ...customerVisible } = finding;
  return customerVisible;
}

function rankFinding(finding) {
  const profile = PROFILE[finding.code] || { group: finding.code, reach: 3, effort: 3 };
  const score = Math.round((
    (finding.severity / 5) * 0.4 +
    finding.confidence * 0.3 +
    (profile.reach / 5) * 0.2 +
    ((6 - profile.effort) / 5) * 0.1
  ) * 100);
  return {
    ...finding,
    whyItMatters: finding.implication,
    ranking: {
      businessImpact: finding.severity,
      confidence: finding.confidence,
      reach: profile.reach,
      effort: profile.effort,
      score
    },
    dedupeGroup: profile.group
  };
}

function distinctRanked(findings, limit = 3) {
  const seen = new Set();
  return findings
    .map(rankFinding)
    .filter(finding => finding.confidence >= 0.8)
    .sort((a, b) => b.ranking.score - a.ranking.score || b.severity - a.severity || b.confidence - a.confidence || a.code.localeCompare(b.code))
    .filter(finding => {
      if (seen.has(finding.dedupeGroup)) return false;
      seen.add(finding.dedupeGroup);
      return true;
    })
    .slice(0, limit);
}

function quickWinsFrom(findings) {
  const seen = new Set();
  return findings
    .map(rankFinding)
    .filter(finding => finding.confidence >= 0.9 && finding.severity >= 3 && finding.ranking.reach >= 3 && finding.ranking.effort <= 2)
    .sort((a, b) => b.ranking.score - a.ranking.score || a.code.localeCompare(b.code))
    .filter(finding => {
      if (seen.has(finding.dedupeGroup)) return false;
      seen.add(finding.dedupeGroup);
      return true;
    })
    .slice(0, 3)
    .map(finding => ({
      ...finding,
      quickWinReason: `High-confidence evidence, estimated effort ${finding.ranking.effort}/5, and business impact ${finding.severity}/5.`
    }));
}

function scoreDeduction(findings) {
  const strongestPenaltyByGroup = new Map();
  for (const finding of findings) {
    const profile = PROFILE[finding.code] || { group: finding.code };
    const penalty = Math.pow(finding.severity, 1.5) * 1.1 * finding.confidence;
    strongestPenaltyByGroup.set(
      profile.group,
      Math.max(strongestPenaltyByGroup.get(profile.group) || 0, penalty)
    );
  }
  return [...strongestPenaltyByGroup.values()].reduce((total, penalty) => total + penalty, 0);
}

function implementationOptionsFrom(findings) {
  return findings.map(finding => ({
    code: finding.code,
    title: finding.title,
    service: finding.service
  }));
}

export function buildReport(crawl, findings = [], context = {}) {
  const degradedCrawl = Array.isArray(crawl?.errors) && crawl.errors.length > 0;
  const clean = (findings || [])
    .map(sanitizeFinding)
    .filter(Boolean)
    .filter(finding => finding.safeForOutreach && finding.confidence >= MIN_CUSTOMER_CONFIDENCE)
    .filter(finding => hasVerifiedVerticalContext(finding, context))
    .filter(finding => !(degradedCrawl && DEGRADED_CRAWL_ABSENCE_CODES.has(finding.code)))
    .slice(0, 12)
    .map(publicFinding);
  const priorities = distinctRanked(clean, 3);
  const quickWins = quickWinsFrom(clean);
  const deduction = scoreDeduction(clean);
  const score = clean.length ? Math.max(15, Math.min(94, Math.round(96 - deduction))) : 96;
  const grade = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs work' : 'Critical gaps';
  const summary = {
    grade,
    pagesVisited: crawl?.summary?.pagesVisited ?? crawl?.pages?.length ?? 0,
    pageErrors: crawl?.errors?.length || 0,
    findingCount: clean.length,
    priorityCount: priorities.length,
    quickWinCount: quickWins.length,
    topFixes: priorities.map(finding => finding.title),
    implementationOptions: implementationOptionsFrom(clean),
    priorities,
    quickWins,
    engine: crawl?.engine || 'playwright',
    evidencePolicy: 'validated_typed_evidence_only',
    eligibilityPolicy: 'safe_confidence_0.72_verified_context',
    degradedCrawlPolicy: degradedCrawl ? 'absence_findings_suppressed' : 'complete_observation',
    scorePolicy: 'base_96_minus_strongest_confidence_weighted_severity_penalty_per_problem_family',
    scoreFormula: 'penalty = severity^1.5 × 1.1 × confidence; overlapping findings share one maximum family penalty',
    scoreDeduction: Number(deduction.toFixed(2)),
    scoredProblemFamilies: new Set(clean.map(finding => (PROFILE[finding.code] || { group: finding.code }).group)).size,
    screenshotPolicy: 'ephemeral_not_retained',
    generatedAt: new Date().toISOString()
  };
  return { score, grade, summary, findings: clean, priorities, quickWins };
}
