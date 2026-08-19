/**
 * The durable state model for an external-effect execution -- one row per
 * logical external consequence (e.g. one email). This module is the single
 * source of truth for legal transitions; migrations/011_omnia_v9_external_effect_executions.sql
 * mirrors this exact table in a database trigger so illegal transitions are
 * rejected by Postgres itself, not merely by application convention. See
 * tests/omnia-v9-external-effect-state-machine.test.mjs for a drill that
 * proves the two never drift apart.
 *
 * Naming differs slightly from this mission's suggested state names, where a
 * more precise name was available:
 *   - "NOT_ATTEMPTED" / "ATTEMPT_RESERVED" -> no row exists yet, then PREPARED
 *     (a row exists: the durable execution-intent object plus consumed
 *     authority, before any provider call is even attempted).
 *   - "PROVIDER_CONFIRMED" -> PROVIDER_ACCEPTED (this codebase's other
 *     receipt vocabulary already distinguishes ACCEPTED from higher epistemic
 *     claims like DELIVERED; see V9_EXECUTION_RECEIPT_SEMANTICS.md).
 *   - "RECEIPT_PERSISTED" is not a separate FSM state here: receipt/evidence
 *     persistence is a durable side effect attached to specific transitions
 *     (see external-effect-evidence-store.mjs), not a status of the
 *     execution object itself -- an execution can be PROVIDER_ACCEPTED with
 *     or without evidence already attached, and recovery cares about exactly
 *     that distinction.
 *   - RECONCILING is added (not in the mission's own suggested list) because
 *     the mission's own example transition diagram in section 23 requires it
 *     ("RESULT_UNCERTAIN -> RECONCILING -> RECONCILED_ACCEPTED / ...").
 *   - RECONCILED_NOT_SUBMITTED is a distinct terminal state from
 *     RECONCILED_REJECTED: the provider affirmatively REJECTING a
 *     submission and the provider proving no submission ever arrived are
 *     different facts with a different consequence -- only the latter frees
 *     the business key for a brand-new attempt (see the partial unique
 *     index in migration 011 and the "safe retry policy" section of
 *     V9_EXTERNAL_EFFECT_PROTOCOL.md). The recovery worker still reports
 *     this outcome via the mission's own ABORTED_BEFORE_DISPATCH action
 *     name (V9_EXECUTION_RECOVERY_REPORT.md documents this exact mapping)
 *     even though the underlying execution's terminal status name differs,
 *     to keep the recovery worker's return contract to the six actions
 *     this mission specifies.
 */

export const EXECUTION_STATES = Object.freeze({
  PREPARED: 'PREPARED',
  DISPATCHING: 'DISPATCHING',
  PROVIDER_ACCEPTED: 'PROVIDER_ACCEPTED',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  RESULT_UNCERTAIN: 'RESULT_UNCERTAIN',
  RECONCILING: 'RECONCILING',
  RECONCILED_ACCEPTED: 'RECONCILED_ACCEPTED',
  RECONCILED_REJECTED: 'RECONCILED_REJECTED',
  RECONCILED_NOT_SUBMITTED: 'RECONCILED_NOT_SUBMITTED',
  OWNER_REVIEW_REQUIRED: 'OWNER_REVIEW_REQUIRED',
  ABORTED_BEFORE_DISPATCH: 'ABORTED_BEFORE_DISPATCH'
});

export const ALL_STATES = Object.freeze(Object.values(EXECUTION_STATES));

/**
 * Legal (from -> {to...}) transitions. `null` as a "from" key represents
 * creation (no row exists yet); the only legal creation state is PREPARED.
 */
const LEGAL_TRANSITIONS = new Map([
  [null, new Set(['PREPARED'])],
  ['PREPARED', new Set(['DISPATCHING', 'ABORTED_BEFORE_DISPATCH'])],
  ['DISPATCHING', new Set(['PROVIDER_ACCEPTED', 'PROVIDER_REJECTED', 'RESULT_UNCERTAIN'])],
  ['RESULT_UNCERTAIN', new Set(['RECONCILING'])],
  ['RECONCILING', new Set(['RECONCILED_ACCEPTED', 'RECONCILED_REJECTED', 'RECONCILED_NOT_SUBMITTED', 'OWNER_REVIEW_REQUIRED', 'RESULT_UNCERTAIN'])],
  ['OWNER_REVIEW_REQUIRED', new Set(['RECONCILED_ACCEPTED', 'RECONCILED_REJECTED', 'RECONCILED_NOT_SUBMITTED', 'RECONCILING'])],
  ['PROVIDER_ACCEPTED', new Set()],
  ['PROVIDER_REJECTED', new Set()],
  ['RECONCILED_ACCEPTED', new Set()],
  ['RECONCILED_REJECTED', new Set()],
  ['RECONCILED_NOT_SUBMITTED', new Set()],
  ['ABORTED_BEFORE_DISPATCH', new Set()]
]);

export const TERMINAL_STATES = Object.freeze(new Set([
  'PROVIDER_ACCEPTED', 'PROVIDER_REJECTED', 'RECONCILED_ACCEPTED', 'RECONCILED_REJECTED', 'RECONCILED_NOT_SUBMITTED', 'ABORTED_BEFORE_DISPATCH'
]));

/** Terminal states that free a business key for a brand-new execution attempt -- see migration 011's partial unique index. */
export const BUSINESS_KEY_RELEASING_STATES = Object.freeze(new Set(['ABORTED_BEFORE_DISPATCH', 'RECONCILED_NOT_SUBMITTED']));

/** Every dispatch-attempted state: any state reachable only after a real provider call may have begun. */
export const DISPATCH_ATTEMPTED_STATES = Object.freeze(new Set([
  'DISPATCHING', 'PROVIDER_ACCEPTED', 'PROVIDER_REJECTED', 'RESULT_UNCERTAIN', 'RECONCILING', 'OWNER_REVIEW_REQUIRED',
  'RECONCILED_ACCEPTED', 'RECONCILED_REJECTED', 'RECONCILED_NOT_SUBMITTED'
]));

export function isLegalTransition(from, to) {
  if (!ALL_STATES.includes(to)) return false;
  const allowed = LEGAL_TRANSITIONS.get(from ?? null);
  return !!allowed && allowed.has(to);
}

export function isTerminal(status) {
  return TERMINAL_STATES.has(status);
}

export function wasDispatchAttempted(status) {
  return DISPATCH_ATTEMPTED_STATES.has(status);
}

/** Every legal (from,to) pair, including creation (from=null). Used by both the DB-agreement test and the migration's own comment for cross-reference. */
export function listLegalTransitionPairs() {
  const pairs = [];
  for (const [from, toSet] of LEGAL_TRANSITIONS.entries()) {
    for (const to of toSet) pairs.push([from, to]);
  }
  return pairs;
}

export function listAllTransitionPairsForExhaustiveCheck() {
  const pairs = [];
  const froms = [null, ...ALL_STATES];
  for (const from of froms) {
    for (const to of ALL_STATES) pairs.push([from, to]);
  }
  return pairs;
}
