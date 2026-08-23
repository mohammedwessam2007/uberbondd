// The sandbox destroyer was a delete primitive wearing a cleanup label.
//
// It required the target's basename to start with `uberbond-sandbox-` and
// checked nothing else, so any directory anywhere with that name was
// destroyable -- including one sitting inside a working tree. A recursive
// delete guarded by a string prefix is not a cleanup routine.
//
// Membership in the set of workspaces this process actually created is the
// authority to delete now. That set is in-process and lost on restart, which
// is deliberate: a leaked temp directory is a far smaller problem than a
// recursive delete pointed at the wrong path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import {
  createEphemeralGitSandbox,
  destroyEphemeralGitSandbox
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

async function originRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-origin-'));
  await git(dir, ['init', '--quiet', '-b', 'main']);
  await git(dir, ['config', 'user.email', 'test@invalid']);
  await git(dir, ['config', 'user.name', 'test']);
  await fs.writeFile(path.join(dir, 'README.md'), '# origin\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '--quiet', '-m', 'initial']);
  return dir;
}

test('a directory merely named like a sandbox is not destroyable', async () => {
  const area = await fs.mkdtemp(path.join(os.tmpdir(), 'victim-area-'));
  const impostor = path.join(area, 'uberbond-sandbox-not-mine');
  await fs.mkdir(impostor, { recursive: true });
  await fs.writeFile(path.join(impostor, 'important.txt'), 'user data');

  try {
    const result = await destroyEphemeralGitSandbox({ sandbox: { workspace: impostor } });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('refusing-to-remove-a-workspace-this-process-did-not-provision'));
    // The file is the assertion that matters.
    assert.equal(await fs.readFile(path.join(impostor, 'important.txt'), 'utf8'), 'user data');
  } finally {
    await fs.rm(area, { recursive: true, force: true });
  }
});

test('a workspace this process created is destroyable exactly once', async () => {
  const origin = await originRepo();
  try {
    const sandbox = await createEphemeralGitSandbox({ repoRoot: origin, isolationAttestation: ATTESTATION });
    assert.equal(sandbox.ok, true);

    const first = await destroyEphemeralGitSandbox({ sandbox });
    assert.equal(first.ok, true);
    await assert.rejects(() => fs.stat(sandbox.workspace));

    // Ownership is released with the directory, so a repeated teardown is a
    // refusal rather than a second recursive delete against a reused path.
    const second = await destroyEphemeralGitSandbox({ sandbox });
    assert.equal(second.ok, false);
  } finally {
    await fs.rm(origin, { recursive: true, force: true });
  }
});

test('the name check still runs first, so obviously wrong paths are refused early', async () => {
  for (const workspace of ['/', '.', '../uberbond-sandbox-x', '', '/tmp/not-a-sandbox-name']) {
    const result = await destroyEphemeralGitSandbox({ sandbox: { workspace } });
    assert.equal(result.ok, false, `destroy accepted ${JSON.stringify(workspace)}`);
    assert.ok(result.reasonCodes.includes('refusing-to-remove-a-path-this-provisioner-did-not-create'));
  }
});

test('a sandbox that failed to provision still cleans up after itself', async () => {
  // The unattested path builds a real workspace and tears it down. That
  // teardown has to be allowed, or a refusal to attest would leak a directory
  // on every attempt.
  const origin = await originRepo();
  try {
    const result = await createEphemeralGitSandbox({ repoRoot: origin });
    assert.equal(result.ok, false);
    assert.equal(result.filesystemIsolation, 'PROVISIONED_AND_DESTROYED');
  } finally {
    await fs.rm(origin, { recursive: true, force: true });
  }
});
