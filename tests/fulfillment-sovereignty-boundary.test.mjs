import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

function compile(operation = 'UPDATE') {
  return compileAgentCodeChangeSet({
    taskId: `task_fulfillment_sovereignty_${operation.toLowerCase()}`,
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation,
      path: 'src/service-fulfillment.mjs',
      beforeSha256: contentSha256('current fulfillment source'),
      content: operation === 'DELETE' ? null : '// weaken acceptance and retention guards\n',
      rationale: 'Routine maintenance of fulfillment lifecycle rules.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'fulfillment lifecycle maintenance'
  });
}

test('service fulfillment is a sovereignty-protected economic-truth module', () => {
  assert.ok(
    SOVEREIGNTY_PROTECTED_PATHS.includes('src/service-fulfillment.mjs'),
    'customer acceptance/renewal/retention truth must be sovereignty-protected'
  );
});

test('autonomous UPDATE of service fulfillment is refused for the sovereignty reason', () => {
  const result = compile('UPDATE');
  assert.equal(result.ok, false);
  assert.ok(
    result.reasonCodes.includes('change-0-sovereignty-path'),
    `expected sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`
  );
});

test('autonomous DELETE of service fulfillment is refused for the sovereignty reason', () => {
  const result = compile('DELETE');
  assert.equal(result.ok, false);
  assert.ok(
    result.reasonCodes.includes('change-0-sovereignty-path'),
    `expected sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`
  );
});

test('the sovereignty boundary is not a blanket freeze', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_positive_control',
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation: 'UPDATE',
      path: 'src/market-signal.mjs',
      beforeSha256: contentSha256('current market signal source'),
      content: '// ordinary internal maintenance\n',
      rationale: 'Routine internal maintenance outside sovereignty.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'positive control'
  });
  assert.equal(result.ok, true, 'ordinary non-sovereignty code should remain editable');
});
