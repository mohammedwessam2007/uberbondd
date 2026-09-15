import {
  APOTHEOSIS_ORCHESTRATION_RUNTIME_VERSION,
  allocateScarceReasoning,
  compileApotheosisWorkerPacket,
  compileApotheosisContinuityHandoff,
  classifyApotheosisContinuityEvidence
} from './apotheosis-orchestration-runtime.mjs';

export const APOTHEOSIS_AGENT_MESH_RUNTIME_VERSION = 'uberbond.apotheosis-agent-mesh-runtime.v1';

const ZERO = Object.freeze({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' });
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  version: APOTHEOSIS_AGENT_MESH_RUNTIME_VERSION,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...ZERO,
  ...extra
});
const pass = (status, extra = {}) => ({ ok: true, version: APOTHEOSIS_AGENT_MESH_RUNTIME_VERSION, status, ...ZERO, ...extra });

function findWorker(workers, selectedId) {
  return (Array.isArray(workers) ? workers : []).find(worker =>
    worker?.workerId === selectedId || worker?.candidateId === selectedId || worker?.id === selectedId
  ) || null;
}

export function compileApotheosisNativeDispatch({
  sourceCommit,
  taskBindingVerification,
  task,
  candidateEvidence,
  workers,
  packetContract
} = {}) {
  const reasons = [];
  if (!taskBindingVerification?.ok || taskBindingVerification.status !== 'CONTEXT_TASK_BINDING_VERIFIED') reasons.push('native-verified-task-binding-required');
  if (taskBindingVerification?.sourceCommit !== sourceCommit) reasons.push('task-binding-current-source-required');
  if (!Array.isArray(workers) || !workers.length) reasons.push('authorized-workers-required');
  if (reasons.length) return fail('APOTHEOSIS_NATIVE_DISPATCH_REFUSED', reasons);

  const allocation = allocateScarceReasoning({ task, candidates: candidateEvidence });
  if (!allocation.ok) return fail('APOTHEOSIS_NATIVE_DISPATCH_REFUSED', allocation.reasonCodes || ['scarce-reasoning-allocation-failed']);
  if (allocation.selected.tier === 'A5') {
    return pass('APOTHEOSIS_FRONTIER_ESCALATION_REQUIRED', {
      allocation,
      providerCalls: 0,
      dispatchPerformed: false,
      reasonCodes: ['frontier-cognition-selected-by-evidence']
    });
  }

  const worker = findWorker(workers, allocation.selected.id);
  if (!worker) return fail('APOTHEOSIS_NATIVE_DISPATCH_REFUSED', ['allocated-worker-outside-authorized-worker-set']);
  if (!text(worker.workerId, 160) || typeof worker.modelExecutor !== 'function') return fail('APOTHEOSIS_NATIVE_DISPATCH_REFUSED', ['callable-authorized-worker-required']);

  const packet = compileApotheosisWorkerPacket({
    ...packetContract,
    sourceCommit,
    taskBinding: taskBindingVerification,
    workerClass: allocation.selected.tier
  });
  if (!packet.ok) return fail('APOTHEOSIS_NATIVE_DISPATCH_REFUSED', packet.reasonCodes || ['worker-packet-compilation-failed']);

  return pass('APOTHEOSIS_NATIVE_DISPATCH_READY', {
    allocation,
    worker,
    packet: packet.packet,
    providerCalls: 0,
    dispatchPerformed: false,
    compositionLaw: 'TASK_BINDING_VERIFICATION__SCARCE_REASONING_ALLOCATION__AUTHORIZED_WORKER_MATCH__SOURCE_BOUND_PACKET'
  });
}

export async function runApotheosisWorkerMission({
  dispatch,
  meshOptions = {},
  runMesh = null
} = {}) {
  if (!dispatch?.ok || dispatch.status !== 'APOTHEOSIS_NATIVE_DISPATCH_READY') {
    return fail('APOTHEOSIS_WORKER_MISSION_REFUSED', ['native-dispatch-ready-required']);
  }
  if (dispatch.packet?.authorityCeiling !== 'NONE') return fail('APOTHEOSIS_WORKER_MISSION_REFUSED', ['zero-packet-authority-required']);
  const worker = dispatch.worker;
  if (!worker || typeof worker.modelExecutor !== 'function') return fail('APOTHEOSIS_WORKER_MISSION_REFUSED', ['callable-worker-required']);
  const runner = runMesh || (await import('./agent-mesh-control-plane.mjs')).runAgentMeshCycle;
  if (typeof runner !== 'function') return fail('APOTHEOSIS_WORKER_MISSION_REFUSED', ['agent-mesh-runner-required']);

  const schedulerOccurrenceKey = text(meshOptions.schedulerOccurrenceKey, 300);
  if (!schedulerOccurrenceKey) return fail('APOTHEOSIS_WORKER_MISSION_REFUSED', ['scheduler-occurrence-key-required']);
  const result = await runner({
    ...meshOptions,
    enabled: true,
    workers: [worker],
    sourceCommit: dispatch.packet.sourceCommit,
    schedulerOccurrenceKey
  });
  const acceptedStatus = new Set(['ADVANCED', 'IDLE', 'DEGRADED']);
  if (!result || result.ok === false || !acceptedStatus.has(result.status)) {
    return fail('APOTHEOSIS_WORKER_MISSION_BLOCKED', result?.reasonCodes || ['agent-mesh-cycle-did-not-complete'], {
      meshStatus: result?.status || 'UNKNOWN',
      cycleId: result?.cycleId || null,
      packetDigest: dispatch.packet.packetDigest
    });
  }
  return pass('APOTHEOSIS_WORKER_MISSION_EXECUTED_PENDING_INDEPENDENT_VERIFICATION', {
    meshStatus: result.status,
    cycleId: result.cycleId || null,
    packetDigest: dispatch.packet.packetDigest,
    workerId: worker.workerId,
    providerCallsObservedByAdapter: result.providerCalls ?? null,
    rawMeshResult: result,
    independentOutcomeVerificationRequired: true
  });
}

export function compileApotheosisNativeContinuation({
  nativeCheckpoint,
  missionGraphRef,
  packets,
  workerRouting,
  fileOwnership,
  testRequirements,
  integrationOrder,
  knownFailures = [],
  unresolvedQuestions = [],
  rollbackRequirements,
  nextWakeTrigger
} = {}) {
  if (!nativeCheckpoint?.ok || nativeCheckpoint.status !== 'EXECUTION_LEAF_CONTINUATION_CHECKPOINT_READY') {
    return fail('APOTHEOSIS_NATIVE_CONTINUATION_REFUSED', ['native-continuation-checkpoint-required']);
  }
  const checkpoint = nativeCheckpoint.checkpoint;
  const handoff = compileApotheosisContinuityHandoff({
    sourceCommit: checkpoint?.sourceCommit,
    graphDigest: checkpoint?.graphDigest,
    stateDigest: checkpoint?.stateDigest,
    missionGraphRef,
    packets,
    workerRouting,
    fileOwnership,
    testRequirements,
    integrationOrder,
    knownFailures,
    unresolvedQuestions,
    rollbackRequirements,
    nextWakeTrigger
  });
  if (!handoff.ok) return fail('APOTHEOSIS_NATIVE_CONTINUATION_REFUSED', handoff.reasonCodes || ['handoff-compilation-failed']);
  return pass('APOTHEOSIS_NATIVE_CONTINUATION_READY', {
    handoff: handoff.handoff,
    evidenceLevel: 'HANDOFF_SAVED',
    runtimeValidationRequired: true
  });
}

export function reconcileApotheosisWorkerResume({
  nativeContinuation,
  currentSourceCommit,
  workerReceipt = null,
  unattendedReceipt = null,
  now = Date.now()
} = {}) {
  if (!nativeContinuation?.ok || nativeContinuation.status !== 'APOTHEOSIS_NATIVE_CONTINUATION_READY') {
    return fail('APOTHEOSIS_NATIVE_RESUME_REFUSED', ['native-continuation-ready-required']);
  }
  const classification = classifyApotheosisContinuityEvidence({
    handoff: nativeContinuation.handoff,
    currentSourceCommit,
    workerReceipt,
    unattendedReceipt,
    now
  });
  if (!classification.ok) return fail('APOTHEOSIS_NATIVE_RESUME_REFUSED', classification.reasonCodes || ['continuity-evidence-refused']);
  return pass('APOTHEOSIS_NATIVE_RESUME_RECONCILED', {
    evidenceLevel: classification.evidenceLevel,
    handoffDigest: classification.handoffDigest,
    runtimeVersion: APOTHEOSIS_ORCHESTRATION_RUNTIME_VERSION
  });
}
