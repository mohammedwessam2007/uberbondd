import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateFounderExceptions,FOUNDER_ACTION_CEILING} from '../src/founder-exception-market.mjs';

const human=(id,overrides={})=>({id,action:`Do ${id}`,humanOnly:true,machineRemediationExhausted:true,requiredAuthority:'FOUNDER',evidenceRefs:[`receipt:${id}`],founderMinutes:5,blockingValue:10,urgency:5,reversibility:0.5,...overrides});

test('never gives the founder more than the three-action ceiling',()=>{
  const out=allocateFounderExceptions({exceptions:[human('a'),human('b'),human('c'),human('d'),human('e')]});
  assert.equal(out.ok,true);
  assert.equal(FOUNDER_ACTION_CEILING,3);
  assert.equal(out.queue.length,3);
  assert.equal(out.deferredAdmissibleCount,2);
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('software/capability gaps can never masquerade as founder exceptions',()=>{
  const out=allocateFounderExceptions({exceptions:[
    human('real'),
    human('software',{humanOnly:false,action:'Write missing adapter'}),
    human('lazy',{machineRemediationExhausted:false,action:'Founder manually does automatable work'}),
    human('authority',{requiredAuthority:'SYSTEM'})
  ]});
  assert.deepEqual(out.queue.map(row=>row.id),['real']);
  const rejected=Object.fromEntries(out.rejected.map(row=>[row.id,row.reasonCodes]));
  assert.ok(rejected.software.includes('not-human-only'));
  assert.ok(rejected.lazy.includes('machine-remediation-not-exhausted'));
  assert.ok(rejected.authority.includes('founder-authority-not-required'));
});

test('evidence is required before consuming founder minutes',()=>{
  const out=allocateFounderExceptions({exceptions:[human('x',{evidenceRefs:[]})]});
  assert.equal(out.status,'NO_FOUNDER_EXCEPTION_REQUIRED');
  assert.equal(out.queue.length,0);
  assert.ok(out.rejected[0].reasonCodes.includes('evidence-required'));
});

test('ranking prefers high blocker removal per founder minute',()=>{
  const out=allocateFounderExceptions({exceptions:[
    human('slow',{founderMinutes:30,blockingValue:10,urgency:10}),
    human('fast',{founderMinutes:2,blockingValue:8,urgency:8}),
    human('medium',{founderMinutes:8,blockingValue:9,urgency:8})
  ]});
  assert.equal(out.queue[0].id,'fast');
});

test('caller cannot raise the founder queue beyond constitutional ceiling',()=>{
  const out=allocateFounderExceptions({maxActions:100,exceptions:[human('a'),human('b'),human('c'),human('d')]});
  assert.equal(out.ceiling,3);
  assert.equal(out.queue.length,3);
});
