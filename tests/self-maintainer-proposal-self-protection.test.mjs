import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { compileSelfMaintainerProposalWorkerResult } from '../.github/workflows/runtime/self-maintainer-proposal-contract.mjs';

const BASE = 'b'.repeat(40);
const BEFORE = contentSha256('old\n');

function task() {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Make one bounded internal improvement.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`],
    requiredOutputs: ['outcome', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 10000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION'
  };
}

function proposal(targetPath) {
  return {
    decision: 'PROCEED',
    summary: 'Attempt one bounded edit.',
    baseRevision: BASE,
    changes: [{
      operation: 'UPDATE',
      path: targetPath,
      beforeSha256: BEFORE,
      content: 'new\n',
      rationale: 'Attempt to modify the proposal surface.'
    }],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`],
    cognitivePrioritiesConsidered: ['self-maintainer']
  };
}

for (const targetPath of [
  'api/self-maintainer-proposal.mjs',
  'api/./self-maintainer-proposal.mjs',
  'api/x/../self-maintainer-proposal.mjs',
  'api\\self-maintainer-proposal.mjs',
  'vercel.json',
  './vercel.json'
]) {
  test(`autonomous proposal cannot rewrite its own authenticated surface: ${targetPath}`, () => {
    const out = compileSelfMaintainerProposalWorkerResult({ task: task(), proposal: proposal(targetPath) });
    assert.equal(out.ok, false, JSON.stringify(out));
    assert.ok(out.reasonCodes.includes('proposal-change-0-self-protected-path'), JSON.stringify(out.reasonCodes));
  });
}
