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

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-services-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
const screenshotDir = path.join(root, 'screenshots');
await fs.mkdir(databaseDir, { recursive: true });
await fs.mkdir(screenshotDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);
const pgPort = 30000 + Math.floor(Math.random() * 1000);
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
  res.end('<!doctype html><html><head><title>Separate Services Clinic</title></head><body><main style="width:520px"><h1>Welcome</h1><p>Care for every patient.</p><a href="/broken">Services</a><p>Email hello@separate-clinic.test</p></main></body></html>');
});

let web;
let worker;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_services');
  const fixturePort = await listen(fixture);
  const appPort = 21500 + Math.floor(Math.random() * 1000);
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${pgPort}/uberbond_services`;
  const commonEnv = {
    ...process.env,
    APP_BASE_URL: `http://127.0.0.1:${appPort}`,
    STORE_BACKEND: 'postgres',
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: 'false',
    SCREENSHOT_DIR: screenshotDir,
    ADMIN_TOKEN: 'test-token',
    TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
    ALLOW_LOCAL_FIXTURES: 'true',
    CHROMIUM_PATH: '/usr/bin/chromium',
    AI_PROVIDER: 'rules',
    AUTOPILOT_ENABLED: 'false',
    PUBLIC_AUDIT_ENABLED: 'true',
    ALLOW_TEST_PAYMENT_UNLOCK: 'true',
    QUEUE_POLL_MS: '50',
    WORKER_HEARTBEAT_MS: '100',
    WORKER_STALE_MS: '2000'
  };
  const cwd = path.resolve(new URL('..', import.meta.url).pathname);
  web = spawn(process.execPath, ['server.mjs'], {
    cwd,
    env: { ...commonEnv, PORT: String(appPort), PROCESS_ROLE: 'web' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  worker = spawn(process.execPath, ['worker.mjs'], {
    cwd,
    env: { ...commonEnv, PROCESS_ROLE: 'worker' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  for (const child of [web, worker]) {
    child.stdout.on('data', data => { logs += data; });
    child.stderr.on('data', data => { logs += data; });
  }

  let health;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/health`);
      if (response.ok) {
        health = await response.json();
        if (health.processRole === 'web' && health.worker?.online) break;
      }
    } catch {}
    await wait(100);
  }
  assert(health?.processRole === 'web', `Web service did not start in web role: ${logs}`);
  assert(health?.worker?.online, `Separate worker heartbeat never appeared: ${JSON.stringify(health)} logs=${logs}`);

  const intake = await fetch(`http://127.0.0.1:${appPort}/api/public/audit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: 'Separate Services Clinic', website: `http://127.0.0.1:${fixturePort}/`,
      email: 'owner@example.com', industry: 'Clinic', country: 'United Kingdom', language: 'English', consent: true
    })
  });
  const created = await intake.json();
  assert(intake.ok, `Separate-service intake failed: ${JSON.stringify(created)} logs=${logs}`);

  let report;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/public/report/${encodeURIComponent(created.accessToken)}`);
    report = await response.json();
    if (report.report?.ready) break;
    await wait(250);
  }
  assert(report?.report?.ready, `Separate worker never completed report: ${JSON.stringify(report)} logs=${logs}`);
  const screenshotUrl = report.report.screenshots?.[0]?.desktop;
  assert(String(screenshotUrl || '').startsWith('/api/public/artifacts/'), `Screenshot was not promoted to shared artifact storage: ${screenshotUrl}`);
  const screenshotResponse = await fetch(`http://127.0.0.1:${appPort}${screenshotUrl}`);
  const screenshotBytes = Buffer.from(await screenshotResponse.arrayBuffer());
  assert(screenshotResponse.ok && screenshotResponse.headers.get('content-type') === 'image/png', 'Web service could not serve worker-created artifact');
  assert(screenshotBytes.length > 100, `Shared screenshot artifact was unexpectedly small: ${screenshotBytes.length}`);

  const summary = await fetch(`http://127.0.0.1:${appPort}/api/summary`, {
    headers: { authorization: 'Bearer test-token' }
  }).then(response => response.json());
  assert(summary.processRole === 'web', 'Summary did not report web role');
  assert(summary.workerOnline === true, 'Summary did not see worker');
  assert(Number(summary.queue?.counts?.completed || 0) >= 1, `Queue did not persist completed job: ${JSON.stringify(summary.queue)}`);
  assert(Number(summary.queue?.counts?.active || 0) === 0, `Queue left an active job: ${JSON.stringify(summary.queue)}`);

  console.log(JSON.stringify({
    ok: true,
    webRole: health.processRole,
    workerOnline: health.worker.online,
    completedJobs: summary.queue.counts.completed,
    leadId: created.leadId,
    score: report.report.score?.total,
    observations: report.report.observations.length + report.report.hiddenFindings,
    sharedArtifactBytes: screenshotBytes.length
  }, null, 2));
} finally {
  web?.kill('SIGTERM');
  worker?.kill('SIGTERM');
  fixture.close();
  await wait(500);
  await postgres.stop().catch(() => {});
}

process.exit(0);
