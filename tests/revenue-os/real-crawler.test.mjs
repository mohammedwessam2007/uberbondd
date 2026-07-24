import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealCrawlerProvider, resolveChromiumExecutable, isPathAllowedByRobots, RealCrawlerError
} from '../../revenue-os/src/providers/real-crawler.mjs';
import { createReplayCrawlerProvider } from '../../revenue-os/src/providers/crawler.mjs';
import { startLocalTestServer, startLocalTestServerWithoutRobots } from '../../revenue-os/fixtures/local-test-server.mjs';

const approval = () => ({ approvedBy: 'owner@test.invalid', approvedAt: new Date().toISOString() });

// --- construction gating: disabled by default, requires allowlist + owner approval ---

test('real crawler is disabled by default and fetchPage rejects with crawler-disabled', async () => {
  const provider = createRealCrawlerProvider();
  await assert.rejects(() => provider.fetchPage('https://example.invalid'), (e) => e instanceof RealCrawlerError && e.code === 'crawler-disabled');
});

test('enabling without an allowlist throws at construction time', () => {
  assert.throws(() => createRealCrawlerProvider({ enabled: true }), (e) => e instanceof RealCrawlerError && e.code === 'missing-allowlist');
  assert.throws(() => createRealCrawlerProvider({ enabled: true, allowlist: [] }), (e) => e instanceof RealCrawlerError && e.code === 'missing-allowlist');
});

test('enabling without owner approval throws at construction time', () => {
  assert.throws(() => createRealCrawlerProvider({ enabled: true, allowlist: ['example.invalid'] }), (e) => e instanceof RealCrawlerError && e.code === 'missing-owner-approval');
});

// --- Chromium binary discovery (no `playwright install`, this environment's pre-installed binary only) ---

test('resolveChromiumExecutable finds a real, accessible binary without invoking playwright install', async () => {
  const exePath = await resolveChromiumExecutable();
  assert.ok(exePath && exePath.length > 0);
});

// --- robots.txt group/rule matcher (pure function, no network) ---

test('isPathAllowedByRobots: no rules means everything is allowed', () => {
  assert.equal(isPathAllowedByRobots('', '/anything', 'UberBondDiagnosticBot/1.0'), true);
});

test('isPathAllowedByRobots: Disallow blocks the matching prefix, allows everything else', () => {
  const robots = 'User-agent: *\nDisallow: /private\n';
  assert.equal(isPathAllowedByRobots(robots, '/private/secret', 'x'), false);
  assert.equal(isPathAllowedByRobots(robots, '/public', 'x'), true);
});

test('isPathAllowedByRobots: longest-matching rule wins (a narrower Allow overrides a broader Disallow)', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public-exception\n';
  assert.equal(isPathAllowedByRobots(robots, '/private/public-exception/page', 'x'), true);
  assert.equal(isPathAllowedByRobots(robots, '/private/other', 'x'), false);
});

test('isPathAllowedByRobots: an empty Disallow value means allow-all for that group', () => {
  const robots = 'User-agent: *\nDisallow:\n';
  assert.equal(isPathAllowedByRobots(robots, '/anything', 'x'), true);
});

// --- end-to-end against a local, loopback-only controlled test server (no real network access) ---

async function withServer(fn) {
  const { server, port, baseUrl } = await startLocalTestServer();
  try { await fn({ port, baseUrl }); } finally { server.close(); }
}

test('real crawler captures a real local page: status, title, html/screenshot hashes, timestamps', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval()
    });
    const result = await provider.fetchPage(`${baseUrl}/`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.title, 'Local Test Page');
    assert.equal(result.htmlHash.length, 64);
    assert.equal(result.screenshotHash.length, 64);
    assert.ok(result.capturedAt);
    assert.ok(result.responseTimeMs >= 0);
  });
});

test('robots.txt disallow blocks the fetch as a limitation, not a fabricated result', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval()
    });
    const result = await provider.fetchPage(`${baseUrl}/private/secret`);
    assert.equal(result.ok, false);
    assert.equal(result.limitation.code, 'blocked-by-robots-txt');
    assert.equal(result.html, '');
  });
});

test('a 404 robots.txt is treated as unrestricted (standard convention)', async () => {
  const { server, port, baseUrl } = await startLocalTestServerWithoutRobots();
  try {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval()
    });
    const result = await provider.fetchPage(`${baseUrl}/`);
    assert.equal(result.ok, true);
    assert.equal(result.title, 'No Robots File');
  } finally { server.close(); }
});

test('a URL not on the allowlist is rejected before any network access, even for an otherwise-valid host', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: ['127.0.0.1:9'], allowLocal: true, ownerApproval: approval() // deliberately NOT this server's port
    });
    await assert.rejects(() => provider.fetchPage(`${baseUrl}/`), (e) => e instanceof RealCrawlerError && e.code === 'url-not-allowlisted');
  });
});

test('private/reserved IPs are blocked even when the literal address is itself allowlisted (SSRF guard overrides, allowlist cannot bypass it)', async () => {
  const provider = createRealCrawlerProvider({
    enabled: true, allowlist: ['10.0.0.5'], ownerApproval: approval()
  });
  const result = await provider.fetchPage('http://10.0.0.5/');
  assert.equal(result.ok, false);
  assert.equal(result.limitation.code, 'blocked-by-safety-guard');
});

test('non-HTTP(S) schemes (file/data/javascript) are blocked even when allowlisted verbatim', async () => {
  const provider = createRealCrawlerProvider({
    enabled: true, allowlist: ['file:///etc/passwd', 'data:text/html,x', 'javascript:alert(1)'], ownerApproval: approval()
  });
  const fileResult = await provider.fetchPage('file:///etc/passwd');
  assert.equal(fileResult.ok, false);
  assert.equal(fileResult.limitation.code, 'blocked-by-safety-guard');
  const dataResult = await provider.fetchPage('data:text/html,x');
  assert.equal(dataResult.ok, false);
  assert.equal(dataResult.limitation.code, 'blocked-by-safety-guard');
});

test('excessive redirects (beyond the configured cap) are reported as a limitation, not silently followed', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval(), maxRedirects: 3
    });
    const result = await provider.fetchPage(`${baseUrl}/redirect/1`); // 6 hops, over the cap of 3
    assert.equal(result.ok, false);
    assert.equal(result.limitation.code, 'excessive-redirects');
  });
});

test('a navigation timeout is caught and reported as a limitation, not thrown past fetchPage', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval(), navigationTimeoutMs: 300
    });
    const result = await provider.fetchPage(`${baseUrl}/slow`);
    assert.equal(result.ok, false);
    assert.ok(['navigation-failed'].includes(result.limitation.code));
  });
});

test('an oversized response is reported as a limitation, not truncated and silently accepted', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval(), maxResponseBytes: 1000
    });
    const result = await provider.fetchPage(`${baseUrl}/huge`);
    assert.equal(result.ok, false);
    assert.equal(result.limitation.code, 'response-too-large');
  });
});

test('per-host rate limiting adds a real measurable delay between two sequential fetches of the same host', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval(), perHostRateLimitMs: 1500
    });
    const startedAt = Date.now();
    await provider.fetchPage(`${baseUrl}/`);
    await provider.fetchPage(`${baseUrl}/`);
    assert.ok(Date.now() - startedAt >= 1400, 'two same-host fetches should be separated by close to perHostRateLimitMs');
  });
});

test('generateReplayAdapter turns real captured evidence into a script createReplayCrawlerProvider can play back with no network access', async () => {
  await withServer(async ({ port, baseUrl }) => {
    const provider = createRealCrawlerProvider({
      enabled: true, allowlist: [`127.0.0.1:${port}`], allowLocal: true, ownerApproval: approval()
    });
    await provider.fetchPage(`${baseUrl}/`);
    const script = provider.generateReplayAdapter();
    assert.equal(script.length, 1);
    const replay = createReplayCrawlerProvider(script);
    const replayed = await replay.fetchPage(`${baseUrl}/`);
    assert.equal(replayed.html, script[0].html);
    assert.equal(replayed.status, 200);
  });
});
