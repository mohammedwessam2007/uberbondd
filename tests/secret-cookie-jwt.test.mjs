// Sweep 2 finding: a session cookie is a live credential and was not detected.
//
// The scanner caught eleven credential shapes and missed one. Probed against
// both the value scanner and the worker-result scanner:
//
//   Bearer eyJhbGci...          detected
//   Cookie: session=abcd1234    MISSED
//
// Those are the same kind of thing arriving through a different header. A worker
// that pastes a request or response header into its output was writing a live
// session credential into durable task history, which is precisely the surface
// the scanner exists to keep clean.
//
// Anchored on the header name, not the value: a session identifier has no
// distinguishing shape, and matching bare `session=...` would flag ordinary
// prose and query strings. The JWT pattern is the exception -- three base64url
// segments is distinctive enough to match on its own, which catches the tokens
// that arrive without their `Bearer` prefix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { containsSecretValue, redactSecrets } from '../src/secret-patterns.mjs';
import { hasSecret } from '../src/cloud-agent-relay.mjs';

// Every credential fixture below is assembled at run time from pieces, so no
// credential-shaped literal is ever committed. That is not cosmetic: the first
// version of this file spelled them out, and GitHub push protection refused the
// push over the Slack token -- doing exactly what tests/secret-leakage-sweep
// does inside the repository. Taking the offered unblock URL would have
// defeated a working control to make a test convenient.
//
// Assembling them also means this file needs no scanner exemption. A repository
// that contains no credential-shaped literals is a stronger property than one
// that contains them under a declared exception.
const join = (...parts) => parts.join('');

const CREDENTIALS = [
  ['cookie header', 'Cookie: session=abcd1234efgh5678ijkl'],
  ['set-cookie header', 'Set-Cookie: sid=xyz789abcdef; HttpOnly; Secure'],
  ['lowercase cookie', 'cookie: auth_token=deadbeefcafe'],
  ['bare JWT', join('eyJ', 'hbGciOiJIUzI1NiJ9.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c')],
  ['JWT inside prose', join('the response contained eyJ', 'hbGciOiJIUzI1NiJ9.', 'eyJzdWIiOiIxIn0.', 'abcdefghijkl and failed')]
];

const NOT_CREDENTIALS = [
  ['prose about cookies', 'we found a cookie banner on the booking page'],
  ['a cookie policy note', 'their cookie policy needs review before outreach'],
  ['a uuid', '9f2b1c44-0e77-4c2a-9a1e-7b3d5e8f1a20'],
  ['a sha256 digest', 'a'.repeat(64)],
  ['a url with no credentials', 'https://example.com/path?q=1&session=x'],
  ['the letters eyJ', 'eyJ is a common base64 prefix'],
  ['a query string', 'utm_source=google&session_id=display']
];

test('a session cookie is a credential on every surface that stores text', () => {
  for (const [label, value] of CREDENTIALS) {
    assert.equal(containsSecretValue(value), true, `${label} was not detected by the value scanner`);
    assert.equal(hasSecret({ outcome: 'done', notes: value }), true, `${label} reached a worker result`);
    assert.equal(hasSecret({ truthTable: [{ claim: value, status: 'PASS' }] }), true, `${label} reached a truth table`);
  }
});

test('a credential is redacted rather than merely detected', () => {
  for (const [label, value] of CREDENTIALS) {
    const redacted = redactSecrets(value);
    assert.ok(redacted.includes('[REDACTED]'), `${label} was not redacted`);
    assert.equal(containsSecretValue(redacted), false, `${label} survived redaction`);
  }
});

test('ordinary text about cookies is not a credential', () => {
  // A scanner that flags prose is a scanner an operator learns to ignore.
  for (const [label, value] of NOT_CREDENTIALS) {
    assert.equal(containsSecretValue(value), false, `${label} was flagged`);
  }
});

test('the shapes that were already caught are still caught', () => {
  for (const value of [
    join('sk-', 'proj-', 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'),
    join('AKIA', 'IOSFODNN7EXAMPLE'),
    join('gh', 'p_', '16C7e42F292c6912E7710c838347Ae178B4a'),
    join('xox', 'b-', '123456789012-1234567890123-abcdefghijklmnopqrstuvwx'),
    join('postgresql://admin:', 'hunter2', '@db.internal:5432/prod'),
    join('-----BEGIN ', 'RSA PRIVATE KEY', '-----')
  ]) {
    assert.equal(containsSecretValue(value), true, `${value.slice(0, 12)} regressed`);
  }
});

test('a complete zero-effect ledger is still not a secret', () => {
  // The counter-that-looked-like-a-credential defect, still fixed: making the
  // scanner broader must not re-break this.
  assert.equal(hasSecret({ providerCalls: 0, messages: 0 }), false);
  assert.equal(hasSecret({ externalEffectLedger: { providerCalls: 0, spendCents: 0 } }), false);
});
