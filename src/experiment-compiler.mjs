// Compiles a bounded CommercialExperiment from a scored opportunity
// (src/opportunity-registry.mjs). Always compiles the smallest, cheapest
// possible probe -- never a full launch -- per the "spend a little to
// learn" discipline. maxBudgetUsd defaults to 0 (no real spend authorized)
// unless the caller explicitly supplies one; this module never invents a
// budget.
import crypto from 'node:crypto';

export const EXPERIMENT_COMPILER_POLICY_VERSION = 'experiment-compiler-1.0.0';

function digestId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

// scoredOpportunity: the output of scoreOpportunity() (Wave 6). offerPacket
// is optional -- pass the real result of compileOfferPacket() when the
// opportunity maps onto an existing product; otherwise the experiment's
// "smallest sellable product" is described generically from the genome.
export function compileExperiment({ scoredOpportunity, offerPacket = null, cfg = {}, date = new Date(), maxBudgetUsd = 0 } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  if (!scoredOpportunity || !scoredOpportunity.ok || !scoredOpportunity.id) {
    return { ok: false, reason: 'malformed-input-scoredOpportunity', policyVersion: EXPERIMENT_COMPILER_POLICY_VERSION, timestamp };
  }

  const experimentId = digestId({ opportunityId: scoredOpportunity.id, policyVersion: EXPERIMENT_COMPILER_POLICY_VERSION });
  const hypothesis = `If offered to a real buyer matching opportunity "${scoredOpportunity.name}", at least one will take the smallest sellable action within the probe window.`;
  const smallestSellableProduct = offerPacket?.ok
    ? { source: 'offer-compiler', product: offerPacket.product, priceUsd: offerPacket.price?.amountUsd ?? null, readyToOffer: offerPacket.readyToOffer }
    : { source: 'generic', description: 'No matching existing product; a real offer must be authored before this experiment can run.', priceUsd: null, readyToOffer: false };

  const priceHypothesis = smallestSellableProduct.priceUsd != null
    ? { status: 'CONFIGURED', amountUsd: smallestSellableProduct.priceUsd }
    : { status: 'NOT_CONFIGURED', amountUsd: null };

  // Nothing here claims a channel -- that's the Distribution Allocator's
  // job (src/distribution-allocator.mjs), run separately and later.
  const distributionRoute = 'UNASSIGNED_PENDING_DISTRIBUTION_ALLOCATOR';

  const boundedBudget = Math.max(0, Number(maxBudgetUsd) || 0);

  return {
    ok: true,
    policyVersion: EXPERIMENT_COMPILER_POLICY_VERSION,
    timestamp,
    experimentId,
    opportunityId: scoredOpportunity.id,
    hypothesis,
    targetBuyer: 'UNKNOWN', // genuinely unknown at this stage without real buyer research -- never fabricated
    smallestSellableProduct,
    proofRequired: scoredOpportunity.missingCriteria.length
      ? `Evidence for: ${scoredOpportunity.missingCriteria.join(', ')}`
      : 'No missing tournament criteria; proof requirement is a real buyer action, not more scoring.',
    priceHypothesis,
    distributionRoute,
    maxBudgetUsd: boundedBudget,
    expectedFounderMinutes: null, // never fabricated without a real capacity estimate
    successCriteria: ['At least one real buyer completes the smallest sellable action within the probe window.'],
    failureCriteria: ['Zero real buyer actions within the probe window.', 'The offer cannot be legally/safely delivered as scoped.'],
    stopConditions: ['maxBudgetUsd is exhausted.', 'Any DENY from the V9 consequence boundary for a required external action.'],
    authorityRequirements: ['Any external/consequential action taken to run this experiment must pass through the V9 consequence boundary (src/consequence-boundary.mjs) -- this compiler authorizes nothing on its own.'],
    evidenceRequirements: scoredOpportunity.missingCriteria,
    dataSufficiency: scoredOpportunity.dataSufficiency,
    promotionStage: scoredOpportunity.promotionStage
  };
}
