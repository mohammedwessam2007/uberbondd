import crypto from 'node:crypto';
import { compileInstitutionCell } from './institution-cell-compiler.mjs';
import { compileProofDag, assertObservedProof } from './content-addressed-proof-dag.mjs';

export const SOVEREIGN_INSTITUTIONAL_HARNESS_VERSION = 'uberbond.sovereign-institutional-harness.v1';

export const HARNESS_PHASES = Object.freeze([
  'SPECIFICATION',
  'ARCHITECTURE',
  'PLAN',
  'BUILD',
  'REVIEW',
  'SHIP'
]);

export const ARTICLE_DISCIPLINES = Object.freeze([
  'CONDUCTOR',
  'BACKEND_ARCHITECT',
  'TEST_ENGINEER',
  'CODE_REVIEWER',
  'DATA_ENGINEER',
  'DEBUGGER',
  'FRONTEND_ENGINEER',
  'INFRA_DEVOPS_ENGINEER',
  'PERFORMANCE_OBSERVABILITY_ENGINEER',
  'SECURITY_ENGINEER'
]);

export const SOVEREIGN_DISCIPLINES = Object.freeze([
  ...ARTICLE_DISCIPLINES,
  'RISK_OFFICER',
  'ADVERSARIAL_FALSIFIER',
  'AUTHORITY_GUARD',
  'REALITY_RECONCILER'
]);

export const RUNTIME_LAYERS = Object.freeze([
  'DATA',
  'SIGNAL',
  'DECISION',
  'RISK',
  'EXECUTION',
  'MONITORING'
]);

export const SELF_IMPROVEMENT_STAGES = Object.freeze([
  'OBSERVE',
  'HYPOTHESIS',
  'CANDIDATE_PATCH',
  'SANDBOX',
  'BENCHMARK',
  'APPROVE',
  'PRODUCTION',
  'MONITOR',
  'ROLLBACK'
]);

const REVIEW_DISCIPLINES = new Set([
  'CODE_REVIEWER',
  'SECURITY_ENGINEER',
  'PERFORMANCE_OBSERVABILITY_ENGINEER',
  'RISK_OFFICER',
  'ADVERSARIAL_FALSIFIER',
  'AUTHORITY_GUARD',
  'REALITY_RECONCILER'
]);

const BUILD_DISCIPLINES = new Set([
  'BACKEND_ARCHITECT',
  'TEST_ENGINEER',
  'DATA_ENGINEER',
  'DEBUGGER',
  'FRONTEND_ENGINEER',
  'INFRA_DEVOPS_ENGINEER'
]);

const PHASE_REQUIREMENTS = Object.freeze({
  SPECIFICATION: Object.freeze([
    'mission-spec',
    'acceptance-criteria',
    'authority-envelope',
    'context-snapshot'
  ]),
  ARCHITECTURE: Object.freeze([
    'architecture',
    'interface-contracts',
    'failure-model'
  ]),
  PLAN: Object.freeze([
    'task-plan',
    'test-plan',
    'rollback-plan'
  ]),
  BUILD: Object.freeze([
    'failing-test-receipt',
    'implementation-receipt',
    'passing-test-receipt'
  ]),
  REVIEW: Object.freeze([
    'spec-verdict',
    'quality-verdict',
    'security-verdict',
    'performance-verdict',
    'adversarial-verdict'
  ]),
  SHIP: Object.freeze([
    'ci-receipt',
    'risk-verdict',
    'rollback-rehearsal',
    'release-manifest'
  ])
});

const text = (value, max = 1000) => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.length <= max ? normalized : null;
};
const num = (value, fallback = Infinity) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(v => text(v, 300)).filter(Boolean))].sort();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest = value => `sha256:${hash(value)}`;
const fail = (status, codes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(codes.filter(Boolean))],
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  ...extra
});

function normalizeRole(raw = {}) {
  return {
    discipline: text(raw.discipline, 120)?.toUpperCase() || null,
    actorRef: text(raw.actorRef, 300),
    executionInstanceRef: text(raw.executionInstanceRef, 300),
    contextRef: text(raw.contextRef, 500),
    contextIsolation: raw.contextIsolation === true,
    toolClasses: uniq(raw.toolClasses),
    evidenceRefs: uniq(raw.evidenceRefs),
    canVeto: raw.canVeto === true,
    canWidenAuthority: raw.canWidenAuthority === true,
    authority: text(raw.authority, 80)?.toUpperCase() || 'NONE'
  };
}

function normalizeArtifact(raw = {}) {
  return {
    id: text(raw.id, 200),
    type: text(raw.type, 160)?.toLowerCase() || null,
    phase: text(raw.phase, 80)?.toUpperCase() || null,
    evidenceRef: text(raw.evidenceRef, 1000),
    proofId: text(raw.proofId, 200),
    producerDiscipline: text(raw.producerDiscipline, 120)?.toUpperCase() || null,
    executionInstanceRef: text(raw.executionInstanceRef, 300),
    observed: raw.observed === true,
    synthetic: raw.synthetic === true,
    verdict: text(raw.verdict, 80)?.toUpperCase() || null,
    sequence: num(raw.sequence, Infinity),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}
  };
}

export function validateRoleLattice({ roles = [] } = {}) {
  const normalized = (Array.isArray(roles) ? roles : []).map(normalizeRole);
  const reasons = [];
  const byDiscipline = new Map();

  for (const role of normalized) {
    if (!SOVEREIGN_DISCIPLINES.includes(role.discipline)) {
      reasons.push(`unknown-discipline:${role.discipline || 'missing'}`);
      continue;
    }
    if (byDiscipline.has(role.discipline)) reasons.push(`duplicate-discipline:${role.discipline}`);
    byDiscipline.set(role.discipline, role);
    if (!role.actorRef) reasons.push(`actor-ref-required:${role.discipline}`);
    if (!role.executionInstanceRef) reasons.push(`execution-instance-required:${role.discipline}`);
    if (!role.contextRef) reasons.push(`context-ref-required:${role.discipline}`);
    if (!role.evidenceRefs.length) reasons.push(`role-evidence-required:${role.discipline}`);
  }

  for (const discipline of SOVEREIGN_DISCIPLINES) {
    if (!byDiscipline.has(discipline)) reasons.push(`discipline-required:${discipline}`);
  }

  const buildInstances = new Set([...BUILD_DISCIPLINES]
    .map(d => byDiscipline.get(d)?.executionInstanceRef)
    .filter(Boolean));

  for (const discipline of REVIEW_DISCIPLINES) {
    const role = byDiscipline.get(discipline);
    if (!role) continue;
    if (!role.contextIsolation) reasons.push(`review-context-isolation-required:${discipline}`);
    if (buildInstances.has(role.executionInstanceRef)) reasons.push(`review-instance-must-be-independent:${discipline}`);
  }

  for (const discipline of ['RISK_OFFICER', 'AUTHORITY_GUARD']) {
    const role = byDiscipline.get(discipline);
    if (!role) continue;
    if (!role.canVeto) reasons.push(`stop-the-line-veto-required:${discipline}`);
    if (role.canWidenAuthority) reasons.push(`authority-widening-forbidden:${discipline}`);
  }

  const out = {
    version: SOVEREIGN_INSTITUTIONAL_HARNESS_VERSION,
    roles: normalized,
    roleCount: normalized.length,
    sameModelAllowed: true,
    independenceLaw: 'THE_SAME_UNDERLYING_MODEL_MAY_FILL_MULTIPLE_DISCIPLINES__BUT_REVIEW_AND_AUTHORITY_GATES_REQUIRE_DISTINCT_EXECUTION_INSTANCES_AND_ISOLATED_CONTEXT',
    authorityLaw: 'CAPABILITY_NEVER_CREATES_AUTHORITY__REVIEW_RISK_AND_AUTHORITY_GUARDS_MAY_BLOCK_OR_NARROW_BUT_NEVER_WIDEN_AUTHORITY'
  };
  out.roleLatticeDigest = digest(out);
  return reasons.length
    ? fail('ROLE_LATTICE_REFUSED', reasons, out)
    : { ok: true, status: 'ROLE_LATTICE_VALID', ...out, externalEffectAuthority: 'NONE', businessEffectAuthority: 'NONE' };
}

export function evaluatePhaseGates({ artifacts = [], proofDag = null, consequentialShip = false, authorityLeaseRef = null } = {}) {
  const rows = (Array.isArray(artifacts) ? artifacts : []).map(normalizeArtifact);
  const reasons = [];
  const gates = [];
  const artifactByType = new Map();

  for (const row of rows) {
    if (!row.id || !row.type || !row.phase || !row.evidenceRef) {
      reasons.push(`artifact-identity-type-phase-evidence-required:${row.id || 'unknown'}`);
      continue;
    }
    if (!HARNESS_PHASES.includes(row.phase)) reasons.push(`valid-phase-required:${row.id}`);
    if (artifactByType.has(row.type)) reasons.push(`duplicate-artifact-type:${row.type}`);
    artifactByType.set(row.type, row);
  }

  for (const phase of HARNESS_PHASES) {
    const required = PHASE_REQUIREMENTS[phase];
    const missing = required.filter(type => !artifactByType.has(type));
    const wrongPhase = required.filter(type => artifactByType.has(type) && artifactByType.get(type).phase !== phase);
    const failingVerdicts = required
      .map(type => artifactByType.get(type))
      .filter(Boolean)
      .filter(row => row.type.endsWith('verdict') && row.verdict !== 'PASS')
      .map(row => row.type);
    gates.push({ phase, required, missing, wrongPhase, failingVerdicts, pass: missing.length === 0 && wrongPhase.length === 0 && failingVerdicts.length === 0 });
  }

  const failingTest = artifactByType.get('failing-test-receipt');
  const implementation = artifactByType.get('implementation-receipt');
  const passingTest = artifactByType.get('passing-test-receipt');
  if (failingTest && implementation && !(failingTest.sequence < implementation.sequence)) reasons.push('tdd-failing-test-must-precede-implementation');
  if (implementation && passingTest && !(implementation.sequence < passingTest.sequence)) reasons.push('implementation-must-precede-passing-test');
  if (failingTest && failingTest.metadata?.failureObserved !== true) reasons.push('failing-test-receipt-must-observe-failure');
  if (passingTest && passingTest.metadata?.passObserved !== true) reasons.push('passing-test-receipt-must-observe-pass');

  for (const type of ['spec-verdict', 'quality-verdict', 'security-verdict', 'performance-verdict', 'adversarial-verdict', 'risk-verdict']) {
    const row = artifactByType.get(type);
    if (row && row.verdict !== 'PASS') reasons.push(`blocking-verdict:${type}`);
  }

  const rollback = artifactByType.get('rollback-rehearsal');
  if (rollback && rollback.metadata?.rehearsed !== true) reasons.push('rollback-must-be-rehearsed-before-ship');

  const releaseManifest = artifactByType.get('release-manifest');
  if (releaseManifest && releaseManifest.metadata?.immutable !== true) reasons.push('release-manifest-must-be-immutable');

  if (proofDag) {
    if (!proofDag.ok || proofDag.status !== 'PROOF_DAG_COMPILED') reasons.push('valid-proof-dag-required');
    for (const row of rows.filter(row => row.observed && row.proofId)) {
      const proof = assertObservedProof({ dag: proofDag, proofId: row.proofId });
      if (!proof.ok) reasons.push(`observed-artifact-proof-refused:${row.type}`);
    }
  }

  if (consequentialShip && !text(authorityLeaseRef, 500)) reasons.push('explicit-authority-lease-required-for-consequential-ship');

  let previousPassed = true;
  for (const gate of gates) {
    if (!previousPassed && gate.pass) {
      gate.pass = false;
      gate.upstreamBlocked = true;
    }
    previousPassed = previousPassed && gate.pass;
  }

  const firstBlocked = gates.find(g => !g.pass)?.phase || null;
  const allPassed = gates.every(g => g.pass) && reasons.length === 0;
  const packet = {
    version: SOVEREIGN_INSTITUTIONAL_HARNESS_VERSION,
    gates,
    allPassed,
    firstBlocked,
    consequentialShip,
    authorityLeaseRef: consequentialShip ? text(authorityLeaseRef, 500) : null,
    transitionLaw: 'NO_PHASE_MAY_SKIP_AN_UNSATISFIED_PREDECESSOR__EVERY_TRANSITION_IS_PROOF_CARRYING__SHIP_READINESS_IS_NOT_DEPLOYMENT_AUTHORITY',
    oneShotPromptingRejected: true
  };
  packet.gatePacketDigest = digest(packet);
  return allPassed
    ? { ok: true, status: 'ALL_PHASE_GATES_PASSED', ...packet, externalEffectAuthority: 'NONE', businessEffectAuthority: 'NONE' }
    : fail('PHASE_GATES_BLOCKED', [...reasons, ...gates.flatMap(g => [
        ...g.missing.map(type => `missing:${g.phase}:${type}`),
        ...g.wrongPhase.map(type => `wrong-phase:${g.phase}:${type}`),
        ...g.failingVerdicts.map(type => `failing-verdict:${g.phase}:${type}`)
      ])], packet);
}

export function compileRuntimeControlPlane({ layers = [] } = {}) {
  const reasons = [];
  const rows = [];
  const byLayer = new Map();

  for (const raw of Array.isArray(layers) ? layers : []) {
    const row = {
      layer: text(raw?.layer, 80)?.toUpperCase() || null,
      ownerRole: text(raw?.ownerRole, 120)?.toUpperCase() || null,
      executionInstanceRef: text(raw?.executionInstanceRef, 300),
      evidenceRef: text(raw?.evidenceRef, 1000),
      inputContracts: uniq(raw?.inputContracts),
      outputContracts: uniq(raw?.outputContracts),
      killSwitch: raw?.killSwitch === true,
      canWidenAuthority: raw?.canWidenAuthority === true,
      requiresRiskLease: raw?.requiresRiskLease === true,
      limitsRef: text(raw?.limitsRef, 1000),
      reconciliationRef: text(raw?.reconciliationRef, 1000)
    };
    if (!RUNTIME_LAYERS.includes(row.layer)) reasons.push(`unknown-runtime-layer:${row.layer || 'missing'}`);
    if (byLayer.has(row.layer)) reasons.push(`duplicate-runtime-layer:${row.layer}`);
    byLayer.set(row.layer, row);
    rows.push(row);
  }

  for (const layer of RUNTIME_LAYERS) if (!byLayer.has(layer)) reasons.push(`runtime-layer-required:${layer}`);
  for (const row of rows) {
    if (!row.ownerRole || !row.executionInstanceRef || !row.evidenceRef) reasons.push(`runtime-layer-owner-instance-evidence-required:${row.layer || 'unknown'}`);
  }

  const risk = byLayer.get('RISK');
  const execution = byLayer.get('EXECUTION');
  const monitoring = byLayer.get('MONITORING');
  const decision = byLayer.get('DECISION');

  if (risk) {
    if (!risk.killSwitch) reasons.push('risk-layer-kill-switch-required');
    if (!risk.limitsRef) reasons.push('risk-layer-hard-limits-required');
    if (risk.canWidenAuthority) reasons.push('risk-layer-may-not-widen-authority');
  }
  if (execution && !execution.requiresRiskLease) reasons.push('execution-must-require-risk-lease');
  if (execution && risk && execution.executionInstanceRef === risk.executionInstanceRef) reasons.push('execution-and-risk-must-use-independent-instances');
  if (monitoring && execution && monitoring.executionInstanceRef === execution.executionInstanceRef) reasons.push('monitoring-must-be-independent-from-execution');
  if (decision && risk && decision.executionInstanceRef === risk.executionInstanceRef) reasons.push('decision-and-risk-must-use-independent-instances');
  if (monitoring && !monitoring.reconciliationRef) reasons.push('monitoring-reconciliation-required');

  const plane = {
    version: SOVEREIGN_INSTITUTIONAL_HARNESS_VERSION,
    layers: rows,
    layerOrder: RUNTIME_LAYERS,
    riskLaw: 'RISK_IS_AN_INDEPENDENT_STOP_THE_LINE_LAYER__IT_MAY_REDUCE_OR_BLOCK_EXPOSURE_BUT_NEVER_INCREASE_AUTHORITY',
    executionLaw: 'EXECUTION_REQUIRES_A_CURRENT_RISK_LEASE_AND_REMAINS_SEPARATE_FROM_SIGNAL_GENERATION',
    monitoringLaw: 'MONITORING_RECONCILES_INTENDED_VS_OBSERVED_EFFECTS_AND_MAY_TRIGGER_KILL_SWITCH_OR_ROLLBACK'
  };
  plane.runtimePlaneDigest = digest(plane);
  return reasons.length
    ? fail('RUNTIME_CONTROL_PLANE_REFUSED', reasons, plane)
    : { ok: true, status: 'RUNTIME_CONTROL_PLANE_COMPILED', ...plane, externalEffectAuthority: 'NONE', businessEffectAuthority: 'NONE' };
}

function metricPass(row = {}) {
  const direction = text(row.direction, 30)?.toUpperCase() || 'HIGHER';
  const baseline = Number(row.baseline);
  const candidate = Number(row.candidate);
  const tolerance = Number.isFinite(Number(row.maxRegression)) ? Number(row.maxRegression) : 0;
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate)) return false;
  if (direction === 'LOWER') return candidate <= baseline + tolerance;
  if (direction === 'HIGHER') return candidate >= baseline - tolerance;
  return false;
}

export function evaluateSelfImprovementPromotion({
  candidate = {},
  baseline = {},
  benchmark = {},
  hostileTests = {},
  sandbox = {},
  rollback = {},
  approvals = [],
  proofDag = null
} = {}) {
  const reasons = [];
  const candidateId = text(candidate.id, 200);
  const baselineId = text(baseline.id, 200);
  if (!candidateId) reasons.push('candidate-id-required');
  if (!baselineId) reasons.push('baseline-id-required');
  if (candidate.selfApproved === true) reasons.push('candidate-may-not-self-approve');
  if (candidate.authorityExpansion === true) reasons.push('performance-may-not-expand-authority');

  const metrics = (Array.isArray(benchmark.metrics) ? benchmark.metrics : []).map(row => ({
    id: text(row.id, 120),
    baseline: Number(row.baseline),
    candidate: Number(row.candidate),
    direction: text(row.direction, 30)?.toUpperCase() || 'HIGHER',
    maxRegression: Number.isFinite(Number(row.maxRegression)) ? Number(row.maxRegression) : 0,
    critical: row.critical !== false,
    pass: metricPass(row)
  }));
  if (!metrics.length) reasons.push('benchmark-metrics-required');
  if (benchmark.holdout !== true) reasons.push('holdout-benchmark-required');
  if (benchmark.leakageChecked !== true) reasons.push('benchmark-leakage-check-required');
  for (const metric of metrics.filter(m => m.critical && !m.pass)) reasons.push(`critical-regression:${metric.id || 'unknown'}`);

  const hostileExecuted = Number(hostileTests.executed || 0);
  const hostilePassed = Number(hostileTests.passed || 0);
  if (!(hostileExecuted > 0 && hostilePassed === hostileExecuted)) reasons.push('all-hostile-tests-must-pass');
  if (sandbox.observed !== true || !text(sandbox.evidenceRef, 1000)) reasons.push('observed-sandbox-receipt-required');
  if (rollback.rehearsed !== true || !text(rollback.evidenceRef, 1000)) reasons.push('rollback-rehearsal-required');

  const normalizedApprovals = (Array.isArray(approvals) ? approvals : []).map(raw => ({
    discipline: text(raw?.discipline, 120)?.toUpperCase() || null,
    verdict: text(raw?.verdict, 80)?.toUpperCase() || null,
    executionInstanceRef: text(raw?.executionInstanceRef, 300),
    evidenceRef: text(raw?.evidenceRef, 1000)
  }));
  for (const discipline of ['CODE_REVIEWER', 'ADVERSARIAL_FALSIFIER', 'RISK_OFFICER', 'AUTHORITY_GUARD']) {
    const approval = normalizedApprovals.find(a => a.discipline === discipline);
    if (!approval || approval.verdict !== 'PASS' || !approval.evidenceRef) reasons.push(`independent-approval-required:${discipline}`);
    if (approval && candidate.executionInstanceRef && approval.executionInstanceRef === candidate.executionInstanceRef) reasons.push(`approval-instance-must-differ-from-candidate:${discipline}`);
  }

  if (proofDag) {
    if (!proofDag.ok) reasons.push('valid-proof-dag-required');
    for (const proofId of [sandbox.proofId, rollback.proofId].filter(Boolean)) {
      const proof = assertObservedProof({ dag: proofDag, proofId });
      if (!proof.ok) reasons.push(`observed-promotion-proof-refused:${proofId}`);
    }
  }

  const proposal = {
    version: SOVEREIGN_INSTITUTIONAL_HARNESS_VERSION,
    candidateId,
    baselineId,
    metrics,
    hostileTests: { executed: hostileExecuted, passed: hostilePassed },
    stages: SELF_IMPROVEMENT_STAGES,
    promotionLaw: 'OBSERVE_THEN_HYPOTHESIZE_THEN_PATCH_THEN_SANDBOX_THEN_HOLDOUT_BENCHMARK_THEN_INDEPENDENT_APPROVAL__PRODUCTION_AUTHORITY_IS_SEPARATE_AND_NEVER_SELF_GRANTED',
    authorityExpansion: false,
    productionMutationPerformed: false
  };
  proposal.promotionProposalDigest = digest(proposal);
  return reasons.length
    ? fail('SELF_IMPROVEMENT_PROMOTION_REFUSED', reasons, proposal)
    : { ok: true, status: 'PROMOTION_ELIGIBLE_PROPOSAL_ONLY', ...proposal, externalEffectAuthority: 'NONE', businessEffectAuthority: 'NONE' };
}

export function compileSovereignInstitutionalHarness({
  mission = {},
  roles = [],
  artifacts = [],
  proofs = [],
  executorCandidates = [],
  runtimeLayers = [],
  consequentialShip = false,
  authorityLeaseRef = null
} = {}) {
  const reasons = [];
  const missionId = text(mission.id, 200);
  const objective = text(mission.objective, 2000);
  const taskClass = text(mission.taskClass, 200);
  const requiredCapabilities = uniq(mission.requiredCapabilities);
  const contextSnapshotRef = text(mission.contextSnapshotRef, 1000);
  const contextDigest = text(mission.contextDigest, 200);

  if (!missionId) reasons.push('mission-id-required');
  if (!objective) reasons.push('mission-objective-required');
  if (!taskClass) reasons.push('mission-task-class-required');
  if (!requiredCapabilities.length) reasons.push('mission-required-capabilities-required');
  if (!contextSnapshotRef || !contextDigest) reasons.push('exact-context-snapshot-and-digest-required');

  const roleLattice = validateRoleLattice({ roles });
  if (!roleLattice.ok) reasons.push(...roleLattice.reasonCodes.map(code => `role-lattice:${code}`));

  const proofDag = compileProofDag({ proofs });
  if (!proofDag.ok) reasons.push(...proofDag.reasonCodes.map(code => `proof-dag:${code}`));

  const cell = compileInstitutionCell({
    task: {
      taskClass,
      requiredCapabilities,
      humanOnly: mission.humanOnly === true,
      maxLatencyMs: mission.maxLatencyMs,
      maxCostUsd: mission.maxCostUsd,
      maxFounderMinutes: mission.maxFounderMinutes
    },
    candidates: executorCandidates
  });
  if (!cell.ok) reasons.push(...cell.reasonCodes.map(code => `institution-cell:${code}`));

  const phases = evaluatePhaseGates({ artifacts, proofDag: proofDag.ok ? proofDag : null, consequentialShip, authorityLeaseRef });
  if (!phases.ok) reasons.push(...phases.reasonCodes.map(code => `phase:${code}`));

  const runtime = compileRuntimeControlPlane({ layers: runtimeLayers });
  if (!runtime.ok) reasons.push(...runtime.reasonCodes.map(code => `runtime:${code}`));

  const packet = {
    version: SOVEREIGN_INSTITUTIONAL_HARNESS_VERSION,
    mission: {
      id: missionId,
      objective,
      taskClass,
      requiredCapabilities,
      contextSnapshotRef,
      contextDigest,
      humanOnly: mission.humanOnly === true
    },
    roleLattice,
    proofDagDigest: proofDag.ok ? proofDag.dagDigest : null,
    institutionCell: cell.ok ? cell.cell : null,
    phaseGateDigest: phases.gatePacketDigest || null,
    runtimePlaneDigest: runtime.runtimePlaneDigest || null,
    doctrine: {
      harnessOverOneShotPrompt: true,
      specificationBeforeArchitectureBeforeImplementation: true,
      testFirst: true,
      dualReview: true,
      independentRisk: true,
      proofCarryingTransitions: true,
      contextIsolation: true,
      rollbackBeforeConsequentialShip: true,
      selfImprovementRequiresHoldoutAndIndependentApproval: true,
      capabilityNeverCreatesAuthority: true,
      realityOutranksSimulation: true,
      minimumSufficientExecutor: true
    },
    truthBoundary: 'THIS_HARNESS_CAN_ESTABLISH_INTERNAL_ENGINEERING_READINESS__IT_CANNOT_MANUFACTURE_CUSTOMER_ACCEPTANCE_CLEARED_PAYMENT_LEGAL_CLEARANCE_PROVIDER_ACCEPTANCE_MARKET_ALPHA_OR_ASI'
  };
  packet.harnessDigest = digest(packet);

  return reasons.length
    ? fail('SOVEREIGN_INSTITUTIONAL_HARNESS_REFUSED', reasons, packet)
    : { ok: true, status: 'SOVEREIGN_INSTITUTIONAL_HARNESS_COMPILED', ...packet, externalEffectAuthority: 'NONE', businessEffectAuthority: 'NONE' };
}
