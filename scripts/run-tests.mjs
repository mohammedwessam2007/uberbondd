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

/** Test files a given test file imports directly. */
export function testImportsOf(file) {
  let source = '';
  try {
    source = readFileSync(join(repoRoot, file), 'utf8');
  } catch {
    return [];
  }
  return [...source.matchAll(/^import\s+["']\.\/([^"']+\.test\.mjs)["']/gm)].map(match => `tests/${match[1]}`);
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
