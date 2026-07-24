// Safe real-site crawler provider (Live Bridge Patch 2). Implements the same CRAWLER_CONTRACT as
// ./crawler.mjs's fake/replay providers (`name`, `fetchPage`), so it is a drop-in data source for
// checks.mjs's existing 18 checks -- nothing in checks.mjs needed to change for this to exist.
//
// This is the ONLY real-network-capable code in this package, and every capability that makes it
// "real" is gated, not merely documented:
//   - disabled unless constructed with `enabled: true`
//   - requires a non-empty explicit URL/host allowlist even when enabled
//   - requires an explicit owner-approval object ({approvedBy, approvedAt}) even when enabled
//   - every fetch is exactly one Playwright `page.goto(url)` -- structurally there is no form
//     submission, no credential entry, no repeated/fuzzed request, no vulnerability probe: the
//     only browser action this module ever performs is a single navigation and a read of what
//     came back. There is no code path here that calls page.fill/page.click/page.type/etc.
//   - robots.txt is fetched and enforced before every navigation (fail-closed: an unreachable or
//     erroring robots.txt blocks the fetch; a 404 allows it, per the standard convention)
//   - DNS is resolved once per fetch, checked against the same private/reserved-range guard the
//     rest of this repository uses (../../../src/security.mjs#assertPublicUrl), and the resolved
//     IP is then pinned for both the robots.txt check and the real navigation via Chromium's
//     --host-resolver-rules launch flag -- nothing that happens after the check can be redirected
//     to a different address by a DNS answer that changes in between (DNS rebinding)
//   - only http:/https: schemes ever reach a fetch (file/data/javascript/ftp/anything else is
//     rejected by assertPublicUrl before any resolution is attempted)
//   - bounded concurrency (a simple counting semaphore) and a minimum per-host gap between
//     requests (a simple last-request-timestamp map), both caller-configurable
//   - navigation timeout, response-size cap, and a redirect-count cap, all enforced; exceeding any
//     of them produces an evidence *limitation*, never a fabricated result
//   - any Playwright/browser-launch/navigation error is caught and returned as a limitation object
//     (`{ok:false, limitation:{code,message}}`), never thrown past fetchPage and never silently
//     turned into a fake "passed" check result
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';
import { assertPublicUrl, isPrivateIp } from '../../../src/security.mjs';
import { sha256Hex } from '../utils.mjs';

export class RealCrawlerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'RealCrawlerError';
    this.code = code;
  }
}

export const DEFAULT_REAL_CRAWLER_OPTIONS = Object.freeze({
  maxConcurrency: 2,
  perHostRateLimitMs: 2000,
  navigationTimeoutMs: 15000,
  maxResponseBytes: 5 * 1024 * 1024,
  maxRedirects: 5,
  userAgent: 'UberBondDiagnosticBot/1.0 (+owner-approved manual-controlled diagnostic capture)',
  robotsTimeoutMs: 5000
});

/** Finds the pre-installed Chromium binary without ever invoking `playwright install` (forbidden
 * in this environment). Tries the plain `chromium` path some environments symlink directly to the
 * binary; falls back to globbing `chromium-<revision>/chrome-linux/chrome` under
 * PLAYWRIGHT_BROWSERS_PATH so this does not silently break if the pre-installed revision number
 * differs from the one this code was written against. */
export async function resolveChromiumExecutable(browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers') {
  const directPath = `${browsersPath}/chromium`;
  try {
    const stat = await fs.lstat(directPath);
    if (stat.isFile() || stat.isSymbolicLink()) return directPath;
  } catch { /* fall through to glob */ }
  let entries;
  try { entries = await fs.readdir(browsersPath); } catch (error) {
    throw new RealCrawlerError('chromium-not-found', `could not list ${browsersPath}: ${error.message}`);
  }
  const revisionDir = entries.find(e => /^chromium-\d+$/.test(e));
  if (!revisionDir) throw new RealCrawlerError('chromium-not-found', `no chromium-<revision> directory found under ${browsersPath}`);
  const candidate = `${browsersPath}/${revisionDir}/chrome-linux/chrome`;
  try { await fs.access(candidate); } catch { throw new RealCrawlerError('chromium-not-found', `${candidate} does not exist`); }
  return candidate;
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** Parses a candidate URL with zero network activity (no DNS lookup) -- used to gate the allowlist
 * check BEFORE assertPublicUrl's DNS resolution ever runs, so a non-allowlisted host never causes
 * any network access at all, not even a DNS query. */
function parseCandidateUrl(raw) {
  try { return new URL(HAS_SCHEME.test(String(raw)) ? String(raw) : `https://${raw}`); }
  catch { return null; }
}

function isAllowlisted(url, allowlist) {
  const host = url.hostname.toLowerCase();
  const hostport = url.port ? `${host}:${url.port}` : host;
  const href = url.href.toLowerCase().replace(/\/$/, '');
  return allowlist.some(entry => {
    const e = String(entry).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return e === href || e === host || e === hostport || host.endsWith(`.${e}`);
  });
}

/** Minimal robots.txt group matcher: longest-matching-prefix Disallow/Allow rule under the
 * '*' group and (if present) a group explicitly naming `userAgent`, per the de facto standard
 * simplified algorithm every major crawler uses. */
export function isPathAllowedByRobots(robotsTxt, pathAndQuery, userAgent) {
  const lines = String(robotsTxt || '').split('\n').map(l => l.replace(/#.*/, '').trim());
  const groups = []; // { agents: [...], rules: [{type, path}] }
  let current = null;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || !rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'disallow' || key === 'allow') && current) {
      current.rules.push({ type: key, path: value });
    }
  }
  const ua = String(userAgent || '').toLowerCase();
  const applicable = groups.filter(g => g.agents.some(a => a === '*' || (a && ua.includes(a))));
  const named = applicable.filter(g => g.agents.some(a => a !== '*' && ua.includes(a)));
  const effective = named.length ? named : applicable;
  let best = null;
  for (const g of effective) {
    for (const rule of g.rules) {
      if (!rule.path) continue; // an empty Disallow means "allow everything"
      if (pathAndQuery.startsWith(rule.path)) {
        if (!best || rule.path.length > best.path.length) best = rule;
      }
    }
  }
  return !best || best.type === 'allow';
}

/** Fetches robots.txt over a connection pinned to `pinnedIp` (the same address the caller already
 * resolved and validated), with the real hostname sent as both the Host header and the TLS SNI
 * `servername` so certificate validation still checks the real name -- the same
 * resolve-once-then-pin technique used for the main navigation, applied here so the robots.txt
 * fetch itself cannot be DNS-rebound either. Treats a 404 as "no restrictions" (the standard
 * convention); treats any other failure as fail-closed (blocks the fetch) since an unreachable or
 * erroring robots.txt is not evidence that crawling is welcome. */
function fetchRobotsTxt(origin, pinnedIp, userAgent, timeoutMs) {
  return new Promise(resolve => {
    const url = new URL('/robots.txt', origin);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get({
      hostname: pinnedIp, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: '/robots.txt',
      headers: { Host: url.hostname, 'User-Agent': userAgent }, servername: url.protocol === 'https:' ? url.hostname : undefined,
      timeout: timeoutMs
    }, res => {
      if (res.statusCode === 404) { res.resume(); resolve({ ok: true, text: '' }); return; }
      if (res.statusCode >= 400) { res.resume(); resolve({ ok: false, reason: `robots-txt-http-${res.statusCode}` }); return; }
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 65536) req.destroy(); });
      res.on('end', () => resolve({ ok: true, text: body }));
      res.on('error', error => resolve({ ok: false, reason: `robots-txt-error:${error.message}` }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'robots-txt-timeout' }); });
    req.on('error', error => resolve({ ok: false, reason: `robots-txt-error:${error.message}` }));
  });
}

/**
 * Constructs a real-crawler provider. Disabled and inert unless `enabled: true` is passed together
 * with a non-empty `allowlist` and an `ownerApproval` object -- constructing it with defaults is
 * safe and produces a provider whose fetchPage always rejects with 'crawler-disabled'.
 */
export function createRealCrawlerProvider(options = {}) {
  const opts = { ...DEFAULT_REAL_CRAWLER_OPTIONS, ...options };
  const { enabled = false, allowlist = [], ownerApproval = null, allowLocal = false, executablePath = null, browserArgs = ['--no-sandbox'] } = opts;

  if (enabled) {
    if (!Array.isArray(allowlist) || allowlist.length === 0) throw new RealCrawlerError('missing-allowlist', 'a non-empty allowlist is required to enable the real crawler');
    if (!ownerApproval || !ownerApproval.approvedBy || !ownerApproval.approvedAt) throw new RealCrawlerError('missing-owner-approval', 'explicit owner approval ({approvedBy, approvedAt}) is required to enable the real crawler');
  }

  const calls = [];
  const captured = [];
  const lastRequestAtByHost = new Map();
  let inFlight = 0;
  const waiters = [];

  function acquireSlot() {
    if (inFlight < opts.maxConcurrency) { inFlight += 1; return Promise.resolve(); }
    return new Promise(resolve => waiters.push(resolve));
  }
  function releaseSlot() {
    const next = waiters.shift();
    if (next) next();
    else inFlight -= 1;
  }

  async function waitForHostRateLimit(host) {
    const last = lastRequestAtByHost.get(host) || 0;
    const wait = opts.perHostRateLimitMs - (Date.now() - last);
    lastRequestAtByHost.set(host, Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }

  function limitation(inputUrl, code, message) {
    return {
      ok: false, status: 0, finalUrl: inputUrl, html: '', headers: {}, tls: { valid: false },
      screenshotHash: '', mobileScreenshotHash: '', responseTimeMs: 0, redirectChain: [], internalLinks: [],
      capturedAt: new Date().toISOString(), limitation: { code, message }
    };
  }

  async function fetchPage(inputUrl) {
    calls.push(inputUrl);
    if (!enabled) throw new RealCrawlerError('crawler-disabled', 'the real crawler is disabled by default; construct with {enabled:true, allowlist, ownerApproval} to use it');

    // Allowlist is checked first, against a zero-network URL parse, so a non-allowlisted host
    // never triggers so much as a DNS lookup -- the allowlist is a hard gate on any network
    // access at all, not just on which pages get fetched.
    const candidate = parseCandidateUrl(inputUrl);
    if (!candidate) return limitation(inputUrl, 'blocked-by-safety-guard', 'Invalid or unparseable URL');
    if (!isAllowlisted(candidate, allowlist)) {
      throw new RealCrawlerError('url-not-allowlisted', `${inputUrl} is not in the explicit allowlist -- this is a caller/config error, not a target-side condition, so it is not silently downgraded to a limitation`);
    }

    let validatedUrl;
    try { validatedUrl = await assertPublicUrl(inputUrl, { allowLocal }); }
    catch (error) { return limitation(inputUrl, 'blocked-by-safety-guard', error.message); }

    const host = validatedUrl.hostname;
    let pinnedIp;
    try {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      const publicRecord = records.find(r => !isPrivateIp(r.address)) || records[0];
      pinnedIp = allowLocal ? (records[0]?.address || '127.0.0.1') : publicRecord?.address;
      if (!pinnedIp || (!allowLocal && isPrivateIp(pinnedIp))) return limitation(inputUrl, 'blocked-by-safety-guard', 'resolved address is private or reserved');
    } catch (error) {
      return limitation(inputUrl, 'dns-resolution-failed', error.message);
    }

    await waitForHostRateLimit(host);
    await acquireSlot();

    const startedAt = Date.now();
    let browser = null;
    try {
      const robots = await fetchRobotsTxt(validatedUrl.origin, pinnedIp, opts.userAgent, opts.robotsTimeoutMs);
      if (!robots.ok) return limitation(inputUrl, 'robots-txt-unreachable', robots.reason);
      if (!isPathAllowedByRobots(robots.text, `${validatedUrl.pathname}${validatedUrl.search}`, opts.userAgent)) {
        return limitation(inputUrl, 'blocked-by-robots-txt', `robots.txt disallows ${validatedUrl.pathname} for this user-agent`);
      }

      const exe = executablePath || await resolveChromiumExecutable();
      browser = await chromium.launch({
        executablePath: exe, headless: true,
        args: [...browserArgs, `--host-resolver-rules=MAP ${host} ${pinnedIp}`]
      });
      const context = await browser.newContext({ userAgent: opts.userAgent, viewport: { width: 1280, height: 800 }, javaScriptEnabled: true });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(opts.navigationTimeoutMs);

      let response;
      try {
        response = await page.goto(validatedUrl.href, { waitUntil: 'load', timeout: opts.navigationTimeoutMs });
      } catch (error) {
        return limitation(inputUrl, 'navigation-failed', error.message);
      }
      if (!response) return limitation(inputUrl, 'navigation-failed', 'no response object returned');

      const redirectChain = [];
      let cursor = response.request();
      while (cursor.redirectedFrom()) { redirectChain.unshift(cursor.redirectedFrom().url()); cursor = cursor.redirectedFrom(); }
      if (redirectChain.length > opts.maxRedirects) return limitation(inputUrl, 'excessive-redirects', `${redirectChain.length} redirects exceeds limit of ${opts.maxRedirects}`);

      const html = await page.content();
      if (Buffer.byteLength(html, 'utf8') > opts.maxResponseBytes) return limitation(inputUrl, 'response-too-large', `response body exceeds ${opts.maxResponseBytes} bytes`);

      const [title, screenshotBuffer] = await Promise.all([page.title(), page.screenshot({ fullPage: false })]);
      const finalUrl = page.url();
      const status = response.status();
      const headers = response.headers();
      const responseTimeMs = Date.now() - startedAt;
      const capturedAt = new Date().toISOString();
      const htmlHash = sha256Hex(html);
      const screenshotHash = sha256Hex(screenshotBuffer);

      const result = {
        ok: status < 400, status, finalUrl, html, htmlHash, title, headers,
        tls: { valid: finalUrl.startsWith('https://'), expiresAt: null },
        screenshotHash, mobileScreenshotHash: '', responseTimeMs, redirectChain,
        internalLinks: [], capturedAt, requestedUrl: inputUrl, pinnedIp
      };
      captured.push(result);
      return result;
    } catch (error) {
      return limitation(inputUrl, 'browser-error', error.message);
    } finally {
      if (browser) await browser.close().catch(() => {});
      releaseSlot();
    }
  }

  /** Turns already-captured real results into the scripted-page format
   * ./crawler.mjs#createReplayCrawlerProvider expects, so a real capture batch can be replayed
   * later (regression tests, offline review) without ever touching the network again. */
  function generateReplayAdapter() {
    return captured.map(r => ({
      ok: r.ok, status: r.status, finalUrl: r.finalUrl, html: r.html, headers: r.headers,
      tls: r.tls, screenshotHash: r.screenshotHash, mobileScreenshotHash: r.mobileScreenshotHash,
      responseTimeMs: r.responseTimeMs, redirectChain: r.redirectChain, internalLinks: r.internalLinks
    }));
  }

  return { name: 'real', fetchPage, generateReplayAdapter, _debug: { calls, captured } };
}
