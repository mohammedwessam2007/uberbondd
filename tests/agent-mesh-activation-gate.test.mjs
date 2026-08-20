import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentMeshActivation } from '../src/agent-mesh-activation-gate.mjs';

function evidence(status = 'TEST_VERIFIED', overrides = {}) {
  return {
    status,
    evidenceRefs: ['test:fixture'],
    externallyVerified: status === 'VERIFIED_LIVE',
    enabled: true,
    ...overrides
  };
}

function coreCapabilities(overrides = {}) {
  return {
    repositoryVerification: evidence(),
    durableState: evidence(),
    agentRelay: evidence(),
    boundedBudgets: evidence(),
    truthReceipts: evidence(),
    killSwitch: evidence('TEST_VERIFIED', { enabled: true }),
    ownerEscalationQueue: evidence(),
    scheduler: evidence(),
    agentWorkers: evidence(),
    staleRecovery: evidence(),
    paymentObservation: evidence(),
    deliveryObservation: evidence(),
    ...overrides
  };
}

function provider(overrides = {}) {
  return {
    status: 'TEST_VERIFIED',
    evidenceRefs: ['test:provider-fixture'],
    credentialPresent: true,
    pricingEvidencePresent: true,
    computeBudgetAuthorized: true,
    canaryReceiptPresent: false,
    ...overrides
  };
}

test('missing evidence keeps the mesh architecture-only', () => {
  const out = evaluateAgentMeshActivation();
  assert.equal(out.ok, true);
  assert.equal(out.status, 'ARCHITECTURE_ONLY');
  assert.equal(out.permittedMode, 'NO_PROVIDER_CALLS');
  assert.ok(out.architectureMissing.includes('repositoryVerification'));
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('verified local architecture permits synthetic rehearsal but not provider calls', () => {
  const out = evaluateAgentMeshActivation({ capabilities: coreCapabilities() });
  assert.equal(out.status, 'OFFLINE_REHEARSAL_READY');
  assert.equal(out.permittedMode, 'SYNTHETIC_ONLY');
  assert.ok(out.nextGates.includes('AUTHORIZE_ONE_BOUNDED_PROVIDER_CANARY'));
});

test('provider credentials alone never authorize paid compute', () => {
  const out = evaluateAgentMeshActivation({
    capabilities: coreCapabilities(),
    providers: { openai: provider() },
    ownerComputeAuthorization: false
  });
  assert.equal(out.status, 'OFFLINE_REHEARSAL_READY');
  assert.equal(out.providerReadyForCanary.openai, false);
});

test('explicit compute authorization plus bounded evidence permits one provider canary', () => {
  const out = evaluateAgentMeshActivation({
    capabilities: coreCapabilities(),
    providers: { openai: provider() },
    ownerComputeAuthorization: true
  });
  assert.equal(out.status, 'BOUNDED_COMPUTE_CANARY_READY');
  assert.equal(out.permittedMode, 'ONE_PROVIDER_CANARY');
  assert.equal(out.providerReadyForCanary.openai, true);
  assert.equal(out.providerReadyForCanary.anthropic, false);
});

test('kill switch must be enabled even when its architecture is test verified', () => {
  const out = evaluateAgentMeshActivation({
    capabilities: coreCapabilities({ killSwitch: evidence('TEST_VERIFIED', { enabled: false }) })
  });
  assert.equal(out.status, 'ARCHITECTURE_ONLY');
  assert.ok(out.blockers.includes('kill-switch-not-enabled'));
});

test('untyped evidence does not satisfy architecture gates', () => {
  const out = evaluateAgentMeshActivation({
    capabilities: coreCapabilities({
      durableState: evidence('TEST_VERIFIED', { evidenceRefs: ['https://example.invalid/proof'] })
    })
  });
  assert.equal(out.status, 'ARCHITECTURE_ONLY');
  assert.ok(out.architectureMissing.includes('durableState'));
});

test('device-off rehearsal requires both providers live, scheduler/workers externally verified, and cloud cycle explicitly enabled', () => {
  const capabilities = coreCapabilities({
    scheduler: evidence('VERIFIED_LIVE'),
    agentWorkers: evidence('VERIFIED_LIVE')
  });
  const providers = {
    openai: provider({ status: 'VERIFIED_LIVE', externallyVerified: true, canaryReceiptPresent: true }),
    anthropic: provider({ status: 'VERIFIED_LIVE', externallyVerified: true, canaryReceiptPresent: true })
  };

  const disabled = evaluateAgentMeshActivation({
    capabilities,
    providers,
    ownerComputeAuthorization: true,
    cloudCycleEnabled: false
  });
  assert.equal(disabled.status, 'BOUNDED_COMPUTE_CANARY_READY');
  assert.ok(disabled.nextGates.includes('ENABLE_BOUNDED_CLOUD_CYCLE_AFTER_LIVE_PROOF'));

  const enabled = evaluateAgentMeshActivation({
    capabilities,
    providers,
    ownerComputeAuthorization: true,
    cloudCycleEnabled: true
  });
  assert.equal(enabled.status, 'DEVICE_OFF_MESH_REHEARSAL_READY');
  assert.equal(enabled.permittedMode, 'BOUNDED_CLOUD_REHEARSAL');
});

test('a provider cannot become live from canary receipt alone', () => {
  const out = evaluateAgentMeshActivation({
    capabilities: coreCapabilities({ scheduler: evidence('VERIFIED_LIVE'), agentWorkers: evidence('VERIFIED_LIVE') }),
    providers: {
      openai: provider({ canaryReceiptPresent: true }),
      anthropic: provider({ canaryReceiptPresent: true })
    },
    ownerComputeAuthorization: true,
    cloudCycleEnabled: true
  });
  assert.equal(out.status, 'BOUNDED_COMPUTE_CANARY_READY');
  assert.equal(out.providerLive.openai, false);
  assert.equal(out.providerLive.anthropic, false);
});
