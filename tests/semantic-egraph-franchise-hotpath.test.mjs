import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileVerifiedSemanticCanonicalizer } from '../src/semantic-reuse-foundry.mjs';
import { executeDecisionFranchise } from '../src/decision-franchise.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';

const raw=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const ph=x=>'sha256:'+raw(JSON.stringify(x));
const now=Date.parse('2026-09-30T20:00:00Z');
const quality=raw('quality');
const deps={ontology:raw('ontology-v1')},invalidators={ontologyDrift:false};
function canonicalizer(receiptOverride={}){
 const expressions=[{id:'country.us',value:'US'},{id:'country.united-states',value:'United States'},{id:'country.canada',value:'Canada'}];
 const receipt={id:'rw-us',from:'country.united-states',to:'country.us',verifierPassed:true,authority:'E2_VERIFIED_TRANSFORMATION',
  proofHash:ph('proof'),qualityContractHash:quality,crownRevision:'opus-5.5-r1',sourceDependencies:deps,invalidators,
  evidenceRef:'proof://e2/us',expiresAt:'2026-10-01T00:00:00Z',...receiptOverride};
 return compileVerifiedSemanticCanonicalizer({expressions,rewriteReceipts:[receipt],rewriteTrustPins:{'rw-us':ph(receipt)},
  qualityContractHash:quality,crownRevision:'opus-5.5-r1',sourceDependencies:deps,invalidators,now});
}
function franchise(){
 const spec={schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass:'COUNTRY_POLICY',qualityContractHash:quality,sideEffectClass:'NONE',
  relevantKeys:['country'],policy:{domain:[{country:'US'},{country:'Canada'}],rows:[
   {input:{country:'US'},output:{eligible:true}},{input:{country:'Canada'},output:{eligible:false}}
  ]}};
 const record={kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,crownRevision:'opus-5.5-r1',
  sourceDependencies:deps,invalidators,closureArtifactHash:raw('a'),closureContextHash:raw('c'),proofClass:'E3',
  evidenceRef:'proof://df',expiresAt:'2026-10-01T00:00:00Z',mintedAt:'2026-09-30T19:00:00Z'};
 return {record,trustPin:semanticHash(record)};
}
const context={crownRevision:'opus-5.5-r1',sourceHashes:deps,invalidators};
const task=country=>({taskId:'t-'+country.replaceAll(' ','-'),taskClass:'COUNTRY_POLICY',qualityContractHash:quality,sideEffectClass:'NONE',payload:{country}});

test('E2-verified equivalent form reaches the same E3 franchise with zero model calls',()=>{
 const c=canonicalizer();assert.equal(c.ok,true);
 const f=franchise(),out=executeDecisionFranchise({...f,task:task('United States'),currentContext:context,now,semanticCanonicalizers:{country:c}});
 assert.equal(out.ok,true);assert.deepEqual(out.decision,{eligible:true});assert.equal(out.providerCallsPerformed,0);assert.equal(out.semanticCanonicalizationCount,1);
});
test('mere similarity without a verified rewrite does not merge states',()=>{
 const c=compileVerifiedSemanticCanonicalizer({expressions:[{id:'a',value:'US'},{id:'b',value:'United States'}],rewriteReceipts:[],rewriteTrustPins:{},
  qualityContractHash:quality,crownRevision:'opus-5.5-r1',sourceDependencies:deps,invalidators,now});
 assert.equal(c.ok,true);
 const f=franchise(),out=executeDecisionFranchise({...f,task:task('United States'),currentContext:context,now,semanticCanonicalizers:{country:c}});
 assert.equal(out.ok,false);assert.match(out.reasons.join(','),/out-of-domain/);
});
test('untrusted or mutated E2 receipt cannot compile canonicalization authority',()=>{
 const expressions=[{id:'a',value:'US'},{id:'b',value:'United States'}];
 const receipt={id:'r',from:'b',to:'a',verifierPassed:true,authority:'E2_VERIFIED_TRANSFORMATION',proofHash:ph('p'),
  qualityContractHash:quality,crownRevision:'opus-5.5-r1',sourceDependencies:deps,invalidators,evidenceRef:'proof://r',expiresAt:'2026-10-01T00:00:00Z'};
 const c=compileVerifiedSemanticCanonicalizer({expressions,rewriteReceipts:[{...receipt,to:'b'}],rewriteTrustPins:{r:ph(receipt)},
  qualityContractHash:quality,crownRevision:'opus-5.5-r1',sourceDependencies:deps,invalidators,now});
 assert.equal(c.ok,false);assert.match(c.reasons.join(','),/trusted-rewrite/);
});
test('dependency drift blocks canonicalization rather than silently matching stale policy',()=>{
 const c=canonicalizer();const f=franchise();
 const drift={...context,sourceHashes:{ontology:raw('ontology-v2')}};
 const out=executeDecisionFranchise({...f,task:task('United States'),currentContext:drift,now,semanticCanonicalizers:{country:c}});
 assert.equal(out.ok,false);
});
