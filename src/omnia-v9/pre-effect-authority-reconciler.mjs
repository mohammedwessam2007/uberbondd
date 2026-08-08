import { sha256 } from './canonical.mjs';
import { verifyIntent } from './kernel.mjs';
import { verifyExecutionReceiptShadow } from './execution-receipt-shadow.mjs';
import { buildAuthorizationBoundExecutionReceipt } from './authorization-bound-receipt.mjs';
import { proveReservedBefore } from './authority-transition-ledger.mjs';

function finiteTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function incomplete(reason, detail = {}) {
  return { status: 'INCOMPLETE', reconciled: false, reason, detail };
}

function rowTimeBefore(row, boundaryMs) {
  const created = finiteTime(row?.created_at);
  return created != null && created <= boundaryMs;
}

function contentTimeBefore(value, boundaryMs) {
  const ms = finiteTime(value);
  return ms != null && ms <= boundaryMs;
}

export async function reconcilePreEffectAuthority({ pool, shadowObservation, executionReceipt, bindingStore = null, transitionProofResolver = proveReservedBefore }) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('pool.query is required');
  if (typeof transitionProofResolver !== 'function') throw new TypeError('transitionProofResolver must be a function');

  const receiptVerification = verifyExecutionReceiptShadow(executionReceipt);
  if (!receiptVerification.ok) return incomplete('execution-receipt-invalid', receiptVerification);

  if (!shadowObservation || typeof shadowObservation !== 'object') return incomplete('missing-pre-effect-shadow-observation');
  if (shadowObservation.schemaVersion !== 'omnia.v9.outbound-final-shadow-observation.p4') return incomplete('shadow-observation-schema-invalid');
  if (shadowObservation.status !== 'OBSERVED') return incomplete('shadow-observation-not-observed', { status: shadowObservation.status || null });
  if (shadowObservation.decision !== 'ALLOW') return incomplete('shadow-observation-not-allow', { decision: shadowObservation.decision || null });
  if (shadowObservation.reservationId !== executionReceipt.reservation?.id) return incomplete('reservation-observation-receipt-mismatch');
  if (sha256(shadowObservation) !== executionReceipt.preEffectObservationDigest) return incomplete('shadow-observation-digest-mismatch');
  if (String(shadowObservation.contextDigest || '') !== String(executionReceipt.preEffectContextDigest || '')) return incomplete('shadow-context-digest-mismatch');

  const observedMs = finiteTime(shadowObservation.observedAt);
  const occurredMs = finiteTime(executionReceipt.occurredAt);
  if (observedMs == null || occurredMs == null) return incomplete('invalid-effect-timestamps');
  if (observedMs > occurredMs) return incomplete('pre-effect-observation-occurs-after-effect');

  const reservationId = String(executionReceipt.reservation?.id || '');
  const idempotencyKey = String(executionReceipt.reservation?.idempotencyKey || '');
  if (!reservationId || !idempotencyKey) return incomplete('consequence-identity-incomplete');

  const p6Result = await pool.query(
    `SELECT reservation_id,receipt_digest,tenant_id,created_at
     FROM omnia_v9_execution_receipt_bindings
     WHERE reservation_id=$1 AND receipt_digest=$2`,
    [reservationId, executionReceipt.receiptDigest]
  );
  const p6 = p6Result.rows?.[0] || null;
  if (!p6) return incomplete('missing-durable-p6-receipt-binding');

  const authorityResult = await pool.query(
    `SELECT idempotency_key,intent_digest,approval_id,tenant_id,status,created_at,updated_at
     FROM omnia_v9_authority_reservations WHERE idempotency_key=$1`,
    [idempotencyKey]
  );
  const authority = authorityResult.rows?.[0] || null;
  if (!authority) return incomplete('missing-pre-effect-authority-reservation');
  if (!rowTimeBefore(authority, observedMs)) return incomplete('authority-reservation-not-proven-before-effect', { createdAt: authority.created_at || null });
  if (!['RESERVED', 'COMMITTED', 'UNCERTAIN'].includes(String(authority.status || ''))) {
    return incomplete('authority-reservation-not-executable', { status: authority.status || null });
  }
  if (authority.tenant_id !== p6.tenant_id) return incomplete('authority-p6-tenant-mismatch');

  const transitionProof = await transitionProofResolver({
    pool,
    idempotencyKey,
    boundaryAt: shadowObservation.observedAt,
    tenantId: authority.tenant_id,
    intentDigest: authority.intent_digest,
    approvalId: authority.approval_id
  });
  if (!transitionProof?.ok) {
    return incomplete('authority-transition-proof-invalid', {
      reason: transitionProof?.reason || 'transition-proof-missing',
      detail: transitionProof?.detail || {}
    });
  }

  const intentResult = await pool.query(
    `SELECT object_id,tenant_id,digest,data,created_at FROM omnia_v9_objects
     WHERE object_type='ACTION_INTENT' AND object_id=$1`,
    [authority.intent_digest]
  );
  const intentRow = intentResult.rows?.[0] || null;
  if (!intentRow) return incomplete('missing-durable-action-intent');
  if (!rowTimeBefore(intentRow, observedMs)) return incomplete('action-intent-not-proven-before-effect', { createdAt: intentRow.created_at || null });
  const intent = intentRow.data;
  const intentVerification = verifyIntent(intent, { now: new Date(observedMs) });
  if (!intentVerification.ok) return incomplete('action-intent-invalid-at-pre-effect-boundary', { errors: intentVerification.errors });
  if (intentRow.tenant_id !== authority.tenant_id || intent?.tenantId !== authority.tenant_id) return incomplete('intent-authority-tenant-mismatch');
  if (intent?.intentDigest !== authority.intent_digest || intentRow.digest !== authority.intent_digest) return incomplete('intent-authority-digest-mismatch');
  if (intent?.idempotencyKey !== idempotencyKey) return incomplete('intent-consequence-idempotency-mismatch');
  if (!contentTimeBefore(intent?.createdAt, observedMs)) return incomplete('intent-content-created-after-observation');

  const approvalResult = await pool.query(
    `SELECT object_id,tenant_id,digest,data,created_at FROM omnia_v9_objects
     WHERE object_type='OWNER_APPROVAL' AND object_id=$1`,
    [authority.approval_id]
  );
  const approvalRow = approvalResult.rows?.[0] || null;
  if (!approvalRow) return incomplete('missing-durable-owner-approval');
  if (!rowTimeBefore(approvalRow, observedMs)) return incomplete('owner-approval-not-proven-before-effect', { createdAt: approvalRow.created_at || null });
  const approval = approvalRow.data;
  if (approvalRow.tenant_id !== authority.tenant_id || approval?.tenantId !== authority.tenant_id) return incomplete('approval-authority-tenant-mismatch');
  if (approval?.approvalId !== authority.approval_id || approvalRow.digest !== approval?.approvalDigest) return incomplete('approval-authority-identity-mismatch');
  if (!contentTimeBefore(approval?.issuedAt, observedMs)) return incomplete('approval-content-issued-after-observation');
  const notBefore = finiteTime(approval?.notBefore);
  const expiresAt = finiteTime(approval?.expiresAt);
  if (notBefore == null || expiresAt == null || notBefore > observedMs || expiresAt <= observedMs) return incomplete('approval-not-active-at-pre-effect-boundary');

  const decisionsResult = await pool.query(
    `SELECT object_id,tenant_id,digest,data,created_at FROM omnia_v9_objects
     WHERE object_type='AUTHORIZATION_DECISION'
       AND tenant_id=$1
       AND data->>'intentDigest'=$2
       AND data->>'approvalId'=$3
       AND data->>'decision'='ALLOW'
       AND created_at <= $4::timestamptz
     ORDER BY created_at DESC`,
    [authority.tenant_id, authority.intent_digest, authority.approval_id, shadowObservation.observedAt]
  );

  const candidates = (decisionsResult.rows || []).filter(row => {
    const decision = row.data || {};
    return row.digest === decision.decisionDigest &&
      row.object_id === decision.decisionDigest &&
      decision.policyDigest === shadowObservation.policyDigest &&
      decision.constitutionDigest === shadowObservation.constitutionDigest &&
      contentTimeBefore(decision.decidedAt, observedMs);
  });

  if (candidates.length === 0) return incomplete('missing-matching-pre-effect-authorization-decision');
  if (candidates.length > 1) return incomplete('ambiguous-pre-effect-authorization-decisions', { count: candidates.length });

  const decisionRow = candidates[0];
  const authorizationDecision = decisionRow.data;
  if (!shadowObservation.policyDigest || !shadowObservation.constitutionDigest) return incomplete('shadow-observation-missing-policy-or-constitution-digest');

  let binding;
  try {
    binding = buildAuthorizationBoundExecutionReceipt({
      tenantId: authority.tenant_id,
      intent,
      authorizationDecision,
      executionReceipt,
      boundAt: executionReceipt.occurredAt
    });
  } catch (error) {
    return incomplete('p7-binding-construction-failed', { code: error?.code || null, message: String(error?.message || error) });
  }

  if (bindingStore) {
    try {
      await bindingStore.persistOnce({ binding, intent, authorizationDecision, executionReceipt });
    } catch (error) {
      return incomplete('p7-binding-persistence-failed', { code: error?.code || null, message: String(error?.message || error) });
    }
  }

  return {
    status: 'RECONCILED',
    reconciled: true,
    binding,
    evidence: {
      reservationId,
      receiptDigest: executionReceipt.receiptDigest,
      preEffectObservationDigest: executionReceipt.preEffectObservationDigest,
      authorityReservation: {
        idempotencyKey: authority.idempotency_key,
        intentDigest: authority.intent_digest,
        approvalId: authority.approval_id,
        tenantId: authority.tenant_id,
        createdAt: authority.created_at
      },
      reservedTransition: {
        eventDigest: transitionProof.reservedEvent?.eventDigest || '',
        sequenceNo: transitionProof.reservedEvent?.sequenceNo || null,
        occurredAt: transitionProof.reservedEvent?.occurredAt || null,
        headDigest: transitionProof.headDigest || ''
      },
      intentCreatedAt: intentRow.created_at,
      approvalCreatedAt: approvalRow.created_at,
      authorizationDecisionCreatedAt: decisionRow.created_at
    }
  };
}
