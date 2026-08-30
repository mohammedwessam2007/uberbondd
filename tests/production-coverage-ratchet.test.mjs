import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';
import { deterministicTestFiles } from '../scripts/run-tests.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The reachability ratchet answers "can anything call this module?".
// This one answers the question underneath it: "does anything CHECK it?".
//
// A module can be wired to a live route and still have no gate that executes it,
// and that combination has already cost this repository once. The browser
// crawler shipped `ReferenceError: pages is not defined` on every call because
// its only real gate had been written off as permanently blocked. `check:syntax`
// parsed it, the deterministic suite did not cover it, and the new pool's own
// unit tests passed because they mock the browser.
//
// Taking the closure of everything the gates import and subtracting it from the
// production-reachable set found exactly two modules in that state:
// `database-hygiene-repository.mjs`, which DELETES rows on a weekly cron, and
// `discovery-runner.mjs`, which decides whether discovery may run at all. Both
// now have suites. This test exists so the set stays empty without anyone having
// to remember to re-run that analysis.
//
// Deliberately not a coverage percentage. Line coverage measures how much of a
// module ran; this measures whether anything runs it at all, which is a much
// weaker claim and a much harder one to argue with.

const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

function filesUnder(dir, extension = '.mjs') {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(repoRoot, relative), { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(extension)) found.push(child);
    }
  };
  walk(dir);
  return found;
}

// Every suite a gate actually executes: the deterministic set, the browser gate,
// and the real-PostgreSQL suites. A suite that only runs when a database is
// present still counts -- it is a gate that can execute the module, which is the
// property under test. What does not count is a file nothing ever runs.
function gateSuites() {
  const postgresSuites = filesUnder('tests').filter(file => {
    try { return /OMNIA_V9_TEST_DATABASE_URL|realPostgresUrl/.test(readFileSync(join(repoRoot, file), 'utf8')); }
    catch { return false; }
  });
  return [...new Set([...deterministicTestFiles(), 'tests/browser.test.mjs', ...postgresSuites])];
}

function closureOf(entryFiles) {
  const seen = new Set();
  const stack = [...entryFiles];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let source = '';
    try { source = readFileSync(join(repoRoot, file), 'utf8'); } catch { continue; }
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = normalize(join(base, match[1])).replaceAll('\\', '/');
      if (!seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

function productionModules() {
  const reachable = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...filesUnder('api')]);
  return filesUnder('src').filter(file => reachable.has(file));
}

test('every production-reachable module is executed by some gate', () => {
  const exercised = closureOf(gateSuites());
  const unexercised = productionModules().filter(file => !exercised.has(file));
  assert.deepEqual(unexercised, [],
    'these modules are reachable from a production entry point and no gate runs them. ' +
    'A defect in one would pass every check this repository has. Add a suite, or explain ' +
    'in the reachability classification why the module is not production-reachable after all.');
});

// A ratchet that cannot detect anything protects nothing, and this one is a
// subtraction over two derived sets -- easy to make vacuously true by widening
// what counts as a gate.
test('the ratchet detects a production module no gate imports', () => {
  const exercised = closureOf(gateSuites());
  const invented = 'src/a-module-no-gate-imports.mjs';
  assert.equal(exercised.has(invented), false,
    'a module that does not exist must not be reported as exercised');

  // And the two halves must both be non-trivial: an empty production set or an
  // everything-set of gates would each make the test above pass for free.
  assert.ok(productionModules().length > 50, 'the production set must be real');
  assert.ok(gateSuites().length > 50, 'the gate set must be real');
  assert.ok(exercised.size > productionModules().length,
    'the closure must reach beyond the production set, or it is not a closure');
});
