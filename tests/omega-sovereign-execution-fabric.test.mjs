import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSovereignExecutionPlan, verifyExecutionReceiptBinding } from '../src/omega-sovereign-execution-fabric.mjs';

const payloadHash = 'a'.repeat(64);
const zero = receipt => {
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.deepEqual(receipt.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
};

const candidate = overrides => ({
  id: 'local',
  type: 'LOCAL_TRUSTED',
  evidenceRefs: ['receipt:test'],
  privacyModes: ['LOCAL_TRUST_BOUNDARY'],
  verificationModes: ['LOCAL_VERIFICATION'],
  observedLatencyMs: 10,
  observedCostCents: 0,
  available: true,
  ...overrides
});

test('private cognitive state refuses ordinary untrusted execution even when cheap', () => {
  const out = compileSovereignExecutionPlan({
    job: { id: 'private', dataClass: 'FOUNDER_PRIVATE', verificationClass: 'DETERMINISTIC_REEXECUTION', payloadHash },
    candidates: [candidate({
      id: 'cheap-untrusted',
      type: 'UNTRUSTED_REEXECUTABLE',
      privacyModes: [],
      verificationModes: ['DETERMINISTIC_REEXECUTION'],
      observedLatencyMs: 1,
      observedCostCents: 0
    })]
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'OMEGA_EXECUTION_PLAN_NO_ADMISSIBLE_BACKEND');
  assert.ok(out.candidates[0].reasonCodes.includes('untrusted-backend-private-data-refused'));
  zero(out);
});

test('attested confidential backend requires both privacy and verification evidence modes', () => {
  const job = { id: 'private-tee', dataClass: 'FOUNDER_PRIVATE', verificationClass: 'ATTESTED_ENVIRONMENT', payloadHash };
  const missing = compileSovereignExecutionPlan({
    job,
    candidates: [candidate({
      id: 'tee-missing',
      type: 'CONFIDENTIAL_TEE',
      privacyModes: ['DATA_IN_USE_CONFIDENTIAL'],
      verificationModes: ['ATTESTATION_VERIFIED']
    })]
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.candidates[0].reasonCodes.includes('missing-privacy-mode:ATTESTATION_VERIFIED'));

  const accepted = compileSovereignExecutionPlan({
    job,
    candidates: [candidate({
      id: 'tee',
      type: 'CONFIDENTIAL_TEE',
      privacyModes: ['ATTESTATION_VERIFIED', 'DATA_IN_USE_CONFIDENTIAL'],
      verificationModes: ['ATTESTATION_VERIFIED'],
      observedLatencyMs: 20,
      observedCostCents: 3
    })]
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.selected.id, 'tee');
  assert.equal(accepted.plan.founderKeyPolicy, 'FOUNDER_ROOT_KEY_NEVER_DELEGATED');
  assert.equal(accepted.plan.executionAuthority, 'NONE');
  assert.equal(accepted.plan.spendAuthority, 'NONE');
  zero(accepted);
});

test('FHE is admissible for founder-private jobs only when ciphertext-compute and requested verification are both evidenced', () => {
  const out = compileSovereignExecutionPlan({
    job: { id: 'fhe', dataClass: 'FOUNDER_PRIVATE', verificationClass: 'CRYPTOGRAPHIC_PROOF', payloadHash },
    candidates: [candidate({
      id: 'fhe-worker',
      type: 'FHE',
      privacyModes: ['CIPHERTEXT_COMPUTE'],
      verificationModes: ['CRYPTOGRAPHIC_PROOF'],
      observedLatencyMs: 1000,
      observedCostCents: 10
    })]
  });
  assert.equal(out.ok, true);
  assert.equal(out.selected.type, 'FHE');
});

test('public deterministic jobs may use untrusted hardware only when reexecution verification is available', () => {
  const out = compileSovereignExecutionPlan({
    job: { id: 'public', dataClass: 'PUBLIC', verificationClass: 'DETERMINISTIC_REEXECUTION', payloadHash },
    candidates: [
      candidate({ id: 'bad', type: 'UNTRUSTED_REEXECUTABLE', privacyModes: [], verificationModes: [], observedLatencyMs: 1 }),
      candidate({ id: 'good', type: 'UNTRUSTED_REEXECUTABLE', privacyModes: [], verificationModes: ['DETERMINISTIC_REEXECUTION'], observedLatencyMs: 5 })
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.selected.id, 'good');
  assert.equal(out.candidates.find(row => row.id === 'bad').admissible, false);
});

test('routing ranks only admissible observed backends and respects explicit cost limits without creating spend authority', () => {
  const out = compileSovereignExecutionPlan({
    job: { id: 'bounded', dataClass: 'INTERNAL_NON_SECRET', verificationClass: 'DETERMINISTIC_REEXECUTION', payloadHash, maxObservedCostCents: 5 },
    candidates: [
      candidate({ id: 'local-expensive', verificationModes: ['LOCAL_VERIFICATION'], observedCostCents: 7 }),
      candidate({ id: 'remote-cheap', type: 'UNTRUSTED_REEXECUTABLE', privacyModes: [], verificationModes: ['DETERMINISTIC_REEXECUTION'], observedCostCents: 2, observedLatencyMs: 50 })
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.selected.id, 'remote-cheap');
  assert.equal(out.plan.spendAuthority, 'NONE');
  assert.match(out.truthBoundary, /does not.*spend money/i);
});

test('execution receipt binding rejects substitution and does not pretend to validate protocol cryptography', () => {
  const planned = compileSovereignExecutionPlan({
    job: { id: 'bind', dataClass: 'PUBLIC', verificationClass: 'DETERMINISTIC_REEXECUTION', payloadHash },
    candidates: [candidate({ id: 'remote', type: 'UNTRUSTED_REEXECUTABLE', privacyModes: [], verificationModes: ['DETERMINISTIC_REEXECUTION'] })]
  });
  assert.equal(planned.ok, true);

  const wrong = verifyExecutionReceiptBinding({
    plan: planned.plan,
    receipt: { planHash: planned.plan.planHash, payloadHash: 'b'.repeat(64), backendId: 'remote', backendType: 'UNTRUSTED_REEXECUTABLE', evidenceRefs: ['receipt:remote'] }
  });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.reasonCodes.includes('payload-hash-mismatch'));

  const bound = verifyExecutionReceiptBinding({
    plan: planned.plan,
    receipt: { planHash: planned.plan.planHash, payloadHash, backendId: 'remote', backendType: 'UNTRUSTED_REEXECUTABLE', evidenceRefs: ['receipt:remote'] }
  });
  assert.equal(bound.ok, true);
  assert.match(bound.truthBoundary, /protocol-specific verifier/i);
  zero(bound);
});
