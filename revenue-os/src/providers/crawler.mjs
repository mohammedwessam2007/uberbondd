// Safe website check runner's data source (workstream 10). "Safe" means: every fetch is a plain
// GET-shaped page load; nothing here ever submits a form, attempts a login, tests a credential, or
// runs any vulnerability-testing-shaped probe. The fake provider makes no real network call at all
// -- deterministic, hash-derived synthetic pages -- and the replay provider plays back a fixed
// scripted sequence for regression tests. There is no real-network implementation in this package.
import crypto from 'node:crypto';

export const CRAWLER_CONTRACT = Object.freeze(['name', 'fetchPage']);
export function assertCrawlerContract(provider) {
  if (typeof provider?.name !== 'string') throw new Error('crawler provider missing name');
  if (typeof provider?.fetchPage !== 'function') throw new Error('crawler provider missing fetchPage');
  return true;
}

function hashPick(seed, options) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return options[hash.readUInt32BE(0) % options.length];
}

export function createFakeCrawlerProvider(overrides = {}) {
  const calls = [];
  return {
    name: 'fake',
    async fetchPage(url) {
      calls.push(url);
      const key = Object.keys(overrides).find(k => url.includes(k));
      const override = key ? overrides[key] : {};
      const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      const seed = `${url}`;
      const defaults = {
        ok: true, status: 200, finalUrl: url.startsWith('https://') ? url : url.replace(/^http:\/\//, 'https://'),
        html: `<!doctype html><html><head><title>${host}</title></head><body><a href="tel:+15555550100">Call</a><a href="mailto:hello@${host}">Email</a><a href="/contact">Contact</a><form action="/contact"><input name="email"></form><a href="https://calendly.com/${host}">Book</a><a href="/pricing">Pricing</a></body></html>`,
        headers: {}, tls: { valid: true, expiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString() },
        screenshotHash: hashPick(seed, ['hashA', 'hashB', 'hashC', 'hashD']),
        mobileScreenshotHash: hashPick(seed + 'mobile', ['mhashA', 'mhashB', 'mhashC']),
        responseTimeMs: 150 + (crypto.createHash('sha256').update(seed).digest()[0] % 300),
        redirectChain: [], internalLinks: ['/contact', '/pricing']
      };
      return { ...defaults, ...override };
    },
    _debug: { calls }
  };
}

export function createReplayCrawlerProvider(scriptedPages = []) {
  let cursor = 0;
  const calls = [];
  return {
    name: 'replay',
    async fetchPage(url) {
      calls.push(url);
      const page = scriptedPages[cursor] || { ok: false, status: 0, finalUrl: url, html: '', headers: {}, tls: { valid: false }, screenshotHash: '', mobileScreenshotHash: '', responseTimeMs: 0, redirectChain: [], internalLinks: [] };
      cursor += 1;
      return { ...page, finalUrl: page.finalUrl || url };
    },
    _debug: { calls, cursor: () => cursor }
  };
}
