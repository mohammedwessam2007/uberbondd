import test from 'node:test';
import assert from 'node:assert/strict';
import { containsSecretValue, redactSecrets } from '../src/secret-patterns.mjs';

// Six credential formats walked through every module that uses this file as its
// only value-shape check -- the change-set blocker, the artifact store, the
// compute store, the provider worker, the relay, and the two receipt redactors.
//
// The worst of them was `github_pat_`: the pattern list covered every *classic*
// GitHub prefix and could not reach the fine-grained one, because `github_pat_`
// starts with `gh` and the third character is `i`, outside `gh[pousr]_`.
// Fine-grained is what GitHub issues by default now, which made the most likely
// token in circulation the one shape not detected.
//
// Fixtures are assembled at runtime. A literal credential-shaped string in a
// committed test file is what push protection exists to stop, and it is right
// to stop it.
const j = (...parts) => parts.join('');

const CREDENTIALS = [
  ['github fine-grained pat', j('github', '_pat_', '11ABCDEFG0', 'abcdefghijklmnopqrstuvwxyz0123456789ABCD')],
  ['github classic pat', j('gh', 'p_', 'A'.repeat(36))],
  ['github server-to-server', j('gh', 's_', 'B'.repeat(36))],
  ['openai project key', j('sk-', 'proj-', 'C'.repeat(48))],
  ['anthropic key', j('sk-', 'ant-', 'api03-', 'D'.repeat(40))],
  ['aws access key id', j('AKIA', 'IOSFODNN7EXAMPLE')],
  ['aws secret, lowercase name', j('aws_secret_access_key', ' = ', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')],
  ['aws secret, uppercase name', j('AWS_SECRET_ACCESS_KEY', '=', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')],
  ['slack bot token', j('xox', 'b-', '1234567890', '-', '1234567890123', '-', 'abcdefghijklmnopqrstuvwx')],
  ['stripe live key', j('sk', '_live_', 'E'.repeat(24))],
  ['stripe restricted key', j('rk', '_live_', 'F'.repeat(24))],
  ['private key header', j('-----BEGIN ', 'RSA PRIVATE KEY', '-----')],
  ['bearer header', j('Authorization', ': Bearer ', 'G'.repeat(40))],
  ['basic header', j('Authorization', ': Basic ', 'dXNlcjpwYXNzd29yZA==')],
  ['set-cookie', j('Set-Cookie', ': session=', 'H'.repeat(32))],
  ['jwt', j('eyJhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')],
  ['connection string with creds', j('postgres://', 'user', ':', 'hunter2hunter2', '@db.example.com:5432/x')],
  ['provider-prefixed api key', j('lemonsqueezy', '_api_key=', 'I'.repeat(40))],
  ['generic api key assignment', j('api', '_key', ' = "', 'J'.repeat(32), '"')],
  ['client secret assignment', j('client', '_secret', ': "', 'K'.repeat(32), '"')],
  // These four are caught only by the named-assignment rule -- no value pattern
  // reaches them, because the value itself is shapeless. A connection string
  // without inline credentials still names a reachable database; an opaque
  // deploy token is still a deploy token. The mutation war found this gap by
  // disabling that branch and watching the suite stay green.
  ['DATABASE_URL without inline creds', j('DATABASE_URL', '=', 'postgres://localhost:5432/uberbond')],
  ['database_url, lowercase name', j('database_url', '=', 'postgres://localhost:5432/uberbond')],
  ['VERCEL_TOKEN with an opaque value', j('VERCEL_TOKEN', '=', 'M'.repeat(24))],
  ['GITHUB_TOKEN with an opaque value', j('GITHUB_TOKEN', '=', 'N'.repeat(40))]
];

for (const [label, value] of CREDENTIALS) {
  test(`detected: ${label}`, () => {
    assert.equal(containsSecretValue(value), true, `${label} was not detected`);
    assert.notEqual(redactSecrets(value), value, `${label} was not redacted`);
  });
}

// A guard that blocks legitimate work is a guard people route around.
const BENIGN = [
  ['an ordinary task id', 'e2e-task-1787174626471'],
  ['a short fixture key', "apiKey: 'test'"],
  ['a placeholder', 'api_key = "<your-key-here>"'],
  ['an env var name alone', 'OPENAI_API_KEY'],
  ['prose about tokens', 'The access token is refreshed by the worker on every cycle.'],
  ['a sha', 'a3f1c9d2e4b607582910abcdef0123456789abcdef0123456789abcdef012345'],
  ['a git ref', 'refs/heads/claude/uberbond-kilimanjaro-closure-hha0oo'],
  ['a url without credentials', 'https://api.example.com/v1/orders?limit=50'],
  ['a uuid', '3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
  ['an unlabelled base64 blob', 'A'.repeat(36)],
  ['the word Basic in prose', 'Basic authentication is not supported by this endpoint.'],
  ['a cookie in prose', 'The cookie is set by the browser, not by us.'],
  ['a long identifier', 'agent_worker_execution_identifier_00000000000000000001'],
  ['a semver', 'payment-renewal-truth-1.5.0'],
  ['a file path', 'src/agent-code-artifact-store.mjs']
];

for (const [label, value] of BENIGN) {
  test(`not flagged: ${label}`, () => {
    assert.equal(containsSecretValue(value), false, `${label} was blocked`);
    assert.equal(redactSecrets(value), value, `${label} was redacted`);
  });
}

test('the blocker is at least as strong as the redactor', () => {
  // They consulted different rule sets, so a credential could be refused entry
  // to a receipt and admitted into durable task history in the same run.
  for (const [label, value] of CREDENTIALS) {
    if (redactSecrets(value) !== value) {
      assert.equal(containsSecretValue(value), true,
        `${label} is redacted but not blocked`);
    }
  }
});

test('repeated calls do not drift', () => {
  // SECRET_ASSIGNMENT_PATTERN is global, and `.test` on a global regex carries
  // lastIndex between calls.
  const value = j('AWS_SECRET_ACCESS_KEY', '=', 'L'.repeat(40));
  for (let i = 0; i < 5; i += 1) assert.equal(containsSecretValue(value), true);
});
