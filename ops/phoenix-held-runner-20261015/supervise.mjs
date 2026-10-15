import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// This file is packaged OUTSIDE the pinned app tree. No raw stdout/stderr,
// private rows, database URLs, provider secrets or account tokens are emitted.
const APP_SHA = 'c1f9b4aac2278617cb0c9e04d14e29f0544dd701';
const RECEIPT = '/tmp/phoenix-held-receipt.json';
const fail = (code) => { throw new Error(code); };
const env = process.env;
const required = {
  PHOENIX_HELD_RESTORE_PROBE: '1', NODE_ENV: 'production',
  PROCESS_ROLE: 'web', STORE_BACKEND: 'postgres', DATABASE_SSL: 'true',
  OUTBOUND_ENABLED: 'false', OUTBOUND_DRY_RUN: 'true',
  OUTBOUND_EMERGENCY_STOP: 'true', AUTOPILOT_ENABLED: 'false',
  PUBLIC_AUDIT_ENABLED: 'false', AGENT_RELAY_ENABLED: 'false',
  ALLOW_TEST_PAYMENT_UNLOCK: 'false', NODE_TLS_REJECT_UNAUTHORIZED: '1',
  APP_BASE_URL: 'https://held-restore.invalid', PORT: '28994'
};
let child;
let receipt = {
  contract: 'PHOENIX_N26_HELD_APP_V1', applicationSourceSha: APP_SHA,
  runnerPackageSource: 'ops/phoenix-held-runner-20261015',
  result: 'FAIL_CLOSED', loopbackHealth: false, authenticatedSmoke: false,
  roleAndKeyAdmissionObserved: false, postgresTlsResult: 'UNPROVEN',
  sourceWriterDelta: 'UNKNOWN', productionCutover: false, externalSend: false,
  rawLogsRecorded: false, failureCode: 'NOT_STARTED'
};
function persist() {
  writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}
function spawnBounded(file, args) {
  return spawn(file, args, { cwd: '/srv/uberbond', env, stdio: ['ignore', 'pipe', 'pipe'] });
}
function shutDown() {
  if (child && child.exitCode === null) child.kill('SIGTERM');
}
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
  shutDown(); receipt.failureCode = 'SUPERVISOR_SIGNAL'; persist(); process.exitCode = 1;
});
let stdoutLimited = '';
let stderrDiscarded = 0;
async function awaitExit(proc, maxMs) {
  return await Promise.race([
    new Promise(resolve => proc.once('exit', (code, signal) => resolve({code, signal}))),
    delay(maxMs).then(() => { proc.kill('SIGKILL'); return {code: null, signal: 'TIMEOUT'}; })
  ]);
}
try {
  for (const [k,v] of Object.entries(required)) if (env[k] !== v) fail('ENVIRONMENT_SCOPE');
  if (!/^[a-fA-F0-9]{64}$/.test(env.TOKEN_ENCRYPTION_KEY || '')) fail('ORIGINAL_KEY_FORMAT');
  if ((env.ADMIN_TOKEN || '').length < 32) fail('ADMIN_TOKEN_SCOPE');
  const uri = new URL(env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(uri.protocol) ||
      uri.hostname !== 'ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech' ||
      decodeURIComponent(uri.pathname) !== '/uberbond_phoenix_rehearsal_20261014_v2' ||
      !uri.username || !uri.password || uri.username.endsWith('_owner') ||
      (uri.port && uri.port !== '5432') || uri.hash ||
      [...uri.searchParams].some(([k,v]) => !(['sslmode','channel_binding'].includes(k) && v === 'require')))
    fail('DATABASE_IDENTITY_OR_OWNER_ROLE');
  if (Number(process.getuid?.()) === 0) fail('NONROOT_APP_REQUIRED');
  child = spawnBounded(process.execPath, ['server.mjs']);
  let admission = false;
  child.stdout.on('data', chunk => {
    const str = chunk.toString('utf8');
    if (str.includes('PHOENIX_HELD_RESTORE_ADMISSION')) admission = true;
    stdoutLimited = (stdoutLimited + str).slice(-65536); // memory-only, NEVER printed or written
  });
  child.stderr.on('data', chunk => { stderrDiscarded += chunk.length; });
  child.on('error', () => {});
  let reachable = false;
  for (let i=0; i<70; i++) {
    if (child.exitCode !== null) fail('APPLICATION_EXITED_DURING_BOOT');
    try {
      const res = await fetch('http://127.0.0.1:28994/api/health', { signal: AbortSignal.timeout(1300) });
      if (res.status === 200) { reachable = true; break; }
    } catch {}
    await delay(1000);
  }
  if (!reachable) fail('LOCAL_HEALTH_TIMEOUT');
  receipt.loopbackHealth = true;
  const smoke = spawnBounded(process.execPath, ['scripts/phoenix-held-restore-http-smoke.mjs']);
  let smokeOutput = '';
  smoke.stdout.on('data', chunk => { smokeOutput = (smokeOutput + chunk.toString()).slice(-16384); });
  smoke.stderr.on('data', () => {});
  const finished = await awaitExit(smoke, 30000);
  if (finished.code !== 0) fail('AUTHENTICATED_SMOKE_FAILED');
  const line = smokeOutput.split('\n').find(x => x.startsWith('PHOENIX_HELD_APP_HTTP_PROOF '));
  if (!line) fail('HTTP_PROOF_ABSENT');
  const proof = JSON.parse(line.slice('PHOENIX_HELD_APP_HTTP_PROOF '.length));
  if (proof.ok !== true || proof.actualAppHealth !== true ||
      proof.authenticatedSummary !== true || proof.unauthenticatedSummaryDenied !== true ||
      proof.writeRoutesDenied !== true || proof.privilegedRoutesDenied !== true ||
      proof.processRole !== 'web') fail('HTTP_PROOF_INCOMPLETE');
  if (!admission) fail('READONLY_KEY_ADMISSION_NOT_OBSERVED');
  receipt.authenticatedSmoke = true;
  receipt.roleAndKeyAdmissionObserved = true;
  receipt.postgresTlsResult = 'APPLICATION_VERIFIER_PASSED';
  receipt.failureCode = null;
  receipt.result = 'HELD_SMOKE_SUCCESS_EGRESS_COUNTER_PENDING';
} catch (err) {
  receipt.failureCode = [
    'ENVIRONMENT_SCOPE','ORIGINAL_KEY_FORMAT','ADMIN_TOKEN_SCOPE','DATABASE_IDENTITY_OR_OWNER_ROLE',
    'NONROOT_APP_REQUIRED','APPLICATION_EXITED_DURING_BOOT','LOCAL_HEALTH_TIMEOUT',
    'AUTHENTICATED_SMOKE_FAILED','HTTP_PROOF_ABSENT','HTTP_PROOF_INCOMPLETE',
    'READONLY_KEY_ADMISSION_NOT_OBSERVED'
  ].includes(err?.message) ? err.message : 'BOUNDED_RUNNER_EXCEPTION';
  process.exitCode = 1;
} finally {
  shutDown();
  if (child && child.exitCode === null) {
    await awaitExit(child, 5000);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  persist();
  console.log('PHOENIX_HELD_RUNNER_RECEIPT ' + JSON.stringify(receipt));
}
