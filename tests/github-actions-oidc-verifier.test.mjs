import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  GITHUB_ACTIONS_OIDC_ISSUER,
  SELF_MAINTAINER_OIDC_AUDIENCE,
  requestGithubActionsOidcToken,
  verifyGithubActionsOidcToken
} from '../src/github-actions-oidc-verifier.mjs';
import { issueVerifiedGithubActionsSelfMaintainerAuthority } from '../src/github-actions-self-maintainer-authority.mjs';

const SHA = 'a'.repeat(40);
const NOW = new Date('2026-09-05T19:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });
const KID = 'uberbond-test-kid';

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedToken(overrides = {}) {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const claims = {
    iss: GITHUB_ACTIONS_OIDC_ISSUER,
    aud: SELF_MAINTAINER_OIDC_AUDIENCE,
    iat: NOW_S - 10,
    nbf: NOW_S - 10,
    exp: NOW_S + 300,
    repository: 'mohammedwessam2007/uberbondd',
    repository_id: '1300996174',
    repository_owner: 'mohammedwessam2007',
    repository_owner_id: '290769413',
    workflow_ref: 'mohammedwessam2007/uberbondd/.github/workflows/uberbond-self-maintainer.yml@refs/heads/main',
    ref: 'refs/heads/main',
    ref_type: 'branch',
    sha: SHA,
    event_name: 'schedule',
    runner_environment: 'github-hosted',
    run_id: '123456789',
    run_attempt: '1',
    jti: 'fixture-jti',
    ...overrides
  };
  const signingInput = `${b64(header)}.${b64(claims)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function jwksResponse() {
  return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function env(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'mohammedwessam2007/uberbondd',
    GITHUB_SHA: SHA,
    GITHUB_WORKFLOW_REF: 'mohammedwessam2007/uberbondd/.github/workflows/uberbond-self-maintainer.yml@refs/heads/main',
    GITHUB_EVENT_NAME: 'schedule',
    GITHUB_TOKEN: 'scoped-github-token-fixture',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/oidc/token?api-version=2.0',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-request-secret-fixture',
    ...overrides
  };
}

test('OIDC verifier accepts only the signed exact dedicated-workflow identity', async () => {
  const token = signedToken();
  const result = await verifyGithubActionsOidcToken({
    token,
    expectedSha: SHA,
    date: NOW,
    fetchImpl: async url => {
      assert.equal(String(url), 'https://token.actions.githubusercontent.com/.well-known/jwks');
      return jwksResponse();
    }
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.identity.sha, SHA);
  assert.equal(result.identity.repository, 'mohammedwessam2007/uberbondd');
});

test('OIDC verifier rejects wrong repository, workflow, SHA, audience and runner identity even when signed', async () => {
  const cases = [
    { claims: { repository: 'attacker/uberbondd' }, code: 'github-oidc-repository-mismatch' },
    { claims: { workflow_ref: 'mohammedwessam2007/uberbondd/.github/workflows/evil.yml@refs/heads/main' }, code: 'github-oidc-dedicated-main-workflow-required' },
    { claims: { sha: 'b'.repeat(40) }, code: 'github-oidc-sha-mismatch' },
    { claims: { aud: 'some-other-audience' }, code: 'github-oidc-audience-mismatch' },
    { claims: { runner_environment: 'self-hosted' }, code: 'github-oidc-github-hosted-runner-required' }
  ];
  for (const item of cases) {
    const result = await verifyGithubActionsOidcToken({
      token: signedToken(item.claims),
      expectedSha: SHA,
      date: NOW,
      fetchImpl: async () => jwksResponse()
    });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.ok(result.reasonCodes.includes(item.code), JSON.stringify(result));
  }
});

test('OIDC token request refuses non-GitHub Actions origins before sending the bearer', async () => {
  let calls = 0;
  const result = await requestGithubActionsOidcToken({
    env: env({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://attacker.example/token' }),
    fetchImpl: async () => { calls += 1; throw new Error('should-not-run'); }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('github-oidc-request-origin-invalid'));
  assert.equal(calls, 0);
});

test('OIDC-rooted authority uses the request secret only as a header and never persists token material', async () => {
  const jwt = signedToken();
  const requestSecret = 'oidc-request-secret-fixture';
  const githubSecret = 'scoped-github-token-fixture';
  const seen = [];
  const result = await issueVerifiedGithubActionsSelfMaintainerAuthority({
    env: env({ ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestSecret, GITHUB_TOKEN: githubSecret }),
    baseRevision: SHA,
    date: NOW,
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      seen.push({ target, authorization: init?.headers?.authorization || null });
      if (target.startsWith('https://pipelines.actions.githubusercontent.com/')) {
        assert.equal(init.headers.authorization, `Bearer ${requestSecret}`);
        assert.match(target, new RegExp(`audience=${SELF_MAINTAINER_OIDC_AUDIENCE}`));
        return new Response(JSON.stringify({ value: jwt }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (target === 'https://token.actions.githubusercontent.com/.well-known/jwks') return jwksResponse();
      throw new Error(`unexpected fetch ${target}`);
    }
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'OIDC_ROOTED_AUTHORITY_ISSUED');
  assert.equal(result.authority.scope, 'BRANCH_AND_PR_ONLY');
  const durable = JSON.stringify(result);
  assert.equal(durable.includes(requestSecret), false);
  assert.equal(durable.includes(githubSecret), false);
  assert.equal(durable.includes(jwt), false);
  assert.equal(seen.length, 2);
});
