import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { createSelfMaintainerProposalApiHandler } from '../.github/workflows/runtime/self-maintainer-proposal-api.mjs';

const BASE = 'd'.repeat(40);
const SOURCE_PATH = 'src/proposal-safe-example.mjs';
const SOURCE_CONTENT = 'export const value = 1;\n';
const BEFORE = contentSha256(SOURCE_CONTENT);

function task(overrides = {}) {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Make one bounded improvement.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 12000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function sourceContext(overrides = {}) {
  return {
    ok: true,
    status: 'EXACT_SOURCE_CONTEXT_READY',
    sourceSha: BASE,
    sourceContextDigest: 'context-digest-test',
    inventoryDigest: 'inventory-digest-test',
    files: [{ path: SOURCE_PATH, sha256: BEFORE, byteLength: Buffer.byteLength(SOURCE_CONTENT), content: SOURCE_CONTENT }],
    ...overrides
  };
}

function rawProposal(overrides = {}) {
  return {
    decision: 'PROCEED',
    summary: 'Bounded exact-source repair.',
    baseRevision: BASE,
    changes: [{
      operation: 'UPDATE',
      path: SOURCE_PATH,
      beforeSha256: '',
      content: 'export const value = 2;\n',
      rationale: 'Improve the bounded fixture.'
    }],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`],
    cognitivePrioritiesConsidered: ['wallbreaker'],
    ...overrides
  };
}

function providerResult(proposal = rawProposal()) {
  return {
    ok: true,
    outcome: 'COMPLETED',
    providerRequestId: 'req_test',
    model: 'openai/test',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costCents: 0 },
    pricingEvidence: { sourceRef: 'test:zero-cost', verifiedAt: '2026-09-06T00:00:00.000Z' },
    result: {
      outcome: 'proposal',
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

function selectionResult(paths = [SOURCE_PATH]) {
  return {
    ok: true,
    outcome: 'COMPLETED',
    providerRequestId: 'req_select',
    model: 'openai/test',
    usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costCents: 0 },
    pricingEvidence: { sourceRef: 'test:zero-cost', verifiedAt: '2026-09-06T00:00:00.000Z' },
    result: {
      outcome: 'context selected',
      changedArtifacts: [],
      testsActuallyRun: [],
      truthTable: [],
      externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
      decision: 'PROCEED',
      coordination: { action: 'ENGINEERING_REQUIRED', objective: '', summary: '', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 0.5 },
      evidenceRefs: [],
      selfMaintenanceContextRequest: { paths }
    }
  };
}

function request(body, token = 'oidc-token') {
  return { method: 'POST', headers: { authorization: `Bearer ${token}` }, body };
}

function responseCapture() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}

function successDeps({ executor, readiness } = {}) {
  return {
    env: { AI_GATEWAY_MODEL: 'openai/test' },
    verifyOidc: async ({ expectedSha }) => ({ ok: true, identity: { sha: expectedSha, workflowRef: 'self-maintainer' } }),
    providerReadiness: readiness || [{ provider: 'ai-gateway', ready: true, blockers: [] }],
    executorFactory: () => executor || (async input => /CONTEXT SELECTION STAGE ONLY/.test(input.task.objective) ? selectionResult() : providerResult())
  };
}

function proposalBody(overrides = {}) {
  return { stage: 'PROPOSE', expectedSha: BASE, task: task(), sourceContext: sourceContext(), ...overrides };
}

test('proposal API refuses requests without the GitHub Actions OIDC bearer before provider execution', async () => {
  let called = false;
  const handler = createSelfMaintainerProposalApiHandler(successDeps({ executor: async () => { called = true; return providerResult(); } }));
  const res = responseCapture();
  await handler(request(proposalBody(), ''), res);
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
  assert.ok(res.payload.reasonCodes.includes('github-actions-oidc-bearer-required'));
});

test('proposal API binds the task to the exact OIDC-attested source SHA', async () => {
  const handler = createSelfMaintainerProposalApiHandler(successDeps());
  const res = responseCapture();
  await handler(request(proposalBody({ expectedSha: 'e'.repeat(40) })), res);
  assert.equal(res.statusCode, 409);
  assert.ok(res.payload.reasonCodes.includes('task-request-sha-mismatch'));
});

test('SELECT_CONTEXT receives only bounded inventory and a zero-cent selection ceiling', async () => {
  let observed = null;
  const handler = createSelfMaintainerProposalApiHandler(successDeps({
    executor: async input => { observed = input; return selectionResult(); }
  }));
  const res = responseCapture();
  await handler(request({ stage: 'SELECT_CONTEXT', expectedSha: BASE, task: task(), sourceInventory: [SOURCE_PATH, 'tests/example.test.mjs'] }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(observed.costCeilingCents, 0);
  assert.equal(observed.maxTokens, 6000);
  assert.match(observed.task.objective, /CONTEXT SELECTION STAGE ONLY/);
  assert.deepEqual(res.payload.contextPaths, [SOURCE_PATH]);
  assert.equal(res.payload.stage, 'SELECT_CONTEXT');
});

test('PROPOSE forwards the exact task budget and returns exact-source-bound canonical change sets', async () => {
  let observed = null;
  const handler = createSelfMaintainerProposalApiHandler(successDeps({
    executor: async input => { observed = input; return providerResult(); }
  }));
  const res = responseCapture();
  await handler(request(proposalBody()), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(observed.costCeilingCents, 0);
  assert.equal(observed.maxTokens, 12000);
  assert.match(observed.task.objective, /Exact source context:/);
  assert.equal(res.payload.ok, true);
  assert.match(res.payload.result.codeChangeSet.changeSetId, /^agent_changes_[a-f0-9]{24}$/);
  assert.equal(res.payload.result.codeChangeSet.businessEffectAuthority, 'NONE');
  assert.equal(res.payload.result.codeChangeSet.changes[0].beforeSha256, BEFORE);
  assert.deepEqual(res.payload.result.testsActuallyRun, []);
});

test('PROPOSE refuses missing or tampered exact source context before provider execution', async () => {
  let calls = 0;
  const handler = createSelfMaintainerProposalApiHandler(successDeps({ executor: async () => { calls += 1; return providerResult(); } }));
  const missingRes = responseCapture();
  await handler(request({ stage: 'PROPOSE', expectedSha: BASE, task: task() }), missingRes);
  assert.equal(missingRes.statusCode, 400);
  assert.equal(calls, 0);
  assert.equal(missingRes.payload.status, 'SOURCE_CONTEXT_REJECTED');

  const tampered = sourceContext();
  tampered.files[0].content = 'export const value = 999;\n';
  const tamperedRes = responseCapture();
  await handler(request(proposalBody({ sourceContext: tampered })), tamperedRes);
  assert.equal(tamperedRes.statusCode, 400);
  assert.equal(calls, 0);
  assert.ok(tamperedRes.payload.reasonCodes.some(code => code.includes('digest-mismatch')));
});

test('proposal API rejects provider attempts to inject canonical authority fields', async () => {
  const handler = createSelfMaintainerProposalApiHandler(successDeps({
    executor: async () => providerResult({ ...rawProposal(), changeSetId: 'model-fake', businessEffectAuthority: 'ALL' })
  }));
  const res = responseCapture();
  await handler(request(proposalBody()), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.ok, false);
  assert.equal(res.payload.status, 'PROPOSAL_NOT_PRODUCED');
  assert.equal(res.payload.businessEffectAuthority, 'NONE');
});

test('proposal API stops on an uncertain provider outcome and does not walk into a second provider', async () => {
  const calls = [];
  const handler = createSelfMaintainerProposalApiHandler({
    ...successDeps(),
    providerReadiness: [
      { provider: 'ai-gateway', ready: true, blockers: [] },
      { provider: 'open-model', ready: true, blockers: [] }
    ],
    executorFactory: worker => async () => {
      calls.push(worker.provider);
      if (worker.provider === 'ai-gateway') return { ok: false, outcome: 'UNCERTAIN', uncertain: true, reasonCodes: ['transport-uncertain'] };
      return providerResult();
    }
  });
  const res = responseCapture();
  await handler(request(proposalBody()), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(calls, ['ai-gateway']);
  assert.equal(res.payload.status, 'PROVIDER_OUTCOME_UNCERTAIN');
});

test('proposal API fails closed when no proposal-capable provider is actually ready', async () => {
  const handler = createSelfMaintainerProposalApiHandler(successDeps({ readiness: [
    { provider: 'ai-gateway', ready: false, blockers: ['credential-absent'] },
    { provider: 'open-model', ready: false, blockers: ['runtime-absent'] }
  ] }));
  const res = responseCapture();
  await handler(request(proposalBody()), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.status, 'PROVIDER_BLOCKED');
  assert.equal(res.payload.businessEffectAuthority, 'NONE');
});
