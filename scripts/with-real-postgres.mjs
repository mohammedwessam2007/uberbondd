#!/usr/bin/env node
// Run a command against a real, disposable PostgreSQL.
//
// This harness owns preparation of the pinned embedded fixture as well as its
// lifecycle. A fresh verifier must not need npm lifecycle scripts, host package
// installs, or a founder-created native-library workaround before real Postgres
// evidence can run.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareEmbeddedPostgresFixture } from './prepare-embedded-postgres-fixture.mjs';

const command = process.argv.slice(2);
if (!command.length) {
  process.stderr.write('usage: node scripts/with-real-postgres.mjs <command> [args...]\n');
  process.exit(2);
}

const fixture = await prepareEmbeddedPostgresFixture();
if (fixture.status !== 'READY') throw new Error(`embedded Postgres fixture unavailable: ${fixture.status}`);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-real-postgres-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
await fs.mkdir(databaseDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);

const port = 25000 + Math.floor(Math.random() * 3000);
const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'password',
  port,
  persistent: false,
  createPostgresUser: runningAsRoot,
  postgresFlags: ['-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'],
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
    env: { ...process.env, OMNIA_V9_TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl, DATABASE_SSL: 'false' }
  });
  status = run.status ?? 1;
} finally {
  try { await postgres.stop(); } catch { /* already down */ }
  try { await fs.rm(root, { recursive: true, force: true }); } catch { /* best effort */ }
}

process.exit(status);
