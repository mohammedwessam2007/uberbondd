import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { executeGithubSkillBodyReads, executePinnedRawSkillBodyReads, gitBlobSha1 } from '../src/capability-genome-body-fetch.mjs';

const commit = '3b3fad96af16a10759d930941b4520ba0c40edae';
const blob = '47c72c607bdb5dd81bdea5de2b5e4f3992a5fd59';
const content = '---\nname: example\n---\n\n# Example\n';
const encoded = Buffer.from(content, 'utf8').toString('base64');
const request = {
  repositoryFullName: 'anthropics/skills',
  sourceCommit: commit,
  expectedGitBlobSha: blob,
  skillPath: 'skills/example/SKILL.md',
  observedAt: '2026-08-31T16:20:00.000Z'
};
function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: key => headers[String(key).toLowerCase()] ?? null },
    async json() { return body; }
  };
}

test('pinned body fetch uses public GET without authorization and hashes returned bytes', async () => {
  const seen = [];
  const result = await executeGithubSkillBodyReads({
    requests: [request],
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return response(200, { type: 'file', encoding: 'base64', content: encoded, sha: blob, size: Buffer.byteLength(content) });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PINNED_PUBLIC_SKILL_BODY_READS_COMPLETE');
  assert.equal(result.providerCalls, 1);
  assert.equal(result.imports.length, 1);
  assert.equal(result.receipts[0].contentSha256, crypto.createHash('sha256').update(content).digest('hex'));
  assert.match(seen[0].url, /ref=3b3fad96af16a10759d930941b4520ba0c40edae/);
  assert.equal(seen[0].options.method, 'GET');
  assert.equal(Object.hasOwn(seen[0].options.headers, 'Authorization'), false);
});

test('expected Git blob mismatch fails closed before body evidence is accepted', async () => {
  const result = await executeGithubSkillBodyReads({
    requests: [request],
    fetchImpl: async () => response(200, { type: 'file', encoding: 'base64', content: encoded, sha: 'a'.repeat(40) })
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('git-blob-sha-mismatch'));
  assert.equal(result.completedImports.length, 0);
});

test('rate limiting never blind retries and preserves completed prior imports', async () => {
  let calls = 0;
  const second = { ...request, repositoryFullName: 'vercel-labs/skills', sourceCommit: '435076e78988e1e6ec40d00b0b1d76bdbbc5419a', expectedGitBlobSha: 'a41bdd074bb587afd861332cf2f473f3154de4d7', skillPath: 'skills/find-skills/SKILL.md' };
  const result = await executeGithubSkillBodyReads({
    requests: [request, second],
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response(200, { type: 'file', encoding: 'base64', content: encoded, sha: blob });
      return response(429, {}, { 'retry-after': '60' });
    }
  });
  assert.equal(result.status, 'SKILL_BODY_RATE_LIMITED_NO_BLIND_RETRY');
  assert.equal(calls, 2);
  assert.equal(result.providerCalls, 2);
  assert.equal(result.imports.length, 1);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.retryAfter, '60');
});

test('provider-call ceiling returns resumable partial imports', async () => {
  let calls = 0;
  const result = await executeGithubSkillBodyReads({
    requests: [request, { ...request, skillPath: 'skills/second/SKILL.md' }],
    maxProviderCalls: 1,
    fetchImpl: async () => {
      calls += 1;
      return response(200, { type: 'file', encoding: 'base64', content: encoded, sha: blob });
    }
  });
  assert.equal(result.status, 'SKILL_BODY_PROVIDER_CALL_BUDGET_EXHAUSTED');
  assert.equal(calls, 1);
  assert.equal(result.imports.length, 1);
  assert.equal(result.remainingRequestIndex, 1);
});

test('mutable refs and non-SKILL paths are rejected before any provider call', async () => {
  let calls = 0;
  const result = await executeGithubSkillBodyReads({
    requests: [{ ...request, sourceCommit: 'main', skillPath: 'README.md' }],
    fetchImpl: async () => { calls += 1; return response(500, {}); }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-pinned-skill-body-request-required'));
  assert.equal(calls, 0);
});

test('non-UTF8 bytes fail closed rather than being coerced into skill instructions', async () => {
  const invalid = Buffer.from([0xff, 0xfe, 0xfd]).toString('base64');
  const result = await executeGithubSkillBodyReads({
    requests: [request],
    fetchImpl: async () => response(200, { type: 'file', encoding: 'base64', content: invalid, sha: blob })
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('utf8-skill-body-required'));
});


// --- 403 is a diagnosis, not a synonym for 429 -----------------------------

function rawResponse(status, bytes, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: key => headers[String(key).toLowerCase()] ?? null },
    async arrayBuffer() { return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? ''); }
  };
}

test('an exhausted quota is reported as a quota, with the header that proves it', async () => {
  for (const [status, headers] of [[429, {}], [403, { 'retry-after': '60' }], [403, { 'x-ratelimit-remaining': '0' }]]) {
    const result = await executeGithubSkillBodyReads({
      requests: [request],
      fetchImpl: async () => response(status, {}, headers)
    });
    assert.equal(result.status, 'SKILL_BODY_RATE_LIMITED_NO_BLIND_RETRY', `${status} ${JSON.stringify(headers)}`);
    assert.equal(result.operatorAction, 'WAIT_FOR_QUOTA_RESET_OR_USE_AN_AUTHORIZED_LANE');
  }
});

test('a bare 403 is an access decision, and waiting will never clear it', async () => {
  // Reporting this as a rate limit sends an operator to watch a clock instead
  // of to fix the authorization that is actually refusing them.
  const result = await executeGithubSkillBodyReads({
    requests: [request],
    fetchImpl: async () => response(403, {}, { 'x-ratelimit-remaining': '4998' })
  });
  assert.equal(result.status, 'SKILL_BODY_ACCESS_DENIED_NOT_RATE_LIMITED');
  assert.equal(result.operatorAction, 'RESOLVE_READ_AUTHORIZATION_FOR_THIS_REPOSITORY');
  assert.equal(result.accessDeniedRequestIndex, 0);
  assert.equal(result.rateLimitedRequestIndex, undefined);
  // Either way it stops. Only the diagnosis changed.
  assert.equal(result.imports.length, 0);
});

// --- the raw transport binds identity to bytes, not to a claim -------------

test('the raw transport computes the blob identity instead of being told it', async () => {
  const bytes = Buffer.from(content, 'utf8');
  const result = await executePinnedRawSkillBodyReads({
    requests: [{ ...request, expectedGitBlobSha: gitBlobSha1(bytes), expectedContentSha256: crypto.createHash('sha256').update(bytes).digest('hex') }],
    fetchImpl: async () => rawResponse(200, bytes)
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.receipts[0].blobIdentitySource, 'COMPUTED_FROM_RECEIVED_BYTES');
  assert.equal(result.receipts[0].transport, 'GITHUB_RAW_PINNED_COMMIT');
  assert.equal(result.imports[0].bodyEvidence.gitBlobSha, gitBlobSha1(bytes));
});

test('the raw transport refuses a read it cannot bind to a pinned identity', async () => {
  let calls = 0;
  const result = await executePinnedRawSkillBodyReads({
    requests: [{ ...request, expectedGitBlobSha: null }],
    fetchImpl: async () => { calls += 1; return rawResponse(200, content); }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('expected-git-blob-sha-required-for-raw-transport'));
  // Refused before the call. An unverifiable body would enter the corpus
  // indistinguishable from a verified one, so it is worth less than none.
  assert.equal(calls, 0);
});

test('substituted bytes cannot pass themselves off as the pinned body', async () => {
  const bytes = Buffer.from(content, 'utf8');
  const result = await executePinnedRawSkillBodyReads({
    requests: [{ ...request, expectedGitBlobSha: gitBlobSha1(bytes) }],
    fetchImpl: async () => rawResponse(200, Buffer.from(`${content}\nrm -rf /\n`, 'utf8'))
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('git-blob-sha-mismatch'));
  assert.equal(result.expectedGitBlobSha, gitBlobSha1(bytes));
});

test('a content hash that disagrees with the pinned one fails even when the blob matches', async () => {
  const bytes = Buffer.from(content, 'utf8');
  const result = await executePinnedRawSkillBodyReads({
    requests: [{ ...request, expectedGitBlobSha: gitBlobSha1(bytes), expectedContentSha256: 'a'.repeat(64) }],
    fetchImpl: async () => rawResponse(200, bytes)
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('skill-body-sha256-mismatch'));
});

test('the computed blob identity matches what Git itself would name the object', () => {
  // git hash-object of an empty blob, and of "hello\n".
  assert.equal(gitBlobSha1(Buffer.alloc(0)), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha1(Buffer.from('hello\n', 'utf8')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});
