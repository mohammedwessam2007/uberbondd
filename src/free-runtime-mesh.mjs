export const FREE_RUNTIME_MESH_VERSION = 'uberbond.free-runtime-mesh.v1';

export const FREE_RUNTIME_LIMITS = Object.freeze({
  workerRequestsPerDay: 100000,
  workerSafetyReserve: 12000,
  queueOperationsPerDay: 10000,
  activeHeartbeatMs: 1000,
  idleRecoveryMs: 60000,
  maxLogicalCatchupTicks: 60
});

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, n(value, min)));

export function compileFreeRuntimeWake({
  nowMs = Date.now(),
  pendingJobs = 0,
  inflight = false,
  urgent = false,
  workerRequestsUsedToday = 0,
  workerRequestLimit = FREE_RUNTIME_LIMITS.workerRequestsPerDay,
  workerSafetyReserve = FREE_RUNTIME_LIMITS.workerSafetyReserve,
  lastWakeMs = null
} = {}) {
  const used = Math.max(0, Math.floor(n(workerRequestsUsedToday)));
  const limit = Math.max(1, Math.floor(n(workerRequestLimit, FREE_RUNTIME_LIMITS.workerRequestsPerDay)));
  const reserve = clamp(workerSafetyReserve, 0, Math.max(0, limit - 1));
  const remaining = Math.max(0, limit - used);
  const spendable = Math.max(0, remaining - reserve);
  const hasWork = Math.max(0, Math.floor(n(pendingJobs))) > 0 || inflight === true || urgent === true;
  const budgetExhausted = spendable <= 0;
  const cadenceMs = hasWork && !budgetExhausted
    ? FREE_RUNTIME_LIMITS.activeHeartbeatMs
    : FREE_RUNTIME_LIMITS.idleRecoveryMs;
  const previous = Number.isFinite(Number(lastWakeMs)) ? Number(lastWakeMs) : Number(nowMs);
  const elapsedMs = Math.max(0, Number(nowMs) - previous);
  const logicalTicksElapsed = Math.min(
    FREE_RUNTIME_LIMITS.maxLogicalCatchupTicks,
    Math.max(1, Math.floor(elapsedMs / FREE_RUNTIME_LIMITS.activeHeartbeatMs) || 1)
  );

  return {
    version: FREE_RUNTIME_MESH_VERSION,
    mode: budgetExhausted ? 'FREE_BUDGET_PROTECTED' : hasWork ? 'ACTIVE_ONE_SECOND' : 'HIBERNATE_WITH_RECOVERY_ALARM',
    cadenceMs,
    nextWakeAtMs: Number(nowMs) + cadenceMs,
    logicalTicksElapsed,
    workerRequestsUsedToday: used,
    workerRequestsRemaining: remaining,
    workerRequestsSpendable: spendable,
    shouldDispatchBurst: !budgetExhausted && inflight !== true && Math.max(0, Math.floor(n(pendingJobs))) > 0,
    externalEffectAuthority: 'NONE',
    capitalDeploymentAuthority: 'NONE',
    truthBoundary: 'FREE_RUNTIME_MESH_COORDINATES_INTERNAL_COMPUTE_ONLY; IT_DOES_NOT_GRANT_MESSAGING_PAYMENT_TRADING_CONTRACTING_OR_DEPLOYMENT_AUTHORITY'
  };
}

export function compileFreeBurstDispatch({ pendingJobs = 0, inflight = false, reason = 'free-runtime-work' } = {}) {
  const count = Math.max(0, Math.floor(n(pendingJobs)));
  if (inflight === true || count === 0) {
    return {
      ok: false,
      status: inflight === true ? 'BURST_ALREADY_INFLIGHT' : 'NO_BURST_WORK',
      dispatch: null,
      externalEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: 'FREE_BURST_READY',
    dispatch: {
      workflow: 'free-runtime-burst.yml',
      ref: 'main',
      inputs: {
        reason: String(reason || 'free-runtime-work').slice(0, 120),
        requestedJobs: Math.min(100, count)
      }
    },
    externalEffectAuthority: 'NONE',
    truthBoundary: 'DISPATCH_IS_INTERNAL_COMPUTE_INTENT_NOT_A_REAL_WORLD_BUSINESS_EFFECT'
  };
}
