export const AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION = 'agent-mesh-zero-io-canary-1.0.0';

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function zeroEffects() { return { ...ZERO_EFFECTS }; }
function iso(value) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) throw new Error('valid-canary-date-required');
  return d.toISOString();
}
function text(value, max = 300) {
  const s = String(value ?? '').trim();
  return s && s.length <= max ? s : null;
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function receiptResult(receipt, { duplicateDelivery = false, abandonedCyclesReconciled = 0 } = {}) {
  return {
    ok: receipt?.status !== 'BLOCKED',
    policyVersion: AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION,
    executionMode: 'ZERO_EXTERNAL_IO_CANARY',
    status: receipt?.status || 'IDLE',
    reasonCodes: Array.isArray(receipt?.reasonCodes) ? receipt.reasonCodes.slice(0, 20) : [],
    cycleId: receipt?.cycleId || null,
    cycleReceiptState: 'TERMINAL',
    duplicateDelivery,
    abandonedCyclesReconciled,
    at: receipt?.finishedAt || receipt?.startedAt || null,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function createZeroExternalIoCanaryRunner(receiptApi = {}) {
  const getReceipt = receiptApi.getAgentMeshCycleReceipt;
  const beginReceipt = receiptApi.beginAgentMeshCycleReceipt;
  const finishReceipt = receiptApi.finishAgentMeshCycleReceipt;
  const reconcileAbandoned = receiptApi.reconcileAbandonedAgentMeshCycles;

  if (typeof getReceipt !== 'function'
    || typeof beginReceipt !== 'function'
    || typeof finishReceipt !== 'function'
    || typeof reconcileAbandoned !== 'function') {
    throw new Error('canonical-cycle-receipt-api-required');
  }

  return async function runZeroExternalIoCanary({
    store,
    schedulerOccurrenceKey,
    sourceCommit,
    date = new Date(),
    abandonedCycleAfterMs = 60 * 60 * 1000
  } = {}) {
    const occurrenceKey = text(schedulerOccurrenceKey, 300);
    const source = text(sourceCommit, 80);
    if (!store || typeof store !== 'object') return fail(['store-required']);
    if (!occurrenceKey) return fail(['scheduler-occurrence-key-required']);
    if (!source) return fail(['source-commit-required']);

    let at;
    try { at = iso(date); }
    catch { return fail(['valid-canary-date-required']); }

    const identity = {
      sourceCommit: source,
      policyVersions: [AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION],
      workers: [],
      configuration: {
        autonomyRunLimit: 1,
        ingestAfterWorkers: false
      }
    };

    let existing;
    try {
      existing = await getReceipt({ store, occurrenceKey, ...identity });
    } catch (error) {
      if (error?.message === 'scheduler-occurrence-identity-conflict') {
        return fail(['scheduler-occurrence-identity-conflict'], { duplicateDelivery: true, at });
      }
      throw error;
    }

    if (existing.state === 'TERMINAL') {
      return receiptResult(existing.receipt, { duplicateDelivery: true });
    }

    if (existing.state === 'STARTED') {
      let reconciled = { reconciled: [] };
      try {
        reconciled = await reconcileAbandoned({
          store,
          now: date,
          abandonedAfterMs: abandonedCycleAfterMs
        });
      } catch (error) {
        return fail(['abandoned-cycle-reconciliation-failed'], {
          cycleId: existing.cycleId,
          cycleReceiptState: 'STARTED',
          duplicateDelivery: true,
          at
        });
      }
      const after = await getReceipt({ store, occurrenceKey, ...identity });
      if (after.state === 'TERMINAL') {
        return receiptResult(after.receipt, {
          duplicateDelivery: true,
          abandonedCyclesReconciled: reconciled.reconciled?.length || 0
        });
      }
      return fail(['scheduler-occurrence-already-started-incomplete'], {
        cycleId: existing.cycleId,
        cycleReceiptState: 'STARTED',
        duplicateDelivery: true,
        abandonedCyclesReconciled: reconciled.reconciled?.length || 0,
        at
      });
    }

    // Before recording a new liveness cycle, make prior crashes legible. This
    // writes only canonical receipt truth and never replays abandoned work.
    let abandoned = { abandonedFound: 0, reconciled: [] };
    try {
      abandoned = await reconcileAbandoned({
        store,
        now: date,
        abandonedAfterMs: abandonedCycleAfterMs
      });
    } catch {
      return fail(['abandoned-cycle-reconciliation-failed'], { at });
    }

    const begun = await beginReceipt({
      store,
      occurrenceKey,
      startedAt: date,
      ...identity
    });
    if (begun.duplicate) {
      return fail(['scheduler-occurrence-already-started-incomplete'], {
        cycleId: begun.cycleId,
        cycleReceiptState: 'STARTED',
        duplicateDelivery: true,
        at
      });
    }

    const firstSweep = {
      ok: true,
      status: 'SKIPPED_ZERO_EXTERNAL_IO_CANARY',
      runsConsidered: 0,
      runsTicked: 0,
      failed: 0
    };
    const terminal = await finishReceipt({
      store,
      cycleId: begun.cycleId,
      startedAt: begun.receipt?.startedAt || date,
      finishedAt: date,
      sourceCommit: source,
      policyVersions: identity.policyVersions,
      status: 'IDLE',
      reasonCodes: ['zero-external-io-canary'],
      firstSweep,
      workers: [],
      secondSweep: null
    });

    return {
      ...receiptResult(terminal.receipt),
      duplicateDelivery: terminal.duplicate === true,
      abandonedCyclesReconciled: abandoned.abandonedFound || 0
    };
  };
}
