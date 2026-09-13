import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeNeuralCapabilityObservation } from '../src/neural-exocortex-genome.mjs';
import {
  compileNeuralCapabilityAcquisitionRequest,
  selectCapabilityGenomeBackedNeuralCortex
} from '../src/neural-exocortex-admission.mjs';

const sourceHash = 'a'.repeat(64);
const now = '2026-09-14T00:00:00.000Z';

function neuralReference() {
  return normalizeNeuralCapabilityObservation({
    repositoryFullName: 'example/reasoner',
    sourceUrl: 'https://github.com/example/reasoner',
    family: 'reasoning',
    description: 'reasoning verification agent',
    topics: ['reasoning', 'verification'],
    observedAt: now
  }).capability;
}

function canonicalCapability() {
  return {
    id: 'cap:agent:example-reasoner',
    canonicalIdentity: 'cap:agent:example-reasoner',
    aliases: [],
    source: { url: 'https://github.com/example/reasoner', packageIdentity: null, lineageRoot: null },
    sourceType: 'AGENT',
    sourceRevision: 'commit:0123456789abcdef',
    sourceHash,
    maintainer: { name: 'example' },
    license: 'MIT',
    licenseConfidence: 1,
    capabilityAtoms: [{ id: 'reason.verify', verb: 'verify', noun: 'reasoning', description: 'Verify a reasoning result.', inputs: ['claim'], outputs: ['verification'], sideEffectClass: 'NONE' }],
    taskClasses: ['reasoning verification'],
    inputs: ['claim'],
    outputs: ['verification'],
    sideEffects: ['NONE'],
    dataClasses: ['PUBLIC'],
    permissions: [],
    credentialRequirements: [],
    networkRequirements: [],
    dependencies: [],
    supportedAgents: ['uberbond'],
    supportedModels: [],
    supportedProviders: [],
    knownVulnerabilities: [],
    knownConflicts: [],
    compatibilityEdges: [],
    substitutes: [],
    evidencePointers: [{ type: 'SOURCE', ref: 'github:example/reasoner@0123456789abcdef', observedAt: now, digest: sourceHash, claimClass: 'SOURCE_EVIDENCE' }],
    promotionState: 'APPROVED',
    lastEvaluatedAt: now,
    revocationState: { revoked: false, reasonCodes: [] }
  };
}

function securityEvidence() {
  return ['STATIC', 'SEMANTIC', 'SANDBOX'].map(layer => ({ layer, passed: true, artifactRef: `receipt:${layer.toLowerCase()}`, subjectHash: sourceHash, observedAt: now }));
}

function benchmarkEvidence() {
  return {
    status: 'BENCHMARK_ELIGIBLE',
    benchmarkDigest: 'b'.repeat(64),
    record: {
      securityPassed: true,
      nonRegressing: true,
      candidate: { taskSuccess: 0.9, quality: 0.9, reliability: 0.9 }
    }
  };
}

test('neural reference without immutable canonical body becomes acquisition request, never active route', () => {
  const ref = neuralReference();
  const request = compileNeuralCapabilityAcquisitionRequest(ref);
  assert.equal(request.ok, true);
  assert.equal(request.request.executionAuthority, 'NONE');
  assert.ok(request.request.requiredEvidence.includes('SOURCE_SHA256'));
  const routed = selectCapabilityGenomeBackedNeuralCortex({ mission: 'verify reasoning', neuralReferences: [ref] });
  assert.equal(routed.selected.length, 0);
  assert.equal(routed.blocked[0].reason, 'CANONICAL_CAPABILITY_BODY_NOT_AVAILABLE');
});

test('manual neural flags cannot bypass Capability Genome admission', () => {
  const ref = { ...neuralReference(), promotionState: 'ACTIVE', securityState: 'APPROVED', benchmarkState: 'ELIGIBLE', executionAuthority: 'BOUNDED_MISSION_ONLY' };
  const routed = selectCapabilityGenomeBackedNeuralCortex({ mission: 'verify reasoning', neuralReferences: [ref], canonicalCapabilities: [] });
  assert.equal(routed.selected.length, 0);
  assert.equal(routed.status, 'NO_CAPABILITY_GENOME_BACKED_NEURAL_ROUTE');
});

test('canonical capability still fails closed without independent security evidence', () => {
  const ref = neuralReference();
  const cap = canonicalCapability();
  const routed = selectCapabilityGenomeBackedNeuralCortex({
    mission: 'verify reasoning',
    neuralReferences: [ref],
    canonicalCapabilities: [cap],
    benchmarkEvidenceByCapability: { [cap.id]: benchmarkEvidence() }
  });
  assert.equal(routed.selected.length, 0);
  assert.equal(routed.blocked[0].reason, 'CAPABILITY_GENOME_ADMISSION_NOT_ELIGIBLE');
});

test('active exocortex route requires canonical source hash, Capability Genome admission, and benchmark evidence', () => {
  const ref = neuralReference();
  const cap = canonicalCapability();
  const routed = selectCapabilityGenomeBackedNeuralCortex({
    mission: 'reasoning verification',
    neuralReferences: [ref],
    canonicalCapabilities: [cap],
    securityEvidenceByCapability: { [cap.id]: securityEvidence() },
    benchmarkEvidenceByCapability: { [cap.id]: benchmarkEvidence() },
    authorizedPermissions: []
  });
  assert.equal(routed.status, 'CAPABILITY_GENOME_BACKED_NEURAL_CORTEX_SELECTED');
  assert.equal(routed.selected.length, 1);
  assert.equal(routed.selected[0].capabilityId, cap.id);
  assert.equal(routed.selected[0].sourceHash, sourceHash);
  assert.equal(routed.consequenceAuthority, 'NONE_CREATED_BY_NEURAL_SELECTION');
});
