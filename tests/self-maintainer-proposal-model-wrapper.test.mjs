import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { createSelfMaintainerProposalModelWrapper } from '../.github/workflows/runtime/self-maintainer-proposal-model-wrapper.mjs';

const BASE = 'c'.repeat(40);
const BEFORE = contentSha256('export const n = 1;\n');

function task(overrides = {}) {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Make one exact bounded internal improvement.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`, 'local-preparation-only'],
    forbiddenActions: ['merge', 'deploy', 'send', 'spend'],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 10000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function providerResult(proposal) {
  return {
    ok: true,
    outcome: 'COMPLETED',
    providerRequestId: 'provider_req_1',
    model: 'provider/model',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costCents: 0 },
    pricingEvidence: { sourceRef: 'doc:free-test-provider', verifiedAt: '2026-09-06T00:00:00.000Z' },
    result: {
      outcome: 'proposal prepared',
      changedArtifacts: [],
      testsActuallyRun: [],
      truthTable: [],
      externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
      decision: 'PROCEED',
      coordination: { action: 'ENGINEERING_REQUIRED', objective: '', summary: '', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 0.5 },
      evidenceRefs: [],
      selfMaintenanceProposal: proposal
    }
  };
}

function rawProposal(overrides = {}) {
  return {
    decision: 'PROCEED',
    summary: 'Change one safe source file.',
    baseRevision: BASE,
    changes: [{ operation: 'UPDATE', path: 'src/example-safe-module.mjs', beforeSha256: BEFORE, content: 'export const n = 2;\n', rationale: 'Bounded repair.' }],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`],
    cognitivePrioritiesConsidered: ['wallbreaker'],
    ...overrides
  };
}

test('wrapper changes the model task into raw-proposal mode but returns canonical codeChangeSet', async () => {
  let observedTask = null;
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async input => {
      observedTask = input.task;
      return providerResult(rawProposal());
    }
  });
  const out = await wrapped({ task: task(), maxTokens: 10000, costCeilingCents: 0 });
  assert.equal(out.ok, true);
  assert.match(observedTask.objective, /PROPOSAL STAGE ONLY/);
  assert.ok(observedTask.requiredOutputs.includes('selfMaintenanceProposal'));
  assert.equal(observedTask.requiredOutputs.includes('codeChangeSet'), false);
  assert.match(out.result.codeChangeSet.changeSetId, /^agent_changes_[a-f0-9]{24}$/);
  assert.equal(out.result.codeChangeSet.businessEffectAuthority, 'NONE');
  assert.deepEqual(out.result.testsActuallyRun, []);
});

test('provider cannot smuggle a protected-path edit through the wrapper', async () => {
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => providerResult(rawProposal({
      changes: [{ ...rawProposal().changes[0], path: '.github/workflows/evil.yml' }]
    }))
  });
  const out = await wrapped({ task: task() });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'CONFIRMED_FAILURE');
  assert.ok(out.reasonCodes.includes('provider-proposal-rejected'));
  assert.ok(out.reasonCodes.some(code => code.includes('protected-path')));
});

test('provider-reported canonical identifiers are discarded in favor of UberBond compilation', async () => {
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => providerResult({ ...rawProposal(), changeSetId: 'fake', businessEffectAuthority: 'ALL' })
  });
  const out = await wrapped({ task: task() });
  assert.equal(out.ok, true);
  assert.notEqual(out.result.codeChangeSet.changeSetId, 'fake');
  assert.equal(out.result.codeChangeSet.businessEffectAuthority, 'NONE');
});

test('provider uncertainty stays uncertainty and is never converted into a proposal result', async () => {
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => ({ ok: false, outcome: 'UNCERTAIN', uncertain: true, reasonCodes: ['transport-uncertain'] })
  });
  const out = await wrapped({ task: task() });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('lookalike non-self-maintainer tasks are refused before the provider is called', async () => {
  let called = false;
  const wrapped = createSelfMaintainerProposalModelWrapper({ modelExecutor: async () => { called = true; return providerResult(rawProposal()); } });
  const out = await wrapped({ task: task({ originAgent: 'other-controller' }) });
  assert.equal(out.ok, false);
  assert.equal(called, false);
  assert.ok(out.reasonCodes.includes('self-maintainer-origin-required'));
});
