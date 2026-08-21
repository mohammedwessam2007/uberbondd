// Read-only reconciliation for an already-created relay task.
//
// This module intentionally receives the canonical relay client by injection
// and calls only readTask once. It cannot enqueue, poll-loop, retry, claim,
// execute, close, or promote a task.

export const PENDING_RELAY_RECONCILIATION_POLICY_VERSION =
  'pending-relay-reconciliation-1.0.0';

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function boundedStaleMs(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 60_000 && parsed <= 604_800_000
    ? parsed
    : 3_600_000;
}

function result(status, reasonCodes, detail = {}) {
  return {
    ok: !['INVALID', 'BLOCKED'].includes(status),
    policyVersion: PENDING_RELAY_RECONCILIATION_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    mutationAttempted: false,
    retryAuthorized: false,
    ...detail
  };
}

export function classifyPendingRelayTask({
  pendingReceipt,
  observedTask,
  staleAfterMs = 3_600_000,
  date = new Date()
} = {}) {
  const observedAt = iso(date);
  const taskId = String(pendingReceipt?.taskId || '').trim();
  const issueNumber = Number(pendingReceipt?.issueNumber);
  if (!observedAt || !taskId || !Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    return result('INVALID', ['valid-pending-receipt-required'], { observedAt });
  }
  if (!observedTask?.ok) {
    return result('BLOCKED', [
      'relay-read-failed',
      ...(Array.isArray(observedTask?.reasonCodes) ? observedTask.reasonCodes : [])
    ], { taskId, issueNumber, observedAt });
  }
  if (String(observedTask.task?.taskId || '') !== taskId) {
    return result('QUARANTINED', ['relay-task-identity-mismatch'], {
      taskId,
      issueNumber,
      observedAt
    });
  }
  if (observedTask.result != null) {
    return result('RESULT_READY_FOR_REVIEW', [], {
      taskId,
      issueNumber,
      observedAt,
      resultStatus: String(observedTask.resultStatus || '').toUpperCase() || null
    });
  }
  if (String(observedTask.issueState || '').toLowerCase() === 'closed') {
    return result('QUARANTINED', ['relay-closed-without-result-receipt'], {
      taskId,
      issueNumber,
      observedAt
    });
  }

  const createdAt = iso(pendingReceipt.createdAt || pendingReceipt.timestamp);
  if (!createdAt) {
    return result('OWNER_REVIEW_REQUIRED', ['pending-receipt-time-unverifiable'], {
      taskId,
      issueNumber,
      observedAt
    });
  }
  const ageMs = Date.parse(observedAt) - Date.parse(createdAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return result('OWNER_REVIEW_REQUIRED', ['pending-receipt-time-invalid'], {
      taskId,
      issueNumber,
      observedAt
    });
  }
  if (ageMs >= boundedStaleMs(staleAfterMs)) {
    return result('OWNER_REVIEW_REQUIRED', ['pending-task-stale-no-automatic-retry'], {
      taskId,
      issueNumber,
      observedAt,
      ageMs
    });
  }
  return result('PENDING', ['worker-result-not-yet-present'], {
    taskId,
    issueNumber,
    observedAt,
    ageMs
  });
}

export async function reconcilePendingRelayTask({
  relayClient,
  pendingReceipt,
  staleAfterMs,
  date = new Date()
} = {}) {
  if (!relayClient || typeof relayClient.readTask !== 'function') {
    return result('INVALID', ['configured-relay-client-required'], {
      observedAt: iso(date)
    });
  }
  const issueNumber = Number(pendingReceipt?.issueNumber);
  const taskId = String(pendingReceipt?.taskId || '').trim();
  if (!taskId || !Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    return result('INVALID', ['valid-pending-receipt-required'], {
      observedAt: iso(date)
    });
  }
  const observedTask = await relayClient.readTask({
    issueNumber,
    expectedTaskId: taskId
  });
  return classifyPendingRelayTask({
    pendingReceipt,
    observedTask,
    staleAfterMs,
    date
  });
}
