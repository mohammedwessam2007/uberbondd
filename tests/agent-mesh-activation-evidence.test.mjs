import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { permittedWorkers } from '../src/agent-mesh-activation-evidence.mjs';

async function evidenceFile(content) {
  const dir = await mkdtemp(join(tmpdir(), 'uberbond-agent-evidence-'));
  const path = join(dir, 'receipt.json');
  await writeFile(path, content);
  return path;
}

// Provider activation is an authority/evidence gate, not a naming convention.
test('workers are withheld when provider calls are not permitted', () => {
  const gated = permittedWorkers([
    { workerId: 'w1', provider: 'openai' },
    { workerId: 'w2', provider: 'anthropic' }
  ], { permittedMode: 'NO_PROVIDER_CALLS' });
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.withheld.length, 2);
});

test('only permitted providers are allowed through a provider-limited activation', () => {
  const gated = permittedWorkers([
    { workerId: 'w1', provider: 'openai' },
    { workerId: 'w2', provider: 'anthropic' }
  ], { permittedMode: 'PROVIDER_ALLOWLIST', providers: ['anthropic'] });
  assert.deepEqual(gated.allowed.map(item => item.workerId), ['w2']);
  assert.deepEqual(gated.withheld.map(item => item.workerId), ['w1']);
});

test('an unrecognised permitted mode fails closed', () => {
  const gated = permittedWorkers([{ workerId: 'w1', provider: 'anthropic' }], { permittedMode: 'ANYTHING_GOES' });
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.withheld.length, 1);
});

test('a missing activation object fails closed', () => {
  const gated = permittedWorkers([{ workerId: 'w1', provider: 'anthropic' }], undefined);
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.mode, 'NO_PROVIDER_CALLS');
});

test('an absent isolation receipt is fine; a named-but-broken one is refused', async () => {
  const { loadSandboxIsolationReceipt } = await import('../src/agent-mesh-activation-evidence.mjs');
  const absent = await loadSandboxIsolationReceipt('');
  assert.equal(absent.ok, true);
  assert.equal(absent.receipt, null);

  const missing = await loadSandboxIsolationReceipt(join(tmpdir(), 'no-such-isolation-4c1f.json'));
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.reasonCodes, ['isolation-receipt-not-found']);

  const malformed = await loadSandboxIsolationReceipt(await evidenceFile('{'));
  assert.equal(malformed.ok, false);
  assert.deepEqual(malformed.reasonCodes, ['isolation-receipt-json-required']);
});

test('the sandbox provider reports its own blockers and is never ready by default', async () => {
  const { describeProviderReadiness } = await import('../src/agent-model-executor-factory.mjs');
  const sandbox = describeProviderReadiness({ env: {} }).find(item => item.provider === 'claude-code-sandbox');
  assert.ok(sandbox, 'claude-code-sandbox readiness row must exist');
  assert.equal(sandbox.provider, 'claude-code-sandbox');
  assert.equal(sandbox.ready, false);
  assert.deepEqual(sandbox.blockers, ['sandbox-root-absent', 'isolation-receipt-absent', 'explicitly-disabled']);
});

test('the sandbox provider refuses without a root or an isolation receipt', async () => {
  const { createModelExecutorFactory } = await import('../src/agent-model-executor-factory.mjs');
  const worker = { workerId: 'w1', provider: 'claude-code-sandbox' };

  assert.throws(
    () => createModelExecutorFactory({ env: {} })(worker),
    /CLAUDE_CODE_SANDBOX_ROOT is absent/
  );
  assert.throws(
    () => createModelExecutorFactory({ env: { CLAUDE_CODE_SANDBOX_ROOT: '/tmp/sandbox' } })(worker),
    /no OS isolation receipt was supplied/
  );
});
