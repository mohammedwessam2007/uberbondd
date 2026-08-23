// Section 21 asked for the missing createSandbox/destroySandbox/
// enterVerificationMode, and section 22 asked for someone to attack them.
// The important assertion in this file is the one about what the provisioner
// refuses to claim: it does the real filesystem work and then, absent an
// external attestation for the network boundary, fails closed rather than
// signing a receipt for a property it cannot check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import {
  createEphemeralGitSandbox,
  createSandboxProvisioner,
  destroyEphemeralGitSandbox,
  enterEphemeralVerificationMode,
  sandboxChildEnv,
  SANDBOX_EXTERNAL_BLOCK
} from '../src/claude-code-sandbox-provisioner.mjs';

const ATTESTATION = Object.freeze({
  status: 'VERIFIED_ISOLATED',
  productionNetworkReachability: false,
  networkEgressMode: 'ANTHROPIC_ONLY',
  providerCredentialScope: 'ANTHROPIC_ONLY',
  evidenceRefs: ['receipt:runner-network-policy']
});

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 30_000, env: { PATH: process.env.PATH || '', HOME: cwd, GIT_CONFIG_NOSYSTEM: '1' } },
      (error, stdout) => error ? reject(error) : resolve(String(stdout)));
  });
}

/** A throwaway origin repository with one commit. */
async function originRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-origin-'));
  await git(dir, ['init', '--quiet', '-b', 'main']);
  await git(dir, ['config', 'user.email', 'test@invalid']);
  await git(dir, ['config', 'user.name', 'test']);
  await fs.writeFile(path.join(dir, 'README.md'), '# origin\n');
  await fs.mkdir(path.join(dir, 'lite'), { recursive: true });
  await fs.writeFile(path.join(dir, 'lite', 'keep.txt'), 'protected\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '--quiet', '-m', 'initial']);
  return dir;
}

test('without an external attestation the provisioner fails closed and says why', async () => {
  const origin = await originRepo();
  try {
    const result = await createEphemeralGitSandbox({ repoRoot: origin });
    assert.equal(result.ok, false);
    assert.equal(result.classification, SANDBOX_EXTERNAL_BLOCK);
    assert.ok(result.reasonCodes.includes('sandbox-network-isolation-attestation-required'));
    // The unverified dimensions are absent, not defaulted to the safe value.
    assert.equal(result.isolationReceipt.productionNetworkReachability, null);
    assert.equal(result.isolationReceipt.networkEgressMode, null);
    assert.deepEqual(result.isolationReceipt.unverifiedDimensions.sort(), [
      'networkEgressMode', 'productionNetworkReachability', 'providerCredentialScope'
    ]);
    // And it did not leave a workspace lying around that somebody might use.
    assert.equal(result.filesystemIsolation, 'PROVISIONED_AND_DESTROYED');
  } finally {
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('with an attestation it provisions a real, pinned, ephemeral clone', async () => {
  const origin = await originRepo();
  let sandbox = null;
  try {
    sandbox = await createEphemeralGitSandbox({ repoRoot: origin, isolationAttestation: ATTESTATION });
    assert.equal(sandbox.ok, true);
    assert.match(sandbox.baseRevision, /^[a-f0-9]{40}$/);
    assert.equal(sandbox.isolationReceipt.status, 'VERIFIED_ISOLATED');
    assert.equal(sandbox.isolationReceipt.filesystemScope, 'EPHEMERAL_SANDBOX_ONLY');
    assert.equal(sandbox.isolationReceipt.businessCredentialsMounted, false);

    const readme = await fs.readFile(path.join(sandbox.sandboxRoot, 'README.md'), 'utf8');
    assert.match(readme, /# origin/);
    // The ephemeral home must sit outside the tree the model can edit, or the
    // executor's own isolation check rejects it.
    assert.ok(!sandbox.ephemeralHome.startsWith(`${sandbox.sandboxRoot}${path.sep}`));
  } finally {
    if (sandbox?.ok) await destroyEphemeralGitSandbox({ sandbox });
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('the sandbox git objects are a copy: corrupting them cannot reach the origin', async () => {
  const origin = await originRepo();
  let sandbox = null;
  try {
    sandbox = await createEphemeralGitSandbox({ repoRoot: origin, isolationAttestation: ATTESTATION });
    assert.equal(sandbox.ok, true);
    // Hard-linked objects would make this destroy the origin's history too.
    await fs.rm(path.join(sandbox.sandboxRoot, '.git', 'objects'), { recursive: true, force: true });
    const originLog = await git(origin, ['log', '--oneline']);
    assert.match(originLog, /initial/);
    const originReadme = await fs.readFile(path.join(origin, 'README.md'), 'utf8');
    assert.match(originReadme, /# origin/);
  } finally {
    if (sandbox?.ok) await destroyEphemeralGitSandbox({ sandbox });
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('writing inside the sandbox never reaches the origin working tree', async () => {
  const origin = await originRepo();
  let sandbox = null;
  try {
    sandbox = await createEphemeralGitSandbox({ repoRoot: origin, isolationAttestation: ATTESTATION });
    await fs.writeFile(path.join(sandbox.sandboxRoot, 'lite', 'keep.txt'), 'MUTATED\n');
    await fs.writeFile(path.join(sandbox.sandboxRoot, 'README.md'), 'MUTATED\n');
    assert.equal(await fs.readFile(path.join(origin, 'lite', 'keep.txt'), 'utf8'), 'protected\n');
    assert.equal(await fs.readFile(path.join(origin, 'README.md'), 'utf8'), '# origin\n');
  } finally {
    if (sandbox?.ok) await destroyEphemeralGitSandbox({ sandbox });
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('no credential-shaped variable survives into the child environment', () => {
  const env = sandboxChildEnv({
    PATH: '/usr/bin',
    LANG: 'en_US.UTF-8',
    ANTHROPIC_API_KEY: 'sk-should-not-survive',
    OPENAI_API_KEY: 'sk-should-not-survive',
    DATABASE_URL: 'postgres://u:p@host/db',
    GITHUB_TOKEN: 'ghp_should_not_survive',
    VERCEL_TOKEN: 'v-should-not-survive',
    AWS_SECRET_ACCESS_KEY: 'should-not-survive',
    STRIPE_SECRET_KEY: 'should-not-survive',
    UBERBOND_RELAY_TOKEN: 'should-not-survive',
    SESSION_COOKIE: 'should-not-survive'
  }, { home: '/tmp/home' });

  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.LANG, 'en_US.UTF-8');
  assert.equal(env.HOME, '/tmp/home');
  const leaked = Object.entries(env).filter(([, value]) => /should-not-survive|postgres:\/\//.test(String(value)));
  assert.deepEqual(leaked, []);
  // Allowlisted, so unknown future variables are excluded by default rather
  // than needing a new pattern each time somebody invents one.
  assert.ok(!('ANTHROPIC_API_KEY' in env));
  assert.ok(!('AWS_SECRET_ACCESS_KEY' in env));
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
});

test('destroy refuses a path this provisioner did not create', async () => {
  const outsider = await fs.mkdtemp(path.join(os.tmpdir(), 'not-a-sandbox-'));
  try {
    const result = await destroyEphemeralGitSandbox({ sandbox: { workspace: outsider } });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('refusing-to-remove-a-path-this-provisioner-did-not-create'));
    await fs.stat(outsider); // still there
  } finally {
    await fs.rm(outsider, { recursive: true, force: true });
  }
});

test('destroy refuses a relative path and the filesystem root', async () => {
  for (const workspace of ['/', '.', 'uberbond-sandbox-relative', '../uberbond-sandbox-x', '']) {
    const result = await destroyEphemeralGitSandbox({ sandbox: { workspace } });
    assert.equal(result.ok, false, `destroy accepted ${JSON.stringify(workspace)}`);
  }
});

test('destroy actually removes the workspace', async () => {
  const origin = await originRepo();
  try {
    const sandbox = await createEphemeralGitSandbox({ repoRoot: origin, isolationAttestation: ATTESTATION });
    const workspace = sandbox.workspace;
    const destroyed = await destroyEphemeralGitSandbox({ sandbox });
    assert.equal(destroyed.ok, true);
    assert.match(destroyed.receiptRef, /^receipt:sandbox-destroy:/);
    await assert.rejects(() => fs.stat(workspace));
  } finally {
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('a traversing or absolute base revision is refused before anything is created', async () => {
  const origin = await originRepo();
  try {
    for (const revision of ['../../etc/passwd', '/etc/passwd', 'HEAD; rm -rf /', 'HEAD$(whoami)', '--upload-pack=evil']) {
      const result = await createEphemeralGitSandbox({ repoRoot: origin, baseRevision: revision, isolationAttestation: ATTESTATION });
      assert.equal(result.ok, false, `accepted revision ${revision}`);
      assert.ok(result.reasonCodes.includes('safe-base-revision-required'));
    }
  } finally {
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('a relative or non-repository root is refused', async () => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-empty-'));
  try {
    const relative = await createEphemeralGitSandbox({ repoRoot: 'relative/path', isolationAttestation: ATTESTATION });
    assert.equal(relative.ok, false);
    assert.ok(relative.reasonCodes.includes('absolute-repository-root-required'));

    const notARepo = await createEphemeralGitSandbox({ repoRoot: empty, isolationAttestation: ATTESTATION });
    assert.equal(notARepo.ok, false);
    assert.ok(notARepo.reasonCodes.includes('repository-root-must-be-a-git-repository'));
  } finally {
    await fs.rm(empty, { recursive: true, force: true });
  }
});

test('verification mode refuses an unattested sandbox', async () => {
  const result = await enterEphemeralVerificationMode({
    sandbox: {
      sandboxRoot: '/tmp/whatever',
      isolationReceipt: { classification: SANDBOX_EXTERNAL_BLOCK }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.classification, SANDBOX_EXTERNAL_BLOCK);
  assert.ok(result.reasonCodes.includes('verification-mode-requires-an-attested-sandbox'));

  const noReceipt = await enterEphemeralVerificationMode({ sandbox: { sandboxRoot: '/tmp/whatever' } });
  assert.equal(noReceipt.ok, false);
});

test('verification mode records that the model executor is detached', async () => {
  const origin = await originRepo();
  let sandbox = null;
  try {
    sandbox = await createEphemeralGitSandbox({ repoRoot: origin, isolationAttestation: ATTESTATION });
    const mode = await enterEphemeralVerificationMode({ sandbox });
    assert.equal(mode.ok, true);
    assert.equal(mode.isolationReceipt.modelExecutorAttached, false);
    assert.equal(mode.isolationReceipt.phase, 'VERIFICATION');
  } finally {
    if (sandbox?.ok) await destroyEphemeralGitSandbox({ sandbox });
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('the provisioner factory hands the executor exactly the three hooks it asks for', () => {
  const provisioner = createSandboxProvisioner({ repoRoot: '/tmp/repo' });
  assert.equal(typeof provisioner.createSandbox, 'function');
  assert.equal(typeof provisioner.destroySandbox, 'function');
  assert.equal(typeof provisioner.enterVerificationMode, 'function');
});

test('the executor rejects an unattested sandbox packet outright', async () => {
  const { createClaudeEngineeringExecutor } = await import('../src/claude-engineering-orchestrator.mjs');
  const origin = await originRepo();
  try {
    const provisioner = createSandboxProvisioner({ repoRoot: origin });
    const executor = createClaudeEngineeringExecutor({
      ...provisioner,
      claudeExecutorFactory: async () => async () => ({ ok: true })
    });
    const result = await executor({
      task: { taskId: 'mesh_task_x', objective: 'do a thing', consequenceClass: 'LOCAL_PREPARATION' },
      idempotencyKey: 'idem-1'
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('verified-sandbox-packet-required'));
  } finally {
    await fs.rm(origin, { recursive: true, force: true });
  }
});
