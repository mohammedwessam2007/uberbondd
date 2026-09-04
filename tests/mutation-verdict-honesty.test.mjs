import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTATIONS, classifySuiteRun, applyMutation } from '../scripts/mutation-war.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The mutation war is the artifact that decides whether every other guard in
// this repository still guards. Its own verdicts had two ways of being false,
// and they failed in opposite directions.
//
// It read the verdict from the suite's exit status alone. A green run became
// SURVIVED and a red one became KILLED, and neither is reliably true:
//
//   - MONEY-17's only killing suite needs a real PostgreSQL. Without one the
//     suite skipped itself and exited 0, so the war reported "a guard nothing
//     kills" about a guard nothing had tried to kill. Loud, but false -- and
//     the obvious repair is to hand-mark the mutation, which is a claim
//     nothing checks.
//
//   - A mutant that broke the module at import time makes the suite exit
//     non-zero without a single failed assertion. That was recorded as KILLED:
//     a guard reported as proven by a run that proved nothing. Silent, and the
//     count still reads 94.
//
// So the verdict is now read from what the run reports. These tests hold that
// reading up, because a mutation harness whose own verdicts are unverified is
// exactly the shape of problem it exists to find.

test('a failing assertion is what kills a mutant', () => {
  assert.equal(classifySuiteRun({ status: 1, output: '# pass 3\n# fail 1\n# skipped 0\n' }), 'KILLED');
});

// The dangerous direction. This one is silent: it inflates the killed count.
test('a suite that never ran is not a killed mutant, however it exited', () => {
  const didNotRun = [
    ['no test ever reported', '# pass 0\n# fail 0\n# skipped 0\n'],
    ['the module threw on import', 'Error: Cannot find module\n    at ModuleJob.run\n'],
    ['no TAP output at all', ''],
    ['the runner itself died', 'Segmentation fault\n']
  ];
  for (const [label, output] of didNotRun) {
    assert.equal(classifySuiteRun({ status: 1, output }), 'SUITE_DID_NOT_RUN',
      `${label}: a non-zero exit with no failed assertion proves nothing about the guard`);
  }
});

test('a green run that asserted nothing is not a surviving guard', () => {
  assert.equal(classifySuiteRun({ status: 0, output: '# pass 0\n# fail 0\n# skipped 1\n' }),
    'NO_ASSERTIONS_RAN');
  assert.equal(classifySuiteRun({ status: 0, output: '# pass 0\n# fail 0\n# skipped 6\n' }),
    'NO_ASSERTIONS_RAN');
});

// The control. Without it every assertion above is satisfied by a classifier
// that never says SURVIVED, and a real surviving guard would stop being
// reported -- which is the failure this whole gate exists to prevent.
test('a green run that did assert things is a surviving guard, and still fails the war', () => {
  assert.equal(classifySuiteRun({ status: 0, output: '# pass 8\n# fail 0\n# skipped 0\n' }), 'SURVIVED');
  assert.equal(classifySuiteRun({ status: 0, output: '# pass 8\n# fail 0\n# skipped 2\n' }), 'SURVIVED',
    'a suite with some skips still proves something with the tests it did run');
});

// A declared runtime marker excludes a mutation from the war's totals entirely.
// That is the quiet direction: a mutation marked as needing a database it does
// not need is never verified by anyone, and the gate still exits 0.
//
// The requirement cannot be derived by searching suites for the variable name --
// measured against this registry, that over-matches. tests/build-wiring.test.mjs
// mentions OMNIA_V9_TEST_DATABASE_URL only to assert the deterministic runner
// strips it, and tests/store-lookup-allowlist.test.mjs has both a deterministic
// half and a real-database half, with different mutations relying on each. Both
// of those mutations are killed with no database present.
//
// So this asserts the direction that is safe to assert statically: a mutation
// claiming to need a database must at least name a suite that gates on one.
// The opposite direction needs no static rule -- a missing marker now surfaces
// at runtime as NO_ASSERTIONS_RAN rather than as a false verdict.
test('a mutation that claims to need a runtime names a suite that gates on it', () => {
  const unjustified = [];
  for (const mutation of MUTATIONS) {
    if (mutation.needsPostgres !== true) continue;
    const gated = mutation.suites.some(suite => {
      try { return /OMNIA_V9_TEST_DATABASE_URL|realPostgresUrl/.test(readFileSync(join(repoRoot, suite), 'utf8')); }
      catch { return false; }
    });
    if (!gated) unjustified.push(`${mutation.id} -> ${mutation.suites.join(', ')}`);
  }
  assert.deepEqual(unjustified, [],
    'these mutations are excluded from the war whenever no database is present, without a suite that needs one');
});

test('a runtime marker is a boolean, not merely something truthy', () => {
  const malformed = [];
  for (const mutation of MUTATIONS) {
    for (const marker of ['needsPostgres', 'needsBrowser']) {
      if (marker in mutation && mutation[marker] !== true) {
        malformed.push(`${mutation.id}.${marker} = ${JSON.stringify(mutation[marker])}`);
      }
    }
  }
  assert.deepEqual(malformed, [],
    "a marker set to false or a string reads as a decision and is not one; omit it instead");
});

// The idiom that caused this. Four suites expressed "no runtime, nothing to do"
// as a test that passes and logs, which reports as `# pass 1` -- indistinguishable
// from a proof to a reader, a CI summary, and the war. node:test has a real skip
// and it reports as `# skipped 1`.
test('no suite reports an absent runtime as a passing test', () => {
  const placeholders = [];
  for (const name of readdirSync(join(repoRoot, 'tests')).filter(file => file.endsWith('.test.mjs'))) {
    const source = readFileSync(join(repoRoot, 'tests', name), 'utf8');
    // A test whose *name* announces it is skipped, declared without the skip
    // option that would actually make it one.
    for (const match of source.matchAll(/\btest\(\s*(['"`])SKIPPED[^\n]*/g)) {
      if (!/\{\s*skip\s*:/.test(match[0])) placeholders.push(`tests/${name}: ${match[0].slice(0, 72)}`);
    }
  }
  assert.deepEqual(placeholders, [],
    'a green test named SKIPPED is a claim of proof; use node:test\'s { skip: reason } instead');
});

// How the anchor ambiguity was found: by writing a mutation of the war's own
// verdict logic and watching it survive.
//
// The anchor for it appeared twice in the file -- once in `classifySuiteRun`
// and once in the registry entry quoting it as a string. `replace` with a
// string pattern takes the first occurrence, so the mutation edited the
// registry entry, ran an unmutated tree, and reported SURVIVED. A mutation
// applied somewhere other than where it says proves nothing about the guard it
// names, while still producing a verdict as though it did.
//
// The logic now lives in its own module, which is why those anchors are unique
// again. This is the guard against the general case.
test('an anchor that matches more than once is refused, not applied to the first hit', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'uberbond-anchor-'));
  try {
    const before = 'const a = 1;\nconst duplicated = true;\nconst b = 2;\nconst duplicated = true;\n';
    writeFileSync(join(root, 'target.mjs'), before);

    const ambiguous = applyMutation(root, {
      file: 'target.mjs', find: 'const duplicated = true;', replace: ''
    });
    assert.equal(ambiguous.applied, false);
    assert.equal(ambiguous.reason, 'anchor-ambiguous');
    assert.equal(ambiguous.occurrences, 2);
    assert.equal(readFileSync(join(root, 'target.mjs'), 'utf8'), before,
      'a refused mutation must leave the file exactly as it was');

    // A missing anchor is a different mistake and needs a different repair.
    const missing = applyMutation(root, { file: 'target.mjs', find: 'not present', replace: '' });
    assert.equal(missing.applied, false);
    assert.equal(missing.reason, 'anchor-not-found');

    // And the control: a unique anchor still applies.
    const applied = applyMutation(root, { file: 'target.mjs', find: 'const a = 1;', replace: 'const a = 9;' });
    assert.equal(applied.applied, true);
    assert.match(readFileSync(join(root, 'target.mjs'), 'utf8'), /const a = 9;/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Every anchor in the registry, checked against the tree it points at. The
// ambiguity above was latent in the registry for as long as the war could
// mutate its own source.
test('every registered mutation anchor identifies exactly one site', () => {
  const ambiguous = [];
  const missing = [];
  for (const mutation of MUTATIONS) {
    let source;
    try { source = readFileSync(join(repoRoot, mutation.file), 'utf8'); }
    catch { missing.push(`${mutation.id}: ${mutation.file} does not exist`); continue; }
    const occurrences = source.split(mutation.find).length - 1;
    if (occurrences === 0) missing.push(`${mutation.id}: anchor not present in ${mutation.file}`);
    if (occurrences > 1) ambiguous.push(`${mutation.id}: anchor matches ${occurrences} sites in ${mutation.file}`);
  }
  assert.deepEqual(ambiguous, [], 'an ambiguous anchor produces a verdict about the wrong code');
  assert.deepEqual(missing, [], 'a mutation whose anchor is gone verifies nothing');
});

// A hang is the third thing an exit code cannot express, and the only one that
// stops the gate instead of misreporting it.
//
// The war ran suites with no deadline. One suite that never returned -- and a
// real database makes that reachable, as the postgres-real runner found -- left
// the whole run in ep_poll with no output and no verdict, on a mutation nobody
// could name without reading /proc. Thirteen minutes of one run went that way.
test('a suite killed at its deadline is named as such, not read as a verdict', () => {
  // spawnSync reports a timeout kill through `error`, not through the status,
  // so a caller that only looks at the exit code sees an ordinary failure.
  assert.equal(classifySuiteRun({ status: null, output: '', timedOut: true }), 'SUITE_TIMED_OUT');

  // And it must dominate. A partial TAP stream from a suite that was killed
  // mid-run can carry a failure count, which would otherwise read as a mutant
  // that died when in fact nothing finished.
  assert.equal(
    classifySuiteRun({ status: 1, output: '# fail 1\n# pass 3\n', timedOut: true }),
    'SUITE_TIMED_OUT',
    'a killed suite must not be reported as a kill because it printed a failure on the way out');

  // Without the flag, nothing changes: the ordinary verdicts still apply.
  assert.equal(classifySuiteRun({ status: 1, output: '# fail 1\n# pass 3\n' }), 'KILLED');
  assert.equal(classifySuiteRun({ status: 0, output: '# fail 0\n# pass 3\n# skipped 0\n' }), 'SURVIVED');
});
