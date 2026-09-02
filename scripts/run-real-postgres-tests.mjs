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
  const url = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
  const files = realPostgresTestFiles();
  if (!url) {
    console.error('test:postgres-real — OMNIA_V9_TEST_DATABASE_URL is not set.');
    console.error(`Would have run ${files.length} suites against a real PostgreSQL:`);
    for (const file of files) console.error(`  ${file}`);
    console.error('\nWithout it these suites skip themselves, and a skipped gate proves nothing.');
    process.exit(2);
  }
  console.log(`test:postgres-real — ${files.length} suites, serially, one database each, on ${url.replace(/:\/\/[^@]*@/, '://***@')}`);

  const { Client } = await import('pg');
  const admin = new Client({ connectionString: url });
  await admin.connect();

  let failed = 0;
  const failures = [];
  for (const [index, file] of files.entries()) {
    // A name derived from the file, so a leftover database after a crash says
    // which suite left it.
    const database = `ubpg_${index}_${file.replace(/[^a-z0-9]+/gi, '_').slice(-40).toLowerCase()}`;
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.query(`CREATE DATABASE "${database}"`);
    const fileUrl = new URL(url);
    fileUrl.pathname = `/${database}`;

    const run = spawnSync(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-timeout=120000', file],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env, OMNIA_V9_TEST_DATABASE_URL: fileUrl.toString(), DATABASE_URL: fileUrl.toString() }
      }
    );
    if (run.status !== 0) { failed += 1; failures.push(file); }
    // Dropped immediately: these accumulate one per suite, and a server left
    // holding forty test databases is a slower server for the next run.
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`).catch(() => {});
  }
  await admin.end();

  if (failures.length) {
    console.error(`\ntest:postgres-real — ${failures.length} of ${files.length} suites failed:`);
    for (const file of failures) console.error(`  ${file}`);
  } else {
    console.log(`\ntest:postgres-real — ${files.length} suites passed.`);
  }
  process.exit(failed ? 1 : 0);
}
