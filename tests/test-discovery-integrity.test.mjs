import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  deterministicTestFiles,
  reachableTestFiles,
  orphanedTestFiles,
  testImportsOf
} from '../scripts/run-tests.mjs';

// The gate defending itself.
//
// Two failures have already happened here, both silent, both the kind that
// make the reported number worse than no number. A suite stopped being listed
// and nobody noticed it had stopped running; and a file was both listed and
// imported, so every test inside it was counted twice. Neither showed up as a
// failure -- one shrank the pass count, the other grew it.

const TESTS_DIR = new URL('../tests/', import.meta.url);
const NON_DETERMINISTIC = new Set(['tests/browser.test.mjs', 'tests/postgres-store-live.test.mjs']);

function allOnDisk() {
  return readdirSync(TESTS_DIR).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`).sort();
}

test('every deterministic test file on disk actually executes', () => {
  assert.deepEqual(orphanedTestFiles(), [], 'a test file nobody runs is worse than no test file');
});

test('nothing is handed to node --test twice', () => {
  const files = deterministicTestFiles();
  assert.equal(new Set(files).size, files.length);
});

test('no file is both handed to the runner and imported by another', () => {
  const handed = new Set(deterministicTestFiles());
  const doubleCounted = [];
  for (const file of handed) {
    for (const child of testImportsOf(file)) {
      if (handed.has(child)) doubleCounted.push(`${file} -> ${child}`);
    }
  }
  assert.deepEqual(doubleCounted, [], 'an imported file must be excluded from the runner list');
});

test('the browser and live-database suites stay out of the deterministic set', () => {
  const handed = new Set(deterministicTestFiles());
  for (const file of NON_DETERMINISTIC) assert.equal(handed.has(file), false, `${file} must not be deterministic`);
});

test('the reachable set accounts for every file on disk', () => {
  const reachable = reachableTestFiles();
  const unaccounted = allOnDisk().filter(file => !reachable.has(file) && !NON_DETERMINISTIC.has(file));
  assert.deepEqual(unaccounted, []);
});

// The mutation tests. Each writes a file that would have defeated the previous
// version of the discovery logic, and requires the current version to catch it.
test('a named import of a test file is detected, not just a bare one', () => {
  const subject = join(TESTS_DIR.pathname, 'zz-discovery-subject.test.mjs');
  const importer = join(TESTS_DIR.pathname, 'zz-discovery-importer.test.mjs');
  try {
    writeFileSync(subject, "import test from 'node:test';\nexport const marker = 1;\ntest('subject', () => {});\n");
    writeFileSync(importer, "import test from 'node:test';\nimport { marker } from './zz-discovery-subject.test.mjs';\ntest('importer', () => { if (marker !== 1) throw new Error('x'); });\n");
    const handed = new Set(deterministicTestFiles());
    assert.equal(handed.has('tests/zz-discovery-subject.test.mjs'), false, 'a named-imported file must be excluded');
    assert.equal(handed.has('tests/zz-discovery-importer.test.mjs'), true);
    assert.equal(reachableTestFiles().has('tests/zz-discovery-subject.test.mjs'), true, 'but it must still be reachable');
    assert.deepEqual(orphanedTestFiles(), []);
  } finally {
    rmSync(subject, { force: true });
    rmSync(importer, { force: true });
  }
});

test('a dynamically imported test file is detected', () => {
  const subject = join(TESTS_DIR.pathname, 'zz-dyn-subject.test.mjs');
  const importer = join(TESTS_DIR.pathname, 'zz-dyn-importer.test.mjs');
  try {
    writeFileSync(subject, "import test from 'node:test';\ntest('dyn subject', () => {});\n");
    writeFileSync(importer, "import test from 'node:test';\ntest('dyn importer', async () => { await import('./zz-dyn-subject.test.mjs'); });\n");
    assert.equal(new Set(deterministicTestFiles()).has('tests/zz-dyn-subject.test.mjs'), false);
  } finally {
    rmSync(subject, { force: true });
    rmSync(importer, { force: true });
  }
});

test('a re-exported test file is detected', () => {
  const subject = join(TESTS_DIR.pathname, 'zz-reexport-subject.test.mjs');
  const importer = join(TESTS_DIR.pathname, 'zz-reexport-importer.test.mjs');
  try {
    writeFileSync(subject, "import test from 'node:test';\nexport const thing = 1;\ntest('reexport subject', () => {});\n");
    writeFileSync(importer, "import test from 'node:test';\nexport { thing } from './zz-reexport-subject.test.mjs';\ntest('reexport importer', () => {});\n");
    assert.equal(new Set(deterministicTestFiles()).has('tests/zz-reexport-subject.test.mjs'), false);
  } finally {
    rmSync(subject, { force: true });
    rmSync(importer, { force: true });
  }
});

test('a brand new test file is picked up without anybody listing it', () => {
  const fresh = join(TESTS_DIR.pathname, 'zz-fresh.test.mjs');
  try {
    writeFileSync(fresh, "import test from 'node:test';\ntest('fresh', () => {});\n");
    assert.equal(new Set(deterministicTestFiles()).has('tests/zz-fresh.test.mjs'), true);
  } finally {
    rmSync(fresh, { force: true });
  }
});

test('an import cycle between test files terminates rather than hanging the gate', () => {
  const a = join(TESTS_DIR.pathname, 'zz-cycle-a.test.mjs');
  const b = join(TESTS_DIR.pathname, 'zz-cycle-b.test.mjs');
  try {
    writeFileSync(a, "import test from 'node:test';\nimport './zz-cycle-b.test.mjs';\ntest('cycle a', () => {});\n");
    writeFileSync(b, "import test from 'node:test';\nimport './zz-cycle-a.test.mjs';\ntest('cycle b', () => {});\n");
    const handed = deterministicTestFiles();
    assert.ok(Array.isArray(handed));
    assert.ok(reachableTestFiles().size > 0);
  } finally {
    rmSync(a, { force: true });
    rmSync(b, { force: true });
  }
});
