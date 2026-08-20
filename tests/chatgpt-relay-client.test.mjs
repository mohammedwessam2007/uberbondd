import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatgptRelayClient } from '../src/chatgpt-relay-client.mjs';

const ZERO_EFFECTS = {
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
};

function response(payload, { status = 200, contentLength } = {}) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return name === 'content-length' && contentLength != null ? String(contentLength) : null; } },
    async text() { return raw; }
  };
}

function taskInput(overrides = {}) {
  return {
    taskId: 'chatgpt-task-1',
    objective: 'Inspect the repository and run the bounded verification gate.',
    requiredOutputs: ['outcome', 'tests'],
    acceptanceTests: ['verification completes with zero external effects'],
    evidenceRefs: ['test:chatgpt-relay-client'],
    budget: { maxTokens: 20_000, maxCostCents: 0 },
    ...overrides
  };
}

function completedResult() {
  return {
    outcome: 'Verification passed.',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'npm run check', result: 'PASS' }],
    truthTable: { verification: 'PASS_LOCAL' },
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: 'PROCEED'
  };
}

test('configuration is fail-closed and never returns the bearer credential', () => {
  const client = createChatgptRelayClient({ endpoint: 'http://relay.test/api/agent-relay', bearerToken: 'super-secret-token' });
  const config = client.getConfig();
  assert.equal(config.ok, false);
  assert.deepEqual(config.reasonCodes, ['valid-https-relay-endpoint-required']);
  assert.equal(config.credentialPresent, true);
  assert.doesNotMatch(JSON.stringify(config), /super-secret-token/);
});
test('endpoint credentials, query strings, fragments, and wrong paths are rejected', () => {
  for (const endpoint of [
    'https://user:pass@relay.test/api/agent-relay',
    'https://relay.test/api/agent-relay?token=x',
    'https://relay.test/api/agent-relay#x',
    'https://relay.test/not-the-relay'
  ]) {
    assert.equal(createChatgptRelayClient({ endpoint, bearerToken: '12345678' }).getConfig().ok, false);
  }
});

test('health uses the bearer only in the authorization header and returns no credential', async () => {
  let observed;
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: 'super-secret-token',
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return response({ ok: true, status: 'READY', externalEffectLedger: { ...ZERO_EFFECTS } });
    }
  });
  const result = await client.health();
  assert.equal(result.status, 'READY');
  assert.match(observed.options.headers.authorization, /^Bearer /);
  assert.doesNotMatch(observed.url + JSON.stringify(result), /super-secret-token/);
});

test('createTask compiles a canonical local-only ChatGPT-to-Claude task', async () => {
  let posted;
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async (_url, options) => {
      posted = JSON.parse(options.body);
      return response({
        ok: true, status: 'QUEUED', taskId: posted.input.taskId,
        task: posted.input, issueNumber: 44, externalEffectLedger: { ...ZERO_EFFECTS }
      });
    }
  });
  const result = await client.createTask(taskInput({ originAgent: 'spoofed', targetAgent: 'spoofed', consequenceClass: 'OWNER_AUTHORIZED_EXTERNAL' }), new Date('2026-08-20T00:00:00Z'));
  assert.equal(result.status, 'QUEUED');
  assert.equal(posted.operation, 'create');
  assert.equal(posted.input.originAgent, 'chatgpt');
  assert.equal(posted.input.targetAgent, 'claude-code');
  assert.equal(posted.input.consequenceClass, 'LOCAL_PREPARATION');
  assert.equal(posted.input.budget.maxTokens, 20_000);
  assert.ok(posted.input.forbiddenActions.includes('deploy'));
});

test('canonical maxTokens budget is allowed while credential-shaped keys are rejected', async () => {
  let calls = 0;
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      return response({ ok: true, status: 'QUEUED', taskId: body.input.taskId, task: body.input, externalEffectLedger: { ...ZERO_EFFECTS } });
    }
  });
  assert.equal((await client.createTask(taskInput())).ok, true);
  assert.equal((await client.createTask(taskInput({ apiToken: 'not-allowed-here' }))).ok, false);
  assert.equal(calls, 1);
});

test('secret-shaped values and oversized tasks are rejected before fetch', async () => {
  let calls = 0;
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async () => { calls += 1; return response({}); }
  });
  const secret = await client.createTask(taskInput({ constraints: ['Bearer abcdefghijklmnopqrstuvwxyz'] }));
  const oversized = await client.createTask(taskInput({ objective: 'x'.repeat(200_001) }));
  assert.deepEqual(secret.reasonCodes, ['secret-like-task-rejected']);
  assert.equal(oversized.ok, false);
  assert.equal(calls, 0);
});

test('a relay task identity mismatch is rejected', async () => {
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async () => response({
      ok: true, status: 'QUEUED', taskId: 'different', task: { taskId: 'different' }, externalEffectLedger: { ...ZERO_EFFECTS }
    })
  });
  assert.deepEqual((await client.createTask(taskInput())).reasonCodes, ['relay-task-identity-mismatch']);
});

test('network failures and request timeouts are sanitized', async () => {
  const failed = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: 'super-secret-token',
    fetchImpl: async () => { throw new Error('super-secret-token leaked in transport'); }
  });
  const network = await failed.health();
  assert.deepEqual(network.reasonCodes, ['relay-network-failure']);
  assert.doesNotMatch(JSON.stringify(network), /super-secret-token/);

  const timed = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678', requestTimeoutMs: 25,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })
  });
  assert.deepEqual((await timed.health()).reasonCodes, ['relay-request-timeout']);
});

test('HTTP failures are classified without reflecting server bodies', async () => {
  for (const [status, expected] of [[401, 'relay-unauthorized'], [503, 'relay-not-configured'], [500, 'relay-http-failure']]) {
    const client = createChatgptRelayClient({
      endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
      fetchImpl: async () => response('server-secret-body', { status })
    });
    const result = await client.health();
    assert.deepEqual(result.reasonCodes, [expected]);
    assert.doesNotMatch(JSON.stringify(result), /server-secret-body/);
  }
});

test('malformed, oversized, secret-bearing, and non-zero-effect responses fail closed', async () => {
  const payloads = [
    response('{broken'),
    response('{}', { contentLength: 250_001 }),
    response({ ok: true, status: 'READY', apiToken: 'hidden', externalEffectLedger: { ...ZERO_EFFECTS } }),
    response({ ok: true, status: 'READY', externalEffectLedger: { ...ZERO_EFFECTS, messages: 1 } })
  ];
  const expected = [
    'relay-response-json-required', 'response-too-large',
    'secret-like-relay-response-rejected', 'invalid-relay-external-effect-ledger'
  ];
  for (let index = 0; index < payloads.length; index += 1) {
    const client = createChatgptRelayClient({
      endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
      fetchImpl: async () => payloads[index]
    });
    assert.deepEqual((await client.health()).reasonCodes, [expected[index]]);
  }
});

test('readTask rejects invalid issue numbers before fetch', async () => {
  let calls = 0;
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async () => { calls += 1; return response({}); }
  });
  assert.deepEqual((await client.readTask({ issueNumber: '../secrets' })).reasonCodes, ['valid-issue-number-required']);
  assert.equal(calls, 0);
});

test('readTask binds the expected task identity', async () => {
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async () => response({
      ok: true, issueState: 'open', task: { taskId: 'wrong' }, result: null,
      externalEffectLedger: { ...ZERO_EFFECTS }
    })
  });
  assert.deepEqual((await client.readTask({ issueNumber: 44, expectedTaskId: 'expected' })).reasonCodes, ['relay-task-identity-mismatch']);
});

test('waitForResult performs a bounded poll and returns a validated receipt', async () => {
  let reads = 0;
  const sleeps = [];
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678', sleep: async ms => { sleeps.push(ms); },
    fetchImpl: async () => {
      reads += 1;
      return response({
        ok: true, issueState: reads < 3 ? 'open' : 'closed', task: { taskId: 'chatgpt-task-1' },
        result: reads < 3 ? null : completedResult(), resultStatus: reads < 3 ? null : 'COMPLETED',
        submittedBy: reads < 3 ? null : 'claude-code:worker', submittedAt: reads < 3 ? null : '2026-08-20T00:05:00Z',
        externalEffectLedger: { ...ZERO_EFFECTS }
      });
    }
  });
  const result = await client.waitForResult({ issueNumber: 44, expectedTaskId: 'chatgpt-task-1', maxPolls: 5, pollIntervalMs: 25 });
  assert.equal(result.status, 'RESULT_RECEIVED');
  assert.equal(result.polls, 3);
  assert.deepEqual(sleeps, [25, 25]);
  assert.equal(result.result.decision, 'PROCEED');
});

test('waitForResult stops exactly at its poll bound', async () => {
  let reads = 0;
  const client = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678', sleep: async () => {},
    fetchImpl: async () => {
      reads += 1;
      return response({ ok: true, issueState: 'open', task: { taskId: 'chatgpt-task-1' }, result: null, externalEffectLedger: { ...ZERO_EFFECTS } });
    }
  });
  const result = await client.waitForResult({ issueNumber: 44, maxPolls: 3, pollIntervalMs: 25 });
  assert.equal(result.status, 'PENDING');
  assert.equal(result.polls, 3);
  assert.equal(reads, 3);
});

test('closed-without-receipt and malformed worker results fail closed', async () => {
  const closed = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async () => response({ ok: true, issueState: 'closed', task: { taskId: 'x' }, result: null, externalEffectLedger: { ...ZERO_EFFECTS } })
  });
  assert.deepEqual((await closed.waitForResult({ issueNumber: 1 })).reasonCodes, ['relay-closed-without-result-receipt']);

  const malformed = createChatgptRelayClient({
    endpoint: 'https://relay.test/api/agent-relay', bearerToken: '12345678',
    fetchImpl: async () => response({
      ok: true, issueState: 'closed', task: { taskId: 'x' },
      result: { ...completedResult(), externalEffectLedger: { ...ZERO_EFFECTS, messages: 1 } }, resultStatus: 'COMPLETED',
      externalEffectLedger: { ...ZERO_EFFECTS }
    })
  });
  assert.deepEqual((await malformed.readTask({ issueNumber: 1 })).reasonCodes, ['worker-nonzero-external-effect-ledger-rejected']);
});

test('the client module has no provider SDK, filesystem, process, or arbitrary execution boundary', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/chatgpt-relay-client.mjs', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /child_process|execFile|spawn\(|writeFile|GITHUB_TOKEN|process\.env|openai|anthropic/i);
});
