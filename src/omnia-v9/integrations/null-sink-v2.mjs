import crypto from 'node:crypto';
import { ExternalEffectAdapter, ADAPTER_OUTCOMES } from './external-effect-adapter.mjs';

/**
 * Null Sink V2 -- an uncertainty-modeling simulator, replacing the
 * deterministic-only null-consequence-adapter.mjs (which always accepted
 * immediately and had no notion of a lost response, a timeout, or a
 * delayed/ambiguous reconciliation). This is the adapter this mission's
 * crash-injection harness, property run, and recovery-worker tests exercise
 * against; it implements the exact same provider-neutral contract a real
 * Gmail adapter would (external-effect-adapter.mjs), so nothing about the
 * dispatcher or recovery worker is null-sink-specific.
 *
 * Its "provider" is omnia_v9_null_provider_ledger -- a real Postgres table,
 * deliberately separate from our own execution-tracking tables, standing in
 * for "the provider's own database": state that would survive OUR process
 * crashing, and that a `reconcile()` call queries independently of whatever
 * our local process remembers. This is what makes the simulated
 * "response lost after provider accepted" scenario honest: the ledger row
 * really exists, dispatch() really throws, and only reconcile() (querying
 * the separate table) can discover the truth -- exactly modeling what a
 * real Gmail rfc822msgid: search would need to do.
 */
export const SIMULATION_MODES = Object.freeze({
  DEFINITE_SUCCESS: 'DEFINITE_SUCCESS',
  DEFINITE_FAILURE: 'DEFINITE_FAILURE',
  RESPONSE_LOST_AFTER_SUCCESS: 'RESPONSE_LOST_AFTER_SUCCESS',
  RESPONSE_LOST_AFTER_FAILURE: 'RESPONSE_LOST_AFTER_FAILURE',
  TIMEOUT_BEFORE_PROVIDER_RECEIPT: 'TIMEOUT_BEFORE_PROVIDER_RECEIPT',
  TIMEOUT_AFTER_PROVIDER_RECEIPT: 'TIMEOUT_AFTER_PROVIDER_RECEIPT',
  DELAYED_RECONCILIATION: 'DELAYED_RECONCILIATION',
  AMBIGUOUS_RECONCILIATION: 'AMBIGUOUS_RECONCILIATION',
  CONTRADICTORY_RECONCILIATION: 'CONTRADICTORY_RECONCILIATION'
});

// Every mode where the LOCAL dispatch response is unavailable and only a
// later, independent reconcile() call can discover the truth (or its
// absence). DELAYED/AMBIGUOUS/CONTRADICTORY_RECONCILIATION model scenarios
// that only manifest during reconciliation, which by definition means the
// original dispatch() could not have returned a clean local answer either
// -- otherwise reconciliation would never be invoked at all.
const RESPONSE_LOST_MODES = new Set([
  SIMULATION_MODES.RESPONSE_LOST_AFTER_SUCCESS,
  SIMULATION_MODES.RESPONSE_LOST_AFTER_FAILURE,
  SIMULATION_MODES.TIMEOUT_AFTER_PROVIDER_RECEIPT,
  SIMULATION_MODES.DELAYED_RECONCILIATION,
  SIMULATION_MODES.AMBIGUOUS_RECONCILIATION,
  SIMULATION_MODES.CONTRADICTORY_RECONCILIATION
]);

export class NullSinkV2Error extends Error {
  constructor(message, code = 'NULL_SINK_V2_ERROR') {
    super(message);
    this.name = 'NullSinkV2Error';
    this.code = code;
  }
}

export class NullSinkV2Adapter extends ExternalEffectAdapter {
  constructor({ pool } = {}) {
    super();
    if (!pool || typeof pool.query !== 'function') throw new NullSinkV2Error('pool.query is required', 'CONFIG');
    this.pool = pool;
    this.dispatchCallCount = 0;
  }

  get providerName() {
    return 'null-sink-v2';
  }

  /** Computed before any provider call -- the stable, provider-independent effect identity. */
  async prepare({ businessKey, providerEffectIdentity }) {
    if (!businessKey || !providerEffectIdentity) throw new NullSinkV2Error('businessKey and providerEffectIdentity are required', 'INVALID_INPUT');
    return { businessKey: String(businessKey), providerEffectIdentity: String(providerEffectIdentity) };
  }

  /**
   * `preparedEffect.simulation.mode` selects the exact uncertain-execution
   * scenario this mission requires Null Sink V2 to model (section 10). The
   * simulated "provider truth" (omnia_v9_null_provider_ledger) is written
   * or withheld according to the mode BEFORE deciding whether to return
   * successfully or throw -- this is what makes reconcile() able to find a
   * true answer even when dispatch() itself throws.
   */
  async dispatch(preparedEffect) {
    this.dispatchCallCount += 1;
    const { businessKey, providerEffectIdentity, simulation = {} } = preparedEffect;
    const mode = simulation.mode || SIMULATION_MODES.DEFINITE_SUCCESS;
    const providerReferenceId = `null-provider-ref-${crypto.randomBytes(8).toString('hex')}`;

    if (mode === SIMULATION_MODES.TIMEOUT_BEFORE_PROVIDER_RECEIPT) {
      // The provider truly never saw this request -- no ledger row at all.
      throw new NullSinkV2Error('simulated timeout before provider receipt', 'SIMULATED_TIMEOUT');
    }

    let outcome = 'ACCEPTED';
    if (mode === SIMULATION_MODES.DEFINITE_FAILURE || mode === SIMULATION_MODES.RESPONSE_LOST_AFTER_FAILURE) outcome = 'REJECTED';

    const ambiguous = mode === SIMULATION_MODES.AMBIGUOUS_RECONCILIATION;
    const contradictory = mode === SIMULATION_MODES.CONTRADICTORY_RECONCILIATION;
    const visibleAfter = mode === SIMULATION_MODES.DELAYED_RECONCILIATION
      ? new Date(Date.now() + (simulation.revealDelayMs ?? 200)).toISOString()
      : null;

    await this.pool.query(
      `INSERT INTO omnia_v9_null_provider_ledger(business_identity,outcome,provider_reference_id,simulation_mode,visible_after,ambiguous,contradictory)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (business_identity) DO NOTHING`,
      [businessKey, outcome, providerReferenceId, mode, visibleAfter, ambiguous, contradictory]
    );

    if (RESPONSE_LOST_MODES.has(mode)) {
      throw new NullSinkV2Error('simulated response loss after provider processed the request', 'SIMULATED_RESPONSE_LOST');
    }

    const observedAt = new Date().toISOString();
    return {
      classification: outcome === 'ACCEPTED' ? ADAPTER_OUTCOMES.ACCEPTED : ADAPTER_OUTCOMES.REJECTED,
      providerReferenceId,
      evidence: {
        businessIdentity: businessKey,
        providerReferenceId,
        observedAt,
        evidenceType: 'DISPATCH_RESPONSE',
        acquisitionMethod: 'null-sink-v2:synchronous-dispatch-response',
        reconciliationSource: '',
        lifecycle: outcome === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
        detail: { simulationMode: mode, providerEffectIdentity }
      }
    };
  }

  /**
   * Independent lookup against the simulated provider-side ledger, exactly
   * as a real Gmail reconciliation worker would run an rfc822msgid: search
   * against Gmail's own mailbox rather than trusting local memory. Never
   * looks at our own execution table.
   */
  async reconcile({ businessKey }) {
    const result = await this.pool.query(`SELECT * FROM omnia_v9_null_provider_ledger WHERE business_identity=$1`, [businessKey]);
    const row = result.rows[0];
    const observedAt = new Date().toISOString();

    if (!row) {
      return {
        businessIdentity: businessKey, providerReferenceId: null, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'null-sink-v2:provider-ledger-lookup',
        reconciliationSource: 'omnia_v9_null_provider_ledger', lifecycle: 'NOT_FOUND', detail: {}
      };
    }
    if (row.contradictory) {
      return {
        businessIdentity: businessKey, providerReferenceId: row.provider_reference_id, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'null-sink-v2:provider-ledger-lookup',
        reconciliationSource: 'omnia_v9_null_provider_ledger', lifecycle: 'AMBIGUOUS',
        detail: { reason: 'contradictory-provider-evidence', simulationMode: row.simulation_mode }
      };
    }
    if (row.ambiguous) {
      return {
        businessIdentity: businessKey, providerReferenceId: row.provider_reference_id, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'null-sink-v2:provider-ledger-lookup',
        reconciliationSource: 'omnia_v9_null_provider_ledger', lifecycle: 'AMBIGUOUS',
        detail: { reason: 'irreducibly-ambiguous-provider-state', simulationMode: row.simulation_mode }
      };
    }
    if (row.visible_after && new Date(row.visible_after).getTime() > Date.now()) {
      return {
        businessIdentity: businessKey, providerReferenceId: null, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'null-sink-v2:provider-ledger-lookup',
        reconciliationSource: 'omnia_v9_null_provider_ledger', lifecycle: 'UNCERTAIN',
        detail: { reason: 'not-yet-visible', visibleAfter: row.visible_after instanceof Date ? row.visible_after.toISOString() : String(row.visible_after) }
      };
    }
    return {
      businessIdentity: businessKey, providerReferenceId: row.provider_reference_id, observedAt,
      evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'null-sink-v2:provider-ledger-lookup',
      reconciliationSource: 'omnia_v9_null_provider_ledger',
      lifecycle: row.outcome === 'ACCEPTED' ? 'RECONCILED_ACCEPTED' : 'RECONCILED_REJECTED',
      detail: { simulationMode: row.simulation_mode }
    };
  }

  /**
   * Pure classification -- never trusts anything but the structured
   * evidence.lifecycle this adapter itself produced (from a dispatch
   * response or a reconciliation lookup, both durable and provenance-bearing).
   */
  classifyOutcome(providerEvidence) {
    const lifecycle = providerEvidence?.lifecycle;
    if (lifecycle === 'ACCEPTED') return ADAPTER_OUTCOMES.ACCEPTED;
    if (lifecycle === 'REJECTED') return ADAPTER_OUTCOMES.REJECTED;
    if (lifecycle === 'RECONCILED_ACCEPTED') return ADAPTER_OUTCOMES.RECONCILED_ACCEPTED;
    if (lifecycle === 'RECONCILED_REJECTED') return ADAPTER_OUTCOMES.RECONCILED_REJECTED;
    if (lifecycle === 'NOT_FOUND') return ADAPTER_OUTCOMES.NOT_FOUND;
    if (lifecycle === 'AMBIGUOUS') return ADAPTER_OUTCOMES.AMBIGUOUS;
    return ADAPTER_OUTCOMES.UNCERTAIN;
  }
}
