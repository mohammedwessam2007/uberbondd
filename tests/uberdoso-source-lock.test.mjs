import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../config/uberdoso-source-lock.json', import.meta.url), 'utf8'));
const digest = /^sha256:[a-f0-9]{64}$/;

test('UberDoso source lock pins immutable runtime images', () => {
  assert.equal(lock.policy.runtimeImageDigestRequiredBeforeActivation, true);
  assert.equal(lock.postal.version, '3.3.7');
  assert.equal(lock.postal.runtimeImage, 'ghcr.io/postalserver/postal:3.3.7');
  assert.match(lock.postal.runtimeImageDigest, digest);
  assert.equal(lock.postal.runtimePlatform, 'linux/amd64');
  assert.equal(lock.mariaDb.runtimeImage, 'docker.io/library/mariadb:10.11.19');
  assert.match(lock.mariaDb.runtimeImageDigest, digest);
  assert.equal(lock.mariaDb.runtimePlatform, 'linux/amd64');
  assert.equal(lock.policy.floatingTagsAllowed, false);
});
