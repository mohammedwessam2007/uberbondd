import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

const GUARDED = [
  ['src/prospect-evidence-reconciliation.mjs', 'tests/evidence-class-laundering.test.mjs'],
  ['src/market-signal.mjs', 'tests/market-signal.test.mjs']
];

function compile(path, operation) {
  return compileAgentCodeChangeSet({
    taskId: `task_evidence_sovereignty_${operation.toLowerCase()}_${path.replaceAll('/', '_')}`,
    baseRevision: 'current-main',
    changes: [{
      operation,
      path,
      beforeSha256: contentSha256(`current ${path}`),
      content: operation === 'DELETE' ? null : '// weaken evidence provenance guard\n',
      rationale: 'Routine maintenance of evidence provenance rules.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'pre-activation evidence sovereignty maintenance'
  });
}

test('evidence provenance modules and their mutation-killing proofs are protected', () => {
  for (const [modulePath, proofPath] of GUARDED) {
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(modulePath), `${modulePath} must be protected`);
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(proofPath), `${proofPath} must be protected with its guard`);
  }
});

for (const [modulePath] of GUARDED) {
  for (const operation of ['UPDATE', 'DELETE']) {
    test(`autonomous ${operation} of ${modulePath} is refused specifically for sovereignty`, () => {
      const result = compile(modulePath, operation);
      assert.equal(result.ok, false);
      assert.ok(
        result.reasonCodes.includes('change-0-sovereignty-path'),
        `expected sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`
      );
    });
  }
}

test('pre-activation evidence sovereignty is not a blanket freeze', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_evidence_sovereignty_positive_control',
    baseRevision: 'current-main',
    changes: [{
      operation: 'UPDATE',
      path: 'src/market-signal-registry.mjs',
      beforeSha256: contentSha256('current market signal registry source'),
      content: '// ordinary internal maintenance\n',
      rationale: 'Routine internal maintenance outside the evidence boundary.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'evidence sovereignty positive control'
  });
  assert.equal(result.ok, true, 'ordinary non-sovereignty code should remain editable');
});
