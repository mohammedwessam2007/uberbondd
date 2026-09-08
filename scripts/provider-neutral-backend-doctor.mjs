import fs from 'node:fs';
import path from 'node:path';
import { validateStartupConfig } from '../src/config.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const requiredFiles = ['Dockerfile', 'server.mjs', 'portable-server.mjs', 'worker.mjs', 'scripts/migrate.mjs', 'scripts/provider-neutral-backend-doctor.mjs', 'docker-compose.yml'];
const requiredComposeMarkers = ['postgres:', 'migrate:', 'web:', 'worker:', 'portable-server.mjs', 'service_completed_successfully', '/api/health'];

function serviceBlock(compose, service) {
  const pattern = new RegExp(`(?:^|\\n)  ${service}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z0-9_-]+:\\n|\\nvolumes:\\n|$)`);
  return pattern.exec(compose)?.[1] || '';
}

function inspectServiceContracts(compose) {
  const contracts = {
    postgres: ['restart: unless-stopped', 'uberbond-postgres:/var/lib/postgresql/data', 'pg_isready'],
    migrate: ['command: ["node", "scripts/migrate.mjs"]', 'restart: "no"'],
    web: [
      'command: ["node", "portable-server.mjs"]',
      'init: true',
      'restart: unless-stopped',
      'stop_grace_period: 15s',
      'PAYPAL_SANDBOX_CLIENT_ID:',
      'PAYPAL_SANDBOX_CLIENT_SECRET:',
      'PAYPAL_SANDBOX_WEBHOOK_ID:'
    ],
    worker: [
      'command: ["node", "worker.mjs"]',
      'init: true',
      'restart: unless-stopped',
      'stop_grace_period: 30s'
    ]
  };
  const failures = [];
  for (const [service, required] of Object.entries(contracts)) {
    const block = serviceBlock(compose, service);
    if (!block) {
      failures.push(`${service}:service-block-missing`);
      continue;
    }
    for (const marker of required) {
      if (!block.includes(marker)) failures.push(`${service}:missing:${marker}`);
    }
  }
  return failures;
}

export function inspectPortableBackend({ repoRoot = root, env = process.env } = {}) {
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(repoRoot, file)));
  const compose = fs.existsSync(path.join(repoRoot, 'docker-compose.yml'))
    ? fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8') : '';
  const portableServer = fs.existsSync(path.join(repoRoot, 'portable-server.mjs'))
    ? fs.readFileSync(path.join(repoRoot, 'portable-server.mjs'), 'utf8') : '';
  const missingComposeMarkers = requiredComposeMarkers.filter(marker => !compose.includes(marker));
  const serviceContractFailures = inspectServiceContracts(compose);
  const requiredEnv = ['POSTGRES_PASSWORD', 'APP_BASE_URL', 'ADMIN_TOKEN', 'TOKEN_ENCRYPTION_KEY'];
  const missingEnv = requiredEnv.filter(name => !String(env[name] || '').trim());
  const reasons = [];
  if (missingFiles.length) reasons.push('required-runtime-file-missing');
  if (missingComposeMarkers.length) reasons.push('compose-contract-incomplete');
  if (serviceContractFailures.length) reasons.push('portable-service-contract-incomplete');
  if (missingEnv.length) reasons.push('deployment-environment-incomplete');
  if (String(env.APP_BASE_URL || '').trim() && !String(env.APP_BASE_URL).startsWith('https://')) reasons.push('APP_BASE_URL-must-use-https');
  if (String(env.POSTGRES_PASSWORD || '').trim() && !/^[A-Za-z0-9._~-]+$/.test(String(env.POSTGRES_PASSWORD))) reasons.push('POSTGRES_PASSWORD-must-be-url-safe');
  if (String(env.ADMIN_TOKEN || '').trim() && String(env.ADMIN_TOKEN).length < 32) reasons.push('ADMIN_TOKEN-must-be-at-least-32-characters');

  // The provider-neutral entrypoint is allowed to add route/lifecycle wrappers,
  // but it may never bypass the canonical external authentication facade. This
  // pins the security regression found during the night portability review.
  const portableSecurityFailures = [];
  if (portableServer) {
    if (!portableServer.includes("new URL('./server.mjs'")) portableSecurityFailures.push('canonical-server-facade-not-composed');
    if (portableServer.includes("new URL('./server-core.mjs'")) portableSecurityFailures.push('server-core-direct-entrypoint-bypass');
  }
  if (portableSecurityFailures.length) reasons.push('portable-auth-boundary-bypassed');

  const startupFailures = [];
  for (const processRole of ['web', 'worker']) {
    try {
      validateStartupConfig({ nodeEnv: 'production', processRole, storeBackend: 'postgres', databaseUrl: 'postgres://uberbond:password@postgres:5432/uberbond', adminToken: String(env.ADMIN_TOKEN || ''), baseUrl: String(env.APP_BASE_URL || ''), revenue: { allowTestUnlock: false }, outbound: { enabled: false }, google: { clientId: '', clientSecret: '' } });
    } catch (error) { startupFailures.push(`${processRole}:${error.message}`); }
  }
  if (startupFailures.length) reasons.push('production-startup-contract-failed');
  return {
    schema: 'uberbond.provider-neutral-backend-doctor.v1',
    status: reasons.length ? 'REFUSED' : 'READY_FOR_HOST_REHEARSAL',
    reasons,
    missingFiles,
    missingComposeMarkers,
    serviceContractFailures,
    missingEnv,
    portableSecurityFailures,
    startupFailures,
    runtimeProof: 'NONE',
    businessEffectAuthority: 'NONE',
    note: 'Static packaging/preflight evidence does not prove host startup, provider validity, customer demand, payment, restart recovery, or unattended operation.'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = inspectPortableBackend();
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'REFUSED') process.exitCode = 1;
}
