import { sha256 } from '../canonical.mjs';

/**
 * The null consequence sink for the zero-consequence enforcement canary.
 *
 * This file imports nothing from gmail.mjs, nothing that performs network
 * I/O, and holds no credentials. It cannot call Gmail, a payment provider,
 * a DNS API, or any other external system -- not because a conditional
 * inside it decides not to, but because there is no code path in this file
 * capable of reaching one. tests/omnia-v9-null-consequence-adapter.test.mjs
 * asserts this by static inspection of this file's own source text and its
 * import graph, not merely by exercising its behavior at runtime.
 *
 * It implements the smallest execution contract V9 needs to be
 * authoritative over: given a decision has already been gated to ALLOW by
 * the caller, record what would have happened and produce a receipt --
 * never anything that could be confused with delivery. The result constant
 * is deliberately NOT "EMAIL_SENT" or "DELIVERED": those words claim an
 * external effect that never occurred.
 */
export const NULL_SINK_RESULT = 'NULL_SINK_ACCEPTED';

export class NullConsequenceAdapterError extends Error {
  constructor(message, code = 'NULL_CONSEQUENCE_ADAPTER_ERROR') {
    super(message);
    this.name = 'NullConsequenceAdapterError';
    this.code = code;
  }
}

export class NullConsequenceAdapter {
  constructor() {
    this.executions = [];
  }

  /**
   * Executes exactly once per call -- the caller (canary-null-authority.mjs)
   * is responsible for only ever calling this when the gated decision is
   * literally 'ALLOW'. This method does not itself re-check a decision
   * value; it has no decision-checking logic at all, so it cannot be the
   * site of a fail-open bug in decision handling -- that logic lives
   * entirely in the gate, which is unit-tested against every decision value
   * independently of this adapter.
   */
  async execute({ intentDigest, authorizationDigest, tenantId, reservationId, actionClass, attemptedAt }) {
    if (!intentDigest || !tenantId || !reservationId || !actionClass) {
      throw new NullConsequenceAdapterError('intentDigest, tenantId, reservationId and actionClass are required', 'INVALID_INPUT');
    }
    const base = {
      schemaVersion: 'omnia.v9.null-consequence-receipt.v1',
      intentDigest: String(intentDigest),
      authorizationDigest: String(authorizationDigest || ''),
      tenantId: String(tenantId),
      reservationId: String(reservationId),
      actionClass: String(actionClass),
      result: NULL_SINK_RESULT,
      attemptedAt: String(attemptedAt || new Date().toISOString())
    };
    const receiptDigest = sha256(base);
    const record = { ...base, receiptDigest };
    this.executions.push(record);
    return record;
  }

  executionCount() {
    return this.executions.length;
  }
}
