#!/usr/bin/env node
// Run the suites that need a real PostgreSQL, serially.
//
// These are the ~42 tests that skip themselves without
// OMNIA_V9_TEST_DATABASE_URL: crash recovery, concurrent recovery workers,
// double-spend races, sub-second expiry boundaries. PGlite cannot stand in for
// them -- they are about what two real connections do to one real row -- so
// they had never been executed at all.
//
// Serially, and deliberately. `node --test` runs files in parallel, and these
// files share one database, one set of tables and one migration path. Run in
// parallel they interfere with each other and fail intermittently in ways that
// have nothing to do with the code under test; run serially they are stable.
// A gate that is only trustworthy at a particular concurrency should say so in
// the command rather than in somebody's memory.
//
// Usage:
//   OMNIA_V9_TEST_DATABASE_URL=postgres://user:pass@host:port/db npm run test:postgres-real
//
// Without that variable this prints what is missing and exits non-zero, rather
// than passing vacuously with everything skipped.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = /OMNIA_V9_TEST_DATABASE_URL|realPostgresUrl/;

export function realPostgresTestFiles() {
  return readdirSync(join(repoRoot, 'tests'))
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => `tests/${name}`)
    .filter(file => {
      try { return MARKER.test(readFileSync(join(repoRoot, file), 'utf8')); } catch { return false; }
    })
    .sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
  const files = realPostgresTestFiles();
  if (!url) {
    console.error('test:postgres-real — OMNIA_V9_TEST_DATABASE_URL is not set.');
    console.error(`Would have run ${files.length} suites against a real PostgreSQL:`);
    for (const file of files) console.error(`  ${file}`);
    console.error('\nWithout it these suites skip themselves, and a skipped gate proves nothing.');
    process.exit(2);
  }
  console.log(`test:postgres-real — ${files.length} suites, serially, against ${url.replace(/:\/\/[^@]*@/, '://***@')}`);
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: repoRoot, stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
