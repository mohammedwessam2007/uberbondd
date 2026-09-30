import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash, semanticProgramHash, createSemanticClosureChecker } from '../src/semantic-closure-kernel.mjs';
import { renderApprovedCognitiveMacro, validateApprovedCognitiveMacro } from '../src/cognitive-macro-assembler.mjs';

const NOW=Date.parse('2026-09-30T18:30:00Z');
const H=semanticHash({source:'macro-fixture'});
const artifact=()=>({
  scope:'macro-test',qualityContractHash:H,
  nodes:[
    {id:'a',kind:'REALITY',value:10,dependencies:[],authorityId:'a'},
    {id:'b',kind:'REALITY',value:20,dependencies:[],authorityId:'b'},
    {id:'sum',kind:'DERIVATION',opcode:'SUM_INTEGER',value:30,dependencies:['a','b']}
  ],
  claims:[{id:'total',nodeId:'sum',value:30}]
});
const context=()=>{
  const a=artifact();
  return {
    scope:'macro-test',crownRevision:'opus-5.5-admitted-r1',qualityContractHash:H,
    sourceHashes:{source:H},invalidators:{drift:false},requiredClaimIds:['total'],
    authorizedProgramHash:semanticProgramHash(a)
  };
};
const record=(id,value)=>({
  id,value,kind:'REALITY',status:'ACTIVE',scope:'macro-test',qualityContractHash:H,
  sourceHashes:{source:H},invalidators:['drift'],crownRevision:'opus-5.5-admitted-r1',
  evidenceRef:'fixture://reality',verifiedAt:'2026-09-30T18:00:00Z',expiresAt:'2026-10-01T18:00:00Z'
});
const macro=()=>({
  id:'macro.total.v1',status:'ACTIVE',
  template:'Verified total: {{total}}.',
  slots:{total:'total'},
  crownRevision:'opus-5.5-admitted-r1',
  qualityContractHash:H,
  sourceHashes:{source:H},
  invalidators:['drift'],
  evidenceRef:'fixture://crown-approved-macro',
  verifiedAt:'2026-09-30T18:00:00Z',
  expiresAt:'2026-10-01T18:00:00Z'
});
const closed=()=>{
  const a=artifact(),c=context();
  const checker=createSemanticClosureChecker({authorityRecords:[record('a',10),record('b',20)]});
  return {a,c,closure:checker({artifact:a,context:c,now:NOW})};
};

test('trusted Crown-approved macro renders only currently closed E0-E4 claims',()=>{
  const {a,c,closure}=closed();assert.equal(closure.ok,true);
  const m=macro(),trusted={[m.id]:semanticHash(m)};
  const out=renderApprovedCognitiveMacro({macro:m,trustedMacroHashes:trusted,artifact:a,closure,context:c,now:NOW});
  assert.equal(out.ok,true);
  assert.equal(out.status,'E2_CROWN_APPROVED_MACRO_RENDERED');
  assert.equal(out.rendered,'Verified total: 30.');
  assert.equal(out.qualityClass,'Q_CERTIFIED_BOUNDED');
});

test('copied closure cannot authorize macro rendering',()=>{
  const {a,c,closure}=closed(),m=macro(),trusted={[m.id]:semanticHash(m)};
  const out=renderApprovedCognitiveMacro({macro:m,trustedMacroHashes:trusted,artifact:a,closure:structuredClone(closure),context:c,now:NOW});
  assert.equal(out.ok,false);
  assert.ok(out.reasons.includes('current-semantic-closure-required'));
});

test('macro mutation after trust pin fails closed',()=>{
  const {a,c,closure}=closed(),m=macro(),trusted={[m.id]:semanticHash(m)};
  m.template='Tampered: {{total}}.';
  const out=renderApprovedCognitiveMacro({macro:m,trustedMacroHashes:trusted,artifact:a,closure,context:c,now:NOW});
  assert.equal(out.ok,false);
  assert.ok(out.reasons.includes('macro-not-independently-trusted'));
});

test('dependency drift and Crown succession invalidate macro without inference',()=>{
  const m=macro(),trusted={[m.id]:semanticHash(m)};
  const drift=context();drift.sourceHashes.source='f'.repeat(64);
  assert.equal(validateApprovedCognitiveMacro({macro:m,trustedMacroHashes:trusted,context:drift,now:NOW}).ok,false);
  const succession=context();succession.crownRevision='new-crown';
  assert.equal(validateApprovedCognitiveMacro({macro:m,trustedMacroHashes:trusted,context:succession,now:NOW}).ok,false);
});

test('macro requires exact template-slot coverage',()=>{
  const m=macro();m.template+=' {{missing}}';
  const trusted={[m.id]:semanticHash(m)};
  const v=validateApprovedCognitiveMacro({macro:m,trustedMacroHashes:trusted,context:context(),now:NOW});
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('template-slot-coverage-mismatch'));
});
