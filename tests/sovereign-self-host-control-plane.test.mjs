import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectSovereignSelfHost } from '../scripts/sovereign-self-host-doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bashParses = rel => spawnSync('bash', ['-n', path.join(root, rel)], { encoding:'utf8' });

test('source establishes provider-neutral self-host controls without claiming runtime proof', () => {
  const result = inspectSovereignSelfHost({ repoRoot:root });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'SOVEREIGN_SELF_HOST_SOURCE_COMPLETE_RUNTIME_UNPROVEN');
  assert.equal(result.properties.runtimeNeedsVercel, false);
  assert.equal(result.properties.runtimeNeedsGitHub, false);
  assert.equal(result.properties.runtimeNeedsPackageRegistry, false);
  assert.equal(result.properties.runtimeImagePullPolicy, 'NEVER');
  assert.equal(result.properties.releaseBuildNetworkDisabled, true);
  assert.equal(result.properties.releaseSigningAuthoritySeparatedFromRuntime, true);
  assert.equal(result.properties.signedMonotonicReleaseAdmission, true);
  assert.equal(result.properties.immutableImageIdentityPinned, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('runtime control shell parses and contains no hosted-control-plane or download fallback', () => {
  const parsed=bashParses('ops/sovereign/uberbondctl');
  assert.equal(parsed.status,0,parsed.stderr);
  const source=read('ops/sovereign/uberbondctl').toLowerCase();
  for(const forbidden of ['docker pull','git pull','api.vercel.com','api.github.com','curl ','wget ']){
    assert.equal(source.includes(forbidden),false,`runtime control regained forbidden dependency: ${forbidden}`);
  }
});

test('sovereign image build is network-isolated and consumes an already-seeded dependency tree',()=>{
  const dockerfile=read('Dockerfile.sovereign');
  const ctl=read('ops/sovereign/uberbondctl');
  assert.match(dockerfile,/COPY \. \./);
  assert.match(dockerfile,/test -d node_modules/);
  assert.doesNotMatch(dockerfile,/npm\s+(?:ci|install)/);
  assert.match(ctl,/npm ls --all/);
  assert.match(ctl,/docker build --network=none --pull=false -f Dockerfile\.sovereign/);
  assert.match(ctl,/base image .* is not local/);
});

test('runtime compose consumes only preloaded images and explicitly forbids implicit pulls',()=>{
  const compose=read('docker-compose.sovereign.yml');
  assert.match(compose,/image: \$\{UBERBOND_RELEASE:/);
  assert.match(compose,/\$\{HOST_BIND:-127\.0\.0\.1\}/);
  assert.doesNotMatch(compose,/^\s*build\s*:/m);
  const policies=[...compose.matchAll(/^\s*pull_policy:\s*(\S+)\s*$/gm)].map(m=>m[1]);
  assert.deepEqual(policies,['never','never','never','never']);
});

test('signed release admission is anti-replay and pins mutable Docker names to immutable image IDs',()=>{
  const source=read('ops/sovereign/uberbondctl');
  assert.match(source,/release signature verification failed/);
  assert.match(source,/release replay or non-monotonic promotion refused/);
  assert.match(source,/CURRENT_RELEASE_ID/);
  assert.match(source,/POSTGRES_IMAGE_ID/);
  assert.match(source,/loaded app image identity mismatch/);
  assert.match(source,/admitted app image vanished or changed/);
});

test('bundle verification does not require writing into transferred release media',()=>{
  const source=read('ops/sovereign/uberbondctl');
  const verify=source.slice(source.indexOf('verify_bundle(){'),source.indexOf('public_table_count(){'));
  assert.match(verify,/CONTROL_DIR.*release-attestation/);
  assert.doesNotMatch(verify,/\$dir\/\.attestation/);
});

test('failed promotion is backup-before-migration and rollback cannot fabricate source provenance',()=>{
  const source=read('ops/sovereign/uberbondctl');
  const backup=source.indexOf('backup="$(backup_db');
  const migration=source.indexOf('run --rm migrate');
  const restore=source.indexOf('restore_db "$backup"');
  assert.ok(backup>=0&&migration>backup,'database backup must happen before migration');
  assert.ok(restore>migration,'failed promotion must restore pre-migration state');
  assert.match(source,/PREVIOUS_SOURCE_COMMIT/);
  assert.match(source,/rollback source provenance is not exact/);
  assert.doesNotMatch(source,/rollback-from-/);
});

test('database restore recreates the database before pg_restore so new-schema leftovers cannot survive',()=>{
  const source=read('ops/sovereign/uberbondctl');
  const restore=source.slice(source.indexOf('restore_db(){'),source.indexOf('pack(){'));
  assert.match(restore,/recreate_database_empty/);
  assert.match(source,/pg_terminate_backend/);
  assert.match(source,/dropdb --if-exists/);
  assert.match(source,/createdb -U uberbond uberbond/);
  assert.match(restore,/pg_restore --exit-on-error/);
  assert.match(source,/first promotion requires an empty sovereign database/);
});

test('explicit rollback snapshots current DB first so rollback itself remains reversible',()=>{
  const source=read('ops/sovereign/uberbondctl');
  const rollback=source.slice(source.indexOf('rollback(){'),source.indexOf('reconcile(){'));
  assert.match(rollback,/forward_backup="\$\(backup_db/);
  assert.match(rollback,/restore_db "\$old_backup"/);
  assert.match(rollback,/atomic_state "\$previous" "\$previous_id" "\$current" "\$current_id"/);
});

test('health-required services cannot pass merely because Docker reports no healthcheck',()=>{
  const source=read('ops/sovereign/uberbondctl');
  const wait=source.slice(source.indexOf('wait_container(){'),source.indexOf('validate_release_env(){'));
  assert.match(wait,/health" == "healthy/);
  assert.doesNotMatch(wait,/health" == "none/);
});

test('recovery plane restarts only the admitted exact release and never chooses a replacement',()=>{
  const source=read('ops/sovereign/uberbondctl');
  const reconcile=source.slice(source.indexOf('reconcile(){'),source.indexOf('apply_inbox(){'));
  assert.match(reconcile,/state_get CURRENT_RELEASE/);
  assert.match(reconcile,/state_get CURRENT_RELEASE_ID/);
  assert.match(reconcile,/docker image inspect/);
  assert.match(reconcile,/up -d postgres/);
  assert.match(reconcile,/up -d web worker/);
  assert.doesNotMatch(reconcile,/docker load|docker build|git |curl|wget|vercel|github/i);
});

test('local inbox can auto-deploy a signed monotonic release without a cloud webhook',()=>{
  const apply=read('ops/sovereign/uberbond-release-apply.service');
  const watcher=read('ops/sovereign/uberbond-release-apply.path');
  assert.match(apply,/uberbondctl apply-inbox/);
  assert.match(watcher,/PathExists=\/var\/lib\/uberbond-control\/inbox\/NEXT_RELEASE/);
  assert.match(read('ops/sovereign/uberbondctl'),/deploy "\$dir"/);
});

test('systemd recovery survives app death and reconciles every minute, not hourly',()=>{
  const service=read('ops/sovereign/uberbond-reconcile.service');
  const timer=read('ops/sovereign/uberbond-reconcile.timer');
  assert.match(service,/ExecStart=\/opt\/uberbond\/control\/uberbondctl reconcile/);
  assert.match(timer,/OnUnitActiveSec=60s/);
  assert.match(timer,/Persistent=true/);
  assert.doesNotMatch(timer,/1h|hour/i);
});

test('release private key is created off-host while runtime bootstrap owns public verification only',()=>{
  for(const rel of ['ops/sovereign/install-host.sh','ops/sovereign/init-release-authority.sh']){
    const parsed=bashParses(rel);assert.equal(parsed.status,0,parsed.stderr);
  }
  const install=read('ops/sovereign/install-host.sh');
  const authority=read('ops/sovereign/init-release-authority.sh');
  assert.doesNotMatch(install,/genpkey -algorithm RSA/);
  assert.match(install,/release signing private key must never live on the runtime host/);
  assert.match(authority,/genpkey -algorithm RSA/);
  assert.match(authority,/PRIVATE \(keep off runtime hosts\)/);
  assert.match(install,/AUTOPILOT_ENABLED=false/);
  assert.match(install,/OUTBOUND_ENABLED=false/);
  assert.match(install,/HOST_BIND=127\.0\.0\.1/);
});
