import test from 'node:test';
import assert from 'node:assert/strict';
import {
  issueSendCapability, consumeSendCapability, revokeSendCapability, hasSendCapability
} from '../src/uberwarm2-send-capability.mjs';

const KEY = 'uberwarm2-seed:' + 'c'.repeat(64);
const bind = (key, over = {}) => ({
  from: 'tara@example.net', to: 'owned-seed@gmail.com', probeId: 'probe-a',
  subject: 'UberBond permitted mailbox delivery test', body: 'template probe-a',
  permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE', reservationKey: key, ...over,
});

test('a capability is one-shot: a second consume is refused even after a successful first consume', () => {
  issueSendCapability(KEY, bind(KEY));
  assert.equal(hasSendCapability(KEY, bind(KEY)), true);
  assert.equal(consumeSendCapability(KEY, bind(KEY)), true);
  assert.equal(consumeSendCapability(KEY, bind(KEY)), false);
  assert.equal(hasSendCapability(KEY, bind(KEY)), false);
});

test('a capability cannot be issued twice without being consumed or revoked', () => {
  const k = 'uberwarm2-seed:' + 'd'.repeat(64);
  issueSendCapability(k, bind(k));
  assert.throws(() => issueSendCapability(k, bind(k)), /already-issued/);
  revokeSendCapability(k);
  assert.equal(consumeSendCapability(k, bind(k)), false);
});

test('a capability minted for probe A cannot be spent on probe B, and a mismatch leaves it live for A', () => {
  const k = 'uberwarm2-seed:' + 'f'.repeat(64);
  issueSendCapability(k, bind(k, { probeId: 'probe-a', body: 'template probe-a' }));
  assert.equal(consumeSendCapability(k, bind(k, { probeId: 'probe-b', body: 'template probe-b' })), false);
  assert.equal(hasSendCapability(k, bind(k, { probeId: 'probe-a', body: 'template probe-a' })), true);
  assert.equal(consumeSendCapability(k, bind(k, { probeId: 'probe-a', body: 'template probe-a' })), true);
  revokeSendCapability(k);
});

test('a capability bound to one recipient cannot be spent on another', () => {
  const k = 'uberwarm2-seed:' + 'a'.repeat(64);
  issueSendCapability(k, bind(k, { to: 'owned-seed@gmail.com' }));
  assert.equal(consumeSendCapability(k, bind(k, { to: 'stranger@example.com' })), false);
  revokeSendCapability(k);
});

test('issuance requires a binding whose reservation key matches the one issued', () => {
  const k = 'uberwarm2-seed:' + 'b'.repeat(64);
  assert.throws(() => issueSendCapability(k), /binding-does-not-match-reservation/);
  assert.throws(() => issueSendCapability(k, bind(KEY)), /binding-does-not-match-reservation/);
});

test('malformed reservation keys are never issued or consumed', () => {
  assert.throws(() => issueSendCapability('uberwarm2-seed:short', bind('uberwarm2-seed:short')), /invalid-reservation-key/);
  assert.throws(() => issueSendCapability(undefined, bind(undefined)), /invalid-reservation-key/);
  assert.equal(consumeSendCapability('not-a-key', bind('not-a-key')), false);
});

test('an expired capability is refused', () => {
  const k = 'uberwarm2-seed:' + 'e'.repeat(64);
  issueSendCapability(k, bind(k), { ttlMs: 1 });
  return new Promise(resolve => setTimeout(() => {
    assert.equal(consumeSendCapability(k, bind(k)), false);
    resolve();
  }, 25));
});
