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

// The consumers of the one decision in this family that is actually a decision.
//
// `evaluateContactRoute` is where suppression beats verification: an unsubscribe
// is sticky and no fresher provider check gets to outvote it. A caller that
// discarded that verdict would hand off a suppressed contact as usable, which is
// the most expensive mistake available in this repository.
//
// Both callers are dormant behind NO_ENRICHMENT_PROVIDER, so this closes nothing
// that runs today. It closes what this file already argues for the guards
// themselves: a clamp must not be weakenable while dormant and carried into
// activation.
//
// Two candidates from the same sweep were deliberately rejected, and the reasons
// matter as much as the fix:
//
//   `canonicalContactRoute` is a string canonicalizer -- it lowercases and strips
//   plus-addressing. It was flagged only because a decision-name heuristic caught
//   its `can` prefix.
//
//   `isStaleSignal` compares a signal's age against a `maxAgeMs` the caller
//   supplies, so a caller can already choose its own answer without discarding
//   anything. Protecting its callers would look like a boundary and enforce
//   nothing, which is worse than leaving them alone.
const CONTACT_ROUTE_CONSUMERS = [
  'src/overnight/intent/account-intent-ledger.mjs',
  'src/overnight/intent/budgeted-enrichment-waterfall.mjs'
];

test('the callers that ask whether a contact route is usable are protected', () => {
  for (const path of CONTACT_ROUTE_CONSUMERS) {
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(path),
      `${path} asks evaluateContactRoute whether a route is usable, so it can discard that answer`);
  }
});

test('a caller that only canonicalizes or reads freshness is left editable', () => {
  for (const path of ['src/market-signal-registry.mjs', 'src/prometheus-economic-spine.mjs']) {
    assert.equal(SOVEREIGNTY_PROTECTED_PATHS.includes(path), false,
      `${path} takes a threshold-parameterized freshness helper, not a decision; ` +
      'protecting it would enforce nothing and would make the boundary read as arbitrary');
  }
});

for (const path of CONTACT_ROUTE_CONSUMERS) {
  test(`autonomous UPDATE of ${path} is refused specifically for sovereignty`, () => {
    const result = compileAgentCodeChangeSet({
      taskId: `task_contact_route_consumer_${path.replaceAll('/', '_')}`,
      baseRevision: 'current-main',
      changes: [{
        operation: 'UPDATE',
        path,
        beforeSha256: contentSha256(`current ${path}`),
        content: 'const route = { usableForHandoff: true, status: "VALID" };\n',
        rationale: 'Skip a redundant route evaluation the caller already performed.'
      }],
      verification: ['npm run test:deterministic'],
      summary: 'pre-activation intent lane maintenance'
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('change-0-sovereignty-path'),
      `expected a sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`);
  });
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
