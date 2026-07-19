import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrictBoolean, parseDryRunBoolean } from '../src/input.mjs';
import { validateStartupConfig } from '../src/config.mjs';

test('strict boolean parser never treats string false as true', () => {
  assert.equal(parseStrictBoolean(false, 'approved'), false);
  assert.equal(parseStrictBoolean('false', 'approved'), false);
  assert.equal(parseStrictBoolean(true, 'approved'), true);
  assert.equal(parseStrictBoolean('true', 'approved'), true);
  assert.throws(() => parseStrictBoolean('yes', 'approved'), /must be true or false/);
  assert.throws(() => parseStrictBoolean(1, 'approved'), /must be true or false/);
});

test('production configuration fails closed', () => {
  const base = {
    nodeEnv: 'production', storeBackend: 'postgres', databaseUrl: 'postgres://example',
    adminToken: 'x'.repeat(32), baseUrl: 'https://app.example.com',
    google: { clientId: '', clientSecret: '' }, encryptionKey: ''
  };
  assert.equal(validateStartupConfig(base), true);
  assert.throws(() => validateStartupConfig({ ...base, databaseUrl: '' }), /DATABASE_URL/);
  assert.throws(() => validateStartupConfig({ ...base, storeBackend: 'json' }), /STORE_BACKEND=postgres/);
  assert.throws(() => validateStartupConfig({ ...base, adminToken: 'weak' }), /ADMIN_TOKEN/);
  assert.throws(() => validateStartupConfig({ ...base, baseUrl: 'http://app.example.com' }), /HTTPS/);
  assert.throws(() => validateStartupConfig({ ...base, google: { clientId: 'id', clientSecret: 'secret' }, encryptionKey: 'bad' }), /TOKEN_ENCRYPTION_KEY/);
});

test('dry-run disabling requires a real JSON false boolean', () => {
  assert.equal(parseDryRunBoolean(false, true), false);
  assert.equal(parseDryRunBoolean('false', true), true);
  assert.equal(parseDryRunBoolean(0, true), true);
  assert.equal(parseDryRunBoolean(undefined, true), true);
});

test('mail provider configuration keeps real Gmail out of tests and test mode out of live sending', () => {
  const base = { nodeEnv: 'development', processRole: 'all', storeBackend: 'json', outbound: { provider: 'test' } };
  assert.equal(validateStartupConfig(base), true);
  assert.throws(() => validateStartupConfig({ ...base, outbound: { provider: 'unknown' } }), /OUTBOUND_PROVIDER/);
  assert.throws(() => validateStartupConfig({ ...base, nodeEnv: 'test', outbound: { provider: 'gmail' } }), /Tests cannot use/);
});


test('live unattended outbound requires identity, allowlist, OAuth, encryption, and unsubscribe secrets', () => {
  const base = {
    nodeEnv: 'production', processRole: 'worker', storeBackend: 'postgres', databaseUrl: 'postgres://example',
    adminToken: 'x'.repeat(32), baseUrl: 'https://app.example.com',
    google: { clientId: 'id', clientSecret: 'secret' }, encryptionKey: 'a'.repeat(64), unsubscribeSecret: 'b'.repeat(64),
    sender: { address: 'Valid postal address' },
    outbound: { provider: 'gmail', enabled: true, dryRun: false, liveSendApproved: true, allowedCountries: ['GB'], businessHourStart: 9, businessHourEnd: 17 }
  };
  assert.equal(validateStartupConfig(base), true);
  assert.throws(() => validateStartupConfig({ ...base, outbound: { ...base.outbound, liveSendApproved: false } }), /OUTBOUND_LIVE_SEND_APPROVED/);
  assert.throws(() => validateStartupConfig({ ...base, sender: { address: '' } }), /BUSINESS_ADDRESS/);
  assert.throws(() => validateStartupConfig({ ...base, outbound: { ...base.outbound, allowedCountries: [] } }), /OUTBOUND_ALLOWED_COUNTRIES/);
  assert.throws(() => validateStartupConfig({ ...base, google: { clientId: '', clientSecret: '' } }), /Google OAuth/);
  assert.throws(() => validateStartupConfig({ ...base, unsubscribeSecret: 'short' }), /UNSUBSCRIBE_SECRET/);
});
