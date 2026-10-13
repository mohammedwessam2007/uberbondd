import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeConfig } from '../src/db-compat/runtime-config.mjs';

const PASSWORD = 'SYNTHETIC-PASSWORD-7f3a';
const UNSUBSCRIBE = 'synthetic-unsubscribe-secret-0123456789abcdef';
const KEY = 'a'.repeat(64);
const TARGET = 'db.example.invalid:5432/uberbond_prod';
const allowlist = [TARGET];

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: `postgresql://app:${PASSWORD}@db.example.invalid:5432/uberbond_prod`,
    TOKEN_ENCRYPTION_KEY: KEY,
    UNSUBSCRIBE_SECRET: UNSUBSCRIBE,
    STORE_BACKEND: 'postgres',
    PROCESS_ROLE: 'web',
    ALLOW_TEST_PAYMENT_UNLOCK: 'false',
    ...overrides
  };
}

test('a complete production environment on the allowlisted target is ok', () => {
  const result = validateRuntimeConfig(productionEnv(), { mode: 'production', databaseAllowlist: allowlist });
  assert.deepEqual(result, { ok: true, mode: 'production', reasonCodes: [] });
});

test('a missing DATABASE_URL is refused', () => {
  const env = productionEnv();
  delete env.DATABASE_URL;
  const result = validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: allowlist });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('DATABASE_URL_MISSING'));
});

test('a non-postgres URL is refused, and the refusal does not echo the URL', () => {
  const env = productionEnv({ DATABASE_URL: `mysql://app:${PASSWORD}@db.example.invalid:3306/uberbond_prod` });
  const result = validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(result.reasonCodes.includes('DATABASE_URL_NOT_POSTGRES'));
  assert.ok(!JSON.stringify(result).includes(PASSWORD));
});

test('an unparseable URL is refused without echoing it', () => {
  const env = productionEnv({ DATABASE_URL: `not a url ${PASSWORD}` });
  const result = validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(result.reasonCodes.includes('DATABASE_URL_INVALID'));
  assert.ok(!JSON.stringify(result).includes(PASSWORD));
});

test('a malformed TOKEN_ENCRYPTION_KEY is refused, and a short one is malformed too', () => {
  for (const value of ['z'.repeat(64), 'a'.repeat(31), 'a'.repeat(65)]) {
    const result = validateRuntimeConfig(productionEnv({ TOKEN_ENCRYPTION_KEY: value }), { mode: 'production', databaseAllowlist: allowlist });
    assert.ok(result.reasonCodes.includes('TOKEN_ENCRYPTION_KEY_MALFORMED'));
    assert.ok(!JSON.stringify(result).includes(value));
  }
});

test('production refuses an absent TOKEN_ENCRYPTION_KEY, since encrypted blobs cannot be read without it', () => {
  const env = productionEnv();
  delete env.TOKEN_ENCRYPTION_KEY;
  const result = validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(result.reasonCodes.includes('TOKEN_ENCRYPTION_KEY_ABSENT'));
});

test('a short UNSUBSCRIBE_SECRET in production is refused, and a missing one too', () => {
  const short = validateRuntimeConfig(productionEnv({ UNSUBSCRIBE_SECRET: 'x'.repeat(31) }), { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(short.reasonCodes.includes('UNSUBSCRIBE_SECRET_TOO_SHORT'));
  assert.ok(!JSON.stringify(short).includes('x'.repeat(31)));
  const env = productionEnv();
  delete env.UNSUBSCRIBE_SECRET;
  const missing = validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(missing.reasonCodes.includes('UNSUBSCRIBE_SECRET_MISSING'));
});

test('a target that is not on the caller allowlist is refused', () => {
  const other = validateRuntimeConfig(productionEnv({ DATABASE_URL: `postgresql://app:${PASSWORD}@other.example.invalid:5432/uberbond_prod` }), { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(other.reasonCodes.includes('DATABASE_TARGET_NOT_ALLOWLISTED'));
  const sameHostOtherDb = validateRuntimeConfig(productionEnv({ DATABASE_URL: 'postgresql://app@db.example.invalid:5432/uberbond_render_rescue' }), { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(sameHostOtherDb.reasonCodes.includes('DATABASE_TARGET_NOT_ALLOWLISTED'));
  const otherPort = validateRuntimeConfig(productionEnv({ DATABASE_URL: 'postgresql://app@db.example.invalid:6543/uberbond_prod' }), { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(otherPort.reasonCodes.includes('DATABASE_TARGET_NOT_ALLOWLISTED'));
});

test('an absent or empty allowlist refuses every target (fail closed)', () => {
  for (const databaseAllowlist of [undefined, [], null, 'db.example.invalid/uberbond_prod']) {
    const result = validateRuntimeConfig(productionEnv(), { mode: 'production', databaseAllowlist });
    assert.ok(result.reasonCodes.includes('DATABASE_TARGET_ALLOWLIST_MISSING'));
    assert.equal(result.ok, false);
  }
});

test('allowlist matching is case-insensitive on host and treats the default port as 5432', () => {
  const env = productionEnv({ DATABASE_URL: 'postgresql://app@DB.Example.Invalid/uberbond_prod' });
  assert.equal(validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: ['db.example.invalid/uberbond_prod'] }).ok, true);
  assert.equal(validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: ['db.example.invalid:5432/uberbond_prod'] }).ok, true);
});

test('a malformed allowlist entry fails closed', () => {
  const result = validateRuntimeConfig(productionEnv(), { mode: 'production', databaseAllowlist: ['no-slash-here'] });
  assert.ok(result.reasonCodes.includes('DATABASE_TARGET_ALLOWLIST_INVALID'));
});

test('an unknown mode is refused', () => {
  const result = validateRuntimeConfig(productionEnv(), { mode: 'qa', databaseAllowlist: allowlist });
  assert.deepEqual(result, { ok: false, mode: null, reasonCodes: ['MODE_INVALID'] });
});

test('a production NODE_ENV checked in staging or test mode is a mismatch', () => {
  for (const mode of ['staging', 'test']) {
    const result = validateRuntimeConfig(productionEnv(), { mode, databaseAllowlist: allowlist });
    assert.ok(result.reasonCodes.includes('MODE_MISMATCH'));
  }
});

test('production requires postgres storage, separated roles, and no test payment unlock', () => {
  const result = validateRuntimeConfig(productionEnv({ STORE_BACKEND: 'json', PROCESS_ROLE: 'all', ALLOW_TEST_PAYMENT_UNLOCK: 'true' }), { mode: 'production', databaseAllowlist: allowlist });
  assert.ok(result.reasonCodes.includes('STORE_BACKEND_NOT_POSTGRES'));
  assert.ok(result.reasonCodes.includes('PROCESS_ROLE_NOT_SEPARATED'));
  assert.ok(result.reasonCodes.includes('TEST_PAYMENT_UNLOCK_ENABLED'));
});

test('staging and test modes do not require the production secret length, but still check the target', () => {
  const env = { DATABASE_URL: 'postgresql://postgres@127.0.0.1:55432/uberbond_test', UNSUBSCRIBE_SECRET: 'short' };
  assert.deepEqual(validateRuntimeConfig(env, { mode: 'test', databaseAllowlist: ['127.0.0.1:55432/uberbond_test'] }), { ok: true, mode: 'test', reasonCodes: [] });
  assert.equal(validateRuntimeConfig(env, { mode: 'staging', databaseAllowlist: ['127.0.0.1:55432/uberbond_other'] }).ok, false);
});

test('no secret value appears in any result', () => {
  const env = productionEnv({ UNSUBSCRIBE_SECRET: 'short-secret-value', TOKEN_ENCRYPTION_KEY: 'q'.repeat(64) });
  const result = validateRuntimeConfig(env, { mode: 'production', databaseAllowlist: ['wrong.example.invalid/x'] });
  const text = JSON.stringify(result);
  assert.ok(!text.includes(PASSWORD));
  assert.ok(!text.includes('short-secret-value'));
  assert.ok(!text.includes('q'.repeat(64)));
});
