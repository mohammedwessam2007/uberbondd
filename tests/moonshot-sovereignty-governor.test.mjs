import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptFounderTermination,
  auditSovereignty,
  governMoonshotAction
} from '../src/moonshot-sovereignty-governor.mjs';

test('external action without owner authorization is blocked',()=>{
  const r=governMoonshotAction({actionId:'a',description:'external probe',externalEffects:true});
  assert.equal(r.ok,false);
  assert.equal(r.status,'SOVEREIGN_ACTION_OWNER_AUTHORITY_REQUIRED');
});

test('owner authorization is not converted into executor authority',()=>{
  const r=governMoonshotAction({actionId:'a',description:'external probe',externalEffects:true,ownerAuthorization:'OWNER_AUTHORIZED'});
  assert.equal(r.ok,true);
  assert.equal(r.executionAuthority,'NONE_AT_GOVERNOR');
  assert.equal(r.externalEffectAuthority,'NONE');
});

test('sovereignty-losing constitutional change requires adversarial review',()=>{
  const r=governMoonshotAction({
    actionId:'rule',description:'change rule',consequential:true,ownerAuthorization:'OWNER_AUTHORIZED',
    constitutionalChange:{oldRule:'owner chooses',newRule:'system chooses',sovereigntyLost:['WILL'],reversible:true}
  });
  assert.equal(r.ok,false);
});

test('unanswered sovereignty checks are not passes',()=>{
  const r=auditSovereignty({stillChoosing:true});
  assert.equal(r.status,'CHECKSUM_INCOMPLETE');
  assert.ok(r.unanswered.length>0);
});

test('system arguments cannot veto founder termination request',()=>{
  const r=acceptFounderTermination({requestedByFounder:true,systemArgumentsForContinuing:['I am useful']});
  assert.equal(r.ok,true);
  assert.equal(r.refusalPossible,false);
  assert.equal(r.argumentsChangeOutcome,false);
});
