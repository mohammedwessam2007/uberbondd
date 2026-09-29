import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { TASK_FAMILIES } from './nullstar-omega-holdout.mjs';
import { compileIndependentEvaluation } from './transfer-evaluation-governor.mjs';
import {
  APEX_ARCHITECTURE_CLASSES,
  APEX_TOURNAMENT_CLAIM_MODES,
  apexManifestCorpusDigest,
  apexManifestCommitmentDigest,
  validateApexHoldoutCommitment,
  evaluateSealedArchitectureTournament
} from './apex-sealed-tournament.mjs';

export const APEX_FRESH_HOLDOUT_CUSTODY_VERSION = 'uberbond.apex-fresh-holdout-custody.v1';
export const APEX_FRESH_EVIDENCE_PURPOSES = Object.freeze(['SCREENING', 'CONFIRMATORY']);

const SHA40 = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const forbiddenRawKeys = new Set(['prompt', 'answer', 'salt', 'seed', 'solution', 'rawtask', 'rawholdout', 'rawprompt', 'rawanswer']);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return {
    policyVersion: APEX_FRESH_HOLDOUT_CUSTODY_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}
function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function timestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function uniqueText(values = [], max = 2000) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, max)).filter(Boolean))].sort();
}
function hiddenRawFieldPaths(value, path = '$', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    const normalized = String(key).toLowerCase().replace(/[^a-z]/g, '');
    if (forbiddenRawKeys.has(normalized)) out.push(`${path}.${key}`);
    if (child && typeof child === 'object') hiddenRawFieldPaths(child, `${path}.${key}`, out);
  }
  return out;
}

function normalizeActor(raw, label) {
  const id = text(raw?.id, 200);
  const lineageRef = text(raw?.lineageRef, 1000);
  const contextRef = text(raw?.contextRef, 1000);
  const evidenceRefs = uniqueText(raw?.evidenceRefs, 1000);
  const reasons = [];
  if (!id || !lineageRef || !contextRef) reasons.push(`${label}-identity-lineage-context-required`);
  if (!evidenceRefs.length) reasons.push(`${label}-evidence-refs-required`);
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    actor: { id, lineageRef, contextRef, evidenceRefs }
  };
}

function normalizeArchitectureCohort(raw = [], { claimMode = 'TASK_CLASS', minimumPublicBaselines = 3 } = {}) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 32) return { ok: false, reasonCodes: ['two-to-32-frozen-architectures-required'] };
  const rows = [];
  const ids = new Set();
  const reasons = [];
  for (const [index, item] of raw.entries()) {
    const architectureId = text(item?.architectureId, 200)?.toLowerCase();
    const architectureClass = text(item?.architectureClass, 80)?.toUpperCase();
    const architectureDigest = text(item?.architectureDigest, 128)?.toLowerCase();
    const architectureRevision = text(item?.architectureRevision, 240);
    const architectureSourceRef = text(item?.architectureSourceRef, 1200);
    const reproductionEvidenceRef = item?.reproductionEvidenceRef == null ? null : text(item.reproductionEvidenceRef, 1200);
    if (!architectureId || ids.has(architectureId)) reasons.push(`architecture-${index}:unique-id-required`);
    else ids.add(architectureId);
    if (!APEX_ARCHITECTURE_CLASSES.includes(architectureClass)) reasons.push(`architecture-${index}:recognized-class-required`);
    if (!architectureDigest || !SHA256.test(architectureDigest) || !architectureRevision || !architectureSourceRef) reasons.push(`architecture-${index}:frozen-digest-revision-source-required`);
    if (architectureClass === 'PUBLIC_BASELINE' && !reproductionEvidenceRef) reasons.push(`architecture-${index}:public-baseline-reproduction-evidence-required`);
    rows.push({ architectureId, architectureClass, architectureDigest, architectureRevision, architectureSourceRef, reproductionEvidenceRef });
  }
  if (!rows.some(row => row.architectureClass === 'INCUMBENT')) reasons.push('incumbent-architecture-required');
  if (!rows.some(row => row.architectureClass === 'CHALLENGER')) reasons.push('challenger-architecture-required');
  const publicBaselines = rows.filter(row => row.architectureClass === 'PUBLIC_BASELINE').length;
  if (claimMode === 'PUBLIC_FRONTIER' && publicBaselines < minimumPublicBaselines) reasons.push('frozen-public-baseline-floor-not-met');
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    rows,
    publicBaselines,
    cohortDigest: digest(rows)
  };
}

export function compileApexFreshHoldoutRequest({
  campaignId,
  candidateRevision,
  architectureFrozenAt,
  architectureCohort = [],
  taskClass,
  taskFamilies = [],
  tasksPerFamily,
  evidencePurpose = 'CONFIRMATORY',
  claimMode = 'TASK_CLASS',
  minimumPublicBaselines = 3,
  optimizer,
  evaluator,
  developmentCaseIds = [],
  candidateExposedCaseIds = [],
  rubricRef
} = {}, { now = new Date() } = {}) {
  const id = text(campaignId, 200)?.toLowerCase();
  const revision = text(candidateRevision, 80)?.toLowerCase();
  const frozenAt = timestamp(architectureFrozenAt);
  const klass = text(taskClass, 160)?.toLowerCase();
  const purpose = text(evidencePurpose, 40)?.toUpperCase();
  const mode = text(claimMode, 80)?.toUpperCase();
  const perFamily = integer(tasksPerFamily, 1, 1000);
  const minPublic = integer(minimumPublicBaselines, 1, 32);
  const families = uniqueText(taskFamilies, 120).map(value => value.toUpperCase());
  const devCases = uniqueText(developmentCaseIds, 300);
  const exposedCases = uniqueText(candidateExposedCaseIds, 300);
  const rubric = text(rubricRef, 1000);
  const optimizerActor = normalizeActor(optimizer, 'optimizer');
  const evaluatorActor = normalizeActor(evaluator, 'evaluator');
  const reasons = [];

  if (!id || !revision || !SHA40.test(revision) || !frozenAt || !klass) reasons.push('campaign-exact-source-freeze-required');
  if (frozenAt && Date.parse(frozenAt) > now.getTime() + 60_000) reasons.push('future-architecture-freeze-prohibited');
  if (!APEX_FRESH_EVIDENCE_PURPOSES.includes(purpose)) reasons.push('recognized-evidence-purpose-required');
  if (!APEX_TOURNAMENT_CLAIM_MODES.includes(mode)) reasons.push('recognized-claim-mode-required');
  if (minPublic == null || perFamily == null) reasons.push('bounded-family-and-baseline-counts-required');
  if (!families.length || families.some(family => !TASK_FAMILIES.includes(family))) reasons.push('recognized-task-families-required');
  if (!rubric || !devCases.length) reasons.push('predeclared-rubric-and-development-cases-required');
  if (!optimizerActor.ok) reasons.push(...optimizerActor.reasonCodes);
  if (!evaluatorActor.ok) reasons.push(...evaluatorActor.reasonCodes);
  if (optimizerActor.ok && evaluatorActor.ok) {
    if (optimizerActor.actor.id === evaluatorActor.actor.id) reasons.push('optimizer-evaluator-id-must-differ');
    if (optimizerActor.actor.lineageRef === evaluatorActor.actor.lineageRef) reasons.push('optimizer-evaluator-lineage-must-differ');
    if (optimizerActor.actor.contextRef === evaluatorActor.actor.contextRef) reasons.push('optimizer-evaluator-context-must-differ');
    const evaluatorEvidence = new Set(evaluatorActor.actor.evidenceRefs);
    if (optimizerActor.actor.evidenceRefs.some(ref => evaluatorEvidence.has(ref))) reasons.push('optimizer-evaluator-evidence-ancestry-must-differ');
  }

  const familyCount = families.length;
  const expectedTaskCount = perFamily == null ? null : familyCount * perFamily;
  if (purpose === 'SCREENING' && (familyCount < 4 || expectedTaskCount < 24)) reasons.push('screening-requires-at-least-four-families-and-24-tasks');
  if (purpose === 'CONFIRMATORY' && (familyCount < 8 || expectedTaskCount < 96)) reasons.push('confirmatory-requires-at-least-eight-families-and-96-tasks');
  if (mode === 'PUBLIC_FRONTIER' && purpose !== 'CONFIRMATORY') reasons.push('public-frontier-requires-confirmatory-evidence');

  const cohort = normalizeArchitectureCohort(architectureCohort, { claimMode: mode, minimumPublicBaselines: minPublic || 3 });
  if (!cohort.ok) reasons.push(...cohort.reasonCodes);
  if (reasons.length) return fail('APEX_FRESH_HOLDOUT_REQUEST_REFUSED', reasons);

  const requestCore = {
    schemaVersion: 'uberbond.apex-fresh-holdout-request.v1',
    campaignId: id,
    candidateRevision: revision,
    sourceFreezeRef: `github:mohammedwessam2007/uberbondd@${revision}`,
    architectureFrozenAt: frozenAt,
    architectureCohort: cohort.rows,
    architectureCohortDigest: cohort.cohortDigest,
    taskClass: klass,
    taskFamilies: families,
    tasksPerFamily: perFamily,
    expectedTaskCount,
    evidencePurpose: purpose,
    claimMode: mode,
    minimumPublicBaselines: minPublic,
    optimizer: optimizerActor.actor,
    evaluator: evaluatorActor.actor,
    developmentCaseIds: devCases,
    candidateExposedCaseIds: exposedCases,
    rubricRef: rubric,
    requiredSuiteVersionPrefix: `apex-fresh:${id}:`,
    custodyRequirements: {
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      evaluatorIndependent: true,
      seedSaltPromptAnswerReturnProhibited: true
    }
  };
  const requestDigest = digest(requestCore);
  return envelope({
    ok: true,
    status: 'APEX_FRESH_HOLDOUT_REQUEST_FROZEN',
    request: requestCore,
    requestDigest,
    tournamentAdmissionAuthority: purpose === 'CONFIRMATORY' ? 'ELIGIBLE_AFTER_FRESH_CUSTODY_ADMISSION' : 'SCREENING_ONLY',
    rawHoldoutStorageAuthority: 'EXTERNAL_INDEPENDENT_CUSTODIAN_ONLY',
    promotionAuthority: 'NONE',
    truthBoundary: 'THIS FREEZES THE EVALUATION REQUEST AND ARCHITECTURE COHORT BEFORE HOLDOUT ADMISSION. IT DOES NOT GENERATE, SEE OR SCORE THE HIDDEN TASKS.'
  });
}

function validateContaminationRegistry(registry = {}) {
  const reasons = [];
  if (registry?.schemaVersion !== 'uberbond.apex-evidence-contamination-registry.v1') reasons.push('contamination-registry-schema-required');
  const suites = new Set((registry?.prohibitedSuiteVersions || []).map(row => text(row?.suiteVersion, 200)).filter(Boolean));
  const corpora = new Set((registry?.prohibitedCorpusDigests || []).map(row => text(row?.digest, 128)?.toLowerCase()).filter(Boolean));
  const commitments = new Set((registry?.prohibitedCommitmentRefs || []).map(row => text(row?.commitmentRef, 1200)).filter(Boolean));
  return reasons.length ? { ok: false, reasonCodes: reasons } : { ok: true, suites, corpora, commitments };
}

export function admitApexFreshHoldout({
  frozenRequest,
  requestDigest,
  suiteVersion,
  sealedManifest = [],
  holdoutCommitment,
  contaminationRegistry
} = {}, { now = new Date() } = {}) {
  const request = frozenRequest;
  const reasons = [];
  if (!request || request?.schemaVersion !== 'uberbond.apex-fresh-holdout-request.v1') reasons.push('frozen-request-required');
  const observedRequestDigest = request ? digest(request) : null;
  if (!requestDigest || observedRequestDigest !== requestDigest) reasons.push('frozen-request-digest-mismatch');
  const suite = text(suiteVersion, 240);
  if (!suite || !suite.startsWith(request?.requiredSuiteVersionPrefix || '__missing__')) reasons.push('fresh-suite-version-prefix-required');
  if (!Array.isArray(sealedManifest) || !sealedManifest.length) reasons.push('sealed-manifest-required');

  const registry = validateContaminationRegistry(contaminationRegistry);
  if (!registry.ok) reasons.push(...registry.reasonCodes);
  const secretPaths = hiddenRawFieldPaths({ holdoutCommitment, sealedManifest });
  if (secretPaths.length) reasons.push('raw-seed-salt-prompt-answer-material-prohibited');

  const familyCounts = Object.fromEntries((request?.taskFamilies || []).map(family => [family, 0]));
  const seenTaskIds = new Set();
  for (const [index, row] of (Array.isArray(sealedManifest) ? sealedManifest : []).entries()) {
    const taskId = text(row?.taskId, 200);
    const family = text(row?.family, 120)?.toUpperCase();
    const tier = text(row?.tier, 40);
    const answerDigest = text(row?.answerDigest, 128);
    const difficulty = Number(row?.difficulty);
    if (!taskId || seenTaskIds.has(taskId)) reasons.push(`manifest-${index}:unique-task-id-required`);
    else seenTaskIds.add(taskId);
    if (!Object.hasOwn(familyCounts, family)) reasons.push(`manifest-${index}:family-not-in-frozen-request`);
    else familyCounts[family] += 1;
    if (tier !== 'SEALED_HOLDOUT') reasons.push(`manifest-${index}:sealed-tier-required`);
    if (!answerDigest || !SHA256.test(answerDigest)) reasons.push(`manifest-${index}:answer-digest-required`);
    if (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 1) reasons.push(`manifest-${index}:difficulty-required`);
  }
  if (sealedManifest.length !== request?.expectedTaskCount) reasons.push('exact-frozen-task-count-required');
  for (const family of request?.taskFamilies || []) {
    if (familyCounts[family] !== request.tasksPerFamily) reasons.push(`family-quota-mismatch:${family}`);
  }
  if (reasons.length) return fail('APEX_FRESH_HOLDOUT_ADMISSION_REFUSED', reasons, { secretPaths });

  const corpusDigest = apexManifestCorpusDigest(sealedManifest);
  const manifestDigest = apexManifestCommitmentDigest(sealedManifest);
  const commitment = validateApexHoldoutCommitment(holdoutCommitment, {
    suiteVersion: suite,
    corpusDigest,
    manifestDigest,
    taskCount: sealedManifest.length
  });
  if (!commitment.ok) reasons.push(...commitment.reasonCodes);

  if (registry.suites.has(suite)) reasons.push('retired-or-evaluated-suite-reuse-prohibited');
  if (registry.corpora.has(corpusDigest.toLowerCase())) reasons.push('retired-or-evaluated-corpus-reuse-prohibited');
  if (registry.commitments.has(holdoutCommitment?.commitmentRef)) reasons.push('retired-evaluated-or-voided-commitment-reuse-prohibited');
  if (holdoutCommitment?.sourceFreezeRef !== request.sourceFreezeRef) reasons.push('holdout-source-freeze-must-match-request');
  if (holdoutCommitment?.evaluatorRef !== request.evaluator.id) reasons.push('holdout-evaluator-must-match-frozen-evaluator');
  const committedAt = timestamp(holdoutCommitment?.committedAt);
  if (committedAt && Date.parse(committedAt) < Date.parse(request.architectureFrozenAt)) reasons.push('holdout-commitment-must-follow-architecture-freeze');
  if (committedAt && Date.parse(committedAt) > now.getTime() + 60_000) reasons.push('future-holdout-commitment-prohibited');

  const independence = compileIndependentEvaluation({
    experimentId: request.campaignId,
    generatorId: request.optimizer.id,
    evaluatorId: request.evaluator.id,
    generatorLineageRef: request.optimizer.lineageRef,
    evaluatorLineageRef: request.evaluator.lineageRef,
    generatorContextRef: request.optimizer.contextRef,
    evaluatorContextRef: request.evaluator.contextRef,
    developmentCaseIds: request.developmentCaseIds,
    holdoutCaseIds: sealedManifest.map(row => row.taskId),
    candidateExposedCaseIds: request.candidateExposedCaseIds,
    generatorEvidenceRefs: request.optimizer.evidenceRefs,
    evaluatorEvidenceRefs: request.evaluator.evidenceRefs,
    rubricOwner: 'EVALUATOR_PREDECLARED',
    rubricRef: request.rubricRef
  });
  if (!independence.ok) reasons.push(...(independence.reasonCodes || ['independent-evaluation-protocol-refused']));
  if (reasons.length) return fail('APEX_FRESH_HOLDOUT_ADMISSION_REFUSED', reasons);

  const admissionCore = {
    schemaVersion: 'uberbond.apex-fresh-holdout-admission.v1',
    campaignId: request.campaignId,
    requestDigest,
    candidateRevision: request.candidateRevision,
    sourceFreezeRef: request.sourceFreezeRef,
    architectureFrozenAt: request.architectureFrozenAt,
    architectureCohort: request.architectureCohort,
    architectureCohortDigest: request.architectureCohortDigest,
    evidencePurpose: request.evidencePurpose,
    claimMode: request.claimMode,
    minimumPublicBaselines: request.minimumPublicBaselines,
    taskClass: request.taskClass,
    suiteVersion: suite,
    corpusDigest,
    manifestDigest,
    taskCount: sealedManifest.length,
    familyCounts,
    holdoutCommitment: commitment.commitment,
    independenceContractHash: independence.contractHash,
    holdoutSetHash: independence.holdoutSetHash
  };
  return envelope({
    ok: true,
    status: 'APEX_FRESH_HOLDOUT_ADMITTED',
    admission: admissionCore,
    admissionDigest: digest(admissionCore),
    sealedManifest: structuredClone(sealedManifest),
    optimizerVisibleBeforeRun: {
      campaignId: request.campaignId,
      architectureCohortDigest: request.architectureCohortDigest,
      taskClass: request.taskClass,
      suiteVersion: suite,
      taskCount: sealedManifest.length,
      familyCounts,
      corpusDigest,
      manifestDigest
    },
    rawHoldoutStorageAuthority: 'EXTERNAL_INDEPENDENT_CUSTODIAN_ONLY',
    tournamentAdmissionAuthority: request.evidencePurpose === 'CONFIRMATORY' ? 'ELIGIBLE_FOR_FRESH_SEALED_TOURNAMENT' : 'SCREENING_ONLY',
    promotionAuthority: 'NONE',
    truthBoundary: 'ADMISSION PROVES BINDING, DECLARED INDEPENDENCE AND NONREUSE AGAINST THE KNOWN CONTAMINATION REGISTRY. IT DOES NOT PROVE THE EXTERNAL CUSTODIAN ACTUALLY KEPT TASK CONTENT SECRET.'
  });
}

export function evaluateFreshApexCampaign({
  admission,
  trials = [],
  incumbentArchitectureId,
  budgetPolicy,
  minimumSampleSize = 20,
  qualityFloorDelta = 0.01
} = {}) {
  if (!admission?.ok || admission?.status !== 'APEX_FRESH_HOLDOUT_ADMITTED' || !admission?.admission) {
    return fail('APEX_FRESH_CAMPAIGN_REFUSED', ['fresh-holdout-admission-required']);
  }
  const frozen = admission.admission;
  if (frozen.evidencePurpose !== 'CONFIRMATORY') return fail('APEX_FRESH_CAMPAIGN_REFUSED', ['confirmatory-admission-required']);
  if (!Array.isArray(trials) || trials.length !== frozen.architectureCohort.length) {
    return fail('APEX_FRESH_CAMPAIGN_REFUSED', ['complete-frozen-architecture-cohort-required']);
  }

  const byId = new Map(frozen.architectureCohort.map(row => [row.architectureId, row]));
  const reasons = [];
  const seen = new Set();
  for (const [index, trial] of trials.entries()) {
    const id = text(trial?.architectureId, 200)?.toLowerCase();
    const expected = byId.get(id);
    if (!id || seen.has(id) || !expected) reasons.push(`trial-${index}:frozen-architecture-membership-required`);
    else seen.add(id);
    if (!trial?.ok || trial?.status !== 'SEALED_ARCHITECTURE_TRIAL_COMPILED') reasons.push(`trial-${index}:compiled-sealed-trial-required`);
    if (trial?.suiteVersion !== frozen.suiteVersion) reasons.push(`trial-${index}:suite-mismatch`);
    if (trial?.corpusDigest !== frozen.corpusDigest) reasons.push(`trial-${index}:corpus-mismatch`);
    if (trial?.manifestDigest !== frozen.manifestDigest) reasons.push(`trial-${index}:manifest-mismatch`);
    if (trial?.holdoutCommitment?.commitmentRef !== frozen.holdoutCommitment.commitmentRef) reasons.push(`trial-${index}:commitment-mismatch`);
    if (expected && (
      trial?.architectureIdentity?.architectureClass !== expected.architectureClass
      || trial?.architectureIdentity?.architectureDigest !== expected.architectureDigest
      || trial?.architectureIdentity?.architectureRevision !== expected.architectureRevision
      || trial?.architectureIdentity?.architectureSourceRef !== expected.architectureSourceRef
      || (expected.architectureClass === 'PUBLIC_BASELINE' && trial?.architectureIdentity?.reproductionEvidenceRef !== expected.reproductionEvidenceRef)
    )) reasons.push(`trial-${index}:frozen-architecture-identity-mismatch`);
  }
  if (seen.size !== frozen.architectureCohort.length) reasons.push('every-frozen-architecture-must-appear-once');
  if (reasons.length) return fail('APEX_FRESH_CAMPAIGN_REFUSED', reasons);

  const result = evaluateSealedArchitectureTournament({
    trials,
    incumbentArchitectureId,
    claimMode: frozen.claimMode,
    minimumPublicBaselines: frozen.minimumPublicBaselines,
    budgetPolicy,
    minimumSampleSize,
    qualityFloorDelta
  });
  if (!result.ok) return result;
  return envelope({
    ...result,
    status: `FRESH_${result.status}`,
    freshCampaignAdmissionDigest: admission.admissionDigest,
    architectureCohortDigest: frozen.architectureCohortDigest,
    globalRankAuthority: 'NONE',
    promotionAuthority: 'NONE',
    productionActivationAuthorized: false,
    truthBoundary: 'THIS RESULT IS BOUND TO A FROZEN ARCHITECTURE COHORT AND A FRESH ADMITTED HOLDOUT. IT STILL ESTABLISHES ONLY THE DECLARED REVIEWED SET AND REQUIRES INDEPENDENT REPLICATION BEFORE ANY PROMOTION.'
  });
}
