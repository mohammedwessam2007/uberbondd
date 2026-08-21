import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import health from '../relay/api/agent-relay/health.mjs';
import tasks from '../relay/api/agent-relay/tasks.mjs';
import taskPath from '../relay/api/agent-relay/tasks/[...path].mjs';

function response() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return body; }
  };
}

test('Vercel relay health is a real, explicit partial-adapter contract', () => {
  const res = response();
  health({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'HEALTHY_PARTIAL_ADAPTER');
  assert.equal(res.body.truth.fullDurableRelay, 'NOT_DEPLOYED');
  assert.equal(res.body.externalEffectLedger.messages, 0);
  assert.equal(res.body.externalEffectLedger.deployments, 0);
});

test('Vercel relay task routes fail closed without queue or worker state', () => {
  for (const handler of [tasks, taskPath]) {
    const res = response();
    handler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 501);
    assert.deepEqual(res.body.reasonCodes, ['durable-queue-required', 'cloud-worker-not-deployed']);
    assert.equal(res.body.truth.execution, 'NOT_RUN');
    assert.equal(res.body.externalEffectLedger.spendCents, 0);
  }
});

test('Vercel relay adapter contains no credential, provider, or outbound boundary', async () => {
  const source = await fs.readFile(new URL('../relay/lib/contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|child_process|process\.env|\btoken\b|\bsecret\b|\bcredential\b/i);
});
