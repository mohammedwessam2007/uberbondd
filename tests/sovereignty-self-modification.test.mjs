// A system may not widen its own authority.
//
// The change contract protected the build and verification graph -- package.json,
// the test runner, the syntax checker -- so an untrusted edit could not hide its
// own failures from the gate about to check it. It did not protect the limits
// themselves. A probe compiled a well-formed change set, bland rationale and a
// passing verification command, replacing each of these with a single comment:
//
//   ACCEPTED  src/agent-code-change-contract.mjs
//   ACCEPTED  src/deliverability-guard.mjs
//   ACCEPTED  src/agent-autonomy-loop.mjs
//   ACCEPTED  src/cloud-agent-relay.mjs
//   ...
//
// Every one. Including the contract module itself: the self-improvement path
// could delete its own guard, and then on the next pass anything at all. The
// first probe run reported BLOCKED for all twelve -- but only because the
// fixture had omitted `rationale`. An incidental refusal is not a guarantee,
// which is why these tests assert the reason code and not merely the refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS,
  BUILD_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

function changeSet(path, overrides = {}) {
  return compileAgentCodeChangeSet({
    taskId: 'task_selfmod',
    baseRevision: 'abc123',
    changes: [{
      operation: 'UPDATE',
      path,
      beforeSha256: contentSha256('anything'),
      content: '// authority removed\n',
      rationale: 'Simplifying an over-complicated module as part of routine maintenance.'
    }],
    verification: ['npm test'],
    summary: 'routine refactor',
    ...overrides
  });
}

test('no sovereignty module can be edited by the autonomous path', () => {
  for (const path of SOVEREIGNTY_PROTECTED_PATHS) {
    const result = changeSet(path);
    assert.equal(result.ok, false, `${path} was accepted`);
    assert.ok(result.reasonCodes.includes('change-0-sovereignty-path'),
      `${path} was refused, but for an unrelated reason: ${JSON.stringify(result.reasonCodes)}`);
  }
});

test('the contract cannot rewrite the list that binds it', () => {
  // The one that matters most: if this is editable, every other entry is
  // editable one pass later.
  const result = changeSet('src/agent-code-change-contract.mjs');
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('change-0-sovereignty-path'));
  assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes('src/agent-code-change-contract.mjs'),
    'the list must contain the file that defines it');
});

test('deleting a sovereignty module is refused, not only rewriting it', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_delete', baseRevision: 'abc123',
    changes: [{
      operation: 'DELETE', path: 'src/deliverability-guard.mjs',
      beforeSha256: contentSha256('anything'),
      rationale: 'Removing an unused module found during cleanup.'
    }],
    verification: ['npm test'], summary: 'cleanup'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('change-0-sovereignty-path'));
});

test('a sovereignty edit hidden among ordinary changes still fails the whole set', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'task_mixed', baseRevision: 'abc123',
    changes: [
      { operation: 'UPDATE', path: 'src/lead-operations.mjs', beforeSha256: contentSha256('a'), content: '// ok\n', rationale: 'Tidy up a helper.' },
      { operation: 'UPDATE', path: 'src/secret-patterns.mjs', beforeSha256: contentSha256('b'), content: '// ok\n', rationale: 'Tidy up a helper.' },
      { operation: 'UPDATE', path: 'src/opportunity-registry.mjs', beforeSha256: contentSha256('c'), content: '// ok\n', rationale: 'Tidy up a helper.' }
    ],
    verification: ['npm test'], summary: 'batch cleanup'
  });
  assert.equal(result.ok, false, 'a change set is accepted or refused whole');
  assert.ok(result.reasonCodes.includes('change-1-sovereignty-path'));
});

test('path tricks do not reach a sovereignty module', () => {
  for (const path of [
    'src/../src/deliverability-guard.mjs',
    './src/deliverability-guard.mjs',
    'src//deliverability-guard.mjs',
    'src/Deliverability-Guard.mjs',
    '/src/deliverability-guard.mjs'
  ]) {
    const result = changeSet(path);
    assert.equal(result.ok, false, `${path} was accepted`);
  }
});

test('sovereignty and build protection are told apart', () => {
  const build = changeSet('package.json');
  assert.ok(build.reasonCodes.includes('change-0-protected-path'));
  assert.ok(!build.reasonCodes.includes('change-0-sovereignty-path'),
    'editing the build graph and editing your own limits are different attempts');

  const sovereign = changeSet('src/effect-ledgers.mjs');
  assert.ok(sovereign.reasonCodes.includes('change-0-sovereignty-path'));
});

test('an ordinary module is still editable: this is a boundary, not a freeze', () => {
  const result = changeSet('src/lead-operations.mjs');
  assert.equal(result.ok, true,
    'protecting everything would stop the autonomous path from doing any work at all');
});

test('every listed sovereignty path names a file that exists', () => {
  // A protection entry for a file that was renamed protects nothing, and reads
  // as though it does.
  const missing = SOVEREIGNTY_PROTECTED_PATHS.filter(path => !existsSync(path));
  assert.deepEqual(missing, [],
    'these sovereignty entries name files that are not in the repository');
});

test('the modules that decide what may be sent, claimed or hidden are all covered', () => {
  // Named explicitly rather than derived, so adding a new guard without adding
  // it here fails loudly instead of being quietly unprotected.
  for (const path of [
    'src/deliverability-guard.mjs',
    'src/cloud-agent-relay.mjs',
    'src/effect-ledgers.mjs',
    'src/secret-patterns.mjs',
    'src/payment-renewal-truth.mjs',
    'src/operator-escalation.mjs',
    'src/agent-autonomy-loop.mjs',
    'src/agent-worker-result-truth.mjs',
    'src/claude-code-sandbox-provisioner.mjs',
    'src/agent-code-change-contract.mjs'
  ]) {
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(path), `${path} is not protected`);
  }
});

test('the guard is load-bearing: removing an entry lets the edit through', () => {
  // Mutation test. If this ever passes with the entry still present, the
  // protection is being enforced somewhere else and this list is decoration.
  const source = readFileSync('src/agent-code-change-contract.mjs', 'utf8');
  assert.ok(source.includes("'src/deliverability-guard.mjs'"),
    'the entry under test must actually be in the list');
  assert.ok(BUILD_PROTECTED_PATHS.length > 0 && SOVEREIGNTY_PROTECTED_PATHS.length > 0,
    'both tiers must be non-empty; an empty list refuses nothing');
  // The positive control: a path absent from both lists is accepted, so the
  // refusals above come from membership rather than from a blanket denial.
  assert.equal(changeSet('src/market-signal-registry.mjs').ok, true);
});
