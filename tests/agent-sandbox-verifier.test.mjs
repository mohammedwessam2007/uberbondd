import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileSandboxVerificationPlan,
  runSandboxVerification
} from '../src/agent-sandbox-verifier.mjs';

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-verifier-'));
}

function isolation(sandboxRoot, overrides = {}) {
  return {
    status: 'VERIFIED_ISOLATED',
    sandboxRoot,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    hostHomeMounted: false,
    verificationNetworkEgressMode: 'NONE',
    ephemeralHome: '/tmp/uberbond-verifier-home',
    evidenceRefs: ['test:verifier-isolation'],
    ...overrides
  };
}

test('entire command plan preflights before the first command can run', async () => {
  const root = await tempRoot();
  try {
    let calls = 0;
    const out = await runSandboxVerification({
      sandboxRoot: root,
      isolationReceipt: isolation(root),
      commands: ['npm run test:syntax', 'curl https://example.invalid'],
      runCommand: async () => { calls += 1; return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 }; }
    });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.some(code => code.startsWith('verification-command-not-allowlisted')));
    assert.equal(calls, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('allowlisted npm checks execute with no provider or business credentials in env', async () => {
  const root = await tempRoot();
  try {
    const calls = [];
    const out = await runSandboxVerification({
      sandboxRoot: root,
      isolationReceipt: isolation(root),
      commands: ['npm run test:syntax', 'npm run test:deterministic'],
      env: {
        PATH: '/usr/bin', LANG: 'C.UTF-8',
        ANTHROPIC_API_KEY: 'must-not-leak', OPENAI_API_KEY: 'must-not-leak',
        DATABASE_URL: 'must-not-leak', VERCEL_TOKEN: 'must-not-leak'
      },
      runCommand: async input => {
        calls.push(input);
        return { exitCode: 0, stdout: 'pass', stderr: '', durationMs: 4 };
      }
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'PASS');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.cwd, root);
      assert.equal(call.env.ANTHROPIC_API_KEY, undefined);
      assert.equal(call.env.OPENAI_API_KEY, undefined);
      assert.equal(call.env.DATABASE_URL, undefined);
      assert.equal(call.env.VERCEL_TOKEN, undefined);
      assert.equal(call.env.HOME, '/tmp/uberbond-verifier-home');
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('node --check and node --test accept only bounded relative code/test paths', async () => {
  const root = await tempRoot();
  try {
    const good = await compileSandboxVerificationPlan({
      sandboxRoot: root,
      isolationReceipt: isolation(root),
      commands: ['node --check src/example.mjs', 'node --test tests/example.test.mjs']
    });
    assert.equal(good.ok, true);
    const bad = await compileSandboxVerificationPlan({
      sandboxRoot: root,
      isolationReceipt: isolation(root),
      commands: ['node --check ../escape.mjs', 'node --test src/not-a-test.mjs']
    });
    assert.equal(bad.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('failure stops the verification sequence and records actual evidence', async () => {
  const root = await tempRoot();
  try {
    let calls = 0;
    const out = await runSandboxVerification({
      sandboxRoot: root,
      isolationReceipt: isolation(root),
      commands: ['npm run test:syntax', 'npm run test:deterministic', 'npm run check'],
      runCommand: async () => {
        calls += 1;
        if (calls === 2) return { exitCode: 1, stdout: 'failure', stderr: 'assertion failed', durationMs: 9 };
        return { exitCode: 0, stdout: 'pass', stderr: '', durationMs: 4 };
      }
    });
    assert.equal(out.ok, false);
    assert.equal(out.status, 'FAIL');
    assert.equal(calls, 2);
    assert.equal(out.executed[0].status, 'PASS');
    assert.equal(out.executed[1].status, 'FAIL');
    assert.equal(out.executed[1].stderrExcerpt, 'assertion failed');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('receipt excerpts redact credential-shaped output while digests preserve evidence identity', async () => {
  const root = await tempRoot();
  try {
    const out = await runSandboxVerification({
      sandboxRoot: root,
      isolationReceipt: isolation(root),
      commands: ['npm run test:syntax'],
      runCommand: async () => ({
        exitCode: 0,
        stdout: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz secret should vanish',
        stderr: 'Bearer abcdefghijklmnopqrstuvwxyz',
        durationMs: 1
      })
    });
    assert.equal(out.ok, true);
    assert.equal(out.executed[0].stdoutExcerpt.includes('sk-abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(out.executed[0].stderrExcerpt.includes('abcdefghijklmnopqrstuvwxyz'), false);
    assert.match(out.executed[0].stdoutSha256, /^[a-f0-9]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('network egress or mounted credentials block verification before process execution', async () => {
  const root = await tempRoot();
  try {
    for (const receipt of [
      isolation(root, { verificationNetworkEgressMode: 'GENERAL' }),
      isolation(root, { businessCredentialsMounted: true }),
      isolation(root, { hostHomeMounted: true })
    ]) {
      let calls = 0;
      const out = await runSandboxVerification({
        sandboxRoot: root,
        isolationReceipt: receipt,
        commands: ['npm run test:syntax'],
        runCommand: async () => { calls += 1; return { exitCode: 0 }; }
      });
      assert.equal(out.ok, false);
      assert.equal(calls, 0);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
