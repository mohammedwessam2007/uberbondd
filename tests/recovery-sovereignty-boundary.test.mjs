import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

const GUARDED = [
  ['src/durable-audit-scan.mjs', 'tests/durable-audit-scan-ceiling.test.mjs'],
  ['src/reservation-recovery.mjs', 'tests/reservation-recovery-race.test.mjs']
];

function compile(path, operation) {
  return compileAgentCodeChangeSet({
    taskId: `task_recovery_sovereignty_${operation.toLowerCase()}_${path.replaceAll('/', '_')}`,
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation,
      path,
      beforeSha256: contentSha256(`current ${path}`),
      content: operation === 'DELETE' ? null : '// weaken recovery truth guard\n',
      rationale: 'Routine maintenance of recovery truth.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'recovery sovereignty probe'
  });
}

test('recovery truth modules and their mutation-killing proofs are sovereignty-protected', () => {
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

test('recovery sovereignty expansion is not a blanket freeze', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_recovery_sovereignty_positive_control',
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation: 'UPDATE',
      path: 'src/market-signal.mjs',
      beforeSha256: contentSha256('current market signal source'),
      content: '// ordinary internal maintenance\n',
      rationale: 'Routine internal maintenance outside sovereignty.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'recovery sovereignty positive control'
  });
  assert.equal(result.ok, true, 'ordinary non-sovereignty code should remain editable');
});
