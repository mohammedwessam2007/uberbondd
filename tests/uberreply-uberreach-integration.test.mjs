import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReachReadiness } from '../src/uberreach-control-plane.mjs';

const prospect={
  accountId:'acct-home-1',recipientId:'r-home-1',industry:'HOME_SERVICES',seniority:'CEO',department:'SALES_MARKETING',
  tags:['agency','HVAC','ServiceTitan','booking'],fitEvidenceConfidence:1,problemEvidenceScore:0.9,roleOwnershipScore:0.9,
  accountValueScore:0.8,contactabilityScore:0.95,sourceCount:4,sourceFreshness:1,
  trigger:{type:'OBSERVED_PROBLEM',confidence:0.9,freshness:1,problemLinked:true}
};

test('UberReach can compile UBERREPLY offer and feed its strategy into Outbound Genome',()=>{
  const result=compileUberReachReadiness({
    genomeInputs:{
      prospect,
      sender:{senderId:'s1',status:'GREEN',authenticationReady:true,providerBudgetAvailable:true},
      authorization:{outreachAuthorized:true},
      legalDecision:{status:'PASSED',jurisdiction:'US',basis:'SYNTHETIC_FIXTURE',policyVersion:'test-v1',evidenceId:'legal-1',recipientType:'CORPORATE'},
      messageCandidates:[],
      experiment:{experimentId:'fixture',primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT',treatmentDimension:'CTA',causalQuestion:'fixture',arms:['SEND_ASSET','INTEREST'],holdoutRate:0.05},
      policy:{},
      enforce:false
    },
    uberReplyInputs:{
      prospect,
      research:{accountValueScore:0.8,signalStrength:0.9,artifactFeasibility:1,evidenceDensity:0.9,estimatedResearchMinutes:5},
      factCheckStatus:'PASSED',
      enforce:true,
      eligibleByOffer:{
        LEAD_TO_BOOKING_LEAK_AUDIT:25000,
        AI_AGENT_RELEASE_GATE:25000,
        CLIENT_ROI_PROOF_SPRINT:25000,
        BILINGUAL_BOOKING_LEAK_AUDIT:25000
      },
      enforceAllocation:true
    }
  });
  assert.equal(result.uberReplyDecision.state,'UBERREPLY_PORTFOLIO_DECISION_READY');
  assert.equal(result.uberReplyDecision.selection.offer.offerId,'LEAD_TO_BOOKING_LEAK_AUDIT');
  assert.equal(result.uberReplyAllocation.allocatedTotal,100000);
  assert.ok(result.outboundGenome);
  assert.ok(Array.isArray(result.outboundGenome.messageCandidates));
  assert.ok(result.outboundGenome.messageCandidates.length>=1);
  assert.ok(!result.blockers.includes('uberreply-no-strong-offer-fit'));
  assert.ok(!result.blockers.includes('uberreply-4x25k-eligible-inventory-shortfall'));
});

test('UberReach exposes diversification shortfall instead of silently stealing another lane allocation',()=>{
  const result=compileUberReachReadiness({
    uberReplyInputs:{
      prospect,
      research:{accountValueScore:0.8,signalStrength:0.9,artifactFeasibility:1,evidenceDensity:0.9},
      enforce:true,
      eligibleByOffer:{
        LEAD_TO_BOOKING_LEAK_AUDIT:100000,
        AI_AGENT_RELEASE_GATE:25000,
        CLIENT_ROI_PROOF_SPRINT:25000,
        BILINGUAL_BOOKING_LEAK_AUDIT:5000
      },
      enforceAllocation:true
    }
  });
  assert.equal(result.uberReplyAllocation.allocatedTotal,80000);
  assert.ok(result.blockers.includes('uberreply-4x25k-eligible-inventory-shortfall'));
  assert.equal(result.uberReplyAllocation.automaticCrossLaneReallocationAuthorized,false);
});
