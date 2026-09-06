import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { createSelfMaintainerProposalModelWrapper } from '../.github/workflows/runtime/self-maintainer-proposal-model-wrapper.mjs';

const BASE = 'c'.repeat(40);
const SOURCE_PATH = 'src/example-safe-module.mjs';
const SOURCE_CONTENT = 'export const n = 1;\n';
const BEFORE = contentSha256(SOURCE_CONTENT);

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

function sourceContext(path = SOURCE_PATH, content = SOURCE_CONTENT) {
  return {
    ok: true,
    status: 'EXACT_SOURCE_CONTEXT_READY',
    sourceSha: BASE,
    sourceContextDigest: `ctx_${contentSha256(`${path}:${content}`)}`,
    inventoryDigest: 'inventory-test',
    files: [{ path, sha256: contentSha256(content), byteLength: Buffer.byteLength(content), content }]
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
    changes: [{ operation: 'UPDATE', path: SOURCE_PATH, beforeSha256: '', content: 'export const n = 2;\n', rationale: 'Bounded repair.' }],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`],
    cognitivePrioritiesConsidered: ['wallbreaker'],
    ...overrides
  };
}

test('wrapper embeds exact source context and returns a source-bound canonical codeChangeSet', async () => {
  let observedTask = null;
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async input => {
      observedTask = input.task;
      return providerResult(rawProposal());
    }
  });
  const out = await wrapped({ task: task(), sourceContext: sourceContext(), maxTokens: 10000, costCeilingCents: 0 });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(observedTask.objective, /PROPOSAL STAGE ONLY/);
  assert.match(observedTask.objective, /Exact source context:/);
  assert.match(observedTask.objective, /export const n = 1/);
  assert.ok(observedTask.requiredOutputs.includes('selfMaintenanceProposal'));
  assert.equal(observedTask.requiredOutputs.includes('codeChangeSet'), false);
  assert.match(out.result.codeChangeSet.changeSetId, /^agent_changes_[a-f0-9]{24}$/);
  assert.equal(out.result.codeChangeSet.businessEffectAuthority, 'NONE');
  assert.equal(out.result.codeChangeSet.changes[0].beforeSha256, BEFORE);
  assert.deepEqual(out.result.testsActuallyRun, []);
});

test('model-authored before hash is discarded in favor of exact locally observed source hash', async () => {
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => providerResult(rawProposal({
      changes: [{ ...rawProposal().changes[0], beforeSha256: 'f'.repeat(64) }]
    }))
  });
  const out = await wrapped({ task: task(), sourceContext: sourceContext() });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.result.codeChangeSet.changes[0].beforeSha256, BEFORE);
  assert.notEqual(out.result.codeChangeSet.changes[0].beforeSha256, 'f'.repeat(64));
});

test('provider cannot smuggle a protected-path edit through source binding and canonical compiler', async () => {
  const protectedPath = '.github/workflows/evil.yml';
  const protectedContent = 'name: existing\n';
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => providerResult(rawProposal({
      changes: [{ ...rawProposal().changes[0], path: protectedPath, beforeSha256: '' }]
    }))
  });
  const out = await wrapped({ task: task(), sourceContext: sourceContext(protectedPath, protectedContent) });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'CONFIRMED_FAILURE');
  assert.ok(out.reasonCodes.includes('provider-proposal-rejected'));
  assert.ok(out.reasonCodes.some(code => code.includes('protected-path')));
});

test('provider-injected canonical identifiers or authority are rejected by the closed raw envelope', async () => {
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => providerResult({ ...rawProposal(), changeSetId: 'fake', businessEffectAuthority: 'ALL' })
  });
  const out = await wrapped({ task: task(), sourceContext: sourceContext() });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'CONFIRMED_FAILURE');
  assert.ok(out.reasonCodes.includes('provider-proposal-rejected'));
  assert.ok(out.reasonCodes.some(code => code.includes('proposal-unknown-field:changeSetId')));
  assert.ok(out.reasonCodes.some(code => code.includes('proposal-unknown-field:businessEffectAuthority')));
});

test('provider uncertainty stays uncertainty and is never converted into a proposal result', async () => {
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => ({ ok: false, outcome: 'UNCERTAIN', uncertain: true, reasonCodes: ['transport-uncertain'] })
  });
  const out = await wrapped({ task: task(), sourceContext: sourceContext() });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('missing or tampered exact source context is refused before provider execution', async () => {
  let called = false;
  const wrapped = createSelfMaintainerProposalModelWrapper({
    modelExecutor: async () => { called = true; return providerResult(rawProposal()); }
  });
  const missing = await wrapped({ task: task() });
  assert.equal(missing.ok, false);
  assert.equal(called, false);
  assert.ok(missing.reasonCodes.includes('proposal-exact-source-context-required'));

  const tampered = sourceContext();
  tampered.files[0].content = 'export const n = 999;\n';
  const rejected = await wrapped({ task: task(), sourceContext: tampered });
  assert.equal(rejected.ok, false);
  assert.equal(called, false);
  assert.ok(rejected.reasonCodes.some(code => code.includes('digest-mismatch')));
});

test('lookalike non-self-maintainer tasks are refused before the provider is called', async () => {
  let called = false;
  const wrapped = createSelfMaintainerProposalModelWrapper({ modelExecutor: async () => { called = true; return providerResult(rawProposal()); } });
  const out = await wrapped({ task: task({ originAgent: 'other-controller' }), sourceContext: sourceContext() });
  assert.equal(out.ok, false);
  assert.equal(called, false);
  assert.ok(out.reasonCodes.includes('self-maintainer-origin-required'));
});
