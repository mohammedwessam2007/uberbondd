import test from 'node:test';
import assert from 'node:assert/strict';
import {
  issueSendCapability, consumeSendCapability, revokeSendCapability, hasSendCapability
} from '../src/uberwarm2-send-capability.mjs';

const KEY = 'uberwarm2-seed:' + 'c'.repeat(64);

test('a capability is one-shot: a second consume is refused even after a successful first consume', () => {
  issueSendCapability(KEY);
  assert.equal(hasSendCapability(KEY), true);
  assert.equal(consumeSendCapability(KEY), true);
  assert.equal(consumeSendCapability(KEY), false);
  assert.equal(hasSendCapability(KEY), false);
});

test('a capability cannot be issued twice without being consumed or revoked', () => {
  const k = 'uberwarm2-seed:' + 'd'.repeat(64);
  issueSendCapability(k);
  assert.throws(() => issueSendCapability(k), /already-issued/);
  revokeSendCapability(k);
  assert.equal(consumeSendCapability(k), false);
});

test('malformed reservation keys are never issued or consumed', () => {
  assert.throws(() => issueSendCapability('uberwarm2-seed:short'), /invalid-reservation-key/);
  assert.throws(() => issueSendCapability(undefined), /invalid-reservation-key/);
  assert.equal(consumeSendCapability('not-a-key'), false);
});

test('an expired capability is refused', () => {
  const k = 'uberwarm2-seed:' + 'e'.repeat(64);
  issueSendCapability(k, { ttlMs: 1 });
  return new Promise(resolve => setTimeout(() => {
    assert.equal(consumeSendCapability(k), false);
    resolve();
  }, 25));
});
