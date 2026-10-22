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
import { normalizeTelHref, phonesInText } from './inquiry-path-coherence.mjs';
import { PROBE_USER_AGENT } from './inquiry-path-probe.mjs';

export const INQUIRY_PATH_RUNTIME_WITNESS_VERSION = 'uberbond.inquiry-path-runtime-witness-1.0.0';

/** Pure: turn raw DOM anchor readings into the same shape the static engine uses. */
export function normalizeRuntimeTelLinks(anchors = []) {
  return anchors
    .filter(anchor => /^tel:/i.test(String(anchor.href ?? '')))
    .map(anchor => ({ href: String(anchor.href).slice(0, 120), anchorText: String(anchor.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160), normalized: normalizeTelHref(anchor.href), textPhones: phonesInText(anchor.text).map(phone => phone.key) }));
}

export async function witnessRuntimeTelLinks({ urls = [], settleMs = 4000, launch = options => chromium.launch(options), now = () => new Date() } = {}) {
  const executablePath = process.env.CHROMIUM_PATH || resolveChromium() || undefined;
  // The Chromium sandbox stays on unless the process runs as root, where Chromium cannot start without it.
  const browser = await launch({ headless: true, executablePath, args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-dev-shm-usage'] });
  const witness = {};
  const ledger = { pageLoads: 0, blockedRequests: 0, clicks: 0, formSubmissions: 0, messages: 0 };
  try {
    // Service workers and WebSockets bypass context.route, so neither is allowed.
    const context = await browser.newContext({ userAgent: PROBE_USER_AGENT, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    if (context.routeWebSocket) await context.routeWebSocket(/.*/, ws => { ledger.blockedRequests += 1; ws.close(); });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (!/^https?:/i.test(url)) return route.continue();
      try { await assertPublicUrl(url); return route.continue(); }
      catch { ledger.blockedRequests += 1; return route.abort('blockedbyclient'); }
    });
    for (const url of urls) {
      const page = await context.newPage();
      try {
        ledger.pageLoads += 1;
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(settleMs);
        const anchors = await page.$$eval('a[href^="tel:" i]', nodes => nodes.map(node => ({ href: node.getAttribute('href'), text: node.innerText || node.getAttribute('aria-label') || '' })));
        witness[url] = { status: response?.status() ?? null, observedAt: now().toISOString(), viewport: 'mobile-390x844', telLinks: normalizeRuntimeTelLinks(anchors) };
      } catch (error) {
        witness[url] = { status: null, observedAt: now().toISOString(), error: String(error?.name ?? 'error'), telLinks: null };
      } finally { await page.close(); }
    }
    await context.close();
  } finally { await browser.close(); }
  return { version: INQUIRY_PATH_RUNTIME_WITNESS_VERSION, witness, ledger };
}
