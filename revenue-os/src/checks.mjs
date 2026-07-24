// Safe website check runner (workstream 10). All 18 mission-named checks as pure functions over
// an already-fetched page (from providers/crawler.mjs). None of them submit a form, test a
// credential, exploit a vulnerability, load-test, or alter the site -- every check is a read of
// content already fetched via a plain GET-shaped fetchPage call.
export const CHECK_KEYS = Object.freeze([
  'reachability', 'https_certificate', 'redirects', 'phone_link', 'email_link', 'contact_link',
  'booking_link', 'form_presence', 'form_action_availability', 'cta_presence', 'noindex_robots',
  'title_meta', 'broken_internal_links', 'visual_regression', 'mobile_viewport_rendering',
  'response_time_regression', 'configured_element_presence', 'baseline_drift'
]);

const TEL_RE = /href=["']tel:/i;
const MAILTO_RE = /href=["']mailto:/i;
const CONTACT_HREF_RE = /href=["'][^"']*\/contact/i;
const FORM_RE = /<form\b[^>]*action=["']([^"']*)["']/i;
const BOOKING_HREF_RE = /href=["']([^"']*(?:calendly\.com|acuityscheduling\.com|squareup\.com\/appointments|setmore\.com)[^"']*)["']/i;
const TITLE_RE = /<title>([^<]*)<\/title>/i;
const CTA_WORDS_RE = /\b(book now|get a quote|schedule|contact us|call now|buy now|sign up|get started)\b/i;

function pass(detail = {}) { return { status: 'passed', detail }; }
function fail(code, detail = {}) { return { status: 'failed', detail: { code, ...detail } }; }
function errored(code, detail = {}) { return { status: 'error', detail: { code, ...detail } }; }

const CHECK_RUNNERS = {
  reachability: page => (page.ok && page.status < 500) ? pass({ status: page.status }) : fail('unreachable', { status: page.status }),
  https_certificate: page => {
    if (!String(page.finalUrl || '').startsWith('https://')) return fail('not-https', { finalUrl: page.finalUrl });
    if (!page.tls?.valid) return fail('certificate-invalid');
    const daysLeft = (Date.parse(page.tls.expiresAt || 0) - Date.now()) / 86400000;
    return daysLeft > 14 ? pass({ daysLeft: Math.round(daysLeft) }) : fail('certificate-expiring-soon', { daysLeft: Math.round(daysLeft) });
  },
  redirects: (page, context = {}) => {
    const maxRedirects = Number(context.maxRedirects ?? 3);
    return (page.redirectChain || []).length > maxRedirects ? fail('excessive-redirects', { count: page.redirectChain.length }) : pass({ redirectCount: (page.redirectChain || []).length });
  },
  phone_link: page => TEL_RE.test(page.html || '') ? pass() : fail('no-phone-link'),
  email_link: page => MAILTO_RE.test(page.html || '') ? pass() : fail('no-email-link'),
  contact_link: page => CONTACT_HREF_RE.test(page.html || '') ? pass() : fail('no-contact-link'),
  booking_link: page => BOOKING_HREF_RE.test(page.html || '') ? pass({ present: true }) : pass({ present: false }), // absence is not itself a failure
  form_presence: page => FORM_RE.test(page.html || '') ? pass() : fail('no-form-found'),
  // "without submission": only re-fetches the form's declared action URL as a plain GET load --
  // never constructs or sends form-encoded POST data.
  form_action_availability: async (page, context, crawler) => {
    const match = FORM_RE.exec(page.html || '');
    if (!match) return errored('no-form-to-check');
    const actionUrl = new URL(match[1] || page.finalUrl, page.finalUrl).href;
    const target = await crawler.fetchPage(actionUrl);
    return (target.ok && target.status < 500) ? pass({ actionUrl, status: target.status }) : fail('form-action-unavailable', { actionUrl, status: target.status });
  },
  cta_presence: page => CTA_WORDS_RE.test(page.html || '') ? pass() : fail('no-cta-detected'),
  noindex_robots: (page, context) => {
    const noindexNow = /noindex/i.test(page.headers?.['x-robots-tag'] || '') || /name=["']robots["'][^>]*noindex/i.test(page.html || '');
    const noindexBaseline = Boolean(context?.baseline?.noindex);
    return noindexNow === noindexBaseline ? pass({ noindex: noindexNow }) : fail('robots-noindex-changed', { was: noindexBaseline, now: noindexNow });
  },
  title_meta: (page, context) => {
    const titleNow = (TITLE_RE.exec(page.html || '') || [, ''])[1].trim();
    const titleBaseline = context?.baseline?.title;
    if (titleBaseline === undefined) return pass({ title: titleNow, baselineEstablished: false });
    return titleNow === titleBaseline ? pass({ title: titleNow }) : fail('title-changed', { was: titleBaseline, now: titleNow });
  },
  broken_internal_links: async (page, context, crawler) => {
    const links = page.internalLinks || [];
    if (!links.length) return pass({ checked: 0 });
    const broken = [];
    for (const link of links.slice(0, 10)) { // bounded -- never an unbounded crawl
      const target = await crawler.fetchPage(new URL(link, page.finalUrl).href);
      if (!target.ok || target.status >= 400) broken.push({ link, status: target.status });
    }
    return broken.length === 0 ? pass({ checked: links.length }) : fail('broken-internal-links', { broken });
  },
  visual_regression: (page, context) => {
    const baselineHash = context?.baseline?.screenshotHash;
    if (!baselineHash) return pass({ baselineEstablished: false });
    if (!page.screenshotHash) return errored('no-screenshot-captured');
    return page.screenshotHash === baselineHash ? pass() : fail('visual-hash-changed', { was: baselineHash, now: page.screenshotHash });
  },
  mobile_viewport_rendering: page => page.mobileScreenshotHash ? pass({ mobileScreenshotHash: page.mobileScreenshotHash }) : errored('no-mobile-render-captured'),
  response_time_regression: (page, context) => {
    const baselineMs = context?.baseline?.responseTimeMs;
    if (!Number.isFinite(baselineMs)) return pass({ responseTimeMs: page.responseTimeMs, baselineEstablished: false });
    const multiplier = Number(context?.regressionMultiplier ?? 3);
    return page.responseTimeMs <= baselineMs * multiplier ? pass({ responseTimeMs: page.responseTimeMs, baselineMs }) : fail('response-time-regression', { responseTimeMs: page.responseTimeMs, baselineMs });
  },
  configured_element_presence: (page, context) => {
    const expectedText = context?.expectedText;
    if (!expectedText) return errored('no-element-configured');
    return String(page.html || '').includes(expectedText) ? pass({ expectedText }) : fail('configured-element-missing', { expectedText });
  },
  baseline_drift: (page, context) => {
    const baseline = context?.baseline;
    if (!baseline) return pass({ baselineEstablished: false });
    const drifted = [];
    if (baseline.title !== undefined && (TITLE_RE.exec(page.html || '') || [, ''])[1].trim() !== baseline.title) drifted.push('title');
    if (baseline.screenshotHash && page.screenshotHash && baseline.screenshotHash !== page.screenshotHash) drifted.push('screenshotHash');
    if (Number.isFinite(baseline.responseTimeMs) && page.responseTimeMs > baseline.responseTimeMs * 3) drifted.push('responseTimeMs');
    return drifted.length === 0 ? pass({ driftedFields: [] }) : fail('baseline-drift', { driftedFields: drifted });
  }
};

export class CheckEngineError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CheckEngineError';
    this.code = code;
  }
}

export async function runCheck(checkKey, page, context = {}, crawler = null) {
  const runner = CHECK_RUNNERS[checkKey];
  if (!runner) throw new CheckEngineError('unknown-check-key', checkKey);
  return runner(page, context, crawler);
}

export async function runChecksForPage(page, { checkKeys = CHECK_KEYS, context = {}, crawler = null } = {}) {
  const results = [];
  for (const checkKey of checkKeys) results.push({ checkKey, ...(await runCheck(checkKey, page, context, crawler)) });
  return results;
}
