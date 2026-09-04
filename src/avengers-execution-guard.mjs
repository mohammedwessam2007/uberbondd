import crypto from 'node:crypto';
import { compileEvidenceRoutedAvengersSquad } from './avengers-squad-planner.mjs';
import { executeAvengersPlan } from './avengers-arsenal.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AVENGERS_EXECUTION_GUARD_VERSION = 'uberbond.avengers-execution-guard-1.0.0';

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AVENGERS_EXECUTION_GUARD_VERSION,
    status: 'AVENGERS_EXECUTION_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    providerCalls: 0,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function normalizedAssignments(assignments = []) {
  return assignments.map(item => ({
    nodeId: item.nodeId,
    role: item.role,
    taskClass: item.taskClass,
    primary: item.primary ? {
      profileId: item.primary.profileId,
      model: item.primary.model,
      runtime: item.primary.runtime,
      revision: item.primary.revision,
      evidenceStatus: item.primary.evidenceStatus ?? null
    } : null,
    fallbacks: (item.fallbacks || []).map(candidate => ({
      profileId: candidate.profileId,
      model: candidate.model,
      runtime: candidate.runtime,
      revision: candidate.revision,
      evidenceStatus: candidate.evidenceStatus ?? null
    })),
    toolIds: [...(item.toolIds || [])]
  }));
}

export async function executeCanonicallyVerifiedAvengersPlan({
  registry,
  readiness,
  plan,
  fetchImpl = globalThis.fetch,
  secretResolver = name => process.env[name] || '',
  maxTokensPerNode = 2_000,
  costCeilingCentsPerNode = 100,
  date = new Date()
} = {}) {
  if (!readiness || !plan?.mission) return fail(['readiness-and-plan-required']);
  if (plan?.routing?.policy !== 'CANONICAL_AGENT_MODEL_ROUTER') return fail(['canonical-router-plan-required']);

  const rebuilt = compileEvidenceRoutedAvengersSquad({
    registry,
    readiness,
    mission: plan.mission,
    maxFallbacks: Math.max(0, ...((plan.assignments || []).map(item => (item.fallbacks || []).length))),
    maxBenchmarkAgeDays: Number(plan.routing.maximumBenchmarkAgeDays ?? 30),
    minimumEvidenceConfidence: Number(plan.routing.minimumEvidenceConfidence ?? 0.5),
    date
  });
  if (!rebuilt.ok) return fail(['canonical-reroute-failed', ...(rebuilt.reasonCodes || [])]);

  const suppliedAssignments = normalizedAssignments(plan.assignments || []);
  const rebuiltAssignments = normalizedAssignments(rebuilt.plan.assignments || []);
  if (digest(suppliedAssignments) !== digest(rebuiltAssignments)) {
    return fail(['plan-routing-integrity-failed'], {
      suppliedAssignmentDigest: digest(suppliedAssignments),
      canonicalAssignmentDigest: digest(rebuiltAssignments)
    });
  }
  if (plan.graphDigest !== rebuilt.plan.graphDigest) return fail(['plan-graph-does-not-match-canonical-reroute']);

  let providerCalls = 0;
  const countingFetch = typeof fetchImpl === 'function'
    ? async (...args) => { providerCalls += 1; return fetchImpl(...args); }
    : fetchImpl;

  const result = await executeAvengersPlan({
    registry,
    plan,
    fetchImpl: countingFetch,
    secretResolver,
    maxTokensPerNode,
    costCeilingCentsPerNode,
    date
  });

  const externalEffectLedger = {
    ...clone(result.externalEffectLedger || ZERO_EXTERNAL_EFFECTS),
    providerCalls
  };
  if (!result.receipt) {
    return {
      ...result,
      policyVersion: AVENGERS_EXECUTION_GUARD_VERSION,
      providerCalls,
      businessEffectAuthority: 'NONE',
      externalEffectLedger
    };
  }

  const receipt = {
    ...result.receipt,
    providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: {
      ...clone(result.receipt.externalEffectLedger || ZERO_EXTERNAL_EFFECTS),
      providerCalls
    }
  };
  return {
    ...result,
    policyVersion: AVENGERS_EXECUTION_GUARD_VERSION,
    receipt,
    receiptDigest: digest(receipt),
    providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger
  };
}
