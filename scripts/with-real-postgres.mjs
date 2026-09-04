#!/usr/bin/env node
// Run a command against a real, disposable PostgreSQL.
//
// `npm run test:postgres-real` and the PostgreSQL half of the mutation war both
// need OMNIA_V9_TEST_DATABASE_URL, and both honestly refuse without it -- which
// is right, because a suite that skips itself proves nothing. The consequence
// was that in any environment without a database server, roughly 180 tests
// about what two real connections do to one real row were never executed, and
// the mutation war reported SKIPPED_NEEDS_POSTGRES for every guard those tests
// hold up.
//
// `embedded-postgres` is already a devDependency and the smoke scripts already
// start one per run. This wraps that in something a gate can call, so the
// answer to "was the real-database evidence collected" stops depending on
// whether somebody had a server lying around.
//
// The instance is per-run, on a random high port, non-persistent, and torn down
// in a finally block. It is a test fixture: never point this at anything real.
//
//   node scripts/with-real-postgres.mjs npm run test:postgres-real
//   node scripts/with-real-postgres.mjs npm run test:mutation-war
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const command = process.argv.slice(2);
if (!command.length) {
  process.stderr.write('usage: node scripts/with-real-postgres.mjs <command> [args...]\n');
  process.exit(2);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-real-postgres-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
await fs.mkdir(databaseDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);

const port = 25000 + Math.floor(Math.random() * 3000);
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'password',
  port,
  persistent: false,
  createPostgresUser: true,
  // Durability settings for a database that is deleted when this process ends.
  //
  // This instance exists for one run and is torn down in the finally block
  // below, so an fsync buys nothing: there is no crash it could survive. On a
  // container with throttled disk I/O the cost is not merely slowness -- a
  // write can sit in the backend `active`, waiting on no lock and burning no
  // CPU, for as long as anyone is willing to wait. Test fixtures should not be
  // paying for durability they cannot use.
  postgresFlags: [
    '-c', 'fsync=off',
    '-c', 'synchronous_commit=off',
    '-c', 'full_page_writes=off'
  ],
  onLog: () => {},
  onError: message => process.stderr.write(`[embedded-postgres] ${String(message)}\n`)
});

let status = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_test');
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/uberbond_test`;
  process.stderr.write(`with-real-postgres — PostgreSQL on 127.0.0.1:${port}, database uberbond_test\n`);

  const run = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      OMNIA_V9_TEST_DATABASE_URL: databaseUrl,
      // DATABASE_URL as well, so `npm run db:migrate` and `npm run db:import-json`
      // work through this harness -- both read that variable and nothing else.
      // It does not switch the store backend: config.storeBackend defaults to
      // json outside production regardless of whether a database URL is set, so
      // no suite silently changes backend by being run through here.
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: 'false'
    }
  });
  status = run.status ?? 1;
} finally {
  // Always stop, even when the command threw: a leaked postmaster holds its
  // port and its data directory, and the next run picks a different random port
  // and never notices.
  try { await postgres.stop(); } catch { /* already down */ }
  try { await fs.rm(root, { recursive: true, force: true }); } catch { /* best effort */ }
}

process.exit(status);
