import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {precommitPublicWorkload,reviewPairedWorkloadSubmission,verifyPublicWorkloadManifest,WORKLOAD_INTAKE_SCHEMA} from '../src/ubermind-public-workload-precommit.mjs';

const h=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const asOf='2026-10-08T10:00:00Z';
const source=(i,more={})=>({taskId:'task-'+i,taskClass:'PUBLIC_REPOSITORY_TASK',
 taskContentDigest:h('task-'+i),sourceUrl:'https://github.com/example/repo/issues/'+i,
 sourceObservedAt:'2026-10-08T09:00:00Z',dataClass:'PUBLIC',
 sourcePubliclyAccessible:true,externalConsentVerified:false,...more});
const make=(rows=[source(1),source(2)])=>precommitPublicWorkload({campaignId:'forge-test',asOf,taskRows:rows});
const paired=(i,more={})=>({taskId:'task-'+i,taskContentDigest:h('task-'+i),
 candidateOutputDigest:h('candidate-'+i),frontierOutputDigest:h('frontier-'+i),
 graderReceiptRef:'grader-'+i,candidateProviderReceiptRef:'cand-'+i,
 frontierProviderReceiptRef:'ref-'+i,candidateMicrousd:11,frontierMicrousd:21,...more});
const fresh=x=>structuredClone(x);
const rehash=x=>h(JSON.stringify({campaignId:x.campaignId,asOf:x.asOf,items:x.items}));

test('valid manifest and independent-audit-pending pair stage remain nonauthoritative',()=>{
 const m=make();
 assert.equal(m.ok,true);
 assert.equal(verifyPublicWorkloadManifest(m),true);
 const a=reviewPairedWorkloadSubmission({manifest:m,records:[paired(2),paired(1)]});
 const b=reviewPairedWorkloadSubmission({manifest:m,records:[paired(1),paired(2)]});
 assert.equal(a.ok,true);
 assert.equal(a.manifestDigest,m.manifestDigest);
 assert.equal(a.pairedSubmissionDigest,b.pairedSubmissionDigest);
 assert.equal(a.empiricallyAdmittedSamples,0);
 assert.equal(a.empiricalMultiplier,null);
 assert.equal(a.global33333xConfirmed,false);
 assert.equal(a.spendAuthorized,false);
});

test('forged ok:true public manifest cannot stage receipts',()=>{
 const m={ok:true,schemaVersion:WORKLOAD_INTAKE_SCHEMA,taskCount:1,
  items:[{taskId:'task-1',taskContentDigest:h('task-1')}],
  manifestDigest:h('fabricated')};
 assert.equal(reviewPairedWorkloadSubmission({manifest:m,records:[paired(1)]}).ok,false);
});

test('malformed and missing manifests refuse rather than throw',()=>{
 for(const manifest of [null,{},[],{ok:true,schemaVersion:WORKLOAD_INTAKE_SCHEMA,taskCount:1,items:null}]){
  assert.doesNotThrow(()=>reviewPairedWorkloadSubmission({manifest,records:[paired(1)]}));
  assert.equal(reviewPairedWorkloadSubmission({manifest,records:[paired(1)]}).ok,false);
 }
});

test('manifest hash binds exact content, source version and cardinality',()=>{
 const m=make();
 for(const change of [x=>x.items[0].taskContentDigest=h('tampered'),
  x=>x.items[0].sourceUrl='https://github.com/other/repo/issues/1',
  x=>x.items[0].sourceObservedAt='2026-10-08T09:30:00Z',
  x=>x.taskCount=999, x=>x.manifestDigest=h('random')]){
  const mutated=fresh(m);change(mutated);
  assert.equal(verifyPublicWorkloadManifest(mutated),false);
 }
});

test('rehashing cannot promote self-declared audit or consent facts',()=>{
 const m=make();
 for(const change of [x=>x.items[0].permissionForProviderBenchmarkReuseVerified=true,
  x=>x.items[0].independentOriginAuditStatus='PASSED',
  x=>x.items[0].blindedBeforeCandidateRun=true,
  x=>x.items[0].independentlySealedBeforeInference=true,
  x=>x.items[0].externalQualityJudgment='APPROVED',
  x=>x.items[0].providerBilling='CONFIRMED',
  x=>x.items[0].economicAuthority='APPROVED']){
  const mutated=fresh(m);change(mutated);mutated.manifestDigest=rehash(mutated);
  assert.equal(verifyPublicWorkloadManifest(mutated),false);
 }
});

test('submitter consent statement never creates verified provider reuse permission',()=>{
 const m=make([source(1,{externalConsentVerified:true})]);
 assert.equal(m.ok,true);
 assert.equal(m.items[0].submitterClaimsExternalConsent,true);
 assert.equal(m.items[0].permissionForProviderBenchmarkReuseVerified,false);
 assert.equal(verifyPublicWorkloadManifest(m),true);
});

test('duplicate source, duplicate ID, duplicate task content and future source are refused',()=>{
 const variants=[source(2,{sourceUrl:source(1).sourceUrl}),
  source(2,{taskId:'task-1'}),source(2,{taskContentDigest:source(1).taskContentDigest}),
  source(2,{sourceObservedAt:'2026-10-09T09:00:00Z'})];
 for(const other of variants){
  assert.equal(make([source(1),other]).ok,false);
 }
});

test('replayed, inflated or malformed paired submissions fail closed',()=>{
 const m=make();
 for(const records of [[paired(1),paired(1)],
  [paired(1,{taskContentDigest:h('wrong')})],
  [paired(1,{candidateMicrousd:-1})],
  [paired(1,{candidateOutputDigest:'not-a-sha'})],
  [paired(1,{taskId:'task-999'})],
  [paired(1),paired(2),paired(3)]]){
  const out=reviewPairedWorkloadSubmission({manifest:m,records});
  assert.equal(out.ok,false);assert.equal(out.spendAuthorized,false);
 }
});

test('partial and empty paired submissions remain staged, not scored',()=>{
 const m=make();
 for(const records of [[],[paired(1)]]){
  const out=reviewPairedWorkloadSubmission({manifest:m,records});
  assert.equal(out.ok,true);
  assert.equal(out.empiricallyAdmittedSamples,0);
  assert.equal(out.providerInvoicesIndependentlyAuthenticated,0);
  assert.equal(out.empiricalMultiplier,null);
 }
});

test('self-promoted manifest summary cannot create authority without being in hash',()=>{
 const m=make();
 for(const key of ['independentFreshHoldoutsAdmitted','qualityPairedSamplesAdmitted',
  'providerCallsPerformed','spendAuthorized','global33333xConfirmed']){
  const mutated=fresh(m);mutated[key]=1;
  assert.equal(verifyPublicWorkloadManifest(mutated),false);
 }
});

test('hostile circular and extra metadata is refused without crashing',()=>{
 const m=make();m.items[0].loop=m.items[0];
 assert.doesNotThrow(()=>verifyPublicWorkloadManifest(m));
 assert.equal(verifyPublicWorkloadManifest(m),false);
 assert.equal(reviewPairedWorkloadSubmission({manifest:m,records:[]}).ok,false);
});

test('paired receipt with circular extraneous metadata refuses without crashing',()=>{
 const m=make(),r=paired(1);r.untrusted=r;
 assert.doesNotThrow(()=>reviewPairedWorkloadSubmission({manifest:m,records:[r]}));
 const out=reviewPairedWorkloadSubmission({manifest:m,records:[r]});
 assert.equal(out.ok,false);assert.equal(out.spendAuthorized,false);
});

test('caller-supplied manifest authority aliases do not get silently staged',()=>{
 const m=make();m.externallyVerified=true;
 assert.equal(verifyPublicWorkloadManifest(m),false);
 assert.equal(reviewPairedWorkloadSubmission({manifest:m,records:[]}).ok,false);
});

test('unknown paired receipt metadata cannot perturb commitment or conceal a forged grade',()=>{
 const m=make(),a=paired(1);a.independentQualityVerified=true;
 assert.equal(reviewPairedWorkloadSubmission({manifest:m,records:[a]}).ok,false);
 const b=paired(1);
 assert.equal(reviewPairedWorkloadSubmission({manifest:m,records:[b]}).ok,true);
});
