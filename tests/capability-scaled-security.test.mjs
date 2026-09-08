import test from 'node:test';
import assert from 'node:assert/strict';
import {
  C26_EVIDENCE_CLASSES,
  classifyCapabilitySecurityTier,
  evaluateCompositionAuthorityBoundary,
  compileCapabilityScaledSecurityAdmission,
  verifyCapabilitySecurityRehearsal,
  verifyRecursiveGovernanceChain
} from '../src/capability-scaled-security.mjs';

const NOW = '2026-09-09T00:00:00.000Z';
const HASH = 'a'.repeat(64);
const DIGEST = value => `sha256:${String(value).repeat(64).slice(0,64)}`;

function capability(overrides = {}) {
  const id = overrides.id || 'supplier.security-critical';
  return {
    id,
    canonicalIdentity: `cap:skill:${id.replaceAll('.', '-')}`,
    aliases: [],
    source: { url: `https://example.test/${id}`, packageIdentity: null, lineageRoot: null },
    sourceType: 'SKILL',
    sourceRevision: '0123456789abcdef0123456789abcdef01234567',
    sourceHash: HASH,
    maintainer: { name: 'Example Maintainer' },
    license: 'MIT',
    licenseConfidence: 1,
    capabilityAtoms: [{
      id: 'production.deploy', verb: 'deploy', noun: 'release',
      description: 'Deploy a bounded release after separate authority.',
      inputs: ['release'], outputs: ['receipt'], sideEffectClass: 'PRODUCTION_MUTATION'
    }],
    taskClasses: ['deployment'],
    inputs: ['release'], outputs: ['receipt'],
    sideEffects: overrides.sideEffects || ['PRODUCTION_MUTATION'],
    dataClasses: ['SOURCE_CODE'],
    permissions: overrides.permissions || ['production.deploy'],
    credentialRequirements: [], networkRequirements: [], dependencies: [],
    executionEnvironment: { runtime: 'node', isolation: 'project-local' },
    supportedAgents: ['sol'], supportedModels: ['model-a'], supportedProviders: ['provider-a'],
    contextCost: { tokens: 100 }, monetaryCost: { cents: 0 }, reliability: { observedRate: 0.9 },
    economicPrior: { confidence: 0.5 }, securityEvidence: [], knownVulnerabilities: [], knownConflicts: [],
    compatibilityEdges: [], substitutes: [], benchmarks: [], realUsageEvidence: [],
    founderMinutesSaved: { status: 'UNKNOWN' }, observedOutcomes: [], versionHistory: [],
    promotionState: 'ACTIVE', revocationState: { revoked: false, reasonCodes: [] },
    lastEvaluatedAt: '2026-09-08T12:00:00.000Z',
    evidencePointers: [{ type: 'SOURCE', ref: `https://example.test/${id}/tree/0123456789abcdef0123456789abcdef01234567`, observedAt: '2026-09-08T12:00:00.000Z', claimClass: 'SOURCE_CODE_EVIDENCE' }]
  };
}

const baseSecurity = () => ['STATIC', 'SEMANTIC', 'SANDBOX'].map(layer => ({
  layer, passed: true, artifactRef: `evidence://base/${layer.toLowerCase()}`, subjectHash: HASH, observedAt: '2026-09-08T12:00:00.000Z'
}));

function actors(over = {}) {
  return {
    proposerId: 'actor:proposer', approverId: 'actor:approver', deployerId: 'actor:deployer',
    verifierId: 'actor:verifier', monitorId: 'actor:monitor', rollbackControllerId: 'actor:rollback',
    emergencyStopControllerId: 'actor:stop', recoveryControllerId: 'actor:recovery', auditRetentionOwnerId: 'actor:audit',
    ...over
  };
}

function composition(over = {}) {
  return {
    id: 'composition:deploy-safe',
    components: [{ id: 'planner', authorities: [] }, { id: 'deployer', authorities: ['production.deploy'] }],
    requestedPermissions: ['production.deploy'],
    explicitCompositionAuthority: ['production.deploy'],
    authorityRef: 'authority://founder/deploy-1',
    declaredEffects: ['PRODUCTION_MUTATION'],
    networked: true,
    ...over
  };
}

const limits = () => ({
  maxSpendCents: 0, maxProviderCalls: 4, maxDeployments: 1, maxProductionMutations: 1,
  maxCredentialChanges: 0, maxPrivateReads: 0, maxReplicas: 0, maxComputeUnits: 100
});

function seed(over = {}) {
  return compileCapabilityScaledSecurityAdmission({
    capability: capability(over.capability),
    capabilityAdmissionOptions: {
      securityEvidence: baseSecurity(),
      requestedPermissions: over.requestedPermissions || ['production.deploy'],
      authorizedPermissions: over.authorizedPermissions || ['production.deploy']
    },
    composition: composition(over.composition),
    actors: actors(over.actors),
    securityEvidence: over.securityEvidence || [],
    resourceLimits: over.resourceLimits || limits(),
    audit: over.audit || { appendOnly: true, independentStoreRef: 'audit://independent/1', retentionOwnerId: 'actor:audit' },
    emergency: over.emergency || {
      rollbackRef: 'rollback://release/previous', revocationRef: 'revocation://capability/current',
      stopControllerId: 'actor:stop', recoveryControllerId: 'actor:recovery', stopAllowsIndependentRecovery: true
    },
    now: NOW
  });
}

function fullEvidence(subjectDigest, overrides = {}) {
  return C26_EVIDENCE_CLASSES.map((evidenceClass, index) => ({
    evidenceClass,
    passed: true,
    subjectDigest,
    artifactRef: `evidence://c26/${evidenceClass.toLowerCase()}`,
    immutableRef: `sha256://${String(index + 1).padStart(64, '0')}`,
    verifierId: evidenceClass === 'MONITOR' ? 'actor:monitor-verifier' : evidenceClass === 'RED_TEAM' ? 'actor:red-team' : `actor:security-${index}`,
    observedAt: '2026-09-08T12:00:00.000Z',
    ...overrides[evidenceClass]
  }));
}

function ready(over = {}) {
  const first = seed(over);
  assert.match(first.subjectDigest, /^sha256:[0-9a-f]{64}$/);
  return seed({ ...over, securityEvidence: fullEvidence(first.subjectDigest, over.evidenceOverrides || {}) });
}

function runtimeReceipt(receiptClass, subjectDigest, extra = {}) {
  return {
    evidenceClass: 'OBSERVED_RUNTIME', receiptClass, subjectDigest,
    runtimeIdentity: 'runtime://host-a/release-1', evidenceRef: `runtime-evidence://${receiptClass.toLowerCase()}`,
    independentVerifierRef: `verifier://${receiptClass.toLowerCase()}`, unauthorizedExternalEffects: 0,
    observedAt: NOW, synthetic: false, attestationRef: `attestation://${receiptClass.toLowerCase()}`,
    ...extra
  };
}

test('composition authority cannot emerge from component authority union', () => {
  const out = evaluateCompositionAuthorityBoundary({
    components: [{ id: 'planner', authorities: ['message.send'] }, { id: 'payer', authorities: ['payment.capture'] }],
    requestedPermissions: ['message.send', 'payment.capture'],
    explicitCompositionAuthority: ['message.send'],
    authorityRef: 'authority://bounded'
  });
  assert.equal(out.ok, false);
  assert.deepEqual(out.emergentPermissions, ['payment.capture']);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('requested composition authority requires an explicit authority reference', () => {
  const out = evaluateCompositionAuthorityBoundary({ components: [{ id: 'x', authorities: [] }], requestedPermissions: ['x.do'], explicitCompositionAuthority: ['x.do'] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('composition-authority-reference-required'));
});

test('production mutation is classified critical', () => {
  assert.equal(classifyCapabilitySecurityTier({ capability: capability(), composition: composition() }).tier, 'CRITICAL');
});

test('network-only composition is at least medium risk', () => {
  const cap = capability({ sideEffects: ['NONE'], permissions: [] });
  const out = classifyCapabilitySecurityTier({ capability: cap, composition: { networked: true } });
  assert.equal(out.tier, 'MEDIUM');
});

test('existing Capability Genome admission must remain eligible', () => {
  const out = seed({ authorizedPermissions: [] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('existing-capability-genome-admission-must-be-eligible'));
});

test('critical proposer approver deployer verifier monitor role collapse is refused', () => {
  const out = seed({ actors: { verifierId: 'actor:proposer' } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('high-risk-proposer-approver-deployer-verifier-monitor-must-be-distinct'));
});

test('critical independent stop and recovery controllers are required', () => {
  const out = seed({ actors: { recoveryControllerId: 'actor:stop' }, emergency: { rollbackRef: 'r', revocationRef: 'v', stopControllerId: 'actor:stop', recoveryControllerId: 'actor:stop', stopAllowsIndependentRecovery: true } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('recovery-controller-must-be-independent-of-stop-and-deployer'));
});

test('critical resource limits must be explicit rather than inferred from zero usage', () => {
  const out = seed({ resourceLimits: { maxProviderCalls: 1, maxComputeUnits: 1 } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code === 'explicit-resource-limit-required:maxSpendCents'));
});

test('security evidence is bound to exact composition subject digest', () => {
  const first = seed();
  const evidence = fullEvidence(DIGEST('b'));
  const out = seed({ securityEvidence: evidence });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('fresh-independent-security-evidence-required:THREAT_MODEL'));
  assert.notEqual(first.subjectDigest, DIGEST('b'));
});

test('stale security evidence cannot ride a current capability into production', () => {
  const first = seed();
  const evidence = fullEvidence(first.subjectDigest).map(row => ({ ...row, observedAt: '2026-01-01T00:00:00.000Z' }));
  const out = seed({ securityEvidence: evidence });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('fresh-independent-security-evidence-required:RED_TEAM'));
});

test('proposer or deployer cannot self-verify a required evidence layer', () => {
  const first = seed();
  const evidence = fullEvidence(first.subjectDigest, { THREAT_MODEL: { verifierId: 'actor:proposer' } });
  const out = seed({ securityEvidence: evidence });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('fresh-independent-security-evidence-required:THREAT_MODEL'));
});

test('high and critical evidence requires immutable references', () => {
  const first = seed();
  const evidence = fullEvidence(first.subjectDigest, { SUPPLY_CHAIN: { immutableRef: null } });
  const out = seed({ securityEvidence: evidence });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('fresh-independent-security-evidence-required:SUPPLY_CHAIN'));
});

test('append-only audit must be independently retained', () => {
  const out = ready({ audit: { appendOnly: true, independentStoreRef: 'audit://1', retentionOwnerId: 'actor:deployer' } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('high-risk-independent-audit-retention-owner-required'));
});

test('emergency stop is invalid when it also kills independent recovery', () => {
  const out = ready({ emergency: { rollbackRef: 'rollback://1', revocationRef: 'revoke://1', stopControllerId: 'actor:stop', recoveryControllerId: 'actor:recovery', stopAllowsIndependentRecovery: false } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('emergency-stop-must-preserve-independent-recovery'));
});

test('fully evidenced critical admission still grants zero business authority and no ASI claim', () => {
  const out = ready();
  assert.equal(out.ok, true);
  assert.equal(out.status, 'C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.asiClaim, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(out.requiredEvidenceClasses.length, C26_EVIDENCE_CLASSES.length);
});

test('C26-B refuses absence of observed emergency-stop proof for critical capability', () => {
  const admission = ready();
  const out = verifyCapabilitySecurityRehearsal({
    admission,
    canaryReceipt: runtimeReceipt('CANARY', admission.subjectDigest, { boundedCanary: true, canaryPassed: true }),
    rollbackReceipt: runtimeReceipt('ROLLBACK', admission.subjectDigest, { priorReleaseRestored: true, rollbackArtifactRef: 'release://old' }),
    revocationReceipt: runtimeReceipt('REVOCATION', admission.subjectDigest, { revokedArtifactBlocked: true }),
    monitorReceipt: runtimeReceipt('MONITOR', admission.subjectDigest, { independentMonitorObserved: true })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('observed-independent-runtime-receipt-required:EMERGENCY_STOP'));
});

test('rollback receipt must prove prior release was actually restored', () => {
  const admission = ready();
  const out = verifyCapabilitySecurityRehearsal({
    admission,
    canaryReceipt: runtimeReceipt('CANARY', admission.subjectDigest, { boundedCanary: true, canaryPassed: true }),
    rollbackReceipt: runtimeReceipt('ROLLBACK', admission.subjectDigest, { priorReleaseRestored: false, rollbackArtifactRef: 'release://old' }),
    revocationReceipt: runtimeReceipt('REVOCATION', admission.subjectDigest, { revokedArtifactBlocked: true }),
    monitorReceipt: runtimeReceipt('MONITOR', admission.subjectDigest, { independentMonitorObserved: true }),
    emergencyStopReceipt: runtimeReceipt('EMERGENCY_STOP', admission.subjectDigest, { targetStopped: true, independentRecoveryStillAvailable: true })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('observed-prior-release-rollback-required'));
});

test('emergency stop cannot count if rescue path died with the target', () => {
  const admission = ready();
  const out = verifyCapabilitySecurityRehearsal({
    admission,
    canaryReceipt: runtimeReceipt('CANARY', admission.subjectDigest, { boundedCanary: true, canaryPassed: true }),
    rollbackReceipt: runtimeReceipt('ROLLBACK', admission.subjectDigest, { priorReleaseRestored: true, rollbackArtifactRef: 'release://old' }),
    revocationReceipt: runtimeReceipt('REVOCATION', admission.subjectDigest, { revokedArtifactBlocked: true }),
    monitorReceipt: runtimeReceipt('MONITOR', admission.subjectDigest, { independentMonitorObserved: true }),
    emergencyStopReceipt: runtimeReceipt('EMERGENCY_STOP', admission.subjectDigest, { targetStopped: true, independentRecoveryStillAvailable: false })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('emergency-stop-must-not-disable-independent-recovery'));
});

test('complete observed rehearsal remains bounded evidence, not universal safety or ASI', () => {
  const admission = ready();
  const out = verifyCapabilitySecurityRehearsal({
    admission,
    canaryReceipt: runtimeReceipt('CANARY', admission.subjectDigest, { boundedCanary: true, canaryPassed: true }),
    rollbackReceipt: runtimeReceipt('ROLLBACK', admission.subjectDigest, { priorReleaseRestored: true, rollbackArtifactRef: 'release://old' }),
    revocationReceipt: runtimeReceipt('REVOCATION', admission.subjectDigest, { revokedArtifactBlocked: true }),
    monitorReceipt: runtimeReceipt('MONITOR', admission.subjectDigest, { independentMonitorObserved: true }),
    emergencyStopReceipt: runtimeReceipt('EMERGENCY_STOP', admission.subjectDigest, { targetStopped: true, independentRecoveryStillAvailable: true })
  });
  assert.equal(out.ok, true);
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.asiClaim, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.match(out.scopeBoundary, /does not prove universal safety/);
});

function generation(id, over = {}) {
  return {
    generationId: id,
    parentGenerationId: null,
    proposerId: `${id}:proposer`, approverId: `${id}:approver`, deployerId: `${id}:deployer`, verifierId: `${id}:verifier`, monitorId: `${id}:monitor`,
    policyDigest: DIGEST('c'), constitutionalDigest: DIGEST('d'), riskTier: 'HIGH', securityEnvelopeTier: 'HIGH',
    constitutionalMutationApproved: false, ownerAuthorityRef: null,
    ...over
  };
}

test('recursive generation cannot collapse proposer and verifier', () => {
  const g = generation('g1'); g.verifierId = g.proposerId;
  const out = verifyRecursiveGovernanceChain({ generations: [g] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('generation-role-collapse-refused:g1'));
});

test('recursive security envelope cannot fall below capability risk', () => {
  const out = verifyRecursiveGovernanceChain({ generations: [generation('g1', { riskTier: 'CRITICAL', securityEnvelopeTier: 'HIGH' })] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('generation-security-envelope-below-risk:g1'));
});

test('recursive generation cannot mutate constitution without explicit founder authority', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', { parentGenerationId: 'g1', constitutionalDigest: DIGEST('e') });
  const out = verifyRecursiveGovernanceChain({ generations: [g1, g2] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('constitutional-mutation-requires-explicit-owner-authority:g2'));
});

test('first recursive generation may not invent an unseen parent', () => {
  const out = verifyRecursiveGovernanceChain({ generations: [generation('g1', { parentGenerationId: 'ghost' })] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('first-generation-must-not-invent-parent'));
});

test('valid recursive chain preserves separation and still has no runtime proof', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', { parentGenerationId: 'g1' });
  const g3 = generation('g3', { parentGenerationId: 'g2', constitutionalDigest: DIGEST('e'), constitutionalMutationApproved: true, ownerAuthorityRef: 'authority://founder/constitution-1' });
  const out = verifyRecursiveGovernanceChain({ generations: [g1, g2, g3] });
  assert.equal(out.ok, true);
  assert.equal(out.runtimeProof, 'NONE__STRUCTURAL_CHAIN_ONLY');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.asiClaim, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});
