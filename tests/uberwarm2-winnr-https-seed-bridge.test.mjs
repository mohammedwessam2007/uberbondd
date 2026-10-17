import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSendCapability, revokeSendCapability } from '../src/uberwarm2-send-capability.mjs';
import { createUberWarm2WinnrHttpsSeedBridge } from '../src/uberwarm2-winnr-https-seed-bridge.mjs';
import { UBERWARM2_SEED_TEMPLATE } from '../src/uberwarm2-seed-executor.mjs';

const sender = 'sender@owned.example';
const seed = 'seed@another.example';
const probeId = 'winnr-https-owner-1';
const reservationKey = 'uberwarm2-seed:' + 'f'.repeat(64);
const request = Object.freeze({
  from: sender, to: seed, probeId,
  subject: UBERWARM2_SEED_TEMPLATE.subject,
  body: UBERWARM2_SEED_TEMPLATE.bodyPrefix + probeId,
  reservationKey, permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE'
});
function fixture({ paused = false, noReceipt = false, noId = false, throwSend = false, liveShape = false, conflictingIdentity = false } = {}) {
  const calls = [];
  const client = {
    async getMailbox({ userId }) {
      calls.push('read');
      return { ok: true, data: {
        id: userId, ...(liveShape ? {full_address: sender, username: 'sender', domain: 'owned.example'} : {email: sender}),
        ...(conflictingIdentity ? {full_address: 'other@owned.example'} : {}), status: 'active', paused, quarantined: false
      }, receipt: noReceipt ? null : { responseDigest: 'sha256:provider-get' } };
    },
    async sendOwnerSeedViaHttps(input) {
      calls.push('send');
      if (throwSend) throw new Error('post-timeout');
      return { ok: true, status: 'UBERWINNR_WRITE_CONFIRMED',
        data: noId ? {} : { message_id: '<provider-owned-test-id@example.net>' },
        receipt: { responseDigest: 'sha256:provider-post' } };
    }
  };
  const bridge = createUberWarm2WinnrHttpsSeedBridge({
    client, senderEmail: sender, userId: 'eu-owned1', clock: () => Date.now(),
    verifyCurrentSenderHealth: async () => true,
    verifyCurrentSeedConsent: async () => true
  });
  return { bridge, calls };
}

test('unclaimed HTTPS transport cannot read provider or send', async () => {
  revokeSendCapability(reservationKey);
  const { bridge, calls } = fixture();
  assert.equal(bridge.ok, true);
  assert.equal(bridge.authorizedSmtp, false);
  assert.equal(bridge.authorizedHttpsApi, true);
  assert.equal(bridge.transportKind, 'WINNR_INBOX_HTTPS_API');
  const result = await bridge.sendOwnedSeed(request);
  assert.equal(result.ok, false);
  assert.equal(result.notTransmitted, true);
  assert.equal(calls.length, 0);
});

test('owned one-shot capability and fresh receipts allow exactly one HTTPS provider submission', async () => {
  const { bridge, calls } = fixture();
  issueSendCapability(reservationKey, request);
  try {
    const result = await bridge.sendOwnedSeed(request);
    assert.equal(result.ok, true);
    assert.equal(result.accepted, true);
    assert.equal(result.status, 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN');
    assert.equal(result.messageId, '<provider-owned-test-id@example.net>');
    assert.deepEqual(calls, ['read', 'send']);
    const replay = await bridge.sendOwnedSeed(request);
    assert.equal(replay.ok, false);
    assert.deepEqual(calls, ['read', 'send']);
  } finally { revokeSendCapability(reservationKey); }
});

test('mutated seed content cannot spend an exact send capability', async () => {
  const { bridge, calls } = fixture();
  issueSendCapability(reservationKey, request);
  try {
    const result = await bridge.sendOwnedSeed({ ...request, to: 'stranger@outside.example' });
    assert.equal(result.ok, false);
    assert.equal(result.notTransmitted, true);
    assert.equal(calls.length, 0);
  } finally { revokeSendCapability(reservationKey); }
});

test('paused sender and missing provider receipt refuse before spending capability', async () => {
  for (const opts of [{ paused: true }, { noReceipt: true }]) {
    const { bridge, calls } = fixture(opts);
    issueSendCapability(reservationKey, request);
    try {
      const result = await bridge.sendOwnedSeed(request);
      assert.equal(result.ok, false);
      assert.equal(result.notTransmitted, true);
      assert.deepEqual(calls, ['read']);
    } finally { revokeSendCapability(reservationKey); }
  }
});

test('unconfirmed provider response or thrown post is uncertain and never retried', async () => {
  for (const opts of [{ noId: true }, { throwSend: true }]) {
    const { bridge, calls } = fixture(opts);
    issueSendCapability(reservationKey, request);
    try {
      const outcome = await bridge.sendOwnedSeed(request);
      assert.equal(outcome.status, 'SUBMISSION_OUTCOME_UNCERTAIN');
      assert.equal(outcome.automaticRetryAuthorized, false);
      assert.equal(outcome.notTransmitted, false);
      assert.deepEqual(calls, ['read', 'send']);
      await bridge.sendOwnedSeed(request);
      assert.deepEqual(calls, ['read', 'send']);
    } finally { revokeSendCapability(reservationKey); }
  }
});

test('live full_address identity preserves one-shot and hold checks', async () => {
  for (const paused of [false, true]) {
    const { bridge, calls } = fixture({ liveShape: true, paused });
    issueSendCapability(reservationKey, request);
    try {
      const result = await bridge.sendOwnedSeed(request);
      assert.equal(result.accepted === true, !paused);
      assert.deepEqual(calls, paused ? ['read'] : ['read', 'send']);
      if (!paused) { await bridge.sendOwnedSeed(request); assert.deepEqual(calls, ['read', 'send']); }
    } finally { revokeSendCapability(reservationKey); }
  }
});
test('conflicting provider identity aliases refuse without transmitting', async () => {
  const { bridge, calls } = fixture({ conflictingIdentity: true });
  issueSendCapability(reservationKey, request);
  try {
    const result = await bridge.sendOwnedSeed(request);
    assert.equal(result.notTransmitted, true); assert.deepEqual(calls, ['read']);
  } finally { revokeSendCapability(reservationKey); }
});
