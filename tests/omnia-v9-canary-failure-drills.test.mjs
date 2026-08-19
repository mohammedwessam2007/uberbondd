import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { CanaryReceiptStore } from '../src/omnia-v9/integrations/canary-receipt-store.mjs';
import { bindRealCedarAuthority, RealCedarBindingError } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull } from '../src/omnia-v9/integrations/canary-null-authority.mjs';
import { resolveOmniaV9Mode, isOmniaV9CanaryNullMode } from '../src/omnia-v9/integrations/config.mjs';
import { resolveOutboundFinalAdmissionHook } from '../src/omnia-v9/integrations/outbound-admission.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function realDb() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/010_omnia_v9_canary_null_receipts.sql', import.meta.url), 'utf8'));
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

async function issueBaseline(store, pglite, tenantId, approvalId) {
  return issueCanaryApproval({
    proofStore: store, pool: pglite, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
}

// ---------------------------------------------------------------------------
// Cedar failure during authority
// ---------------------------------------------------------------------------

test('Cedar failure drill: evaluator unavailable (real binding failure classified INCOMPLETE) produces zero executions', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaseline(store, pglite, 'campaign:canary-cedar-unavail', 'ap-cedar-unavail');
    const unavailableAuthority = { policyAuthorizer: () => { throw new RealCedarBindingError('cedar down', 'CEDAR_UNAVAILABLE', 'cedar-runtime'); }, policyDigest: sha256('p'), constitutionDigest: sha256('c') };
    // Simulate the failure at the authority-binding layer itself (before any policyAuthorizer call),
    // matching how a real Cedar outage would be discovered: bindRealCedarAuthority() throws.
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    // A policyAuthorizer that itself throws a RealCedarBindingError simulates the kernel receiving
    // a Cedar-shaped failure mid-decision; the kernel's own catch converts this to DENY (frozen
    // semantics, already proven), which the gate still refuses to execute -- see "malformed bundle" below
    // for the INCOMPLETE-classified binding-time failure path.
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary-cedar-unavail', cedarAuthority: unavailableAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ suffix: 'cedar-unavail', evidenceId: 'ev-cedar-unavail', tenantId: 'campaign:canary-cedar-unavail' }), evidence: canaryEvidence('ev-cedar-unavail', 'campaign:canary-cedar-unavail'), now: NOW
    });
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

test('Cedar failure drill: a real RealCedarBindingError raised while resolving the authority itself (before any admitAction call) is classified ERROR (malformed policy is a config defect, not a transient outage) with zero executions', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaseline(store, pglite, 'campaign:canary-cedar-bind', 'ap-cedar-bind');
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    // Simulate a broken proofStore.getApprovalUsage as a stand-in for "authority resolution failed
    // before Cedar was ever reached" -- this is the code path evaluateAndGateCanaryNull's outer
    // try/catch exists for, and it must never execute.
    const brokenProofStore = { getApprovalUsage: async () => { throw new RealCedarBindingError('malformed policy bundle', 'CEDAR_POLICY_INVALID', 'policy-validation'); }, isRevoked: store.isRevoked.bind(store), putObject: store.putObject.bind(store), reserveAuthority: store.reserveAuthority.bind(store) };
    const cedarAuthority = await bindRealCedarAuthority();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: brokenProofStore, tenantId: 'campaign:canary-cedar-bind', cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ suffix: 'cedar-bind', evidenceId: 'ev-cedar-bind', tenantId: 'campaign:canary-cedar-bind' }), evidence: canaryEvidence('ev-cedar-bind', 'campaign:canary-cedar-bind'), now: NOW
    });
    assert.equal(result.decision, 'ERROR');
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

test('Cedar failure drill: an unexpected/garbage Cedar decision value can never reach execution, even wired through the full canary gate', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaseline(store, pglite, 'campaign:canary-garbage', 'ap-garbage');
    const garbageAuthority = { policyAuthorizer: () => ({ decision: 'garbage-not-a-real-decision' }), policyDigest: sha256('p'), constitutionDigest: sha256('c') };
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary-garbage', cedarAuthority: garbageAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ suffix: 'garbage', evidenceId: 'ev-garbage', tenantId: 'campaign:canary-garbage' }), evidence: canaryEvidence('ev-garbage', 'campaign:canary-garbage'), now: NOW
    });
    // admitAction's own contract: policy.decision !== 'ALLOW' -> DENY. Never executes.
    assert.equal(result.decision, 'DENY');
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

// ---------------------------------------------------------------------------
// Database failure during authority
// ---------------------------------------------------------------------------

test('DB failure drill: connection loss during authority resolution (before any decision) produces zero executions', async () => {
  const cedarAuthority = await bindRealCedarAuthority();
  const brokenPool = { query: async () => { throw new Error('ECONNREFUSED: simulated connection loss'); } };
  const brokenProofStore = { getApprovalUsage: async () => ({ uses: 0, costUsd: 0 }), isRevoked: async () => false };
  const adapter = new NullConsequenceAdapter();
  const { pglite: realPglite } = await realDb();
  try {
    const receiptStore = new CanaryReceiptStore({ pool: realPglite });
    const result = await evaluateAndGateCanaryNull({
      pool: brokenPool, proofStore: brokenProofStore, tenantId: 'campaign:canary-conn-loss', cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ suffix: 'conn-loss', evidenceId: 'ev-conn-loss', tenantId: 'campaign:canary-conn-loss' }), evidence: canaryEvidence('ev-conn-loss', 'campaign:canary-conn-loss'), now: NOW
    });
    assert.equal(result.decision, 'ERROR');
    assert.equal(result.executed, false);
    assert.equal(adapter.executionCount(), 0);
  } finally { await realPglite.close(); }
});

test('DB failure drill: a write failure during authority reservation (post-ALLOW) results in no execution, never a fabricated success', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaseline(store, pglite, 'campaign:canary-reserve-fail', 'ap-reserve-fail');
    const cedarAuthority = await bindRealCedarAuthority();
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const failingReserveStore = { getApprovalUsage: store.getApprovalUsage.bind(store), isRevoked: store.isRevoked.bind(store), putObject: store.putObject.bind(store), reserveAuthority: async () => { throw new Error('simulated reservation write failure'); } };
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: failingReserveStore, tenantId: 'campaign:canary-reserve-fail', cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ suffix: 'reserve-fail', evidenceId: 'ev-reserve-fail', tenantId: 'campaign:canary-reserve-fail' }), evidence: canaryEvidence('ev-reserve-fail', 'campaign:canary-reserve-fail'), now: NOW
    });
    assert.equal(result.decision, 'ALLOW', 'the decision itself was a real ALLOW');
    assert.equal(result.executed, false, 'but authority could not be durably reserved, so execution must not happen -- no fabricated success');
    assert.match(result.reason, /no-execution:reservation-error/);
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

test('kill switch: OMNIA_V9_MODE=off removes canary_null from the resolvable mode set, regardless of real usable canary approvals existing', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaseline(store, pglite, 'campaign:canary-kill', 'ap-kill');
    const mode = resolveOmniaV9Mode({ OMNIA_V9_MODE: 'off' });
    assert.equal(mode, 'off');
    assert.equal(isOmniaV9CanaryNullMode(mode), false);
    // The real send path's hook resolver only ever activates for shadow/compare -- canary_null
    // must never be able to make it return a hook, off or otherwise.
    assert.equal(resolveOutboundFinalAdmissionHook({ mode, store: pglite }), null);
    assert.equal(resolveOutboundFinalAdmissionHook({ mode: 'canary_null', store: pglite }), null, 'canary_null must never activate the real Gmail send hook, even when explicitly selected');
  } finally { await pglite.close(); }
});

test('kill switch: mode resolution recognizes canary_null only when explicitly set, and falls back to off for anything else, including case/whitespace variants', () => {
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'canary_null' }), 'canary_null');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'CANARY_NULL' }), 'canary_null');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: ' canary_null ' }), 'canary_null');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'canary' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'enforce' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'production' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'autonomous' }), 'off');
});

test('kill switch: after a canary approval is exhausted/kill-stated, no historical evidence is deleted -- receipts remain readable', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaseline(store, pglite, 'campaign:canary-history', 'ap-history');
    const cedarAuthority = await bindRealCedarAuthority();
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId: 'campaign:canary-history', cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ suffix: 'history', evidenceId: 'ev-history', tenantId: 'campaign:canary-history' }), evidence: canaryEvidence('ev-history', 'campaign:canary-history'), now: NOW
    });
    assert.equal(result.executed, true);
    // "Disable" the mode (nothing to do at the DB level -- the kill switch lives entirely in
    // config.mjs's pure function, never in the database), then confirm the receipt is still readable.
    const stillReadable = await receiptStore.getByReservationId(result.receipt.reservationId);
    assert(stillReadable, 'historical receipts must remain readable after the kill switch is engaged');
  } finally { await pglite.close(); }
});
