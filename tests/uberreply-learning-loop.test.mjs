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
  assert.equal(out.learningPacket.arms[0].arm,'cand-a');
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
