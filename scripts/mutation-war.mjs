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
    // Anchored on the merge, not on the count check. The count check is a
    // backstop no current input can reach, so mutating it survives every test;
    // this is the branch that actually decides whether a second naming of the
    // same concept is remembered or silently discarded.
    id: 'OMEGA-MATRIX-01', guard: 'A second naming of the same concept is remembered, not discarded',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: '      if (!existing.sourceArtifacts.includes(concept.sourceArtifact)) existing.sourceArtifacts.push(concept.sourceArtifact);',
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'OMEGA-MATRIX-02', guard: 'A sub-phrase match cannot be promoted to VERIFIED_CURRENT',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "  if (evidence.matchScope !== 'WHOLE_NAME') return 'PARTIAL_CURRENT';",
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'OMEGA-MATRIX-03', guard: 'A concept name is never split on whitespace into false evidence',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    .split(/\\s+and\\s+|\\s*\\/\\s*|\\s*,\\s*|\\s+plus\\s+/i)",
    replace: '    .split(/\\s+/)',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
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
    id: 'OMEGA-MATRIX-04', guard: 'A declaration cannot claim a file that is not in the tree',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    if (missing.length) { problems.push({ reason: 'manifest-names-missing-files', concept, missing }); continue; }",
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'OMEGA-MATRIX-05', guard: 'A declaration cannot name a concept the canon does not contain',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    if (!conceptSlugs.has(slug)) { problems.push({ reason: 'manifest-names-unknown-concept', concept }); continue; }",
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    // Anchored on the refusal to emit, not on the verification itself: the
    // damage is a matrix that compiles with some declarations silently dropped,
    // which reads exactly like a complete one.
    id: 'OMEGA-MATRIX-06', guard: 'An invalid manifest stops the matrix instead of emitting partial rows',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: '  if (!declarations.ok) {',
    replace: '  if (false) {',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    // The exact defect this replaced: written as an equality check against one
    // version, a schema bump switched off memory validation without deleting a
    // line of it.
    id: 'BRAIN-SCHEMA-01', guard: 'A newer bootstrap schema cannot shed the memory-v2 requirements',
    file: 'src/uberbond-brain-context.mjs',
    find: "export const requiresMemoryV2 = schemaVersion => schemaVersion !== 'uberbond-bootstrap-1.0.0';",
    replace: "export const requiresMemoryV2 = schemaVersion => schemaVersion === 'uberbond-bootstrap-1.1.0';",
    suites: ['tests/uberbond-brain-bootstrap.test.mjs']
  },
  {
    id: 'BRAIN-SCHEMA-02', guard: 'An unknown bootstrap schema fails closed instead of being half-read',
    file: 'src/uberbond-brain-context.mjs',
    find: "  if (!SUPPORTED_BOOTSTRAP_SCHEMAS.includes(schemaVersion)) reasonCodes.push('unsupported-bootstrap-schema');",
    replace: '',
    suites: ['tests/uberbond-brain-bootstrap.test.mjs', 'tests/perpetual-frontier-genesis.test.mjs']
  },
  // ---- The type ladder between what is observed and what is done ---------
  {
    id: 'SOVTYPE-01', guard: 'A prediction cannot be promoted into a value',
    file: 'src/sovereignty-type-system.mjs',
    find: "  if (humanAct === crossing) return { allowed: true, reasonCodes: [], humanAct };",
    replace: '  if (true) return { allowed: true, reasonCodes: [], humanAct };',
    suites: ['tests/sovereignty-type-system.test.mjs']
  },
  {
    // Without the skip rule the three crossings are decorative: an observation
    // promoted straight to a recommendation never touches PREDICTION->VALUE.
    id: 'SOVTYPE-02', guard: 'A human-only crossing cannot be stepped over by skipping a rung',
    file: 'src/sovereignty-type-system.mjs',
    find: '  if (to - from > 1) {',
    replace: '  if (false) {',
    suites: ['tests/sovereignty-type-system.test.mjs']
  },
  {
    id: 'SOVTYPE-03', guard: 'The highest source rung governs a derivation',
    file: 'src/sovereignty-type-system.mjs',
    find: '  const highest = rows.reduce((best, row) => (rungOf(row.type) > rungOf(best.type) ? row : best), rows[0]);',
    replace: '  const highest = rows[0];',
    suites: ['tests/sovereignty-type-system.test.mjs']
  },
  {
    id: 'SOVTYPE-04', guard: 'A delegation must expire',
    file: 'src/sovereignty-type-system.mjs',
    find: "  if (!expiresAt) return fail('AUTHORITY_DENIED', ['delegation-must-expire'], { action: act });",
    replace: '',
    suites: ['tests/sovereignty-type-system.test.mjs']
  },
  {
    // The hard one to see: every hop narrows the action set and looks correct
    // while the expiry walks forward.
    id: 'SOVTYPE-05', guard: 'A narrowing delegation chain cannot extend its own expiry',
    file: 'src/sovereignty-type-system.mjs',
    find: '  if (Date.parse(wanted) > Date.parse(parent.expiresAt)) {',
    replace: '  if (false) {',
    suites: ['tests/sovereignty-type-system.test.mjs']
  },
  {
    id: 'SOVTYPE-06', guard: 'Re-delegation may only attenuate',
    file: 'src/sovereignty-type-system.mjs',
    find: "  const widened = requested.filter(action => !parent.delegatedActions.includes(action));",
    replace: '  const widened = [];',
    suites: ['tests/sovereignty-type-system.test.mjs']
  },
  // ---- The option universe and the forecasts over it ---------------------
  {
    id: 'DECIDE-01', guard: 'A probability requires quantitative evidence, not a persuasive story',
    file: 'src/sovereign-decision-packet.mjs',
    find: '  } else if (quantitative.length === 0) {',
    replace: '  } else if (false) {',
    suites: ['tests/sovereign-decision-packet.test.mjs']
  },
  {
    id: 'DECIDE-02', guard: 'Options that change the same things are one option',
    file: 'src/sovereign-decision-packet.mjs',
    find: '    const existing = bySignature.get(signature);',
    replace: '    const existing = null;',
    suites: ['tests/sovereign-decision-packet.test.mjs']
  },
  {
    id: 'DECIDE-03', guard: 'Reversibility is part of what makes an option distinct',
    file: 'src/sovereign-decision-packet.mjs',
    find: '  return createHash(\'sha256\').update(JSON.stringify([changes, reversible])).digest(\'hex\').slice(0, 32);',
    replace: '  return createHash(\'sha256\').update(JSON.stringify([changes])).digest(\'hex\').slice(0, 32);',
    suites: ['tests/sovereign-decision-packet.test.mjs']
  },
  {
    id: 'DECIDE-04', guard: 'A packet whose options were not all forecast is refused',
    file: 'src/sovereign-decision-packet.mjs',
    find: '  if (unforecast.length) {',
    replace: '  if (false) {',
    suites: ['tests/sovereign-decision-packet.test.mjs']
  },
  {
    id: 'DECIDE-05', guard: 'A value boundary produces no winner',
    file: 'src/sovereign-decision-packet.mjs',
    find: '  const recommendation = valueBoundary || quantified.length === 0',
    replace: '  const recommendation = false',
    suites: ['tests/sovereign-decision-packet.test.mjs']
  },
  {
    id: 'DECIDE-06', guard: 'Correlated sources are not counted as independent evidence',
    file: 'src/sovereign-decision-packet.mjs',
    find: '  const independentSources = new Set(rows.map(row => row.ref).filter(Boolean));',
    replace: '  const independentSources = rows;',
    suites: ['tests/sovereign-decision-packet.test.mjs']
  },
  // ---- Which reasoning deserves trust, and when to stop ------------------
  {
    // Abundant data must not silently convert a value question into a
    // statistical one, which is how the boundary gets crossed with nobody
    // deciding to cross it.
    id: 'METARAT-01', guard: 'The irreducible check runs before evidence, not after it',
    file: 'src/meta-rational-boundary.mjs',
    find: '  const irreducible = IRREDUCIBLE_QUESTION_KINDS[kind];',
    replace: '  const irreducible = data === undefined ? IRREDUCIBLE_QUESTION_KINDS[kind] : null;',
    suites: ['tests/meta-rational-boundary.test.mjs']
  },
  {
    id: 'METARAT-02', guard: 'A method needing absent data yields UNKNOWN rather than a guess',
    file: 'src/meta-rational-boundary.mjs',
    find: '  const usable = candidates.filter(([, spec]) => !spec.needsData || data.size > 0);',
    replace: '  const usable = candidates;',
    suites: ['tests/meta-rational-boundary.test.mjs']
  },
  {
    id: 'METARAT-03', guard: 'Delay and option decay count as costs of continuing to reason',
    file: 'src/meta-rational-boundary.mjs',
    find: '  const cost = (Number(cognitionCost) || 0) + (Number(delayCost) || 0) + (Number(optionDecay) || 0);',
    replace: '  const cost = (Number(cognitionCost) || 0);',
    suites: ['tests/meta-rational-boundary.test.mjs']
  },
  {
    id: 'METARAT-04', guard: 'Sources sharing an ancestor are one observation repeated',
    file: 'src/meta-rational-boundary.mjs',
    find: '  const lineages = new Set(rows.map(row => row.ancestry || row.id));',
    replace: '  const lineages = new Set(rows.map(row => row.id));',
    suites: ['tests/meta-rational-boundary.test.mjs']
  },
  // ---- Forecasts scored against what actually happened -------------------
  {
    id: 'CALIB-01', guard: 'A forecast edited after recording cannot be scored',
    file: 'src/reality-calibration-ledger.mjs',
    find: '  if (forecast.seal !== sealForecast(forecast)) {',
    replace: '  if (false) {',
    suites: ['tests/reality-calibration-ledger.test.mjs']
  },
  {
    id: 'CALIB-02', guard: 'An outcome known at forecast time measures memory, not prediction',
    file: 'src/reality-calibration-ledger.mjs',
    find: '  if (Date.parse(at) <= Date.parse(forecast.evidenceCutoff)) {',
    replace: '  if (false) {',
    suites: ['tests/reality-calibration-ledger.test.mjs']
  },
  {
    id: 'CALIB-03', guard: 'An outcome outside the forecast state space is a finding, not a score',
    file: 'src/reality-calibration-ledger.mjs',
    find: '  if (!Object.hasOwn(forecast.probabilities, observed)) {',
    replace: '  if (false) {',
    suites: ['tests/reality-calibration-ledger.test.mjs']
  },
  {
    id: 'CALIB-04', guard: 'A distribution that does not sum to one is refused',
    file: 'src/reality-calibration-ledger.mjs',
    find: "  if (outcomes.length && Math.abs(total - 1) > 0.001) reasonCodes.push('probabilities-must-sum-to-one');",
    replace: '',
    suites: ['tests/reality-calibration-ledger.test.mjs']
  },
  {
    id: 'CALIB-05', guard: 'Decision quality is judged on what was knowable, not on the outcome',
    file: 'src/reality-calibration-ledger.mjs',
    find: "    quality: missed.length === 0 && alternatives.length > 1 ? 'WELL_MADE' : 'IMPROVABLE',",
    replace: "    quality: score.brierScore < 0.5 ? 'WELL_MADE' : 'IMPROVABLE',",
    suites: ['tests/reality-calibration-ledger.test.mjs']
  },
  {
    id: 'CALIB-06', guard: 'No scored forecasts means calibration is unknown, not good',
    file: 'src/reality-calibration-ledger.mjs',
    find: '  if (rows.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/reality-calibration-ledger.test.mjs']
  },
  // ---- The founder's read-only view of the sovereign organs --------------
  {
    // The seam through which a read surface would become an acting one.
    id: 'SOVCTRL-01', guard: 'The sovereign control surface is GET-only',
    file: 'api/sovereign-control.mjs',
    find: "    if (String(req?.method || '').toUpperCase() !== 'GET') {",
    replace: '    if (false) {',
    suites: ['tests/sovereign-control-surface.test.mjs']
  },
  {
    id: 'SOVCTRL-02', guard: 'An unauthenticated read of the sovereign surface is refused',
    file: 'api/sovereign-control.mjs',
    find: '    if (!equalBearer(req?.headers?.authorization, env.ADMIN_TOKEN)) {',
    replace: '    if (false) {',
    suites: ['tests/sovereign-control-surface.test.mjs']
  },
  {
    id: 'SOVCTRL-03', guard: 'An unconfigured admin token refuses rather than serving open',
    file: 'api/sovereign-control.mjs',
    find: '    if (!env.ADMIN_TOKEN) {',
    replace: '    if (false) {',
    suites: ['tests/sovereign-control-surface.test.mjs']
  },
  {
    id: 'DECIDE-07', guard: 'Unstated reversibility is unknown, not irreversible',
    file: 'src/sovereign-decision-packet.mjs',
    find: '      reversible: option?.reversible === true ? true : (option?.reversible === false ? false : null),',
    replace: '      reversible: option?.reversible === true,',
    suites: ['tests/sovereign-decision-packet.test.mjs', 'tests/sovereign-control-surface.test.mjs']
  },
  // ---- Experiences, and the limits on optimizing them --------------------
  {
    // A bonus is a number, and a large enough number elsewhere always outvotes
    // it. Being outside the ranking is the only version that holds.
    id: 'EXPER-01', guard: 'Present-value and uncopyable experiences are set apart, not scored',
    file: 'src/experience-compiler.mjs',
    find: '    comparable: experience.uncopyable === null && experience.presentValue === false',
    replace: '    comparable: true',
    suites: ['tests/experience-compiler.test.mjs', 'tests/sovereign-control-surface.test.mjs']
  },
  {
    id: 'EXPER-02', guard: 'Compound value counts dimensions rather than summing them',
    file: 'src/experience-compiler.mjs',
    find: '    ranked: [...comparable].sort((a, b) => b.compound - a.compound || b.magnitude - a.magnitude),',
    replace: '    ranked: [...comparable].sort((a, b) => b.magnitude - a.magnitude),',
    suites: ['tests/experience-compiler.test.mjs']
  },
  {
    id: 'EXPER-03', guard: 'A reversible probe beats more modelling',
    file: 'src/experience-compiler.mjs',
    find: '  if (reversibleProbeAvailable) {',
    replace: '  if (false) {',
    suites: ['tests/experience-compiler.test.mjs', 'tests/sovereign-control-surface.test.mjs']
  },
  {
    id: 'EXPER-04', guard: 'An off-limits domain stays unmodelled however useful modelling would be',
    file: 'src/experience-compiler.mjs',
    find: '  if (declaredOffLimits) {',
    replace: '  if (declaredOffLimits && (Number(usefulnessOfModelling) || 0) < 0.9) {',
    suites: ['tests/experience-compiler.test.mjs']
  },
  // ---- Whether an option can end the ability to choose again -------------
  {
    id: 'RUIN-01', guard: 'An absorbing outcome is not cleared at any probability',
    file: 'src/ruin-firewall.mjs',
    find: '  const ruinous = rows.filter(row => absorbing(row.recoverability));',
    replace: '  const ruinous = rows.filter(row => absorbing(row.recoverability) && (row.probability ?? 1) > 0.05);',
    suites: ['tests/ruin-firewall.test.mjs', 'tests/sovereign-control-surface.test.mjs']
  },
  {
    id: 'RUIN-02', guard: 'An unclassified outcome blocks the screen rather than passing as safe',
    file: 'src/ruin-firewall.mjs',
    find: '  if (unclassified.length) {',
    replace: '  if (false) {',
    suites: ['tests/ruin-firewall.test.mjs']
  },
  {
    id: 'RUIN-03', guard: 'Practically irreversible counts as absorbing',
    file: 'src/ruin-firewall.mjs',
    find: "export const absorbing = level => level === 'PRACTICALLY_IRREVERSIBLE' || level === 'ABSORBING';",
    replace: "export const absorbing = level => level === 'ABSORBING';",
    suites: ['tests/ruin-firewall.test.mjs']
  },
  {
    id: 'RUIN-04', guard: 'A recovery plan with no detection step is refused',
    file: 'src/ruin-firewall.mjs',
    find: '  if (!steps.detection) {',
    replace: '  if (false) {',
    suites: ['tests/ruin-firewall.test.mjs']
  },
  {
    id: 'RUIN-05', guard: 'Positions sharing a dependency are one position',
    file: 'src/ruin-firewall.mjs',
    find: '    effectiveIndependentPositions: rows.length - singlePoints.reduce((sum, row) => sum + row.positions.length - 1, 0),',
    replace: '    effectiveIndependentPositions: rows.length,',
    suites: ['tests/ruin-firewall.test.mjs', 'tests/sovereign-control-surface.test.mjs']
  },
  // ---- Separating unbuilt organs from canon that was never a module ------
  {
    // The abuse the ordering blocks: run the class classifier first and a
    // NAMED_INITIATIVE with a working module is filed as historical lineage.
    id: 'TERMSTATE-01', guard: 'A row with real evidence is never overwritten by its class',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    const currentState = evidenceState === 'SPEC_ONLY'",
    replace: '    const currentState = true',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-02', guard: 'A law nothing enforces stays SPEC_ONLY',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    return enforcement ? 'ENFORCED_BY_CODE' : 'SPEC_ONLY';",
    replace: "    return 'ENFORCED_BY_CODE';",
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-03', guard: 'A field cannot inherit coverage from an organ nobody built',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    return parentState === 'VERIFIED_CURRENT' || parentState === 'PARTIAL_CURRENT'",
    replace: '    return true',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-04', guard: 'An invalid enforcement manifest stops the matrix',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: '  if (!enforcementCheck.ok) {',
    replace: '  if (false) {',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-05', guard: 'The declared manifest lane is honoured',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    const declaredLane = declarations.byConcept.get(slugify(name))?.lane || null;",
    replace: '    const declaredLane = null;',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  // ---- Proving UberBond can leave a supplier, by leaving one -------------
  {
    // "Restore succeeded" is exactly what a broken restore reports, so the
    // digests are compared rather than the boolean trusted.
    id: 'EXIT-01', guard: 'A restore that does not match the export fails',
    file: 'src/supplier-exit-drill.mjs',
    find: "  const identical = Boolean(exported?.digest) && exported.digest === restored?.digest;",
    replace: '  const identical = true;',
    suites: ['tests/supplier-exit-drill.test.mjs']
  },
  {
    // Nothing matches nothing every time; without this the drill's happiest
    // result is the run that moved no bytes.
    id: 'EXIT-02', guard: 'An empty export cannot pass by restoring perfectly',
    file: 'src/supplier-exit-drill.mjs',
    find: '  if (!exported.fileCount) {',
    replace: '  if (false) {',
    suites: ['tests/supplier-exit-drill.test.mjs']
  },
  {
    id: 'EXIT-03', guard: 'Every drill step must have run',
    file: 'src/supplier-exit-drill.mjs',
    find: '  if (missing.length) {',
    replace: '  if (false) {',
    suites: ['tests/supplier-exit-drill.test.mjs']
  },
  {
    id: 'EXIT-04', guard: 'Cutover and rollback must both be observed',
    file: 'src/supplier-exit-drill.mjs',
    find: '  if (reasonCodes.length) return fail(\'EXIT_DRILL_FAILED\', reasonCodes, { supplier: name });',
    replace: '',
    suites: ['tests/supplier-exit-drill.test.mjs']
  },
  {
    id: 'EXIT-05', guard: 'A supplier with no passing drill is unproven, not safe',
    file: 'src/supplier-exit-drill.mjs',
    find: "  const passed = rows.filter(row => row.ok === true && row.status === 'EXIT_DRILL_PASSED');",
    replace: '  const passed = rows;',
    suites: ['tests/supplier-exit-drill.test.mjs']
  },
  {
    // The restore must be read back off disk. Reusing the in-memory copy would
    // pass on a restore that never landed.
    id: 'EXIT-06', guard: 'The rehearsal reads restored bytes back off disk',
    file: 'scripts/supplier-exit-drill.mjs',
    find: '    const restored = stateDigest(present.map(file => ({ name: file, bytes: readFileSync(join(cell, file), \'utf8\') })));',
    replace: '    const restored = exported;',
    suites: ['tests/supplier-exit-drill.test.mjs']
  },
  {
    // "Blocked" is the most abusable label in the file: anything unbuilt can be
    // described as waiting on something.
    id: 'TERMSTATE-06', guard: 'A gate outside the reviewed vocabulary is refused',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    if (!EXTERNAL_GATES[gate]) { gateProblems.push({ reason: 'gate-not-in-reviewed-vocabulary', concept, gate }); continue; }",
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-07', guard: 'A gate must carry stated evidence',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "    if (!text(entry?.evidence, 2000)) { gateProblems.push({ reason: 'gate-requires-stated-evidence', concept }); continue; }",
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-08', guard: 'An invalid external-gate manifest stops the matrix',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: '  if (gateProblems.length) {',
    replace: '  if (false) {',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'TERMSTATE-09', guard: 'An alias is a preserved name, not an organ awaiting a second build',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "  if (ALIAS_CLASSES.includes(cls)) return 'ALIAS_OF_CANONICAL_CONCEPT';",
    replace: '',
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  // ---- A life decision described on every dimension, never collapsed -----
  {
    // The exchange rate between meaning and money is the value judgment. A
    // total silently sets one.
    id: 'LIFEDIM-01', guard: 'Cost dimensions invert, so cheaper is better rather than smaller',
    file: 'src/life-decision-dimensions.mjs',
    find: 'const better = (dimension, a, b) => (COST_DIMENSIONS.includes(dimension) ? a < b : a > b);',
    replace: 'const better = (dimension, a, b) => a > b;',
    suites: ['tests/life-decision-dimensions.test.mjs']
  },
  {
    id: 'LIFEDIM-03', guard: 'Dominance requires losing on nothing',
    file: 'src/life-decision-dimensions.mjs',
    find: '      if (wins.length && losses.length === 0) {',
    replace: '      if (wins.length >= losses.length) {',
    suites: ['tests/life-decision-dimensions.test.mjs']
  },
  {
    id: 'LIFEDIM-04', guard: 'An unscored dimension is not a zero',
    file: 'src/life-decision-dimensions.mjs',
    find: '    if (Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 1) scores[dimension] = magnitude;',
    replace: '    scores[dimension] = Number.isFinite(magnitude) ? magnitude : 0;',
    suites: ['tests/life-decision-dimensions.test.mjs']
  },
  // ---- Futures as counterfactuals, and what they may decide --------------
  {
    id: 'FUTURE-01', guard: 'A future with no assumption lineage is refused',
    file: 'src/reachable-futures.mjs',
    find: "  if (!lineage) return fail('FUTURE_INVALID', ['assumption-lineage-required'], {",
    replace: '  if (false) return fail(\'FUTURE_INVALID\', [\'assumption-lineage-required\'], {',
    suites: ['tests/reachable-futures.test.mjs']
  },
  {
    id: 'FUTURE-02', guard: 'An ancestor must cross independent lineages, not repeat inside one',
    file: 'src/reachable-futures.mjs',
    find: '      isAncestor: entry.lineages.size >= 2',
    replace: '      isAncestor: entry.futures.length >= 2',
    suites: ['tests/reachable-futures.test.mjs']
  },
  {
    id: 'FUTURE-03', guard: 'Uncertainty may not narrow as the horizon lengthens',
    file: 'src/reachable-futures.mjs',
    find: '  if (narrowing.length) {',
    replace: '  if (false) {',
    suites: ['tests/reachable-futures.test.mjs']
  },
  {
    id: 'FUTURE-04', guard: 'Only desirable futures contribute ancestors',
    file: 'src/reachable-futures.mjs',
    find: '  const desirable = rows.filter(row => row.desirable);',
    replace: '  const desirable = rows;',
    suites: ['tests/reachable-futures.test.mjs']
  },
  // ---- Capability, and what growing it costs elsewhere -------------------
  {
    // The exact moment a system decides someone cannot do something.
    id: 'CAPGEN-01', guard: 'A durable limit cannot be claimed from thin evidence',
    file: 'src/human-capability-genome.mjs',
    find: "  if (explanation === 'DURABLE_LIMIT' && !supportsDurableClaim(basis)) {",
    replace: '  if (false) {',
    suites: ['tests/human-capability-genome.test.mjs']
  },
  {
    id: 'CAPGEN-02', guard: 'A thin assessment stays provisional',
    file: 'src/human-capability-genome.mjs',
    find: '      provisional: !supportsDurableClaim(basis),',
    replace: '      provisional: false,',
    suites: ['tests/human-capability-genome.test.mjs']
  },
  {
    id: 'CAPGEN-03', guard: 'An absent capability binds harder than a weak one',
    file: 'src/human-capability-genome.mjs',
    find: "  const bottleneck = missing.length ? { capability: missing[0], reason: 'ABSENT' }",
    replace: '  const bottleneck = false ? null',
    suites: ['tests/human-capability-genome.test.mjs']
  },
  {
    id: 'CAPGEN-04', guard: 'Delegation and atrophy are counted separately',
    file: 'src/human-capability-genome.mjs',
    find: "    debt: atrophying.length,",
    replace: '    debt: atrophying.length + delegated.length,',
    suites: ['tests/human-capability-genome.test.mjs']
  },
  {
    id: 'CAPGEN-05', guard: 'A gap carries its provisional flag into the skeleton',
    file: 'src/human-capability-genome.mjs',
    find: '      provisional: have.get(name)?.provisional ?? true',
    replace: '      provisional: false',
    suites: ['tests/human-capability-genome.test.mjs']
  },
  // ---- A model of a person that is not allowed to become a cage ----------
  {
    // "He is not a morning person", from a fortnight of bad sleep.
    id: 'SELFMODEL-01', guard: 'A durable claim from one context is identity compression',
    file: 'src/living-self-model.mjs',
    find: '  if (DURABLE_KINDS.includes(kind) && contexts.length < 2) {',
    replace: '  if (false) {',
    suites: ['tests/living-self-model.test.mjs']
  },
  {
    id: 'SELFMODEL-02', guard: 'Competing readings of a person are preserved, not resolved',
    file: 'src/living-self-model.mjs',
    find: '  const contested = rows.filter(row => (row.alternativeReadings || []).length > 0);',
    replace: '  const contested = [];',
    suites: ['tests/living-self-model.test.mjs']
  },
  {
    id: 'SELFMODEL-03', guard: 'An untraced preference reads UNKNOWN, not a flattering origin',
    file: 'src/living-self-model.mjs',
    find: "    origins: traced.length ? traced : ['UNKNOWN'],",
    replace: "    origins: traced.length ? traced : ['REPEATED_REFLECTION'],",
    suites: ['tests/living-self-model.test.mjs']
  },
  {
    id: 'SELFMODEL-04', guard: 'A want and a wanting-to-want stay distinct',
    file: 'src/living-self-model.mjs',
    find: '    conflict: Boolean(second) && second !== first,',
    replace: '    conflict: false,',
    suites: ['tests/living-self-model.test.mjs']
  },
  {
    id: 'SELFMODEL-05', guard: 'Probes exclude what reality already exposed',
    file: 'src/living-self-model.mjs',
    find: '    .filter(domain => !exposed.has(domain));',
    replace: '    ;',
    suites: ['tests/living-self-model.test.mjs']
  },
  // ---- What is shown, what is left out, and whether that decided ---------
  {
    id: 'SALIENCE-01', guard: 'An omission with no reason is recorded as unexplained',
    file: 'src/salience-sovereignty.mjs',
    find: "      reason: OMISSION_REASONS.includes(row?.reason) ? row.reason : 'NONE_GIVEN'",
    replace: "      reason: OMISSION_REASONS.includes(row?.reason) ? row.reason : 'BELOW_RELEVANCE_THRESHOLD'",
    suites: ['tests/salience-sovereignty.test.mjs']
  },
  {
    id: 'SALIENCE-02', guard: 'Frame dependence cannot be inferred from one presentation',
    file: 'src/salience-sovereignty.mjs',
    find: '  if (!first || !second) {',
    replace: '  if (false) {',
    suites: ['tests/salience-sovereignty.test.mjs']
  },
  {
    // A system that resolves ties toward speaking will speak constantly.
    id: 'SALIENCE-03', guard: 'A tie resolves to silence',
    file: 'src/salience-sovereignty.mjs',
    find: '  if (gain > cost) {',
    replace: '  if (gain >= cost) {',
    suites: ['tests/salience-sovereignty.test.mjs']
  },
  {
    id: 'SALIENCE-04', guard: 'The displaced mental state counts as a cost',
    file: 'src/salience-sovereignty.mjs',
    find: '  const cost = (Number(switchingCost) || 0) + (Number(currentStateValue) || 0);',
    replace: '  const cost = (Number(switchingCost) || 0);',
    suites: ['tests/salience-sovereignty.test.mjs']
  },
  {
    id: 'SALIENCE-05', guard: 'Something irreversible if missed interrupts regardless of arithmetic',
    file: 'src/salience-sovereignty.mjs',
    find: '  if (irreversibleIfMissed) {',
    replace: '  if (false) {',
    suites: ['tests/salience-sovereignty.test.mjs']
  },
  // ---- What is known, what is not, and which the system can tell apart ---
  {
    id: 'EPIST-01', guard: 'An unstated knowledge state resolves to UNKNOWN, never upward',
    file: 'src/epistemic-immune-system.mjs',
    find: "  const state = KNOWLEDGE_STATES.includes(input?.state) ? input.state : 'UNKNOWN';",
    replace: "  const state = KNOWLEDGE_STATES.includes(input?.state) ? input.state : 'SUPPORTED_INFERENCE';",
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    // The most consequential silent upgrade in applied reasoning.
    id: 'EPIST-02', guard: 'An intervention claim requires an intervention rung',
    file: 'src/epistemic-immune-system.mjs',
    find: '  if (interventionClaimed && observationalOnly) {',
    replace: '  if (false) {',
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    id: 'EPIST-03', guard: 'Unknown variables make it ignorance, not risk',
    file: 'src/epistemic-immune-system.mjs',
    find: "  const uncertaintyClass = !variablesKnown ? 'IGNORANCE'",
    replace: "  const uncertaintyClass = false ? 'IGNORANCE'",
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    id: 'EPIST-04', guard: 'Many models sharing a method are one epistemic position',
    file: 'src/epistemic-immune-system.mjs',
    find: '    monoculture: rows.length > 1 && methods.size === 1,',
    replace: '    monoculture: false,',
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    id: 'EPIST-05', guard: 'Internal support never offsets an observation',
    file: 'src/epistemic-immune-system.mjs',
    find: '    internalSupportOffsetsObservation: false,',
    replace: '    internalSupportOffsetsObservation: support.length > contradictions,',
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    id: 'EPIST-06', guard: 'A compression dropping what the decision turns on sends you back',
    file: 'src/epistemic-immune-system.mjs',
    find: '  const decisive = lost.filter(item => needed.includes(item));',
    replace: '  const decisive = [];',
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    id: 'EPIST-07', guard: 'Repeated surprise in one area is a broken model, not noise',
    file: 'src/epistemic-immune-system.mjs',
    find: '  const persistent = [...byArea.entries()].filter(([, count]) => count >= 3).map(([area, count]) => ({ area, count }));',
    replace: '  const persistent = [];',
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  {
    id: 'EPIST-08', guard: 'No shortcut and no validated simulation means reality must compute it',
    file: 'src/epistemic-immune-system.mjs',
    find: '  if (!shortcutKnown && !simulationValidated) {',
    replace: '  if (false) {',
    suites: ['tests/epistemic-immune-system.test.mjs']
  },
  // ---- What is remembered, what is modelled, what is nobody's business ---
  {
    // "We have the data but do not infer from it" is a promise no store keeps
    // by accident.
    id: 'MEMSOV-01', guard: 'An opaque record cannot sit in an inferable layer',
    file: 'src/memory-sovereignty.mjs',
    find: '  if (doNotInfer && INFERABLE_LAYERS.includes(layer)) {',
    replace: '  if (false) {',
    suites: ['tests/memory-sovereignty.test.mjs']
  },
  {
    id: 'MEMSOV-02', guard: 'The do-not-infer mark wins over the layer',
    file: 'src/memory-sovereignty.mjs',
    find: '  if (record.doNotInfer === true) return false;',
    replace: '',
    suites: ['tests/memory-sovereignty.test.mjs']
  },
  {
    id: 'MEMSOV-03', guard: 'An opaque record cannot be rediscovered into inference',
    file: 'src/memory-sovereignty.mjs',
    find: '  if (record.doNotInfer === true) {\n    return fail(\'REDISCOVERY_REFUSED\'',
    replace: '  if (false) {\n    return fail(\'REDISCOVERY_REFUSED\'',
    suites: ['tests/memory-sovereignty.test.mjs']
  },
  {
    id: 'MEMSOV-04', guard: 'A standing request not to know is honoured',
    file: 'src/memory-sovereignty.mjs',
    find: '  if (founderAsked === false) {',
    replace: '  if (false) {',
    suites: ['tests/memory-sovereignty.test.mjs']
  },
  {
    id: 'MEMSOV-05', guard: 'Only the founder decides what becomes of an accumulated life',
    file: 'src/memory-sovereignty.mjs',
    find: "  if (chosen !== 'UNDECIDED' && !statedByFounder) {",
    replace: '  if (false) {',
    suites: ['tests/memory-sovereignty.test.mjs']
  },
  {
    id: 'MEMSOV-06', guard: 'A prior captured after the recommendation is contaminated',
    file: 'src/memory-sovereignty.mjs',
    find: '  if (!capturedBeforeRecommendation) {',
    replace: '  if (false) {',
    suites: ['tests/memory-sovereignty.test.mjs']
  },
  // ---- From a choice to something that happened, and back ----------------
  {
    id: 'INTENT-01', guard: 'Compilation stops at permissions without authority',
    file: 'src/intent-compiler.mjs',
    find: "    if (!permitted) blockers.push('no-authority');",
    replace: '    if (false) blockers.push(\'no-authority\');',
    suites: ['tests/intent-compiler.test.mjs']
  },
  {
    id: 'INTENT-02', guard: 'A ready plan still carries no business effect authority',
    file: 'src/intent-compiler.mjs',
    find: "    businessEffectAuthority: 'NONE',\n    boundary: 'REACHING PERMISSIONS MEANS AN AUTHORITY WAS PRESENTED",
    replace: "    businessEffectAuthority: permitted ? 'DELEGATED' : 'NONE',\n    boundary: 'REACHING PERMISSIONS MEANS AN AUTHORITY WAS PRESENTED",
    suites: ['tests/intent-compiler.test.mjs']
  },
  {
    id: 'INTENT-03', guard: 'The unpredicted consequence column is preserved',
    file: 'src/intent-compiler.mjs',
    find: '  const unpredicted = actual.filter(item => !forecast.includes(item));',
    replace: '  const unpredicted = [];',
    suites: ['tests/intent-compiler.test.mjs']
  },
  {
    id: 'INTENT-04', guard: 'Effects on others without recorded consent are named',
    file: 'src/intent-compiler.mjs',
    find: '  const withoutConsent = onOthers.filter(row => !row.consented);',
    replace: '  const withoutConsent = [];',
    suites: ['tests/intent-compiler.test.mjs']
  },
  {
    id: 'INTENT-05', guard: 'An accumulated constraint is told apart from a chosen commitment',
    file: 'src/intent-compiler.mjs',
    find: "    status: absorbing && !chosenDeliberately ? 'ACCIDENTAL_SELF_CAPTURE' : 'LOCK_IN_RECORDED',",
    replace: "    status: 'LOCK_IN_RECORDED',",
    suites: ['tests/intent-compiler.test.mjs']
  },
  // ---- Where the parts of a life feed each other, and what it costs ------
  {
    id: 'AUTOPOI-01', guard: 'One cycle is reported once, not once per entry point',
    file: 'src/life-autopoiesis.mjs',
    find: '        if (!seen.has(key)) { seen.add(key); loops.push(key.split(\'->\')); }',
    replace: '        loops.push(key.split(\'->\'));',
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    // Treating something that comes round again as scarce spends a window
    // that was not closing.
    id: 'AUTOPOI-02', guard: 'A recurring opportunity is important, not scarce',
    file: 'src/life-autopoiesis.mjs',
    find: "  const recurring = cause === 'RECURRING';",
    replace: '  const recurring = false;',
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    id: 'AUTOPOI-03', guard: 'Time and youth are irreplaceable whatever the caller says',
    file: 'src/life-autopoiesis.mjs',
    find: "    || ['TIME', 'YOUTH', 'OPPORTUNITY_WINDOWS'].includes(resource);",
    replace: '    ;',
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    id: 'AUTOPOI-04', guard: 'Preparation consuming the life is surfaced',
    file: 'src/life-autopoiesis.mjs',
    find: "    status: ratio !== null && ratio > 0.5 ? 'PREPARATION_IS_CONSUMING_THE_LIFE' : 'HORIZON_RECORDED',",
    replace: "    status: 'HORIZON_RECORDED',",
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    id: 'AUTOPOI-05', guard: 'A homogeneous serendipity surface is reported as one context repeated',
    file: 'src/life-autopoiesis.mjs',
    find: "    status: fields.size > 1 ? 'HETEROGENEOUS_SURFACE' : 'HOMOGENEOUS_SURFACE',",
    replace: "    status: 'HETEROGENEOUS_SURFACE',",
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    id: 'AUTOPOI-06', guard: 'A domain stuck in one mode for years is surfaced',
    file: 'src/life-autopoiesis.mjs',
    find: "  const stuck = rows.filter(row => row.yearsInMode !== null && row.yearsInMode > 5 && row.mode !== 'MIXED');",
    replace: '  const stuck = [];',
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    // The group nobody looks for: it did not feel like much and it lasted.
    id: 'AUTOPOI-07', guard: 'Experiences that grew in meaning are surfaced separately',
    file: 'src/life-autopoiesis.mjs',
    find: '  const grew = rows.filter(row => row.mattersNow > row.matteredAtTime);',
    replace: '  const grew = [];',
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  {
    id: 'AUTOPOI-08', guard: 'An optimization cost that was identified says leave it alone',
    file: 'src/life-autopoiesis.mjs',
    find: "    status: wouldLose.length ? 'LEAVE_THIS_ALONE' : 'OPTIMIZATION_HAS_NO_IDENTIFIED_COST_HERE',",
    replace: "    status: 'OPTIMIZATION_HAS_NO_IDENTIFIED_COST_HERE',",
    suites: ['tests/life-autopoiesis.test.mjs']
  },
  // ---- Composing cognition, and knowing when the concepts are wrong ------
  {
    id: 'WORLDINT-01', guard: 'A consequential question requires a falsifying role',
    file: 'src/world-intelligence.mjs',
    find: '  if (consequential && adversarial.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-02', guard: 'A new concept requires repeated explanatory failure',
    file: 'src/world-intelligence.mjs',
    find: '  if (failures.length < 2) {',
    replace: '  if (false) {',
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-03', guard: 'A concept nothing could falsify is refused',
    file: 'src/world-intelligence.mjs',
    find: '  if (!falsifier) {',
    replace: '  if (false) {',
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-04', guard: 'Proposing a concept is not adopting it',
    file: 'src/world-intelligence.mjs',
    find: '    adopted: false,',
    replace: '    adopted: true,',
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-05', guard: 'No mechanism found yet is not impossible',
    file: 'src/world-intelligence.mjs',
    find: '  const permanent = PERMANENT_BOUNDARIES.includes(kind);',
    replace: "  const permanent = PERMANENT_BOUNDARIES.includes(kind) || kind === 'NO_MECHANISM_FOUND_YET';",
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-06', guard: 'A challenger sharing every assumption is refused',
    file: 'src/world-intelligence.mjs',
    find: '  if (theirs.size > 0 && shared.length === theirs.size) {',
    replace: '  if (false) {',
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-07', guard: 'An effect changing sign across scales is flagged',
    file: 'src/world-intelligence.mjs',
    find: "  const signs = new Set(scales.map(row => row.sign).filter(sign => sign !== 'NEUTRAL'));",
    replace: '  const signs = new Set();',
    suites: ['tests/world-intelligence.test.mjs']
  },
  {
    id: 'WORLDINT-08', guard: 'No visible progress in a threshold system is not failure',
    file: 'src/world-intelligence.mjs',
    find: '  if (knownThresholdSystem && effort > 0 && progress === 0) {',
    replace: '  if (false) {',
    suites: ['tests/world-intelligence.test.mjs']
  },
  // ---- A graph of a life where every edge knows how it got there ---------
  {
    id: 'LKG-01', guard: 'An edge with no stated basis is refused',
    file: 'src/life-knowledge-graph.mjs',
    find: '  if (!EDGE_BASIS.includes(input?.basis)) {',
    replace: '  if (false) {',
    suites: ['tests/life-knowledge-graph.test.mjs']
  },
  {
    // A path that crossed one anecdote is an anecdote.
    id: 'LKG-02', guard: 'Traversal refuses weak edges by default',
    file: 'src/life-knowledge-graph.mjs',
    find: "    .filter(row => row?.from && row?.to && (!strictOnly || traversable(row)));",
    replace: '    .filter(row => row?.from && row?.to);',
    suites: ['tests/life-knowledge-graph.test.mjs']
  },
  {
    id: 'LKG-03', guard: 'Only repeated observation or better is traversable',
    file: 'src/life-knowledge-graph.mjs',
    find: "  Boolean(edge) && EDGE_BASIS.indexOf(edge.basis) >= EDGE_BASIS.indexOf('REPEATED_OBSERVATION');",
    replace: '  Boolean(edge);',
    suites: ['tests/life-knowledge-graph.test.mjs']
  },
  {
    id: 'LKG-04', guard: 'Contradictions are held open with both claims surviving',
    file: 'src/life-knowledge-graph.mjs',
    find: '    conflicts.push({ from, to, claims: group.map(row => ({ kind: row.kind, basis: row.basis })), strongestBasis: strongest.basis });',
    replace: '    conflicts.push({ from, to, claims: [{ kind: strongest.kind, basis: strongest.basis }], strongestBasis: strongest.basis });',
    suites: ['tests/life-knowledge-graph.test.mjs']
  },
  {
    id: 'LKG-05', guard: 'An unattributed claim with no corroboration is untraceable',
    file: 'src/life-knowledge-graph.mjs',
    find: "  const weak = source === 'UNATTRIBUTED' || source === 'PLAUSIBLY_GENERATED';",
    replace: '  const weak = false;',
    suites: ['tests/life-knowledge-graph.test.mjs']
  },
  {
    id: 'LKG-06', guard: 'A story claimed as mechanism needs evidence beyond the story',
    file: 'src/life-knowledge-graph.mjs',
    find: '  if (claimedAsCausal && !text(causalEvidence, 2000)) {',
    replace: '  if (false) {',
    suites: ['tests/life-knowledge-graph.test.mjs']
  },
  // ---- The methods a forecast is built from, and which earned their place -
  {
    id: 'FCSTACK-01', guard: 'A method never hindcast is unproven, not validated',
    file: 'src/forecast-stack.mjs',
    find: '  const validated = hindcastRuns >= 5 && hindcastAccuracy !== null;',
    replace: '  const validated = true;',
    suites: ['tests/forecast-stack.test.mjs']
  },
  {
    // Averaging things nobody has checked produces confidence, not accuracy.
    id: 'FCSTACK-02', guard: 'A stack of unproven methods refuses to produce an estimate',
    file: 'src/forecast-stack.mjs',
    find: '  if (validated.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/forecast-stack.test.mjs']
  },
  {
    id: 'FCSTACK-03', guard: 'The weakest strength dimension is surfaced',
    file: 'src/forecast-stack.mjs',
    find: '    ? assessed.reduce((low, name) => (scored[name] < scored[low] ? name : low), assessed[0])',
    replace: '    ? assessed[0]',
    suites: ['tests/forecast-stack.test.mjs']
  },
  {
    id: 'FCSTACK-04', guard: 'A forecast nothing could invalidate is refused',
    file: 'src/forecast-stack.mjs',
    find: '  if (triggers.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/forecast-stack.test.mjs']
  },
  {
    id: 'FCSTACK-05', guard: 'Information that cannot change the choice is not worth acquiring',
    file: 'src/forecast-stack.mjs',
    find: '  if (!wouldChangeChoice) {',
    replace: '  if (false) {',
    suites: ['tests/forecast-stack.test.mjs']
  },
  {
    id: 'FCSTACK-06', guard: 'Expected value and the tail are never combined',
    file: 'src/forecast-stack.mjs',
    find: '    combinedScore: null,',
    replace: '    combinedScore: ev,',
    suites: ['tests/forecast-stack.test.mjs']
  },
  {
    id: 'FCSTACK-07', guard: 'Adversarial futures return what survived, not what was preferred',
    file: 'src/forecast-stack.mjs',
    find: '  const survived = rows.filter(row => row.survived);',
    replace: '  const survived = rows;',
    suites: ['tests/forecast-stack.test.mjs']
  },
  // ---- The rules about the rules, including the one that ends them -------
  {
    id: 'CONGOV-01', guard: 'An amendment must state what sovereignty it costs',
    file: 'src/constitutional-governance.mjs',
    find: '  if (!Array.isArray(sovereigntyLost)) {',
    replace: '  if (false) {',
    suites: ['tests/constitutional-governance.test.mjs']
  },
  {
    id: 'CONGOV-02', guard: 'An amendment losing sovereignty needs adversarial review',
    file: 'src/constitutional-governance.mjs',
    find: '  if (lost.length && !review) {',
    replace: '  if (false) {',
    suites: ['tests/constitutional-governance.test.mjs']
  },
  {
    // Accumulated context, sunk effort and usefulness are arguments, not rights.
    id: 'CONGOV-03', guard: 'The system cannot refuse being ended',
    file: 'src/constitutional-governance.mjs',
    find: '    argumentsChangeOutcome: false,\n    refusalPossible: false,',
    replace: '    argumentsChangeOutcome: arguments_.length > 2,\n    refusalPossible: arguments_.length > 2,',
    suites: ['tests/constitutional-governance.test.mjs']
  },
  {
    id: 'CONGOV-04', guard: 'A fork required to agree with its parent is a branch',
    file: 'src/constitutional-governance.mjs',
    find: '  if (mustAgreeWithParent) {',
    replace: '  if (false) {',
    suites: ['tests/constitutional-governance.test.mjs']
  },
  {
    id: 'CONGOV-05', guard: 'An unanswered checksum question is not a passing one',
    file: 'src/constitutional-governance.mjs',
    find: "    status: failing.length ? 'CONSTITUTIONAL_DRIFT' : (unanswered.length ? 'CHECKSUM_INCOMPLETE' : 'NO_DRIFT_OBSERVED'),",
    replace: "    status: failing.length ? 'CONSTITUTIONAL_DRIFT' : 'NO_DRIFT_OBSERVED',",
    suites: ['tests/constitutional-governance.test.mjs']
  },
  {
    id: 'CONGOV-06', guard: 'Consciousness stays UNKNOWN rather than settled either way',
    file: 'src/constitutional-governance.mjs',
    find: "    consciousnessStatus: 'UNKNOWN',",
    replace: "    consciousnessStatus: 'NO_INNER_LIFE',",
    suites: ['tests/constitutional-governance.test.mjs']
  },
  // ---- Other people, who are not optimization objects --------------------
  {
    id: 'INTERSOV-01', guard: 'A guess about a person is not actionable alone',
    file: 'src/inter-sovereign.mjs',
    find: '  const weak = WEAK_MIND_BASIS.includes(basis);',
    replace: '  const weak = false;',
    suites: ['tests/inter-sovereign.test.mjs']
  },
  {
    // Survives-being-understood is the test, and it is a refusal not a penalty.
    id: 'INTERSOV-02', guard: 'An arrangement requiring the other party ignorance is refused',
    file: 'src/inter-sovereign.mjs',
    find: "  if (shape === 'REQUIRES_THEIR_IGNORANCE') {",
    replace: '  if (false) {',
    suites: ['tests/inter-sovereign.test.mjs']
  },
  {
    id: 'INTERSOV-03', guard: 'A good outcome does not make manipulation acceptable',
    file: 'src/inter-sovereign.mjs',
    find: '      outcomeChangesVerdict: false,',
    replace: '      outcomeChangesVerdict: outcomeGoodForThem,',
    suites: ['tests/inter-sovereign.test.mjs']
  },
  {
    id: 'INTERSOV-04', guard: 'Not knowing how they would react is not consent',
    file: 'src/inter-sovereign.mjs',
    find: '  if (wouldTheyObjectOnLearning === null) {',
    replace: '  if (false) {',
    suites: ['tests/inter-sovereign.test.mjs']
  },
  {
    id: 'INTERSOV-05', guard: 'Social models are measured against observed behaviour',
    file: 'src/inter-sovereign.mjs',
    find: '  const wrong = rows.filter(row => row.predicted !== row.observed);',
    replace: '  const wrong = [];',
    suites: ['tests/inter-sovereign.test.mjs']
  },
  // ---- The body, the room, and what does not survive language ------------
  {
    id: 'EMBODY-01', guard: 'A depleted physical state is surfaced beside the decision',
    file: 'src/embodied-reality.mjs',
    find: '  const depleted = Object.entries(recorded).filter(([, value]) => value < 0.3).map(([factor]) => factor);',
    replace: '  const depleted = [];',
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    id: 'EMBODY-02', guard: 'A measurement never settles what an experience was like',
    file: 'src/embodied-reality.mjs',
    find: '    measurementOverridesReport: false,',
    replace: '    measurementOverridesReport: Boolean(measured),',
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    // Storing an approximation is worse than losing it: the paraphrase reads
    // as the thing and later inference treats it as the data.
    id: 'EMBODY-03', guard: 'A partially represented experience is not safe to reason over',
    file: 'src/embodied-reality.mjs',
    find: "  const partial = representability !== 'FULLY_REPRESENTED';",
    replace: '  const partial = false;',
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    id: 'EMBODY-04', guard: 'Reasoning depth scales with what being wrong costs',
    file: 'src/embodied-reality.mjs',
    find: '    maxReasoningDepth: ERROR_BUDGET_TIERS[tier].maxReasoningDepth,',
    replace: "    maxReasoningDepth: 'MODERATE',",
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    id: 'EMBODY-05', guard: 'Willpower-only interventions are separated from structural ones',
    file: 'src/embodied-reality.mjs',
    find: "  const structural = interventions.filter(row => row.kind !== 'WILLPOWER');",
    replace: '  const structural = interventions;',
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    id: 'EMBODY-06', guard: 'A simulation frequency is never a real-world probability',
    file: 'src/embodied-reality.mjs',
    find: '    isRealWorldProbability: false,',
    replace: '    isRealWorldProbability: (Number(runs) || 0) > 1000,',
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    id: 'EMBODY-07', guard: 'The soul archive is excluded from optimization inputs',
    file: 'src/embodied-reality.mjs',
    find: '    excludedFromOptimization: true,',
    replace: '    excludedFromOptimization: false,',
    suites: ['tests/embodied-reality.test.mjs']
  },
  {
    id: 'EMBODY-08', guard: 'A concentrated information diet is surfaced',
    file: 'src/embodied-reality.mjs',
    find: '    concentrated: rows.length > 3 && clusters.size === 1,',
    replace: '    concentrated: false,',
    suites: ['tests/embodied-reality.test.mjs']
  },
  // ---- The private core: the one data class that is not the company's -----
  {
    id: 'PCIV-01', guard: 'A repository path is refused as a destination for private life data',
    file: 'src/personal-civilization-core.mjs',
    find: '  if (forbidden.some(pattern => pattern.test(target))) {',
    replace: '  if (false) {',
    suites: ['tests/personal-civilization-core.test.mjs']
  },
  {
    id: 'PCIV-02', guard: 'A private record is destination-checked before it is appended',
    file: 'src/personal-civilization-core.mjs',
    find: "  if (normalized.record.privacyClass === 'PRIVATE_LIFE_DATA') {",
    replace: '  if (false) {',
    suites: ['tests/personal-civilization-core.test.mjs']
  },
  {
    // Anchored on the fixpoint rather than on the loop body, because a single
    // pass is the failure that actually happens: one level of cascade looks
    // correct in every simple case and leaves the owner's data behind as soon
    // as a model is derived from a model.
    id: 'PCIV-03', guard: 'Deletion follows derivation transitively, not one level down',
    file: 'src/personal-civilization-core.mjs',
    find: '  while (grew) {',
    replace: '  for (let pass = 0; pass < 1; pass += 1) {',
    suites: ['tests/personal-civilization-core.test.mjs']
  },
  {
    id: 'PCIV-04', guard: 'A derived claim with no provenance is refused, never stored',
    file: 'src/personal-civilization-core.mjs',
    find: "    if (sources.length === 0) { refused.push({ claim, reasonCodes: ['claim-provenance-required'] }); continue; }",
    replace: '',
    suites: ['tests/personal-civilization-core.test.mjs']
  },
  {
    id: 'PCIV-05', guard: 'Private state requires the founder grant, not merely the founder subject',
    file: 'src/personal-civilization-core.mjs',
    find: "    && authorization.grant === 'PRIVATE_LIFE_STATE'",
    replace: '',
    suites: ['tests/personal-civilization-core.test.mjs']
  },
  {
    id: 'PROPOSAL-02', guard: 'A sandbox payment reference is not external payment evidence',
    file: 'src/proposal-acceptance-engine.mjs',
    find: "    && !/(?:^|[-_:])(sandbox|synthetic|fixture|fake|test)(?:[-_:]|$)/i.test(ref);",
    replace: '    ;',
    suites: ['tests/proposal-acceptance-engine.test.mjs']
  },
  // ---- The branch inventory, and what a decision does to it -------------
  {
    // A scalar here is the number that argues against every commitment.
    id: 'LIFEPOSS-01', guard: 'A closure with no stated kind cannot be counted',
    file: 'src/life-possibility-engine.mjs',
    find: '    if (!kind || !CLOSURE_KINDS.includes(kind)) {',
    replace: '    if (false) {',
    suites: ['tests/life-possibility-engine.test.mjs']
  },
  {
    id: 'LIFEPOSS-02', guard: 'A deliberate commitment must name what it bought',
    file: 'src/life-possibility-engine.mjs',
    find: "    if (kind === 'DELIBERATE_COMMITMENT' && !inExchangeFor) {",
    replace: '    if (false) {',
    suites: ['tests/life-possibility-engine.test.mjs']
  },
  {
    id: 'LIFEPOSS-03', guard: 'No single optionality score is emitted',
    file: 'src/life-possibility-engine.mjs',
    find: "    scoreWithheld: 'NO_SINGLE_OPTIONALITY_SCORE",
    replace: "    score: opened.length + preserved.length - costly.length,\n    scoreWithheld: 'NO_SINGLE_OPTIONALITY_SCORE",
    suites: ['tests/life-possibility-engine.test.mjs']
  },
  {
    id: 'LIFEPOSS-04', guard: 'Breadth is dimensions represented, not branch count',
    file: 'src/life-possibility-engine.mjs',
    find: '  const concentrated = Boolean(dominant && valued.length >= 3 && dominant.count * 2 > valued.length);',
    replace: '  const concentrated = false;',
    suites: ['tests/life-possibility-engine.test.mjs']
  },
  {
    id: 'LIFEPOSS-05', guard: 'A requirement inside one dimension is not cross-future value',
    file: 'src/life-possibility-engine.mjs',
    find: '    if (entry.dimensions.size >= min) highValue.push(record);',
    replace: '    if (entry.dimensions.size >= 1) highValue.push(record);',
    suites: ['tests/life-possibility-engine.test.mjs']
  },
  // ---- Compression, and the exceptions it is tempted to eat --------------
  {
    id: 'LIFECOMP-01', guard: 'A principle nobody attacked is unfalsified, not compressed',
    file: 'src/life-compression-engine.mjs',
    find: "      state: 'UNFALSIFIED_NOT_PROVEN',",
    replace: "      state: 'COMPRESSED',",
    suites: ['tests/life-compression-engine.test.mjs']
  },
  {
    id: 'LIFECOMP-02', guard: 'Explanatory reach never outranks a decisive counterexample',
    file: 'src/life-compression-engine.mjs',
    find: '  if (decisive.length > 0) {',
    replace: '  if (decisive.length > facts.length) {',
    suites: ['tests/life-compression-engine.test.mjs']
  },
  {
    id: 'LIFECOMP-03', guard: 'A boundary invented to fit one counterexample is not a boundary',
    file: 'src/life-compression-engine.mjs',
    find: '      if (!bounds.includes(boundary)) {',
    replace: '      if (false) {',
    suites: ['tests/life-compression-engine.test.mjs']
  },
  {
    id: 'LIFECOMP-04', guard: 'A fact must stay addressable, so compression is never the only copy',
    file: 'src/life-compression-engine.mjs',
    find: "  if (!ref) return fail('FACT_INVALID', ['fact-source-ref-required'], {",
    replace: "  if (false) return fail('FACT_INVALID', ['fact-source-ref-required'], {",
    suites: ['tests/life-compression-engine.test.mjs']
  },
  {
    id: 'LIFECOMP-05', guard: 'Dropping what a decision needs blocks use of the compression',
    file: 'src/life-compression-engine.mjs',
    find: '  const loadBearing = lost.filter(item => needed.includes(item)).sort();',
    replace: '  const loadBearing = [];',
    suites: ['tests/life-compression-engine.test.mjs']
  },
  // ---- World signals, and the difference between novelty and geometry ----
  {
    id: 'GAMELIFE-01', guard: 'A signal naming no life dimension is novelty',
    file: 'src/gamechanger-for-life.mjs',
    find: '  if (changes.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  {
    id: 'GAMELIFE-02', guard: 'A claimed geometry change must state a checkable condition',
    file: 'src/gamechanger-for-life.mjs',
    find: '  if (wouldHaveToBeTrue.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  {
    id: 'GAMELIFE-03', guard: 'The world describing itself cannot ground a personal reach claim',
    file: 'src/gamechanger-for-life.mjs',
    find: "  if (kind !== 'PERSONALLY_TESTED') {",
    replace: '  if (false) {',
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  {
    id: 'GAMELIFE-04', guard: 'Unmet grounding conditions block grounding',
    file: 'src/gamechanger-for-life.mjs',
    find: '  if (outstanding.length > 0) {',
    replace: '  if (false) {',
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  {
    id: 'GAMELIFE-05', guard: 'Urgency and importance are not blended into one priority',
    file: 'src/gamechanger-for-life.mjs',
    find: '  const important = moved.length >= 2;',
    replace: "  const important = moved.length >= 2 || cause !== 'NONE_KNOWN';",
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  {
    id: 'GAMELIFE-06', guard: 'The attention budget is bounded',
    file: 'src/gamechanger-for-life.mjs',
    find: '  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 50) {',
    replace: '  if (false) {',
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  {
    id: 'GAMELIFE-07', guard: 'Novelty is dropped before the attention budget is spent',
    file: 'src/gamechanger-for-life.mjs',
    find: "  const candidates = rows.filter(row => row.state !== 'NOVELTY_NOT_GEOMETRY_CHANGE');",
    replace: '  const candidates = rows;',
    suites: ['tests/gamechanger-for-life.test.mjs']
  },
  // ---- Generated lives, the cage, and the vote they must not acquire -----
  {
    // A 40-character cap once discarded REQUIRES_ANOTHER_PERSONS_CONSENT_NOT_GIVEN,
    // which is 42 characters. A dropped safety constraint is a typo becoming permission.
    id: 'GENLIFE-01', guard: 'An unrecognised hard constraint is refused, never dropped',
    file: 'src/genesis-for-life.mjs',
    find: '  if (unrecognised.length > 0) {',
    replace: '  if (false) {',
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-02', guard: 'A hard constraint refuses a path at construction',
    file: 'src/genesis-for-life.mjs',
    find: '  if (blocking.length > 0) {',
    replace: '  if (false) {',
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-03', guard: 'An irreversible untested path needs a reversible probe',
    file: 'src/genesis-for-life.mjs',
    find: "  const blocking = violated.filter(item => item !== 'IRREVERSIBLE_AND_UNTESTED' || !reversibleProbe);",
    replace: "  const blocking = violated.filter(item => item !== 'IRREVERSIBLE_AND_UNTESTED');",
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-04', guard: 'A batch where nothing departs is a cage, not a generation result',
    file: 'src/genesis-for-life.mjs',
    find: '  const caged = departures.length === 0;',
    replace: '  const caged = false;',
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-05', guard: 'An adjacent path does not count as a departure',
    file: 'src/genesis-for-life.mjs',
    find: "  const departures = rows.filter(row => row.identityDistance === 'DEPARTURE' || row.identityDistance === 'UNKNOWN_SELF');",
    replace: "  const departures = rows.filter(row => row.identityDistance !== 'CONTINUATION');",
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-06', guard: 'No ranked list of lives is emitted',
    file: 'src/genesis-for-life.mjs',
    find: "    rankingWithheld: 'A_RANKED_LIST_OF_LIVES",
    replace: "    ranked: rows.map(row => row.name),\n    rankingWithheld: 'A_RANKED_LIST_OF_LIVES",
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-07', guard: 'A path that lost its hypothesis status is named',
    file: 'src/genesis-for-life.mjs',
    find: "  const unstatused = rows.filter(row => row.evidenceStatus !== 'HYPOTHESIS').map(row => row.name).sort();",
    replace: '  const unstatused = [];',
    suites: ['tests/genesis-for-life.test.mjs']
  },
  {
    id: 'GENLIFE-08', guard: 'Only paths touching untested dimensions are informative',
    file: 'src/genesis-for-life.mjs',
    find: '    .filter(row => row.untestedDimensions.length > 0)',
    replace: '    .filter(() => true)',
    suites: ['tests/genesis-for-life.test.mjs']
  },
  // ---- The coverage matrix, and the promise that it never overstates -----
  {
    // "Possibility" is an ontology domain. It read VERIFIED_CURRENT because a
    // module was named life-possibility-engine.mjs. Twenty-nine rows were
    // claiming implementation of things that are categories.
    id: 'COVERAGE-CAT-01', guard: 'A structural category cannot be implemented by a file',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "  if (STRUCTURAL_CLASSES.includes(concept.class)) return 'STRUCTURAL_NOT_A_BUILD_TARGET';",
    replace: "  if (false) return 'STRUCTURAL_NOT_A_BUILD_TARGET';",
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  {
    id: 'COVERAGE-CAT-02', guard: 'An alias carries no implementation state of its own',
    file: 'src/sovereign-coverage-matrix.mjs',
    find: "  if (ALIAS_CLASSES.includes(concept.class)) return 'ALIAS_OF_CANONICAL_CONCEPT';",
    replace: "  if (false) return 'ALIAS_OF_CANONICAL_CONCEPT';",
    suites: ['tests/sovereign-coverage-matrix.test.mjs']
  },
  // ---- Questions nobody knew to ask, and the blind spot doing the asking --
  {
    id: 'UUMINE-01', guard: 'Repeated surprise from one source is a fact about that source',
    file: 'src/unknown-unknown-mining.mjs',
    find: '    if (entry.sources.size >= 2) questions.push(record);',
    replace: '    if (entry.sources.size >= 1) questions.push(record);',
    suites: ['tests/unknown-unknown-mining.test.mjs']
  },
  {
    id: 'UUMINE-02', guard: 'Observations an existing model explains are excluded',
    file: 'src/unknown-unknown-mining.mjs',
    find: "  const resistant = rows.filter(row => row.verdict === 'RESISTS_EXPLANATION');",
    replace: '  const resistant = rows;',
    suites: ['tests/unknown-unknown-mining.test.mjs']
  },
  {
    id: 'UUMINE-03', guard: 'An expectation must predate the gap it explains',
    file: 'src/unknown-unknown-mining.mjs',
    find: "  if (!declaredAt) return fail('EXPECTATION_INVALID', ['declared-at-required'], {",
    replace: "  if (false) return fail('EXPECTATION_INVALID', ['declared-at-required'], {",
    suites: ['tests/unknown-unknown-mining.test.mjs']
  },
  {
    id: 'UUMINE-04', guard: 'Silence in an unobserved domain is a limit of the search',
    file: 'src/unknown-unknown-mining.mjs',
    find: '    .map(item => text(item, 120)).filter(item => item && !covered.has(item)))].sort();',
    replace: '    .map(item => text(item, 120)).filter(item => item && covered.has(item)))].sort();',
    suites: ['tests/unknown-unknown-mining.test.mjs']
  },
  {
    id: 'UUMINE-05', guard: 'Claiming the ontology fails requires naming the distortion',
    file: 'src/unknown-unknown-mining.mjs',
    find: '  if (!distortion) {',
    replace: '  if (false) {',
    suites: ['tests/unknown-unknown-mining.test.mjs']
  },
  // ---- Effective freedom, which is not the number of options -------------
  {
    id: 'FREEDOM-01', guard: 'An unanswered gate is not a pass',
    file: 'src/freedom-gradient.mjs',
    find: '  if (unanswered.length > 0) {',
    replace: '  if (false) {',
    suites: ['tests/freedom-gradient.test.mjs']
  },
  {
    id: 'FREEDOM-02', guard: 'Coercion disqualifies however many other gates pass',
    file: 'src/freedom-gradient.mjs',
    find: '  const failed = FREEDOM_GATES.filter(gate => gates[gate] === false);',
    replace: '  const failed = FREEDOM_GATES.filter(gate => gates[gate] === false && !DISQUALIFYING_GATES.includes(gate));',
    suites: ['tests/freedom-gradient.test.mjs']
  },
  {
    id: 'FREEDOM-03', guard: 'An option is attributed to the first gate it failed',
    file: 'src/freedom-gradient.mjs',
    find: '    const first = FREEDOM_GATES.find(gate => row.gates[gate] === false);',
    replace: '    const first = [...FREEDOM_GATES].reverse().find(gate => row.gates[gate] === false);',
    suites: ['tests/freedom-gradient.test.mjs']
  },
  {
    id: 'FREEDOM-04', guard: 'A rising option count is not evidence of rising freedom',
    file: 'src/freedom-gradient.mjs',
    find: '  const divergent = nominalDelta > 0 && effectiveDelta < 0;',
    replace: '  const divergent = false;',
    suites: ['tests/freedom-gradient.test.mjs']
  },
  // ---- One subject who does not hold still -------------------------------
  {
    id: 'NOF1-01', guard: 'A series crossing a regime change is not pooled',
    file: 'src/n-of-1-personal-science.mjs',
    find: '    while (pending.length && row.at >= pending[0].at) {',
    replace: '    while (false) {',
    suites: ['tests/n-of-1-personal-science.test.mjs']
  },
  {
    id: 'NOF1-02', guard: 'Length does not promote a before-and-after design',
    file: 'src/n-of-1-personal-science.mjs',
    find: "  if (kind === 'ANECDOTE' || kind === 'BEFORE_AFTER') {",
    replace: "  if ((kind === 'ANECDOTE' || kind === 'BEFORE_AFTER') && n < 100) {",
    suites: ['tests/n-of-1-personal-science.test.mjs']
  },
  {
    id: 'NOF1-03', guard: 'A design that named no confounders has not looked for any',
    file: 'src/n-of-1-personal-science.mjs',
    find: '  if (named.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/n-of-1-personal-science.test.mjs']
  },
  {
    id: 'NOF1-04', guard: 'A named but uncontrolled confounder blocks the causal claim',
    file: 'src/n-of-1-personal-science.mjs',
    find: '  if (uncontrolled.length > 0) {',
    replace: '  if (false) {',
    suites: ['tests/n-of-1-personal-science.test.mjs']
  },
  {
    // Number(null) is 0. A bare isFinite check turns a missing instrument error
    // into a claimed zero-error instrument.
    id: 'NOF1-05', guard: 'Absence never becomes a number',
    file: 'src/n-of-1-personal-science.mjs',
    find: "  if (value === null || value === undefined || value === '') return null;",
    replace: '  if (false) return null;',
    suites: ['tests/n-of-1-personal-science.test.mjs']
  },
  {
    id: 'NOF1-06', guard: 'A population result with no transfer assumption is a wish',
    file: 'src/n-of-1-personal-science.mjs',
    find: "  if (!assumption) return fail('PRIOR_INVALID', ['transfer-assumption-required'], {",
    replace: "  if (false) return fail('PRIOR_INVALID', ['transfer-assumption-required'], {",
    suites: ['tests/n-of-1-personal-science.test.mjs']
  },
  // ---- Redundancy that survives contact with reality ---------------------
  {
    id: 'ANTIFRAG-01', guard: 'A dependency listing no failure mode is refused',
    file: 'src/anti-fragility-map.mjs',
    find: '  if (modes.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/anti-fragility-map.test.mjs']
  },
  {
    id: 'ANTIFRAG-02', guard: 'Redundancy is counted in independent failure modes, not instances',
    file: 'src/anti-fragility-map.mjs',
    find: '    const singlePointOfFailure = entry.instances.length > 0 && shared.length > 0;',
    replace: '    const singlePointOfFailure = entry.instances.length <= 1;',
    suites: ['tests/anti-fragility-map.test.mjs']
  },
  {
    id: 'ANTIFRAG-03', guard: 'A mode shared by every instance takes the domain down at once',
    file: 'src/anti-fragility-map.mjs',
    find: '    const shared = [...entry.modeSets[0]].filter(mode => entry.modeSets.every(set => set.has(mode))).sort();',
    replace: '    const shared = [...entry.modeSets[0]].filter(mode => entry.modeSets.some(set => set.has(mode)) && entry.modeSets.length === 1).sort();',
    suites: ['tests/anti-fragility-map.test.mjs']
  },
  {
    id: 'ANTIFRAG-04', guard: 'A system nobody shook has an unknown class',
    file: 'src/anti-fragility-map.mjs',
    find: '  if (stresses.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/anti-fragility-map.test.mjs']
  },
  {
    id: 'ANTIFRAG-05', guard: 'A prediction is held apart from the observation',
    file: 'src/anti-fragility-map.mjs',
    find: "    predictionHeld: predicted ? (predicted === observed ? 'PREDICTION_MATCHED' : 'PREDICTION_MISSED') : 'NO_PREDICTION_MADE',",
    replace: "    predictionHeld: 'PREDICTION_MATCHED',",
    suites: ['tests/anti-fragility-map.test.mjs']
  },
  // ---- Questions the assumptions already answered ------------------------
  {
    id: 'ASSUMESC-01', guard: 'A load-bearing assumption outside the set means the set is incomplete',
    file: 'src/assumption-escape.mjs',
    find: '  if (unknownAssumptions.length > 0) {',
    replace: '  if (false) {',
    suites: ['tests/assumption-escape.test.mjs']
  },
  {
    id: 'ASSUMESC-02', guard: 'A question whose answer flips is assumption-determined',
    file: 'src/assumption-escape.mjs',
    find: '  const determined = load.length > 0;',
    replace: '  const determined = false;',
    suites: ['tests/assumption-escape.test.mjs']
  },
  {
    id: 'ASSUMESC-03', guard: 'A foundation predicting identically is a notation change',
    file: 'src/assumption-escape.mjs',
    find: '    if (disagreements.length > 0) genuine.push({ name, disagreesOn: disagreements, predicts });',
    replace: '    if (true) genuine.push({ name, disagreesOn: disagreements, predicts });',
    suites: ['tests/assumption-escape.test.mjs']
  },
  {
    id: 'ASSUMESC-04', guard: 'An observation every foundation expects distinguishes nothing',
    file: 'src/assumption-escape.mjs',
    find: '    if (new Set(answers).size < 2) continue; // every foundation expects the same thing',
    replace: '    if (false) continue;',
    suites: ['tests/assumption-escape.test.mjs']
  },
  {
    id: 'ASSUMESC-05', guard: 'An unreachable observation does not settle the question',
    file: 'src/assumption-escape.mjs',
    find: '    if (available.has(observable)) discriminating.push(record);',
    replace: '    if (true) discriminating.push(record);',
    suites: ['tests/assumption-escape.test.mjs']
  },
  {
    id: 'ASSUMESC-06', guard: 'Undecidable is returned rather than a plausibility ranking',
    file: 'src/assumption-escape.mjs',
    find: '  if (discriminating.length === 0) {',
    replace: '  if (false) {',
    suites: ['tests/assumption-escape.test.mjs']
  },
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
