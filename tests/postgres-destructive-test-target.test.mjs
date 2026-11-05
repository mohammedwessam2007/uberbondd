import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposableLocalPostgresTestTarget as check } from './helpers/postgres-destructive-test-target.mjs';

const ack = 'TRUNCATE_LOCAL_UBERBOND_TEST_DB';
const url = 'postgresql://test:password@127.0.0.1:25433/uberbond_test';
const verify = (databaseUrl, extra = {}) => check({ databaseUrl, acknowledgment: ack, nodeEnv: 'test', ...extra });

test('explicit local disposable database is eligible for destructive tests', () => assert.equal(verify(url), true));
test('explicit IPv6 loopback is eligible', () => assert.equal(verify('postgresql://test:password@[::1]:25433/uberbond_test'), true));
test('acknowledgment must be exact, not merely truthy', () => {
  for (const acknowledgment of [undefined, '', 'true', true, 'TRUNCATE_LOCAL_UBERBOND_TEST_DB ']) {
    assert.throws(() => verify(url, { acknowledgment }), /ACK_REQUIRED/);
  }
});
test('ambient production cannot be downgraded with explicit test nodeEnv', () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => verify(url), /REFUSED_PRODUCTION/);
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});
test('explicit production fails closed', () => assert.throws(() => verify(url, { nodeEnv: 'production' }), /REFUSED_PRODUCTION/));
test('Neon and other remote databases cannot be truncated', () => {
  for (const remote of ['ep-test.eu-central-1.aws.neon.tech', 'db.example.com', 'localhost', '127.0.0.2']) {
    assert.throws(() => verify(`postgresql://test:password@${remote}:25433/uberbond_test`), /NOT_ISOLATED_LOCAL/);
  }
});
test('wrong database name and postgres default database refused', () => {
  for (const db of ['postgres', 'uberbond', 'production', 'uberbond_test_copy', '']) {
    assert.throws(() => verify(`postgresql://test:password@127.0.0.1:25433/${db}`), /NOT_ISOLATED_LOCAL/);
  }
});
test('default port, absent port and privileged port refused', () => {
  for (const port of [':5432', '', ':543', ':22']) {
    assert.throws(() => verify(`postgresql://test:password@127.0.0.1${port}/uberbond_test`), /NOT_ISOLATED_LOCAL/);
  }
});
test('URL query or fragment cannot override host, port, SSL, or credentials', () => {
  for (const suffix of ['?host=evil.example', '?service=prod', '?sslmode=disable', '#prod']) {
    assert.throws(() => verify(url + suffix), /NOT_ISOLATED_LOCAL/);
  }
});
test('invalid protocols, missing credentials and malformed URLs refused', () => {
  assert.throws(() => verify('https://test:password@127.0.0.1:25433/uberbond_test'), /NOT_ISOLATED_LOCAL/);
  assert.throws(() => verify('postgresql://127.0.0.1:25433/uberbond_test'), /NOT_ISOLATED_LOCAL/);
  assert.throws(() => verify('garbage'), /URL_INVALID/);
  assert.throws(() => verify(''), /URL_REQUIRED/);
});
test('errors never echo the supplied connection URL or password', () => {
  const secret = 'TOP_SECRET_PASSWORD';
  try { verify(`postgresql://test:${secret}@ep-prod.aws.neon.tech:5432/uberbond_test`); }
  catch (error) { assert.equal(error.message.includes(secret), false); assert.equal(error.message.includes('ep-prod'), false); return; }
  assert.fail('unsafe remote database was not rejected');
});
