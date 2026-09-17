// The V7 gap ledger: what is still open, decided by running a check rather than
// by reading a label.
//
// The contract this implements is three sentences long and all three are about
// the same failure: "A label never closes a gap. A stale artifact never closes a
// gap. A self-authored claim never closes an external gap."
//
// So no gap here carries a status field that anyone can edit. Each gap owns a
// check that reads the filesystem, runs a doctor, or asks git, and the status is
// whatever that check returns at the exact head it ran against. Editing this
// file cannot close anything; it can only change what gets measured.
//
// The second discipline is the classification. A gap is SOFTWARE only when
// somebody in this session could close it by writing code. Everything else
// names the specific external fact that is missing -- founder decision, source
// artifact, customer response, provider acceptance -- because a software team
// that calls an external blocker "in progress" will spend a year on it.

export const V7_GAP_LEDGER_VERSION = 'uberbond.v7-gap-ledger.v1';

export const GAP_STATUSES = Object.freeze([
  'OPEN',
  'CLOSED',
  'SUPERSEDED',
  'REJECTED_WITH_EVIDENCE',
  'EXTERNAL_BLOCKED',
  'FOUNDER_ONLY'
]);

// The completion law's list of what may legitimately remain unresolved. A gap
// claiming one of these is claiming reality is in the way, so the claim has to
// name which reality.
export const EXTERNAL_CLASSES = Object.freeze([
  'EXTERNAL_BLOCKED',
  'FOUNDER_ONLY',
  'ELAPSED_TIME',
  'PHYSICAL_ACTION',
  'LEGAL_FACT',
  'CUSTOMER_RESPONSE',
  'PROVIDER_ACCEPTANCE',
  'PAYMENT_OR_SPEND',
  'EXTERNAL_SOURCE_ARTIFACT'
]);

const REQUIRED_FIELDS = Object.freeze([
  'id', 'title', 'family', 'statement', 'whyItMatters', 'status', 'dependencies',
  'conflicts', 'sourceEvidence', 'counterEvidence', 'implementationPath',
  'testsRequired', 'externalEvidenceRequired', 'authorityRequired', 'nextExperiment',
  'unblockCondition', 'owner', 'lastVerifiedSha', 'lastVerifiedAt', 'closureEvidence'
]);

/**
 * Runs one gap's check and returns the row the ledger will carry.
 *
 * A check that throws is recorded as CHECK_FAILED rather than silently becoming
 * OPEN or CLOSED. An unmeasurable gap is a third thing, and collapsing it into
 * either of the other two is how a ledger starts lying.
 */
export function evaluateGap(definition, context) {
  const base = {
    dependencies: [], conflicts: [], counterEvidence: [], testsRequired: [],
    externalEvidenceRequired: null, authorityRequired: null, nextExperiment: null,
    closureEvidence: null, owner: 'UBERBOND_SOFTWARE_FACTORY',
    ...definition
  };
  let verdict;
  try {
    verdict = definition.check(context) || {};
  } catch (error) {
    return {
      ...base,
      check: undefined,
      status: 'OPEN',
      checkState: 'CHECK_FAILED',
      sourceEvidence: [`check threw: ${error.message}`],
      lastVerifiedSha: context.sourceSha,
      lastVerifiedAt: context.generatedAt
    };
  }

  if (!GAP_STATUSES.includes(verdict.status)) {
    return {
      ...base,
      check: undefined,
      status: 'OPEN',
      checkState: 'CHECK_RETURNED_UNKNOWN_STATUS',
      sourceEvidence: [`check returned status ${JSON.stringify(verdict.status)}`],
      lastVerifiedSha: context.sourceSha,
      lastVerifiedAt: context.generatedAt
    };
  }

  // An external claim has to name which external fact. "EXTERNAL_BLOCKED,
  // reason: pending" is the label this contract forbids.
  if (EXTERNAL_CLASSES.includes(verdict.status) && !verdict.unblockCondition && !base.unblockCondition) {
    return {
      ...base,
      check: undefined,
      status: 'OPEN',
      checkState: 'EXTERNAL_CLAIM_WITHOUT_UNBLOCK_CONDITION',
      sourceEvidence: ['a gap may not claim an external blocker without naming what would unblock it'],
      lastVerifiedSha: context.sourceSha,
      lastVerifiedAt: context.generatedAt
    };
  }

  return {
    ...base,
    check: undefined,
    status: verdict.status,
    checkState: 'MEASURED',
    sourceEvidence: verdict.sourceEvidence ?? base.sourceEvidence ?? [],
    counterEvidence: verdict.counterEvidence ?? base.counterEvidence,
    closureEvidence: verdict.closureEvidence ?? base.closureEvidence,
    unblockCondition: verdict.unblockCondition ?? base.unblockCondition ?? null,
    measured: verdict.measured ?? null,
    lastVerifiedSha: context.sourceSha,
    lastVerifiedAt: context.generatedAt
  };
}

/** Every required field present, so a partially-filled gap fails loudly. */
export function validateGapRow(row) {
  const missing = REQUIRED_FIELDS.filter(field => row[field] === undefined);
  return { ok: missing.length === 0, missing };
}

export function summarizeGaps(rows) {
  const byStatus = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  const open = rows.filter(row => row.status === 'OPEN');
  // Software-open is the number that decides whether this program may enter
  // Perpetual Frontier. External and founder-only gaps do not count toward it,
  // which is exactly why claiming one has to be earned by naming the blocker.
  const softwareOpen = open.filter(row => row.family === 'SOFTWARE').length;
  const unmeasured = rows.filter(row => row.checkState !== 'MEASURED').length;
  return {
    total: rows.length,
    byStatus,
    softwareOpen,
    externalOpen: rows.filter(row => EXTERNAL_CLASSES.includes(row.status)).length,
    unmeasured,
    // The completion law's own condition, computed rather than asserted.
    sourceSideComplete: softwareOpen === 0 && unmeasured === 0
  };
}
