import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildFrontierCallabilityProbeReceipt,
  validateFrontierCallabilityProbeReceipt,
  probeFrontierCallability
} from '../src/frontier-callability-provenance.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';
import { executeFrontierMember } from '../src/frontier-reasoning-runtime.mjs';

const AT = '2026-09-04T19:00:00.000Z';
const observation = {
  profileId: 'elite', status: 'CALLABLE_NOW',
  observedProvider: 'google', observedModel: 'elite', observedRevision: 'r1',
  observedTransportProvider: 'ai-gateway', observedTransportModel: 'google/elite',
  observedAt: AT, sourceRef: 'runtime://synthetic-probe', providerRequestId: 'synthetic-request',
  identityVerification: 'OBSERVED', evidenceClass: 'OBSERVED_RUNTIME'
};
const profile = { id: 'elite', provider: 'google', model: 'elite', revision: 'r1' };
const member = {
  profileId: 'elite', provider: 'google', model: 'elite', revision: 'r1',
  transportProvider: 'ai-gateway', transportModel: 'google/elite',
  reasoningTier: 'FRONTIER_MAX', reasoningSettingRef: 'ai-gateway:reasoning=xhigh'
};
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function syntheticReceipt() {
  return buildFrontierCallabilityProbeReceipt({ observations: [observation], sourceRef: 'synthetic://producer-origin-test', observedAt: AT });
}

test('public receipt construction is permanently synthetic and cannot mint live producer authority', () => {
  const built = syntheticReceipt();
  assert.equal(built.ok, true);
  assert.equal(built.simulationOnly, true);
  const synthetic = validateFrontierCallabilityProbeReceipt({ receipt: built.receipt, receiptDigest: built.receiptDigest, allowSynthetic: true });
  assert.equal(synthetic.ok, true);
  assert.equal(synthetic.simulationOnly, true);
  assert.equal(synthetic.trustedForLiveExecution, false);
  const liveAttempt = validateFrontierCallabilityProbeReceipt({ receipt: built.receipt, receiptDigest: built.receiptDigest, allowSynthetic: false });
  assert.equal(liveAttempt.ok, false);
  assert.ok(liveAttempt.reasonCodes.includes('synthetic-probe-receipt-not-live-proof'));
});

test('changing a synthetic receipt to live and recomputing its digest still lacks producer origin', () => {
  const built = syntheticReceipt();
  const forged = structuredClone(built.receipt);
  forged.simulationOnly = false;
  const result = validateFrontierCallabilityProbeReceipt({ receipt: forged, receiptDigest: sha256(forged), allowSynthetic: true });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('canonical-probe-producer-origin-required'));
});

test('admission bundle loses process authority after caller mutation', () => {
  const built = syntheticReceipt();
  const admission = buildFrontierAdmissionBundle({
    profiles: [profile],
    callability: [{ ...observation, providerRequestId: undefined }],
    benchmarks: [], contextArtifacts: [],
    source: { kind: 'TEST', ref: 'test://admission', observedAt: AT },
    callabilityProvenance: { receipt: built.receipt, receiptDigest: built.receiptDigest }
  });
  assert.equal(admission.ok, true);
  assert.equal(admission.bundle.callability.length, 1);
  admission.bundle.profiles[0].model = 'mutated-after-admission';
  const result = compileAdmittedFrontierPlan({ task: { taskId: 'x', objective: 'x' }, admissionBundle: admission.bundle });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('process-validated-untampered-frontier-admission-bundle-required'));
});

test('invalid callability is rejected before executor construction or any provider call', async () => {
  let constructions = 0;
  const result = await executeFrontierMember({
    member,
    task: { taskId: 'preflight', objective: 'must not dispatch', consequenceClass: 'LOCAL_PREPARATION' },
    callabilityEvidence: { ...observation, observedRevision: 'wrong-revision' },
    modelExecutorFactory: () => { constructions += 1; return async () => ({ ok: true }); },
    maxTokens: 16, costCeilingCents: 0
  });
  assert.equal(result.ok, false);
  assert.equal(constructions, 0);
  assert.ok(result.reasonCodes.includes('callability-revision-mismatch'));
});

test('executor cannot report a cost above its reserved member ceiling', async () => {
  let calls = 0;
  const result = await executeFrontierMember({
    member,
    task: { taskId: 'budget', objective: 'stay inside reservation', consequenceClass: 'LOCAL_PREPARATION' },
    callabilityEvidence: observation,
    modelExecutorFactory: () => async () => {
      calls += 1;
      return {
        ok: true,
        providerRequestId: 'budget-req',
        model: 'google/elite',
        identityVerification: 'OBSERVED',
        appliedReasoningEffort: 'xhigh',
        appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED',
        usage: { costCents: 6 },
        result: { answer: 'too expensive' }
      };
    },
    maxTokens: 16,
    costCeilingCents: 5,
    clock: (() => { let t = 0; return () => ++t; })()
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_EXECUTION_BUDGET_EXCEEDED');
  assert.ok(result.reasonCodes.includes('actual-cost-exceeds-frontier-reservation'));
});

test('canonical live probe refuses to touch a provider without explicit approval and bounded inputs', async () => {
  const noApproval = await probeFrontierCallability({ profiles: [{ ...profile, transportProvider: 'ai-gateway', transportModel: 'google/elite' }], costCeilingCents: 0 });
  assert.equal(noApproval.ok, false);
  assert.ok(noApproval.reasonCodes.includes('explicit-inference-probe-approval-required'));
  const empty = await probeFrontierCallability({ approved: true, profiles: [], costCeilingCents: 0 });
  assert.equal(empty.ok, false);
  assert.ok(empty.reasonCodes.includes('bounded-profile-list-required'));
});
