import crypto from 'node:crypto';
import { compileEvidenceRoutedAvengersSquad } from './avengers-squad-planner.mjs';
import { executeAvengersPlan } from './avengers-arsenal.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from './frontier-cognitive-admission.mjs';
import { buildFrontierCognitiveReceipt } from './frontier-cognitive-fabric.mjs';
import { executeFrontierMember } from './frontier-reasoning-runtime.mjs';
import { executeFrontierCouncil } from './frontier-council-runtime.mjs';
import { createModelExecutorFactory } from './agent-model-executor-factory.mjs';
import { isFrontierSimulationExecutorFactory } from './frontier-simulation-executor.mjs';

export const AVENGERS_EXECUTION_GUARD_VERSION = 'uberbond.avengers-execution-guard-1.4.0';

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

  const externalEffectLedger = { ...clone(result.externalEffectLedger || ZERO_EXTERNAL_EFFECTS), providerCalls };
  if (!result.receipt) {
    return { ...result, policyVersion: AVENGERS_EXECUTION_GUARD_VERSION, providerCalls, businessEffectAuthority: 'NONE', externalEffectLedger };
  }
  const receipt = {
    ...result.receipt,
    providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...clone(result.receipt.externalEffectLedger || ZERO_EXTERNAL_EFFECTS), providerCalls }
  };
  return { ...result, policyVersion: AVENGERS_EXECUTION_GUARD_VERSION, receipt, receiptDigest: digest(receipt), providerCalls, businessEffectAuthority: 'NONE', externalEffectLedger };
}

export async function executeAdmittedFrontierAvenger({
  task,
  profiles = [],
  callability = [],
  benchmarks = [],
  contextArtifacts = [],
  admissionSource,
  callabilityProvenance = null,
  env = process.env,
  sandboxIsolationReceipt = null,
  fetchImpl = globalThis.fetch,
  modelExecutorFactory = null,
  maxTokens = 2_000,
  costCeilingCents = 100,
  date = new Date(),
  clock = () => Date.now(),
  policy = {}
} = {}) {
  const admission = buildFrontierAdmissionBundle({
    profiles,
    callability,
    benchmarks,
    contextArtifacts,
    source: admissionSource,
    callabilityProvenance
  });
  if (!admission.ok) return fail(['frontier-admission-failed', ...(admission.reasonCodes || [])], { admissionStatus: admission.status });

  const planResult = compileAdmittedFrontierPlan({ ...policy, task, admissionBundle: admission.bundle, now: date });
  if (!planResult.ok) return fail(['frontier-plan-failed', ...(planResult.reasonCodes || [])], {
    frontierStatus: planResult.status,
    admissionDigest: admission.bundle.identityDigest,
    admissionRejectedEvidence: planResult.admissionRejectedEvidence
  });

  const syntheticExecution = admission.bundle.simulationOnly === true;
  const simulationFactory = isFrontierSimulationExecutorFactory(modelExecutorFactory);
  if (syntheticExecution && !simulationFactory) {
    return fail(['synthetic-callability-requires-branded-no-network-simulation-executor'], {
      admissionDigest: admission.bundle.identityDigest,
      simulationOnly: true
    });
  }
  if (syntheticExecution && fetchImpl !== globalThis.fetch) {
    return fail(['synthetic-frontier-execution-prohibits-network-transport-injection'], {
      admissionDigest: admission.bundle.identityDigest,
      simulationOnly: true
    });
  }
  if (!syntheticExecution && simulationFactory) {
    return fail(['live-callability-cannot-use-simulation-executor'], {
      admissionDigest: admission.bundle.identityDigest,
      simulationOnly: false
    });
  }
  if (!syntheticExecution && typeof modelExecutorFactory === 'function') {
    return fail(['live-frontier-execution-requires-canonical-model-executor-factory'], {
      admissionDigest: admission.bundle.identityDigest,
      simulationOnly: false
    });
  }
  if (!syntheticExecution && fetchImpl !== globalThis.fetch) {
    return fail(['live-frontier-execution-requires-native-provider-transport'], {
      admissionDigest: admission.bundle.identityDigest,
      simulationOnly: false
    });
  }

  let providerCalls = 0;
  let factory;
  if (syntheticExecution) {
    factory = modelExecutorFactory;
  } else {
    const countingFetch = async (...args) => {
      providerCalls += 1;
      return globalThis.fetch(...args);
    };
    factory = createModelExecutorFactory({ env, sandboxIsolationReceipt, fetchImpl: countingFetch });
  }

  if (planResult.plan.mode === 'COUNCIL_MAX') {
    const council = await executeFrontierCouncil({
      planResult,
      callability: admission.bundle.callability,
      modelExecutorFactory: factory,
      maxTokens,
      costCeilingCents,
      clock,
      now: date
    });
    if (!council.ok) return fail(['frontier-council-execution-failed', ...(council.reasonCodes || [])], {
      frontierStatus: council.status,
      providerCalls,
      admissionDigest: admission.bundle.identityDigest,
      planDigest: planResult.planDigest
    });
    const receipt = {
      ...council.receipt,
      admissionDigest: admission.bundle.identityDigest,
      admissionSource: admission.bundle.source,
      callabilityProvenance: admission.bundle.callabilityProvenance,
      simulationOnly: syntheticExecution,
      providerCalls,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...clone(council.receipt.externalEffectLedger || ZERO_EXTERNAL_EFFECTS), providerCalls }
    };
    return {
      ok: true,
      policyVersion: AVENGERS_EXECUTION_GUARD_VERSION,
      status: 'FRONTIER_COUNCIL_AVENGERS_EXECUTION_COMPLETE',
      plan: planResult.plan,
      planDigest: planResult.planDigest,
      admissionDigest: admission.bundle.identityDigest,
      simulationOnly: syntheticExecution,
      executionCount: council.executionCount,
      processVerifierRef: council.processVerifierRef,
      spentCents: council.spentCents,
      receipt,
      receiptDigest: digest(receipt),
      providerCalls,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...clone(ZERO_EXTERNAL_EFFECTS), providerCalls },
      truthBoundary: council.truthBoundary
    };
  }

  const selectedCallability = admission.bundle.callability.find(item => item.profileId === planResult.plan.selected.profileId);
  if (!selectedCallability) return fail(['selected-frontier-profile-lacks-admitted-callability-evidence']);
  const workerTask = {
    taskId: planResult.plan.task.taskId,
    objective: planResult.plan.task.objective,
    consequenceClass: 'LOCAL_PREPARATION',
    contextRefs: planResult.plan.contextPacket.contextRefs,
    evidenceRefs: [selectedCallability.sourceRef, `admission://${admission.bundle.identityDigest}`]
  };
  const execution = await executeFrontierMember({ member: planResult.plan.selected, task: workerTask, modelExecutorFactory: factory, callabilityEvidence: selectedCallability, maxTokens, costCeilingCents, clock });
  if (!execution.ok) return fail(['frontier-execution-failed', ...(execution.reasonCodes || [])], {
    frontierStatus: execution.status,
    providerCalls,
    admissionDigest: admission.bundle.identityDigest,
    planDigest: planResult.planDigest
  });
  const receiptResult = buildFrontierCognitiveReceipt({ planResult, executions: [execution.execution], now: date });
  if (!receiptResult.ok) return fail(['frontier-receipt-failed', ...(receiptResult.reasonCodes || [])], {
    providerCalls,
    admissionDigest: admission.bundle.identityDigest,
    planDigest: planResult.planDigest
  });
  const receipt = {
    ...receiptResult.receipt,
    admissionDigest: admission.bundle.identityDigest,
    admissionSource: admission.bundle.source,
    callabilityProvenance: admission.bundle.callabilityProvenance,
    simulationOnly: syntheticExecution,
    providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...clone(receiptResult.receipt.externalEffectLedger || ZERO_EXTERNAL_EFFECTS), providerCalls }
  };
  return {
    ok: true,
    policyVersion: AVENGERS_EXECUTION_GUARD_VERSION,
    status: 'FRONTIER_AVENGER_EXECUTION_COMPLETE',
    plan: planResult.plan,
    planDigest: planResult.planDigest,
    admissionDigest: admission.bundle.identityDigest,
    simulationOnly: syntheticExecution,
    execution: execution.execution,
    receipt,
    receiptDigest: digest(receipt),
    providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...clone(ZERO_EXTERNAL_EFFECTS), providerCalls }
  };
}
