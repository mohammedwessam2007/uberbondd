import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCenturyContinuityPlan, verifyCenturyContinuityRehearsal } from '../src/century-grade-continuity.mjs';

const checksum = char => `sha256:${char.repeat(64)}`;

function goodInput() {
  return {
    assets: [{
      id: 'private-life-vault', assetClass: 'PRIVATE_LIFE_STATE', format: 'json.aes256gcm',
      schemaVersion: 'pce-private-state-v1', checksum: checksum('a'), readerRef: 'src/personal-civilization-private-operator.mjs',
      portableFormat: true, requiresRunningService: false, encryptedAtRest: true, critical: true, private: true,
      ignoredSecret: 'MUST_NOT_LEAK'
    }],
    replicas: [
      { id: 'cloud-copy', assetId: 'private-life-vault', provider: 'provider-a', accountRef: 'acct-a', region: 'region-a', failureDomain: 'fd-cloud-a', encryptedAtRest: true, keyRef: 'life-key-a', knownCopy: true },
      { id: 'offline-copy', assetId: 'private-life-vault', provider: 'offline', accountRef: 'offline-media-1', region: 'offline', failureDomain: 'fd-offline-1', offline: true, encryptedAtRest: true, keyRef: 'life-key-b', knownCopy: true }
    ],
    keyCustody: [
      { keyRef: 'life-key-a', custodyDomain: 'key-cell-a', recoveryRef: 'owner-recovery:a', rotationVersion: '1', ownerControlled: true, coLocatedWithCiphertext: false, revoked: false, secret: 'NEVER_OUTPUT_A' },
      { keyRef: 'life-key-b', custodyDomain: 'key-cell-b', recoveryRef: 'owner-recovery:b', rotationVersion: '1', ownerControlled: true, coLocatedWithCiphertext: false, revoked: false, secret: 'NEVER_OUTPUT_B' }
    ],
    migrations: [{ assetClass: 'PRIVATE_LIFE_STATE', fromVersion: 'pce-private-state-v1', toVersion: 'pce-private-state-v2', migratorRef: 'migration:pce-v1-v2', readerRef: 'reader:pce-v2' }],
    posthumous: { disposition: 'UNDECIDED', statedByFounder: false },
    unknownCopyRefs: []
  };
}

function observedReceipts(plan) {
  const common = { manifestDigest: plan.manifestDigest, evidenceClass: 'OBSERVED_RUNTIME', independentVerifierRef: 'verifier:independent-1' };
  return {
    restoreReceipt: { ...common, receiptClass: 'RESTORE', evidenceRef: 'receipt:restore-1', runtimeIdentity: 'host:alternate-1', checksumMatch: true, boundedWorkloadVerified: true, rollbackRef: 'receipt:rollback-1' },
    keyRecoveryReceipt: { ...common, receiptClass: 'KEY_RECOVERY', evidenceRef: 'receipt:key-recovery-1', primaryCustodyUnavailable: true, canaryDecryptionVerified: true, recoverySecretPersisted: false },
    migrationReceipt: { ...common, receiptClass: 'MIGRATION', evidenceRef: 'receipt:migration-1', fromVersion: 'pce-private-state-v1', toVersion: 'pce-private-state-v2', roundTripDigestMatch: true },
    providerLossReceipt: { ...common, receiptClass: 'PROVIDER_LOSS', evidenceRef: 'receipt:provider-loss-1', primaryUnavailable: true, failedProvider: 'provider-a', alternateProvider: 'provider-b', duplicateExternalEffects: 0 }
  };
}

test('structurally independent private continuity plan is ready for rehearsal but not century-proven', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'CONTINUITY_PLAN_READY_FOR_REHEARSAL');
  assert.equal(plan.runtimeProof, 'NONE__STRUCTURAL_PLAN_ONLY');
  assert.match(plan.manifestDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(plan.centuryGradeClaim, 'NOT_ESTABLISHED_UNTIL_C23_B_OBSERVED_REHEARSAL');
  assert.equal(plan.businessEffectAuthority, 'NONE');
});

test('private replicas cannot share the one encryption key', () => {
  const input = goodInput();
  input.replicas[1].keyRef = 'life-key-a';
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.some(code => code.startsWith('private-asset-replicas-must-not-share-one-encryption-key')));
});

test('critical copies in one failure identity are refused', () => {
  const input = goodInput();
  input.replicas[1] = { ...input.replicas[0], id: 'copy-2', keyRef: 'life-key-b' };
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.some(code => code.startsWith('critical-asset-replicas-share-failure-domain')));
});

test('private continuity requires an independent offline encrypted copy', () => {
  const input = goodInput();
  input.replicas[1].offline = false;
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.some(code => code.startsWith('private-asset-needs-independent-offline-replica')));
});

test('recovery key custody cannot be colocated with ciphertext or its failure domain', () => {
  const input = goodInput();
  input.keyCustody[0].coLocatedWithCiphertext = true;
  input.keyCustody[1].custodyDomain = 'fd-offline-1';
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.some(code => code.startsWith('recovery-secret-co-located-with-ciphertext')));
  assert.ok(plan.reasonCodes.some(code => code.startsWith('key-custody-shares-replica-failure-domain')));
});

test('revoked key cannot remain an active replica key', () => {
  const input = goodInput();
  input.keyCustody[1].revoked = true;
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.some(code => code.startsWith('replica-uses-revoked-key')));
});

test('critical state must be portable, independently readable and migration-addressable', () => {
  const input = goodInput();
  input.assets[0].portableFormat = false;
  input.assets[0].requiresRunningService = true;
  input.migrations = [];
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.includes('critical-state-must-be-portable-and-service-independent'));
  assert.ok(plan.reasonCodes.some(code => code.startsWith('critical-asset-migration-path-required')));
});

test('non-founder cannot invent a posthumous disposition', () => {
  const input = goodInput();
  input.posthumous = { disposition: 'PUBLIC_RELEASE', statedByFounder: false };
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.includes('disposition-must-be-stated-by-the-founder'));
  assert.equal(plan.manifest.posthumous.disposition, 'UNDECIDED');
});

test('explicit founder disposition is preserved but grants no current execution authority', () => {
  const input = goodInput();
  input.posthumous = { disposition: 'PRIVATE_ARCHIVE', statedByFounder: true };
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, true);
  assert.equal(plan.manifest.posthumous.disposition, 'PRIVATE_ARCHIVE');
  assert.equal(plan.businessEffectAuthority, 'NONE');
});

test('unknown copies prevent a complete deletion claim', () => {
  const input = goodInput();
  input.unknownCopyRefs = ['possible-old-drive'];
  const plan = compileCenturyContinuityPlan(input);
  assert.equal(plan.ok, true);
  assert.equal(plan.manifest.deletionScope.claim, 'DELETION_CANNOT_BE_CLAIMED_COMPLETE_WHILE_UNKNOWN_COPIES_EXIST');
});

test('manifest strips supplied secret values and only retains safe references', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  const serialized = JSON.stringify(plan.manifest);
  assert.equal(serialized.includes('MUST_NOT_LEAK'), false);
  assert.equal(serialized.includes('NEVER_OUTPUT_A'), false);
  assert.equal(serialized.includes('NEVER_OUTPUT_B'), false);
});

test('C23-B cannot pass from a plan alone', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  const out = verifyCenturyContinuityRehearsal({ plan });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('observed-independent-restore-receipt-required'));
  assert.ok(out.reasonCodes.includes('observed-independent-provider-loss-receipt-required'));
});

test('rehearsal receipts are bound to the exact manifest digest', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  const receipts = observedReceipts(plan);
  receipts.restoreReceipt.manifestDigest = checksum('f');
  const out = verifyCenturyContinuityRehearsal({ plan, ...receipts });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('receipt-manifest-digest-mismatch'));
});

test('key recovery must survive loss of primary custody and never persist the recovery secret', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  const receipts = observedReceipts(plan);
  receipts.keyRecoveryReceipt.primaryCustodyUnavailable = false;
  receipts.keyRecoveryReceipt.recoverySecretPersisted = true;
  const out = verifyCenturyContinuityRehearsal({ plan, ...receipts });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('key-recovery-must-survive-primary-custody-loss'));
  assert.ok(out.reasonCodes.includes('recovery-secret-must-not-be-persisted-by-rehearsal'));
});

test('provider-loss proof requires a different provider and zero duplicate effects', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  const receipts = observedReceipts(plan);
  receipts.providerLossReceipt.alternateProvider = 'provider-a';
  receipts.providerLossReceipt.duplicateExternalEffects = 1;
  const out = verifyCenturyContinuityRehearsal({ plan, ...receipts });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('alternate-provider-must-differ'));
  assert.ok(out.reasonCodes.includes('provider-loss-recovery-must-have-zero-duplicate-effects'));
});

test('complete observed rehearsal earns only bounded evidence, never a century-duration claim', () => {
  const plan = compileCenturyContinuityPlan(goodInput());
  const out = verifyCenturyContinuityRehearsal({ plan, ...observedReceipts(plan) });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CONTINUITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE');
  assert.equal(out.centuryGradeClaim, 'PARTIAL_OBSERVED_EVIDENCE__NOT_A_CENTURY_DURATION_CLAIM');
  assert.equal(out.evidenceRefs.length, 4);
  assert.equal(out.businessEffectAuthority, 'NONE');
});
