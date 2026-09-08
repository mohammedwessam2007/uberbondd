import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectPortableBackend } from '../scripts/provider-neutral-backend-doctor.mjs';

const completeEnv = {
  POSTGRES_PASSWORD: 'local-only-password',
  APP_BASE_URL: 'https://backend.example.test',
  ADMIN_TOKEN: 'a'.repeat(32),
  TOKEN_ENCRYPTION_KEY: 'b'.repeat(64)
};

function fixtureRoot({ compose, portableServer = "const coreUrl = new URL('./server.mjs', import.meta.url);\n" }) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-portable-doctor-'));
  for (const file of ['Dockerfile', 'server.mjs', 'worker.mjs']) fs.writeFileSync(path.join(repoRoot, file), 'fixture');
  fs.mkdirSync(path.join(repoRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'scripts/migrate.mjs'), 'fixture');
  fs.writeFileSync(path.join(repoRoot, 'scripts/provider-neutral-backend-doctor.mjs'), 'fixture');
  fs.writeFileSync(path.join(repoRoot, 'portable-server.mjs'), portableServer);
  fs.writeFileSync(path.join(repoRoot, 'docker-compose.yml'), compose);
  return repoRoot;
}

const completeComposeFixture = `services:
  postgres:
    restart: unless-stopped
    volumes:
      - uberbond-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U uberbond -d uberbond"]
  migrate:
    command: ["node", "scripts/migrate.mjs"]
    restart: "no"
  web:
    command: ["node", "portable-server.mjs"]
    init: true
    restart: unless-stopped
    stop_grace_period: 15s
    environment:
      PAYPAL_SANDBOX_CLIENT_ID: value
      PAYPAL_SANDBOX_CLIENT_SECRET: value
      PAYPAL_SANDBOX_WEBHOOK_ID: value
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('/api/health')"]
  worker:
    command: ["node", "worker.mjs"]
    init: true
    restart: unless-stopped
    stop_grace_period: 30s
    depends_on:
      migrate:
        condition: service_completed_successfully
volumes:
  uberbond-postgres:
`;

test('portable backend doctor recognizes the compose contract with complete deployment env', () => {
  const report = inspectPortableBackend({ env: completeEnv });
  assert.equal(report.status, 'READY_FOR_HOST_REHEARSAL');
  assert.deepEqual(report.missingFiles, []);
  assert.deepEqual(report.missingComposeMarkers, []);
  assert.deepEqual(report.serviceContractFailures, []);
  assert.deepEqual(report.portableSecurityFailures, []);
  assert.equal(report.runtimeProof, 'NONE');
});

test('portable backend doctor refuses missing env and insecure public URL', () => {
  const report = inspectPortableBackend({ env: { APP_BASE_URL: 'http://localhost:8080' } });
  assert.equal(report.status, 'REFUSED');
  assert.ok(report.reasons.includes('deployment-environment-incomplete'));
  assert.ok(report.reasons.includes('APP_BASE_URL-must-use-https'));
});

test('portable backend doctor rejects password interpolation hazards and short admin tokens', () => {
  const report = inspectPortableBackend({ env: { ...completeEnv, POSTGRES_PASSWORD: 'has/slash', ADMIN_TOKEN: 'short' } });
  assert.equal(report.status, 'REFUSED');
  assert.ok(report.reasons.includes('POSTGRES_PASSWORD-must-be-url-safe'));
  assert.ok(report.reasons.includes('ADMIN_TOKEN-must-be-at-least-32-characters'));
  assert.ok(report.reasons.includes('production-startup-contract-failed'));
});

test('portable backend doctor exercises production startup validation for web and worker', () => {
  const report = inspectPortableBackend({ env: completeEnv });
  assert.deepEqual(report.startupFailures, []);
});

test('portable backend doctor fails closed if a portable entrypoint bypasses server.mjs hardening', () => {
  const repoRoot = fixtureRoot({
    compose: completeComposeFixture,
    portableServer: "const coreUrl = new URL('./server-core.mjs', import.meta.url);\n"
  });
  try {
    const report = inspectPortableBackend({ repoRoot, env: completeEnv });
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.reasons.includes('portable-auth-boundary-bypassed'));
    assert.ok(report.portableSecurityFailures.includes('canonical-server-facade-not-composed'));
    assert.ok(report.portableSecurityFailures.includes('server-core-direct-entrypoint-bypass'));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('portable backend doctor refuses a PayPal route container that does not receive canonical PayPal env', () => {
  const repoRoot = fixtureRoot({ compose: completeComposeFixture.replace('      PAYPAL_SANDBOX_WEBHOOK_ID: value\n', '') });
  try {
    const report = inspectPortableBackend({ repoRoot, env: completeEnv });
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.reasons.includes('portable-service-contract-incomplete'));
    assert.ok(report.serviceContractFailures.includes('web:missing:PAYPAL_SANDBOX_WEBHOOK_ID:'));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('portable backend doctor refuses loss of restart or signal hygiene in long-lived services', () => {
  const weakened = completeComposeFixture
    .replace('    restart: unless-stopped\n    stop_grace_period: 15s\n', '    stop_grace_period: 15s\n')
    .replace('    init: true\n    restart: unless-stopped\n    stop_grace_period: 30s\n', '    restart: unless-stopped\n    stop_grace_period: 30s\n');
  const repoRoot = fixtureRoot({ compose: weakened });
  try {
    const report = inspectPortableBackend({ repoRoot, env: completeEnv });
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.reasons.includes('portable-service-contract-incomplete'));
    assert.ok(report.serviceContractFailures.some(item => item === 'web:missing:restart: unless-stopped'));
    assert.ok(report.serviceContractFailures.some(item => item === 'worker:missing:init: true'));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
