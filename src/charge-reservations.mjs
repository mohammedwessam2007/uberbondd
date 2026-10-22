// Charge reservations: the guard behind "never charge the same buyer, finding
// and day twice".
//
// An in-memory Set plus a key-value write cannot do this across runs: two runs
// that read the same snapshot both see the key as free and both charge. A
// reservation must be taken with an atomic insert-if-absent before the charge
// is attempted, and kept after any charge whose outcome is uncertain.
//
// Every store declares the guarantee it actually provides. The sale refuses to
// charge when the declared guarantee is weaker than the one it needs, so a
// missing database means "charge nothing", never "charge and hope".
//
// Row lifecycle, keyed by the sale's idempotency key:
//   reserve  -> PENDING   (atomic; exactly one caller acquires)
//   settle   -> CONFIRMED (provider billed; kept forever)
//            -> UNKNOWN   (outcome uncertain; kept, never retried, reconciled by hand)
//            -> REFUSED   (provider definitely billed nothing; row deleted so a later run may charge)
// A PENDING row left behind by a crashed run is never charged again either.

export const CHARGE_RESERVATIONS_VERSION = 'uberbond.charge-reservations-1.0.0';
export const RESERVATION_GUARANTEES = Object.freeze(['NONE', 'ATOMIC_SINGLE_PROCESS', 'ATOMIC_CROSS_RUN']);
export const SETTLED_STATES = Object.freeze(['CONFIRMED', 'REFUSED', 'UNKNOWN']);

/** True when a store's declared guarantee is at least the required one. */
export function guaranteeSatisfies(declared, required) {
  const have = RESERVATION_GUARANTEES.indexOf(declared);
  const need = RESERVATION_GUARANTEES.indexOf(required);
  if (need < 0) throw new Error(`unknown reservation guarantee ${required}`);
  return have >= need;
}

function assertSettleState(state) {
  if (!SETTLED_STATES.includes(state)) throw new Error(`cannot settle a reservation as ${state}`);
}

/**
 * Atomic within one Node.js process only: the check and the insert run with no
 * await between them. Correct for a single run and for tests; it says nothing
 * about a second process.
 */
export function createProcessChargeReservations() {
  const rows = new Map();
  return {
    guarantee: 'ATOMIC_SINGLE_PROCESS',
    async reserve(key, { runId }) {
      const row = rows.get(key);
      if (row) return { acquired: false, state: row.state };
      rows.set(key, { state: 'PENDING', runId });
      return { acquired: true };
    },
    async settle(key, state, { runId }) {
      assertSettleState(state);
      const row = rows.get(key);
      if (!row || row.runId !== runId || row.state !== 'PENDING') throw new Error('RESERVATION_NOT_HELD');
      if (state === 'REFUSED') rows.delete(key);
      else row.state = state;
    },
    rows: () => [...rows].map(([key, row]) => ({ key, ...row }))
  };
}

export const CHARGE_RESERVATION_TABLE = 'verified_finding_charge_reservations';
export const CHARGE_RESERVATION_DDL = `CREATE TABLE IF NOT EXISTS ${CHARGE_RESERVATION_TABLE} (
  idempotency_key text PRIMARY KEY,
  run_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING', 'CONFIRMED', 'UNKNOWN')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
)`;

/**
 * Atomic across processes, through a SQL primary key: INSERT ... ON CONFLICT
 * DO NOTHING lets exactly one concurrent caller acquire a key. Written for
 * PostgreSQL. query(sql, params) -> { rowCount, rows } (node-postgres shape).
 * Stores only the opaque idempotency key (a hash of buyer, finding and day)
 * and the run id needed to reconcile against the provider's run records.
 */
export function createSqlChargeReservations({ query }) {
  if (typeof query !== 'function') throw new Error('query(sql, params) is required');
  return {
    guarantee: 'ATOMIC_CROSS_RUN',
    async ensureSchema() { await query(CHARGE_RESERVATION_DDL, []); },
    async reserve(key, { runId }) {
      const inserted = await query(`INSERT INTO ${CHARGE_RESERVATION_TABLE} (idempotency_key, run_id, state) VALUES ($1, $2, 'PENDING') ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`, [key, runId]);
      if (inserted.rowCount === 1) return { acquired: true };
      const existing = await query(`SELECT state FROM ${CHARGE_RESERVATION_TABLE} WHERE idempotency_key = $1`, [key]);
      // The holder may have released it between the two statements; not acquiring is still safe.
      return { acquired: false, state: existing.rows[0]?.state ?? 'RELEASED_CONCURRENTLY' };
    },
    async settle(key, state, { runId }) {
      assertSettleState(state);
      const result = state === 'REFUSED'
        ? await query(`DELETE FROM ${CHARGE_RESERVATION_TABLE} WHERE idempotency_key = $1 AND run_id = $2 AND state = 'PENDING'`, [key, runId])
        : await query(`UPDATE ${CHARGE_RESERVATION_TABLE} SET state = $3, settled_at = now() WHERE idempotency_key = $1 AND run_id = $2 AND state = 'PENDING'`, [key, runId, state]);
      if (result.rowCount !== 1) throw new Error('RESERVATION_NOT_HELD');
    },
    /** Rows a person must reconcile against provider run records. */
    async unresolved({ olderThanMinutes = 60 } = {}) {
      const result = await query(`SELECT idempotency_key, run_id, state, reserved_at FROM ${CHARGE_RESERVATION_TABLE} WHERE state = 'UNKNOWN' OR (state = 'PENDING' AND reserved_at < now() - make_interval(mins => $1)) ORDER BY reserved_at`, [olderThanMinutes]);
      return result.rows;
    }
  };
}
