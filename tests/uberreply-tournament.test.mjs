import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UBERREPLY_EXPERIMENT_LIBRARY,
  UBERREPLY_RESEARCH_DONOR_LEDGER,
  assignUberReplyExperiment,
  applyUberReplyArmToMessageCandidate,
  compileUberReplyEconomicWeightProposal,
  compileUberReplyTournament
} from '../src/uberreply-tournament.mjs';

test('experiment library uses down-funnel economic primary metrics',()=>{
  assert.ok(UBERREPLY_EXPERIMENT_LIBRARY.length>=6);
  assert.ok(UBERREPLY_EXPERIMENT_LIBRARY.every(row=>row.primaryMetric==='INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'));
});

test('research donor ledger preserves data and practitioner donors without declaring causal truth',()=>{
  const ids=new Set(UBERREPLY_RESEARCH_DONOR_LEDGER.map(row=>row.id));
  assert.ok(ids.has('gong-30mpc-85m-2025'));
  assert.ok(ids.has('woodpecker-2026-benchmark'));
  assert.ok(ids.has('instantly-2026-benchmark'));
  assert.ok(ids.has('sam-mckenna-smykm'));
  assert.ok(ids.has('josh-braun-illuminate'));
});

test('experiment assignment is deterministic for the same recipient/account key',()=>{
  const input={
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    experimentCellId:'cell-1',
    segmentKey:'hvac-founder',
    cycle:1,
    prospect:{accountId:'acct-123',recipientId:'person-1'}
  };
  const a=assignUberReplyExperiment(input);
  const b=assignUberReplyExperiment(input);
  assert.equal(a.ok,true);
  assert.equal(a.experiment.experimentId,b.experiment.experimentId);
  assert.deepEqual(a.assignment,b.assignment);
});

test('assignment arm mutates only declared strategy atom',()=>{
  const base={ctaType:'SEND_ASSET',problemArchitecture:'TENSION_QUESTION',triggerMentioned:false,subjectArchitecture:'SHORT_PLAIN_RELEVANT'};
  const result=applyUberReplyArmToMessageCandidate(base,{arm:'INTEREST',holdout:false});
  assert.equal(result.candidate.ctaType,'INTEREST');
  assert.equal(result.candidate.problemArchitecture,'TENSION_QUESTION');
  assert.equal(base.ctaType,'SEND_ASSET');
});

test('economic allocator requires paid accepted outcomes and cleared contribution before moving weights',()=>{
  const result=compileUberReplyEconomicWeightProposal({observations:[
    {offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',genotypeId:'g1',providerConfirmedSends:100,qualifiedConversations:12,paidSprints:4,acceptedDeliveries:4,clearedContributionCents:120000,founderMinutes:90,currentWeight:1},
    {offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',genotypeId:'g2',providerConfirmedSends:100,qualifiedConversations:20,paidSprints:3,acceptedDeliveries:3,clearedContributionCents:20000,founderMinutes:90,currentWeight:1}
  ],policy:{minOutcomes:10,minPaidOutcomes:3}});
  assert.equal(result.ok,true);
  assert.equal(result.status,'ALLOCATION_PROPOSAL_READY');
  const updates=result.proposal.updates;
  assert.ok(updates.some(row=>row.allocationState==='BOUNDED_REALLOCATION_PROPOSED'));
  const g1=updates.find(row=>row.profileKey.includes(':g1'));
  const g2=updates.find(row=>row.profileKey.includes(':g2'));
  assert.ok(g1.proposedWeight>g2.proposedWeight);
});

test('tournament revokes a harmful genotype to zero internal selection weight',()=>{
  const result=compileUberReplyTournament({candidates:[{
    offerId:'AI_AGENT_RELEASE_GATE',genotypeId:'ubog_bad',currentWeight:1,
    outcome:{providerConfirmedSends:100,qualifiedPositiveReplies:40,qualifiedConversations:20,paidSprints:5,acceptedDeliveries:5,clearedContributionCents:100000,founderMinutes:60},
    experimentEvidence:{primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT',effectDirection:'POSITIVE'},
    reputationEvidence:{legalIncidentCount:1}
  }]});
  assert.equal(result.evaluations[0].tournamentState,'REVOKED');
  assert.equal(result.evaluations[0].proposedWeight,0);
  assert.equal(result.evaluations[0].selectableNextCycle,false);
  assert.deepEqual(result.revoked,[result.evaluations[0].profileKey]);
});

test('tournament never gains external effect or spend authority',()=>{
  const result=compileUberReplyTournament({candidates:[]});
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.automaticSpendIncreaseAuthorized,false);
});
