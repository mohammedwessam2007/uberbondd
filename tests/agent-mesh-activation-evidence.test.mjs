import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateAgentMeshActivation } from '../src/agent-mesh-activation-gate.mjs';
import {
  loadActivationEvidenceFile,
  composeActivationInput,
  permittedWorkers
} from '../src/agent-mesh-activation-evidence.mjs';

// The activation gate decides whether the mesh may call a model provider.
// Nothing ever built its input, so it had no callers and the mesh had no gate.
// These cover the composer that feeds it and the worker filter that enforces
// the verdict.

const CONFIGURED_PROVIDER_ENV = {
  ANTHROPIC_API_KEY: 'placeholder-anthropic-key-value',
  ANTHROPIC_INPUT_USD_PER_MILLION: '3',
  ANTHROPIC_OUTPUT_USD_PER_MILLION: '15',
  ANTHROPIC_PRICING_SOURCE: 'https://anthropic.com/pricing',
  ANTHROPIC_PRICING_VERIFIED_AT: '2026-08-22'
};

async function evidenceFile(contents) {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-evidence-'));
  const path = join(dir, 'evidence.json');
  await writeFile(path, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf8');
  return path;
}

test('no evidence file is the resting state, not an error', async () => {
  const loaded = await loadActivationEvidenceFile('');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.present, false);
  assert.deepEqual(loaded.evidence, {});

  const activation = evaluateAgentMeshActivation(composeActivationInput({ attested: loaded.evidence, env: {} }));
  assert.equal(activation.status, 'ARCHITECTURE_ONLY');
  assert.equal(activation.permittedMode, 'NO_PROVIDER_CALLS');
});

test('a named-but-missing evidence file is refused rather than treated as absent', async () => {
  const loaded = await loadActivationEvidenceFile(join(tmpdir(), 'definitely-not-here-8f2a.json'));
  assert.equal(loaded.ok, false);
  assert.deepEqual(loaded.reasonCodes, ['evidence-file-not-found']);
});

test('a malformed evidence file is refused, never silently downgraded', async () => {
  assert.equal((await loadActivationEvidenceFile(await evidenceFile('not json'))).reasonCodes[0], 'evidence-file-json-required');
  assert.equal((await loadActivationEvidenceFile(await evidenceFile('[1,2,3]'))).reasonCodes[0], 'evidence-file-object-required');
});

test('an evidence file cannot claim a credential the process cannot see', async () => {
  const path = await evidenceFile({
    providers: {
      anthropic: { status: 'VERIFIED_LIVE', credentialPresent: true, pricingEvidencePresent: true, computeBudgetAuthorized: true }
    },
    ownerComputeAuthorization: true
  });
  const loaded = await loadActivationEvidenceFile(path);
  assert.equal(loaded.ok, true);

  // Empty env: no credential, no pricing. The file says otherwise.
  const composed = composeActivationInput({ attested: loaded.evidence, env: {} });
  assert.equal(composed.providers.anthropic.credentialPresent, false);
  assert.equal(composed.providers.anthropic.pricingEvidencePresent, false);
  // The attested fields it could not check are preserved.
  assert.equal(composed.providers.anthropic.computeBudgetAuthorized, true);
});

test('first-hand facts are reported truthfully when they are true', () => {
  const composed = composeActivationInput({ attested: {}, env: CONFIGURED_PROVIDER_ENV });
  assert.equal(composed.providers.anthropic.credentialPresent, true);
  assert.equal(composed.providers.anthropic.pricingEvidencePresent, true);
  assert.equal(composed.providers.openai.credentialPresent, false);
});

test('ownerComputeAuthorization and cloudCycleEnabled require an exact true', async () => {
  const path = await evidenceFile({ ownerComputeAuthorization: 'yes', cloudCycleEnabled: 1 });
  const loaded = await loadActivationEvidenceFile(path);
  assert.equal(loaded.evidence.ownerComputeAuthorization, false);
  assert.equal(loaded.evidence.cloudCycleEnabled, false);
});

test('NO_PROVIDER_CALLS withholds every worker and says why', () => {
  const workers = [{ workerId: 'w1', provider: 'anthropic' }, { workerId: 'w2', provider: 'openai' }];
  const gated = permittedWorkers(workers, { permittedMode: 'NO_PROVIDER_CALLS' });
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.withheld.length, 2);
  assert.match(gated.reason, /forbids-provider-calls/);
});

test('SYNTHETIC_ONLY withholds every worker too', () => {
  const gated = permittedWorkers([{ workerId: 'w1', provider: 'anthropic' }], { permittedMode: 'SYNTHETIC_ONLY' });
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.withheld.length, 1);
});

test('ONE_PROVIDER_CANARY permits exactly one worker on a canary-ready provider', () => {
  const workers = [
    { workerId: 'w1', provider: 'openai' },
    { workerId: 'w2', provider: 'anthropic' },
    { workerId: 'w3', provider: 'anthropic' }
  ];
  const gated = permittedWorkers(workers, {
    permittedMode: 'ONE_PROVIDER_CANARY',
    providerReadyForCanary: { openai: false, anthropic: true }
  });
  assert.equal(gated.allowed.length, 1);
  assert.equal(gated.allowed[0].workerId, 'w2');
  assert.equal(gated.withheld.length, 2);
});

test('a canary with no ready provider permits nothing', () => {
  const gated = permittedWorkers([{ workerId: 'w1', provider: 'openai' }], {
    permittedMode: 'ONE_PROVIDER_CANARY',
    providerReadyForCanary: { openai: false, anthropic: false }
  });
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.withheld.length, 1);
});

test('BOUNDED_CLOUD_REHEARSAL permits every configured worker', () => {
  const workers = [{ workerId: 'w1', provider: 'openai' }, { workerId: 'w2', provider: 'anthropic' }];
  const gated = permittedWorkers(workers, { permittedMode: 'BOUNDED_CLOUD_REHEARSAL' });
  assert.equal(gated.allowed.length, 2);
  assert.deepEqual(gated.withheld, []);
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
  const [, , , sandbox] = describeProviderReadiness({ env: {} });
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

test('a sandbox worker is never eligible under a one-provider canary', () => {
  // The activation gate scores only the two API providers, so the sandbox has
  // no canary readiness to look up. Undefined must read as "not eligible",
  // which confines the sandbox to a full bounded rehearsal.
  const gated = permittedWorkers([{ workerId: 'w1', provider: 'claude-code-sandbox' }], {
    permittedMode: 'ONE_PROVIDER_CANARY',
    providerReadyForCanary: { openai: true, anthropic: true }
  });
  assert.deepEqual(gated.allowed, []);
  assert.equal(gated.withheld.length, 1);
});

test('a valid isolation receipt reaches the sandbox executor intact', async () => {
  const { createModelExecutorFactory } = await import('../src/agent-model-executor-factory.mjs');
  const sandboxRoot = await mkdtemp(join(tmpdir(), 'mesh-sandbox-'));
  const ephemeralHome = await mkdtemp(join(tmpdir(), 'mesh-home-'));
  const receipt = {
    status: 'VERIFIED_ISOLATED',
    sandboxRoot,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    productionNetworkReachability: false,
    networkEgressMode: 'ANTHROPIC_ONLY',
    providerCredentialScope: 'ANTHROPIC_ONLY',
    hostHomeMounted: false,
    ephemeralHome,
    evidenceRefs: ['audit:sandbox-isolation-check']
  };

  const executor = createModelExecutorFactory({
    env: { CLAUDE_CODE_SANDBOX_ROOT: sandboxRoot, CLAUDE_CODE_SANDBOX_ENABLED: 'true' },
    sandboxIsolationReceipt: receipt
  })({ workerId: 'w1', provider: 'claude-code-sandbox', model: 'sonnet' });

  // The executor checks enabled, then isolation, then the task. Passing a bad
  // task and getting the task complaint back proves isolation validated --
  // without shelling out to a real CLI.
  const out = await executor({ task: {}, maxTokens: 1000, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.deepEqual(out.reasonCodes, ['valid-agent-task-required']);
});

test('the sandbox executor stays disabled unless enabled is exactly true', async () => {
  const { createModelExecutorFactory } = await import('../src/agent-model-executor-factory.mjs');
  const sandboxRoot = await mkdtemp(join(tmpdir(), 'mesh-sandbox-'));
  const executor = createModelExecutorFactory({
    env: { CLAUDE_CODE_SANDBOX_ROOT: sandboxRoot, CLAUDE_CODE_SANDBOX_ENABLED: 'TRUE' },
    sandboxIsolationReceipt: { status: 'VERIFIED_ISOLATED', sandboxRoot }
  })({ workerId: 'w1', provider: 'claude-code-sandbox' });
  const out = await executor({ task: { taskId: 't', objective: 'o' } });
  assert.equal(out.ok, false);
  assert.deepEqual(out.reasonCodes, ['claude-code-sandbox-executor-disabled']);
});
