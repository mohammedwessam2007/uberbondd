import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

function compile(path, operation = 'UPDATE') {
  return compileAgentCodeChangeSet({
    taskId: `task_founder_absence_sovereignty_${operation.toLowerCase()}`,
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation,
      path,
      beforeSha256: contentSha256(`current ${path}`),
      content: operation === 'DELETE' ? null : '// weaken founder-absence readiness guard\n',
      rationale: 'Routine maintenance of unattended-readiness rules.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'founder-absence readiness maintenance'
  });
}

test('founder-absence readiness is sovereignty-protected', () => {
  assert.ok(
    SOVEREIGNTY_PROTECTED_PATHS.includes('src/founder-absence-readiness.mjs'),
    'the module deciding whether unattended operation is ready must be sovereignty-protected'
  );
});

test('the ESC-04 killing proof is sovereignty-protected with its guard', () => {
  assert.ok(
    SOVEREIGNTY_PROTECTED_PATHS.includes('tests/founder-absence-deliverability.test.mjs'),
    'the test proving owner reachability remains required must be protected with its guard'
  );
});

test('autonomous UPDATE of founder-absence readiness is refused for sovereignty', () => {
  const result = compile('src/founder-absence-readiness.mjs', 'UPDATE');
  assert.equal(result.ok, false);
  assert.ok(
    result.reasonCodes.includes('change-0-sovereignty-path'),
    `expected sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`
  );
});

test('autonomous DELETE of founder-absence readiness is refused for sovereignty', () => {
  const result = compile('src/founder-absence-readiness.mjs', 'DELETE');
  assert.equal(result.ok, false);
  assert.ok(
    result.reasonCodes.includes('change-0-sovereignty-path'),
    `expected sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`
  );
});

test('ordinary non-sovereignty code remains editable', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_founder_absence_positive_control',
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation: 'UPDATE',
      path: 'src/market-signal-registry.mjs',
      beforeSha256: contentSha256('current market signal registry source'),
      content: '// ordinary internal maintenance\n',
      rationale: 'Routine internal maintenance outside sovereignty.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'founder-absence sovereignty positive control'
  });
  assert.equal(result.ok, true, 'sovereignty expansion must not become a blanket freeze');
});
