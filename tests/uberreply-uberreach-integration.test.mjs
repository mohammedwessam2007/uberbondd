import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReachReadiness } from '../src/uberreach-control-plane.mjs';

const prospect={
  accountId:'acct-home-1',recipientId:'r-home-1',industry:'HOME_SERVICES',seniority:'CEO',department:'SALES_MARKETING',
  tags:['agency','HVAC','ServiceTitan','booking'],fitEvidenceConfidence:1,problemEvidenceScore:0.9,roleOwnershipScore:0.9,
  accountValueScore:0.8,contactabilityScore:0.95,sourceCount:4,sourceFreshness:1,
  trigger:{type:'OBSERVED_PROBLEM',confidence:0.9,freshness:1,problemLinked:true}
};

const genomeBase=()=>({
  prospect,
  sender:{senderId:'s1',status:'GREEN',authenticationReady:true,providerBudgetAvailable:true},
  authorization:{outreachAuthorized:true},
  legalDecision:{status:'PASSED',jurisdiction:'US',basis:'SYNTHETIC_FIXTURE',policyVersion:'test-v1',evidenceId:'legal-1',recipientType:'CORPORATE'},
  messageCandidates:[],
  policy:{},
  enforce:false
});

const replyBase=()=>({
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
});

test('UberReach can compile UBERREPLY offer and feed its strategy into Outbound Genome',()=>{
  const genomeInputs=genomeBase();
  genomeInputs.experiment={experimentId:'fixture',primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT',treatmentDimension:'CTA',causalQuestion:'fixture',arms:['SEND_ASSET','INTEREST'],holdoutRate:0.05};
  const result=compileUberReachReadiness({genomeInputs,uberReplyInputs:replyBase()});
  assert.equal(result.uberReplyDecision.state,'UBERREPLY_PORTFOLIO_DECISION_READY');
  assert.equal(result.uberReplyDecision.selection.offer.offerId,'LEAD_TO_BOOKING_LEAK_AUDIT');
  assert.equal(result.uberReplyAllocation.allocatedTotal,100000);
  assert.equal(result.uberReplyExperiment,null,'explicit caller experiment must not be replaced');
  assert.ok(result.outboundGenome);
  assert.ok(Array.isArray(result.outboundGenome.messageCandidates));
  assert.ok(result.outboundGenome.messageCandidates.length>=1);
  assert.ok(!result.blockers.includes('uberreply-no-strong-offer-fit'));
  assert.ok(!result.blockers.includes('uberreply-4x25k-eligible-inventory-shortfall'));
});

test('UberReach deterministically assigns a UBERREPLY experiment when caller supplies none',()=>{
  const input={genomeInputs:genomeBase(),uberReplyInputs:{...replyBase(),experimentCycle:3}};
  const a=compileUberReachReadiness(input);
  const b=compileUberReachReadiness(input);
  assert.equal(a.uberReplyExperiment.state,'UBERREPLY_EXPERIMENT_ASSIGNED');
  assert.equal(a.uberReplyExperiment.experiment.experimentId,b.uberReplyExperiment.experiment.experimentId);
  assert.deepEqual(a.uberReplyExperiment.assignment,b.uberReplyExperiment.assignment);
  assert.equal(a.outboundGenome.experimentAssignment?.experimentId,a.uberReplyExperiment.experiment.experimentId);
  assert.equal(a.outboundGenome.experimentAssignment?.arm,a.uberReplyExperiment.assignment?.arm);
  assert.ok(!a.blockers.includes('uberreply-experiment-assignment-not-ready'));
});

test('explicit existing Genome message candidates take precedence over UBERREPLY candidate defaults',()=>{
  const genomeInputs=genomeBase();
  genomeInputs.messageCandidates=[{
    candidateId:'explicit-existing-candidate',
    wordCount:55,sentenceCount:3,subjectWordCount:2,ctaType:'OFFER',sequencePosition:1,
    problemBeforeProduct:true,productHeavy:false,relevantProof:true,personalizationClass:'COMPANY',
    researchDepth:'A',sourceCount:2,sourceFreshness:1,factCheckStatus:'PASSED'
  }];
  genomeInputs.experiment={experimentId:'explicit-exp',primaryMetric:'QUALIFIED_POSITIVE_REPLY',treatmentDimension:'CTA',causalQuestion:'fixture',arms:['OFFER','INTEREST'],holdoutRate:0};
  const result=compileUberReachReadiness({genomeInputs,uberReplyInputs:replyBase()});
  assert.ok(result.outboundGenome.messageCandidates.some(row=>row.candidateId==='explicit-existing-candidate'));
  assert.ok(!result.outboundGenome.messageCandidates.some(row=>row.candidateId===result.uberReplyDecision.policy.experimentCellId));
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
