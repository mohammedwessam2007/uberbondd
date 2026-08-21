import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

// A test file runs if an npm script names it, OR if a file that runs imports
// it. Counting only the names is wrong in both directions, and I got both
// wrong: it reported 23 files as orphaned when tests/agent-relay.test.mjs
// imports 19 of them, and "fixing" that by naming them made those 19 execute
// twice. Follow the import graph.
function reachableTestFiles() {
  const named = new Set(
    Object.entries(scripts)
      .filter(([name]) => name.startsWith('test'))
      .flatMap(([, cmd]) => cmd.split(/\s+/))
      .filter(token => token.endsWith('.test.mjs'))
  );
  const seen = new Set();
  const stack = [...named];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imported of testImportsOf(file)) stack.push(imported);
  }
  return { named, reachable: seen };
}

function testImportsOf(file) {
  let source = '';
  try {
    source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  } catch {
    return [];
  }
  return [...source.matchAll(/^import\s+["']\.\/([^"']+\.test\.mjs)["']/gm)].map(match => `tests/${match[1]}`);
}

test('every test file on disk actually runs, by name or by import', () => {
  const { reachable } = reachableTestFiles();
  const onDisk = readdirSync(new URL('../tests/', import.meta.url))
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => `tests/${name}`);

  const orphans = onDisk.filter(file => !reachable.has(file));
  assert.deepEqual(
    orphans, [],
    `these test files are named by no script and imported by nothing that runs:\n  ${orphans.join('\n  ')}`
  );
});

test('no test file both is named by a script and imported by another test that runs', () => {
  // The mirror failure, and the one that bit me: a file listed in
  // test:deterministic AND imported by a file already in test:deterministic
  // executes twice. That inflates the pass count -- which is exactly the
  // number a reader trusts -- and doubles the runtime for nothing.
  const { named } = reachableTestFiles();
  const importedByNamed = new Set();
  for (const file of named) {
    for (const imported of testImportsOf(file)) {
      if (imported !== file) importedByNamed.add(imported);
    }
  }
  const doubled = [...named].filter(file => importedByNamed.has(file)).sort();
  assert.deepEqual(
    doubled, [],
    `these run twice -- named by a script and imported by another script's file:\n  ${doubled.join('\n  ')}\n` +
    'Remove them from the script; the importing file already runs them.'
  );
});

test('every src module is syntax-checked by check:syntax', () => {
  // check:syntax is the only gate that runs over modules the deterministic
  // suite may never import. A module missing from it can carry a syntax error
  // all the way to a production start.
  const cmd = scripts['check:syntax'] || '';
  const checked = new Set([...cmd.matchAll(/node --check (\S+)/g)].map(match => match[1]));
  const missing = walk('src').filter(file => !checked.has(file));

  assert.deepEqual(
    missing, [],
    `these src modules are not in check:syntax, so a syntax error in them ships:\n  ${missing.join('\n  ')}`
  );
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
