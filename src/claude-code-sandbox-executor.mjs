import { execFile } from 'node:child_process';
import path from 'node:path';
import { validResult, ZERO_EFFECTS } from './cloud-agent-relay.mjs';

export const CLAUDE_CODE_SANDBOX_EXECUTOR_POLICY_VERSION = 'claude-code-sandbox-executor-1.1.0';

const DEFAULT_ALLOWED_TOOLS = Object.freeze(['Read', 'Write', 'Edit']);
const DEFAULT_DISALLOWED_TOOLS = Object.freeze(['Bash', 'WebFetch', 'WebSearch', 'NotebookEdit']);
const MAX_STDOUT = 4_000_000;
const MAX_PROMPT = 60_000;
const MAX_TURNS = 12;

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value, min, max, fallback = null) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}

function finite(value, min, max, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function fail(reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) {
  return {
    ok: false,
    policyVersion: CLAUDE_CODE_SANDBOX_EXECUTOR_POLICY_VERSION,
    outcome,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function typedEvidence(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(value => /^(receipt|test|audit|github|doc|provider):/i.test(value)))].slice(0, 50);
}

function absoluteNonRoot(value) {
  const raw = text(value, 1000);
  if (!raw || !path.isAbsolute(raw)) return null;
  const resolved = path.resolve(raw);
  if (resolved === path.parse(resolved).root) return null;
  return resolved;
}

function validateIsolation(receipt, sandboxRoot) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['os-sandbox-isolation-receipt-required'];
  if (String(receipt.status || '').toUpperCase() !== 'VERIFIED_ISOLATED') reasons.push('os-sandbox-not-verified');
  if (text(receipt.sandboxRoot, 1000) !== text(sandboxRoot, 1000)) reasons.push('sandbox-root-receipt-mismatch');
  if (String(receipt.filesystemScope || '').toUpperCase() !== 'EPHEMERAL_SANDBOX_ONLY') reasons.push('ephemeral-filesystem-isolation-required');
  if (receipt.businessCredentialsMounted !== false) reasons.push('business-credentials-must-not-be-mounted');
  if (receipt.productionNetworkReachability !== false) reasons.push('production-network-must-be-unreachable');
  if (String(receipt.networkEgressMode || '').toUpperCase() !== 'ANTHROPIC_ONLY') reasons.push('anthropic-only-network-egress-required');
  if (String(receipt.providerCredentialScope || '').toUpperCase() !== 'ANTHROPIC_ONLY') reasons.push('anthropic-only-provider-credential-scope-required');
  if (receipt.hostHomeMounted !== false) reasons.push('host-home-must-not-be-mounted');
  const ephemeralHome = absoluteNonRoot(receipt.ephemeralHome);
  if (!ephemeralHome) reasons.push('absolute-ephemeral-home-required');
  const sandbox = absoluteNonRoot(sandboxRoot);
  if (ephemeralHome && sandbox && (ephemeralHome === sandbox || ephemeralHome.startsWith(`${sandbox}${path.sep}`))) {
    reasons.push('ephemeral-home-must-be-outside-git-sandbox');
  }
  const refs = typedEvidence(receipt.evidenceRefs);
  if (!refs.length || refs.length !== (receipt.evidenceRefs || []).length) reasons.push('typed-isolation-evidence-required');
  return reasons;
}

function sanitizedEnv(source = process.env, isolationReceipt = {}) {
  // Do not inherit host config roots or custom provider base URLs. The sandbox
  // gets a dedicated ephemeral HOME/Claude config root and, at most, the one
  // provider credential needed for the bounded Claude Code call.
  const names = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'ANTHROPIC_API_KEY'];
  const env = {};
  for (const name of names) if (source?.[name] != null) env[name] = String(source[name]);
  const ephemeralHome = absoluteNonRoot(isolationReceipt.ephemeralHome);
  if (ephemeralHome) {
    env.HOME = ephemeralHome;
    env.USERPROFILE = ephemeralHome;
    env.CLAUDE_CONFIG_DIR = path.join(ephemeralHome, '.claude');
  }
  return env;
}

function defaultRun({ executable, args, cwd, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: MAX_STDOUT,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(text(error.message, 1000));
        wrapped.exitCode = error.code;
        wrapped.stdout = String(stdout || '');
        wrapped.stderr = String(stderr || '');
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), exitCode: 0 });
    });
  });
}

function promptFor(task) {
  const payload = {
    taskId: task.taskId,
    objective: task.objective,
    contextRefs: task.contextRefs || [],
    evidenceRefs: task.evidenceRefs || [],
    constraints: task.constraints || [],
    forbiddenActions: task.forbiddenActions || [],
    requiredOutputs: task.requiredOutputs || [],
    acceptanceTests: task.acceptanceTests || []
  };
  return [
    'You are the bounded Claude Code engineering worker inside UberBond.',
    'Work ONLY inside the current ephemeral sandbox checkout.',
    'You may inspect and edit local files using Read, Write and Edit only.',
    'Do not use shell/Bash, web/network tools, MCP tools, deployment tools, GitHub tools, messaging tools, purchase tools, DNS tools or credential tools.',
    'Never touch .env*, credentials/, lite/, .git/, node_modules/, or .github/workflows/.',
    'Do not commit, push, merge, deploy, send, purchase, mutate production or claim revenue.',
    'Do not invent tests. Deterministic verification runs after you finish.',
    'Finish with ONE JSON object and no markdown. It must contain: outcome, changedArtifacts, testsActuallyRun, truthTable, externalEffectLedger, decision, coordination, evidenceRefs.',
    'externalEffectLedger must contain providerCalls/messages/purchases/deployments/credentialChanges/dnsChanges/productionMutations/spendCents all equal to 0.',
    'testsActuallyRun must be [] unless you genuinely ran tests through an explicitly permitted tool. In this sandbox profile Bash is disabled, so it should normally be [].',
    `Task packet: ${JSON.stringify(payload)}`
  ].join('\n');
}

function parseStreamJson(stdout) {
  const messages = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      return { ok: false, reasonCodes: ['claude-code-stream-json-parse-failed'] };
    }
  }
  if (!messages.length) return { ok: false, reasonCodes: ['claude-code-empty-stream'] };
  return { ok: true, messages };
}

function usageAndTools(messages) {
  let inputTokens = 0;
  let outputTokens = 0;
  let toolViolation = null;
  const observedTools = [];
  let final = null;
  for (const message of messages) {
    if (message?.type === 'assistant' && message?.message) {
      const usage = message.message.usage || {};
      const input = integer(usage.input_tokens ?? 0, 0, 100_000_000);
      const cacheCreate = integer(usage.cache_creation_input_tokens ?? 0, 0, 100_000_000);
      const cacheRead = integer(usage.cache_read_input_tokens ?? 0, 0, 100_000_000);
      const output = integer(usage.output_tokens ?? 0, 0, 100_000_000);
      if ([input, cacheCreate, cacheRead, output].some(value => value == null)) return { ok: false, reasonCodes: ['claude-code-token-usage-invalid'] };
      inputTokens += input + cacheCreate + cacheRead;
      outputTokens += output;
      for (const block of Array.isArray(message.message.content) ? message.message.content : []) {
        if (block?.type !== 'tool_use') continue;
        const name = text(block.name, 120);
        if (name) observedTools.push(name);
        if (!DEFAULT_ALLOWED_TOOLS.includes(name)) toolViolation = name || 'UNKNOWN';
      }
    }
    if (message?.type === 'result') final = message;
  }
  return { ok: true, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, observedTools, toolViolation, final };
}

function parseCanonicalFinal(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value.trim());
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createClaudeCodeSandboxExecutor({
  enabled = false,
  sandboxRoot,
  isolationReceipt,
  executable = 'claude',
  defaultModel = 'sonnet',
  maxTurns = 6,
  timeoutMs = 300_000,
  env = process.env,
  runProcess = defaultRun
} = {}) {
  const isolationReasons = validateIsolation(isolationReceipt, sandboxRoot);
  const turns = integer(maxTurns, 1, MAX_TURNS);
  const timeout = integer(timeoutMs, 1_000, 900_000);
  const configuredModel = text(defaultModel, 160);

  return async function claudeCodeSandboxExecutor({ task, model, maxTokens, costCeilingCents } = {}) {
    if (!enabled) return fail(['claude-code-sandbox-executor-disabled']);
    if (isolationReasons.length) return fail(isolationReasons);
    if (typeof runProcess !== 'function') return fail(['process-runner-required']);
    if (!task?.taskId || !task?.objective) return fail(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') return fail(['claude-code-only-accepts-local-preparation']);
    if (turns == null || timeout == null) return fail(['valid-cli-bounds-required']);
    const tokenLimit = integer(maxTokens, 1, 100_000_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (tokenLimit == null) return fail(['valid-token-ceiling-required']);
    if (costLimit == null) return fail(['valid-cost-ceiling-required']);
    const selectedModel = text(model || configuredModel, 160);
    if (!selectedModel) return fail(['model-required']);

    const prompt = promptFor(task);
    if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT) return fail(['claude-code-prompt-too-large']);
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(turns),
      '--model', selectedModel,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', DEFAULT_ALLOWED_TOOLS.join(','),
      '--disallowedTools', DEFAULT_DISALLOWED_TOOLS.join(',')
    ];

    let processResult;
    try {
      processResult = await runProcess({
        executable,
        args,
        cwd: sandboxRoot,
        env: sanitizedEnv(env, isolationReceipt),
        timeoutMs: timeout
      });
    } catch (error) {
      return fail(['claude-code-process-outcome-uncertain'], 'UNCERTAIN', {
        uncertain: true,
        exitCode: error?.exitCode ?? null,
        detail: text(error?.message, 1000)
      });
    }

    const parsed = parseStreamJson(processResult.stdout);
    if (!parsed.ok) return fail(parsed.reasonCodes, 'UNCERTAIN', { uncertain: true });
    const telemetry = usageAndTools(parsed.messages);
    if (!telemetry.ok) return fail(telemetry.reasonCodes, 'UNCERTAIN', { uncertain: true });
    if (telemetry.toolViolation) {
      return fail(['claude-code-unallowlisted-tool-observed'], 'SANDBOX_POLICY_VIOLATION', {
        observedTool: telemetry.toolViolation,
        observedTools: telemetry.observedTools
      });
    }

    const final = telemetry.final;
    if (!final) return fail(['claude-code-final-result-missing'], 'UNCERTAIN', { uncertain: true });
    const costUsd = finite(final.total_cost_usd, 0, 100_000);
    const costCents = costUsd == null ? null : Math.ceil(costUsd * 100 - 1e-12);
    if (costCents == null) return fail(['claude-code-cost-usage-missing'], 'UNCERTAIN', { uncertain: true, sessionId: text(final.session_id, 240) || null });
    if (telemetry.totalTokens > tokenLimit) {
      return fail(['claude-code-token-ceiling-exceeded'], 'COMPUTE_BUDGET_VIOLATION', {
        sessionId: text(final.session_id, 240) || null,
        usage: { inputTokens: telemetry.inputTokens, outputTokens: telemetry.outputTokens, totalTokens: telemetry.totalTokens, costCents }
      });
    }
    if (costCents > costLimit) {
      return fail(['claude-code-cost-ceiling-exceeded'], 'COMPUTE_BUDGET_VIOLATION', {
        sessionId: text(final.session_id, 240) || null,
        usage: { inputTokens: telemetry.inputTokens, outputTokens: telemetry.outputTokens, totalTokens: telemetry.totalTokens, costCents }
      });
    }
    if (final.subtype !== 'success' || final.is_error === true) {
      return fail([`claude-code-${text(final.subtype, 80) || 'execution-error'}`], 'CONFIRMED_FAILURE', {
        sessionId: text(final.session_id, 240) || null,
        usage: { inputTokens: telemetry.inputTokens, outputTokens: telemetry.outputTokens, totalTokens: telemetry.totalTokens, costCents }
      });
    }

    const result = parseCanonicalFinal(final.result);
    if (!result) return fail(['claude-code-canonical-result-json-required'], 'RESULT_INVALID', { sessionId: text(final.session_id, 240) || null });
    const resultReasons = validResult(result);
    if (resultReasons.length) return fail(resultReasons, 'RESULT_INVALID', { sessionId: text(final.session_id, 240) || null });

    return {
      ok: true,
      policyVersion: CLAUDE_CODE_SANDBOX_EXECUTOR_POLICY_VERSION,
      outcome: 'COMPLETED',
      providerRequestId: text(final.session_id, 240) || null,
      providerStatus: text(final.subtype, 80) || 'success',
      model: selectedModel,
      usage: {
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        totalTokens: telemetry.totalTokens,
        costCents
      },
      observedTools: [...new Set(telemetry.observedTools)],
      sandboxIsolationEvidence: typedEvidence(isolationReceipt.evidenceRefs),
      result: {
        ...result,
        externalEffectLedger: { ...ZERO_EFFECTS }
      },
      businessEffectAuthority: 'NONE'
    };
  };
}
