// One PostgreSQL server, for one unit of work, thrown away afterwards.
//
// The mutation war shared a single embedded server across a whole run, one
// database per mutation. Three database-backed guards still hung there and
// killed when run alone, twice over, after the obvious shared-state causes had
// been removed: a fresh database each, and stuck backends from earlier suites
// terminated before each one. The failing set was stable rather than drifting,
// so what was left was something in the server itself that a new database does
// not reset.
//
// Rather than keep guessing which shared thing it was, the sharing goes. Only
// five mutations need a database, and a server costs a couple of seconds to
// start, so isolating them completely is cheaper than one more theory.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Starts a private server and hands its URL to `body`.
 *
 * The server is stopped and its directory removed whatever `body` does. A
 * leaked postmaster holds its port and its data directory, and the next caller
 * picks a different random port and never notices it is there.
 */
export async function withDisposablePostgres(body) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-mutation-pg-'));
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
    // Deleted when this returns, so an fsync buys nothing -- there is no crash
    // it could survive. On throttled container I/O the cost is not just
    // slowness: a write can sit in a backend `active`, holding no lock and
    // burning no CPU, for as long as anyone will wait.
    postgresFlags: ['-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'],
    onLog: () => {},
    onError: () => {}
  });

  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('uberbond_test');
    return await body(`postgresql://postgres:password@127.0.0.1:${port}/uberbond_test`);
  } finally {
    try { await postgres.stop(); } catch { /* already down */ }
    try { await fs.rm(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
