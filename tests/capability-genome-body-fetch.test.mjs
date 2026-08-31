import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { executeGithubSkillBodyReads } from '../src/capability-genome-body-fetch.mjs';

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
