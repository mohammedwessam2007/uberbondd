// 24/7 Continuous Revenue Core, section 12: Launch Command Center Repair.
//
// Disclosed blocker: the "External Launch Command Center" workbook the mission refers to as
// "uploaded" was never actually provided to this session (checked the upload directory and every
// prior scratchpad extraction from this session's earlier missions -- see the final report's
// disclosed-blockers section). This module builds and proves the underlying *structural guarantee*
// instead, against this codebase's own real dashboard (portal/owner-command-center.mjs): "No
// workbook, dashboard, API, or report may display READY while a required gate is false."
//
// Two layers:
//   1. assertNoReadyWhileBlocked -- a cheap, generic guard any renderer can call on its own inputs
//      before producing output, refusing to render a "ready" claim while a blocker list is
//      non-empty. Wired into owner-command-center.mjs#renderOwnerCommandCenter below.
//   2. computeLaunchVerdict -- a pure aggregator over this codebase's own already-built gate
//      functions (deliveryGate, implementationGate, schedulerPreflight, campaign-policy's
//      evaluateSendUnderPolicy, distribution's preflightDistribution), so a caller that wants a
//      single true verdict never has to hand-compute "are all my gates green" and risk it drifting
//      from the gates themselves -- the verdict *is* the gates, not a cached summary of them.
export class LaunchGateError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'LaunchGateError';
    this.code = code;
  }
}

const READY_WORD = /\bready\b/i;

/**
 * Throws if `verdictText` claims readiness ("READY", "Ready to launch", etc. -- any standalone
 * occurrence of the word "ready") while `blockers` is non-empty. This is the literal reproduction
 * of the named defect ("cached READY while required gates were false") turned into a refusal: a
 * caller cannot construct a document that both says ready and lists a blocker, because this
 * function is called before the document is ever produced, not after.
 */
export function assertNoReadyWhileBlocked(verdictText, blockers = []) {
  const text = String(verdictText ?? '');
  if (blockers.length > 0 && READY_WORD.test(text)) {
    throw new LaunchGateError('ready-claimed-while-blocked', `verdict "${text}" claims readiness but ${blockers.length} blocker(s) are present: ${blockers.map(b => b.code || b).join(', ')}`);
  }
  return true;
}

/**
 * Scans an arbitrary rendered output (HTML, JSON, plain text -- "no workbook, dashboard, API, or
 * report" is the mission's own list, so this is intentionally format-agnostic) for a readiness
 * claim, and returns whether that claim is consistent with the caller's own current `blocked`
 * state. Unlike assertNoReadyWhileBlocked (a pre-render guard), this is a post-hoc auditor -- run
 * it against something already produced (by this codebase or an external one) to catch the exact
 * "formulas and cached results disagree" defect the mission names.
 */
export function verifyRenderedVerdictConsistency(renderedOutput, blocked) {
  const text = String(renderedOutput ?? '');
  const claimsReady = READY_WORD.test(text);
  if (claimsReady && blocked) return { consistent: false, reason: 'rendered-output-claims-ready-while-blocked' };
  return { consistent: true, reason: '' };
}

/**
 * Aggregates one or more named gate results (each `{name, blocked, blockers}`, matching the exact
 * shape diagnostic-workflow.mjs#deliveryGate / implementation.mjs#implementationGate /
 * distribution.mjs#preflightDistribution-adapted callers already return) into one verdict. READY
 * only when every gate reports `blocked: false` -- there is no code path that produces 'READY'
 * with a non-empty blockingGates list, because `ready` is computed as `blockingGates.length === 0`
 * directly, not tracked as a separate flag that could drift from it.
 */
export function computeLaunchVerdict(gateResults = []) {
  const blockingGates = gateResults.filter(g => g && g.blocked).map(g => ({ name: g.name, blockers: g.blockers || [] }));
  const ready = blockingGates.length === 0;
  return { verdict: ready ? 'READY' : 'BLOCKED', ready, blockingGates };
}
