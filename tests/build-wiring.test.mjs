import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { syntaxCheckTargets } from '../scripts/check-syntax.mjs';
import { deterministicTestFiles, reachableTestFiles, testImportsOf } from '../scripts/run-tests.mjs';
import { join } from 'node:path';

// A test file that exists but runs in no npm script is worse than no test at
// all: it looks like coverage, reports nothing, and rots. This was not
// hypothetical -- an incoming branch added 22 test files without touching
// package.json, and one of them was failing. Nobody could have known, because
// nothing ever executed it. These guards make that state impossible to reach
// quietly: adding a file and forgetting to wire it now fails the suite that
// the author is already running.

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = pkg.scripts || {};

function walk(dir, out = []) {
  for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.mjs')) out.push(rel);
  }
  return out;
}

// The suites are discovered now rather than listed, because the listed form
// grew until npm refused to execute it. These guard the discovery instead.

test('every test file on disk actually runs, by name or by import', () => {
  const reachable = reachableTestFiles();
  const excluded = new Set(['tests/browser.test.mjs', 'tests/postgres-store-live.test.mjs']);
  const onDisk = readdirSync(new URL('../tests/', import.meta.url))
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => `tests/${name}`);

  const orphans = onDisk.filter(file => !reachable.has(file) && !excluded.has(file));
  assert.deepEqual(
    orphans, [],
    `these test files never execute:\n  ${orphans.join('\n  ')}`
  );
});

test('no test file runs twice', () => {
  // A file handed to `node --test` that another handed file also imports is
  // loaded twice, and every test inside it is counted twice -- inflating the
  // number a reader trusts. The runner excludes imported files; this pins it.
  const handed = deterministicTestFiles();
  const handedSet = new Set(handed);
  const doubled = handed.filter(file =>
    handed.some(other => other !== file && testImportsOf(other).includes(file)));
  assert.deepEqual(doubled, [], `these would execute twice:\n  ${doubled.join('\n  ')}`);
  assert.equal(handedSet.size, handed.length, 'the runner handed the same file twice');
});

test('the deterministic suite excludes the suites that need a browser or a live database', () => {
  const handed = new Set(deterministicTestFiles());
  assert.ok(!handed.has('tests/browser.test.mjs'), 'browser tests must not run in the deterministic set');
  assert.ok(!handed.has('tests/postgres-store-live.test.mjs'), 'live-database tests must not run in the deterministic set');
});

test('the suites are discovered, not spelled out in a string that can outgrow the shell', () => {
  // The concrete failure this prevents: npm echoed an 8,674-character
  // check:syntax and exited 216 having checked nothing, and did the same for
  // test:deterministic. Both reported failure while providing zero coverage.
  assert.equal(scripts['test:deterministic'], 'node scripts/run-tests.mjs deterministic');
  assert.equal(scripts['check:syntax'], 'node scripts/check-syntax.mjs');
  // A canary, not a proof. The two scripts that actually stopped executing
  // were 8,674 and 4,496 characters; 2,000 leaves real headroom while still
  // catching a script drifting back toward the size that breaks. Deliberately
  // not tighter: test:relay-safety is a legitimate 412-character list and
  // failing it would be inventing a rule rather than protecting an invariant.
  for (const [name, command] of Object.entries(scripts)) {
    assert.ok(
      command.length < 2000,
      `script "${name}" is ${command.length} chars and drifting toward the size at which npm stops executing it`
    );
  }
});

test('the syntax check still covers every src module', () => {
  // check:syntax used to be ~186 `node --check` calls chained with `&&`. That
  // string grew with every merge until npm stopped running it at all -- it
  // echoed the command and exited 216 having checked nothing, so the gate
  // reported failure while providing no coverage. It now walks the tree, which
  // makes "somebody forgot to add the new module" structurally impossible.
  //
  // What remains worth guarding is the walk itself: drop 'src' from its roots
  // and coverage silently vanishes with no other symptom.
  const covered = new Set(syntaxCheckTargets());
  const missing = walk('src').filter(file => !covered.has(file));
  assert.deepEqual(
    missing, [],
    `the syntax checker no longer covers these src modules:\n  ${missing.join('\n  ')}`
  );
  assert.ok(covered.size > 100, `suspiciously few files covered: ${covered.size}`);
  assert.equal(scripts['check:syntax'], 'node scripts/check-syntax.mjs',
    'check:syntax must run the checker rather than an inline chain that can outgrow the shell');
});

test('the deterministic suite references no test file that has been deleted', () => {
  // The mirror of the orphan check. A stale entry makes `npm run
  // test:deterministic` die with a module-not-found before running anything,
  // which reads as catastrophic failure rather than a one-line bookkeeping slip.
  const onDisk = new Set(
    readdirSync(new URL('../tests/', import.meta.url))
      .filter(name => name.endsWith('.test.mjs'))
      .map(name => `tests/${name}`)
  );
  const referenced = (scripts['test:deterministic'] || '')
    .split(/\s+/)
    .filter(token => token.endsWith('.test.mjs'));

  const dangling = referenced.filter(file => !onDisk.has(file));
  assert.deepEqual(dangling, [], `test:deterministic references files that no longer exist:\n  ${dangling.join('\n  ')}`);
});

test('the deterministic suite lists each file once', () => {
  // A duplicate silently doubles that file's runtime and its output, which is
  // confusing to read and easy to introduce when resolving a merge conflict on
  // this exact line -- as happened twice this week.
  const referenced = (scripts['test:deterministic'] || '')
    .split(/\s+/)
    .filter(token => token.endsWith('.test.mjs'));
  const seen = new Set();
  const dupes = referenced.filter(file => (seen.has(file) ? true : (seen.add(file), false)));
  assert.deepEqual([...new Set(dupes)], [], 'test:deterministic lists these files more than once');
});

// The deterministic gate must not change its answer because of the shell it was
// invoked from.
//
// Most database suites stay in the deterministic set and skip themselves when
// OMNIA_V9_TEST_DATABASE_URL is absent. Export that variable and they execute
// here instead -- in parallel, sharing one database, which is the interference
// `run-real-postgres-tests.mjs` runs serially to avoid. Observed once: a red
// property test that passed in isolation. A gate that fails for a reason
// unrelated to the code is worse than a gate that is merely strict.
test('the deterministic runner drops the database URL for its children', () => {
  const source = readFileSync(new URL('../scripts/run-tests.mjs', import.meta.url), 'utf8');
  assert.match(source, /delete\s+\w+\.OMNIA_V9_TEST_DATABASE_URL/,
    'the deterministic runner must remove OMNIA_V9_TEST_DATABASE_URL from the child environment');
  assert.match(source, /spawnSync\([^)]*env:/s,
    'and must actually pass that environment to the child, or deleting it changes nothing');
});
