#!/usr/bin/env node
// Discover and run a test suite.
//
// The suites used to be spelled out as one enormous `node --test a b c ...`
// string in package.json. Those strings grew with every merge until npm
// stopped executing them: it echoed the command and exited 216 having run
// nothing, so `npm run test:deterministic` reported failure while zero tests
// had executed. A gate that cannot run is worse than no gate.
//
// Discovery is recursive: a test moved under tests/<domain>/ must not silently
// disappear from the canonical gate. Non-deterministic suites remain explicit
// exact-path exclusions and keep their own npm scripts.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const testsRoot = join(repoRoot, 'tests');

const NON_DETERMINISTIC = new Set([
  'tests/browser.test.mjs',
  'tests/postgres-store-live.test.mjs'
]);

function portable(path) { return path.replaceAll('\\', '/'); }

function walkTestFiles(dir = testsRoot, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTestFiles(full, out);
    else if (entry.name.endsWith('.test.mjs')) out.push(portable(relative(repoRoot, full)));
  }
  return out;
}

export function allTestFiles() {
  return walkTestFiles().sort();
}

function importedTestPath(importer, target) {
  if (!target.startsWith('.') || !target.endsWith('.test.mjs')) return null;
  const absolute = resolve(repoRoot, dirname(importer), target);
  const rel = portable(relative(repoRoot, absolute));
  return rel.startsWith('tests/') && !rel.includes('../') ? rel : null;
}

/** Test files a given test file imports directly. */
export function testImportsOf(file) {
  let source = '';
  try {
    source = readFileSync(join(repoRoot, file), 'utf8');
  } catch {
    return [];
  }
  const imports = new Set();
  for (const match of source.matchAll(/^import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+\.test\.mjs)["']/gm)) {
    const child = importedTestPath(file, match[1]);
    if (child) imports.add(child);
  }
  return [...imports].sort();
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

/** Every deterministic test file that will actually execute, directly or by import. */
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

export function nonDeterministicTestFiles() {
  return new Set(NON_DETERMINISTIC);
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
