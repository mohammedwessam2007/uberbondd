import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WESSAM_ROOT_IDENTITY,
  compileWessamState,
  compileRecoveryCapsule,
  compileExternalTaskPacket,
  verifyRestoredWessamState
} from '../src/wessam-continuity.mjs';

function state(overrides = {}) {
  const result = compileWessamState({
    ownerId: 'mohamed-wessam',
    memoryRootDigest: 'm'.repeat(64),
    stateRootDigest: 's'.repeat(64),
    trustedBoundaryId: 'private-fabric-egypt-1',
    recoveryEpoch: 3,
    ...overrides
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.state;
}

test('Wessam root identity is owner-sovereign and provider/device independent', () => {
  assert.equal(WESSAM_ROOT_IDENTITY.ownerRole, 'ROOT_OF_TRUST');
  assert.equal(WESSAM_ROOT_IDENTITY.portabilityLaw, 'COGNITIVE_STATE_NOT_PROVIDER_DEVICE_OR_CLOUD');
  assert.equal(WESSAM_ROOT_IDENTITY.selfGrantAuthority, false);
});

test('compiled Wessam state forbids hidden persistence and self authority escalation', () => {
  const result = compileWessamState({
    ownerId: 'mohamed-wessam',
    memoryRootDigest: 'a'.repeat(64),
    stateRootDigest: 'b'.repeat(64)
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.hiddenPersistenceAllowed, false);
  assert.equal(result.state.selfAuthorityEscalationAllowed, false);
  assert.equal(result.state.providerPortable, true);
  assert.equal(result.state.devicePortable, true);
  assert.equal(result.state.businessEffectAuthority, 'NONE');
});

test('recovery capsule requires fresh owner identity and refuses revoked device/provider targets', () => {
  const source = state({ revokedDeviceIds: ['stolen-ipad'], revokedProviderIds: ['revoked-cloud'] });
  const wrongOwner = compileRecoveryCapsule({
    state: source,
    ownerAuthorization: { ownerId: 'attacker', authorizationDigest: 'x'.repeat(64) },
    targetBoundaryId: 'new-private-fabric'
  });
  assert.equal(wrongOwner.ok, false);
  assert.ok(wrongOwner.reasonCodes.includes('owner-identity-mismatch'));

  const revokedDevice = compileRecoveryCapsule({
    state: source,
    ownerAuthorization: { ownerId: source.ownerId, authorizationDigest: 'x'.repeat(64) },
    targetBoundaryId: 'new-private-fabric', targetDeviceId: 'stolen-ipad'
  });
  assert.equal(revokedDevice.ok, false);
  assert.ok(revokedDevice.reasonCodes.includes('target-device-revoked'));

  const revokedProvider = compileRecoveryCapsule({
    state: source,
    ownerAuthorization: { ownerId: source.ownerId, authorizationDigest: 'x'.repeat(64) },
    targetBoundaryId: 'new-private-fabric', targetProviderId: 'revoked-cloud'
  });
  assert.equal(revokedProvider.ok, false);
  assert.ok(revokedProvider.reasonCodes.includes('target-provider-revoked'));
});

test('recovery capsule contains references only and transfers no authority', () => {
  const source = state();
  const result = compileRecoveryCapsule({ state: source, ownerAuthorization: { ownerId: source.ownerId, authorizationDigest: 'z'.repeat(64) }, targetBoundaryId: 'replacement-private-fabric', targetDeviceId: 'new-ipad' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.capsule.payloadMode, 'DIGEST_REFERENCES_ONLY');
  assert.equal(result.capsule.plaintextMemoryIncluded, false);
  assert.equal(result.capsule.authorityTransfer, 'NONE');
  assert.equal(result.capsule.requiresFreshOwnerAuthorizationAtRestore, true);
});

test('external task compiler sends only requested minimum-sufficient allowed memory', () => {
  const result = compileExternalTaskPacket({
    taskId: 'research-1', purpose: 'research current model pricing', requestedFields: ['public-fact', 'internal-note'], allowedPrivacyClasses: ['PUBLIC', 'INTERNAL'],
    memoryItems: [
      { key: 'public-fact', privacyClass: 'PUBLIC', value: 'public evidence', provenanceRef: 'source:1' },
      { key: 'internal-note', privacyClass: 'INTERNAL', value: 'bounded note', provenanceRef: 'memory:2' },
      { key: 'private-life', privacyClass: 'PRIVATE', value: 'not for external model', provenanceRef: 'memory:3' },
      { key: 'unrequested', privacyClass: 'PUBLIC', value: 'unneeded', provenanceRef: 'source:4' }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.packet.included.map(item => item.key), ['public-fact', 'internal-note']);
  assert.equal(result.packet.minimizationApplied, true);
  assert.equal(result.packet.consequenceAuthority, 'NONE');
});

test('WESSAM_INNERMOST plaintext cannot be externalized even if requested', () => {
  const result = compileExternalTaskPacket({ taskId: 'forbidden', purpose: 'attempt innermost export', requestedFields: ['neural-raw'], allowedPrivacyClasses: ['WESSAM_INNERMOST'], memoryItems: [{ key: 'neural-raw', privacyClass: 'WESSAM_INNERMOST', value: 'raw future BCI data', provenanceRef: 'sensor:1' }] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('wessam-innermost-plaintext-externalization-prohibited'));
});

test('secret-like values and secret-bearing keys are excluded from external task packets', () => {
  const result = compileExternalTaskPacket({ taskId: 'secret-test', purpose: 'must redact secrets', requestedFields: ['bad1', 'bad2', 'safe'], memoryItems: [
    { key: 'bad1', privacyClass: 'INTERNAL', value: { apiKey: 'not-even-needed' }, provenanceRef: 'memory:1' },
    { key: 'bad2', privacyClass: 'INTERNAL', value: 'Bearer abcdefghijklmnopqrstuv', provenanceRef: 'memory:2' },
    { key: 'safe', privacyClass: 'INTERNAL', value: 'safe bounded fact', provenanceRef: 'memory:3' }
  ] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.packet.included.map(item => item.key), ['safe']);
  assert.equal(result.packet.excluded.filter(item => item.reason === 'secret-like-content-denied').length, 2);
});

test('restored state rejects stale epoch, memory drift, identity drift and authority inflation', () => {
  const source = state();
  const restored = structuredClone(source);
  restored.recoveryEpoch = 2; restored.memoryRootDigest = 'changed'; restored.ownerId = 'other'; restored.selfAuthorityEscalationAllowed = true;
  const result = verifyRestoredWessamState({ sourceState: source, restoredState: restored, ownerAuthorization: { ownerId: source.ownerId } });
  assert.equal(result.ok, false);
  for (const code of ['owner-changed-during-restore', 'memory-root-drift', 'stale-recovery-epoch', 'authority-inflation-during-restore']) assert.ok(result.reasonCodes.includes(code), code);
});

test('structured cloning a Wessam state does not create new consequence authority', () => {
  const cloned = structuredClone(state());
  assert.equal(cloned.businessEffectAuthority, 'NONE');
  assert.equal(cloned.selfAuthorityEscalationAllowed, false);
  assert.equal(cloned.externalEffectLedger.messages, 0);
  assert.equal(cloned.externalEffectLedger.spendCents, 0);
});
