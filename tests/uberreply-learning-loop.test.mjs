import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReplyObservedLearning } from '../src/uberreply-learning-loop.mjs';

test('learning loop binds exact reply evidence to treatment lineage and does not invent contribution',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp1',
    prospects:[{id:'p1',campaignId:'camp1',opportunityStage:'paid'}],
    messages:[{
      id:'m1',campaignId:'camp1',prospectId:'p1',followup:0,sentAt:'2026-09-28T10:00:00.000Z',
      uberReplyCandidateId:'cand-a',
      uberReplyStrategyArmId:'ubv5arm_subject_1',
      uberReplyGenotypeId:'ubog_abc',
      uberReplyRenderedMessageId:'ubom_xyz'
    }],
    replies:[{
      sourceMessageId:'m1',prospectId:'p1',receivedAt:'2026-09-28T11:00:00.000Z',
      classification:{label:'positive'},
      qualifiedPositiveEvidence:{qualified:true}
    }],
    orders:[{prospectId:'p1',status:'paid',amountCents:150000}]
  });
  assert.equal(out.treatmentCount,1);
  assert.equal(out.outcomes.length,1);
  assert.equal(out.outcomes[0].conversation.qualifiedPositiveReply,true);
  assert.equal(out.outcomes[0].commercial.clearedRevenueCents,150000);
  assert.equal(out.outcomes[0].commercial.clearedContributionCents,null);
  assert.equal(out.outcomes[0].economics.marginalSendValueCents,null);
  assert.equal(out.learningPacket.arms[0].arm,'ubv5arm_subject_1');
  assert.equal(out.recordAttempt.deliveredUniqueProspects,1);
  assert.equal(out.recordAttempt.qualifiedPositiveReplyUniqueProspects,1);
  assert.equal(out.automaticPromotionAuthorized,false);
});

test('learning loop does not attribute a prospect reply without exact source-message lineage',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp1',
    prospects:[{id:'p1',campaignId:'camp1'}],
    messages:[{
      id:'m1',campaignId:'camp1',prospectId:'p1',followup:0,sentAt:'2026-09-28T10:00:00.000Z',
      uberReplyCandidateId:'cand-a',
      uberReplyGenotypeId:'ubog_abc',
      uberReplyRenderedMessageId:'ubom_xyz'
    }],
    replies:[{
      prospectId:'p1',
      classification:{label:'positive'},
      qualifiedPositiveEvidence:{qualified:true}
    }]
  });
  assert.equal(out.outcomes[0].conversation.positiveReply,false);
  assert.equal(out.outcomes[0].conversation.qualifiedPositiveReply,false);
});

test('learning loop requires sample floor and guardrails before causal-analysis readiness',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp1',
    messages:[
      {id:'a',campaignId:'camp1',prospectId:'p1',uberReplyCandidateId:'A',uberReplyGenotypeId:'ubog_a',uberReplyRenderedMessageId:'ubom_a'},
      {id:'b',campaignId:'camp1',prospectId:'p2',uberReplyCandidateId:'B',uberReplyGenotypeId:'ubog_b',uberReplyRenderedMessageId:'ubom_b'}
    ],
    policy:{minSamplesPerArm:2}
  });
  assert.equal(out.learningPacket.eligibleForCausalAnalysis,false);
  assert.equal(out.learningPacket.automaticWinner,null);
});


test('learning loop prefers the verified revenue ledger and never double-counts the matching paid order',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp-ledger',
    prospects:[{id:'p1',campaignId:'camp-ledger',opportunityStage:'paid'}],
    messages:[{
      id:'m1',campaignId:'camp-ledger',prospectId:'p1',followup:0,sentAt:'2026-09-28T10:00:00.000Z',
      uberReplyCandidateId:'cand-a',uberReplyStrategyArmId:'arm-a',
      uberReplyGenotypeId:'ubog_a',uberReplyRenderedMessageId:'ubom_a'
    }],
    orders:[{id:'order1',prospectId:'p1',status:'paid',amountCents:150000}],
    revenueEvents:[
      {id:'rev1',providerEventId:'evt-sale',prospectId:'p1',kind:'sale',amountCents:150000},
      {id:'rev2',providerEventId:'evt-refund',prospectId:'p1',kind:'refund',amountCents:-50000}
    ]
  });
  assert.equal(out.outcomes[0].commercial.clearedRevenueCents,100000);
});

test('learning loop aggregates prospect-specific rendered messages by stable strategy arm',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp-arms',
    prospects:[{id:'p1',campaignId:'camp-arms'},{id:'p2',campaignId:'camp-arms'}],
    messages:[
      {id:'m1',campaignId:'camp-arms',prospectId:'p1',followup:0,uberReplyCandidateId:'exact-1',uberReplyStrategyArmId:'stable-subject-arm',uberReplyGenotypeId:'ubog_1',uberReplyRenderedMessageId:'ubom_1'},
      {id:'m2',campaignId:'camp-arms',prospectId:'p2',followup:0,uberReplyCandidateId:'exact-2',uberReplyStrategyArmId:'stable-subject-arm',uberReplyGenotypeId:'ubog_2',uberReplyRenderedMessageId:'ubom_2'}
    ],
    policy:{minSamplesPerArm:2}
  });
  assert.equal(out.learningPacket.arms.length,1);
  assert.equal(out.learningPacket.arms[0].arm,'stable-subject-arm');
  assert.equal(out.learningPacket.arms[0].n,2);
});

test('hard bounces are excluded from the delivered record-attempt denominator and causal-ready packet',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp-bounce',
    prospects:[{id:'p1',campaignId:'camp-bounce'},{id:'p2',campaignId:'camp-bounce'}],
    messages:[
      {id:'m1',campaignId:'camp-bounce',prospectId:'p1',followup:0,uberReplyCandidateId:'a',uberReplyStrategyArmId:'arm-a',uberReplyGenotypeId:'ubog_a',uberReplyRenderedMessageId:'ubom_a'},
      {id:'m2',campaignId:'camp-bounce',prospectId:'p2',followup:0,uberReplyCandidateId:'b',uberReplyStrategyArmId:'arm-b',uberReplyGenotypeId:'ubog_b',uberReplyRenderedMessageId:'ubom_b'}
    ],
    outboundEvents:[{prospectId:'p2',eventType:'hard_bounce',detail:{sourceMessageId:'m2'}}]
  });
  assert.equal(out.deliveryAccounting.hardBounceTreatmentCount,1);
  assert.equal(out.deliveryAccounting.analyzableDeliveredTreatmentCount,1);
  assert.equal(out.recordAttempt.deliveredUniqueProspects,1);
  assert.equal(out.learningPacket.outcomeCount,1);
});


test('learning loop counts a later qualified reply on the same exact message without losing the earlier reply history',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp-multi-reply',
    prospects:[{id:'p1',campaignId:'camp-multi-reply'}],
    messages:[{
      id:'m1',campaignId:'camp-multi-reply',prospectId:'p1',followup:0,sentAt:'2026-09-28T10:00:00.000Z',
      uberReplyCandidateId:'cand-a',uberReplyStrategyArmId:'arm-a',uberReplyGenotypeId:'ubog_a',uberReplyRenderedMessageId:'ubom_a'
    }],
    replies:[
      {sourceMessageId:'m1',prospectId:'p1',receivedAt:'2026-09-28T10:30:00.000Z',classification:{label:'neutral'}},
      {sourceMessageId:'m1',prospectId:'p1',receivedAt:'2026-09-28T11:00:00.000Z',classification:{label:'positive'},qualifiedPositiveEvidence:{qualified:true}}
    ]
  });
  assert.equal(out.outcomes[0].conversation.positiveReply,true);
  assert.equal(out.outcomes[0].conversation.qualifiedPositiveReply,true);
});

test('economic evidence is not attributed to a treatment sent after the payment receipt',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp-time',
    prospects:[{id:'p1',campaignId:'camp-time',opportunityStage:'paid'}],
    messages:[
      {id:'m1',campaignId:'camp-time',prospectId:'p1',followup:0,sentAt:'2026-09-28T10:00:00.000Z',uberReplyCandidateId:'a',uberReplyStrategyArmId:'arm-a',uberReplyGenotypeId:'ubog_a',uberReplyRenderedMessageId:'ubom_a'},
      {id:'m2',campaignId:'camp-time',prospectId:'p1',followup:1,sentAt:'2026-09-28T13:00:00.000Z',uberReplyCandidateId:'b',uberReplyStrategyArmId:'arm-b',uberReplyGenotypeId:'ubog_b',uberReplyRenderedMessageId:'ubom_b'}
    ],
    revenueEvents:[{id:'r1',providerEventId:'evt1',prospectId:'p1',kind:'sale',amountCents:150000,createdAt:'2026-09-28T12:00:00.000Z'}]
  });
  const first=out.outcomes.find(row=>row.decisionId==='uberreply:m1');
  const second=out.outcomes.find(row=>row.decisionId==='uberreply:m2');
  assert.equal(first.commercial.clearedRevenueCents,150000);
  assert.equal(second.commercial.clearedRevenueCents,null);
});

test('record-attempt receipt refuses to infer that delivered prospects were truly cold',()=>{
  const out=compileUberReplyObservedLearning({
    campaignId:'camp-truth',
    prospects:[{id:'p1',campaignId:'camp-truth'}],
    messages:[{id:'m1',campaignId:'camp-truth',prospectId:'p1',followup:0,uberReplyCandidateId:'a',uberReplyStrategyArmId:'arm-a',uberReplyGenotypeId:'ubog_a',uberReplyRenderedMessageId:'ubom_a'}]
  });
  assert.match(out.recordAttempt.cohortTruthRequirement,/separately prove/i);
});
