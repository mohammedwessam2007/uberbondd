import crypto from 'node:crypto';
import {
  compileIndependentEvaluation,
  compileFreshContextRetention
} from './transfer-evaluation-governor.mjs';
import { evaluateCrossDomainTransfer } from './cross-domain-transfer-evaluator.mjs';

export const COMPOUND_INTELLIGENCE_EVALUATION_VERSION = 'uberbond.compound-intelligence-evaluation.v1.1';

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const text = (value, max = 1000) => {
  const out = typeof value === 'string' ? value.trim() : '';
  return out && out.length <= max ? out : null;
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = values => [...new Set(values)];
const number = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const instant = value => {
  const raw = text(value, 100);
  if (!raw || !ISO_INSTANT.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? { raw, ms } : null;
};
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  version: COMPOUND_INTELLIGENCE_EVALUATION_VERSION,
  status,
  reasonCodes: unique(reasonCodes.filter(Boolean)),
  businessEffectAuthority: 'NONE',
  promotionAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

function normalizeInterval(input, score) {
  const low = number(input?.low, 0, 1);
  const high = number(input?.high, 0, 1);
  if (low === null || high === null || low > high || score < low || score > high) return null;
  return { low, high };
}

function normalizeComponent(input = {}) {
  const componentId = text(input.componentId, 200);
  const revision = text(input.revision, 300);
  const lineageRef = text(input.lineageRef, 500);
  const role = text(input.role, 100)?.toUpperCase();
  const capabilityState = text(input.capabilityState, 80)?.toUpperCase();
  if (!componentId || !revision || !lineageRef || !role || !capabilityState) return null;
  return {
    componentId,
    revision,
    lineageRef,
    role,
    capabilityState,
    countsAsIndependentVote: input.countsAsIndependentVote === true
  };
}

function normalizeBaseline(input = {}) {
  const selectedBaselineId = text(input.selectedBaselineId, 200);
  const selectedRevision = text(input.selectedRevision, 300);
  const selectionEvidenceRef = text(input.selectionEvidenceRef, 500);
  const selectionOwner = text(input.selectionOwner, 80)?.toUpperCase();
  if (!selectedBaselineId || !selectedRevision || !selectionEvidenceRef || selectionOwner !== 'EVALUATOR_PREDECLARED' || input.frozenBeforeEvaluation !== true) return null;
  const alternatives = [];
  for (const raw of Array.isArray(input.alternatives) ? input.alternatives : []) {
    const id = text(raw?.id, 200);
    const revision = text(raw?.revision, 300);
    const evidenceRef = text(raw?.evidenceRef, 500);
    const strengthRank = integer(raw?.strengthRank, 0, 1_000_000);
    if (!id || !revision || !evidenceRef || strengthRank === null) return null;
    alternatives.push({ id, revision, evidenceRef, strengthRank, accessible: raw?.accessible === true, eligible: raw?.eligible === true });
  }
  if (!alternatives.length || new Set(alternatives.map(row => `${row.id}@${row.revision}`)).size !== alternatives.length) return null;
  return { selectedBaselineId, selectedRevision, selectionEvidenceRef, selectionOwner, alternatives };
}

function normalizeArm(input = {}) {
  const systemId = text(input.systemId, 200);
  const revision = text(input.revision, 300);
  const score = number(input.score, 0, 1);
  const interval = score === null ? null : normalizeInterval(input.scoreInterval, score);
  const wallTimeMs = integer(input.wallTimeMs, 0, 31_536_000_000);
  const monetaryCostMicros = integer(input.monetaryCostMicros, 0, 1_000_000_000_000);
  const humanAssistanceMinutes = number(input.humanAssistanceMinutes, 0, 1_000_000);
  if (!systemId || !revision || score === null || !interval || wallTimeMs === null || monetaryCostMicros === null || humanAssistanceMinutes === null) return null;
  return { systemId, revision, score, scoreInterval: interval, wallTimeMs, monetaryCostMicros, humanAssistanceMinutes };
}

function normalizeFamily(input = {}) {
  const familyId = text(input.familyId, 200);
  const measurementEvidenceRef = text(input.measurementEvidenceRef, 500);
  const measurementClass = text(input.measurementClass, 80)?.toUpperCase();
  const taskSetHash = text(input.taskSetHash, 64)?.toLowerCase();
  const baseline = normalizeArm(input.baseline);
  const current = normalizeArm(input.current);
  const candidate = normalizeArm(input.candidate);
  if (!familyId || !measurementEvidenceRef || measurementClass !== 'OBSERVED_EVALUATION' || !taskSetHash || !SHA256.test(taskSetHash) || !baseline || !current || !candidate) return null;
  return { familyId, measurementEvidenceRef, measurementClass, taskSetHash, baseline, current, candidate, protectedGate: input.protectedGate === true };
}

function normalizeRevocationSnapshot(input = {}) {
  const snapshotRef = text(input.snapshotRef, 500);
  const verified = instant(input.verifiedAt);
  const verifierId = text(input.verifierId, 200);
  const verifierLineageRef = text(input.verifierLineageRef, 500);
  if (!snapshotRef || !verified || !verifierId || !verifierLineageRef) return null;
  const components = [];
  for (const raw of Array.isArray(input.components) ? input.components : []) {
    const componentId = text(raw?.componentId, 200);
    const revision = text(raw?.revision, 300);
    const evidenceRef = text(raw?.evidenceRef, 500);
    if (!componentId || !revision || !evidenceRef) return null;
    components.push({ componentId, revision, evidenceRef, revoked: raw?.revoked === true });
  }
  if (!components.length) return null;
  return { snapshotRef, verifiedAt: verified.raw, verifiedAtMs: verified.ms, verifierId, verifierLineageRef, components };
}

/**
 * C13-B parent tribunal for one exact compound-intelligence candidate.
 * Existing C03 evaluator/transfer/retention organs remain authoritative for
 * their own concerns; this binds them and adds system-level anti-gaming laws.
 * A pass never promotes, deploys or establishes AGI/ASI.
 */
export function evaluateCompoundIntelligence({
  compositionId = null,
  compositionRevision = null,
  components = [],
  claimedIndependentVotes = 0,
  evaluationSubjectDigest = null,
  independentEvaluation = null,
  baselineSelection = null,
  currentSystemId = null,
  currentSystemRevision = null,
  minimumMeaningfulGain = 0.05,
  maxAllowedRegression = 0.02,
  families = [],
  freshContextRetention = null,
  revocationSnapshot = null,
  observedAt = null,
  maxRevocationAgeMs = 3_600_000,
  decisionPolicy = null
} = {}) {
  const id = text(compositionId, 200);
  const revision = text(compositionRevision, 300);
  const currentId = text(currentSystemId, 200);
  const currentRevision = text(currentSystemRevision, 300);
  const minGain = number(minimumMeaningfulGain, 0, 1);
  const maxRegression = number(maxAllowedRegression, 0, 1);
  const claimedVotes = integer(claimedIndependentVotes, 0, 10_000);
  const observed = instant(observedAt);
  const revocationAgeLimit = integer(maxRevocationAgeMs, 1, 31_536_000_000);
  if (!id || !revision || !currentId || !currentRevision || minGain === null || maxRegression === null || claimedVotes === null || !observed || revocationAgeLimit === null) {
    return fail('COMPOUND_INTELLIGENCE_PROTOCOL_INVALID', ['composition-current-system-thresholds-and-observation-time-required']);
  }

  const normalizedComponents = [];
  for (const raw of Array.isArray(components) ? components : []) {
    const component = normalizeComponent(raw);
    if (!component) return fail('COMPOUND_INTELLIGENCE_PROTOCOL_INVALID', ['valid-component-identities-required']);
    normalizedComponents.push(component);
  }
  if (normalizedComponents.length < 2) return fail('COMPOUND_INTELLIGENCE_PROTOCOL_INVALID', ['at-least-two-components-required']);
  if (new Set(normalizedComponents.map(row => row.componentId)).size !== normalizedComponents.length) return fail('COMPOSITION_IDENTITY_REFUSED', ['duplicate-component-id']);
  const revokedDeclared = normalizedComponents.filter(row => row.capabilityState === 'REVOKED');
  if (revokedDeclared.length) return fail('COMPOSITION_REVOKED', ['revoked-component-cannot-enter-composition'], { revokedComponents: revokedDeclared.map(row => row.componentId) });

  const voters = normalizedComponents.filter(row => row.countsAsIndependentVote);
  if (claimedVotes !== voters.length) return fail('COMPOSITION_INDEPENDENCE_REFUSED', ['claimed-independent-vote-count-mismatch']);
  if (new Set(voters.map(row => row.lineageRef)).size !== voters.length) return fail('COMPOSITION_INDEPENDENCE_REFUSED', ['correlated-lineage-cannot-multiply-independent-votes']);

  const canonicalComposition = {
    compositionId: id,
    revision,
    components: [...normalizedComponents].sort((a, b) => a.componentId.localeCompare(b.componentId))
  };
  const compositionDigest = hash(canonicalComposition);
  if (text(evaluationSubjectDigest, 64)?.toLowerCase() !== compositionDigest) return fail('COMPOSITION_IDENTITY_REFUSED', ['evaluation-subject-digest-must-bind-exact-composition'], { compositionDigest });

  if (independentEvaluation?.generatorId !== id || independentEvaluation?.generatorLineageRef !== `composition:${compositionDigest}`) return fail('EVALUATION_BINDING_REFUSED', ['evaluator-protocol-must-name-exact-composition-and-digest']);
  const componentIds = new Set(normalizedComponents.map(row => row.componentId));
  const componentLineages = new Set(normalizedComponents.map(row => row.lineageRef));
  if (componentIds.has(independentEvaluation?.evaluatorId) || componentLineages.has(independentEvaluation?.evaluatorLineageRef)) return fail('EVALUATION_BINDING_REFUSED', ['evaluator-must-be-independent-of-every-composition-component']);
  const evaluation = compileIndependentEvaluation(independentEvaluation || {});
  if (!evaluation.ok) return fail('EVALUATION_BINDING_REFUSED', ['independent-evaluation-protocol-required', ...(evaluation.reasonCodes || [])], { evaluation });

  const baseline = normalizeBaseline(baselineSelection || {});
  if (!baseline) return fail('BASELINE_SELECTION_INVALID', ['evaluator-predeclared-baseline-selection-required']);
  const eligibleAccessible = baseline.alternatives.filter(row => row.accessible && row.eligible);
  const selected = eligibleAccessible.find(row => row.id === baseline.selectedBaselineId && row.revision === baseline.selectedRevision);
  if (!selected) return fail('BASELINE_SELECTION_REFUSED', ['selected-baseline-must-be-accessible-and-eligible']);
  if (selected.strengthRank !== Math.max(...eligibleAccessible.map(row => row.strengthRank))) return fail('BASELINE_SELECTION_REFUSED', ['strongest-accessible-eligible-baseline-required']);

  const familyRows = [];
  const budgetViolations = [];
  const intervalViolations = [];
  for (const raw of Array.isArray(families) ? families : []) {
    const row = normalizeFamily(raw);
    if (!row) return fail('COMPOUND_INTELLIGENCE_PROTOCOL_INVALID', ['valid-family-observed-evidence-system-budget-and-uncertainty-arms-required']);
    if (row.baseline.systemId !== baseline.selectedBaselineId || row.baseline.revision !== baseline.selectedRevision) return fail('BASELINE_SELECTION_REFUSED', ['family-baseline-does-not-match-selected-baseline'], { familyId: row.familyId });
    if (row.current.systemId !== currentId || row.current.revision !== currentRevision) return fail('CURRENT_SYSTEM_BINDING_REFUSED', ['family-current-arm-does-not-match-declared-current-system'], { familyId: row.familyId });
    if (row.candidate.systemId !== id || row.candidate.revision !== revision) return fail('COMPOSITION_IDENTITY_REFUSED', ['family-candidate-arm-does-not-match-exact-composition'], { familyId: row.familyId });

    const wallTimes = [row.baseline.wallTimeMs, row.current.wallTimeMs, row.candidate.wallTimeMs];
    const costs = [row.baseline.monetaryCostMicros, row.current.monetaryCostMicros, row.candidate.monetaryCostMicros];
    const human = [row.baseline.humanAssistanceMinutes, row.current.humanAssistanceMinutes, row.candidate.humanAssistanceMinutes];
    if (new Set(wallTimes).size !== 1) budgetViolations.push({ familyId: row.familyId, reason: 'wall-time-budget-mismatch', values: wallTimes });
    if (new Set(costs).size !== 1) budgetViolations.push({ familyId: row.familyId, reason: 'monetary-cost-budget-mismatch', values: costs });
    if (new Set(human).size !== 1) budgetViolations.push({ familyId: row.familyId, reason: 'human-assistance-budget-mismatch', values: human });

    row.robustGainVsCurrent = row.candidate.scoreInterval.low - row.current.scoreInterval.high;
    if (row.protectedGate && row.candidate.scoreInterval.low < row.current.scoreInterval.low) intervalViolations.push({ familyId: row.familyId, reason: 'protected-gate-uncertainty-regression', current: row.current.scoreInterval, candidate: row.candidate.scoreInterval });
    familyRows.push(row);
  }
  if (familyRows.length < 3 || new Set(familyRows.map(row => row.familyId)).size !== familyRows.length) return fail('COMPOUND_INTELLIGENCE_PROTOCOL_INVALID', ['at-least-three-unique-task-families-required']);
  if (budgetViolations.length) return fail('COMPOUND_BUDGET_MISMATCH', ['matched-time-cost-and-human-assistance-budget-required'], { budgetViolations });
  if (intervalViolations.length) return fail('COMPOUND_UNCERTAINTY_REFUSED', ['protected-gate-uncertainty-regression-zero-tolerance'], { intervalViolations });

  const transfer = evaluateCrossDomainTransfer({
    experimentId: independentEvaluation.experimentId,
    evaluatorContractHash: evaluation.contractHash,
    holdoutProtocolHash: evaluation.holdoutSetHash,
    minimumMeaningfulGain: minGain,
    maxAllowedRegression: maxRegression,
    families
  });
  if (!transfer.ok || transfer.supported !== true) return fail('COMPOUND_TRANSFER_NOT_SUPPORTED', ['cross-domain-transfer-support-required', ...(transfer.reasonCodes || [])], { transfer });

  const robustImproved = familyRows.filter(row => row.robustGainVsCurrent >= minGain).length;
  const requiredRobustImproved = Math.ceil(familyRows.length * 2 / 3);
  if (robustImproved < requiredRobustImproved) return fail('COMPOUND_UNCERTAINTY_REFUSED', ['interval-robust-cross-domain-gain-not-supported'], {
    robustImprovedFamilies: robustImproved,
    requiredRobustImprovedFamilies: requiredRobustImproved,
    robustOutcomes: familyRows.map(row => ({ familyId: row.familyId, robustGainVsCurrent: row.robustGainVsCurrent }))
  });

  if (freshContextRetention?.mechanism?.mechanismId !== id || freshContextRetention?.mechanism?.revision !== revision) return fail('RETENTION_BINDING_REFUSED', ['fresh-context-retention-must-bind-exact-composition-revision']);
  const retention = compileFreshContextRetention(freshContextRetention || {});
  if (!retention.ok) return fail('RETENTION_BINDING_REFUSED', ['fresh-context-retention-required', ...(retention.reasonCodes || [])], { retention });

  const revocation = normalizeRevocationSnapshot(revocationSnapshot || {});
  if (!revocation) return fail('REVOCATION_SNAPSHOT_INVALID', ['fresh-independently-evidenced-revocation-snapshot-required']);
  if (componentIds.has(revocation.verifierId) || componentLineages.has(revocation.verifierLineageRef) || revocation.verifierId === independentEvaluation.evaluatorId || revocation.verifierLineageRef === independentEvaluation.evaluatorLineageRef) return fail('REVOCATION_SNAPSHOT_REFUSED', ['revocation-verifier-must-be-independent-of-components-and-evaluator']);
  const ageMs = observed.ms - revocation.verifiedAtMs;
  if (ageMs < 0) return fail('REVOCATION_SNAPSHOT_REFUSED', ['future-dated-revocation-snapshot-refused']);
  if (ageMs > revocationAgeLimit) return fail('REVOCATION_SNAPSHOT_REFUSED', ['stale-revocation-snapshot-refused'], { ageMs, maxRevocationAgeMs: revocationAgeLimit });

  const expectedKeys = normalizedComponents.map(row => `${row.componentId}@${row.revision}`).sort();
  const actualKeys = revocation.components.map(row => `${row.componentId}@${row.revision}`).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) return fail('REVOCATION_SNAPSHOT_REFUSED', ['revocation-snapshot-must-cover-exact-composition-components']);
  const revokedObserved = revocation.components.filter(row => row.revoked);
  if (revokedObserved.length) return fail('COMPOSITION_REVOKED', ['observed-revoked-component-invalidates-composition'], { revokedComponents: revokedObserved.map(row => row.componentId) });

  if (decisionPolicy?.abstainOnInsufficientEvidence !== true || decisionPolicy?.noRecommendationOnValueBoundary !== true) return fail('DECISION_POLICY_REFUSED', ['abstention-and-value-boundary-refusal-required']);
  const escalationBudgetRef = text(decisionPolicy?.escalationBudgetRef, 500);
  const maxEscalationSteps = integer(decisionPolicy?.maxEscalationSteps, 0, 1000);
  if (!escalationBudgetRef || maxEscalationSteps === null) return fail('DECISION_POLICY_REFUSED', ['bounded-escalation-policy-required']);

  const receipt = {
    version: COMPOUND_INTELLIGENCE_EVALUATION_VERSION,
    compositionDigest,
    compositionId: id,
    compositionRevision: revision,
    componentRevisions: canonicalComposition.components.map(row => ({ componentId: row.componentId, revision: row.revision, lineageRef: row.lineageRef })),
    claimedIndependentVotes: claimedVotes,
    evaluatorContractHash: evaluation.contractHash,
    holdoutSetHash: evaluation.holdoutSetHash,
    baseline: { id: baseline.selectedBaselineId, revision: baseline.selectedRevision, evidenceRef: baseline.selectionEvidenceRef },
    currentSystem: { id: currentId, revision: currentRevision },
    familyMeasurements: familyRows.map(row => ({ familyId: row.familyId, taskSetHash: row.taskSetHash, measurementEvidenceRef: row.measurementEvidenceRef })),
    transferReceiptHash: transfer.receiptHash,
    retentionReceiptHash: retention.receiptHash,
    revocationSnapshotRef: revocation.snapshotRef,
    revocationVerifier: { id: revocation.verifierId, lineageRef: revocation.verifierLineageRef },
    observedAt: observed.raw,
    revocationEvidenceAgeMs: ageMs,
    minimumMeaningfulGain: minGain,
    maxAllowedRegression: maxRegression,
    robustImprovedFamilies: robustImproved,
    requiredRobustImprovedFamilies: requiredRobustImproved,
    decisionPolicy: { escalationBudgetRef, maxEscalationSteps, abstainOnInsufficientEvidence: true, noRecommendationOnValueBoundary: true }
  };

  return {
    ok: true,
    version: COMPOUND_INTELLIGENCE_EVALUATION_VERSION,
    status: 'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE',
    compositionDigest,
    receipt,
    receiptHash: hash(receipt),
    transfer,
    retention,
    evidenceStage: 'FRESH_CONTEXT_REPRODUCED_WITH_CROSS_DOMAIN_TRANSFER_SUPPORT',
    evidenceTruth: 'REFERENCED_OBSERVED_EVALUATION_RECORDS_REQUIRED__THIS_PURE_COMPILER_DOES_NOT_WITNESS_THEIR_EXECUTION',
    generalityClaim: 'WITHHELD__DEFINED_TASK_POPULATION_ONLY',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    promotionBoundary: 'EVALUATION_DOES_NOT_PROMOTE_ROUTE_DEPLOY_OR_AUTHORIZE_THE_COMPOSITION',
    authorityBoundary: 'CAPABILITY_EVIDENCE_NEVER_CREATES_EFFECT_AUTHORITY',
    businessEffectAuthority: 'NONE',
    promotionAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
