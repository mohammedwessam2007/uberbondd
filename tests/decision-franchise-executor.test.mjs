import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash, executeDecisionFranchise } from '../src/semantic-closure-kernel.mjs';

const now=Date.parse('2026-09-30T20:00:00Z');
function fixture(){
 const spec={schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass:'PROVIDER_SCREENING',qualityContractHash:'a'.repeat(64),sideEffectClass:'NONE',relevantKeys:['smtp','imap'],policy:{
  domain:[{smtp:true,imap:true},{smtp:true,imap:false},{smtp:false,imap:true},{smtp:false,imap:false}],
  rows:[
   {input:{smtp:true,imap:true},output:{eligible:true}},
   {input:{smtp:true,imap:false},output:{eligible:false}},
   {input:{smtp:false,imap:true},output:{eligible:false}},
   {input:{smtp:false,imap:false},output:{eligible:false}}
  ]
 }};
 const record={kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,crownRevision:'opus-5.5-r1',sourceDependencies:{terms:'b'.repeat(64)},invalidators:{termsChanged:false},closureArtifactHash:'c'.repeat(64),closureContextHash:'d'.repeat(64),proofClass:'E4',evidenceRef:'proof://df/1',expiresAt:'2026-10-01T00:00:00Z',mintedAt:'2026-09-30T19:00:00Z'};
 return {record,trustPin:semanticHash(record),context:{crownRevision:'opus-5.5-r1',sourceHashes:{terms:'b'.repeat(64)},invalidators:{termsChanged:false}}};
}
test('certified franchise executes exhaustive decision with zero model calls',()=>{
 const {record,trustPin,context}=fixture();
 const out=executeDecisionFranchise({record,trustPin,taskClass:'PROVIDER_SCREENING',qualityContractHash:'a'.repeat(64),state:{smtp:true,imap:true,irrelevant:'ignored'},currentContext:context,now});
 assert.equal(out.ok,true);assert.deepEqual(out.decision,{eligible:true});assert.equal(out.providerCalls,0);assert.equal(out.semanticAuthority,'E0_E4_VERIFIED_DECISION_FRANCHISE');
});
test('dependency drift page-faults instead of reusing stale cognition',()=>{
 const {record,trustPin,context}=fixture();context.sourceHashes.terms='e'.repeat(64);
 const out=executeDecisionFranchise({record,trustPin,taskClass:'PROVIDER_SCREENING',qualityContractHash:'a'.repeat(64),state:{smtp:true,imap:true},currentContext:context,now});
 assert.equal(out.ok,false);assert.ok(out.reasons.includes('decision-franchise-dependency-drift'));
});
test('invalidator firing page-faults',()=>{
 const {record,trustPin,context}=fixture();context.invalidators.termsChanged=true;
 const out=executeDecisionFranchise({record,trustPin,taskClass:'PROVIDER_SCREENING',qualityContractHash:'a'.repeat(64),state:{smtp:true,imap:true},currentContext:context,now});
 assert.equal(out.ok,false);assert.ok(out.reasons.includes('decision-franchise-invalidator-fired-or-drifted'));
});
test('trust pin blocks mutated franchise',()=>{
 const {record,trustPin,context}=fixture();record.spec.policy.rows[0].output={eligible:false};
 const out=executeDecisionFranchise({record,trustPin,taskClass:'PROVIDER_SCREENING',qualityContractHash:'a'.repeat(64),state:{smtp:true,imap:true},currentContext:context,now});
 assert.equal(out.ok,false);assert.ok(out.reasons.includes('decision-franchise-trust-pin-mismatch'));
});
