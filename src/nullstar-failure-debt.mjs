// The failures this project is carrying, written down where they cannot be
// quietly forgotten.
//
// A defect found and fixed inside one session leaves no trace once the commit
// scrolls away. The next session rediscovers it, or worse, reintroduces it.
// This ledger keeps each failure with its root cause and the regression test
// that now stops it, and refuses to let an entry close without that test.

export const NULLSTAR_FAILURE_DEBT_VERSION = 'uberbond.nullstar-failure-debt.v1';

export const FAILURE_STATUSES = Object.freeze([
  'OPEN',
  'REPAIR_IN_PROGRESS',
  'RETEST_REQUIRED',
  'CLOSED_WITH_PROOF',
  'EXTERNAL_BLOCKED'
]);

export const FAILURE_CLASSES = Object.freeze([
  'FALSE_COMPLETION_CLAIM',
  'CIRCULAR_EVIDENCE',
  'PROSE_PARSING_OBSERVER',
  'SELF_REFERENTIAL_OBSERVATION',
  'TAUTOLOGICAL_INSTRUMENT',
  'EVIDENCE_REUSE',
  'STALE_RECEIPT',
  'UNEXPLAINED_NULL',
  'SUMMARY_CONTRADICTS_DATA',
  'UNTESTED_PRODUCTION_PATH',
  'EPISTEMIC_INFLATION',
  'MISSION_DRIFT',
  'BLOCKER_LOSS',
  'MAGIC_ZERO'
]);

export const SEVERITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

/**
 * Record one failure.
 *
 * Closing requires a regression test and a repair commit. That is the rule
 * that turns this from a list of regrets into something that prevents
 * recurrence: a failure cannot be marked closed because it feels handled.
 */
export function recordFailure({
  id = null,
  timestamp = null,
  sourceSha = null,
  mission = null,
  gate = null,
  expected = null,
  observed = null,
  failureClass = null,
  rootCause = null,
  severity = null,
  regressionTest = null,
  repairCommit = null,
  status = null,
  supersededBy = null,
  evidenceRefs = []
} = {}) {
  const reasonCodes = [];
  const failureId = text(id, 200);
  if (!failureId) reasonCodes.push('failure-id-required');
  if (!text(timestamp, 60)) reasonCodes.push('timestamp-required');
  if (!text(sourceSha, 60)) reasonCodes.push('source-sha-required');
  if (!text(mission, 300)) reasonCodes.push('mission-required');
  if (!text(gate, 300)) reasonCodes.push('gate-required');
  if (!text(expected, 2000)) reasonCodes.push('expected-required');
  if (!text(observed, 2000)) reasonCodes.push('observed-required');
  if (!FAILURE_CLASSES.includes(String(failureClass ?? ''))) reasonCodes.push('known-failure-class-required');
  if (!SEVERITIES.includes(String(severity ?? ''))) reasonCodes.push('known-severity-required');
  if (!FAILURE_STATUSES.includes(String(status ?? ''))) reasonCodes.push('known-status-required');

  // A failure with no diagnosed cause will be repaired at the symptom and come
  // back wearing a different shape.
  if (!text(rootCause, 2000)) reasonCodes.push('root-cause-required');

  if (status === 'CLOSED_WITH_PROOF') {
    if (!text(regressionTest, 500)) reasonCodes.push('closing-requires-a-regression-test-that-would-catch-it-again');
    if (!text(repairCommit, 60)) reasonCodes.push('closing-requires-the-repair-commit');
  }
  if (status === 'EXTERNAL_BLOCKED' && !text(supersededBy, 500) && !text(rootCause, 2000)) {
    reasonCodes.push('an-externally-blocked-failure-must-name-what-blocks-it');
  }

  if (reasonCodes.length) return fail('FAILURE_RECORD_INVALID', reasonCodes, { failureId });

  return {
    ok: true,
    status: 'FAILURE_RECORDED',
    id: failureId,
    timestamp: text(timestamp, 60),
    sourceSha: text(sourceSha, 60),
    mission: text(mission, 300),
    gate: text(gate, 300),
    expected: text(expected, 2000),
    observed: text(observed, 2000),
    failureClass,
    rootCause: text(rootCause, 2000),
    severity,
    regressionTest: text(regressionTest, 500),
    repairCommit: text(repairCommit, 60),
    entryStatus: status,
    supersededBy: text(supersededBy, 500),
    evidenceRefs: (Array.isArray(evidenceRefs) ? evidenceRefs : []).map(ref => text(ref, 500)).filter(Boolean),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compile the ledger.
 *
 * Entries are never dropped. A previous ledger's ids must all still be present,
 * so a failure cannot leave the record by being omitted from the next write.
 */
export function compileFailureDebt({ failures = [], previousIds = [], sourceSha = null, generatedAt = new Date().toISOString() } = {}) {
  const rows = (Array.isArray(failures) ? failures : []).filter(row => row?.ok);
  const rejected = (Array.isArray(failures) ? failures : []).filter(row => row && !row.ok);
  if (rejected.length) {
    return fail('FAILURE_DEBT_INVALID', ['every-failure-entry-must-be-valid'], {
      rejectedReasons: rejected.flatMap(row => row.reasonCodes ?? [])
    });
  }
  if (!text(sourceSha, 60)) return fail('FAILURE_DEBT_INVALID', ['source-sha-required']);

  const ids = rows.map(row => row.id);
  if (new Set(ids).size !== ids.length) return fail('FAILURE_DEBT_INVALID', ['duplicate-failure-id']);

  const lost = (Array.isArray(previousIds) ? previousIds : []).filter(id => !ids.includes(id));
  if (lost.length) {
    return fail('FAILURE_DEBT_INVALID', lost.map(id => `failure-may-not-be-removed:${id}`), {
      note: 'A failure leaves the ledger only by being closed with proof, never by being omitted from the next write.'
    });
  }

  const byStatus = Object.fromEntries(FAILURE_STATUSES.map(status => [status, rows.filter(row => row.entryStatus === status).length]));
  const open = rows.filter(row => ['OPEN', 'REPAIR_IN_PROGRESS', 'RETEST_REQUIRED'].includes(row.entryStatus));

  return {
    ok: true,
    status: 'FAILURE_DEBT_COMPILED',
    version: NULLSTAR_FAILURE_DEBT_VERSION,
    sourceSha: text(sourceSha, 60),
    generatedAt,
    counts: { total: rows.length, byStatus, openRequiringWork: open.length },
    openIds: open.map(row => row.id),
    failures: rows,
    law: 'AN ENTRY CLOSES ONLY WITH A REGRESSION TEST AND A REPAIR COMMIT. NOTHING LEAVES THIS LEDGER BY BEING OMITTED.',
    businessEffectAuthority: 'NONE'
  };
}
