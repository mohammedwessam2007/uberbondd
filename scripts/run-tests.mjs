#!/usr/bin/env node
// Discover and run a test suite.
//
// The suites used to be spelled out as one enormous `node --test a b c ...`
// string in package.json. Those strings grew with every merge until npm
// stopped executing them: it echoed the command and exited 216 having run
// nothing, so `npm run test:deterministic` reported failure while zero tests
// had executed. A gate that cannot run is worse than no gate.
//
// Discovering the files also fixes two bookkeeping failures that list had:
// a new test file was only covered if somebody remembered to append it, and a
// file could be listed AND imported by another listed file, executing twice
// and inflating the pass count.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Suites that must NOT run as part of the deterministic set: they need a
// browser or a live database. They have their own npm scripts.
const NON_DETERMINISTIC = new Set([
  'tests/browser.test.mjs',
  'tests/postgres-store-live.test.mjs'
]);

function allTestFiles() {
  return readdirSync(join(repoRoot, 'tests'))
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => `tests/${name}`)
    .sort();
}

// Every syntactic way one module can pull in another. The first pattern used
// to be the only one, and it only matches a bare side-effect import -- so
// `import { helper } from './a.test.mjs'` was invisible to the exclusion
// logic, `a.test.mjs` was handed to `node --test` AND loaded again by its
// importer, and every test inside it was counted twice. A gate that
// double-counts its own passes is reporting a number nobody can act on.
const TEST_IMPORT_PATTERNS = Object.freeze([
  // import './a.test.mjs'
  /\bimport\s+["']\.\/([^"']+\.test\.mjs)["']/g,
  // import x from / import { x } from / import * as x from './a.test.mjs'
  /\bimport\s[\s\S]*?\sfrom\s+["']\.\/([^"']+\.test\.mjs)["']/g,
  // export { x } from / export * from './a.test.mjs'
  /\bexport\s[\s\S]*?\sfrom\s+["']\.\/([^"']+\.test\.mjs)["']/g,
  // await import('./a.test.mjs')
  /\bimport\s*\(\s*["']\.\/([^"']+\.test\.mjs)["']\s*\)/g
]);

/** Test files a given test file imports directly, by any import form. */
export function testImportsOf(file) {
  let source = '';
  try {
    source = readFileSync(join(repoRoot, file), 'utf8');
  } catch {
    return [];
  }
  const found = new Set();
  for (const pattern of TEST_IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(`tests/${match[1]}`);
  }
  return [...found];
}

/** Test files on disk that no suite would execute at all. */
export function orphanedTestFiles() {
  const reachable = reachableTestFiles();
  return allTestFiles().filter(file => !NON_DETERMINISTIC.has(file) && !reachable.has(file));
}

/**
 * The files to hand to `node --test`.
 *
 * A file that another included file imports is deliberately left out: node
 * would load it twice and every test inside it would be counted twice.
 */
export function deterministicTestFiles() {
  const candidates = allTestFiles().filter(file => !NON_DETERMINISTIC.has(file));
  const imported = new Set();
  const stack = [...candidates];
  const seen = new Set();
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const child of testImportsOf(file)) {
      if (child !== file) { imported.add(child); stack.push(child); }
    }
  }
  return candidates.filter(file => !imported.has(file));
}

/** Every test file that will actually execute, directly or by import. */
export function reachableTestFiles() {
  const seen = new Set();
  const stack = [...deterministicTestFiles()];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const child of testImportsOf(file)) stack.push(child);
  }
  return seen;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'deterministic';
  if (mode !== 'deterministic') {
    console.error(`unknown suite: ${mode}`);
    process.exit(1);
  }
  const files = deterministicTestFiles();
  const run = spawnSync(process.execPath, ['--test', ...files], { cwd: repoRoot, stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
