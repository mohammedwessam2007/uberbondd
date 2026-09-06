// Wave 19's exit gate, executable.
//
// A guard that nothing tests is decoration. The only way to know a test is
// holding a guard up is to break the guard and watch the test die -- and to
// check it died for the right reason rather than because the file stopped
// parsing.
//
// Each mutation below is a literal source edit, applied to a copy of the tree,
// with the suites that must fail named alongside it. The exit condition is not
// a percentage: it is that every entry in the inventory kills at least one test.
//
// This does not require a general mutation score. Mutating arbitrary lines
// produces mostly equivalent mutants and a number nobody can act on. Mutating
// the specific invariants this system's safety rests on produces a list an
// operator can read.

import { mkdtempSync, cpSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { classifySuiteRun, applyMutation } from './mutation-verdict.mjs';
import { resolveChromium } from '../src/resolve-chromium.mjs';
import { loadJournal, appendVerdict } from './mutation-journal.mjs';
import { withDisposablePostgres } from './disposable-postgres.mjs';

// Re-exported so the registry stays the single import point for the war.
export { classifySuiteRun, applyMutation };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {{id: string, guard: string, file: string, find: string, replace: string, suites: string[]}} Mutation
 */

/** @type {Mutation[]} */
export const MUTATIONS = [
  // ---- Authority: whether a message may reach a real person ---------------
  {
    id: 'AUTH-01', guard: 'Outbound authority is read from durable storage',
    file: 'src/deliverability-guard.mjs',
    find: '  const authority = await readDurableAuthority(store, campaign);',
    replace: '  const authority = { ok: true, campaign, drifted: [] };',
    suites: ['tests/outbound-stale-authorization.test.mjs']
  },
  {
    id: 'AUTH-02', guard: 'A revoked campaign approval denies',
    file: 'src/deliverability-guard.mjs',
    find: "    if (!durable.approved) deny.push('authority-campaign-not-approved');",
    replace: '    if (false) deny.push(\'authority-campaign-not-approved\');',
    suites: ['tests/outbound-stale-authorization.test.mjs', 'tests/deliverability-guard.test.mjs']
  },
  {
    id: 'AUTH-03', guard: 'An expired campaign approval denies',
    file: 'src/deliverability-guard.mjs',
    find: "    if (durable.expiresAt && Date.parse(durable.expiresAt) < referenceMs) deny.push('authority-campaign-expired');",
    replace: '    if (false) deny.push(\'authority-campaign-expired\');',
    suites: ['tests/deliverability-guard.test.mjs', 'tests/pipeline-deliverability-guard.test.mjs']
  },
  {
    id: 'AUTH-04', guard: 'An unreadable authority fails closed',
    file: 'src/deliverability-guard.mjs',
    find: "  if (!durable) return { ok: false, reasonCodes: ['authority-campaign-not-found'], drifted: [] };",
    replace: '  if (!durable) return { ok: true, campaign: snapshot, drifted: [] };',
    suites: ['tests/outbound-stale-authorization.test.mjs']
  },

  // ---- Economic truth: what may be claimed about money --------------------
  {
    id: 'MONEY-01', guard: 'A payment needs three witnesses',
    file: 'src/payment-renewal-truth.mjs',
    find: '    if (positive && clearing && order) {',
    replace: '    if (positive) {',
    suites: ['tests/payment-renewal-truth.test.mjs', 'tests/payment-truth-double-count.test.mjs']
  },
  {
    id: 'MONEY-02', guard: 'One provider event is one revenue row',
    file: 'src/payment-renewal-truth.mjs',
    find: '      if (seen.has(key)) {\n        duplicates.push({ providerEventId: key, amountCents: cents(event?.amountCents) });\n        continue;\n      }',
    replace: '      if (false) { continue; }',
    suites: ['tests/payment-truth-double-count.test.mjs']
  },
  {
    id: 'MONEY-03', guard: 'Refunds reduce net revenue',
    file: 'src/payment-renewal-truth.mjs',
    find: '  const netClearedRevenueCents = clearedRevenueCents - reversedRevenueCents;',
    replace: '  const netClearedRevenueCents = clearedRevenueCents;',
    suites: ['tests/payment-truth-reversal.test.mjs']
  },
  {
    id: 'MONEY-04', guard: 'An unwitnessed reversal is not applied',
    file: 'src/payment-renewal-truth.mjs',
    find: '      if (reversal && order) {',
    replace: '      if (true) {',
    suites: ['tests/payment-truth-reversal.test.mjs']
  },
  {
    id: 'MONEY-05', guard: 'A lead flagged paid is not payment proof',
    file: 'src/payment-renewal-truth.mjs',
    find: "  if (lead?.paymentStatus === 'paid' && !firstPayment) contradictions.push('lead-marked-paid-without-provider-cleared-proof');",
    replace: '  if (false) contradictions.push(\'lead-marked-paid-without-provider-cleared-proof\');',
    suites: ['tests/payment-renewal-truth.test.mjs', 'tests/payment-recovery-war.test.mjs']
  },

  {
    id: 'MONEY-06', guard: 'Payment witnesses must agree on amount and currency, not only identity',
    file: 'src/payment-renewal-truth.mjs',
    find: '      const mismatches = witnessContentMismatches({ event, order, clearing });',
    replace: '      const mismatches = [];',
    suites: ['tests/payment-witness-integrity-mutation.test.mjs']
  },
  {
    id: 'MONEY-07', guard: 'Reversal witnesses must agree on content too',
    file: 'src/payment-renewal-truth.mjs',
    find: '        const reversalMismatches = witnessContentMismatches({ event, order, clearing: reversal });',
    replace: '        const reversalMismatches = [];',
    suites: ['tests/payment-truth-reversal.test.mjs']
  },
  {
    id: 'MONEY-08', guard: 'Cents from different currencies are not a total',
    file: 'src/payment-renewal-truth.mjs',
    find: "  if (currencies.length > 1) contradictions.push('multi-currency-revenue-cannot-be-summed');",
    replace: '  void currencies;',
    suites: ['tests/payment-currency-truth.test.mjs']
  },
  {
    id: 'MONEY-09', guard: 'The clearing receipt witnesses the money, not only the identity',
    file: 'src/payment-renewal-truth.mjs',
    find: "  const amounts = [event?.amountCents, order?.amountCents, clearing?.amountCents]",
    replace: '  const amounts = [event?.amountCents, order?.amountCents]',
    suites: ['tests/payment-currency-truth.test.mjs']
  },
  {
    id: 'MONEY-14', guard: 'Each currency is totalled from its own rows only',
    file: 'src/payment-renewal-truth.mjs',
    find: "    bucket.clearedCents += cents(item.event.amountCents);",
    replace: '    bucket.clearedCents += 0;',
    suites: ['tests/payment-currency-truth.test.mjs']
  },
  {
    id: 'MONEY-15', guard: 'A refund reduces its own currency and no other',
    file: 'src/payment-renewal-truth.mjs',
    find: "    bucket.reversedCents += Math.abs(cents(item.event.amountCents));",
    replace: '    bucket.reversedCents += 0;',
    suites: ['tests/payment-currency-truth.test.mjs']
  },
  {
    id: 'MONEY-10', guard: 'A failed lead lookup may not widen the scope to every lead',
    file: 'src/payment-renewal-truth.mjs',
    find: "  const leadId = text(requestedLeadId, 200) || text(lead?.id, 200) || null;",
    replace: '  const leadId = text(lead?.id, 200) || null;',
    suites: ['tests/payment-truth-lead-scope.test.mjs']
  },
  {
    id: 'MONEY-11', guard: 'A lead nobody can find is unknown, not zero',
    file: 'src/payment-renewal-truth.mjs',
    find: "  if (leadResolved === false) contradictions.push('payment-truth-requested-for-unknown-lead');",
    replace: '  void leadResolved;',
    suites: ['tests/payment-truth-lead-scope.test.mjs']
  },
  {
    id: 'PRIV-01', guard: 'The decoded provider payload is not durable business state',
    file: 'src/revenue.mjs',
    find: '      const witness = this.paymentOrderWitness(preparedEvent);',
    replace: '      const witness = { ...this.paymentOrderWitness(preparedEvent), raw: payload };',
    suites: ['tests/provider-payload-minimization.test.mjs', 'tests/provider-payload-minimization-source-guard.test.mjs']
  },
  {
    id: 'PRIV-02', guard: 'The outreach normalizer does not retain the provider object',
    file: 'src/outreach-provider-events.mjs',
    find: "    isFirst: input.is_first === true || input.isFirst === true\n  };",
    replace: "    isFirst: input.is_first === true || input.isFirst === true,\n    raw: input\n  };",
    suites: ['tests/outreach-provider-events.test.mjs']
  },
  {
    id: 'PRIV-03', guard: 'A legacy raw field cannot re-enter the reply body',
    file: 'src/outreach-provider-events.mjs',
    find: "  const body = stringValue(event.replyBody || '', 20000);",
    replace: "  const body = stringValue(event.replyBody || event.raw?.reply_text_snippet || '', 20000);",
    suites: ['tests/outreach-provider-events.test.mjs']
  },
  {
    id: 'MONEY-12', guard: 'The clearing receipt records the money it classified',
    file: 'src/revenue.mjs',
    find: "      amountCents: Number.isSafeInteger(Number(event?.amountCents)) ? Number(event.amountCents) : null,",
    replace: '      amountCents: null,',
    suites: ['tests/payment-receipt-witnesses-money.test.mjs']
  },
  {
    id: 'MONEY-13', guard: 'The clearing receipt records the currency it classified',
    file: 'src/revenue.mjs',
    find: "      currency: String(event?.currency || '').trim().toUpperCase() || null,",
    replace: '      currency: null,',
    suites: ['tests/payment-receipt-witnesses-money.test.mjs']
  },
  {
    id: 'MONEY-16', guard: 'An incomplete payment witness resumes instead of becoming a duplicate',
    file: 'src/revenue.mjs',
    find: "      if (order.processingStatus === 'completed') {",
    replace: '      if (true) {',
    suites: ['tests/payment-webhook-recovery.test.mjs']
  },
  {
    id: 'REV-01', guard: 'A concurrent report-email claim blocks the second provider call',
    file: 'src/revenue.mjs',
    find: "      if (attemptStatus === 'dispatching') {\n        return { ok: false, reason: 'report-email-in-flight', lead: current, prospect: selectedProspect };\n      }",
    replace: "      if (false) {\n        return { ok: false, reason: 'report-email-in-flight', lead: current, prospect: selectedProspect };\n      }",
    suites: ['tests/revenue-report-email-recovery.test.mjs']
  },
  {
    id: 'REV-02', guard: 'An unresolved report-email attempt cannot be replayed automatically',
    file: 'src/revenue.mjs',
    find: "      if (attemptStatus === 'uncertain') {",
    replace: '      if (false) {',
    suites: ['tests/revenue-report-email-recovery.test.mjs']
  },
  {
    id: 'RECOV-01', guard: 'Recovery may not overwrite a newer reservation status',
    file: 'src/reservation-recovery.mjs',
    find: "    if (current.status !== row.status) {",
    replace: '    if (false) {',
    suites: ['tests/reservation-recovery-race.test.mjs']
  },
  {
    id: 'MESH-01', guard: 'An abandoned same-occurrence STARTED receipt is terminalized before duplicate return',
    file: 'src/agent-mesh-control-plane.mjs',
    find: "      if (afterReconciliation.state === 'TERMINAL') {",
    replace: '      if (false) {',
    suites: ['tests/agent-mesh-same-occurrence-abandonment.test.mjs']
  },

  // ---- Acceptance and retention ------------------------------------------
  {
    id: 'ACCEPT-04', guard: 'A bare qa prefix is not a QA result',
    file: 'src/service-fulfillment.mjs',
    find: "      if (!evidenceReferent(event.evidenceRef, 'qa')) reasons.push('qa-evidence-ref-required');",
    replace: "      if (!/^qa:/i.test(text(event.evidenceRef, 500))) reasons.push('qa-evidence-ref-required');",
    suites: ['tests/fulfillment-evidence-referent.test.mjs']
  },
  {
    id: 'ACCEPT-06', guard: 'A bare artifact prefix is not a delivery',
    file: 'src/service-fulfillment.mjs',
    find: "      if (!artifacts.length || artifacts.some(ref => !evidenceReferent(ref, 'artifact'))) reasons.push('delivery-artifact-refs-required');",
    replace: "      if (!artifacts.length || artifacts.some(ref => !/^artifact:/i.test(ref))) reasons.push('delivery-artifact-refs-required');",
    suites: ['tests/fulfillment-evidence-referent.test.mjs']
  },
  {
    id: 'ACCEPT-05', guard: 'A bare customer prefix is not customer acceptance',
    file: 'src/service-fulfillment.mjs',
    find: "    && evidenceReferent(event?.evidenceRef, 'customer|receipt').length > 0;",
    replace: "    && /^(customer|receipt):/i.test(text(event?.evidenceRef, 500));",
    suites: ['tests/fulfillment-evidence-referent.test.mjs']
  },
  {
    id: 'ACCEPT-01', guard: 'Only external customer evidence accepts a delivery',
    file: 'src/service-fulfillment.mjs',
    find: "      if (!validCustomerEvidence(event)) reasons.push('external-customer-acceptance-evidence-required');",
    replace: '      if (false) reasons.push(\'external-customer-acceptance-evidence-required\');',
    suites: ['tests/service-fulfillment.test.mjs', 'tests/superseded-fulfillment-invariants.test.mjs']
  },
  {
    id: 'ACCEPT-02', guard: 'Support cannot end before its window elapses',
    file: 'src/service-fulfillment.mjs',
    find: "      else if (eventMillis < supportEnds.getTime()) reasons.push('support-window-not-ended');",
    replace: '      else if (false) reasons.push(\'support-window-not-ended\');',
    suites: ['tests/service-fulfillment.test.mjs', 'tests/recovery-war-boundaries.test.mjs']
  },
  {
    id: 'ACCEPT-03', guard: 'A renewal cannot be due before its date',
    file: 'src/service-fulfillment.mjs',
    find: "      else if (renewalDue && eventMillis < renewalDue.getTime()) reasons.push('renewal-not-due');",
    replace: '      else if (false) reasons.push(\'renewal-not-due\');',
    suites: ['tests/service-fulfillment.test.mjs']
  },
  {
    id: 'TIME-01', guard: 'Contractual time cannot be fast-forwarded',
    file: 'src/service-fulfillment.mjs',
    find: "    return fail(['event-time-in-future'], state);",
    replace: '    void 0;',
    suites: ['tests/fulfillment-forward-time.test.mjs']
  },
  {
    id: 'TIME-02', guard: 'Event time cannot move backward',
    file: 'src/service-fulfillment.mjs',
    find: "  if (eventAt.getTime() < updatedAt.getTime()) return fail(['event-time-regression'], state);",
    replace: '  void 0;',
    suites: ['tests/service-fulfillment.test.mjs']
  },

  // ---- Evidence -----------------------------------------------------------
  {
    id: 'EVID-01', guard: 'An unknown evidence class is refused, not downgraded',
    file: 'src/market-signal.mjs',
    find: '  if (input.evidenceClass != null && !SIGNAL_EVIDENCE_CLASSES.includes(input.evidenceClass)) {',
    replace: '  if (false) {',
    suites: ['tests/market-signal.test.mjs']
  },
  {
    id: 'EVID-02', guard: 'Evidence class is clamped to what the source can support',
    file: 'src/prospect-evidence-reconciliation.mjs',
    find: 'export function clampEvidenceClassToSource(',
    replace: 'export function clampEvidenceClassToSource_UNUSED(',
    suites: ['tests/evidence-class-laundering.test.mjs']
  },

  // ---- Agent authority ----------------------------------------------------
  {
    id: 'AGENT-08', guard: 'A result may not declare a role the task never granted',
    file: 'src/ai-employee-terminal-identity.mjs',
    find: "    return ungrantedRoleClaim(result, 'worker-result-employee-role-not-granted');",
    replace: '    return [];',
    suites: ['tests/ai-employee-terminal-identity.test.mjs']
  },
  {
    id: 'AGENT-09', guard: 'An ungranted role claim cannot be laundered into a submission',
    file: 'src/ai-employee-terminal-identity.mjs',
    find: "    const claimed = ungrantedRoleClaim(result, 'model-result-employee-role-not-granted');",
    replace: '    const claimed = [];',
    suites: ['tests/ai-employee-terminal-identity.test.mjs']
  },
  {
    id: 'AGENT-01', guard: 'A child inherits every parent constraint',
    file: 'src/agent-autonomy-loop.mjs',
    find: '  const fullConstraints = [...new Set([...MANDATORY_CONSTRAINTS, ...strings(constraints, MAX_CONSTRAINTS + 1)])];',
    replace: '  const fullConstraints = strings(constraints, MAX_CONSTRAINTS + 1);',
    suites: ['tests/autonomy-constraint-monotonicity-property.test.mjs']
  },
  {
    id: 'AGENT-02', guard: 'A zero-effect claim must be complete',
    file: 'src/cloud-agent-relay.mjs',
    find: "  if (canonical.some(key => !Object.hasOwn(ledger, key))) return ['incomplete-external-effect-ledger-rejected'];",
    replace: '  if (false) return [];',
    suites: ['tests/effect-state-vocabulary.test.mjs', 'tests/worker-result-terminal-truth.test.mjs']
  },
  {
    id: 'AGENT-03', guard: 'Unknown effects are not zero effects',
    file: 'src/effect-ledgers.mjs',
    find: '    : unknownKeys.length ? EFFECT_STATES.EFFECT_UNKNOWN',
    replace: '    : unknownKeys.length ? EFFECT_STATES.ZERO_EFFECT',
    suites: ['tests/effect-state-vocabulary.test.mjs']
  },
  {
    id: 'AGENT-04', guard: 'Changed artifacts with no tests run is not DONE',
    file: 'src/agent-worker-result-truth.mjs',
    find: '  if (Array.isArray(result?.changedArtifacts) && result.changedArtifacts.length > 0\n    && Array.isArray(result?.testsActuallyRun) && result.testsActuallyRun.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/worker-result-terminal-truth.test.mjs']
  },
  {
    id: 'AGENT-05', guard: 'A terminal claim needs a supported truth table',
    file: 'src/agent-worker-result-truth.mjs',
    find: '  if (!Array.isArray(result?.truthTable) || result.truthTable.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/worker-result-terminal-truth.test.mjs']
  },

  {
    id: 'AGENT-06', guard: 'The relay client defers to the canonical zero-effect check',
    file: 'src/chatgpt-relay-client.mjs',
    find: '  return canonicalZeroEffectLedger(value).length === 0;',
    replace: '  if (!value || typeof value !== \'object\' || Array.isArray(value)) return false;\n  return Object.entries(ZERO_EFFECTS).every(([key, zero]) => Number(value[key] || 0) === zero);',
    suites: ['tests/zero-effect-agreement.test.mjs']
  },
  {
    id: 'AGENT-07', guard: 'The GitHub transport defers to the same check',
    file: 'src/github-relay.mjs',
    find: '  const ledgerErrors = canonicalZeroEffectLedger(receipt.externalEffects);',
    replace: '  const ledgerErrors = Object.entries(ZERO_EFFECTS).some(([key, zero]) => Number((receipt.externalEffects || {})[key] || 0) !== zero) ? [\'x\'] : [];',
    suites: ['tests/zero-effect-agreement.test.mjs', 'tests/github-relay.test.mjs']
  },

  // ---- Self-improvement governance ---------------------------------------
  {
    id: 'SOV-01', guard: 'Sovereignty files cannot be edited by the agent path',
    file: 'src/agent-code-change-contract.mjs',
    find: '  else if (sovereigntyPath(filePath)) reasons.push(`change-${index}-sovereignty-path`);',
    replace: '  else if (false) reasons.push(`change-${index}-sovereignty-path`);',
    suites: ['tests/sovereignty-self-modification.test.mjs']
  },
  {
    id: 'SOV-02', guard: 'The protection list contains itself',
    file: 'src/agent-code-change-contract.mjs',
    // The anchor pairs the entry with the comment that now follows it. Adding the
    // enforcement-machinery block between the two split the old anchor, and the
    // harness reported ANCHOR_NOT_FOUND rather than quietly passing -- which is
    // the whole point of distinguishing "not killed" from "never applied".
    find: "  'src/agent-code-change-contract.mjs',\n  // ...and the machinery that enforces them.",
    replace: '  // ...and the machinery that enforces them.',
    suites: ['tests/sovereignty-self-modification.test.mjs']
  },

  // ---- Escalation ---------------------------------------------------------
  {
    id: 'SOV-03', guard: 'The proofs of the guards are inside the boundary too',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'scripts/mutation-war.mjs',",
    replace: "  'scripts/mutation-war.mjs.not-really',",
    suites: ['tests/sovereignty-proof-closure.test.mjs']
  },
  {
    id: 'CRAWL-01', guard: 'The crawl result is built from variables that are actually in scope',
    file: 'src/browser-crawler.mjs',
    needsBrowser: true,
    find: "  const queue=[{url:start,depth:0,score:100}]; const seen=new Set(); const pages=[]; const errors=[];\n  try{",
    replace: "  try{\n    const queue=[{url:start,depth:0,score:100}]; const seen=new Set(); const pages=[]; const errors=[];",
    suites: ['tests/browser.test.mjs']
  },
  {
    id: 'GATE-01', guard: 'The deterministic gate ignores the shell it was invoked from',
    file: 'scripts/run-tests.mjs',
    find: '  delete deterministicEnv.OMNIA_V9_TEST_DATABASE_URL;',
    replace: '  // deleted',
    suites: ['tests/build-wiring.test.mjs']
  },
  {
    id: 'MONEY-20', guard: 'A forged webhook is refused permanently, not retried forever',
    file: 'src/revenue.mjs',
    find: '      error.status = 401;',
    replace: '',
    suites: ['tests/webhook-route-truth.test.mjs']
  },
  {
    id: 'MONEY-21', guard: 'The webhook acknowledgement does not echo the buyer',
    file: 'server-core.mjs',
    find: '      const outcome = await revenue.handleLemonWebhook(raw, req.headers[\'x-signature\']);',
    replace: '      const outcome = await revenue.handleLemonWebhook(raw, req.headers[\'x-signature\']); return json(res, 200, outcome);',
    suites: ['tests/webhook-route-truth.test.mjs']
  },
  {
    id: 'MONEY-22', guard: 'A subscription that has not paid is not cleared revenue',
    file: 'src/payments.mjs',
    find: "    if (event.eventName === 'subscription_created'\n      && event.status && !CLEARED_SUBSCRIPTION_STATUSES.has(String(event.status).toLowerCase())) {",
    replace: '    if (false) {',
    suites: ['tests/subscription-clearing-truth.test.mjs']
  },
  {
    id: 'MONEY-23', guard: 'The money must cover the product it unlocks',
    file: 'src/payments.mjs',
    find: "    if (expected !== null && Number(event.amountCents) < expected) {",
    replace: '    if (false) {',
    suites: ['tests/paid-amount-buys-what-it-paid-for.test.mjs']
  },
  {
    id: 'MONEY-24', guard: 'A zero amount is an amount, not an absent one',
    file: 'src/revenue.mjs',
    find: '    const amount = Number.isFinite(paidCents) ? paidCents : listPrice;',
    replace: '    const amount = paidCents || listPrice;',
    suites: ['tests/paid-amount-buys-what-it-paid-for.test.mjs']
  },
  {
    id: 'CANON-01', guard: 'An unreachable canon SHA still fails when the source it described differs',
    file: 'tests/canon-freshness.test.mjs',
    find: '    assert.ok(canonRelevantSourceMatches(sha, head),',
    replace: '    assert.ok(true,',
    suites: ['tests/canon-freshness-discrimination.test.mjs']
  },
  {
    id: 'TIMEOUT-03', guard: 'A hang with no assertion behind it is never recorded as a kill',
    file: 'scripts/mutation-verdict.mjs',
    find: "  if (assertionFailed) return 'KILLED';",
    replace: "  if (assertionFailed || testTimedOut) return 'KILLED';",
    suites: ['tests/mutation-verdict-honesty.test.mjs']
  },
  {
    id: 'SANDBOX-01', guard: 'A mutation cannot reach out of the sandbox into the real dependency tree',
    file: 'scripts/mutation-verdict.mjs',
    find: "    return { applied: false, reason: 'anchor-outside-sandbox' };",
    replace: '',
    suites: ['tests/mutation-verdict-honesty.test.mjs']
  },
  {
    id: 'TIMEOUT-02', guard: "Node's own test deadline is reported as a hang, not as a suite that failed to load",
    file: 'scripts/mutation-verdict.mjs',
    find: "  if (testTimedOut) return 'SUITE_TIMED_OUT';",
    replace: '',
    suites: ['tests/mutation-verdict-honesty.test.mjs']
  },
  {
    id: 'TIMEOUT-01', guard: 'A suite killed at its deadline is not read as a mutant that died',
    file: 'scripts/mutation-verdict.mjs',
    find: "  if (timedOut) return 'SUITE_TIMED_OUT';",
    replace: '',
    suites: ['tests/mutation-verdict-honesty.test.mjs']
  },
  {
    id: 'JOURNAL-03', guard: 'A skip is never journaled, so a missing runtime cannot become permanent',
    file: 'scripts/mutation-journal.mjs',
    find: "  if (NEVER_JOURNALED.has(verdict)) return false;",
    replace: '',
    suites: ['tests/mutation-journal-integrity.test.mjs']
  },
  {
    id: 'JOURNAL-01', guard: 'A replayed verdict must belong to the mutation that earned it',
    file: 'scripts/mutation-journal.mjs',
    find: '    if (row.fingerprint !== expected.get(row.id)) continue;',
    replace: '',
    suites: ['tests/mutation-journal-integrity.test.mjs']
  },
  {
    id: 'JOURNAL-02', guard: 'A journal entry is bound to the anchor and suites, not only the id',
    file: 'scripts/mutation-journal.mjs',
    find: '    [...(mutation.suites || [])].sort()',
    replace: '    []',
    suites: ['tests/mutation-journal-integrity.test.mjs']
  },
  {
    // The ledger's runtime-receipt scan must stay rooted where the caller
    // said, or the same commit produces different ledgers depending on what
    // somebody ran locally.
    id: 'GENESIS-LEDGER-01', guard: 'Runtime-receipt evidence is scanned where the caller rooted it, not always the repository',
    file: 'scripts/genesis-evolution-tick.mjs',
    find: '.filter(r=>existsSync(resolve(runtimeReceiptRoot,r)));',
    replace: '.filter(r=>existsSync(resolve(root,r)));',
    suites: ['tests/genesis-evolution-tick.test.mjs']
  },
  {
    id: 'GENESIS-CHAIN-01', guard: 'A GENESIS refusal names the step that produces what it is missing',
    file: 'scripts/genesis-evolution-tick.mjs',
    find: "producedBy:'npm run gamechanger:plan',",
    replace: '',
    suites: ['tests/genesis-chain-refusal.test.mjs']
  },
  {
    id: 'AVENGERS-INPUT-01', guard: 'A missing arsenal artifact names the step that has not run, not a crash',
    file: 'src/avengers-artifact-input.mjs',
    find: "    if (error?.code === 'ENOENT') {",
    replace: '    if (false) {',
    suites: ['tests/avengers-artifact-input.test.mjs']
  },
  {
    // Anchored on the refusal, not on the parse. The first attempt mutated
    // `JSON.parse(text)` to `JSON.parse(text) || {}`, which changes no output
    // for any valid object and so survived every test -- unfalsifiable rather
    // than untested. This is the branch that decides whether a half-written
    // artifact reaches the caller.
    id: 'AVENGERS-INPUT-02', guard: 'A half-written arsenal artifact is refused rather than partly believed',
    file: 'src/avengers-artifact-input.mjs',
    find: "      status: `AVENGERS_${kind}_MALFORMED`,",
    replace: '      ok: true,',
    suites: ['tests/avengers-artifact-input.test.mjs']
  },
  {
    id: 'BROWSER-01', guard: 'A declared browser path that is not an executable is not a browser',
    file: 'src/resolve-chromium.mjs',
    find: "  if (declared) return isExecutableFile(declared) ? declared : '';",
    replace: '  if (declared) return declared;',
    suites: ['tests/omega-closure-hostile.test.mjs']
  },
  {
    id: 'BROWSER-02', guard: 'Browser detection returns a real executable rather than a plausible path',
    file: 'src/resolve-chromium.mjs',
    find: "  ].find(isExecutableFile) || '';",
    replace: "  ][0] || '';",
    suites: ['tests/omega-closure-hostile.test.mjs']
  },
  {
    id: 'CANON-03', guard: 'The absence doctor judges the source canon describes, not the whole tree',
    file: 'scripts/founder-absence-doctor.mjs',
    find: "export const describesSource = file => CANON_RELEVANT_PREFIX.test(file) && !CANON_ARTIFACTS.has(file);",
    replace: "export const describesSource = file => CANON_RELEVANT_PREFIX.test(file) && !file.startsWith('config/');",
    suites: ['tests/omega-closure-hostile.test.mjs']
  },
  {
    id: 'CANON-04', guard: 'The canon freshness probe actually reads git rather than assuming freshness',
    file: 'scripts/founder-absence-doctor.mjs',
    find: '    return !changed.some(describesSource);',
    replace: '    return true;',
    suites: ['tests/omega-closure-hostile.test.mjs']
  },
  {
    id: 'CANON-02', guard: 'The canon self-description exemption is three named files, not a directory',
    file: 'tests/canon-freshness.test.mjs',
    find: '  test: name => CANON_RELEVANT_PREFIX.test(name) && !CANON_ARTIFACT_PATHS.has(name)',
    replace: "  test: name => CANON_RELEVANT_PREFIX.test(name) && !name.startsWith('config/')",
    suites: ['tests/canon-freshness-discrimination.test.mjs']
  },
  // ---- Event Horizon: provenance and opportunity identity -----------------
  {
    id: 'HORIZON-01', guard: 'A source cannot be repointed at another domain',
    file: 'src/event-horizon.mjs',
    find: "      if (actualHost !== declaredHost) failures.push('source-url-host-mismatch');",
    replace: '',
    suites: ['tests/event-horizon.test.mjs']
  },
  {
    id: 'HORIZON-02', guard: 'One canonical opportunity cannot appear twice',
    file: 'src/event-horizon.mjs',
    find: "    else if (canonicalOpportunityIds.has(candidate.canonicalOpportunityId)) failures.push('duplicate-canonical-opportunity-mapping');",
    replace: '',
    suites: ['tests/event-horizon.test.mjs']
  },
  {
    id: 'HORIZON-03', guard: 'Commercial truth cannot be forged positive',
    file: 'src/event-horizon.mjs',
    find: "  if (truth.realCustomers !== 0 || truth.clearedRevenueUsd !== 0 || truth.acceptedDeliveries !== 0 || truth.retainedCustomers !== 0) {",
    replace: '  if (false) {',
    suites: ['tests/event-horizon.test.mjs']
  },
  // ---- Payment reconciliation: a driver that cannot damage the evidence ----
  {
    id: 'MONEY-25', guard: 'An unconfigured worker claims nothing',
    file: 'src/payment-reconciliation-worker.mjs',
    find: "  if (typeof providerVerifier !== 'function') {",
    replace: '  if (false) {',
    suites: ['tests/payment-reconciliation-worker-postgres-real.test.mjs'],
    needsPostgres: true
  },
  {
    id: 'MONEY-26', guard: 'A claim of cleared without a canonical receipt does not clear',
    file: 'src/payment-reconciliation-worker.mjs',
    find: '    if (cleared && !receiptRef) {',
    replace: '    if (false) {',
    suites: ['tests/payment-reconciliation-worker-postgres-real.test.mjs'],
    needsPostgres: true
  },
  {
    id: 'MONEY-27', guard: 'An attempt-capped event is escalated, not claimed again',
    file: 'src/payment-reconciliation-worker.mjs',
    find: '  if (!claimable) {',
    replace: '  if (false) {',
    suites: ['tests/payment-reconciliation-worker-postgres-real.test.mjs'],
    needsPostgres: true
  },
  // ---- World skill bodies: screened before they can be counted -------------
  {
    id: 'GENOME-01', guard: 'An imported skill body is screened, not merely hashed',
    file: 'src/capability-genome-body-import.mjs',
    find: '  const screening = scanCapabilityInstructions({ instructions: content });',
    replace: "  const screening = { decision: 'STATIC_CLEAR', findings: [], scanDigest: 'x', caveat: 'not runtime safety' };",
    suites: ['tests/capability-genome-body-security-screening.test.mjs']
  },
  {
    id: 'GENOME-02', guard: 'Security evidence cannot be carried across revisions',
    file: 'src/capability-genome-body-import.mjs',
    find: "    if (!evidence.securityScreening?.decision || evidence.securityScreening.screenedContentSha256 !== evidence.contentSha256) {",
    replace: '    if (false) {',
    suites: ['tests/capability-genome-body-security-screening.test.mjs']
  },
  {
    id: 'GENOME-03', guard: 'Quarantined bodies are counted apart from clear ones',
    file: 'src/capability-genome-body-import.mjs',
    find: "    securityQuarantinedBodies: bodies.filter(item => item.securityScreening.decision === 'QUARANTINE').length,",
    replace: '    securityQuarantinedBodies: bodies.length,',
    suites: ['tests/capability-genome-body-security-screening.test.mjs']
  },
  // ---- Model failover: routing that executes, and only where allowed -------
  {
    id: 'ROUTE-02', guard: 'An unauthorized provider is never called',
    file: 'src/agent-model-failover.mjs',
    find: '    if (!authorized.has(candidate.provider)) {',
    replace: '    if (false) {',
    suites: ['tests/agent-model-failover.test.mjs']
  },
  {
    id: 'ROUTE-03', guard: 'An uncertain outcome is not retried on another provider',
    file: 'src/agent-model-failover.mjs',
    find: '    const blockedByIdempotency = classification.failoverEligible\n      && classification.requiresIdempotency\n      && !idempotent;',
    replace: '    const blockedByIdempotency = false;',
    suites: ['tests/agent-model-failover.test.mjs']
  },
  {
    id: 'ROUTE-04', guard: 'A failure another provider cannot fix is not walked around',
    file: 'src/agent-model-failover.mjs',
    find: "    if (!classification.failoverEligible) {\n      reasonCodes.push(`terminal-${String(classification.failureClass).toLowerCase()}`);",
    replace: "    if (false) {\n      reasonCodes.push(`terminal-${String(classification.failureClass).toLowerCase()}`);",
    suites: ['tests/agent-model-failover.test.mjs']
  },
  {
    id: 'ROUTE-05', guard: 'An empty authorization list is not permission to use anything',
    file: 'src/agent-model-failover.mjs',
    find: "  if (!authorized.size) return fail(['no-authorized-provider-configured']);",
    replace: '',
    suites: ['tests/agent-model-failover.test.mjs']
  },
  {
    id: 'ROUTE-06', guard: 'Only the attempt that ends a failover chain submits to the relay',
    file: 'src/agent-worker-runtime.mjs',
    find: '    if (deferTerminalSubmission) {',
    replace: '    if (false) {',
    suites: ['tests/agent-model-failover.test.mjs']
  },
  // ---- The war's own verdicts --------------------------------------------
  {
    id: 'WAR-01', guard: 'A suite that never ran is not a killed mutant',
    file: 'scripts/mutation-verdict.mjs',
    find: "    if (failed !== null && failed > 0) return 'KILLED';\n    return 'SUITE_DID_NOT_RUN';",
    replace: "    return 'KILLED';",
    suites: ['tests/mutation-verdict-honesty.test.mjs']
  },
  {
    id: 'WAR-02', guard: 'A green run that asserted nothing is not a surviving guard',
    file: 'scripts/mutation-verdict.mjs',
    find: "  if (passed === 0 && skipped !== null && skipped > 0) return 'NO_ASSERTIONS_RAN';",
    replace: '',
    suites: ['tests/mutation-verdict-honesty.test.mjs']
  },
  // ---- Identity: who a rate limit thinks it is counting -------------------
  {
    id: 'IDENT-01', guard: 'A caller cannot choose the identity a rate limit counts',
    file: 'server-core.mjs',
    find: '  const hops = Number(config.trustProxyHops) || 0;',
    replace: "  const hops = Number(config.trustProxyHops) || 0;\n  { const claimed = req.headers['x-forwarded-for']; if (claimed) return String(claimed).split(',')[0].trim(); }",
    suites: ['tests/client-identity-trust.test.mjs']
  },
  {
    id: 'MONEY-18', guard: 'Cleared revenue means a provider witnessed it',
    file: 'src/revenue.mjs',
    find: '    const clearedCents = positiveEvents.filter(witnessedByOrder)',
    replace: '    const clearedCents = positiveEvents',
    suites: ['tests/cleared-revenue-truth.test.mjs']
  },
  {
    id: 'MONEY-19', guard: 'Production cannot arm a fabricated payment route',
    file: 'src/config.mjs',
    find: "  if (cfg.revenue?.allowTestUnlock) throw new Error('Production must not set ALLOW_TEST_PAYMENT_UNLOCK');",
    replace: '',
    suites: ['tests/cleared-revenue-truth.test.mjs']
  },
  {
    id: 'SRV-02', guard: 'A non-object JSON body is a client error, not a 500',
    file: 'server-core.mjs',
    find: "  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {",
    replace: '  if (false) {',
    suites: ['tests/server-request-handler.test.mjs']
  },
  {
    id: 'SRV-03', guard: 'The request handler stays reachable without a socket',
    file: 'server-core.mjs',
    find: 'export const requestHandler = async (req, res) => {',
    replace: 'const requestHandler = async (req, res) => {',
    suites: ['tests/server-request-handler.test.mjs']
  },
  {
    id: 'SRV-01', guard: 'Security headers reach every response',
    file: 'server.mjs',
    find: "  'x-content-type-options': 'nosniff',",
    replace: '',
    suites: ['tests/server-http-surface.test.mjs']
  },
  {
    id: 'ADMIN-01', guard: 'Only a real string bearer reaches the health matrix',
    file: 'api/admin/health-check.mjs',
    find: " return typeof value==='string'?value:'';",
    replace: " return String(value||'');",
    suites: ['tests/admin-health-route.test.mjs']
  },
  {
    id: 'ADMIN-02', guard: 'Configuration is checked before the secret',
    file: 'api/admin/health-check.mjs',
    find: "if(!env.ADMIN_HEALTH_SECRET||!env.DATABASE_URL)return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['admin-health-runtime-not-configured']});",
    replace: "if(false)return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['admin-health-runtime-not-configured']});",
    suites: ['tests/admin-health-route.test.mjs']
  },
  {
    id: 'HYG-01', guard: 'The maintenance cron deletes nothing unless explicitly enabled',
    file: 'api/database-maintenance.mjs',
    find: "if(String(env.MAINTENANCE_ENABLED||'').toLowerCase()!=='true')",
    replace: 'if(false)',
    needsPostgres: true,
    suites: ['tests/database-hygiene-postgres-real.test.mjs']
  },
  {
    id: 'HYG-02', guard: 'Deletion cannot reach a row that was written recently',
    file: 'src/database-hygiene-repository.mjs',
    find: "whereSql:'expires_at < $1 AND updated_at < $2'",
    replace: "whereSql:'expires_at < $1 AND updated_at <= now()'",
    needsPostgres: true,
    suites: ['tests/database-hygiene-postgres-real.test.mjs']
  },
  {
    id: 'HYG-03', guard: 'Only terminal staged content is disposable',
    file: 'src/database-hygiene-repository.mjs',
    find: "whereSql:\"status IN ('CONSUMED','FAILED','EXPIRED','SUPERSEDED') AND updated_at < $1\"",
    replace: "whereSql:'updated_at < $1'",
    needsPostgres: true,
    suites: ['tests/database-hygiene-postgres-real.test.mjs']
  },
  {
    id: 'BILL-01', guard: 'Unclaimable payment evidence is visible, not silent',
    file: 'src/system-health-matrix.mjs',
    find: "const billingSevere=billingBlock.state==='NO_WORKER'||billingBlock.state==='BACKLOG_AGEING';",
    replace: 'const billingSevere=false;',
    suites: ['tests/billing-backlog-visibility.test.mjs']
  },
  {
    id: 'BILL-02', guard: 'An unobserved backlog is not an empty backlog',
    file: 'src/system-health-matrix.mjs',
    find: "if(!billing) return {state:'NOT_OBSERVED',reasonCodes:['billing-backlog-not-observed']};",
    replace: "if(!billing) return {state:'HEALTHY',unsettled:0,reasonCodes:[]};",
    suites: ['tests/billing-backlog-visibility.test.mjs']
  },
  {
    id: 'BILL-03', guard: 'A worker that never ran is distinguished from one running behind',
    file: 'src/system-health-repository.mjs',
    find: 'count(*) FILTER (WHERE claimed_by IS NOT NULL)::int AS "everClaimed"',
    replace: '0::int AS "everClaimed"',
    needsPostgres: true,
    suites: ['tests/billing-backlog-postgres-real.test.mjs']
  },
  {
    id: 'RECOVERY-LOCK-01', guard: 'Two recovery workers partition the unresolved set instead of racing on the same row',
    file: 'src/omnia-v9/integrations/external-effect-execution-store.mjs',
    find: '       FOR UPDATE SKIP LOCKED`,',
    replace: '       `,',
    needsPostgres: true,
    suites: ['tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs']
  },
  {
    id: 'MONEY-17', guard: 'A duplicate webhook is a duplicate, not a 503',
    file: 'src/billing-webhook-repository.mjs',
    find: 'ON CONFLICT DO NOTHING RETURNING provider_event_key',
    replace: 'ON CONFLICT(provider_event_key) DO NOTHING RETURNING provider_event_key',
    // Which unique index PostgreSQL raises on is the whole behaviour under test,
    // so the only suite that kills this needs a real database. Without the
    // marker the war ran the suite anyway, watched it skip, and reported the
    // guard as surviving.
    needsPostgres: true,
    suites: ['tests/payment-reconciliation-postgres-real.test.mjs']
  },
  {
    id: 'EVID-03', guard: 'A suppressed contact route cannot be laundered into usable',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/overnight/intent/account-intent-ledger.mjs',",
    replace: "  'src/overnight/intent/account-intent-ledger.mjs.not-really',",
    suites: ['tests/evidence-sovereignty-boundary.test.mjs']
  },
  {
    id: 'EVID-04', guard: 'The enrichment waterfall cannot discard a route verdict',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/overnight/intent/budgeted-enrichment-waterfall.mjs',",
    replace: "  'src/overnight/intent/budgeted-enrichment-waterfall.mjs.not-really',",
    suites: ['tests/evidence-sovereignty-boundary.test.mjs']
  },
  {
    id: 'ENF-01', guard: 'The change applier cannot be edited by what it applies',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/agent-code-change-applier.mjs',",
    replace: "  'src/agent-code-change-applier.mjs.not-really',",
    suites: ['tests/enforcement-surface-sovereignty-boundary.test.mjs']
  },
  {
    id: 'ENF-02', guard: 'The artifact store cannot stop refusing invalid change sets',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/agent-code-artifact-store.mjs',",
    replace: "  'src/agent-code-artifact-store.mjs.not-really',",
    suites: ['tests/enforcement-surface-sovereignty-boundary.test.mjs']
  },
  {
    id: 'ENF-03', guard: 'The first gate on a sandbox diff cannot be removed',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/agent-git-sandbox-collector.mjs',",
    replace: "  'src/agent-git-sandbox-collector.mjs.not-really',",
    suites: ['tests/enforcement-surface-sovereignty-boundary.test.mjs']
  },
  {
    id: 'ENF-04', guard: 'Neither worker-truth call site can be excused by the other',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/agent-autonomy-pump.mjs',",
    replace: "  'src/agent-autonomy-pump.mjs.not-really',",
    suites: ['tests/enforcement-surface-sovereignty-boundary.test.mjs']
  },
  {
    id: 'ENF-05', guard: 'The relay cannot discard the worker truth decision',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/ai-employee-relay.mjs',",
    replace: "  'src/ai-employee-relay.mjs.not-really',",
    suites: ['tests/enforcement-surface-sovereignty-boundary.test.mjs']
  },
  {
    id: 'SEND-01', guard: 'The send loop cannot escape the guards it calls',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/pipeline.mjs',",
    replace: "  'src/pipeline.mjs.not-really',",
    suites: ['tests/outbound-send-path-sovereignty-boundary.test.mjs']
  },
  {
    id: 'SEND-02', guard: 'The provider transport cannot be rewritten autonomously',
    file: 'src/agent-code-change-contract.mjs',
    find: "  'src/gmail.mjs',",
    replace: "  'src/gmail.mjs.not-really',",
    suites: ['tests/outbound-send-path-sovereignty-boundary.test.mjs']
  },
  {
    id: 'SEND-03', guard: 'The advisory shadow stays advisory at its call site',
    file: 'src/pipeline.mjs',
    find: '    await observeOutboundFinalAdmission({',
    replace: '    const __v9 = await observeOutboundFinalAdmission({',
    suites: ['tests/outbound-send-path-sovereignty-boundary.test.mjs']
  },
  {
    id: 'ESC-01', guard: 'A resolved condition recurring is a new episode',
    file: 'src/operator-escalation.mjs',
    find: '  const openFingerprints = [...lifecycle.entries()].filter(([, entry]) => entry.open).map(([fingerprint]) => fingerprint);',
    replace: '  const openFingerprints = [...lifecycle.keys()];',
    suites: ['tests/operator-escalation-episodes.test.mjs']
  },
  {
    id: 'ESC-02', guard: 'An undeliverable escalation is itself escalated',
    file: 'src/operator-escalation.mjs',
    find: '    ...undeliveredIncidents(snapshot)',
    replace: '',
    suites: ['tests/operator-escalation-transport.test.mjs']
  },
  {
    id: 'ESC-03', guard: 'A transport that throws is UNKNOWN, not FAILED',
    file: 'src/operator-escalation-transport.mjs',
    find: '      outcome: TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN,\n      deliveryRef: null,\n      reasonCodes: [\'transport-threw\', text(error?.message, 200)].filter(Boolean)',
    replace: '      outcome: TRANSPORT_OUTCOMES.DELIVERY_FAILED,\n      deliveryRef: null,\n      reasonCodes: [\'transport-threw\', text(error?.message, 200)].filter(Boolean)',
    suites: ['tests/operator-escalation-transport.test.mjs', 'tests/recovery-war-boundaries.test.mjs']
  },
  {
    id: 'ESC-04', guard: 'Absence readiness requires escalation deliverability',
    file: 'src/founder-absence-readiness.mjs',
    find: "  if (proof.undeliveredEscalations !== null && proof.undeliveredEscalations !== 0) reasonCodes.push('undelivered-escalations-present');",
    replace: '  if (false) reasonCodes.push(\'undelivered-escalations-present\');',
    suites: ['tests/founder-absence-deliverability.test.mjs']
  },

  {
    id: 'SEC-01', guard: 'A session cookie is a credential',
    file: 'src/secret-patterns.mjs',
    find: '  /\\bcookie\\s*:\\s*\\S+=/i,',
    replace: '',
    suites: ['tests/secret-cookie-jwt.test.mjs']
  },
  {
    id: 'SEC-02', guard: 'A bare JWT is a credential',
    file: 'src/secret-patterns.mjs',
    find: '  /\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}/',
    replace: '  /^$a^/',
    suites: ['tests/secret-cookie-jwt.test.mjs']
  },

  // ---- Reachability and persistence --------------------------------------
  {
    id: 'SEC-03', guard: "Today's default GitHub token format is a credential",
    file: 'src/secret-patterns.mjs',
    find: '  /\\bgithub_pat_[A-Za-z0-9_]{20,}/,',
    replace: '  /\\bgithub_pat_NEVER_MATCHES_THIS_SENTINEL/,',
    suites: ['tests/secret-format-coverage.test.mjs']
  },
  {
    id: 'SEC-04', guard: 'A credential-named key with a long value is a credential',
    file: 'src/secret-patterns.mjs',
    find: "  /(?:api[_-]?key|secret[_-]?key|secret[_-]?access[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|refresh[_-]?token)[\"']?\\s*[:=]\\s*[\"']?[A-Za-z0-9_\\-./+]{20,}/i",
    replace: '  /NEVER_MATCHES_THIS_SENTINEL_EITHER/i',
    suites: ['tests/secret-format-coverage.test.mjs']
  },
  {
    id: 'SEC-05', guard: 'The blocker is at least as strong as the redactor',
    file: 'src/secret-patterns.mjs',
    find: "  return new RegExp(SECRET_ASSIGNMENT_PATTERN.source, 'i').test(value);",
    replace: '  return false;',
    suites: ['tests/secret-format-coverage.test.mjs']
  },
  {
    id: 'SEC-06', guard: 'A base64-wrapped credential is still a credential',
    file: 'src/secret-patterns.mjs',
    find: '  if (decodesToSecret(value)) return true;',
    replace: '  void decodesToSecret;',
    suites: ['tests/secret-format-coverage.test.mjs']
  },
  {
    id: 'REACH-01', guard: 'A gate must be registered, not invented',
    file: 'tests/reachability-ratchet.test.mjs',
    find: "    .filter(([, entry]) => entry.category === 'AWAITING_ACTIVATION' && !gates[entry.gate])",
    replace: '    .filter(() => false)',
    suites: ['tests/reachability-ratchet.test.mjs'], selfMutating: true
  },
  {
    id: 'REACH-02', guard: 'The ratchet sees the whole src tree, not just its top level',
    file: 'tests/reachability-ratchet.test.mjs',
    find: "  const all = entryPointsIn('src');",
    replace: "  const all = filesIn('src');",
    suites: ['tests/reachability-ratchet.test.mjs']
  },
  {
    id: 'SCAN-01', guard: 'A repeated page is a stalled scan, not a successful read',
    file: 'src/durable-audit-scan.mjs',
    // Anchored on the condition as well as the return. Two branches in this file
    // returned exactly the same line, so the bare return matched twice and this
    // mutation only ever reached the first of them. Attacking the second proved
    // it was unreachable, and it has been removed; the anchor stays specific so
    // the ambiguity cannot come back silently.
    find: "    if (rows.length >= size && priorPageIdentity && identity === priorPageIdentity) {\n      return { ok: false, reasonCodes: ['audit-scan-pagination-stalled'], scannedRows, pages };",
    replace: "    if (false) {\n      return { ok: false, reasonCodes: ['audit-scan-pagination-stalled'], scannedRows, pages };",
    suites: ['tests/durable-audit-scan-ceiling.test.mjs']
  },
  {
    id: 'ROUTE-01', guard: 'Routing groups by target agent and cannot starve a queue',
    file: 'src/agent-model-routing-config.mjs',
    find: '  const result = routeWorkersByTargetAgent({',
    replace: '  const result = routePermittedWorkers({',
    suites: ['tests/agent-mesh-routing-starvation.test.mjs']
  },
  {
    id: 'STORE-02', guard: 'The JSON store refuses what PostgreSQL refuses',
    file: 'src/store.mjs',
    find: "    if (!Object.hasOwn(this.data, key)) {\n      throw new StoreError(`Unknown collection: ${key}`, 'INVALID_COLLECTION');\n    }",
    replace: '',
    suites: ['tests/store-lookup-allowlist.test.mjs']
  },
  {
    id: 'STORE-01', guard: 'Collection and column lookups are real allowlists',
    file: 'src/store.mjs',
    find: '  if (!Object.hasOwn(MAP, key)) throw new StoreError(`Unknown collection: ${key}`, \'INVALID_COLLECTION\');\n  return MAP[key];',
    replace: '  const def = MAP[key];\n  if (!def) throw new StoreError(`Unknown collection: ${key}`, \'INVALID_COLLECTION\');\n  return def;',
    suites: ['tests/store-lookup-allowlist.test.mjs'], needsPostgres: true
  },
  {
    id: 'NORM-01', guard: 'A body cannot describe itself as quieter than the atom it claims',
    file: 'src/capability-genome-body-normalize.mjs',
    find: '      atom: clone(atom),',
    replace: '      atom: { ...clone(atom), sideEffectClass: String(content.match(/sideEffectClass:\\s*([A-Z_]+)/)?.[1] || atom.sideEffectClass) },',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-02', guard: 'An evidence phrase cannot name an atom the taxonomy lacks',
    file: 'src/capability-genome-body-normalize.mjs',
    find: "    if (!taxonomy.has(atomId)) return fail(['evidence-term-references-unknown-atom'], { offendingAtomId: atomId });",
    replace: '    if (!taxonomy.has(atomId)) continue;',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-03', guard: 'One-word evidence phrases cannot mint atoms out of vocabulary',
    file: 'src/capability-genome-body-normalize.mjs',
    find: '      if (!value || value.split(/\\s+/).filter(Boolean).length < 2) {',
    replace: '      if (!value) {',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-04', guard: 'One static scan yields one security layer, never three',
    file: 'src/capability-genome-body-normalize.mjs',
    find: "      layer: 'STATIC',",
    replace: "      layer: screening.decision === 'STATIC_CLEAR' ? 'SANDBOX' : 'STATIC',",
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-05', guard: 'Normalization refuses bytes the evidence does not pin',
    file: 'src/capability-genome-body-normalize.mjs',
    find: "  if (!verified.ok) return fail(['body-content-must-match-pinned-identity', ...(verified.reasonCodes || [])]);",
    replace: '  void verified;',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-06', guard: 'A pointer to a licence file is not a licence grant',
    file: 'src/capability-genome-body-normalize.mjs',
    find: "  return { license: 'UNKNOWN', licenseConfidence: 0, basis: 'DECLARATION_NOT_AN_SPDX_IDENTIFIER', declaredHint: hint };",
    replace: "  return { license: 'MIT', licenseConfidence: 0.5, basis: 'DECLARATION_NOT_AN_SPDX_IDENTIFIER', declaredHint: hint };",
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-07', guard: 'A declared unmapped need cannot hide an atom that exists',
    file: 'src/capability-genome-body-normalize.mjs',
    find: "    if (taxonomyIds.has(value.toLowerCase())) return fail(['unmapped-need-names-an-existing-atom'], { offendingNeed: value });",
    replace: '    void taxonomyIds;',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'NORM-08', guard: 'The corpus counts only records actually sitting at NORMALIZED',
    file: 'src/capability-genome-body-normalize.mjs',
    find: "    if (item.capability.promotionState !== 'NORMALIZED') return fail(['normalized-promotion-state-required'], { offendingState: item.capability.promotionState });",
    replace: '    void item;',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  {
    id: 'GENOME-04', guard: 'A host under the .sh TLD is not a remote shell script',
    file: 'src/capability-genome-admission.mjs',
    find: "  if (/(?:https?:\\/\\/[^\\s/?#]+[/?#][^\\s]*\\.(?:sh|ps1)\\b|git\\+https?:)/i.test(corpus)) findings.push({ code: 'mutable-remote-dependency', severity: 'HIGH' });",
    replace: "  if (/(?:https?:\\/\\/[^\\s]+\\.(?:sh|ps1)|git\\+https?:)/i.test(corpus)) findings.push({ code: 'mutable-remote-dependency', severity: 'HIGH' });",
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  // ---- Free-first routing: a research report is not a send plan ----------
  {
    id: 'FREE-01', guard: 'A stale activation receipt derives no live flags',
    file: 'src/provider-activation-receipt.mjs',
    find: "    return providerState({ receiptState: 'STALE', reasonCodes: ['provider-activation-receipt-stale'], autoChargeRisk: receipt.autoChargeRisk, coldB2BRule: effectiveRule });",
    replace: '    void 0;',
    suites: ['tests/provider-activation-receipt.test.mjs', 'tests/free-first-outreach-router.test.mjs']
  },
  {
    id: 'FREE-02', guard: 'A receipt may tighten the registry cold rule and never loosen it',
    file: 'src/provider-activation-receipt.mjs',
    find: '  const effectiveRule = stricterColdRule(registryRule, receipt.coldB2BRule);',
    replace: '  const effectiveRule = receipt.coldB2BRule;',
    suites: ['tests/provider-activation-receipt.test.mjs', 'tests/free-first-outreach-router.test.mjs']
  },
  {
    id: 'FREE-03', guard: 'An observed quota may only lower a researched quota',
    file: 'src/free-first-outreach-router.mjs',
    find: '  const values = [researched, observed].filter(value => value != null);',
    replace: '  const values = observed != null ? [observed] : [researched];',
    suites: ['tests/free-first-outreach-router.test.mjs']
  },
  {
    id: 'FREE-04', guard: 'A receipt carrying a credential value is refused whole',
    file: 'src/provider-activation-receipt.mjs',
    find: '  if (secretHits.length) return fail(secretHits);',
    replace: '  if (false) return fail(secretHits);',
    suites: ['tests/provider-activation-receipt.test.mjs']
  },
  {
    id: 'FREE-05', guard: 'A recipient cap is compared against a real audience',
    file: 'src/free-first-outreach-router.mjs',
    find: "    if (audienceSize != null && audienceSize > effectiveRecipientCap) reasons.push('provider-recipient-cap-exceeded');",
    replace: '    if (false) reasons.push(\'provider-recipient-cap-exceeded\');',
    suites: ['tests/free-first-outreach-router.test.mjs']
  },
  {
    id: 'FREE-06', guard: 'An observed auto-charge risk refuses the free route',
    file: 'src/free-first-outreach-router.mjs',
    find: "  if (provider.freePlan.autoChargeAfterExpiry || state.autoChargeRisk) reasons.push('auto-charge-free-route-prohibited');",
    replace: "  if (provider.freePlan.autoChargeAfterExpiry) reasons.push('auto-charge-free-route-prohibited');",
    suites: ['tests/free-first-outreach-router.test.mjs']
  },
  {
    id: 'FREE-07', guard: 'LIVE routing names a missing activation receipt',
    file: 'src/free-first-outreach-router.mjs',
    find: "    if (state.receiptState === 'MISSING') reasons.push('provider-activation-receipt-missing');",
    replace: '    void 0;',
    suites: ['tests/free-first-outreach-router.test.mjs']
  },

  // ---- Postal: what the provider actually witnessed --------------------
  {
    id: 'POSTAL-01', guard: 'Only an authenticated Postal webhook row can reconcile',
    file: 'src/omnia-v9/integrations/providers/postal-effect-adapter.mjs',
    find: "    if (row.provenance !== 'AUTHENTICATED_POSTAL_WEBHOOK') return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'unauthenticated-or-unproven-reconciliation-row' } });",
    replace: '',
    suites: ['tests/postal-effect-adapter.test.mjs']
  },
  {
    id: 'POSTAL-02', guard: 'A bounce is acceptance with negative delivery, never provider rejection',
    file: 'src/omnia-v9/integrations/providers/postal-effect-adapter.mjs',
    find: "          negativeDeliveryEvidence: NEGATIVE_DELIVERY_STATUSES.has(status)",
    replace: "          negativeDeliveryEvidence: false",
    suites: ['tests/postal-effect-adapter.test.mjs']
  },

  // ---- First cash: contact, acceptance and the canary limit -------------
  {
    id: 'CASH-01', guard: 'Only customer-bound external evidence can accept a delivery',
    file: 'src/lead-path-sprint-fulfillment.mjs',
    find: "        if (!validExternalCustomerEvidence(evidence, expectedCustomerRef)) {",
    replace: '        if (false) {',
    suites: ['tests/night-payment-customer-binding.test.mjs']
  },
  {
    id: 'CASH-02', guard: 'Contact needs every gate, not any gate',
    file: 'src/first-cash-canary-packet.mjs',
    find: '  return FIRST_CASH_CONTACT_GATES.every(id => gates?.[id]?.satisfied === true);',
    replace: '  return FIRST_CASH_CONTACT_GATES.some(id => gates?.[id]?.satisfied === true);',
    suites: ['tests/first-cash-canary-packet.test.mjs']
  },

  // ---- Domain: an expectation is not a reading --------------------------
  {
    id: 'DOMAIN-01', guard: 'A record this system generated cannot verify itself',
    file: 'src/domain-purpose-plan.mjs',
    find: '  if (obs.provenance !== expectedProvenance) {',
    replace: '  if (false) {',
    suites: ['tests/domain-purpose-plan.test.mjs']
  },
  {
    id: 'DOMAIN-02', guard: 'A stale DNS observation stops verifying',
    file: 'src/domain-purpose-plan.mjs',
    find: '  if (ageHours > maxObservationAgeHours) {',
    replace: '  if (false) {',
    suites: ['tests/domain-purpose-plan.test.mjs']
  },

  // ---- Model routing: the credential and the identity that served -------
  {
    id: 'GATEWAY-01', guard: 'Provider error text is scrubbed before it reaches a receipt',
    file: 'src/vercel-ai-gateway-executor.mjs',
    find: "const safeDetail = (error, max = 500) => text(redactSecrets(String(error?.message ?? error ?? '')), max);",
    replace: "const safeDetail = (error, max = 500) => text(String(error?.message ?? error ?? ''), max);",
    suites: ['tests/vercel-ai-gateway-executor.test.mjs']
  },
  {
    id: 'GENOME-05', guard: 'Remote package execution is a finding in its own right',
    file: 'src/capability-genome-admission.mjs',
    find: "  if (/(?:^|[\\s`|;&(])(?:npx|bunx|pnpm\\s+dlx|yarn\\s+dlx)\\s+[^\\s`]/im.test(corpus)) findings.push({ code: 'remote-package-execution', severity: 'HIGH' });",
    replace: '',
    suites: ['tests/capability-genome-body-normalize.test.mjs']
  },
  // ---- Convergence: the rules this merge decided, held down --------------
  {
    id: 'CONV-01', guard: 'Caller-asserted provider state cannot open a LIVE route',
    file: 'src/free-first-outreach-router.mjs',
    find: "  if (mode === 'LIVE') {\n    if (explicit) {",
    replace: "  if (mode === 'LIVE') {\n    if (false) {",
    suites: ['tests/night-convergence-runtime.test.mjs', 'tests/free-first-outreach-router.test.mjs']
  },
  {
    id: 'CONV-02', guard: 'The gateway reads AI_GATEWAY_*, never a prefix derived from its id',
    file: 'src/agent-model-executor-factory.mjs',
    find: "    prefix: 'AI_GATEWAY',",
    replace: "    prefix: 'AI-GATEWAY',",
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'CONV-03', guard: 'Negative pricing is not pricing evidence',
    file: 'src/agent-model-executor-factory.mjs',
    find: '  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0 || !sourceRef || !verifiedAtRaw) return null;',
    replace: '  if (!Number.isFinite(input) || !Number.isFinite(output) || !sourceRef || !verifiedAtRaw) return null;',
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'CONV-04', guard: 'Pricing verified at an unparseable time is unverified',
    file: 'src/agent-model-executor-factory.mjs',
    find: '  if (!Number.isFinite(verifiedAtMs)) return null;',
    replace: '  if (false) return null;',
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'CONV-05', guard: 'A record this system generated cannot verify itself',
    file: 'src/domain-purpose-plan.mjs',
    find: '  const verifiable = observedProvenance && !generated && reasonCodes.length === 0 && !blocked;',
    replace: '  const verifiable = observedProvenance && reasonCodes.length === 0 && !blocked;',
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'CONV-06', guard: 'The fifth qualified conversation with no paid pilot ends the canary',
    file: 'src/first-cash-canary-guard.mjs',
    find: '  if (q === FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS) {',
    replace: '  if (false) {',
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'CONV-07', guard: 'The first-cash offer stays bound to the canonical Lead-Path SKU',
    file: 'src/first-cash-canary-packet.mjs',
    find: "  name: 'White-label Lead-Path Revenue Leak Evidence Sprint',\n  sku: LEAD_PATH_SPRINT_SKU,",
    replace: "  name: 'White-label Lead-Path Revenue Leak Evidence Sprint',\n  sku: 'some-other-sku',",
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'CONV-08', guard: 'CODE_READY needs observed elapsed operation, not an absence of complaints',
    file: 'src/founder-absence-blocker-doctor.mjs',
    find: "    overall = proven && gaps.length === 0 ? 'CODE_READY' : 'ELAPSED_EVIDENCE_PENDING';",
    replace: "    overall = 'CODE_READY';",
    suites: ['tests/night-convergence-runtime.test.mjs']
  },
  {
    id: 'POSTAL-409', guard: 'HTTP 409 is an ambiguous outcome, never a definite rejection',
    file: 'src/omnia-v9/integrations/providers/postal-effect-adapter.mjs',
    find: 'const DEFINITE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 422]);',
    replace: 'const DEFINITE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 409, 422]);',
    suites: ['tests/postal-effect-adapter.test.mjs', 'tests/postal-ragnarok-hardening.test.mjs']
  },
  {
    id: 'POSTAL-ZERO', guard: 'No webhook row is not proof that nothing was submitted',
    file: 'src/omnia-v9/integrations/providers/postal-effect-adapter.mjs',
    find: "    if (!Array.isArray(matches) || matches.length === 0) return evidence({ businessKey, lifecycle: 'UNCERTAIN', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'zero-webhook-matches-not-proof-of-non-submission', tag: identity.tag } });",
    replace: "    if (!Array.isArray(matches) || matches.length === 0) return evidence({ businessKey, lifecycle: 'RECONCILED_NOT_SUBMITTED', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'zero-webhook-matches', tag: identity.tag } });",
    suites: ['tests/postal-effect-adapter.test.mjs', 'tests/postal-ragnarok-hardening.test.mjs']
  },
  {
    // Anchored in the evidence module rather than the ledger wrapper. Both
    // filter the same three fields, and because the wrapper's result is fed
    // straight into deriveCurrentPostalState, removing the wrapper's copy alone
    // changes no output at all -- it survives every test, not because nothing
    // tests it but because nothing can. This is the one that decides.
    id: 'POSTAL-QUARANTINE', guard: 'A quarantined webhook row is never reconcilable',
    file: 'src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs',
    find: "    .filter(row => row?.authenticated === true && row?.quarantineReason == null && row?.eligibleForReconciliation === true)",
    replace: '',
    suites: ['tests/postal-ragnarok-hardening.test.mjs']
  },
  {
    id: 'PROPOSAL-01', guard: 'A self-reported win cannot make itself eligible for commercial truth',
    file: 'src/proposal-acceptance-engine.mjs',
    find: "  if (!externalPayment) eligibilityBlockers.push('external-payment-evidence-required');",
    replace: '',
    suites: ['tests/proposal-acceptance-engine.test.mjs']
  },
  {
    id: 'PROPOSAL-02', guard: 'A sandbox payment reference is not external payment evidence',
    file: 'src/proposal-acceptance-engine.mjs',
    find: "    && !/(?:^|[-_:])(sandbox|synthetic|fixture|fake|test)(?:[-_:]|$)/i.test(ref);",
    replace: '    ;',
    suites: ['tests/proposal-acceptance-engine.test.mjs']
  }
];

// Two deadlines, because a hang here stops the gate rather than failing it.
//
// The war had neither. One suite that never returns -- and a real database
// makes that reachable, as the postgres-real runner found the hard way -- left
// the whole run sitting in ep_poll with no output, no verdict, and nothing to
// say which mutation it was on. Thirteen minutes of a run were spent that way
// before anyone looked at /proc.
//
// --test-timeout bounds each individual test so most hangs surface as an
// ordinary failure. The spawn timeout is the backstop for the ones that do not:
// a suite wedged before the runner starts counting, or a child that ignores it.
// A killed suite gets its own verdict rather than being read as a mutant that
// died or a guard that held.
const SUITE_TEST_TIMEOUT_MS = 120_000;
const SUITE_WALL_TIMEOUT_MS = 600_000;

function runSuites(root, suites, databaseUrl = null) {
  const result = spawnSync(process.execPath, ['--test', `--test-timeout=${SUITE_TEST_TIMEOUT_MS}`, ...suites], {
    cwd: root, encoding: 'utf8',
    timeout: SUITE_WALL_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      ...(databaseUrl ? { OMNIA_V9_TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl } : {})
    }
  });
  return {
    status: result.status,
    // spawnSync reports a timeout kill as an ETIMEDOUT error rather than in the
    // status, so the caller cannot tell it from an ordinary non-zero exit.
    timedOut: result.error?.code === 'ETIMEDOUT',
    output: `${result.stdout || ''}${result.stderr || ''}`
  };
}


const declaredSkip = verdict => verdict === 'SKIPPED_NEEDS_POSTGRES' || verdict === 'SKIPPED_NEEDS_BROWSER';

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyId = process.argv[2] || '';
  // Same shape as the PostgreSQL gate above. A mutation whose only killing suite
  // needs a real browser cannot be honestly reported as killed when no browser is
  // configured, and must not be reported as surviving either.
  //
  // But an installed browser nobody named is still a browser. This gate read
  // CHROMIUM_PATH and nothing else, and nothing in this repository sets it, so on
  // a machine with Chromium sitting on disk the war reported
  // SKIPPED_NEEDS_BROWSER for a guard it could have exercised -- and in the
  // summary line a skip that could not be helped looks exactly like a skip that
  // could. So it looks first, and only reports the skip when there is genuinely
  // nothing to drive.
  // Why a verdict that is not a verdict happened, kept with the verdict. A gate
  // that says SUITE_TIMED_OUT and nothing else sends its reader to a
  // reproduction that may not reproduce.
  const diagnostics = new Map();
  const retried = new Set();

  const chromium = resolveChromium();
  if (chromium) process.env.CHROMIUM_PATH = chromium;
  const hasBrowser = Boolean(chromium);
  const selected = MUTATIONS.filter(mutation => !onlyId || mutation.id === onlyId);
  const results = [];

  // MUTATION_WAR_JOURNAL makes the run resumable. Verdicts are appended as they
  // are decided and replayed on the next run, but only for mutations whose
  // registration still hashes the same -- see scripts/mutation-journal.mjs for
  // why that binding is the whole point rather than a detail.
  const journalPath = String(process.env.MUTATION_WAR_JOURNAL || '').trim();
  const journal = journalPath ? loadJournal(journalPath, selected) : new Map();
  const record = (mutation, verdict) => {
    results.push({ ...mutation, verdict });
    // appendVerdict refuses skip verdicts itself -- see mutation-journal.mjs
    // for why that rule belongs to the journal rather than to its callers.
    if (journalPath) appendVerdict(journalPath, mutation, verdict);
  };

  for (const mutation of selected) {
    const remembered = journal.get(mutation.id);
    if (remembered) {
      results.push({ ...mutation, verdict: remembered, fromJournal: true });
      continue;
    }
    if (mutation.needsBrowser && !hasBrowser) {
      record(mutation, 'SKIPPED_NEEDS_BROWSER');
      continue;
    }
    const root = mkdtempSync(join(tmpdir(), 'uberbond-mutation-'));
    try {
      cpSync(join(repoRoot, 'src'), join(root, 'src'), { recursive: true });
      cpSync(join(repoRoot, 'tests'), join(root, 'tests'), { recursive: true });
      cpSync(join(repoRoot, 'scripts'), join(root, 'scripts'), { recursive: true });
      cpSync(join(repoRoot, 'config'), join(root, 'config'), { recursive: true });
      cpSync(join(repoRoot, 'migrations'), join(root, 'migrations'), { recursive: true });
      // `api` was missing, which meant no route could be mutated at all -- the
      // cron routes and the billing webhook among them. A mutation naming a file
      // the sandbox does not contain fails with ENOENT rather than reporting a
      // surviving guard, so the gap was invisible until something tried to use
      // it. Routes are where admission and enablement checks live, which is
      // exactly the kind of guard worth sabotaging.
      cpSync(join(repoRoot, 'api'), join(root, 'api'), { recursive: true });
      // The process entry points, for the same reason as `api`: a suite that
      // spawns server.mjs runs it from the sandbox, so a mutation of it only
      // means anything if the sandbox has it. The hardened facade delegates to
      // server-core.mjs, so the sandbox must carry both halves of that entry
      // surface or a server mutant can fail because its implementation vanished.
      for (const entry of ['server.mjs', 'server-core.mjs', 'worker.mjs']) {
        try { cpSync(join(repoRoot, entry), join(root, entry)); } catch { /* absent in a trimmed tree */ }
      }
      cpSync(join(repoRoot, 'package.json'), join(root, 'package.json'));
      // Linked, not copied.
      //
      // Copying 116MB of node_modules for each of 160 mutations is ~18GB of I/O
      // per run, and that load is not free: three database-backed suites that
      // finish in under a second alone were timing out at 120s inside a full
      // run, hitting the same stall the postgres-real runner was repaired for --
      // a backend asleep writing to a socket nobody is reading. The gate was
      // reporting "not tested" about guards it had made untestable.
      //
      // Nothing mutates a dependency, and applyMutation refuses to try, so the
      // tree can be shared. Node resolves through a symlinked node_modules the
      // same way it does for npm link.
      symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');

      // A mutant that does not parse proves nothing: the suite would fail for
      // the wrong reason. Confirm the baseline is green first, then mutate.
      const applied = applyMutation(root, mutation);
      if (!applied.applied) {
        // An ambiguous anchor and a missing one are different mistakes and need
        // different repairs, so the report says which.
        record(mutation, applied.reason === 'anchor-ambiguous' ? 'ANCHOR_AMBIGUOUS' : 'ANCHOR_NOT_FOUND');
        continue;
      }
      const syntax = spawnSync(process.execPath, ['--check', join(root, mutation.file)], { encoding: 'utf8' });
      if (syntax.status !== 0) {
        record(mutation, 'MUTANT_DID_NOT_PARSE');
        continue;
      }
      // A private server for anything that needs a database, rather than a
      // database on a shared one -- see scripts/disposable-postgres.mjs for what
      // sharing cost and why the sharing went rather than one more theory about
      // which shared thing it was.
      const attempt = () => (mutation.needsPostgres
        ? withDisposablePostgres(url => runSuites(root, mutation.suites, url))
        : Promise.resolve(runSuites(root, mutation.suites)));

      // The war starts its own database now, so a database-backed guard is no
      // longer skipped for want of one being handed to it -- which is what
      // SKIPPED_NEEDS_POSTGRES used to mean, and what quietly left nine guards
      // unexercised on any machine nobody had configured. The skip survives only
      // for a server that will not start, because that is a real absence rather
      // than an unset variable.
      let run;
      try {
        run = await attempt();
      } catch (error) {
        record(mutation, 'SKIPPED_NEEDS_POSTGRES');
        diagnostics.set(mutation.id, [`embedded PostgreSQL would not start: ${error?.message || error}`]);
        continue;
      }
      let verdict = classifySuiteRun(run);

      // One second attempt, and only for a hang.
      //
      // This is not retrying a failure until it passes. SUITE_TIMED_OUT is the
      // verdict for "no measurement was taken", and a guard that was never
      // tested is the one thing this file must not leave standing. The first
      // attempt's own stuck backend is reclaimed above before the second runs,
      // so the retry is against a materially different state rather than a
      // repeat of an unchanged mechanism.
      //
      // Whatever the second attempt says is final, including another hang. It is
      // recorded and marked, so nothing here can be read as a clean first pass.
      if (verdict === 'SUITE_TIMED_OUT') {
        run = await attempt().catch(() => run);
        verdict = classifySuiteRun(run);
        retried.add(mutation.id);
      }
      // A verdict that does not say why is a dead end for whoever reads it.
      // SUITE_DID_NOT_RUN and SUITE_TIMED_OUT both mean "go and find out", and
      // the run that knows the answer is the one being thrown away here -- so
      // the lines that look like a cause are kept with the verdict rather than
      // left to a reproduction that may not reproduce.
      if (verdict !== 'KILLED' && verdict !== 'SURVIVED') {
        diagnostics.set(mutation.id, run.output
          .split('\n')
          .filter(line => /error|Error|ERR_|ECONN|not ok|refus|denied|too many|timeout|cannot|Cannot/.test(line))
          .slice(0, 8));
      }
      record(mutation, verdict);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const notKilled = results.filter(item => item.verdict !== 'KILLED' && !declaredSkip(item.verdict));
  for (const item of results) {
    console.log(`${item.verdict.padEnd(22)} ${item.id.padEnd(10)} ${item.guard}${item.fromJournal ? ' (replayed)' : retried.has(item.id) ? ' (second attempt after a hang)' : ''}`);
  }
  console.log('');
  console.log(`mutation-war — ${results.length} mutations, ${results.filter(i => i.verdict === 'KILLED').length} killed, ${notKilled.length} not killed`);
  if (notKilled.length) {
    console.log('');
    // Not all of these mean the same thing, and saying they do is how a missing
    // runtime gets read as a missing test.
    const proven = notKilled.filter(item => item.verdict === 'SURVIVED');
    const unproven = notKilled.filter(item => item.verdict !== 'SURVIVED');
    if (proven.length) {
      console.log('A guard nothing kills is a guard nothing tests:');
      for (const item of proven) console.log(`  ${item.id} ${item.guard}`);
    }
    if (unproven.length) {
      if (proven.length) console.log('');
      console.log('These were not tested at all, which is not the same as surviving:');
      for (const item of unproven) {
        console.log(`  ${item.id} ${item.guard} (${item.verdict})`);
        for (const line of diagnostics.get(item.id) || []) console.log(`      ${line.trim().slice(0, 160)}`);
      }
    }
  }
  process.exit(notKilled.length ? 1 : 0);
}
