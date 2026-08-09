/**
 * Provider-neutral external-effect adapter contract. V9's execution layer
 * (external-effect-dispatcher.mjs, external-effect-recovery.mjs) depends
 * only on this contract, never on a specific provider. null-sink-v2.mjs
 * implements it for testing; a real Gmail adapter would implement it later
 * without changing the dispatcher or recovery worker (see
 * V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md for why this mission
 * does not attempt that implementation).
 *
 * Four methods, matching this mission's required shape exactly:
 *   prepare(effectIntent)      -> a preparedEffect the adapter can dispatch,
 *                                 computed BEFORE any network I/O. This is
 *                                 where a provider-independent effect
 *                                 identity is attached if the adapter
 *                                 generates/needs one (e.g. a caller-set
 *                                 Message-ID for Gmail).
 *   dispatch(preparedEffect)   -> performs the actual provider call. May
 *                                 throw (network error, timeout) -- the
 *                                 dispatcher treats a thrown dispatch() as
 *                                 UNCERTAIN, never as REJECTED, because a
 *                                 thrown error before a response is received
 *                                 proves nothing about what the provider did.
 *   reconcile(effectIdentity)  -> queries the provider (or, for the
 *                                 simulator, the durable provider-side
 *                                 ledger) for independent evidence of what
 *                                 actually happened, without ever
 *                                 resubmitting the effect.
 *   classifyOutcome(evidence)  -> pure function: provider evidence object ->
 *                                 one of ADAPTER_OUTCOMES. Never trusts an
 *                                 unstructured boolean; the evidence object
 *                                 itself carries acquisition method and
 *                                 lifecycle so this classification is
 *                                 auditable after the fact.
 */

export const ADAPTER_OUTCOMES = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  UNCERTAIN: 'UNCERTAIN',
  RECONCILED_ACCEPTED: 'RECONCILED_ACCEPTED',
  RECONCILED_REJECTED: 'RECONCILED_REJECTED',
  NOT_FOUND: 'NOT_FOUND',
  AMBIGUOUS: 'AMBIGUOUS'
});

export class ExternalEffectAdapterError extends Error {
  constructor(message, code = 'EXTERNAL_EFFECT_ADAPTER_ERROR') {
    super(message);
    this.name = 'ExternalEffectAdapterError';
    this.code = code;
  }
}

/**
 * Abstract base. Every method throws NOT_IMPLEMENTED by default so a
 * partially-built adapter fails loudly rather than silently behaving like a
 * no-op provider.
 */
export class ExternalEffectAdapter {
  get providerName() {
    throw new ExternalEffectAdapterError('providerName getter must be implemented', 'NOT_IMPLEMENTED');
  }

  async prepare(_effectIntent) {
    throw new ExternalEffectAdapterError('prepare() must be implemented', 'NOT_IMPLEMENTED');
  }

  async dispatch(_preparedEffect) {
    throw new ExternalEffectAdapterError('dispatch() must be implemented', 'NOT_IMPLEMENTED');
  }

  async reconcile(_effectIdentity) {
    throw new ExternalEffectAdapterError('reconcile() must be implemented', 'NOT_IMPLEMENTED');
  }

  classifyOutcome(_providerEvidence) {
    throw new ExternalEffectAdapterError('classifyOutcome() must be implemented', 'NOT_IMPLEMENTED');
  }
}
