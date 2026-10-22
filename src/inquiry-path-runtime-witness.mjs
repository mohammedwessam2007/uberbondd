// Runtime witness for the Inquiry Path Coherence Engine.
//
// The static engine reads the HTML a server delivers. Call-tracking scripts
// can rewrite phone numbers after that, so a static mismatch on a site that
// loads one is only a question. This witness loads the same page in headless
// Chromium as a direct visitor, lets its scripts run, and records what the tap
// targets and their labels are *after* runtime. A mismatch both witnesses saw
// is no longer a question.
//
// Read-only: it navigates and reads the DOM. It does not click, type, submit,
// accept cookies, or follow anything; every request is checked against the
// public-address guard so a hostile page cannot point the browser inward.

import { chromium } from 'playwright';
import { resolveChromium } from './resolve-chromium.mjs';
import { assertPublicUrl } from './security.mjs';
import { fetchPublicPinned } from './inquiry-public-http.mjs';
import { boundedSignal, abortable } from './inquiry-probe-budget.mjs';
import { normalizeTelHref, phonesInText } from './inquiry-path-coherence.mjs';
import { PROBE_USER_AGENT } from './inquiry-path-probe.mjs';

export const INQUIRY_PATH_RUNTIME_WITNESS_VERSION = 'uberbond.inquiry-path-runtime-witness-1.0.0';
// A hostile page may schedule a request storm with ordinary GETs. Bound all
// intercepted requests, including blocked resources and tracking beacons.
export const MAX_WITNESS_REQUESTS = 96;
// Intercepting network requests through Node does not remove the need for a
// bounded socket fanout and cumulative traffic ceiling. A script can launch
// many *public* GETs before the 96-request counter trips.
export const MAX_WITNESS_INFLIGHT_REQUESTS = 8;
export const MAX_WITNESS_RESPONSE_BYTES = 24_000_000;

/** Pure: turn raw DOM anchor readings into the same shape the static engine uses. */
export function normalizeRuntimeTelLinks(anchors = []) {
  return anchors
    .filter(anchor => /^tel:/i.test(String(anchor.href ?? '')))
    .map(anchor => ({ href: String(anchor.href).slice(0, 120), anchorText: String(anchor.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160), normalized: normalizeTelHref(anchor.href), textPhones: phonesInText(anchor.text).map(phone => phone.key) }));
}

export async function witnessRuntimeTelLinks({ urls = [], settleMs = 1250, signal = null, maxWitnessMs = 25000, launch = options => chromium.launch(options), fetchPinned = fetchPublicPinned, now = () => new Date() } = {}) {
  const deadline = boundedSignal(signal, maxWitnessMs);
  if (urls.length > 8) throw Error('BROWSER_PAGE_LIMIT_EXCEEDED');
  if (urls.some(url => !/^https?:\/\//i.test(url))) throw Error('UNSAFE_BROWSER_NAVIGATION_SCHEME');
  const executablePath = process.env.CHROMIUM_PATH || resolveChromium() || undefined;
  // The Chromium sandbox stays on unless the process runs as root, where Chromium cannot start without it.
  const browser = await abortable(launch({ headless: true, executablePath, args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-dev-shm-usage', '--disable-features=WebRTC'] }), deadline);
  const witness = {};
  const ledger = { pageLoads: 0, routeRequests: 0, blockedRequests: 0, requestBudgetExceeded: false, inflightRequests: 0, peakInflightRequests: 0, responseBytes: 0, popupsClosed: 0, clicks: 0, formSubmissions: 0, messages: 0 };
  try {
    // Service workers and WebSockets bypass context.route, so neither is allowed.
    const context = await abortable(browser.newContext({ userAgent: PROBE_USER_AGENT, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: false }), deadline);
    if (context.routeWebSocket) await context.routeWebSocket(/.*/, ws => { ledger.blockedRequests += 1; ws.close(); });
    await context.route('**/*', async route => {
      ledger.routeRequests += 1;
      if (ledger.requestBudgetExceeded || ledger.routeRequests > MAX_WITNESS_REQUESTS) {
        ledger.requestBudgetExceeded = true;
        ledger.blockedRequests += 1;
        return route.abort('blockedbyclient');
      }
      const request = route.request();
      const url = request.url();
      // The browser never establishes its own outbound network connection:
      // every network response is fetched by pinned-IP, GET-only Node code.
      if (deadline.aborted || request.method() !== 'GET' || !/^https?:/i.test(url)) {
        ledger.blockedRequests += 1; return route.abort('blockedbyclient');
      }
      if (['image', 'media', 'font', 'other'].includes(request.resourceType())) {
        ledger.blockedRequests += 1; return route.abort('blockedbyclient');
      }
      // Admission is synchronous, before any await, so parallel JS requests
      // cannot all pass a stale concurrency check and then flood the socket pool.
      if (ledger.inflightRequests >= MAX_WITNESS_INFLIGHT_REQUESTS) {
        ledger.requestBudgetExceeded = true;
        ledger.blockedRequests += 1;
        return route.abort('blockedbyclient');
      }
      ledger.inflightRequests += 1;
      ledger.peakInflightRequests = Math.max(ledger.peakInflightRequests, ledger.inflightRequests);
      try {
        await abortable(assertPublicUrl(url), deadline);
        // The injected fetch is a test seam; production always uses pinned-IP
        // read-only transport, and the public-address guard is never injected.
        const response = await fetchPinned(url, { signal: deadline });
        const body = await abortable(response.text(), deadline);
        ledger.responseBytes += Buffer.byteLength(body, 'utf8');
        if (ledger.responseBytes > MAX_WITNESS_RESPONSE_BYTES || ledger.requestBudgetExceeded) {
          ledger.requestBudgetExceeded = true;
          ledger.blockedRequests += 1;
          return route.abort('blockedbyclient');
        }
        const contentType = response.headers.get('content-type') ?? 'text/plain';
        return await route.fulfill({ status: response.status, contentType, body });
      } catch {
        ledger.blockedRequests += 1;
        return route.abort('blockedbyclient').catch(() => {});
      } finally {
        ledger.inflightRequests -= 1;
      }
    });
    for (const url of urls) {
      if (deadline.aborted || process.memoryUsage().rss > 750_000_000) throw Error('BROWSER_RESOURCE_BUDGET_EXCEEDED');
      await abortable(assertPublicUrl(url), deadline);
      const page = await abortable(context.newPage(), deadline);
      try {
        // Unexpected script-created tabs are not part of the approved audit.
        // Closing is best-effort; context-wide routing still gates their GETs.
        page.on?.('popup', popup => { ledger.popupsClosed += 1; void popup.close().catch(() => {}); });
        ledger.pageLoads += 1;
        const response = await abortable(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 }), deadline);
        await abortable(page.waitForTimeout(Math.min(settleMs, 2000)), deadline);
        if (ledger.requestBudgetExceeded) throw Error('NETWORK_REQUEST_LIMIT_EXCEEDED');
        const anchors = await abortable(page.$$eval('a[href^="tel:" i]', nodes => nodes.map(node => ({ href: node.getAttribute('href'), text: node.innerText || node.getAttribute('aria-label') || '' }))), deadline);
        if (ledger.requestBudgetExceeded) throw Error('NETWORK_REQUEST_LIMIT_EXCEEDED');
        witness[url] = { status: response?.status() ?? null, observedAt: now().toISOString(), viewport: 'mobile-390x844', telLinks: normalizeRuntimeTelLinks(anchors) };
      } catch (error) {
        witness[url] = { status: null, observedAt: now().toISOString(), error: ledger.requestBudgetExceeded ? 'NETWORK_REQUEST_LIMIT_EXCEEDED' : String(error?.name ?? 'error'), telLinks: null };
      } finally { await page.close().catch(() => {}); }
    }
    await context.close().catch(() => {});
  } finally { await browser.close().catch(() => {}); }
  return { version: INQUIRY_PATH_RUNTIME_WITNESS_VERSION, witness, ledger };
}
