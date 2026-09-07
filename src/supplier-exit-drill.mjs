// Proving UberBond can leave a supplier, by actually leaving one.
//
// Every system of this kind claims portability and almost none has tested it.
// The claim is cheap because the failure is invisible until the day it is
// catastrophic: the export runs, produces something, and nobody ever restored
// from it. A backup nobody has restored is not a backup, it is a file.
//
// So this module does not score portability. It runs the three steps that
// actually answer the question and refuses to pass unless each produced
// evidence:
//
//   RESTORE  -- bytes came back, and they are the bytes that went in
//   CUTOVER  -- the restored copy is the one being used
//   ROLLBACK -- and the original is still reachable afterwards
//
// The third is the one usually skipped, and skipping it turns a drill into a
// one-way trip: a cutover you cannot undo is not a rehearsal, it is a
// migration you did without deciding to.
//
// What this rehearses is state portability on owned local infrastructure. It is
// deliberately NOT a provider cutover -- that needs authorized external
// infrastructure, and asserting it here from a local drill would be exactly the
// kind of manufactured proof the canon forbids.
import { createHash } from 'node:crypto';

export const SUPPLIER_EXIT_DRILL_VERSION = 'uberbond.supplier-exit-drill.v1';

/** The steps a drill must actually perform, in order. */
export const DRILL_STEPS = Object.freeze(['EXPORT', 'RESTORE', 'CUTOVER', 'ROLLBACK']);

/** What a drill can and cannot establish. */
export const DRILL_SCOPES = Object.freeze({
  LOCAL_STATE_PORTABILITY: {
    proves: 'State can be exported, restored byte-identically, cut over to, and rolled back from.',
    doesNotProve: 'That any replacement provider works, is configured, or would accept the load.'
  },
  AUTHORIZED_PROVIDER_CUTOVER: {
    proves: 'A named authorized provider accepted the restored state and served from it.',
    doesNotProve: 'That the provider will remain available, or that cost and latency are acceptable.'
  }
});

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/** Content digest over a set of named byte payloads. */
export function stateDigest(entries = []) {
  const rows = (Array.isArray(entries) ? entries : [])
    .map(row => [text(row?.name, 400), createHash('sha256').update(String(row?.bytes ?? '')).digest('hex')])
    .filter(([name]) => name)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), fileCount: rows.length, files: rows };
}

/**
 * Judges a drill from the evidence each step actually produced.
 *
 * Every step must supply observed bytes or an observed absence. A step that
 * reports success without evidence is treated as not run -- which is the whole
 * difference between a drill and a claim, and the reason `ok` is computed here
 * rather than passed in.
 */
export function judgeExitDrill({ supplier = null, scope = null, steps = {}, replacement = null, now = new Date() } = {}) {
  const name = text(supplier, 240);
  if (!name) return fail('EXIT_DRILL_INVALID', ['supplier-required']);
  if (!DRILL_SCOPES[scope]) return fail('EXIT_DRILL_INVALID', ['valid-drill-scope-required'], { scopes: Object.keys(DRILL_SCOPES) });

  const missing = DRILL_STEPS.filter(step => !steps?.[step]);
  if (missing.length) {
    return fail('EXIT_DRILL_INCOMPLETE', ['every-drill-step-must-run'], {
      supplier: name, missing,
      note: missing.includes('ROLLBACK')
        ? 'A cutover with no rollback is not a rehearsal; it is a migration nobody decided to make.'
        : 'A step that did not run cannot be reported as passed.'
    });
  }

  const exported = steps.EXPORT;
  const restored = steps.RESTORE;

  // The question the whole drill exists to answer. Comparing digests rather
  // than trusting a boolean, because "restore succeeded" is exactly the
  // reassuring thing a broken restore reports.
  const identical = Boolean(exported?.digest) && exported.digest === restored?.digest;
  if (!identical) {
    return fail('EXIT_DRILL_FAILED', ['restored-state-does-not-match-export'], {
      supplier: name,
      exportDigest: exported?.digest ?? null,
      restoreDigest: restored?.digest ?? null,
      exportedFiles: exported?.fileCount ?? 0,
      restoredFiles: restored?.fileCount ?? 0
    });
  }
  if (!exported.fileCount) {
    // An empty export matches an empty restore perfectly and proves nothing.
    return fail('EXIT_DRILL_FAILED', ['export-was-empty'], {
      supplier: name, note: 'An empty export restores perfectly and establishes nothing.'
    });
  }

  const cutoverServed = steps.CUTOVER?.servedFromRestoredCopy === true;
  const rolledBack = steps.ROLLBACK?.originalReachable === true;
  const reasonCodes = [];
  if (!cutoverServed) reasonCodes.push('cutover-did-not-serve-from-the-restored-copy');
  if (!rolledBack) reasonCodes.push('original-not-reachable-after-rollback');
  if (reasonCodes.length) return fail('EXIT_DRILL_FAILED', reasonCodes, { supplier: name });

  return {
    ok: true,
    status: 'EXIT_DRILL_PASSED',
    supplier: name,
    scope,
    digest: exported.digest,
    fileCount: exported.fileCount,
    ranAt: new Date(now).toISOString(),
    // A replacement is recorded but never required to pass: portability and
    // having somewhere to go are different facts, and merging them would let a
    // configured provider make an untested export look proven.
    replacement: text(replacement, 240) || null,
    replacementConfigured: Boolean(text(replacement, 240)),
    proves: DRILL_SCOPES[scope].proves,
    doesNotProve: DRILL_SCOPES[scope].doesNotProve,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Which suppliers UberBond could actually survive losing.
 *
 * A supplier with no passing drill is unproven, not safe. Reported by name
 * because an aggregate score would let one untested critical dependency hide
 * behind nine rehearsed trivial ones.
 */
export function survivalPosture(drills = []) {
  const rows = (Array.isArray(drills) ? drills : []).filter(row => row && text(row.supplier, 240));
  const passed = rows.filter(row => row.ok === true && row.status === 'EXIT_DRILL_PASSED');
  const failed = rows.filter(row => row.ok !== true);

  return {
    ok: true,
    status: 'SURVIVAL_POSTURE',
    drillsRun: rows.length,
    survivable: passed.map(row => row.supplier),
    unproven: failed.map(row => ({ supplier: row.supplier ?? null, status: row.status ?? 'NOT_RUN' })),
    law: 'A_SUPPLIER_WITH_NO_PASSING_DRILL_IS_UNPROVEN_NOT_SAFE',
    truthBoundary: 'A PASSING DRILL PROVES THE REHEARSED SCOPE ONLY. IT IS NOT PROOF OF PROVIDER AVAILABILITY, COST, OR LOAD.',
    businessEffectAuthority: 'NONE'
  };
}
