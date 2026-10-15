// Proof that an idle pool client error reaches the diagnostics path with its
// connection string, password and URLs removed. The listener must not discard the
// error silently, and it must not let the sanitized text reveal a credential.
// The simulated case needs no server. The terminated-connection case uses a real
// PostgreSQL server from withDisposablePostgres, where the server ends an idle session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore, sanitizeStoreDiagnosticError } from '../src/store.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import pg from 'pg';

const { Client } = pg;
const PREFIX = 'STORE_IDLE_POOL_CLIENT_ERROR ';
const PASSWORD = 'Zq7-Idle-Pass-41';
const CONNECTION_STRING = `postgresql://uberbond_app:${PASSWORD}@db.internal.example:5432/uberbond?sslmode=require`;

// Replaces console.error for the duration of one body and returns what was written.
function captureConsoleError() {
  const lines = [];
  const original = console.error;
  console.error = (...args) => { lines.push(args.map(String).join(' ')); };
  return { lines, restore: () => { console.error = original; } };
}

function payloadOf(line) {
  assert.ok(line.startsWith(PREFIX), `diagnostic must start with ${PREFIX.trim()}: ${line}`);
  return JSON.parse(line.slice(PREFIX.length));
}

function assertNoCredentialIn(text) {
  for (const forbidden of [PASSWORD, 'uberbond_app', 'postgresql://', 'db.internal.example', CONNECTION_STRING]) {
    assert.ok(!text.includes(forbidden), `diagnostic leaked ${forbidden.slice(0, 12)}...`);
  }
}

test('a simulated idle client error is written as a sanitized diagnostic instead of being discarded', async () => {
  const store = new PostgresStore({ databaseUrl: CONNECTION_STRING, ssl: false });
  const capture = captureConsoleError();
  try {
    const error = new Error(`terminating connection due to administrator command ${CONNECTION_STRING} password=${PASSWORD}`);
    error.code = '57P01';
    store.pool.emit('error', error);
  } finally {
    capture.restore();
    await store.close();
  }
  assert.equal(capture.lines.length, 1, 'exactly one diagnostic line must be written');
  const payload = payloadOf(capture.lines[0]);
  assert.equal(payload.errorClass, 'Error');
  assert.equal(payload.sqlstate, '57P01');
  assert.match(payload.message, /terminating connection due to administrator command/);
  assertNoCredentialIn(capture.lines[0]);
});

test('an idle connection terminated by the real server is reported, and the store keeps serving queries', async () => {
  await withDisposablePostgres(async url => {
    const store = new PostgresStore({ databaseUrl: url, ssl: false });
    const capture = captureConsoleError();
    const killer = new Client({ connectionString: url });
    try {
      const idle = await store.pool.connect();
      const pid = (await idle.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      idle.release();
      await killer.connect();
      await killer.query('SELECT pg_terminate_backend($1)', [pid]);
      const deadline = Date.now() + 5000;
      while (capture.lines.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(capture.lines.length, 1, 'the server-terminated idle client must produce one diagnostic');
      const payload = payloadOf(capture.lines[0]);
      assert.equal(payload.sqlstate, '57P01');
      assertNoCredentialIn(capture.lines[0]);
      capture.restore();
      const after = await store.pool.query('SELECT 1 AS ok');
      assert.equal(after.rows[0].ok, 1, 'a later query must open a fresh connection');
    } finally {
      capture.restore();
      await killer.end().catch(() => {});
      await store.close();
    }
  });
});

test('the sanitizer strips URLs, key=value passwords and user:password@host authorities, and bounds the message', async () => {
  const mod = await import('../src/store.mjs');
  assert.equal(typeof mod.sanitizeStoreDiagnosticError, 'function', 'store.mjs must export sanitizeStoreDiagnosticError');
  const sanitize = mod.sanitizeStoreDiagnosticError;

  const fromUrl = sanitize(new Error(`connect failed for ${CONNECTION_STRING}`));
  assert.equal(fromUrl.errorClass, 'Error');
  assert.equal(fromUrl.sqlstate, undefined);
  assert.ok(!JSON.stringify(fromUrl).includes(PASSWORD));

  const fromAssignment = sanitize(new Error(`auth failed password=${PASSWORD} user=uberbond_app`));
  assert.ok(!JSON.stringify(fromAssignment).includes(PASSWORD));
  assert.match(fromAssignment.message, /password=\[REDACTED\]/);

  // A quoted libpq value with spaces is removed whole, with no trailing fragment left behind.
  const quotedValue = 'Zq 7 quoted secret part';
  const fromQuoted = sanitize(new Error(`dsn host=db.internal.example password='${quotedValue}' sslmode=require`));
  assert.ok(!JSON.stringify(fromQuoted).includes('quoted secret'), 'quoted password fragment leaked');
  assert.ok(!JSON.stringify(fromQuoted).includes('Zq'), 'quoted password prefix leaked');
  assert.match(fromQuoted.message, /password=\[REDACTED\] sslmode=require/);
  // The server name and account in a keyword/value connection string are connection details, so they are removed as well.
  assert.ok(!JSON.stringify(fromQuoted).includes('db.internal.example'), 'keyword/value host leaked');
  assert.match(fromQuoted.message, /host=\[REDACTED\]/);

  const fromAuthority = sanitize(`dial uberbond_app:${PASSWORD}@db.internal.example:5432 refused`);
  assert.ok(!JSON.stringify(fromAuthority).includes(PASSWORD));

  const fromString = sanitize(`plain string with ${CONNECTION_STRING}`);
  assert.equal(fromString.errorClass, 'String');
  assert.ok(!JSON.stringify(fromString).includes(PASSWORD));

  const long = sanitize(new Error('x'.repeat(5000)));
  assert.ok(long.message.length <= 240, `message must be bounded, got ${long.message.length}`);

  const badCode = Object.assign(new Error('bad code'), { code: 'not a sqlstate!' });
  assert.equal(sanitize(badCode).sqlstate, undefined, 'a code that is not a five-character SQLSTATE is dropped');

  const nothing = sanitize(undefined);
  assert.equal(nothing.errorClass, 'UnknownError');
  assert.equal(typeof nothing.message, 'string');
});

// Hostile shapes the independent review reproduced as leaks before the repair. Each carries the same password and host.
test('hostile credential shapes leave no password or host in the sanitized diagnostic', () => {
  const shapes = [
    `{"password":"${PASSWORD}","host":"db.internal.example"}`,
    `{"password": "${PASSWORD}"}`,
    `postgresql://uberbond_app:Zq7 Idle-Pass-41@db.internal.example:5432/uberbond`,
    `uberbond_app:Zq7/Idle-Pass-41@db.internal.example:5432`,
    `pass=${PASSWORD}`
  ];
  for (const shape of shapes) {
    const out = JSON.stringify(sanitizeStoreDiagnosticError(new Error(shape)));
    for (const forbidden of ['Zq7', 'Idle-Pass', 'db.internal', 'uberbond_app']) {
      assert.ok(!out.includes(forbidden), `shape ${shape.slice(0, 24)} leaked ${forbidden}: ${out}`);
    }
  }
});

test('an idle error whose message cannot be read is still reported as a visible line, never silently dropped', async () => {
  const store = new PostgresStore({ databaseUrl: CONNECTION_STRING, ssl: false });
  const capture = captureConsoleError();
  try {
    const unreadable = new Error('placeholder');
    Object.defineProperty(unreadable, 'message', { get() { throw new Error('getter failed'); } });
    store.pool.emit('error', unreadable);
  } finally {
    capture.restore();
    await store.close();
  }
  assert.equal(capture.lines.length, 1, 'an unreadable error must still write exactly one line');
  assert.equal(payloadOf(capture.lines[0]).message, '[UNREADABLE]');
  assertNoCredentialIn(capture.lines[0]);
});
