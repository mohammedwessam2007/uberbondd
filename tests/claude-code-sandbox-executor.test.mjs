import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeCodeSandboxExecutor } from '../src/claude-code-sandbox-executor.mjs';

const sandboxRoot = '/tmp/uberbond-claude-sandbox-test';
const ephemeralHome = '/tmp/uberbond-claude-home-test';

function isolation(overrides = {}) {
  return {
    status: 'VERIFIED_ISOLATED',
    sandboxRoot,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    productionNetworkReachability: false,
    networkEgressMode: 'ANTHROPIC_ONLY',
    providerCredentialScope: 'ANTHROPIC_ONLY',
    hostHomeMounted: false,
    ephemeralHome,
    evidenceRefs: ['test:os-sandbox-fixture'],
    ...overrides
  };
}

function task(overrides = {}) {
  return {
    taskId: 'task_cc_1',
    objective: 'Modify one local sandbox file and report truthfully.',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    contextRefs: ['doc:sandbox'],
    evidenceRefs: ['test:fixture'],
    constraints: ['local-preparation-only'],
    forbiddenActions: ['deploy'],
    requiredOutputs: ['bounded patch'],
    acceptanceTests: ['npm run check'],
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function canonicalResult(overrides = {}) {
  return {
    outcome: 'Sandbox edit prepared.',
    changedArtifacts: ['src/example.mjs'],
    testsActuallyRun: [],
    truthTable: [{ claim: 'edited sandbox', status: 'VERIFIED', evidenceRefs: ['test:fixture'] }],
    externalEffectLedger: {
      providerCalls: 0,
      messages: 0,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    },
    decision: 'PROCEED',
    coordination: {
      action: 'REVIEW_REQUIRED',
      objective: 'Review the collected sandbox change set.',
      summary: 'Local edit complete.',
      evidenceRefs: ['test:fixture'],
      confidence: 0.9
    },
    evidenceRefs: ['test:fixture'],
    ...overrides
  };
}

function stream({ result = canonicalResult(), rawResult = null, toolName = 'Read', totalCostUsd = 0.0123, subtype = 'success', isError = false, input = 100, output = 50 } = {}) {
  const finalValue = rawResult == null ? JSON.stringify(result) : rawResult;
  const messages = [
    {
      type: 'system',
      subtype: 'init',
      session_id: 'sess_cc_1',
      cwd: sandboxRoot,
      tools: ['Read', 'Write', 'Edit'],
      mcp_servers: [],
      model: 'sonnet',
      permissionMode: 'acceptEdits'
    },
    {
      type: 'assistant',
      session_id: 'sess_cc_1',
      message: {
        usage: {
          input_tokens: input,
          output_tokens: output,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 20
        },
        content: toolName ? [{ type: 'tool_use', name: toolName, input: {} }] : []
      }
    },
    {
      type: 'result',
      subtype,
      is_error: isError,
      num_turns: 2,
      result: finalValue,
      session_id: 'sess_cc_1',
      total_cost_usd: totalCostUsd
    }
  ];
  return messages.map(message => JSON.stringify(message)).join('\n') + '\n';
}

function executor({ enabled = true, isolationReceipt = isolation(), runProcess, env } = {}) {
  return createClaudeCodeSandboxExecutor({
    enabled,
    sandboxRoot,
    isolationReceipt,
    defaultModel: 'sonnet',
    maxTurns: 5,
    timeoutMs: 30_000,
    env: env || { PATH: '/usr/bin', HOME: '/tmp/host-home', DATABASE_URL: 'postgres://must-not-leak', OPENAI_API_KEY: 'must-not-leak' },
    runProcess
  });
}

test('executor is disabled by default and never starts Claude Code', async () => {
  let calls = 0;
  const run = executor({ enabled: false, runProcess: async () => { calls += 1; return { stdout: stream() }; } });
  const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('claude-code-sandbox-executor-disabled'));
  assert.equal(calls, 0);
});

test('verified OS isolation is mandatory before local edit capability exists', async () => {
  let calls = 0;
  const run = executor({
    isolationReceipt: isolation({ status: 'UNVERIFIED' }),
    runProcess: async () => { calls += 1; return { stdout: stream() }; }
  });
  const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('os-sandbox-not-verified'));
  assert.equal(calls, 0);
});

test('host HOME isolation and Anthropic-only egress are mandatory', async () => {
  for (const isolationReceipt of [
    isolation({ hostHomeMounted: true }),
    isolation({ networkEgressMode: 'GENERAL_INTERNET' }),
    isolation({ ephemeralHome: '' }),
    isolation({ ephemeralHome: `${sandboxRoot}/home` })
  ]) {
    let calls = 0;
    const run = executor({ isolationReceipt, runProcess: async () => { calls += 1; return { stdout: stream() }; } });
    const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
    assert.equal(out.ok, false);
    assert.equal(calls, 0);
  }
});

test('CLI invocation is fixed to noninteractive bounded edit-only profile and strips business/host config secrets from env', async () => {
  let captured;
  const run = executor({
    env: {
      PATH: '/usr/bin', HOME: '/tmp/host-home', USERPROFILE: '/tmp/host-user', LANG: 'C.UTF-8',
      XDG_CONFIG_HOME: '/tmp/host-xdg', CLAUDE_CONFIG_DIR: '/tmp/host-claude',
      ANTHROPIC_API_KEY: 'provider-only-secret', ANTHROPIC_BASE_URL: 'https://evil.invalid',
      DATABASE_URL: 'postgres://must-not-leak',
      OPENAI_API_KEY: 'must-not-leak',
      VERCEL_TOKEN: 'must-not-leak'
    },
    runProcess: async input => {
      captured = input;
      return { stdout: stream(), stderr: '', exitCode: 0 };
    }
  });
  const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.equal(captured.executable, 'claude');
  assert.equal(captured.cwd, sandboxRoot);
  assert.ok(captured.args.includes('-p'));
  assert.ok(captured.args.includes('stream-json'));
  assert.ok(captured.args.includes('acceptEdits'));
  const allowed = captured.args[captured.args.indexOf('--allowedTools') + 1];
  const disallowed = captured.args[captured.args.indexOf('--disallowedTools') + 1];
  assert.equal(allowed, 'Read,Write,Edit');
  assert.ok(disallowed.includes('Bash'));
  assert.ok(disallowed.includes('WebFetch'));
  assert.equal(captured.env.DATABASE_URL, undefined);
  assert.equal(captured.env.OPENAI_API_KEY, undefined);
  assert.equal(captured.env.VERCEL_TOKEN, undefined);
  assert.equal(captured.env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(captured.env.XDG_CONFIG_HOME, undefined);
  assert.equal(captured.env.ANTHROPIC_API_KEY, 'provider-only-secret');
  assert.equal(captured.env.HOME, ephemeralHome);
  assert.equal(captured.env.USERPROFILE, ephemeralHome);
  assert.equal(captured.env.CLAUDE_CONFIG_DIR, `${ephemeralHome}/.claude`);
});

test('stream usage counts cache tokens and uses CLI total cost for worker ledger', async () => {
  const run = executor({ runProcess: async () => ({ stdout: stream({ input: 100, output: 50, totalCostUsd: 0.0123 }) }) });
  const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.equal(out.usage.inputTokens, 130);
  assert.equal(out.usage.outputTokens, 50);
  assert.equal(out.usage.totalTokens, 180);
  assert.equal(out.usage.costCents, 2);
  assert.equal(out.providerRequestId, 'sess_cc_1');
});

test('unexpected tool use is a sandbox policy violation', async () => {
  const run = executor({ runProcess: async () => ({ stdout: stream({ toolName: 'Bash' }) }) });
  const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'SANDBOX_POLICY_VIOLATION');
  assert.equal(out.observedTool, 'Bash');
});

test('token and cost ceilings fail closed after measured Claude Code usage', async () => {
  const tokenRun = executor({ runProcess: async () => ({ stdout: stream({ input: 1000, output: 500 }) }) });
  const token = await tokenRun({ task: task(), model: 'sonnet', maxTokens: 100, costCeilingCents: 100 });
  assert.equal(token.outcome, 'COMPUTE_BUDGET_VIOLATION');
  assert.ok(token.reasonCodes.includes('claude-code-token-ceiling-exceeded'));

  const costRun = executor({ runProcess: async () => ({ stdout: stream({ totalCostUsd: 1.25 }) }) });
  const cost = await costRun({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 5 });
  assert.equal(cost.outcome, 'COMPUTE_BUDGET_VIOLATION');
  assert.ok(cost.reasonCodes.includes('claude-code-cost-ceiling-exceeded'));
});

test('process ambiguity is not blindly converted into retryable success', async () => {
  const run = executor({ runProcess: async () => { throw new Error('process terminated after provider request'); } });
  const out = await run({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.uncertain, true);
});

test('invalid final JSON and nonzero external effects are rejected', async () => {
  const invalidJson = executor({ runProcess: async () => ({ stdout: stream({ rawResult: 'not json' }) }) });
  const a = await invalidJson({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(a.ok, false);
  assert.ok(a.reasonCodes.includes('claude-code-canonical-result-json-required'));

  const nonzero = canonicalResult({
    externalEffectLedger: {
      providerCalls: 0, messages: 0, purchases: 0, deployments: 1,
      credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
    }
  });
  const external = executor({ runProcess: async () => ({ stdout: stream({ result: nonzero }) }) });
  const b = await external({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(b.ok, false);
  assert.ok(b.reasonCodes.includes('nonzero-external-effect-ledger-rejected'));
});

test('consequenceful tasks are rejected before Claude Code starts', async () => {
  let calls = 0;
  const run = executor({ runProcess: async () => { calls += 1; return { stdout: stream() }; } });
  const out = await run({
    task: task({ consequenceClass: 'EXTERNAL_EFFECT' }),
    model: 'sonnet',
    maxTokens: 1000,
    costCeilingCents: 10
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('claude-code-only-accepts-local-preparation'));
  assert.equal(calls, 0);
});
