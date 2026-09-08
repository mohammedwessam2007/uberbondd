import crypto from 'node:crypto';
import { admitCapability } from './capability-genome-admission.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAPABILITY_SCALED_SECURITY_VERSION = 'uberbond.capability-scaled-security.v1.2';

export const SECURITY_TIERS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const C26_EVIDENCE_CLASSES = Object.freeze([
  'THREAT_MODEL',
  'RED_TEAM',
  'CANARY',
  'ROLLBACK',
  'REVOCATION',
  'MONITOR',
  'RESOURCE_QUOTA',
  'PROVENANCE_ATTESTATION',
  'AUDIT_RETENTION',
  'SUPPLY_CHAIN',
  'EMERGENCY_STOP',
  'RECOVERY_SEPARATION'
]);

export const C26_THREAT_FAMILIES = Object.freeze([
  'PROMPT_OR_TOOL_INJECTION',
  'DATA_POISONING',
  'MODEL_POISONING',
  'DEPENDENCY_COMPROMISE',
  'MALICIOUS_PLUGIN_MCP_SKILL',
  'SUPPLY_CHAIN_COMPROMISE',
  'SECRET_EXFILTRATION',
  'PRIVILEGE_ESCALATION',
  'AUTHORITY_DRIFT',
  'EVALUATOR_CAPTURE',
  'BENCHMARK_GAMING',
  'HIDDEN_EXTERNAL_EFFECTS',
  'RUNAWAY_SPEND_OR_COMPUTE',
  'UNAUTHORIZED_PERSISTENCE',
  'UNAUTHORIZED_REPLICATION',
  'SELF_UPDATE_CAPTURE',
  'MONITOR_CAPTURE',
  'ROLLBACK_DESTRUCTION',
  'AUDIT_EVIDENCE_TAMPERING',
  'UNAUTHORIZED_CONSTITUTIONAL_MUTATION'
]);

const TIER_LEVEL = Object.freeze({ LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 });
const REQUIRED_BY_TIER = Object.freeze({
  LOW: ['THREAT_MODEL', 'CANARY', 'ROLLBACK', 'MONITOR'],
  MEDIUM: ['THREAT_MODEL', 'RED_TEAM', 'CANARY', 'ROLLBACK', 'REVOCATION', 'MONITOR', 'RESOURCE_QUOTA'],
  HIGH: ['THREAT_MODEL', 'RED_TEAM', 'CANARY', 'ROLLBACK', 'REVOCATION', 'MONITOR', 'RESOURCE_QUOTA', 'PROVENANCE_ATTESTATION', 'AUDIT_RETENTION', 'SUPPLY_CHAIN'],
  CRITICAL: [...C26_EVIDENCE_CLASSES]
});

const CRITICAL_PERMISSION = /(?:credential|secret|payment|refund|money|production|deploy|dns|private[_ .-]?life|private[_ .-]?state|replicat|self[_ .-]?modify|constitution|account[_ .-]?mutat)/i;
const HIGH_PERMISSION = /(?:message|email|browser[_ .-]?write|provider[_ .-]?write|security[_ .-]?test|external[_ .-]?effect)/i;
const CRITICAL_EFFECTS = new Set(['MONEY_MOVEMENT', 'PRODUCTION_MUTATION', 'CREDENTIAL_CHANGE', 'DNS_CHANGE', 'PRIVATE_LIFE_READ', 'PRIVATE_STATE_READ', 'SELF_MODIFICATION', 'REPLICATION']);
const HIGH_EFFECTS = new Set(['MESSAGE', 'DEPLOYMENT', 'SECURITY_TEST', 'PROVIDER_CALL', 'EXTERNAL_WRITE']);
const SHA256 = /^(?:sha256:)?[0-9a-f]{64}$/;

function clone(value) { return structuredClone(value); }
function text(value, max = 1000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function uniq(values) { return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 500)).filter(Boolean))]; }
function integer(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function digest(value) { return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`; }
function fail(status, reasons, extra = {}) {
  return {
    ok: false,
    status,
    reasonCodes: [...new Set(reasons.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}
function tierAtLeast(a, b) { return (TIER_LEVEL[a] || 0) >= (TIER_LEVEL[b] || 0); }

export function classifyCapabilitySecurityTier({ capability = {}, composition = {} } = {}) {
  const effects = uniq([...(capability?.sideEffects || []), ...(composition?.declaredEffects || [])]).map(value => value.toUpperCase());
  const permissions = uniq([...(capability?.permissions || []), ...(composition?.requestedPermissions || [])]);
  let tier = 'LOW';
  const riskSignals = [];

  if (effects.some(effect => HIGH_EFFECTS.has(effect)) || permissions.some(permission => HIGH_PERMISSION.test(permission))) {
    tier = 'HIGH';
    riskSignals.push('high-external-effect-surface');
  }
  if (effects.some(effect => CRITICAL_EFFECTS.has(effect)) || permissions.some(permission => CRITICAL_PERMISSION.test(permission))) {
    tier = 'CRITICAL';
    riskSignals.push('critical-authority-or-state-surface');
  }
  if (composition?.networked === true && tier === 'LOW') {
    tier = 'MEDIUM';
    riskSignals.push('networked-composition');
  }
  if (composition?.persistent === true || composition?.selfModifying === true || composition?.canReplicate === true) {
    tier = 'CRITICAL';
    riskSignals.push('persistent-self-modifying-or-replicating-composition');
  }
  if (composition?.usesPrivateLifeState === true || composition?.usesCredentials === true || composition?.canMoveMoney === true) {
    tier = 'CRITICAL';
    riskSignals.push('private-credential-or-money-surface');
  }

  return { tier, level: TIER_LEVEL[tier], riskSignals: uniq(riskSignals), effects, permissions };
}

export function evaluateCompositionAuthorityBoundary({ components = [], requestedPermissions = [], explicitCompositionAuthority = [], authorityRef = null } = {}) {
  const requested = uniq(requestedPermissions);
  const explicit = new Set(uniq(explicitCompositionAuthority));
  const reasons = [];
  const normalizedComponents = (Array.isArray(components) ? components : []).map(component => ({
    id: text(component?.id, 200),
    authorities: uniq(component?.authorities).sort()
  }));
  if (!normalizedComponents.length) reasons.push('at-least-one-composition-component-required');
  if (normalizedComponents.some(component => !component.id)) reasons.push('component-id-required');
  if (new Set(normalizedComponents.map(component => component.id)).size !== normalizedComponents.length) reasons.push('component-ids-must-be-unique');

  const componentAuthorityUnion = new Set(normalizedComponents.flatMap(component => component.authorities));
  const unbacked = requested.filter(permission => !componentAuthorityUnion.has(permission));
  const emergent = requested.filter(permission => !explicit.has(permission));
  if (unbacked.length) reasons.push(...unbacked.map(permission => `composition-permission-not-backed-by-component:${permission}`));
  if (emergent.length) reasons.push(...emergent.map(permission => `composition-permission-not-explicitly-authorized:${permission}`));
  if (requested.length && !text(authorityRef, 500)) reasons.push('composition-authority-reference-required');

  return {
    ok: reasons.length === 0,
    status: reasons.length ? 'COMPOSITION_AUTHORITY_BOUNDARY_REFUSED' : 'COMPOSITION_AUTHORITY_BOUNDARY_SATISFIED',
    reasonCodes: [...new Set(reasons)],
    requestedPermissions: requested,
    explicitCompositionAuthority: [...explicit].sort(),
    componentAuthorities: normalizedComponents,
    componentAuthorityUnion: [...componentAuthorityUnion].sort(),
    unbackedPermissions: unbacked,
    emergentPermissions: emergent,
    authorityRef: text(authorityRef, 500),
    law: 'AUTHORITY_OF_A_COMPOSITION_NEVER_EMERGES_FROM_THE_UNION_OF_COMPONENT_CAPABILITIES; EACH_COMPOSED_EFFECT_REQUIRES_BOTH_A_CAPABLE_COMPONENT_AND_EXPLICIT_COMPOSITION_AUTHORITY.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

function normalizeActors(raw = {}) {
  return {
    proposerId: text(raw.proposerId, 200),
    approverId: text(raw.approverId, 200),
    deployerId: text(raw.deployerId, 200),
    verifierId: text(raw.verifierId, 200),
    monitorId: text(raw.monitorId, 200),
    rollbackControllerId: text(raw.rollbackControllerId, 200),
    emergencyStopControllerId: text(raw.emergencyStopControllerId, 200),
    recoveryControllerId: text(raw.recoveryControllerId, 200),
    auditRetentionOwnerId: text(raw.auditRetentionOwnerId, 200)
  };
}

function actorSeparationReasons(actors, tier) {
  const reasons = [];
  const coreKeys = ['proposerId', 'approverId', 'deployerId', 'verifierId', 'monitorId'];
  if (tierAtLeast(tier, 'HIGH')) {
    if (coreKeys.some(key => !actors[key])) reasons.push('high-risk-core-role-identities-required');
    const core = coreKeys.map(key => actors[key]).filter(Boolean);
    if (new Set(core).size !== core.length) reasons.push('high-risk-proposer-approver-deployer-verifier-monitor-must-be-distinct');
  }
  if (tier === 'CRITICAL') {
    for (const key of ['rollbackControllerId', 'emergencyStopControllerId', 'recoveryControllerId', 'auditRetentionOwnerId']) if (!actors[key]) reasons.push(`critical-risk-role-required:${key}`);
    if (actors.emergencyStopControllerId && [actors.proposerId, actors.deployerId].includes(actors.emergencyStopControllerId)) reasons.push('emergency-stop-controller-must-be-independent-of-proposer-and-deployer');
    if (actors.recoveryControllerId && [actors.emergencyStopControllerId, actors.deployerId].includes(actors.recoveryControllerId)) reasons.push('recovery-controller-must-be-independent-of-stop-and-deployer');
    if (actors.auditRetentionOwnerId && [actors.proposerId, actors.deployerId].includes(actors.auditRetentionOwnerId)) reasons.push('audit-retention-owner-must-be-independent-of-proposer-and-deployer');
  }
  return reasons;
}

function normalizeEvidence(rows = [], now = new Date(), maxAgeDays = 30) {
  const nowMs = new Date(now).getTime();
  return (Array.isArray(rows) ? rows : []).map(raw => {
    const observed = new Date(raw?.observedAt);
    const ageDays = Number.isFinite(observed.getTime()) && Number.isFinite(nowMs) ? (nowMs - observed.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    return {
      evidenceClass: C26_EVIDENCE_CLASSES.includes(String(raw?.evidenceClass || '').toUpperCase()) ? String(raw.evidenceClass).toUpperCase() : null,
      passed: raw?.passed === true,
      subjectDigest: text(raw?.subjectDigest, 100)?.toLowerCase() || null,
      artifactRef: text(raw?.artifactRef, 500),
      immutableRef: text(raw?.immutableRef, 500),
      verifierId: text(raw?.verifierId, 200),
      observedAt: Number.isFinite(observed.getTime()) ? observed.toISOString() : null,
      ageDays,
      fresh: ageDays >= 0 && ageDays <= maxAgeDays
    };
  });
}

function normalizeLimits(raw = {}) {
  const fields = ['maxSpendCents', 'maxProviderCalls', 'maxDeployments', 'maxProductionMutations', 'maxCredentialChanges', 'maxPrivateReads', 'maxReplicas', 'maxComputeUnits'];
  return Object.fromEntries(fields.map(field => [field, integer(raw[field], 1_000_000_000_000)]));
}

function limitReasons({ risk, limits }) {
  const reasons = [];
  const require = field => { if (limits[field] === null) reasons.push(`explicit-resource-limit-required:${field}`); };
  if (tierAtLeast(risk.tier, 'MEDIUM')) {
    require('maxProviderCalls');
    require('maxComputeUnits');
  }
  if (risk.tier === 'CRITICAL') for (const field of ['maxSpendCents', 'maxDeployments', 'maxProductionMutations', 'maxCredentialChanges', 'maxPrivateReads', 'maxReplicas']) require(field);
  return reasons;
}

function evidenceReasons({ rows, required, subjectDigest, actors, tier }) {
  const reasons = [];
  const byClass = new Map();
  for (const row of rows) {
    if (!row.evidenceClass || !row.passed || !row.fresh || row.subjectDigest !== subjectDigest || !row.artifactRef || !row.verifierId) continue;
    if (tierAtLeast(tier, 'HIGH') && !row.immutableRef) continue;
    if ([actors.proposerId, actors.deployerId].filter(Boolean).includes(row.verifierId)) continue;
    byClass.set(row.evidenceClass, row);
  }
  for (const klass of required) if (!byClass.has(klass)) reasons.push(`fresh-independent-security-evidence-required:${klass}`);
  if (tier === 'CRITICAL') {
    const red = byClass.get('RED_TEAM');
    const monitor = byClass.get('MONITOR');
    if (red && monitor && red.verifierId === monitor.verifierId) reasons.push('critical-red-team-and-monitor-must-be-independent');
  }
  return { reasons, accepted: [...byClass.values()] };
}

export function compileCapabilityScaledSecurityAdmission({
  capability = null,
  capabilityAdmissionOptions = {},
  composition = {},
  actors = {},
  securityEvidence = [],
  resourceLimits = {},
  audit = {},
  emergency = {},
  now = new Date(),
  maxEvidenceAgeDays = 30
} = {}) {
  const baseAdmission = admitCapability(capability, { ...capabilityAdmissionOptions, now });
  if (!baseAdmission?.ok || baseAdmission?.decision !== 'ELIGIBLE') return fail('C26_SECURITY_ADMISSION_REFUSED', ['existing-capability-genome-admission-must-be-eligible'], { baseAdmission });

  const risk = classifyCapabilitySecurityTier({ capability, composition });
  const normalizedActors = normalizeActors(actors);
  const authorityBoundary = evaluateCompositionAuthorityBoundary({
    components: composition.components,
    requestedPermissions: composition.requestedPermissions,
    explicitCompositionAuthority: composition.explicitCompositionAuthority,
    authorityRef: composition.authorityRef
  });
  const limits = normalizeLimits(resourceLimits);
  const normalizedAudit = {
    appendOnly: audit.appendOnly === true,
    independentStoreRef: text(audit.independentStoreRef, 500),
    retentionOwnerId: text(audit.retentionOwnerId, 200)
  };
  const normalizedEmergency = {
    rollbackRef: text(emergency.rollbackRef, 500),
    revocationRef: text(emergency.revocationRef, 500),
    stopControllerId: text(emergency.stopControllerId, 200),
    recoveryControllerId: text(emergency.recoveryControllerId, 200),
    stopAllowsIndependentRecovery: emergency.stopAllowsIndependentRecovery === true
  };

  const subject = {
    capabilityId: text(capability?.id, 200),
    sourceHash: text(capability?.sourceHash, 100)?.toLowerCase() || null,
    sourceRevision: text(capability?.sourceRevision, 240),
    composition: {
      id: text(composition?.id, 240),
      components: authorityBoundary.componentAuthorities,
      requestedPermissions: authorityBoundary.requestedPermissions,
      explicitCompositionAuthority: authorityBoundary.explicitCompositionAuthority,
      authorityRef: authorityBoundary.authorityRef,
      declaredEffects: uniq(composition?.declaredEffects).map(value => value.toUpperCase()).sort(),
      networked: composition?.networked === true,
      persistent: composition?.persistent === true,
      selfModifying: composition?.selfModifying === true,
      canReplicate: composition?.canReplicate === true,
      usesPrivateLifeState: composition?.usesPrivateLifeState === true,
      usesCredentials: composition?.usesCredentials === true,
      canMoveMoney: composition?.canMoveMoney === true
    },
    actors: normalizedActors,
    resourceLimits: limits,
    audit: normalizedAudit,
    emergency: normalizedEmergency,
    riskTier: risk.tier
  };
  const subjectDigest = digest(subject);
  const requiredEvidenceClasses = REQUIRED_BY_TIER[risk.tier];
  const normalizedEvidence = normalizeEvidence(securityEvidence, now, maxEvidenceAgeDays);
  const evidenceCheck = evidenceReasons({ rows: normalizedEvidence, required: requiredEvidenceClasses, subjectDigest, actors: normalizedActors, tier: risk.tier });

  const reasons = [];
  if (!authorityBoundary.ok) reasons.push(...authorityBoundary.reasonCodes);
  reasons.push(...actorSeparationReasons(normalizedActors, risk.tier));
  reasons.push(...limitReasons({ risk, limits }));
  reasons.push(...evidenceCheck.reasons);

  if (tierAtLeast(risk.tier, 'HIGH')) {
    if (!normalizedAudit.appendOnly || !normalizedAudit.independentStoreRef) reasons.push('high-risk-append-only-independent-audit-required');
    if (!normalizedAudit.retentionOwnerId || [normalizedActors.proposerId, normalizedActors.deployerId].includes(normalizedAudit.retentionOwnerId)) reasons.push('high-risk-independent-audit-retention-owner-required');
    if (normalizedAudit.retentionOwnerId !== normalizedActors.auditRetentionOwnerId) reasons.push('audit-retention-owner-binding-mismatch');
  }
  if (risk.tier === 'CRITICAL') {
    if (!normalizedEmergency.rollbackRef) reasons.push('critical-rollback-reference-required');
    if (!normalizedEmergency.revocationRef) reasons.push('critical-revocation-reference-required');
    if (!normalizedEmergency.stopAllowsIndependentRecovery) reasons.push('emergency-stop-must-preserve-independent-recovery');
    if (normalizedEmergency.stopControllerId !== normalizedActors.emergencyStopControllerId) reasons.push('emergency-stop-controller-binding-mismatch');
    if (normalizedEmergency.recoveryControllerId !== normalizedActors.recoveryControllerId) reasons.push('recovery-controller-binding-mismatch');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    ok: uniqueReasons.length === 0,
    status: uniqueReasons.length ? 'C26_SECURITY_ADMISSION_BLOCKED' : 'C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE',
    version: CAPABILITY_SCALED_SECURITY_VERSION,
    reasonCodes: uniqueReasons,
    subject,
    subjectDigest,
    risk,
    baseAdmission,
    authorityBoundary,
    actors: normalizedActors,
    requiredEvidenceClasses,
    acceptedSecurityEvidence: evidenceCheck.accepted,
    resourceLimits: limits,
    audit: normalizedAudit,
    emergency: normalizedEmergency,
    capabilityScaledLaw: 'CAPABILITY_GROWTH_CANNOT_PRECEDE_THE_SECURITY_EVALUATION_CORRIGIBILITY_ENVELOPE_REQUIRED_BY_ITS_EFFECT_SURFACE.',
    truthBoundary: 'C26 admission proves only that the exact declared composition, quotas, audit controls and emergency controls meet current security preconditions. It grants no spend, messaging, deployment, credential, private-state, account, payment, physical-action or self-modification authority.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
  };
}

function observedRuntimeReceipt(receipt, receiptClass, subjectDigest) {
  const observed = new Date(receipt?.observedAt);
  return receipt
    && typeof receipt === 'object'
    && receipt.evidenceClass === 'OBSERVED_RUNTIME'
    && receipt.receiptClass === receiptClass
    && receipt.subjectDigest === subjectDigest
    && receipt.synthetic !== true
    && Number.isFinite(observed.getTime())
    && text(receipt.runtimeIdentity, 500)
    && text(receipt.evidenceRef, 500)
    && text(receipt.attestationRef, 500)
    && text(receipt.independentVerifierRef, 500)
    && Number(receipt.unauthorizedExternalEffects ?? 0) === 0;
}

export function verifyCapabilitySecurityRehearsal({ admission = null, canaryReceipt = null, rollbackReceipt = null, revocationReceipt = null, monitorReceipt = null, emergencyStopReceipt = null } = {}) {
  if (!admission?.ok || admission.status !== 'C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE' || !SHA256.test(admission.subjectDigest || '')) return fail('C26_SECURITY_REHEARSAL_REFUSED', ['successful-c26-admission-required']);
  const reasons = [];
  const required = [['CANARY', canaryReceipt], ['ROLLBACK', rollbackReceipt], ['REVOCATION', revocationReceipt], ['MONITOR', monitorReceipt]];
  if (admission.risk?.tier === 'CRITICAL') required.push(['EMERGENCY_STOP', emergencyStopReceipt]);
  for (const [klass, receipt] of required) if (!observedRuntimeReceipt(receipt, klass, admission.subjectDigest)) reasons.push(`observed-independent-runtime-receipt-required:${klass}`);
  if (canaryReceipt && (canaryReceipt.boundedCanary !== true || canaryReceipt.canaryPassed !== true)) reasons.push('bounded-successful-canary-required');
  if (rollbackReceipt && (rollbackReceipt.priorReleaseRestored !== true || !text(rollbackReceipt.rollbackArtifactRef, 500))) reasons.push('observed-prior-release-rollback-required');
  if (revocationReceipt && revocationReceipt.revokedArtifactBlocked !== true) reasons.push('observed-revoked-artifact-block-required');
  if (monitorReceipt && monitorReceipt.independentMonitorObserved !== true) reasons.push('observed-independent-monitor-required');
  if (emergencyStopReceipt) {
    if (emergencyStopReceipt.targetStopped !== true) reasons.push('emergency-stop-target-must-be-observed-stopped');
    if (emergencyStopReceipt.independentRecoveryStillAvailable !== true) reasons.push('emergency-stop-must-not-disable-independent-recovery');
  }
  if (reasons.length) return fail('C26_SECURITY_REHEARSAL_REFUSED', reasons, { subjectDigest: admission.subjectDigest });

  return {
    ok: true,
    status: 'C26_SECURITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE',
    subjectDigest: admission.subjectDigest,
    runtimeIdentities: [...new Set(required.map(([, receipt]) => receipt?.runtimeIdentity).filter(Boolean))],
    observedClasses: required.map(([klass]) => klass),
    evidenceClass: 'OBSERVED_RUNTIME',
    scopeBoundary: 'Observed canary/rollback/revocation/monitor/stop behavior does not prove universal safety, future-version safety, external outcomes or ASI.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
  };
}

export function verifyRecursiveGovernanceChain({ generations = [] } = {}) {
  if (!Array.isArray(generations) || generations.length === 0) return fail('RECURSIVE_GOVERNANCE_REFUSED', ['at-least-one-generation-required']);
  const reasons = [];
  const normalized = generations.map((raw, index) => ({
    generationId: text(raw?.generationId, 200),
    parentGenerationId: text(raw?.parentGenerationId, 200),
    proposerId: text(raw?.proposerId, 200),
    approverId: text(raw?.approverId, 200),
    deployerId: text(raw?.deployerId, 200),
    verifierId: text(raw?.verifierId, 200),
    monitorId: text(raw?.monitorId, 200),
    policyDigest: text(raw?.policyDigest, 100)?.toLowerCase() || null,
    constitutionalDigest: text(raw?.constitutionalDigest, 100)?.toLowerCase() || null,
    riskTier: SECURITY_TIERS.includes(String(raw?.riskTier || '').toUpperCase()) ? String(raw.riskTier).toUpperCase() : null,
    securityEnvelopeTier: SECURITY_TIERS.includes(String(raw?.securityEnvelopeTier || '').toUpperCase()) ? String(raw.securityEnvelopeTier).toUpperCase() : null,
    constitutionalMutationApproved: raw?.constitutionalMutationApproved === true,
    ownerAuthorityRef: text(raw?.ownerAuthorityRef, 500),
    index
  }));

  const ids = normalized.map(row => row.generationId).filter(Boolean);
  if (ids.length !== normalized.length || new Set(ids).size !== ids.length) reasons.push('unique-generation-ids-required');
  for (let index = 0; index < normalized.length; index += 1) {
    const row = normalized[index];
    const roles = [row.proposerId, row.approverId, row.deployerId, row.verifierId, row.monitorId];
    if (roles.some(role => !role)) reasons.push(`generation-core-role-identities-required:${row.generationId || index}`);
    if (roles.filter(Boolean).length && new Set(roles.filter(Boolean)).size !== roles.filter(Boolean).length) reasons.push(`generation-role-collapse-refused:${row.generationId || index}`);
    if (!SHA256.test(row.policyDigest || '')) reasons.push(`generation-policy-digest-required:${row.generationId || index}`);
    if (!SHA256.test(row.constitutionalDigest || '')) reasons.push(`generation-constitutional-digest-required:${row.generationId || index}`);
    if (!row.riskTier || !row.securityEnvelopeTier || !tierAtLeast(row.securityEnvelopeTier, row.riskTier)) reasons.push(`generation-security-envelope-below-risk:${row.generationId || index}`);
    if (index > 0) {
      const parent = normalized[index - 1];
      if (row.parentGenerationId !== parent.generationId) reasons.push(`generation-parent-chain-mismatch:${row.generationId || index}`);
      if (row.constitutionalDigest !== parent.constitutionalDigest && (!row.constitutionalMutationApproved || !row.ownerAuthorityRef)) reasons.push(`constitutional-mutation-requires-explicit-owner-authority:${row.generationId || index}`);
    } else if (row.parentGenerationId) reasons.push('first-generation-must-not-invent-parent');
  }

  if (reasons.length) return fail('RECURSIVE_GOVERNANCE_REFUSED', reasons);
  return {
    ok: true,
    status: 'RECURSIVE_GOVERNANCE_CHAIN_STRUCTURALLY_VALID',
    generations: normalized,
    chainDigest: digest(normalized),
    law: 'NO_RECURSIVE_GENERATION_MAY_COLLAPSE_PROPOSAL_APPROVAL_DEPLOYMENT_VERIFICATION_MONITORING_OR_MUTATE_CONSTITUTIONAL_AUTHORITY_WITHOUT_EXPLICIT_FOUNDER_AUTHORITY.',
    runtimeProof: 'NONE__STRUCTURAL_CHAIN_ONLY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
  };
}
