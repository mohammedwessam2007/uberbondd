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

import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

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
    file: 'server.mjs',
    find: '      const outcome = await revenue.handleLemonWebhook(raw, req.headers[\'x-signature\']);',
    replace: '      const outcome = await revenue.handleLemonWebhook(raw, req.headers[\'x-signature\']); return json(res, 200, outcome);',
    suites: ['tests/webhook-route-truth.test.mjs']
  },
  // ---- Identity: who a rate limit thinks it is counting -------------------
  {
    id: 'IDENT-01', guard: 'A caller cannot choose the identity a rate limit counts',
    file: 'server.mjs',
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
    file: 'server.mjs',
    find: "  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {",
    replace: '  if (false) {',
    suites: ['tests/server-request-handler.test.mjs']
  },
  {
    id: 'SRV-03', guard: 'The request handler stays reachable without a socket',
    file: 'server.mjs',
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
    id: 'MONEY-17', guard: 'A duplicate webhook is a duplicate, not a 503',
    file: 'src/billing-webhook-repository.mjs',
    find: 'ON CONFLICT DO NOTHING RETURNING provider_event_key',
    replace: 'ON CONFLICT(provider_event_key) DO NOTHING RETURNING provider_event_key',
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
    id: 'SCAN-01', guard: 'A truncated read is never a successful read',
    file: 'src/durable-audit-scan.mjs',
    find: "    return { ok: false, reasonCodes: ['audit-scan-pagination-stalled'], scannedRows, pages };",
    replace: '    return { ok: true, value: accumulator, scannedRows, pages, exhausted: false };',
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
  }
];

function runSuites(root, suites) {
  const result = spawnSync(process.execPath, ['--test', ...suites], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

export function applyMutation(root, mutation) {
  const target = join(root, mutation.file);
  const source = readFileSync(target, 'utf8');
  if (!source.includes(mutation.find)) {
    return { applied: false, reason: 'anchor-not-found' };
  }
  writeFileSync(target, source.replace(mutation.find, mutation.replace));
  return { applied: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyId = process.argv[2] || '';
  const hasPostgres = Boolean(process.env.OMNIA_V9_TEST_DATABASE_URL);
  // Same shape as the PostgreSQL gate above. A mutation whose only killing suite
  // needs a real browser cannot be honestly reported as killed when no browser is
  // configured, and must not be reported as surviving either.
  const hasBrowser = Boolean(process.env.CHROMIUM_PATH);
  const selected = MUTATIONS.filter(mutation => !onlyId || mutation.id === onlyId);
  const results = [];

  for (const mutation of selected) {
    if (mutation.needsPostgres && !hasPostgres) {
      results.push({ ...mutation, verdict: 'SKIPPED_NEEDS_POSTGRES' });
      continue;
    }
    if (mutation.needsBrowser && !hasBrowser) {
      results.push({ ...mutation, verdict: 'SKIPPED_NEEDS_BROWSER' });
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
      // means anything if the sandbox has it.
      for (const entry of ['server.mjs', 'worker.mjs']) {
        try { cpSync(join(repoRoot, entry), join(root, entry)); } catch { /* absent in a trimmed tree */ }
      }
      cpSync(join(repoRoot, 'package.json'), join(root, 'package.json'));
      cpSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), { recursive: true, dereference: false });

      // A mutant that does not parse proves nothing: the suite would fail for
      // the wrong reason. Confirm the baseline is green first, then mutate.
      const applied = applyMutation(root, mutation);
      if (!applied.applied) {
        results.push({ ...mutation, verdict: 'ANCHOR_NOT_FOUND' });
        continue;
      }
      const syntax = spawnSync(process.execPath, ['--check', join(root, mutation.file)], { encoding: 'utf8' });
      if (syntax.status !== 0) {
        results.push({ ...mutation, verdict: 'MUTANT_DID_NOT_PARSE' });
        continue;
      }
      const run = runSuites(root, mutation.suites);
      results.push({ ...mutation, verdict: run.status === 0 ? 'SURVIVED' : 'KILLED' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const survived = results.filter(item => item.verdict !== 'KILLED'
    && item.verdict !== 'SKIPPED_NEEDS_POSTGRES' && item.verdict !== 'SKIPPED_NEEDS_BROWSER');
  for (const item of results) {
    console.log(`${item.verdict.padEnd(22)} ${item.id.padEnd(10)} ${item.guard}`);
  }
  console.log('');
  console.log(`mutation-war — ${results.length} mutations, ${results.filter(i => i.verdict === 'KILLED').length} killed, ${survived.length} not killed`);
  if (survived.length) {
    console.log('');
    console.log('A guard nothing kills is a guard nothing tests:');
    for (const item of survived) console.log(`  ${item.id} ${item.guard} (${item.verdict})`);
  }
  process.exit(survived.length ? 1 : 0);
}
