import { normalizeDomain, uniq } from './utils.mjs';

const PARKED_PAGE = /\b(?:this domain (?:is|may be) for sale|buy this domain|domain (?:is )?parked|sedo domain parking|afternic|hugedomains|parkingcrew|domainmarket)\b/i;
const ACCESS_CHALLENGE = /\b(?:verify you are human|checking your browser|attention required|captcha|access denied|enable javascript and cookies to continue)\b/i;
const LOW_EFFORT_CODES = new Set(['missing-title', 'thin-title', 'missing-description', 'missing-h1', 'excessive-h1', 'noindex', 'missing-alt', 'broken-links']);
const HIGH_EFFORT_CATEGORIES = new Set(['Localization', 'Positioning']);

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return ''; }
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pageCorpus(page = {}) {
  return normalizedText([
    page.title,
    page.description,
    ...(page.headings || []).map(heading => heading.text),
    ...(page.visibleH1 || []),
    page.bodyText
  ].join(' '));
}

export class CrawlProcessingError extends Error {
  constructor(message, { category = 'unknown', retryable = true, detail = {} } = {}) {
    super(message);
    this.name = 'CrawlProcessingError';
    this.category = category;
    this.retryable = retryable;
    this.detail = detail;
  }
}

export function classifyCrawlFailure(input = {}) {
  const message = String(input?.message || input?.error || input || '').slice(0, 1000);
  const status = Number(input?.status || 0);
  if (input?.category) return { category: input.category, retryable: input.retryable !== false, message };
  if (/blocked_by_robots|robots disallow/i.test(message)) return { category: 'robots_disallowed', retryable: false, message: 'Public crawling is disallowed by robots policy' };
  if (/cross[_ -]?(?:site|origin)|redirected to (?:another|different) domain/i.test(message)) return { category: 'cross_domain_redirect', retryable: false, message: 'Website redirected outside the business domain' };
  if (/private|reserved ip|metadata|local address|embedded credentials|only http/i.test(message)) return { category: 'unsafe_target', retryable: false, message: 'Website target failed the public-network safety gate' };
  if (status === 408 || status === 425 || status === 429) return { category: 'http_retryable', retryable: true, message: `Website returned HTTP ${status}` };
  if (status >= 500) return { category: 'http_server_error', retryable: true, message: `Website returned HTTP ${status}` };
  if (status >= 400) return { category: 'http_client_error', retryable: false, message: `Website returned HTTP ${status}` };
  if (/timeout|timed out|exceeded .*runtime/i.test(message)) return { category: 'timeout', retryable: true, message: 'Website crawl timed out' };
  if (/enotfound|eai_again|name not resolved|dns|connection refused|econn|socket|network/i.test(message)) return { category: 'network_failure', retryable: true, message: 'Website could not be reached reliably' };
  if (/browser.*(?:closed|crash)|target page.*closed|executable.*doesn.t exist/i.test(message)) return { category: 'browser_failure', retryable: true, message: 'Browser worker failed during the crawl' };
  return { category: 'crawl_failure', retryable: true, message: message || 'Website crawl failed' };
}

export function crawlErrorRecord(input = {}, extra = {}) {
  const classified = classifyCrawlFailure(input);
  return {
    ...extra,
    category: classified.category,
    retryable: classified.retryable,
    error: classified.message
  };
}

export function assessCrawlQuality(crawl = {}, options = {}) {
  const pages = Array.isArray(crawl.pages) ? crawl.pages : [];
  const errors = Array.isArray(crawl.errors) ? crawl.errors : [];
  const home = pages[0] || null;
  const minimumTextLength = Math.max(20, Number(options.minimumTextLength || 80));
  const bodyTextLength = pages.reduce((sum, page) => sum + String(page.bodyText || '').trim().length, 0);
  const combined = `${home?.title || ''} ${home?.bodyText || ''}`;
  const parked = Boolean(home && bodyTextLength < 2500 && PARKED_PAGE.test(combined));
  const accessChallenge = Boolean(home && bodyTextLength < 3000 && ACCESS_CHALLENGE.test(combined));
  const unreliableRender = Boolean(home && (home.renderQuality?.degraded === true || home.renderQuality?.reliable === false));
  const categorizedErrors = errors.map(error => classifyCrawlFailure(error));
  const retryableErrors = categorizedErrors.filter(error => error.retryable).length;
  const errorRatio = errors.length / Math.max(1, pages.length + errors.length);
  const reasons = [];
  if (!pages.length) reasons.push('no_usable_pages');
  if (bodyTextLength < minimumTextLength) reasons.push('insufficient_rendered_text');
  if (unreliableRender) reasons.push('unreliable_homepage_render');
  if (parked) reasons.push('parked_domain');
  if (accessChallenge) reasons.push('access_challenge');
  if (errorRatio > 0.75) reasons.push('crawl_mostly_failed');

  let score = 100;
  if (!pages.length) score -= 100;
  if (bodyTextLength < minimumTextLength) score -= 35;
  if (unreliableRender) score -= 35;
  if (parked || accessChallenge) score -= 100;
  score -= Math.min(30, Math.round(errorRatio * 30));
  score = Math.max(0, Math.min(100, score));
  const minimumScore = Math.max(0, Math.min(100, Number(options.minimumScore ?? 60)));
  const credible = pages.length > 0 && reasons.length === 0 && score >= minimumScore;
  const status = credible ? (errors.length ? 'partial' : 'complete') : 'rejected';
  const primaryFailure = parked
    ? { category: 'parked_domain', retryable: false }
    : accessChallenge
      ? { category: 'access_challenge', retryable: true }
      : categorizedErrors[0] || { category: reasons[0] || 'low_quality_crawl', retryable: retryableErrors > 0 };
  return {
    credible,
    status,
    score,
    reasons: uniq(reasons),
    pagesVisited: pages.length,
    errors: errors.length,
    errorRatio: Number(errorRatio.toFixed(2)),
    bodyTextLength,
    renderReliable: !unreliableRender,
    retryable: !credible && primaryFailure.retryable === true,
    failureCategory: credible ? '' : primaryFailure.category
  };
}

function impactFor(finding) {
  const severity = Number(finding.severity || 0);
  return severity >= 4 ? 'high' : severity >= 3 ? 'medium' : 'low';
}

function effortFor(finding) {
  if (LOW_EFFORT_CODES.has(finding.code)) return 'low';
  if (HIGH_EFFORT_CATEGORIES.has(finding.category)) return 'high';
  return 'medium';
}

export function validateFindingEvidence(finding, crawl, options = {}) {
  const confidence = Number(finding?.confidence || 0);
  const minimumConfidence = Math.max(0, Math.min(1, Number(options.minimumConfidence ?? 0.65)));
  if (!finding || confidence < minimumConfidence) return { valid: false, reason: 'confidence_below_threshold' };
  const evidenceUrl = canonicalUrl(finding.evidenceUrl || finding.evidence?.url);
  const page = (crawl.pages || []).find(candidate => canonicalUrl(candidate.url) === evidenceUrl);
  if (!evidenceUrl || !page) return { valid: false, reason: 'evidence_page_not_crawled' };
  if (normalizeDomain(evidenceUrl) !== normalizeDomain(crawl.startUrl || crawl.domain)) return { valid: false, reason: 'evidence_domain_mismatch' };
  const excerpt = String(finding.evidenceExcerpt || finding.evidence?.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 320);
  if (excerpt.length < 8) return { valid: false, reason: 'evidence_excerpt_missing' };
  if (options.requireExcerptMatch && !pageCorpus(page).includes(normalizedText(excerpt))) {
    return { valid: false, reason: 'evidence_excerpt_not_found' };
  }
  const evidence = finding.evidence && typeof finding.evidence === 'object'
    ? { ...finding.evidence, url: evidenceUrl }
    : { type: 'page_observation', url: evidenceUrl, excerpt };
  if (!String(evidence.type || '').trim()) return { valid: false, reason: 'evidence_type_missing' };
  const screenshotReference = page.screenshots?.desktop || page.screenshots?.mobile || '';
  return {
    valid: true,
    finding: {
      ...finding,
      confidence: Number(confidence.toFixed(2)),
      evidenceUrl,
      evidenceExcerpt: excerpt,
      evidence,
      screenshots: page.screenshots || {},
      screenshotReference,
      estimatedImpact: finding.estimatedImpact || impactFor(finding),
      estimatedEffort: finding.estimatedEffort || effortFor(finding),
      evidenceValidation: {
        valid: true,
        method: options.requireExcerptMatch ? 'exact-crawled-page-excerpt-v1' : 'typed-crawled-page-evidence-v1'
      }
    }
  };
}

export function validateAuditEvidence(findings, crawl, options = {}) {
  const accepted = [];
  const rejected = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    const result = validateFindingEvidence(finding, crawl, options);
    if (result.valid) accepted.push(result.finding);
    else rejected.push({ code: String(finding?.code || ''), reason: result.reason });
  }
  return { accepted, rejected };
}

export function noUsableCrawlError(crawl, quality = assessCrawlQuality(crawl)) {
  const first = (crawl.errors || [])[0] || {};
  const classified = quality.failureCategory
    ? { category: quality.failureCategory, retryable: quality.retryable }
    : classifyCrawlFailure(first);
  return new CrawlProcessingError(`Website qualification failed: ${classified.category}`, {
    category: classified.category,
    retryable: classified.retryable,
    detail: { qualityScore: quality.score, reasons: quality.reasons }
  });
}
