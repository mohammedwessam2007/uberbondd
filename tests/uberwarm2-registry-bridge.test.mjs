import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberWarm2RegistryTransitions, applyUberWarm2RegistryTransitions } from '../src/uberwarm2-registry-bridge.mjs';

function store(){
  const rows=[];
  return {
    rows,
    async log(type,detail){rows.push({type,detail});return {type,detail};}
  };
}

test('UberWarm2 RAMP maps to local WARMUP_COMPLETE without outreach authority',()=>{
  const compiled=compileUberWarm2RegistryTransitions({
    warm2Plan:{warmFleet:{decisions:[{mailboxId:'m1',state:'RAMP',recommendedColdDailyCap:7,reasonCodes:[]}]}},
    sendingDomainIdByMailbox:{m1:'d1'}
  });
  assert.equal(compiled.ok,true);
  assert.equal(compiled.transitions[0].warmupStatus,'WARMUP_COMPLETE');
  assert.equal(compiled.transitions[0].currentDailyCap,7);
  assert.equal(compiled.externalEffectAuthority,'NONE');
});

test('LIMITED_CANARY remains WARMUP_ACTIVE and preserves bounded cap',()=>{
  const compiled=compileUberWarm2RegistryTransitions({
    warm2Plan:{warmFleet:{decisions:[{mailboxId:'m1',state:'LIMITED_CANARY',recommendedColdDailyCap:2,reasonCodes:['provider-diversity-below-policy']}]}},
    sendingDomainIdByMailbox:{m1:'d1'}
  });
  assert.equal(compiled.transitions[0].warmupStatus,'WARMUP_ACTIVE');
  assert.equal(compiled.transitions[0].currentDailyCap,2);
  assert.equal(compiled.transitions[0].pause,false);
});

test('quarantine becomes protective local pause and zero messages',async()=>{
  const compiled=compileUberWarm2RegistryTransitions({
    warm2Plan:{warmFleet:{decisions:[{mailboxId:'m1',state:'QUARANTINED',recommendedColdDailyCap:0,reasonCodes:['complaint-rate-above-policy']}]}},
    sendingDomainIdByMailbox:{m1:'d1'}
  });
  const s=store();
  const result=await applyUberWarm2RegistryTransitions({store:s,compiled,date:new Date('2026-10-01T22:00:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.messagesSent,0);
  assert.equal(s.rows.some(row=>row.detail.kind==='PAUSED'),true);
});

test('missing domain linkage refuses transition instead of inventing it',()=>{
  const compiled=compileUberWarm2RegistryTransitions({
    warm2Plan:{warmFleet:{decisions:[{mailboxId:'m1',state:'RAMP',recommendedColdDailyCap:7}]}}
  });
  assert.equal(compiled.ok,false);
  assert.ok(compiled.reasonCodes.includes('sending-domain-id-required:m1'));
});
