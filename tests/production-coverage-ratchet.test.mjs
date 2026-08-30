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
// Routes are the actual production entry points, so a route no gate runs is
// worse than a module no gate runs. Extending the same subtraction to `api/`
// found `api/admin/health-check.mjs`: the operator's only window into system
// health, whose bearer check was the only thing between the internet and a map
// of the system, and which nothing executed.
test('every API route is executed by some gate', () => {
  const exercised = closureOf(gateSuites());
  const unexercised = filesUnder('api').filter(file => !exercised.has(file));
  assert.deepEqual(unexercised, [],
    'these routes are production entry points and no gate runs them. A route is where ' +
    'admission, enablement and refusal live, so an untested one is the worst place for a ' +
    'defect to hide.');
});

// The process entry points, and an honest split between them.
//
// `worker.mjs` is 60 lines and 3 branches: genuinely wiring, and exempt for the
// reason entry points usually are -- importing it starts a worker loop, and a
// gate that started and stopped processes to assert wiring would be a worse
// trade than asserting the wiring directly.
//
// `server.mjs` was never that. It is 614 lines with 87 `if`/`switch` statements
// behind one http.createServer, and for a long time no gate executed any of it:
// the handler is an inline anonymous function and importing the module runs
// validateStartupConfig, creates a store and awaits store.init(), so nothing
// could reach the routing logic without a running process.
//
// So a gate runs the process. `tests/server-http-surface.test.mjs` spawns the
// real server on loopback with a throwaway JSON store and probes the surface
// that matters. Executing a module by spawning it is still executing it, which
// is why "exercised" below means imported OR spawned -- an import closure alone
// would report this as uncovered and be wrong about it.
const SPAWN_EXEMPT_ENTRY_POINTS = ['worker.mjs'];

function spawnedByGate(entry) {
  return gateSuites().some(suite => {
    let source = '';
    try { source = readFileSync(join(repoRoot, suite), 'utf8'); } catch { return false; }
    return source.includes('spawn') && source.includes(entry);
  });
}

test('worker.mjs is wiring, which is why it is exempt', () => {
  const source = readFileSync(join(repoRoot, 'worker.mjs'), 'utf8');
  const branches = (source.match(/\bif\s*\(|\bswitch\s*\(/g) || []).length;
  assert.ok(branches <= 10,
    `worker.mjs has ${branches} branches. It is exempt from this ratchet because it only wires ` +
    'modules together; that exemption stops being true once it decides things.');
  assert.deepEqual(SPAWN_EXEMPT_ENTRY_POINTS, ['worker.mjs'],
    'the exempt list is one entry long on purpose -- adding to it needs the same argument');
});

test('server.mjs is executed by a gate, not exempted from one', () => {
  const exercised = closureOf(gateSuites());
  assert.ok(exercised.has('server.mjs') || spawnedByGate('server.mjs'),
    'server.mjs carries hundreds of branches of production routing, admission and refusal logic. ' +
    'A gate must run it -- by import once the handler is extractable, or by spawning the process ' +
    'until then. It must not join the exempt list.');
});

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
