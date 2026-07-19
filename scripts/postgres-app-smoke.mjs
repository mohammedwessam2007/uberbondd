import EmbeddedPostgres from 'embedded-postgres';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-pg-app-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
await fs.mkdir(databaseDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);
const pgPort = 28000 + Math.floor(Math.random() * 1000);
const postgres = new EmbeddedPostgres({
  databaseDir, user: 'postgres', password: 'password', port: pgPort,
  persistent: false, createPostgresUser: true, onLog: () => {}, onError: () => {}
});

const fixture = http.createServer((req, res) => {
  if (req.url === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('User-agent: *\nAllow: /');
  }
  if (req.url === '/broken') {
    res.writeHead(404, { 'content-type': 'text/html' });
    return res.end('missing');
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><head><title>Postgres Clinic</title></head><body><main style="width:520px"><h1>Welcome</h1><p>Care for every patient.</p><a href="/broken">Services</a><p>Email hello@postgres-clinic.test</p></main></body></html>');
});

let app;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_app');
  const fixturePort = await listen(fixture);
  const appPort = 20500 + Math.floor(Math.random() * 1000);
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${pgPort}/uberbond_app`;
  app = spawn(process.execPath, ['server.mjs'], {
    cwd: path.resolve(new URL('..', import.meta.url).pathname),
    env: {
      ...process.env,
      PORT: String(appPort),
      APP_BASE_URL: `http://127.0.0.1:${appPort}`,
      STORE_BACKEND: 'postgres',
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: 'false',
      SCREENSHOT_DIR: path.join(root, 'screenshots'),
      ADMIN_TOKEN: 'test-token',
      TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
      ALLOW_LOCAL_FIXTURES: 'true',
      CHROMIUM_PATH: '/usr/bin/chromium',
      AI_PROVIDER: 'rules',
      AUTOPILOT_ENABLED: 'false',
      PUBLIC_AUDIT_ENABLED: 'true',
      ALLOW_TEST_PAYMENT_UNLOCK: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  app.stdout.on('data', data => { logs += data; });
  app.stderr.on('data', data => { logs += data; });

  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/health`);
      if (response.ok) { healthy = true; break; }
    } catch {}
    await wait(250);
  }
  assert(healthy, `PostgreSQL app did not start: ${logs}`);

  const intake = await fetch(`http://127.0.0.1:${appPort}/api/public/audit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: 'Postgres Clinic', website: `http://127.0.0.1:${fixturePort}/`, email: 'owner@example.com', industry: 'Clinic', country: 'United Kingdom', language: 'English', consent: true })
  });
  const created = await intake.json();
  assert(intake.ok, `PostgreSQL intake failed: ${JSON.stringify(created)} logs=${logs}`);

  let report;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/public/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: created.accessToken }) });
    report = await response.json();
    if (report.report?.ready) break;
    await wait(500);
  }
  assert(report?.report?.ready, `PostgreSQL report never became ready: ${JSON.stringify(report)} logs=${logs}`);

  const unlock = await fetch(`http://127.0.0.1:${appPort}/api/test/unlock`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ leadId: created.leadId, product: 'full', amountCents: 4900 })
  });
  assert(unlock.ok, `PostgreSQL unlock failed: ${await unlock.text()}`);
  const summary = await fetch(`http://127.0.0.1:${appPort}/api/summary`, { headers: { authorization: 'Bearer test-token' } }).then(response => response.json());
  assert(summary.storeBackend === 'postgres', 'Summary did not report PostgreSQL backend');
  assert(summary.revenue.grossRevenue === 49, 'PostgreSQL revenue event was not recorded');

  console.log(JSON.stringify({
    ok: true,
    backend: summary.storeBackend,
    leadId: created.leadId,
    score: report.report.score?.total,
    findings: report.report.observations.length + report.report.hiddenFindings,
    revenue: summary.revenue.grossRevenue
  }, null, 2));
} finally {
  app?.kill('SIGTERM');
  fixture.close();
  await wait(300);
  await postgres.stop().catch(() => {});
}

process.exit(0);
