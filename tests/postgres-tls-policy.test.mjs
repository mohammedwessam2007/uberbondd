import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresTlsOptions } from '../src/postgres-tls-policy.mjs';
const neon = 'postgresql://user:p%40ss@ep-example.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require';
test('Neon sslmode=require preserves channel binding and verifies certificate', () => {
  const v = postgresTlsOptions({ databaseUrl: neon, nodeEnv: 'production' });
  assert.deepEqual(v.ssl, { rejectUnauthorized: true });
  const u = new URL(v.connectionString);
  assert.equal(u.searchParams.has('sslmode'), false);
  assert.equal(u.searchParams.get('channel_binding'), 'require');
  assert.equal(u.password, 'p%40ss');
});
test('verify-full retains strict TLS object', () => {
  const v = postgresTlsOptions({ databaseUrl: neon.replace('sslmode=require', 'sslmode=verify-full') });
  assert.equal(new URL(v.connectionString).searchParams.has('sslmode'), false);
  assert.equal(v.ssl.rejectUnauthorized, true);
});
test('no sslmode still verifies certificates', () => assert.equal(postgresTlsOptions({ databaseUrl: 'postgres://u:p@db.example/db' }).ssl.rejectUnauthorized, true));
for (const mode of ['disable', 'no-verify', 'allow', 'prefer', 'verify-ca', 'REQUIRE', '']) {
  test('unsafe sslmode '+JSON.stringify(mode)+' fails closed', () => {
    assert.throws(() => postgresTlsOptions({ databaseUrl: 'postgres://u:p@db.example/db?sslmode='+mode }), /unsafe sslmode/);
  });
}
for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'ssl']) {
  test('URL override '+key+' refused', () => assert.throws(() => postgresTlsOptions({ databaseUrl: 'postgres://u:p@db.example/db?'+key+'=x' }), /Conflicting/));
}
test('duplicate sslmode refused', () => assert.throws(() => postgresTlsOptions({ databaseUrl: neon+'&sslmode=verify-full' }), /Conflicting/));
test('explicit production cannot disable TLS', () => assert.throws(() => postgresTlsOptions({ databaseUrl: neon, ssl:false, nodeEnv:'production' }), /verified TLS/));
test('local plaintext permitted only with explicit false', () => {
  const u = 'postgres://u:p@127.0.0.1:5432/db';
  assert.deepEqual(postgresTlsOptions({ databaseUrl:u, ssl:false, nodeEnv:'test' }), {connectionString:u,ssl:false});
});
test('local plaintext with URL sslmode refused', () => assert.throws(() => postgresTlsOptions({databaseUrl:neon,ssl:false,nodeEnv:'test'}), /conflicts/));
test('malformed and non-postgres URLs refused without exposing credentials', () => {
  assert.throws(() => postgresTlsOptions({ databaseUrl:'not-a-url' }), /invalid/);
  assert.throws(() => postgresTlsOptions({ databaseUrl:'https://u:p@host/db' }), /postgres or postgresql/);
  assert.throws(() => postgresTlsOptions({ databaseUrl:'' }), /required/);
});
test('nonboolean TLS setting refused', () => assert.throws(() => postgresTlsOptions({databaseUrl:neon,ssl:'false'}), /boolean/));
test('remote plaintext refused outside production too', () => assert.throws(() => postgresTlsOptions({databaseUrl:'postgres://u:p@db.example/db',ssl:false,nodeEnv:'test'}), /only for local/));
test('IPv6 loopback plaintext allowed for tests', () => {
  const u='postgres://u:p@[::1]:5432/db';
  assert.deepEqual(postgresTlsOptions({databaseUrl:u,ssl:false,nodeEnv:'test'}), {connectionString:u,ssl:false});
});
test('ambient production cannot be downgraded by nodeEnv test', () => {
  const old=process.env.NODE_ENV;
  try {
    process.env.NODE_ENV='production';
    assert.throws(() => postgresTlsOptions({databaseUrl:'postgres://u:p@127.0.0.1/db',ssl:false,nodeEnv:'test'}), /verified TLS/);
  } finally {
    if(old===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=old;
  }
});
