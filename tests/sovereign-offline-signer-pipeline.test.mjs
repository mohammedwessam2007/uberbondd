import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker=readFileSync(new URL('../ops/sovereign/sovereign-offline-signer-worker.mjs',import.meta.url),'utf8');
const service=readFileSync(new URL('../ops/sovereign/uberbond-offline-signer.service',import.meta.url),'utf8');
const pathUnit=readFileSync(new URL('../ops/sovereign/uberbond-offline-signer.path',import.meta.url),'utf8');
const installer=readFileSync(new URL('../ops/sovereign/install-offline-signer-node.sh',import.meta.url),'utf8');

test('offline signer verifies canonical request and exact clean source before packing',()=>{
  assert.match(worker,/verifySovereignReleaseRequest/);
  assert.match(worker,/git'\s*,\s*\['rev-parse','HEAD'\]/);
  assert.match(worker,/offline-signer-source-must-equal-request-source/);
  assert.match(worker,/git'\s*,\s*\['status','--porcelain'\]/);
  assert.match(worker,/clean-offline-signer-source-required/);
});

test('offline signer delegates only to existing pack admission and never deploys',()=>{
  assert.match(worker,/pack-release-request\.mjs/);
  assert.doesNotMatch(worker,/\buberbondctl\s+deploy\b|\bdeploy\s*\(/i);
  assert.match(worker,/deploymentAuthority:'NONE'/);
  assert.match(worker,/businessEffectAuthority:'NONE'/);
  assert.match(worker,/externalEffectAuthority:'NONE'/);
});

test('signer service has no network family and cannot mutate source',()=>{
  assert.match(service,/User=uberbond-offline-signer/);
  assert.match(service,/RestrictAddressFamilies=AF_UNIX/);
  assert.match(service,/IPAddressDeny=any/);
  assert.match(service,/ProtectSystem=strict/);
  assert.match(service,/ReadWritePaths=\/var\/lib\/uberbond-offline-signer/);
  assert.doesNotMatch(service,/ReadWritePaths=.*\/opt\/uberbond\/offline-source/);
});

test('path watches only bounded signer inbox request',()=>{
  assert.match(pathUnit,/PathChanged=\/var\/lib\/uberbond-offline-signer\/inbox\/sovereign-release-request\.json/);
  assert.match(pathUnit,/Unit=uberbond-offline-signer\.service/);
  assert.doesNotMatch(pathUnit,/NEXT_RELEASE/);
});

test('installer isolates the private key and installs no runtime deployment unit',()=>{
  assert.match(installer,/release-private\.pem/);
  assert.match(installer,/0400/);
  assert.match(installer,/uberbond-offline-signer\.path/);
  assert.doesNotMatch(installer,/install-host\.sh|uberbond-reconcile|uberbondctl deploy/);
});

test('signed outbox marker is publication only and preserves runtime truth boundary',()=>{
  assert.match(worker,/SIGNED_RELEASE_READY_IN_OFFLINE_OUTBOX/);
  assert.match(worker,/outbox,'NEXT_RELEASE'/);
  assert.match(worker,/does not prove transport, runtime admission, deployment, recovery/);
});
