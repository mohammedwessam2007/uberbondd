import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicSafe, sanitizedErrorCode, PublicArtifactLeak } from '../src/winnr-public-artifact-guard.mjs';

function refusedKind(value) {
  try { assertPublicSafe(value); return null; } catch (error) {
    assert.ok(error instanceof PublicArtifactLeak);
    return error.kind;
  }
}

test('aggregate counts, fixed class names and the provider public hosts pass', () => {
  assert.equal(refusedKind({ status: 'NOT_ALL_AUTHENTICATED', smtp: { accepted: 0, classCounts: { NETWORK_BLOCKED: 50 } }, imap: { accepted: 0 } }), null);
  assert.equal(refusedKind({ host: 'inbound.winnr.app', port: 993, kind: 'IMAP_IMPLICIT_TLS' }), null);
  assert.equal(refusedKind({ approvalRef: 'github-environment-approval:winnr-probe:run-38404386295' }), null);
  assert.equal(refusedKind({ ownerAuthorizationRef: 'github-environment-approval:winnr-probe:run-38404386295' }), 'forbidden-key', 'the authorization key name is refused, so the approval reference is published under approvalRef');
});

test('email addresses are refused anywhere in a value', () => {
  assert.equal(refusedKind('hello@example.test'), 'email-address');
  assert.equal(refusedKind({ note: 'contact team@somewhere.test today' }), 'email-address');
});

test('URLs and presigned-download parameters are refused', () => {
  assert.equal(refusedKind('https://storage.example.test/exports/x.csv'), 'url');
  assert.equal(refusedKind('X-Amz-Signature=abc'), 'presigned-signature');
  assert.equal(refusedKind('Credential=AKIA/abc'), 'presigned-signature');
});

test('provider tokens, password words, private keys and CSV fragments are refused', () => {
  assert.equal(refusedKind('wnr_abc123def456'), 'provider-token');
  assert.equal(refusedKind('the password is set'), 'password-word');
  assert.equal(refusedKind('pw-fixture'), 'password-word');
  assert.equal(refusedKind('-----BEGIN RSA PRIVATE KEY-----'), 'private-key');
  assert.equal(refusedKind('Box,x@y.test,Box,x@y.test,secret'), 'email-address');
});

test('customer domain names are refused, while the provider hosts are not', () => {
  assert.equal(refusedKind('startup-fixture.co'), 'domain-name');
  assert.equal(refusedKind('pilot-fixture.com'), 'domain-name');
  assert.equal(refusedKind('uberbond.test'), null, '.test is not a customer domain pattern in this list');
});

test('long opaque identifiers such as hashes are refused', () => {
  assert.equal(refusedKind('7f63d1a535252295dc81fc8adc9d8ba06187b0498962552a75614bf83eb355bf'), 'long-opaque-token');
  assert.equal(refusedKind('abcdef1234567890abcdef1234567890'), 'long-opaque-token');
});

test('identity-bearing keys are refused even when their value is harmless', () => {
  for (const key of ['email', 'address', 'username', 'user_name', 'password', 'token', 'secret', 'url', 'digest', 'slot', 'mailbox', 'cookie', 'authorization', 'signature']) {
    assert.equal(refusedKind({ [key]: 'x' }), 'forbidden-key', key);
  }
  assert.equal(refusedKind({ mailboxCount: 50 }), 'forbidden-key', 'mailbox-named keys are refused, counts must be named differently');
});

test('nested identity values are found however deep they sit', () => {
  assert.equal(refusedKind({ a: [{ b: { c: 'deep@deep.test' } }] }), 'email-address');
  assert.equal(refusedKind([1, 2, { z: 'https://x.test' }]), 'url');
});

test('an unsupported value type is refused rather than passed through', () => {
  assert.equal(refusedKind(() => 1), 'unsupported-type');
  assert.equal(refusedKind(Symbol('x')), 'unsupported-type');
});

test('the sanitised error code never carries message text', () => {
  assert.equal(sanitizedErrorCode(Object.assign(new Error('pw-fixture-secret'), { code: 'ECONNREFUSED' })), 'ECONNREFUSED');
  assert.equal(sanitizedErrorCode(new Error('wnr_secret_token_value leaked here')), 'UNCLASSIFIED_FAILURE');
  assert.equal(sanitizedErrorCode(Object.assign(new Error('x'), { code: 'bad code with spaces and @ and https://x' })).includes('@'), false);
  assert.equal(sanitizedErrorCode(Object.assign(new Error('x'), { code: 'bad code with spaces and @ and https://x' })).includes('HTTPS'), true);
  assert.equal(sanitizedErrorCode(null), 'UNCLASSIFIED_FAILURE');
  assert.equal(sanitizedErrorCode({ code: 'x'.repeat(200) }).length <= 60, true);
});
