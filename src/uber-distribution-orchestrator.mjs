import { compileDistributionPortfolio, motionEvidenceFromCommercialLearning, evaluateReferralCommission } from './distribution-control-plane.mjs';

export const UBER_DISTRIBUTION_ORCHESTRATOR_VERSION='uberbond.uber-distribution-orchestrator.v1';

export function compileUberDistributionCycle({motions=[],commercialLearning=null,learningChannelId=null,referralChecks=[],now=new Date().toISOString(),explorationSlots=2}={}){
  const bridgedEvidence=commercialLearning&&learningChannelId?motionEvidenceFromCommercialLearning(commercialLearning,learningChannelId,now):null;
  const portfolio=compileDistributionPortfolio({motions,now,explorationSlots});
  const referrals=Array.isArray(referralChecks)?referralChecks.map(check=>evaluateReferralCommission(check)):[];
  const referralsValid=Array.isArray(referralChecks)&&referrals.every(result=>result?.ok===true);
  return {
    ok:portfolio.ok===true&&referralsValid,
    status:portfolio.ok===true&&referralsValid?'UBER_DISTRIBUTION_CYCLE_COMPILED':'UBER_DISTRIBUTION_CYCLE_BLOCKED',
    portfolio,
    bridgedEvidence,
    referrals,
    executionAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'DISTRIBUTION_PLANNING_AND_ECONOMIC_EVIDENCE_DO_NOT_AUTHORIZE_SENDS_SPEND_PUBLISHING_OR_COMMISSIONS'
  };
}
