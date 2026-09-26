import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSubstrateCandidate, compileFirstMonthSubstratePlan } from '../src/ubersubstrate.mjs';

const claim=value=>({value,evidence:'MARKETING_CLAIM'});
const probed=value=>({value,evidence:'LIVE_PROBED_CONTRACT'});
const owner=value=>({value,evidence:'OWNER_ACCOUNT_OBSERVED'});

test('8 standard Google mailboxes fit a $22 remainder without fabricating send capacity',()=>{
  const r=evaluateSubstrateCandidate({
    id:'clayinbox-google-standard',provider:'clayinbox',product:'Google Workspace',
    unitMonthlyUsd:2.5,unitSize:1,maximumMailboxes:8,maximumMailboxesEvidence:'MARKETING_CLAIM',
    outboundTransport:probed(true),
    inboundReplies:probed(true),
    warmupIncluded:claim(true),
    directCredentialOrTokenCustody:probed(true),
    coldOutreachPositioning:claim(true),
    apiControl:probed(true),
    termsCompatibility:{value:false,evidence:'UNKNOWN'},
    safeSendCapacity:{perDay:null,evidence:'UNKNOWN'}
  },{totalBudgetUsd:30,alreadyCommittedUsd:8});
  assert.equal(r.cost.maxUnits,8);
  assert.equal(r.cost.monthlyUsd,20);
  assert.equal(r.status,'PURCHASE_CANDIDATE_NEEDS_ACTIVATION_EVIDENCE');
  assert.ok(r.blockers.includes('current-terms-compatibility-not-owner-observed'));
  assert.ok(r.blockers.includes('safe-daily-capacity-not-observed'));
});

test('4 pre-warmed Google mailboxes fit strict $22 remainder and 5 need a 50-cent stretch',()=>{
  const four=evaluateSubstrateCandidate({
    id:'prewarm4',provider:'clayinbox',product:'Pre-warmed Google',
    unitMonthlyUsd:4.5,unitSize:1,maximumMailboxes:4,maximumMailboxesEvidence:'MARKETING_CLAIM',
    outboundTransport:probed(true),inboundReplies:probed(true),prewarmed:claim(true),
    directCredentialOrTokenCustody:probed(true),coldOutreachPositioning:claim(true),apiControl:probed(true)
  },{totalBudgetUsd:30,alreadyCommittedUsd:8});
  assert.equal(four.cost.maxUnits,4);
  assert.equal(four.cost.monthlyUsd,18);

  const five=evaluateSubstrateCandidate({
    id:'prewarm5',provider:'clayinbox',product:'Pre-warmed Google',
    monthlyUsd:22.5,unitSize:5,maximumMailboxes:5,maximumMailboxesEvidence:'MARKETING_CLAIM',
    outboundTransport:probed(true),inboundReplies:probed(true),prewarmed:claim(true),
    directCredentialOrTokenCustody:probed(true),coldOutreachPositioning:claim(true),apiControl:probed(true)
  },{totalBudgetUsd:30,alreadyCommittedUsd:8});
  assert.equal(five.status,'NOT_CURRENTLY_AFFORDABLE');
  assert.equal(five.cost.monthlyUsd,22.5);
});

test('Azure density cannot outrank an integrable path merely because it advertises 100 mailboxes',()=>{
  const plan=compileFirstMonthSubstratePlan({
    totalBudgetUsd:33,alreadyCommittedUsd:8,
    candidates:[
      {
        id:'clayinbox-azure',provider:'clayinbox',product:'Azure',
        monthlyUsd:25,unitSize:100,maximumMailboxes:100,maximumMailboxesEvidence:'MARKETING_CLAIM',
        outboundTransport:claim(true),inboundReplies:claim(true),warmupIncluded:claim(true),
        directCredentialOrTokenCustody:{value:false,evidence:'UNKNOWN'},
        coldOutreachPositioning:claim(true),apiControl:claim(true)
      },
      {
        id:'clayinbox-google',provider:'clayinbox',product:'Google Workspace',
        monthlyUsd:20,unitSize:8,maximumMailboxes:8,maximumMailboxesEvidence:'MARKETING_CLAIM',
        outboundTransport:probed(true),inboundReplies:probed(true),warmupIncluded:claim(true),
        directCredentialOrTokenCustody:probed(true),coldOutreachPositioning:claim(true),apiControl:probed(true)
      }
    ]
  });
  assert.equal(plan.preferredCandidateId,'clayinbox-google');
  assert.equal(plan.candidates.find(x=>x.id==='clayinbox-azure').status,'AFFORDABLE_BUT_INTEGRATION_UNPROVEN');
  assert.ok(plan.candidates.find(x=>x.id==='clayinbox-azure').blockers.includes('direct-credential-or-token-custody-not-evidenced'));
});

test('even a fully integrated mailbox fleet is not LIVE until terms and safe capacity are owner-observed',()=>{
  const r=evaluateSubstrateCandidate({
    id:'x',provider:'x',product:'x',monthlyUsd:10,unitSize:10,
    outboundTransport:probed(true),inboundReplies:probed(true),warmupIncluded:probed(true),
    directCredentialOrTokenCustody:probed(true),coldOutreachPositioning:claim(true),apiControl:probed(true),
    termsCompatibility:owner(true),
    safeSendCapacity:{perDay:100,evidence:'OWNER_ACCOUNT_OBSERVED'}
  },{totalBudgetUsd:30,alreadyCommittedUsd:8});
  assert.equal(r.status,'LIVE_SUBSTRATE_EVIDENCED');
  assert.equal(r.integration.safeSendCapacityPerDay,100);
});

test('mailbox density never becomes a send-volume estimate',()=>{
  const r=evaluateSubstrateCandidate({
    id:'density',provider:'x',product:'x',monthlyUsd:20,unitSize:100,maximumMailboxes:100,maximumMailboxesEvidence:'MARKETING_CLAIM',
    outboundTransport:claim(true),inboundReplies:claim(true),warmupIncluded:claim(true),
    directCredentialOrTokenCustody:claim(true),coldOutreachPositioning:claim(true),apiControl:claim(true)
  },{totalBudgetUsd:30,alreadyCommittedUsd:8});
  assert.equal(r.integration.safeSendCapacityPerDay,null);
  assert.ok(r.blockers.includes('safe-daily-capacity-not-observed'));
});
