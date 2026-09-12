import test from 'node:test';
import assert from 'node:assert/strict';
import { createUbercelSovereignReleaseExecutor } from '../src/ubercel-sovereign-release-adapter.mjs';

const SHA='a'.repeat(40);
const binding={adapterId:'sovereign-runtime',provider:'owned-sovereign-runtime'};
const healthy=`current_release=release-a\ncurrent_release_id=rid-a\nprevious_release=release-z\nsource_commit=${SHA}\nprevious_source_commit=${'b'.repeat(40)}\nrelease_sequence=20260912190000\npostgres=running/healthy\nweb=running/healthy\nworker=running\n`;
const before=`current_release=release-z\ncurrent_release_id=rid-z\nprevious_release=NONE\nsource_commit=${'b'.repeat(40)}\npostgres=running/healthy\nweb=running/healthy\nworker=running\n`;

test('Ubercel applies an already signed/couriered release and verifies exact runtime state',async()=>{
  const calls=[];const run=(file,args)=>{calls.push([file,...args]);if(args[0]==='apply-inbox')return{status:0,stdout:'',stderr:'INBOX_RELEASE_APPLIED'};const statusCalls=calls.filter(x=>x[1]==='status').length;return{status:0,stdout:statusCalls===1?before:healthy,stderr:''};};
  const executor=createUbercelSovereignReleaseExecutor({runCommand:run});
  const out=await executor.executeDeployment({release:{sourceCommit:SHA},binding});
  assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.status,'ADAPTER_DEPLOYMENT_OBSERVED');assert.equal(out.sourceCommit,SHA);assert.equal(out.externalEffectLedger.deployments,1);assert.match(out.rollbackEvidenceRef,/previous=rid-z/);assert.deepEqual(calls.map(x=>x[1]),['status','apply-inbox','status']);
});

test('adapter never invokes apply when binding identity is wrong',async()=>{
  let calls=0;const executor=createUbercelSovereignReleaseExecutor({runCommand:()=>{calls++;return{status:0,stdout:healthy};}});
  const out=await executor.executeDeployment({release:{sourceCommit:SHA},binding:{...binding,provider:'attacker'}});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('ubercel-binding-identity-mismatch'));assert.equal(calls,0);
});

test('post-apply wrong source is an exception for Ubercel uncertain-effect handling',async()=>{
  let n=0;const executor=createUbercelSovereignReleaseExecutor({runCommand:(file,args)=>{if(args[0]==='apply-inbox')return{status:0,stdout:''};n++;return{status:0,stdout:n===1?before:healthy.replace(SHA,'c'.repeat(40))};}});
  await assert.rejects(()=>executor.executeDeployment({release:{sourceCommit:SHA},binding}),/sovereign-runtime-source-not-promoted/);
});

test('post-apply degraded health is never reported as success',async()=>{
  let n=0;const executor=createUbercelSovereignReleaseExecutor({runCommand:(file,args)=>{if(args[0]==='apply-inbox')return{status:0,stdout:''};n++;return{status:0,stdout:n===1?before:healthy.replace('web=running/healthy','web=running/unhealthy')};}});
  await assert.rejects(()=>executor.executeDeployment({release:{sourceCommit:SHA},binding}),/sovereign-runtime-health-not-green-after-apply/);
});
