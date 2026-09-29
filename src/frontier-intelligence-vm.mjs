import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { qualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';

export const FRONTIER_INTELLIGENCE_VM_VERSION = 'uberbond.frontier-intelligence-vm.v1';

export const QUALITY_TYPES = Object.freeze([
  'Q_EXACT',
  'Q_CERTIFIED_BOUNDED',
  'Q_FRONTIER',
  'Q_MULTI_FRONTIER',
  'Q_REALITY_SETTLED',
  'Q_UNKNOWN'
]);

const QUALITY_RANK = Object.freeze({
  Q_EXACT: 10,
  Q_CERTIFIED_BOUNDED: 20,
  Q_FRONTIER: 30,
  Q_MULTI_FRONTIER: 40,
  Q_REALITY_SETTLED: 50,
  Q_UNKNOWN: Number.POSITIVE_INFINITY
});

const BACKEND_AUTHORITY = Object.freeze({
  CODE: 'Q_EXACT',
  EXACT_REUSE: 'Q_EXACT',
  JEV_CERTIFIED: 'Q_CERTIFIED_BOUNDED',
  CHEAP_SWARM: null,
  FRONTIER_CROWN: 'Q_FRONTIER',
  MULTI_FRONTIER: 'Q_MULTI_FRONTIER',
  REALITY: 'Q_REALITY_SETTLED'
});

const ZERO_EFFECTS = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];
const sha256 = value => /^[a-f0-9]{64}$/.test(String(value || '').toLowerCase());

function envelope(extra = {}) {
  return {
    vmVersion: FRONTIER_INTELLIGENCE_VM_VERSION,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: ZERO_EFFECTS(),
    ...extra
  };
}

function fail(status, reasons, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: unique(reasons),
    ...extra
  });
}

function normalizeNode(raw, index) {
  const reasons = [];
  const nodeId = text(raw?.nodeId, 200);
  const semanticIdentity = text(raw?.semanticIdentity, 500);
  const operation = text(raw?.operation, 80).toUpperCase();
  const requiredQualityType = text(raw?.requiredQualityType, 80).toUpperCase();
  const sourceStateDigest = text(raw?.sourceStateDigest, 128).toLowerCase();
  const dependencies = Array.isArray(raw?.dependencies)
    ? unique(raw.dependencies.map(value => text(value, 200)))
    : [];
  const evidenceRefs = Array.isArray(raw?.evidenceRefs)
    ? unique(raw.evidenceRefs.map(value => text(value, 1000)))
    : [];
  const applicabilityDomain = text(raw?.applicabilityDomain || 'UNBOUNDED_UNPROVEN', 1000);

  if (!nodeId) reasons.push(`node-${index}:node-id-required`);
  if (!semanticIdentity) reasons.push(`node-${index}:semantic-identity-required`);
  if (!operation) reasons.push(`node-${index}:operation-required`);
  if (!QUALITY_TYPES.includes(requiredQualityType)) reasons.push(`node-${index}:valid-quality-type-required`);
  if (!sha256(sourceStateDigest)) reasons.push(`node-${index}:source-state-digest-required`);
  if (dependencies.includes(nodeId)) reasons.push(`node-${index}:self-dependency-forbidden`);

  return {
    reasons,
    node: {
      nodeId,
      semanticIdentity,
      operation,
      requiredQualityType,
      sourceStateDigest,
      dependencies,
      evidenceRefs,
      applicabilityDomain,
      sideEffectClass: text(raw?.sideEffectClass || 'NONE', 80).toUpperCase(),
      urgency: text(raw?.urgency || 'SOON', 40).toUpperCase(),
      metadata: raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
        ? structuredClone(raw.metadata)
        : {}
    }
  };
}

function detectCycle(nodes) {
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of byId.get(id)?.dependencies || []) {
      if (visit(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return nodes.some(node => visit(node.nodeId));
}

export function compileCognitiveIR({ programId, taskClass, nodes = [] } = {}) {
  const reasons = [];
  const id = text(programId, 240);
  const klass = text(taskClass, 160);
  if (!id) reasons.push('program-id-required');
  if (!klass) reasons.push('task-class-required');
  if (!Array.isArray(nodes) || !nodes.length) reasons.push('at-least-one-node-required');
  if (Array.isArray(nodes) && nodes.length > 4096) reasons.push('node-count-exceeds-bound');

  const normalized = [];
  for (let index = 0; index < (Array.isArray(nodes) ? nodes.length : 0); index += 1) {
    const checked = normalizeNode(nodes[index], index);
    reasons.push(...checked.reasons);
    normalized.push(checked.node);
  }

  const ids = normalized.map(node => node.nodeId).filter(Boolean);
  if (new Set(ids).size !== ids.length) reasons.push('node-ids-must-be-unique');
  const idSet = new Set(ids);
  for (const node of normalized) {
    for (const dep of node.dependencies) {
      if (!idSet.has(dep)) reasons.push(`node-${node.nodeId}:dependency-not-found:${dep}`);
    }
  }
  if (!reasons.length && detectCycle(normalized)) reasons.push('dependency-cycle-forbidden');
  if (reasons.length) return fail('COGNITIVE_IR_REFUSED', reasons);

  const body = {
    schemaVersion: FRONTIER_INTELLIGENCE_VM_VERSION,
    programId: id,
    taskClass: klass,
    nodes: normalized,
    authority: 'NONE'
  };

  return envelope({
    ok: true,
    status: 'COGNITIVE_IR_COMPILED',
    program: Object.freeze({
      ...body,
      programDigest: `sha256:${digest(body)}`
    })
  });
}

export function authoritySatisfies(requiredQualityType, backend) {
  const required = text(requiredQualityType, 80).toUpperCase();
  const selectedBackend = text(backend, 80).toUpperCase();
  if (!QUALITY_TYPES.includes(required)) return false;
  if (required === 'Q_UNKNOWN') return false;
  const authority = BACKEND_AUTHORITY[selectedBackend];
  if (!authority) return false;
  return QUALITY_RANK[authority] >= QUALITY_RANK[required];
}

export function planQualityTypedExecution({
  program,
  certifiedNodeIds = [],
  exactReusableNodeIds = [],
  realityRequiredNodeIds = []
} = {}) {
  if (!program?.programDigest || !Array.isArray(program?.nodes)) {
    return fail('COGNITIVE_EXECUTION_REFUSED', ['compiled-program-required']);
  }

  const certified = new Set(certifiedNodeIds.map(value => text(value, 200)));
  const exactReuse = new Set(exactReusableNodeIds.map(value => text(value, 200)));
  const realityRequired = new Set(realityRequiredNodeIds.map(value => text(value, 200)));
  const nodeIds = new Set(program.nodes.map(node => node.nodeId));

  for (const id of [...certified, ...exactReuse, ...realityRequired]) {
    if (!nodeIds.has(id)) return fail('COGNITIVE_EXECUTION_REFUSED', [`unknown-node-id:${id}`]);
  }

  const plan = program.nodes.map(node => {
    let backend;
    let reason;

    if (realityRequired.has(node.nodeId) || node.requiredQualityType === 'Q_REALITY_SETTLED') {
      backend = 'REALITY';
      reason = 'reality-settlement-required';
    } else if (node.requiredQualityType === 'Q_UNKNOWN') {
      backend = 'MULTI_FRONTIER';
      reason = 'unknown-pages-upward';
    } else if (exactReuse.has(node.nodeId) && node.requiredQualityType === 'Q_EXACT') {
      backend = 'EXACT_REUSE';
      reason = 'exact-identity-reuse';
    } else if (node.requiredQualityType === 'Q_EXACT') {
      backend = 'CODE';
      reason = 'deterministic-quality-type';
    } else if (certified.has(node.nodeId) && node.requiredQualityType === 'Q_CERTIFIED_BOUNDED') {
      backend = 'JEV_CERTIFIED';
      reason = 'bounded-zero-loss-certified';
    } else if (node.requiredQualityType === 'Q_CERTIFIED_BOUNDED') {
      backend = 'FRONTIER_CROWN';
      reason = 'bounded-node-not-yet-certified';
    } else if (node.requiredQualityType === 'Q_FRONTIER') {
      backend = 'FRONTIER_CROWN';
      reason = 'frontier-required';
    } else if (node.requiredQualityType === 'Q_MULTI_FRONTIER') {
      backend = 'MULTI_FRONTIER';
      reason = 'independent-frontier-required';
    } else {
      backend = 'MULTI_FRONTIER';
      reason = 'fail-closed';
    }

    if (!authoritySatisfies(node.requiredQualityType, backend) && node.requiredQualityType !== 'Q_UNKNOWN') {
      return {
        ...node,
        backend: 'MULTI_FRONTIER',
        reason: 'authority-upgrade-required',
        valid: authoritySatisfies(node.requiredQualityType, 'MULTI_FRONTIER')
      };
    }

    return {
      ...node,
      backend,
      reason,
      valid: node.requiredQualityType === 'Q_UNKNOWN' ? true : authoritySatisfies(node.requiredQualityType, backend)
    };
  });

  if (plan.some(node => !node.valid)) {
    return fail('COGNITIVE_EXECUTION_REFUSED', ['no-backend-satisfies-required-quality-type']);
  }

  return envelope({
    ok: true,
    status: 'QUALITY_TYPED_EXECUTION_PLAN_READY',
    programId: program.programId,
    programDigest: program.programDigest,
    plan,
    frontierResidualNodeIds: plan.filter(node => ['FRONTIER_CROWN', 'MULTI_FRONTIER'].includes(node.backend)).map(node => node.nodeId),
    exactNodeIds: plan.filter(node => ['CODE', 'EXACT_REUSE'].includes(node.backend)).map(node => node.nodeId),
    boundedReflexNodeIds: plan.filter(node => node.backend === 'JEV_CERTIFIED').map(node => node.nodeId),
    realityNodeIds: plan.filter(node => node.backend === 'REALITY').map(node => node.nodeId),
    law: 'BACKEND_AUTHORITY_MUST_MEET_OR_EXCEED_REQUIRED_QUALITY_TYPE'
  });
}

export function findCommonSemanticSubexpressions({ program } = {}) {
  if (!program?.programDigest || !Array.isArray(program?.nodes)) {
    return fail('COGNITIVE_CSE_REFUSED', ['compiled-program-required']);
  }

  const groups = new Map();
  for (const node of program.nodes) {
    const key = digest({
      semanticIdentity: node.semanticIdentity,
      sourceStateDigest: node.sourceStateDigest,
      requiredQualityType: node.requiredQualityType,
      applicabilityDomain: node.applicabilityDomain,
      operation: node.operation,
      dependencies: node.dependencies,
      evidenceRefs: node.evidenceRefs,
      sideEffectClass: node.sideEffectClass,
      metadata: node.metadata
    });
    const rows = groups.get(key) || [];
    rows.push(node.nodeId);
    groups.set(key, rows);
  }

  const aliases = [];
  for (const [semanticDigest, nodeIds] of groups.entries()) {
    if (nodeIds.length < 2) continue;
    aliases.push({
      semanticDigest: `sha256:${semanticDigest}`,
      canonicalNodeId: nodeIds[0],
      duplicateNodeIds: nodeIds.slice(1)
    });
  }

  return envelope({
    ok: true,
    status: aliases.length ? 'COMMON_SEMANTIC_SUBEXPRESSIONS_FOUND' : 'NO_COMMON_SEMANTIC_SUBEXPRESSIONS',
    aliases,
    eliminatedCandidateCount: aliases.reduce((sum, row) => sum + row.duplicateNodeIds.length, 0),
    authority: 'PLAN_ONLY'
  });
}

export function enforceQualityEscrow({
  availableCents,
  requiredFallbackCents,
  speculativeSpendCents = 0
} = {}) {
  const available = Number(availableCents);
  const fallback = Number(requiredFallbackCents);
  const speculative = Number(speculativeSpendCents);

  if (![available, fallback, speculative].every(Number.isSafeInteger) || available < 0 || fallback < 0 || speculative < 0) {
    return fail('QUALITY_ESCROW_REFUSED', ['nonnegative-integer-cent-values-required']);
  }

  const permitted = available - speculative >= fallback;
  return envelope({
    ok: true,
    status: permitted ? 'SPECULATION_ALLOWED_WITH_FALLBACK_ESCROW' : 'SPECULATION_BLOCKED_PROTECT_CROWN_ESCROW',
    permitted,
    availableCents: available,
    requiredFallbackCents: fallback,
    speculativeSpendCents: speculative,
    remainingAfterSpeculationCents: Math.max(0, available - speculative),
    law: 'NEVER_SPEND_THE_REQUIRED_QUALITY_FALLBACK_ON_AN_UNPROVEN_CHEAP_PATH'
  });
}

export function compileFrontierResidual({
  executionPlan,
  resolvedNodeIds = []
} = {}) {
  if (!executionPlan?.ok || !Array.isArray(executionPlan?.plan)) {
    return fail('FRONTIER_RESIDUAL_REFUSED', ['quality-typed-execution-plan-required']);
  }
  const resolved = new Set(resolvedNodeIds.map(value => text(value, 200)));
  const unresolved = executionPlan.plan.filter(node => !resolved.has(node.nodeId));
  const frontier = unresolved.filter(node => ['FRONTIER_CROWN', 'MULTI_FRONTIER'].includes(node.backend));
  const packet = {
    programId: executionPlan.programId,
    programDigest: executionPlan.programDigest,
    frontierNodes: frontier.map(node => ({
      nodeId: node.nodeId,
      semanticIdentity: node.semanticIdentity,
      operation: node.operation,
      requiredQualityType: node.requiredQualityType,
      sourceStateDigest: node.sourceStateDigest,
      dependencies: node.dependencies,
      evidenceRefs: node.evidenceRefs,
      applicabilityDomain: node.applicabilityDomain
    }))
  };

  return envelope({
    ok: true,
    status: frontier.length ? 'FRONTIER_RESIDUAL_READY' : 'NO_FRONTIER_RESIDUAL',
    packet,
    residualDigest: `sha256:${digest(packet)}`,
    frontierNodeCount: frontier.length,
    totalUnresolvedNodeCount: unresolved.length,
    law: 'BUY_FRONTIER_COGNITION_ONLY_FOR_UNRESOLVED_FRONTIER_TYPED_NODES'
  });
}

export function createProofCarryingCognitionPacket({
  resultDigest,
  programDigest,
  qualityType,
  backendIdentities = [],
  evidenceRefs = [],
  tests = [],
  counterexamples = [],
  applicabilityDomain,
  invalidators = [],
  costReceiptRef,
  crownRevision = null,
  expiresAt = null
} = {}) {
  const reasons = [];
  const result = text(resultDigest, 128).toLowerCase().replace(/^sha256:/, '');
  const program = text(programDigest, 128).toLowerCase().replace(/^sha256:/, '');
  const required = text(qualityType, 80).toUpperCase();
  const domain = text(applicabilityDomain, 2000);
  const cost = text(costReceiptRef, 1000);
  if (!sha256(result)) reasons.push('result-digest-required');
  if (!sha256(program)) reasons.push('program-digest-required');
  if (!QUALITY_TYPES.includes(required)) reasons.push('valid-quality-type-required');
  if (!domain) reasons.push('applicability-domain-required');
  if (!cost) reasons.push('cost-receipt-ref-required');
  if (!Array.isArray(backendIdentities) || !backendIdentities.length) reasons.push('backend-identities-required');
  if (reasons.length) return fail('PROOF_CARRYING_COGNITION_REFUSED', reasons);

  const packet = {
    schemaVersion: 'uberbond.proof-carrying-cognition.v1',
    resultDigest: `sha256:${result}`,
    programDigest: `sha256:${program}`,
    qualityType: required,
    backendIdentities: backendIdentities.map(value => text(value, 500)).filter(Boolean),
    evidenceRefs: evidenceRefs.map(value => text(value, 1000)).filter(Boolean),
    tests: tests.map(value => text(value, 1000)).filter(Boolean),
    counterexamples: counterexamples.map(value => text(value, 1000)).filter(Boolean),
    applicabilityDomain: domain,
    invalidators: invalidators.map(value => text(value, 1000)).filter(Boolean),
    costReceiptRef: cost,
    crownRevision: crownRevision ? text(crownRevision, 500) : null,
    expiresAt: expiresAt ? text(expiresAt, 100) : null
  };

  return envelope({
    ok: true,
    status: 'PROOF_CARRYING_COGNITION_PACKET_READY',
    packet,
    packetDigest: `sha256:${digest(packet)}`,
    claimBoundary: 'PACKET_PRESERVES_EVIDENCE_AND_PROVENANCE; IT_DOES_NOT_BY_ITSELF_PROVE_THE_RESULT_CORRECT'
  });
}
