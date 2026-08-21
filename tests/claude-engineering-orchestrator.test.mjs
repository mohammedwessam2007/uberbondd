import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClaudeEngineeringExecutor } from '../src/claude-engineering-orchestrator.mjs';

const BASE = 'b'.repeat(40);

function task(overrides = {}) {
  return {
    taskId: 'task_engineering_1',
    objective: 'Add one bounded local module and prove it.',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    contextRefs: ['doc:architecture'],
    evidenceRefs: ['test:origin'],
    constraints: ['preserve lite/'],
    forbiddenActions: ['deploy'],
    requiredOutputs: ['verified change set'],
    acceptanceTests: ['npm run test:syntax', 'npm run test:deterministic'],
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

async function newSandbox() {
  const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-eng-'));
  return {
    ok: true,
    sandboxRoot,
    baseRevision: 'main',
    isolationReceipt: {
      status: 'VERIFIED_ISOLATED',
      sandboxRoot,
      filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
      businessCredentialsMounted: false,
      productionNetworkReachability: false,
      networkEgressMode: 'ANTHROPIC_ONLY',
      providerCredentialScope: 'ANTHROPIC_ONLY',
      hostHomeMounted: false,
      ephemeralHome: `${sandboxRoot}-home`,
      evidenceRefs: ['test:engineering-isolation']
    }
  };
}

function verifierIsolation(sandboxRoot) {
  return {
    status: 'VERIFIED_ISOLATED',
    sandboxRoot,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    hostHomeMounted: false,
    verificationNetworkEgressMode: 'NONE',
    ephemeralHome: `${sandboxRoot}-verify-home`,
    evidenceRefs: ['test:verifier-mode']
  };
}

function providerResult(overrides = {}) {
  return {
    ok: true,
    outcome: 'COMPLETED',
    providerRequestId: 'sess_engineering_1',
    providerStatus: 'success',
    model: 'sonnet',
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, costCents: 2 },
    result: {
      outcome: 'Claude self-report is intentionally not trusted for filesystem truth.',
      changedArtifacts: ['src/claimed-but-not-authoritative.mjs'],
      testsActuallyRun: [],
      truthTable: [],
      externalEffectLedger: {
        providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
        credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
      },
      decision: 'PROCEED',
      coordination: { action: 'REVIEW_REQUIRED', objective: 'review', summary: 'claimed', evidenceRefs: [], confidence: 0.8 },
      evidenceRefs: ['test:model-self-report']
    },
    ...overrides
  };
}

function gitRunner(sandboxRoot, status, baseFiles = {}) {
  return async ({ args }) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: `${sandboxRoot}\n`, stderr: '' };
    if (args[0] === 'rev-parse' && args[1] === '--verify') return { stdout: `${BASE}\n`, stderr: '' };
    if (args[0] === 'status') return { stdout: status, stderr: '' };
    if (args[0] === 'show') {
      const spec = args[1];
      const file = spec.slice(spec.indexOf(':') + 1);
      if (!(file in baseFiles)) throw new Error(`missing base file ${file}`);
      return { stdout: baseFiles[file], stderr: '' };
    }
    throw new Error(`unexpected git call ${JSON.stringify(args)}`);
  };
}

async function buildExecutor({
  mutate = async sandboxRoot => {
    await fs.mkdir(path.join(sandboxRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(sandboxRoot, 'src/actual.mjs'), 'export const actual = true;\n');
  },
  mutateDuringVerification = null,
  status = '?? src/actual.mjs\0',
  verificationExitCode = 0,
  destroyOk = true,
  persistChangeSet = null,
  modelResult = providerResult()
} = {}) {
  let sandboxRoot;
  let destroyed = false;
  let verificationCalls = 0;
  const executor = createClaudeEngineeringExecutor({
    createSandbox: async () => {
      const created = await newSandbox();
      sandboxRoot = created.sandboxRoot;
      return created;
    },
    destroySandbox: async ({ sandbox }) => {
      if (!destroyOk) return { ok: false, reasonCodes: ['fixture-destroy-failed'] };
      await fs.rm(sandbox.sandboxRoot, { recursive: true, force: true });
      destroyed = true;
      return { ok: true, receiptRef: 'receipt:sandbox-destroyed-fixture' };
    },
    enterVerificationMode: async ({ sandbox }) => ({ ok: true, isolationReceipt: verifierIsolation(sandbox.sandboxRoot) }),
    claudeExecutorFactory: async ({ sandboxRoot: root }) => async () => {
      await mutate(root);
      return modelResult;
    },
    runGit: async input => gitRunner(sandboxRoot, status)(input),
    runVerificationCommand: async () => {
      verificationCalls += 1;
      if (typeof mutateDuringVerification === 'function') {
        await mutateDuringVerification(sandboxRoot, verificationCalls);
      }
      return {
        exitCode: verificationExitCode,
        stdout: verificationExitCode === 0 ? 'pass' : 'fail',
        stderr: verificationExitCode === 0 ? '' : 'verification failed',
        durationMs: 3
      };
    },
    persistChangeSet
  });
  return {
    executor,
    state: () => ({ sandboxRoot, destroyed, verificationCalls })
  };
}

test('full synthetic engineering roundtrip trusts Git + verifier evidence, not Claude self-report', async () => {
  const fixture = await buildExecutor();
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10, idempotencyKey: 'eng:1' });
  assert.equal(out.ok, true);
  assert.equal(out.outcome, 'COMPLETED');
  assert.deepEqual(out.usage, { inputTokens: 120, outputTokens: 80, totalTokens: 200, costCents: 2 });
  assert.deepEqual(out.result.changedArtifacts, ['src/actual.mjs']);
  assert.equal(out.result.changedArtifacts.includes('src/claimed-but-not-authoritative.mjs'), false);
  assert.equal(out.result.decision, 'PROCEED');
  assert.equal(out.result.coordination.action, 'REVIEW_REQUIRED');
  assert.equal(out.result.testsActuallyRun.length, 2);
  assert.equal(out.result.testsActuallyRun.every(item => item.status === 'PASS'), true);
  assert.equal(out.result.codeChangeSet.changes[0].content, 'export const actual = true;\n');
  assert.equal(out.result.engineeringEvidence.stateBindingStatus, 'BOUND');
  assert.equal(out.result.engineeringEvidence.postVerificationChangeSetId, out.result.engineeringEvidence.changeSetId);
  assert.equal(fixture.state().verificationCalls, 2);
  assert.equal(fixture.state().destroyed, true);
  await assert.rejects(fs.lstat(fixture.state().sandboxRoot), error => error?.code === 'ENOENT');
});

test('verification-time source mutation blocks review even when every verifier command reports PASS', async () => {
  const fixture = await buildExecutor({
    mutateDuringVerification: async (sandboxRoot, call) => {
      if (call === 1) {
        await fs.writeFile(path.join(sandboxRoot, 'src/actual.mjs'), 'export const actual = "mutated-after-capture";\n');
      }
    }
  });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.equal(out.result.testsActuallyRun.length, 2);
  assert.equal(out.result.testsActuallyRun.every(item => item.status === 'PASS'), true);
  assert.equal(out.result.decision, 'STOP');
  assert.equal(out.result.coordination.action, 'OWNER_REVIEW_REQUIRED');
  assert.equal(out.result.engineeringEvidence.stateBindingStatus, 'DRIFT_DETECTED');
  assert.notEqual(out.result.engineeringEvidence.postVerificationChangeSetId, out.result.engineeringEvidence.changeSetId);
  assert.ok(out.result.engineeringEvidence.stateBindingReasonCodes.includes('sandbox-change-set-changed-during-verification'));
  assert.match(out.result.outcome, /tested state is not the same state/i);
  assert.equal(fixture.state().destroyed, true);
});

test('verification failure routes to bounded repair and never promotes the patch', async () => {
  const fixture = await buildExecutor({ verificationExitCode: 1 });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.equal(out.result.decision, 'REPAIR');
  assert.equal(out.result.coordination.action, 'REPAIR_REQUIRED');
  assert.equal(out.result.testsActuallyRun.length, 1);
  assert.equal(out.result.testsActuallyRun[0].status, 'FAIL');
  assert.equal(out.result.engineeringEvidence.stateBindingStatus, 'BOUND');
  assert.equal(fixture.state().destroyed, true);
});

test('no actual Git changes cannot be promoted even when the model claims success', async () => {
  const fixture = await buildExecutor({ mutate: async () => {}, status: '' });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.result.changedArtifacts, []);
  assert.equal(out.result.decision, 'REPAIR');
  assert.equal(out.result.coordination.action, 'REPAIR_REQUIRED');
  assert.match(out.result.outcome, /without a material Git change/i);
});

test('sandbox teardown failure stops promotion and exposes quarantine boundary', async () => {
  const fixture = await buildExecutor({ destroyOk: false });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.equal(out.result.decision, 'STOP');
  assert.equal(out.result.coordination.action, 'OWNER_REVIEW_REQUIRED');
  assert.match(out.result.outcome, /teardown was not verified/i);
  await fs.rm(fixture.state().sandboxRoot, { recursive: true, force: true });
});

test('durable change-set artifact hook removes inline code payload and carries typed reference', async () => {
  let persisted;
  const fixture = await buildExecutor({
    persistChangeSet: async changeSet => {
      persisted = changeSet;
      return { ok: true, artifactRef: `artifact:${changeSet.changeSetId}` };
    }
  });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.ok(persisted?.changeSetId);
  assert.equal(out.result.codeChangeSet, undefined);
  assert.match(out.result.engineeringEvidence.changeSetRef, /^artifact:/);
  assert.ok(out.result.evidenceRefs.includes(out.result.engineeringEvidence.changeSetRef));
});

test('artifact persistence failure blocks review rather than losing the actual patch', async () => {
  const fixture = await buildExecutor({
    persistChangeSet: async () => ({ ok: false, reasonCodes: ['artifact-store-down'] })
  });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, true);
  assert.equal(out.result.decision, 'STOP');
  assert.equal(out.result.coordination.action, 'OWNER_REVIEW_REQUIRED');
  assert.match(out.result.outcome, /persistence failed/i);
  assert.equal(fixture.state().verificationCalls, 0);
  assert.equal(fixture.state().destroyed, true);
});

test('provider uncertainty is preserved and sandbox teardown still runs', async () => {
  const uncertain = {
    ok: false,
    outcome: 'UNCERTAIN',
    uncertain: true,
    reasonCodes: ['claude-code-process-outcome-uncertain']
  };
  const fixture = await buildExecutor({ modelResult: uncertain, mutate: async () => {}, status: '' });
  const out = await fixture.executor({ task: task(), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.uncertain, true);
  assert.equal(fixture.state().destroyed, true);
});

test('consequenceful engineering task is rejected before sandbox creation', async () => {
  let created = 0;
  const executor = createClaudeEngineeringExecutor({
    createSandbox: async () => { created += 1; return newSandbox(); },
    destroySandbox: async () => ({ ok: true, receiptRef: 'receipt:destroy' }),
    enterVerificationMode: async () => ({ ok: false }),
    claudeExecutorFactory: async () => async () => providerResult()
  });
  const out = await executor({ task: task({ consequenceClass: 'EXTERNAL_EFFECT' }), model: 'sonnet', maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('engineering-executor-local-preparation-only'));
  assert.equal(created, 0);
});
