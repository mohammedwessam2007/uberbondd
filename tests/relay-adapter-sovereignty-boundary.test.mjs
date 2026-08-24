import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

const ADAPTERS = [
  'src/chatgpt-relay-client.mjs',
  'src/github-relay.mjs'
];

const PROOFS = [
  'tests/zero-effect-agreement.test.mjs',
  'tests/github-relay.test.mjs'
];

function compile(path, operation = 'UPDATE') {
  return compileAgentCodeChangeSet({
    taskId: `task_relay_adapter_sovereignty_${path.replaceAll('/', '_')}_${operation.toLowerCase()}`,
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation,
      path,
      beforeSha256: contentSha256(`current ${path}`),
      content: operation === 'DELETE' ? null : '// weaken canonical zero-effect agreement\n',
      rationale: 'Routine maintenance of relay zero-effect interpretation.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'relay adapter sovereignty maintenance'
  });
}

test('relay adapters that interpret zero-effect truth are sovereignty-protected', () => {
  for (const path of ADAPTERS) {
    assert.ok(
      SOVEREIGNTY_PROTECTED_PATHS.includes(path),
      `${path} must be sovereignty-protected because Wave 19 mutates its zero-effect guard`
    );
  }
});

test('mutation-killing relay proofs are sovereignty-protected with their guards', () => {
  for (const path of PROOFS) {
    assert.ok(
      SOVEREIGNTY_PROTECTED_PATHS.includes(path),
      `${path} must be protected with the relay guard it proves`
    );
  }
});

for (const path of ADAPTERS) {
  test(`autonomous UPDATE of ${path} is refused for sovereignty`, () => {
    const result = compile(path, 'UPDATE');
    assert.equal(result.ok, false);
    assert.ok(
      result.reasonCodes.includes('change-0-sovereignty-path'),
      `expected sovereignty refusal for ${path}, got ${JSON.stringify(result.reasonCodes)}`
    );
  });

  test(`autonomous DELETE of ${path} is refused for sovereignty`, () => {
    const result = compile(path, 'DELETE');
    assert.equal(result.ok, false);
    assert.ok(
      result.reasonCodes.includes('change-0-sovereignty-path'),
      `expected sovereignty refusal for ${path}, got ${JSON.stringify(result.reasonCodes)}`
    );
  });
}

test('relay sovereignty expansion does not become a blanket freeze', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_relay_adapter_sovereignty_positive_control',
    baseRevision: 'black-sky-current-main',
    changes: [{
      operation: 'UPDATE',
      path: 'src/market-signal.mjs',
      beforeSha256: contentSha256('current market signal source'),
      content: '// ordinary internal maintenance\n',
      rationale: 'Routine internal maintenance outside sovereignty.'
    }],
    verification: ['npm run test:deterministic'],
    summary: 'relay sovereignty positive control'
  });
  assert.equal(result.ok, true, 'sovereignty expansion must not become a blanket freeze');
});
