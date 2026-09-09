import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectSovereignSelfHost } from '../scripts/sovereign-self-host-doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('sovereign host source is provider-neutral and truthfully runtime-unproven', () => {
  const result = inspectSovereignSelfHost({ repoRoot: root });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'SOVEREIGN_SELF_HOST_SOURCE_COMPLETE_RUNTIME_UNPROVEN');
  assert.equal(result.properties.runtimeNeedsVercel, false);
  assert.equal(result.properties.runtimeNeedsGitHub, false);
  assert.equal(result.properties.runtimeMayDownloadReplacement, false);
  assert.equal(result.properties.recoverySupervisorOutsideAppProcess, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('runtime control shell parses and contains no pull or hosted-control-plane fallback', () => {
  const file = path.join(root, 'ops/sovereign/uberbondctl');
  const bash = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  assert.equal(bash.status, 0, bash.stderr);
  const source = read('ops/sovereign/uberbondctl').toLowerCase();
  for (const forbidden of ['docker pull', 'git pull', 'api.vercel.com', 'api.github.com', 'curl ', 'wget ']) {
    assert.equal(source.includes(forbidden), false, `runtime control regained forbidden dependency: ${forbidden}`);
  }
});

test('runtime compose consumes preloaded immutable images and does not build or pull', () => {
  const compose = read('docker-compose.sovereign.yml');
  assert.match(compose, /image: \$\{UBERBOND_RELEASE:/);
  assert.match(compose, /\$\{HOST_BIND:-127\.0\.0\.1\}/);
  assert.doesNotMatch(compose, /^\s*build\s*:/m);
  assert.doesNotMatch(compose, /pull_policy\s*:/);
});

test('failed promotion path is backup-before-migration and rollback capable', () => {
  const source = read('ops/sovereign/uberbondctl');
  const backup = source.indexOf('backup="$(backup_db');
  const migration = source.indexOf('run --rm migrate');
  const restore = source.indexOf('restore_db "$backup"');
  assert.ok(backup >= 0 && migration > backup, 'database backup must happen before migration');
  assert.ok(restore > migration, 'failed promotion must have a post-migration restore path');
  assert.match(source, /wait_container uberbond-web true 180/);
});

test('reconciler can recover an admitted release but cannot select or fetch a new one', () => {
  const source = read('ops/sovereign/uberbondctl');
  const reconcile = source.slice(source.indexOf('reconcile(){'), source.indexOf('restore_drill(){'));
  assert.match(reconcile, /state_get CURRENT_RELEASE/);
  assert.match(reconcile, /docker image inspect/);
  assert.match(reconcile, /compose .* up -d postgres/);
  assert.match(reconcile, /compose .* up -d web worker/);
  assert.doesNotMatch(reconcile, /docker load|docker build|git |curl|wget|vercel|github/i);
});

test('systemd recovery plane survives app process death and does not use an hourly loop', () => {
  const service = read('ops/sovereign/uberbond-reconcile.service');
  const timer = read('ops/sovereign/uberbond-reconcile.timer');
  assert.match(service, /ExecStart=\/opt\/uberbond\/control\/uberbondctl reconcile/);
  assert.match(timer, /OnUnitActiveSec=60s/);
  assert.match(timer, /Persistent=true/);
  assert.doesNotMatch(timer, /1h|hour/i);
});

test('bootstrap creates local secrets and keeps side effects disabled by default', () => {
  const source = read('ops/sovereign/install-host.sh');
  const bash = spawnSync('bash', ['-n', path.join(root, 'ops/sovereign/install-host.sh')], { encoding: 'utf8' });
  assert.equal(bash.status, 0, bash.stderr);
  assert.match(source, /openssl rand -hex 32/);
  assert.match(source, /AUTOPILOT_ENABLED=false/);
  assert.match(source, /OUTBOUND_ENABLED=false/);
  assert.match(source, /OUTBOUND_DRY_RUN=true/);
  assert.match(source, /HOST_BIND=127\.0\.0\.1/);
  assert.match(source, /release-public\.pem/);
});
