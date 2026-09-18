import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const bootstrap = new URL('../ops/sovereign/bootstrap-uberdoso-mail-cell.sh', import.meta.url);
const verify = new URL('../ops/sovereign/verify-uberdoso-mail-cell.sh', import.meta.url);
const lock = JSON.parse(fs.readFileSync(new URL('../config/uberdoso-source-lock.json', import.meta.url), 'utf8'));

function syntax(path) {
  const result = spawnSync('bash', ['-n', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('UberDoso bootstrap and verifier are shell-syntax clean', () => {
  syntax(bootstrap);
  syntax(verify);
});

test('UberDoso bootstrap consumes canonical immutable pins and preserves external gates', () => {
  const source = fs.readFileSync(bootstrap, 'utf8');
  assert.match(source, /uberdoso-source-lock\.json/);
  assert.match(source, /runtimeImageDigest/);
  assert.match(source, /postal bootstrap --version/);
  assert.match(source, /UBERDOSO_POSTAL_PROVISIONED_UNVERIFIED/);
  assert.match(source, /sendAuthority:'NONE_UNTIL_PUBLIC_DNS_PTR_PORT25_AND_UBERBOND_GATES_PASS'/);
  assert.doesNotMatch(source, /OUTBOUND_ENABLED=true/);
  assert.match(lock.postal.runtimeImageDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(lock.mariaDb.runtimeImageDigest, /^sha256:[a-f0-9]{64}$/);
});

test('mail-cell verifier does not self-certify inbound port 25 or public DNS', () => {
  const source = fs.readFileSync(verify, 'utf8');
  assert.match(source, /inboundPort25Observed:false/);
  assert.match(source, /inbound-port-25-must-be-observed-from-outside-host/);
  assert.match(source, /publish-and-observe-public-dns-records/);
  assert.match(source, /sendAuthority:'NONE'/);
});
