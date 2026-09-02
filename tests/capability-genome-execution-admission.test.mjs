import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guardedCapabilityExecutionReceipt,
  validateCapabilityExecutionState
} from '../src/capability-genome-execution-admission.mjs';

const NOW = new Date('2026-09-02T07:30:00.000Z');
const REVISION = '0123456789abcdef0123456789abcdef01234567';

function capability(id, overrides = {}) {
  return {
    id,
    canonicalIdentity: `cap:skill:${id.replaceAll('.', '-')}`,
    aliases: [],
    source: { url: `https://example.test/${id}` },
    sourceType: 'SKILL',
    sourceRevision: overrides.sourceRevision || REVISION,
    sourceHash: 'a'.repeat(64),
    maintainer: { name: 'Example Maintainer' },
    license: 'MIT',
    licenseConfidence: 1,
    capabilityAtoms: [{
      id: overrides.atom || `${id}.atom`,
      verb: 'inspect',
      noun: 'evidence',
      description: 'Inspect bounded evidence.',
      inputs: ['query'],
      outputs: ['evidence'],
      sideEffectClass: 'NONE'
    }],
    taskClasses: ['source-research'],
    inputs: ['query'],
    outputs: ['evidence'],
    sideEffects: ['NONE'],
    dataClasses: ['SOURCE_CODE'],
    permissions: [],
    credentialRequirements: [],
    networkRequirements: [],
    dependencies: overrides.dependencies || [],
    executionEnvironment: { runtime: 'node' },
    supportedAgents: ['sol'],
    supportedModels: ['model-a'],
    supportedProviders: ['provider-a'],
    contextCost: { tokens: 100 },
    monetaryCost: { cents: 0 },
    reliability: { observedRate: 0.9 },
    economicPrior: { confidence: 0.5 },
    securityEvidence: [],
    knownVulnerabilities: [],
    knownConflicts: [],
    compatibilityEdges: [],
    substitutes: [],
    benchmarks: [],
    realUsageEvidence: [],
    founderMinutesSaved: { status: 'UNKNOWN' },
    observedOutcomes: [],
    versionHistory: [],
    promotionState: overrides.promotionState || 'ACTIVE',
    revocationState: overrides.revocationState || { revoked: false, reasonCodes: [] },
    lastEvaluatedAt: overrides.lastEvaluatedAt || '2026-09-02T07:25:00.000Z',
    evidencePointers: [{
      type: 'SOURCE',
      ref: `https://example.test/${id}/tree/${REVISION}`,
      observedAt: '2026-09-02T07:25:00.000Z',
      claimClass: 'SOURCE_CODE_EVIDENCE'
    }]
  };
}

function route(capabilityId = 'supplier.alpha') {
  return {
    selected: {
      capabilityId,
      modelId: 'model-a',
      providerId: 'provider-a',
      configured: true,
      revoked: false,
      available: true,
      securityPassed: true,
      providerIdentityObservable: true
    }
  };
}

const receiptInput = {
  missionId: 'mission-1',
  capabilityId: 'supplier.alpha',
  capabilityRevision: REVISION,
  modelId: 'model-a',
  providerId: 'provider-a',
  permissionDecisionRef: 'policy://allow/1',
  inputClass: 'PUBLIC',
  resultRef: 'evidence://result/1'
};

test('fresh active bundle passes execution-state admission and produces guarded receipt', () => {
  const capabilities = [capability('supplier.alpha', { dependencies: ['supplier.beta'] }), capability('supplier.beta')];
  const admission = validateCapabilityExecutionState({
    capabilityId: 'supplier.alpha',
    capabilityRevision: REVISION,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha', 'supplier.beta'],
    route: route(),
    now: NOW
  });
  assert.equal(admission.ok, true);
  assert.equal(admission.status, 'CAPABILITY_EXECUTION_STATE_ELIGIBLE');

  const receipt = guardedCapabilityExecutionReceipt({
    ...receiptInput,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha', 'supplier.beta'],
    route: route(),
    now: NOW
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, 'GUARDED_CAPABILITY_EXECUTION_RECORDED');
  assert.match(receipt.executionAdmissionDigest, /^[a-f0-9]{64}$/);
  assert.ok(receipt.receipt.evidenceRefs.includes(`capability-state://${receipt.executionAdmissionDigest}`));
});

test('revoking selected capability invalidates a previously valid route at execution time', () => {
  const capabilities = [capability('supplier.alpha', {
    promotionState: 'REVOKED',
    revocationState: { revoked: true, reasonCodes: ['security-regression'] }
  })];
  const admission = validateCapabilityExecutionState({
    capabilityId: 'supplier.alpha',
    capabilityRevision: REVISION,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha'],
    route: route(),
    now: NOW
  });
  assert.equal(admission.ok, false);
  assert.ok(admission.reasonCodes.includes('bundle-capability-revoked:supplier.alpha'));
});

test('revoking a dependency invalidates the parent capability execution bundle', () => {
  const capabilities = [
    capability('supplier.alpha', { dependencies: ['supplier.beta'] }),
    capability('supplier.beta', {
      promotionState: 'REVOKED',
      revocationState: { revoked: true, reasonCodes: ['license-withdrawn'] }
    })
  ];
  const admission = validateCapabilityExecutionState({
    capabilityId: 'supplier.alpha',
    capabilityRevision: REVISION,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha', 'supplier.beta'],
    route: route(),
    now: NOW
  });
  assert.equal(admission.ok, false);
  assert.ok(admission.reasonCodes.includes('dependency-revoked:supplier.alpha->supplier.beta'));
});

test('revision drift rejects stale selected route even when capability remains active', () => {
  const capabilities = [capability('supplier.alpha', { sourceRevision: 'fedcba9876543210fedcba9876543210fedcba98' })];
  const admission = validateCapabilityExecutionState({
    capabilityId: 'supplier.alpha',
    capabilityRevision: REVISION,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha'],
    route: route(),
    now: NOW
  });
  assert.equal(admission.ok, false);
  assert.ok(admission.reasonCodes.includes('capability-revision-no-longer-current'));
});

test('stale capability state cannot authorize execution indefinitely', () => {
  const capabilities = [capability('supplier.alpha', { lastEvaluatedAt: '2026-08-30T07:25:00.000Z' })];
  const admission = validateCapabilityExecutionState({
    capabilityId: 'supplier.alpha',
    capabilityRevision: REVISION,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha'],
    route: route(),
    maxStateAgeMinutes: 1440,
    now: NOW
  });
  assert.equal(admission.ok, false);
  assert.ok(admission.reasonCodes.includes('bundle-capability-state-stale:supplier.alpha'));
});

test('route cannot escape the selected bundle or silently change provider identity', () => {
  const capabilities = [capability('supplier.alpha'), capability('supplier.beta')];
  const wrongCapability = validateCapabilityExecutionState({
    capabilityId: 'supplier.alpha',
    capabilityRevision: REVISION,
    currentCapabilities: capabilities,
    selectedBundleIds: ['supplier.alpha'],
    route: route('supplier.beta'),
    now: NOW
  });
  assert.equal(wrongCapability.ok, false);
  assert.ok(wrongCapability.reasonCodes.includes('route-capability-mismatch'));
});
