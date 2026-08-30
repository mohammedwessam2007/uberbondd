import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Rate limiting decides who may create leads and queue research. Its identity
// must therefore not be the caller's to choose.
//
// `clientIp` read `x-forwarded-for` and took the first entry -- the leftmost,
// which is whatever the client claimed. Rotating it made eight public intake
// requests succeed against a cap of three, and each accepted request creates a
// lead and queues work.
//
// The fix is not to distrust proxies, which would break every real deployment.
// It is to make trusting them a declaration: TRUST_PROXY_HOPS says how many
// proxies in front of this process may be believed, and it defaults to zero.
//
// Zero fails closed. Behind an undeclared proxy every caller shares one identity
// and the limit becomes too strict, which is the safe direction to be wrong in
// for a security control.

const PORT_ENV = {
  PROCESS_ROLE: 'web',
  STORE_BACKEND: 'json',
  APP_BASE_URL: 'http://127.0.0.1:9999',
  ADMIN_TOKEN: 'a-strong-admin-token-value-000000000000',
  PUBLIC_INTAKE: 'true',
  PUBLIC_RATE_LIMIT_PER_HOUR: '3',
  NODE_ENV: 'test'
};

// Each case needs its own module registry, because config is read once at
// import. A child process per configuration is the honest way to test a module
// singleton rather than pretending it can be reconfigured in place.
async function runCase({ trustProxyHops, forwardedFor }) {
  const { spawn } = await import('node:child_process');
  const dataDir = await mkdtemp(join(tmpdir(), 'uberbond-identity-'));
  const script = `
    const { requestHandler } = await import('${JSON.stringify(process.cwd()).slice(1, -1)}/server.mjs');
    const forwarded = ${JSON.stringify(forwardedFor)};
    const codes = [];
    for (let i = 0; i < 8; i += 1) {
      const res = { status: null, end(){}, writeHead(s){ this.status = s; } };
      res.end = () => {};
      const headers = {};
      if (forwarded) headers['x-forwarded-for'] = forwarded.replace('%i', String(i));
      const body = JSON.stringify({ company: 'c' + i, website: 'https://c' + i + '.example',
        email: 'o@c' + i + '.example', industry: 'S', consent: true });
      await requestHandler({ method: 'POST', url: '/api/public/audit', headers,
        socket: { remoteAddress: '10.0.0.1' },
        async *[Symbol.asyncIterator]() { yield Buffer.from(body); } }, res);
      codes.push(res.status);
    }
    console.log(JSON.stringify(codes));
    process.exit(0);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, ...PORT_ENV, DATA_DIR: dataDir, TRUST_PROXY_HOPS: String(trustProxyHops) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  const code = await new Promise(resolve => child.on('close', resolve));
  await rm(dataDir, { recursive: true, force: true });
  assert.equal(code, 0, `case exited ${code}`);
  const line = out.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

test('by default a rotating X-Forwarded-For cannot reset the rate limit', async () => {
  const codes = await runCase({ trustProxyHops: 0, forwardedFor: '203.0.113.%i' });
  const accepted = codes.filter(code => code < 400).length;
  assert.ok(accepted <= 3,
    `a rotating header bought ${accepted} accepted requests against a cap of 3: ${codes.join(' ')}`);
  assert.ok(codes.includes(429), 'the limit must actually engage');
});

test('the limit still engages for an honest caller with no header at all', async () => {
  const codes = await runCase({ trustProxyHops: 0, forwardedFor: '' });
  const accepted = codes.filter(code => code < 400).length;
  assert.equal(accepted, 3, `the cap is 3, got ${codes.join(' ')}`);
});

// The property that matters once a proxy IS declared: the leftmost entry is
// still the client's claim and must be ignored. With one trusted hop the address
// the proxy itself observed is the last one.
test('a declared proxy hop ignores the entry the client supplied', async () => {
  // The attacker prepends a rotating value; the proxy appends the real peer.
  const codes = await runCase({ trustProxyHops: 1, forwardedFor: '203.0.113.%i, 198.51.100.7' });
  const accepted = codes.filter(code => code < 400).length;
  assert.ok(accepted <= 3,
    `the client-supplied leftmost entry was believed: ${codes.join(' ')}`);
});

test('two callers behind one declared proxy are still told apart', async () => {
  // Same shape as above, but the address the proxy observed is what rotates --
  // these are genuinely different callers and must not share a bucket.
  const codes = await runCase({ trustProxyHops: 1, forwardedFor: '203.0.113.9, 198.51.100.%i' });
  const accepted = codes.filter(code => code < 400).length;
  assert.equal(accepted, 8,
    `distinct callers behind a declared proxy must not share a limit: ${codes.join(' ')}`);
});
