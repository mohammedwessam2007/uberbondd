import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelfMaintainerProposalApiHandler } from '../.github/workflows/runtime/self-maintainer-proposal-api.mjs';
import { SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE } from '../.github/workflows/runtime/self-maintainer-free-ai-profile.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const BASE = '9'.repeat(40);
const PATH = 'src/example-safe-module.mjs';

function task(overrides = {}) {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Select exact source context for one bounded repair.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`evidence:github-commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 12000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function providerSelectionResult() {
  return {
    ok: true,
    outcome: 'COMPLETED',
    providerRequestId: 'free_select_1',
    model: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costCents: 0 },
    pricingEvidence: {
      sourceRef: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingSource,
      verifiedAt: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingVerifiedAt
    },
    result: {
      outcome: 'selected exact context',
      changedArtifacts: [],
      testsActuallyRun: [],
      truthTable: [],
      externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
      decision: 'PROCEED',
      coordination: { action: 'ENGINEERING_REQUIRED', objective: '', summary: '', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 1 },
      evidenceRefs: [],
      selfMaintenanceContextRequest: { paths: [PATH] }
    }
  };
}

function request(body) {
  return { method: 'POST', headers: { authorization: 'Bearer signed-github-oidc' }, body };
}

function responseCapture() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}

test('proposal API ignores paid-model env substitution and constructs only the immutable free Gateway worker', async () => {
  let observedWorker = null;
  let observedInput = null;
  const handler = createSelfMaintainerProposalApiHandler({
    env: {
      AI_GATEWAY_MODEL: 'openai/paid-model-that-must-not-win',
      AI_GATEWAY_INPUT_USD_PER_MILLION: '999',
      AI_GATEWAY_OUTPUT_USD_PER_MILLION: '999',
      AI_GATEWAY_AGENT_ENABLED: 'false'
    },
    verifyOidc: async ({ expectedSha }) => ({ ok: true, identity: { sha: expectedSha } }),
    providerReadiness: [{ provider: 'ai-gateway', ready: true, blockers: [] }],
    executorFactory: worker => {
      observedWorker = worker;
      return async input => { observedInput = input; return providerSelectionResult(); };
    }
  });
  const res = responseCapture();
  await handler(request({ stage: 'SELECT_CONTEXT', expectedSha: BASE, task: task(), sourceInventory: [PATH] }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(observedWorker.provider, 'ai-gateway');
  assert.equal(observedWorker.model, SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model);
  assert.equal('reasoningEffort' in observedWorker, false);
  assert.equal(observedInput.costCeilingCents, 0);
  assert.equal(res.payload.proposalModel, SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model);
  assert.equal(res.payload.businessEffectAuthority, 'NONE');
});

test('self-maintainer proposal API refuses any nonzero task compute budget before provider construction', async () => {
  let factoryCalled = false;
  const handler = createSelfMaintainerProposalApiHandler({
    env: {},
    verifyOidc: async ({ expectedSha }) => ({ ok: true, identity: { sha: expectedSha } }),
    providerReadiness: [{ provider: 'ai-gateway', ready: true, blockers: [] }],
    executorFactory: () => { factoryCalled = true; return async () => providerSelectionResult(); }
  });
  const res = responseCapture();
  await handler(request({
    stage: 'SELECT_CONTEXT',
    expectedSha: BASE,
    task: task({ budget: { maxTokens: 12000, maxCostCents: 1 } }),
    sourceInventory: [PATH]
  }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(factoryCalled, false);
  assert.ok(res.payload.reasonCodes.includes('self-maintainer-zero-cent-budget-required'));
  assert.equal(res.payload.businessEffectAuthority, 'NONE');
});
