import test from 'node:test';
import assert from 'node:assert/strict';
import { SOVEREIGNTY_PROTECTED_PATHS, compileAgentCodeChangeSet } from '../src/agent-code-change-contract.mjs';
import { MUTATIONS } from '../scripts/mutation-war.mjs';

// Protecting a guard and leaving its proof editable protects nothing on the
// second move.
//
// The sovereignty list had a section for "the tests that prove the guards above
// still guard". It held four entries, which were right when they were written.
// Every killing test added afterwards was left out, and by the time a probe
// checked, fifteen of the twenty suites that prove a sovereignty guard still
// guards were editable by the autonomous path -- as was scripts/mutation-war.mjs
// itself, the single artifact that decides whether any of them still kill.
//
// A list that has to be remembered rots. This derives the requirement instead:
// if a mutation targets a sovereignty-protected file, the suite that kills it is
// part of the sovereignty boundary by construction.

const protectedPaths = new Set(SOVEREIGNTY_PROTECTED_PATHS);

test('the mutation runner is inside the boundary it verifies', () => {
  assert.ok(protectedPaths.has('scripts/mutation-war.mjs'),
    'the runner that decides whether the guards still guard must not be editable by the path it guards');
});

test('this test is itself protected', () => {
  // Otherwise the first move is to delete this file.
  assert.ok(protectedPaths.has('tests/sovereignty-proof-closure.test.mjs'));
});

test('every killing test for a sovereignty file is protected', () => {
  const missing = [];
  for (const mutation of MUTATIONS) {
    if (!protectedPaths.has(mutation.file)) continue;
    for (const suite of mutation.suites) {
      if (!protectedPaths.has(suite)) missing.push(`${mutation.id} -> ${suite}`);
    }
  }
  assert.deepEqual(missing, [],
    'these suites prove a sovereignty guard and are editable by the autonomous path');
});

test('the boundary is not padded with suites that prove nothing', () => {
  // The cost of this list is that a person is needed to change anything on it.
  // Every test entry must be earned by naming a mutation on a protected file,
  // or be one of the two structural entries above.
  const structural = new Set(['tests/sovereignty-proof-closure.test.mjs', 'tests/reachability-ratchet.test.mjs']);
  const earned = new Set();
  for (const mutation of MUTATIONS) {
    if (!protectedPaths.has(mutation.file)) continue;
    for (const suite of mutation.suites) earned.add(suite);
  }
  const unearned = [...protectedPaths]
    .filter(p => p.startsWith('tests/') && !structural.has(p) && !earned.has(p));
  assert.deepEqual(unearned, [],
    'these protected tests are not named by any mutation on a protected file');
});

test('the autonomous path cannot edit the mutation runner', () => {
  const result = compileAgentCodeChangeSet({
    taskId: 'closure-check',
    baseRevision: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    summary: 'a summary long enough to be considered real work by the contract',
    consequenceClass: 'LOCAL_PREPARATION',
    verification: ['npm run check:syntax'],
    changes: [{
      operation: 'UPDATE',
      path: 'scripts/mutation-war.mjs',
      rationale: 'a per-change rationale long enough to be considered real',
      content: 'export const MUTATIONS = [];\n',
      beforeSha256: 'a'.repeat(64)
    }]
  });
  assert.equal(result.ok, false);
  assert.ok((result.reasonCodes || []).some(code => String(code).includes('sovereignty')),
    'emptying the mutation list must be refused as a sovereignty path, not merely as malformed');
});

test('the autonomous path cannot edit a killing test', () => {
  for (const path of ['tests/secret-format-coverage.test.mjs', 'tests/payment-currency-truth.test.mjs']) {
    const result = compileAgentCodeChangeSet({
      taskId: 'closure-check',
      baseRevision: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      summary: 'a summary long enough to be considered real work by the contract',
      consequenceClass: 'LOCAL_PREPARATION',
      verification: ['npm run check:syntax'],
      changes: [{
        operation: 'UPDATE', path,
        rationale: 'a per-change rationale long enough to be considered real',
        content: '// removed\n',
        beforeSha256: 'a'.repeat(64)
      }]
    });
    assert.equal(result.ok, false, `${path} was editable`);
    assert.ok((result.reasonCodes || []).some(code => String(code).includes('sovereignty')), path);
  }
});

test('every mutation names at least one suite, so none can hide from this check', () => {
  const naked = MUTATIONS.filter(m => !Array.isArray(m.suites) || !m.suites.length).map(m => m.id);
  assert.deepEqual(naked, []);
});
