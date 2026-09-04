#!/usr/bin/env node
// Run the suites that need a real PostgreSQL, serially.
//
// These are the ~42 tests that skip themselves without
// OMNIA_V9_TEST_DATABASE_URL: crash recovery, concurrent recovery workers,
// double-spend races, sub-second expiry boundaries. PGlite cannot stand in for
// them -- they are about what two real connections do to one real row -- so
// they had never been executed at all.
//
// Serially, and each in its own database.
//
// Serial execution alone was not enough. These suites recover *stuck* rows, and
// they find them by sweeping the shared tables with deliberately broad limits
// (1000, 500, 50) -- which is right, because in production a recovery worker
// does not know which rows are its own. Pointed at one shared database, a later
// suite's recovery worker claims rows an earlier suite left behind, and
// "two concurrent recovery workers converge on exactly one outcome" fails with
// neither worker claiming its row. That failure was recorded once before and
// attributed to file-level parallelism; it reproduces at --test-concurrency=1,
// so parallelism was not the cause. Sharing the database was.
//
// So each file gets a freshly created database on the same server. Suites can
// then sweep as broadly as production does without seeing anything but their
// own rows, and a failure means what it says.
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
  const files = realPostgresTestFiles();

  // No external database required.
  //
  // This gate used to refuse without OMNIA_V9_TEST_DATABASE_URL, which was the
  // honest thing to do while it could not make one -- a suite that skips itself
  // proves nothing. But it meant roughly 180 tests about what two real
  // connections do to one real row ran only where somebody had already set a
  // variable, and the mutation war carried the identical defect for nine of its
  // guards. It provisions what it needs now, and so does this.
  //
  // An externally supplied URL is no longer consulted at all: sharing one server
  // across suites is the thing being removed, so honouring a handed-in one would
  // reintroduce it.
  console.log(`test:postgres-real — ${files.length} suites, serially, each on its own disposable PostgreSQL`);

  // A private server per suite, not a database on a shared one.
  //
  // Per-suite databases were not enough. Three suites still stalled -- one
  // cancelled with "Promise resolution is still pending but the event loop has
  // already resolved", two cut off at 120s -- while every one of them passes
  // alone. That is the backend stall documented above, and a fresh database does
  // not reset whatever in the shared server carries it between suites.
  //
  // The mutation war had exactly this symptom and exactly this fix: three
  // database-backed guards that hung in a full run and killed in isolation went
  // to 163/163 the moment each got its own server. Twenty-three servers at a
  // couple of seconds each is a cheaper price than a gate that cannot finish.
  const { withDisposablePostgres } = await import('./disposable-postgres.mjs');

  let failed = 0;
  const failures = [];
  for (const file of files) {
    const status = await withDisposablePostgres(fileUrl => spawnSync(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-timeout=120000', file],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env, OMNIA_V9_TEST_DATABASE_URL: fileUrl, DATABASE_URL: fileUrl }
      }
    ).status);
    if (status !== 0) { failed += 1; failures.push(file); }
  }

  if (failures.length) {
    console.error(`\ntest:postgres-real — ${failures.length} of ${files.length} suites failed:`);
    for (const file of failures) console.error(`  ${file}`);
  } else {
    console.log(`\ntest:postgres-real — ${files.length} suites passed.`);
  }
  process.exit(failed ? 1 : 0);
}
