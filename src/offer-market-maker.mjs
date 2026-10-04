// Offer Market Maker: bounded, evidence-gated offer mutation over the existing
// four-offer genome. It composes compileUberReplyOfferLifecycle (the existing
// verdict on each offer) and allocateContextual (champion/challenger slots).
// Recommendation-only. At most ONE mutation dimension per offer at a time, and
// the control version is always preserved so the mutation stays interpretable.
import { UBERREPLY_OFFER_PORTFOLIO, compileUberReplyOfferLifecycle } from './uberreply-four-offer-genome.mjs';
import { allocateContextual } from './revenue-reliability.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OFFER_MARKET_MAKER_VERSION = 'uberbond.offer-market-maker.v1';
export const MUTATION_DIMENSIONS = Object.freeze(['buyer', 'scope', 'turnaround', 'artifact', 'proof_level', 'price', 'recurring_component', 'guarantee_language', 'async_flow']);

// which layer to question first, given the lifecycle verdict
const DIMENSION_FOR = {
  RETHINK_OFFER: ['buyer', 'artifact', 'scope'],
  RETHINK_ECONOMICS: ['price', 'scope', 'turnaround'],
  DEGRADE_OR_PAUSE_FOR_GUARDRAIL_REVIEW: []
};

export function compileOfferMarket({ outcomes = {}, totalSlots = 10, history = {} } = {}) {
  const offers = UBERREPLY_OFFER_PORTFOLIO.map(o => {
    const outcome = outcomes[o.offerId] || {};
    const lifecycle = compileUberReplyOfferLifecycle({ offerId: o.offerId, outcome });
    const tried = new Set(history[o.offerId] || []);
    const next = (DIMENSION_FOR[lifecycle.state] || []).find(d => !tried.has(d)) || null;
    return { offerId: o.offerId, lifecycle: lifecycle.state, reasons: lifecycle.reasonCodes || [], outcome, mutationProposal: next ? { dimension: next, controlPreserved: true, maxConcurrentDimensions: 1, requiresEvidenceBeforeAdoption: true } : null };
  });
  const arms = offers.map(o => ({ id: o.offerId, sends: Number(o.outcome.sends || 0), positive: Number(o.outcome.positiveReplies || 0), paused: o.lifecycle.startsWith('DEGRADE') }));
  const allocation = allocateContextual(arms.filter(a => !a.paused), { totalSlots });
  return {
    version: OFFER_MARKET_MAKER_VERSION, offers, allocation,
    pausedForGuardrail: arms.filter(a => a.paused).map(a => a.id),
    rule: 'No fifth offer is invented. A mutation needs a lifecycle verdict, changes one dimension, and keeps the control.',
    advisoryOnly: true, outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
