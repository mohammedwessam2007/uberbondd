import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueShadowApproval, revokeShadowApproval } from '../src/omnia-v9/integrations/shadow-approval.mjs';
import { issueCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull, classifyCanaryGateOutcome, CANARY_EXECUTABLE_DECISIONS, CANARY_KNOWN_NO_EXECUTION_DECISIONS } from '../src/omnia-v9/integrations/canary-null-authority.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function realDb() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  const store = new OmniaV9ProofStore({ pool: pglite, keyResolver });
  return { pglite, store };
}

function canaryIntent({ suffix, evidenceId, tenantId = 'campaign:canary' }) {
  return createActionIntent({
    missionId: tenantId, tenantId, actorId: 'uberbond-canary-worker', operation: CANARY_NULL_OPERATION,
    resource: `null-sink:${suffix}`, purpose: CANARY_NULL_PURPOSE, effectClass: CANARY_NULL_EFFECT_CLASS,
    argumentsDigest: sha256(`args-${suffix}`), evidenceIds: [evidenceId], maxCostUsd: 0, blastRadius: 1,
    rollback: 'NONE', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    nonce: `nonce:${suffix}`, idempotencyKey: `res_${suffix}`
  }, NOW);
}

function canaryEvidence(id, tenantId = 'campaign:canary') {
  return createEvidenceRecord({
    evidenceId: id, tenantId, subject: 'canary-subject', origin: 'SYNTHETIC_FIXTURE',
    relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'synthetic:fixture',
    payloadDigest: sha256('canary-payload'), observedAt: NOW.toISOString()
  });
}

test('classifyCanaryGateOutcome: ALLOW is the only decision that ever executes -- exhaustive enumeration, never a default-allow', () => {
  assert.deepEqual(classifyCanaryGateOutcome('ALLOW'), { executed: true });
  for (const decision of ['DENY', 'REVIEW', 'INCOMPLETE', 'ERROR']) {
    const outcome = classifyCanaryGateOutcome(decision);
    assert.equal(outcome.executed, false, `${decision} must never execute`);
    assert.equal(outcome.reason, `no-execution:${decision}`);
  }
  for (const garbage of ['allow', 'Allow', 'MAYBE', '', null, undefined, 0, 1, true, false, {}, [], 'ALLOWED', 'ALLOW ']) {
    const outcome = classifyCanaryGateOutcome(garbage);
    assert.equal(outcome.executed, false, `unrecognized value ${JSON.stringify(garbage)} must never execute`);
    assert.equal(outcome.reason, 'no-execution:unknown-decision');
  }
});

test('CANARY_EXECUTABLE_DECISIONS contains exactly one value, and it is not shared with CANARY_KNOWN_NO_EXECUTION_DECISIONS', () => {
  assert.deepEqual([...CANARY_EXECUTABLE_DECISIONS], ['ALLOW']);
  for (const value of CANARY_EXECUTABLE_DECISIONS) assert(!CANARY_KNOWN_NO_EXECUTION_DECISIONS.has(value));
});

test('a covering canary approval produces exactly one real null-sink execution with a real receipt', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueCanaryApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'canary-ap-allow', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:canary',
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    const adapter = new NullConsequenceAdapter();
    const evidence = canaryEvidence('ev-allow');
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary', cedarAuthority, keyResolver, adapter,
      intent: canaryIntent({ suffix: 'allow', evidenceId: 'ev-allow' }), evidence, now: NOW
    });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.executed, true);
    assert.equal(adapter.executionCount(), 1);
    assert.equal(result.receipt.result, 'NULL_SINK_ACCEPTED');
  } finally { await pglite.close(); }
});

test('no covering approval produces REVIEW and zero executions', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    const adapter = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary-no-approval', cedarAuthority, keyResolver, adapter,
      intent: canaryIntent({ suffix: 'no-approval', evidenceId: 'ev-noap', tenantId: 'campaign:canary-no-approval' }), evidence: canaryEvidence('ev-noap', 'campaign:canary-no-approval'), now: NOW
    });
    assert.equal(result.decision, 'REVIEW');
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

test('a revoked canary approval produces REVIEW (no covering approval) and zero executions', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueCanaryApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'canary-ap-revoked', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:canary-revoked',
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    await revokeShadowApproval({ proofStore: store, pool: pglite, approvalId: 'canary-ap-revoked', tenantId: 'campaign:canary-revoked', revocationId: 'rev-1', reason: 'test', now: NOW });
    const adapter = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary-revoked', cedarAuthority, keyResolver, adapter,
      intent: canaryIntent({ suffix: 'revoked', evidenceId: 'ev-revoked', tenantId: 'campaign:canary-revoked' }), evidence: canaryEvidence('ev-revoked', 'campaign:canary-revoked'), now: NOW
    });
    assert.equal(result.decision, 'REVIEW');
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

test('a thrown policyAuthorizer is caught by the frozen kernel and fails closed to DENY, zero executions, never a crash', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueCanaryApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'canary-ap-cedar-fail', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:canary-cedar-fail',
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    const throwingCedarAuthority = { policyAuthorizer: () => { throw new Error('simulated Cedar evaluator exception'); }, policyDigest: sha256('p'), constitutionDigest: sha256('c') };
    const adapter = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary-cedar-fail', cedarAuthority: throwingCedarAuthority, keyResolver, adapter,
      intent: canaryIntent({ suffix: 'cedar-fail', evidenceId: 'ev-cedar-fail', tenantId: 'campaign:canary-cedar-fail' }), evidence: canaryEvidence('ev-cedar-fail'), now: NOW
    });
    // The frozen kernel catches a throwing policyAuthorizer and fails closed to DENY -- this is a completed
    // decision, not a binding failure, so it is DENY here (the ERROR path is exercised by binding failures,
    // covered in the drills test file), and it must still never execute.
    assert.equal(result.decision, 'DENY');
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

test('operation attenuation: an intent using operation=email.send is rejected by evaluateAndGateCanaryNull before any DB/Cedar work, zero executions', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    const adapter = new NullConsequenceAdapter();
    const forgedIntent = { ...canaryIntent({ suffix: 'forged-op', evidenceId: 'ev-forged' }), operation: 'email.send' };
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary', cedarAuthority, keyResolver, adapter,
      intent: forgedIntent, evidence: canaryEvidence('ev-forged'), now: NOW
    });
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});
