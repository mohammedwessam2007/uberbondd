import crypto from 'node:crypto';
import { sameJson } from './cloud-agent-relay.mjs';
import { AGENT_AUTONOMY_STORE_POLICY_VERSION } from './agent-autonomy-store.mjs';

export const AGENT_AUTONOMY_RECEIPT_LEDGER_POLICY_VERSION = 'agent-autonomy-receipt-ledger-1.0.0';
const RECEIPT_TYPE = 'agent_autonomy_execution_receipt';

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('valid-autonomy-receipt-date-required');
  return date.toISOString();
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_RECEIPT_LEDGER_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  };
}

function stableReceipt(receipt = {}) {
  return {
    runId: text(receipt.runId, 180),
    sequence: Number.isSafeInteger(receipt.sequence) ? receipt.sequence : null,
    sessionId: text(receipt.sessionId, 180),
    taskId: text(receipt.taskId, 220),
    originAgent: text(receipt.originAgent, 100),
    targetAgent: text(receipt.targetAgent, 100),
    employeeRoleRef: text(receipt.employeeRoleRef, 500) || null,
    employeeRoleDigest: text(receipt.employeeRoleDigest, 120) || null,
    issueNumber: Number.isSafeInteger(Number(receipt.issueNumber)) ? Number(receipt.issueNumber) : null,
    resultStatus: text(receipt.resultStatus, 100),
    receivedAt: text(receipt.receivedAt, 80)
  };
}

function validStableReceipt(receipt) {
  return Boolean(receipt.runId && receipt.taskId && receipt.sessionId && Number.isSafeInteger(receipt.sequence) && receipt.sequence >= 0);
}

function deterministicAuditId(receipt) {
  const identity = {
    runId: receipt.runId,
    sessionId: receipt.sessionId,
    taskId: receipt.taskId,
    sequence: receipt.sequence
  };
  return `autonomy_receipt_${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 40)}`;
}

function equivalentPersisted(row, expected) {
  const detail = row?.detail || {};
  return row?.type === RECEIPT_TYPE
    && sameJson(stableReceipt(detail), expected);
}

export async function logIdempotentAutonomyExecutionReceipt(store, receipt, { date = new Date() } = {}) {
  if (!store || typeof store.add !== 'function' || typeof store.get !== 'function') {
    return fail(['store-atomic-add-and-get-required']);
  }
  const normalized = stableReceipt(receipt);
  if (!validStableReceipt(normalized)) return fail(['valid-execution-receipt-required']);

  let createdAt;
  try { createdAt = timestamp(date); }
  catch (error) { return fail([error.message]); }

  const id = deterministicAuditId(normalized);
  const row = {
    id,
    type: RECEIPT_TYPE,
    detail: {
      policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
      receiptLedgerPolicyVersion: AGENT_AUTONOMY_RECEIPT_LEDGER_POLICY_VERSION,
      ...normalized,
      createdAt
    },
    createdAt
  };

  try {
    const added = await store.add('auditLog', row);
    return {
      ok: true,
      policyVersion: AGENT_AUTONOMY_RECEIPT_LEDGER_POLICY_VERSION,
      status: 'RECEIPT_LOGGED',
      duplicate: false,
      auditId: added?.id || id,
      createdAt
    };
  } catch (error) {
    const existing = await store.get('auditLog', id);
    if (!existing) throw error;
    if (!equivalentPersisted(existing, normalized)) {
      return fail(['autonomy-execution-receipt-conflict'], { auditId: id });
    }
    return {
      ok: true,
      policyVersion: AGENT_AUTONOMY_RECEIPT_LEDGER_POLICY_VERSION,
      status: 'RECEIPT_ALREADY_LOGGED',
      duplicate: true,
      auditId: id,
      createdAt: existing?.detail?.createdAt || existing?.createdAt || null
    };
  }
}
