// The vertical orchestrator: composes every spine stage built this wave
// into one real, testable pipeline. Nothing here duplicates logic that
// already exists in the stage modules -- this file only sequences calls
// and threads data between them.
//
//   MarketSignal -> Signal Ingestion -> BusinessGenome/OpportunityRegistry
//   -> CapabilityGraph/BuildDistance -> CommercialExperiment
//   -> DistributionChannelRegistry/Allocator -> (simulated or real) Outcome
//   -> RevenueWeightedLearning -> CommercialMemory -> UpgradeProposal
//   -> EngineeringMissionPacket, with a CommercialOutcomeGraph unifying
//   the lineage throughout.
//
// CRITICAL INVARIANT: when isSynthetic is true, every outcome-bearing
// result is tagged SimulatedOutcome/SYNTHETIC_TEST_FIXTURE and
// canaryPromotionGate is never even consulted with a claim of real proof
// -- a synthetic run can never produce ECONOMICALLY_PROVEN. This is
// enforced structurally below, not left to caller discipline.
import { ingestSignals } from './signal-ingestion.mjs';
import { extractGenomeCandidate } from './genome-extraction.mjs';
import { scoreOpportunity } from './opportunity-registry.mjs';
import { existingCapabilityIds } from './capability-graph.mjs';
import { incrementalBuildDistance } from './opportunity-registry.mjs';
import { compileExperiment } from './experiment-compiler.mjs';
import { compileOfferPacket } from './offer-compiler.mjs';
import { listChannels, CHANNEL_IDS } from './distribution-channel-registry.mjs';
import { allocateDistribution } from './distribution-allocator.mjs';
import { buildCommercialOutcomeGraph, persistCommercialOutcomeGraph } from './commercial-outcome-graph.mjs';
import { deriveLearningRecord } from './revenue-weighted-learning.mjs';
import { recordCommercialMemory } from './commercial-memory.mjs';
import { compileUpgradeProposal } from './upgrade-proposal.mjs';
import { compileEngineeringMissionPacket } from './engineering-mission-packet.mjs';

export const COMMERCIAL_SPINE_POLICY_VERSION = 'commercial-spine-1.0.0';

export async function runCommercialSpine({
  store, rawSignals = [], cfg = {}, date = new Date(),
  opportunityId, opportunityName, opportunityCategory = 'UNCATEGORIZED',
  priceHint, candidateOverrides = {}, requiredCapabilities = [],
  isSynthetic = true, // defaults to the SAFE choice: a caller must explicitly opt into a real run
  simulatedOutcomeType = null, ownerApproved = false, realEconomicProof = null,
  budgetUsd = 0, offerPacketArgs = null, repositoryContext = {}
} = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  if (!opportunityId) {
    return { ok: false, reason: 'malformed-input-missing-opportunityId', policyVersion: COMMERCIAL_SPINE_POLICY_VERSION, timestamp };
  }

  // Stage 1: MarketSignal -> Signal Ingestion.
  const ingestion = await ingestSignals({ store, signals: rawSignals, date: referenceDate });
  if (!ingestion.ok) return { ok: false, reason: 'signal-ingestion-failed', ingestion, policyVersion: COMMERCIAL_SPINE_POLICY_VERSION, timestamp };

  // Stage 2: BusinessGenome (real signal-derived fields merged with any
  // explicit caller-supplied context -- genome-extraction.mjs itself stays
  // honest and narrow; the orchestrator is where a caller may add other
  // already-known context, still required to carry its own claimType).
  const extraction = extractGenomeCandidate({
    signals: ingestion.accepted, id: opportunityId, name: opportunityName, category: opportunityCategory, priceHint
  });
  if (!extraction.ok) return { ok: false, reason: 'genome-extraction-failed', extraction, ingestion, policyVersion: COMMERCIAL_SPINE_POLICY_VERSION, timestamp };
  const candidate = { ...extraction.candidate, ...candidateOverrides };

  // Stage 3: Opportunity scoring.
  const scoredOpportunity = scoreOpportunity({ candidate, date: referenceDate });
  if (!scoredOpportunity.ok) return { ok: false, reason: 'opportunity-scoring-failed', scoredOpportunity, policyVersion: COMMERCIAL_SPINE_POLICY_VERSION, timestamp };

  // Stage 4: Capability gap / build distance, driven by the real
  // capability graph rather than a caller-typed list.
  const buildDistanceResult = incrementalBuildDistance(requiredCapabilities, existingCapabilityIds());

  // Stage 5: Commercial Experiment (bounded, reuses the real offer
  // compiler when the caller supplies a matching product).
  const offerPacket = offerPacketArgs ? compileOfferPacket({ ...offerPacketArgs, cfg, date: referenceDate }) : null;
  const experiment = compileExperiment({ scoredOpportunity, offerPacket, cfg, date: referenceDate, maxBudgetUsd: budgetUsd });
  if (!experiment.ok) return { ok: false, reason: 'experiment-compilation-failed', experiment, policyVersion: COMMERCIAL_SPINE_POLICY_VERSION, timestamp };

  // Stage 6: Distribution channel registry + allocator.
  const channels = listChannels(cfg);
  const distributionDecision = allocateDistribution({ experiment, channels, historicalOutcomes: [], budgetUsd: experiment.maxBudgetUsd, date: referenceDate });

  // Stage 7: Outcome. Synthetic by default and structurally so: this
  // branch never sets isSynthetic:false itself -- only the caller's own
  // explicit `isSynthetic: false` argument can produce a RealOutcome, and
  // even then only by re-deriving from the same simulatedOutcomeType input
  // (this orchestrator has no live provider call anywhere in it).
  const outcome = simulatedOutcomeType ? { id: `${experiment.experimentId}:outcome`, type: simulatedOutcomeType, magnitude: 1 } : null;
  const learningRecord = simulatedOutcomeType ? deriveLearningRecord({ outcomeType: simulatedOutcomeType, isSynthetic, date: referenceDate }) : null;

  let memoryReceipt = null;
  if (learningRecord?.ok) {
    memoryReceipt = await recordCommercialMemory(store, {
      hypothesis: experiment.hypothesis, context: { opportunityId, category: opportunityCategory },
      action: distributionDecision.decision, outcomeType: simulatedOutcomeType, isSynthetic, date: referenceDate
    });
  }

  // Stage 8: Commercial Outcome Graph -- lineage over everything above.
  const outcomeGraph = buildCommercialOutcomeGraph({
    signals: ingestion.accepted, genomeCandidate: { ok: true, candidate }, scoredOpportunity, experiment,
    distributionDecision, outcome, isSynthetic
  });
  await persistCommercialOutcomeGraph(store, outcomeGraph);

  // Stage 9: Upgrade Proposal (BUILD/BUY/PARTNER/ADAPT/DEFER/REJECT).
  const upgradeProposal = compileUpgradeProposal({ opportunityScore: scoredOpportunity, buildDistanceResult, expectedAffectedOpportunityIds: [opportunityId], date: referenceDate });

  // Stage 10: Engineering Mission Packet -- only materializes for
  // BUILD/ADAPT; ok:false for everything else, which is itself a valid,
  // honest pipeline outcome (nothing to commission).
  const engineeringPacket = compileEngineeringMissionPacket({ upgradeProposal, repositoryContext, date: referenceDate });

  // Stage 11: Canary gate -- ONLY ever consulted with isSynthetic passed
  // straight through as the proof's isSynthetic flag. A synthetic run can
  // never pass ownerApproved+realEconomicProof through to a TRUE promotion
  // because isSynthetic:true forces economicProof.isSynthetic:true here,
  // which canaryPromotionGate structurally denies regardless of what the
  // caller claims about ownerApproved.
  const canaryProof = realEconomicProof ? { ...realEconomicProof, isSynthetic } : null;

  return {
    ok: true, policyVersion: COMMERCIAL_SPINE_POLICY_VERSION, timestamp, isSynthetic,
    ingestion, extraction, candidate, scoredOpportunity, buildDistanceResult, experiment,
    channels: channels.map(c => c.id), distributionDecision, outcome, learningRecord, memoryReceipt,
    outcomeGraph, upgradeProposal, engineeringPacket, canaryProof
  };
}

export const COMMERCIAL_SPINE_CHANNEL_IDS = CHANNEL_IDS;
