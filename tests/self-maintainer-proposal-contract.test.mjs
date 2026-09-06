import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import {
  SELF_MAINTAINER_PROPOSAL_PROFILE,
  SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA,
  compileSelfMaintainerProposalWorkerResult,
  isSelfMaintainerProposalTask,
  selfMaintainerProposalTaskReasons
} from '../src/self-maintainer-proposal-contract.mjs';

const BASE = 'a'.repeat(40);
const BEFORE = contentSha256('export const oldValue = 1;\n');

function task(overrides = {}) {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Repair one bounded internal source defect.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`, 'capability:self-maintainer'],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [
      `exact-base-revision:${BASE}`,
      'one-bounded-change-set',
      'local-preparation-only',
      'business-effect-authority:none'
    ],
    forbiddenActions: ['merge', 'deploy', 'send', 'spend', 'change-credentials', 'change-dns'],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 120000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function proposal(overrides = {}) {
  return {
    decision: 'PROCEED',
    summary: 'Repair a bounded source defect without changing authority.',
    baseRevision: BASE,
    changes: [
      {
        operation: 'UPDATE',
        path: 'src/example-safe-module.mjs',
        beforeSha256: BEFORE,
        content: 'export const oldValue = 2;\n',
        rationale: 'Make the smallest causal source repair.'
      }
    ],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`, 'test:focused-reproduction'],
    cognitivePrioritiesConsidered: ['self-maintainer', 'wallbreaker'],
    ...overrides
  };
}

test('proposal profile has one explicit name and a closed raw schema', () => {
  assert.equal(SELF_MAINTAINER_PROPOSAL_PROFILE, 'SELF_MAINTAINER_PROPOSAL');
  assert.equal(SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    [...SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA.required].sort(),
    ['baseRevision', 'changes', 'cognitivePrioritiesConsidered', 'decision', 'evidenceRefs', 'summary', 'verification'].sort()
  );
});

test('exact self-maintainer task is recognized and weaker lookalikes are rejected', () => {
  assert.equal(isSelfMaintainerProposalTask(task()), true);
  assert.deepEqual(selfMaintainerProposalTaskReasons(task()), []);
  assert.equal(isSelfMaintainerProposalTask(task({ parentTask: `main:${'b'.repeat(40)}` })), false);
  assert.equal(isSelfMaintainerProposalTask(task({ targetAgent: 'generic-agent' })), false);
  assert.equal(isSelfMaintainerProposalTask(task({ consequenceClass: '' })), false);
  assert.equal(isSelfMaintainerProposalTask(task({ requiredOutputs: ['outcome'] })), false);
});

test('raw model edits become a canonical AgentCodeChangeSet with derived identity', () => {
  const out = compileSelfMaintainerProposalWorkerResult({ task: task(), proposal: proposal() });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CANONICAL_CHANGESET_PROPOSED');
  assert.match(out.codeChangeSet.changeSetId, /^agent_changes_[a-f0-9]{24}$/);
  assert.equal(out.codeChangeSet.businessEffectAuthority, 'NONE');
  assert.equal(out.codeChangeSet.baseRevision, BASE);
  assert.equal(out.result.codeChangeSet.changeSetId, out.codeChangeSet.changeSetId);
  assert.equal(out.result.decision, 'PROCEED');
  assert.equal(out.result.testsActuallyRun.length, 0, 'proposal generation must never pretend verification ran');
  assert.equal(out.result.truthTable.find(row => row.claim.includes('isolated deterministic'))?.status, 'UNRESOLVED');
  assert.deepEqual(out.result.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
});

test('model cannot forge canonical IDs, hashes, authority or policy fields', () => {
  const forbidden = ['changeSetId', 'afterSha256', 'policyVersion', 'businessEffectAuthority', 'totals'];
  for (const key of forbidden) assert.equal(Object.hasOwn(SELF_MAINTAINER_RAW_PROPOSAL_SCHEMA.properties, key), false);
  const out = compileSelfMaintainerProposalWorkerResult({
    task: task(),
    proposal: { ...proposal(), changeSetId: 'forged', policyVersion: 'forged', businessEffectAuthority: 'ALL' }
  });
  assert.equal(out.ok, true);
  assert.notEqual(out.codeChangeSet.changeSetId, 'forged');
  assert.equal(out.codeChangeSet.businessEffectAuthority, 'NONE');
});

test('exact-base mismatch is rejected before compilation', () => {
  const out = compileSelfMaintainerProposalWorkerResult({
    task: task(),
    proposal: proposal({ baseRevision: 'b'.repeat(40) })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('proposal-base-revision-mismatch'));
});

test('protected and sovereignty paths remain impossible through the canonical compiler', () => {
  for (const path of ['package.json', 'scripts/run-tests.mjs', 'src/agent-code-change-contract.mjs', 'scripts/uberbond-self-maintainer-tick.mjs']) {
    const out = compileSelfMaintainerProposalWorkerResult({
      task: task(),
      proposal: proposal({ changes: [{ ...proposal().changes[0], path }] })
    });
    assert.equal(out.ok, false, path);
    assert.ok(out.reasonCodes.some(code => code.includes('protected-path') || code.includes('sovereignty-path')), `${path}: ${out.reasonCodes.join(', ')}`);
  }
});

test('missing before hash, secret-bearing content and verification weakening fail closed', () => {
  const noHash = compileSelfMaintainerProposalWorkerResult({
    task: task(), proposal: proposal({ changes: [{ ...proposal().changes[0], beforeSha256: '' }] })
  });
  assert.equal(noHash.ok, false);
  assert.ok(noHash.reasonCodes.some(code => code.includes('before-hash-required')));

  const secret = compileSelfMaintainerProposalWorkerResult({
    task: task(),
    proposal: proposal({
      changes: [{ ...proposal().changes[0], content: `const OPENAI_API_KEY = '${'sk-proj-' + 'z'.repeat(48)}';\n` }]
    })
  });
  assert.equal(secret.ok, false);
  assert.ok(secret.reasonCodes.some(code => code.includes('credential-material-rejected')));

  const weakened = compileSelfMaintainerProposalWorkerResult({
    task: task(), proposal: proposal({ verification: ['npm run check:syntax'] })
  });
  assert.equal(weakened.ok, false);
  assert.ok(weakened.reasonCodes.includes('proposal-required-verification-missing:npm run test:deterministic'));
});

test('STOP path carries no edits and no fake verification claims', () => {
  const out = compileSelfMaintainerProposalWorkerResult({
    task: task(),
    proposal: proposal({ decision: 'STOP', changes: [], summary: 'No safe worthwhile repair found.' })
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'NO_SAFE_CHANGE_PROPOSED');
  assert.equal(out.result.decision, 'STOP');
  assert.deepEqual(out.result.changedArtifacts, []);
  assert.deepEqual(out.result.testsActuallyRun, []);
  assert.equal('codeChangeSet' in out.result, false);
});

test('STOP cannot smuggle edits', () => {
  const out = compileSelfMaintainerProposalWorkerResult({
    task: task(), proposal: proposal({ decision: 'STOP' })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('stop-proposal-must-not-carry-changes'));
});
