// DecisionTwin + UberClose: a model of the BUYING GROUP for one opportunity and
// the next-best-action support Mohamed uses to close. It drafts nothing that
// sends. Inferred roles stay inferred; only roles the buyer stated or a
// verifiable source shows are marked KNOWN.
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const DECISION_TWIN_VERSION = 'uberbond.decision-twin.v1';
export const ROLES = Object.freeze(['economic_buyer', 'champion', 'technical_evaluator', 'blocker', 'user', 'unknown']);
export const DEAL_STAGES = Object.freeze(['REPLIED', 'ARTIFACT_REQUESTED', 'ARTIFACT_DELIVERED', 'QUALIFYING', 'SCOPED', 'PRICED', 'PAYMENT_REQUESTED', 'PAID_CLEARED', 'DELIVERING', 'ACCEPTED']);

export function compileBuyingGroup({ contacts = [] } = {}) {
  const members = contacts.map(c => ({
    contactRef: String(c.contactRef || ''), role: ROLES.includes(c.role) ? c.role : 'unknown',
    basis: c.statedBy ? 'KNOWN_STATED' : c.evidenceRef ? 'KNOWN_SOURCE' : 'INFERRED',
    engaged: Boolean(c.engaged), objections: [...(c.objections || [])]
  })).filter(m => m.contactRef);
  const has = r => members.some(m => m.role === r && m.basis !== 'INFERRED');
  const gaps = [];
  if (!has('economic_buyer')) gaps.push('economic-buyer-not-confirmed');
  if (!has('champion')) gaps.push('no-confirmed-champion');
  if (members.some(m => m.role === 'blocker' && !m.engaged)) gaps.push('unaddressed-blocker');
  return { members, gaps, singleThreaded: members.filter(m => m.engaged).length <= 1 };
}

const NEXT = {
  REPLIED: { action: 'Answer their exact question in one short message; offer the artifact.', ask: 'artifact permission' },
  ARTIFACT_REQUESTED: { action: 'Send the prepared artifact today with no pitch attached.', ask: 'one qualifying question' },
  ARTIFACT_DELIVERED: { action: 'Ask 1-3 async qualification questions tied to a finding in the artifact.', ask: 'scope confirmation' },
  QUALIFYING: { action: 'Restate scope and exclusions in writing; confirm who approves spend.', ask: 'who signs off' },
  SCOPED: { action: 'Send the fixed price with the payment link; state what is delivered and when.', ask: 'go / no-go' },
  PRICED: { action: 'Address the one stated objection with evidence; do not discount unprompted.', ask: 'go / no-go' },
  PAYMENT_REQUESTED: { action: 'Confirm the payment route works for their region; no pressure language.', ask: 'payment' },
  PAID_CLEARED: { action: 'Start delivery; send onboarding and the acceptance criteria.', ask: 'access needed' },
  DELIVERING: { action: 'Deliver to the written acceptance criteria.', ask: 'acceptance' },
  ACCEPTED: { action: 'Ask whether recurring monitoring is useful; only if they used the result.', ask: 'renewal interest' }
};

/** deal: { stage, group, paymentEvidence, lastObjection }. Cash stages need receipts. */
export function compileUberClose({ deal = {} } = {}) {
  const stage = DEAL_STAGES.includes(deal.stage) ? deal.stage : 'REPLIED';
  const group = compileBuyingGroup({ contacts: deal.contacts || [] });
  const idx = DEAL_STAGES.indexOf(stage);
  const claimsCash = idx >= DEAL_STAGES.indexOf('PAID_CLEARED');
  const cashVerified = deal.paymentEvidence?.cleared === true && Boolean(deal.paymentEvidence?.providerTransactionId);
  const effectiveStage = claimsCash && !cashVerified ? 'PAYMENT_REQUESTED' : stage;
  const step = NEXT[effectiveStage];
  const championSupport = group.gaps.includes('no-confirmed-champion') || group.singleThreaded
    ? ['Offer a one-paragraph internal forward-able summary the contact can send to their approver (facts from the artifact only).']
    : [];
  return {
    version: DECISION_TWIN_VERSION, stage: effectiveStage, statedStage: stage,
    stageDowngradedForMissingPaymentEvidence: effectiveStage !== stage,
    group, nextBestAction: { ...step, owner: 'MOHAMED', sendsAutomatically: false }, championSupport,
    objection: deal.lastObjection ? { text: String(deal.lastObjection).slice(0, 500), note: 'Quote it back; answer from evidence, not rebuttal scripts.' } : null,
    authority: 'MANUAL_MOHAMED', outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
