// Canon/V3 integration -- premerge audit P0-003 (eligibility), P0-004 (reservations), P0-005
// (suppression).
//
// V3's planSends trusted `prospect.status === 'ready_for_message'` and `prospect.sendEligible ===
// true` directly -- two booleans that (per uniqueCompanySample/replenishQueue in V3's own
// prospect-supply.mjs) were themselves set by earlier, separate validation code. A stale or
// tampered row, or a bug in that earlier code, could flip either boolean and bypass every
// downstream check. This module derives eligibility fresh, every time, from the canonical durable
// records themselves -- never from a boolean the candidate happens to be carrying.
//
// This is deliberately a distinct reason-code vocabulary from policy-reason-codes.mjs's canonical
// registry: that registry is specifically the set of reasons evaluateOpportunityPolicy may emit
// into a persisted policyDecision row. This module answers a later, narrower question ("may THIS
// exact candidate be reserved for send right now") the same way send-safety.mjs's own
// evaluateSendEligibility already does for the pre-Canon single-prospect pipeline -- with its own
// un-canonicalized reason strings, not by inventing new entries in that registry.
import { isEmailSendable, normalizeContactRoute } from './contact-routes.mjs';
import { assertNotReservedOutsideSimulation } from './reserved-domains.mjs';
import { assertCampaignActivation } from './campaign-activation.mjs';
import { isEvidenceFresh } from './commercial-intelligence-import.mjs';
import { normalizeDomain } from './utils.mjs';

function suppressionMatch(email, domain, suppressions = []) {
  const set = new Set(suppressions.map(item => String(item?.value ?? item ?? '').trim().toLowerCase()).filter(Boolean));
  if (email && set.has(String(email).trim().toLowerCase())) return 'recipient-suppressed';
  if (domain && set.has(normalizeDomain(domain))) return 'domain-suppressed';
  return null;
}

/**
 * Pure decision function -- every input is an already-loaded record (or null/undefined when
 * absent), never an id the function would have to trust a caller resolved correctly. `campaignActivation`
 * is the already-computed result of campaign-activation.mjs#assertCampaignActivation.
 */
export function evaluateCanonSendEligibility({
  opportunity, policyDecision, sourceEvidence, contactRoute, prospect = {}, messageVariant,
  experiment, campaignActivation, senderHealth, suppressions = [], cfg = {}, at = new Date(), simulation = false
} = {}) {
  const reasons = [];

  if (!opportunity || opportunity.stage !== 'ready_for_message') reasons.push('opportunity-not-ready-for-message');
  if (!policyDecision || policyDecision.decision !== 'pass') reasons.push('policy-decision-not-passed');

  if (!sourceEvidence || sourceEvidence.status !== 'active') {
    reasons.push('source-evidence-not-active');
  } else if (!isEvidenceFresh({ source: { capturedAt: sourceEvidence.capturedAt, expiresAt: sourceEvidence.expiresAt } }, { maxAgeDays: cfg.revenueOs?.maxEvidenceAgeDays, at })) {
    reasons.push('source-evidence-expired');
  }

  const domain = normalizeDomain(opportunity?.data?.organizationDomain || sourceEvidence?.organizationDomain || '');
  const domainCheck = assertNotReservedOutsideSimulation(domain, { simulation });
  if (!domainCheck.ok) reasons.push(domainCheck.reason);

  let route = null;
  try { route = contactRoute ? normalizeContactRoute(contactRoute) : null; } catch { route = null; }
  if (!route || !isEmailSendable(route, { ...prospect, website: domain, domain })) reasons.push('contact-route-not-email-sendable');

  const suppressionReason = route?.email ? suppressionMatch(route.email, domain, suppressions) : null;
  if (suppressionReason) reasons.push(suppressionReason);

  const terminalStatus = String(prospect?.status || '').trim().toLowerCase();
  if (['lost', 'rejected', 'opted-out', 'complaint', 'hard-bounce', 'wrong-recipient'].includes(terminalStatus)) {
    reasons.push('prospect-terminal-status');
  }

  if (!messageVariant || messageVariant.status !== 'approved') reasons.push('message-variant-not-approved');
  if (messageVariant && messageVariant.opportunityId !== opportunity?.id) reasons.push('message-variant-opportunity-mismatch');

  if (!experiment || experiment.status !== 'active') reasons.push('experiment-not-active');

  if (!campaignActivation || campaignActivation.ok !== true) {
    reasons.push(`campaign-activation:${campaignActivation?.reason || 'not-evaluated'}`);
  }

  if (senderHealth?.paused) reasons.push('sender-paused');

  return {
    ok: reasons.length === 0,
    decision: reasons.length === 0 ? 'pass' : 'reject',
    reasons: [...new Set(reasons)],
    evaluatedAt: (at instanceof Date ? at : new Date(at)).toISOString()
  };
}

/**
 * Loads every canonical record a candidate needs (transactionally consistent within one
 * store.transaction) and evaluates it. This is the ONLY supported entry point for Canon send
 * planning -- callers pass ids and a contactRoute descriptor, never a prospect's own
 * status/sendEligible booleans.
 */
export async function resolveCanonSendCandidate(store, {
  opportunityId, messageVariantId, experimentId, contactRoute, prospect = {}, senderInbox,
  organizationDomain, senderSet = [], policyVersion, cfg = {}, at = new Date(), simulation = false,
  expectedMemberStatus = 'pending'
} = {}) {
  return store.transaction(async tx => {
    const opportunity = await tx.get('opportunities', opportunityId);
    const policyDecisions = await tx.list('policyDecisions', { filters: { opportunityId }, orderBy: 'evaluatedAt', direction: 'desc', limit: 1 });
    const policyDecision = policyDecisions[0] || null;
    const sourceEvidence = opportunity?.sourceEvidenceId ? await tx.get('sourceEvidence', opportunity.sourceEvidenceId) : null;
    const messageVariant = messageVariantId ? await tx.get('messageVariants', messageVariantId) : null;
    const experiment = experimentId ? await tx.get('experiments', experimentId) : null;
    const senderHealth = senderInbox ? await tx.findOne('senderHealth', { inbox: senderInbox }) : null;
    const suppressions = await tx.list('suppressions');
    const recipientEmail = contactRoute?.email || contactRoute?.recipientEmail || '';
    const campaignActivation = await assertCampaignActivation({
      store: tx, cfg, experimentId, organizationDomain: organizationDomain || normalizeDomain(sourceEvidence?.organizationDomain || ''),
      recipientEmail, senderSet, policyVersion, at, expectedMemberStatus
    });

    const result = evaluateCanonSendEligibility({
      opportunity, policyDecision, sourceEvidence, contactRoute, prospect, messageVariant,
      experiment, campaignActivation, senderHealth, suppressions, cfg, at, simulation
    });
    return { ...result, opportunity, policyDecision, sourceEvidence, messageVariant, experiment, campaignActivation };
  });
}
