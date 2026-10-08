import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePublicIssueWorkload} from '../scripts/ubermind-public-issue-intake.mjs';
import {compilePublicIssueBacklog} from '../src/ubermind-public-issue-backlog.mjs';

const date='2026-10-08T22:00:00Z';
const ids=[1211,1206,1001,1000,999,998,997,996,995,994,908,902];
const item=(n,body='Verified public project task '+n)=>({
 number:n,state:'open',title:'Actual issue '+n,body,
 html_url:'https://github.com/mohammedwessam2007/uberbondd/issues/'+n,
 updated_at:'2026-10-08T14:00:00Z'
});
const source=async (change=null,time=Date.parse(date))=>
  capturePublicIssueWorkload({selectedIssueNumbers:ids,clock:()=>time,
    fetchImpl:async url=>{
      const n=Number(url.split('/').at(-1));
      const row=item(n,change===n?'Updated body '+n:undefined);
      return {ok:true,json:async()=>row};
    }});

test('actual selected 12 public issues become 12 source-bound candidates, not holdouts',async()=>{
 const observed=await source();
 assert.equal(observed.ok,true);
 assert.equal(observed.sourceScanComplete,true);
 assert.equal(observed.observedPublicSourceTasks,12);
 const first=compilePublicIssueBacklog({capture:observed,observedAt:date});
 assert.equal(first.ok,true);
 assert.equal(first.changed,true);
 assert.equal(first.retainedOpenIssueCount,12);
 assert.equal(first.newDistinctIssueCandidates,12);
 assert.equal(first.independentFreshModelHoldouts,0);
 assert.equal(first.independentlyAdmittedQualitySamples,0);
 assert.equal(first.paidModelCallsPerformed,0);
 assert.equal(first.economicMultiplier,null);
 assert.equal(first.ledger.versions.length,1);
 assert.equal(first.ledger.seenTaskIds.length,12);
});

test('fresh scans at different timestamps do not create imaginary new work',async()=>{
 const firstSource=await source();
 const first=compilePublicIssueBacklog({capture:firstSource,observedAt:date});
 const laterSource=await source(null,Date.parse('2026-10-08T22:20:00Z'));
 assert.notEqual(laterSource.sourceCommitmentDigest,firstSource.sourceCommitmentDigest);
 assert.equal(laterSource.sourceVersionDigest,firstSource.sourceVersionDigest);
 const second=compilePublicIssueBacklog({prior:first.ledger,capture:laterSource,
   observedAt:'2026-10-08T22:20:00Z'});
 assert.equal(second.ok,true);
 assert.equal(second.changed,false);
 assert.equal(second.newDistinctIssueCandidates,0);
 assert.equal(second.ledger.versions.length,1);
});

test('edited historical issue changes source version, not unique issue identity',async()=>{
 const first=compilePublicIssueBacklog({capture:await source(),observedAt:date});
 const edited=compilePublicIssueBacklog({prior:first.ledger,
   capture:await source(1001),observedAt:'2026-10-08T22:30:00Z'});
 assert.equal(edited.ok,true);
 assert.equal(edited.changed,true);
 assert.equal(edited.changedExistingIssueVersions,1);
 assert.equal(edited.newDistinctIssueCandidates,0);
 assert.equal(edited.ledger.seenTaskIds.length,12);
 assert.equal(edited.ledger.versions.length,2);
});

test('partial GitHub read does not seed false verified backlog',async()=>{
 const capture=await capturePublicIssueWorkload({
  selectedIssueNumbers:ids,clock:()=>Date.parse(date),
  fetchImpl:async url=>{
    const n=Number(url.split('/').at(-1));
    return n===1001?{ok:false,status:503}:{ok:true,json:async()=>item(n)};
  }});
 assert.equal(capture.ok,true);
 assert.equal(capture.sourceScanComplete,false);
 assert.equal(compilePublicIssueBacklog({capture,observedAt:date}).ok,false);
});

test('mutated source version or forged provenance fails closed',async()=>{
 const capture=await source();
 assert.equal(compilePublicIssueBacklog({capture:{...capture,
   sourceVersionDigest:'sha256:'+'0'.repeat(64)},observedAt:date}).ok,false);
 assert.equal(compilePublicIssueBacklog({capture:{...capture,
   sourceIssueVersions:capture.sourceIssueVersions.map((x,i)=>
     i===0?{...x,sourceUrl:'https://github.com/unknown/repo/issues/1211'}:x)},
   observedAt:date}).ok,false);
});

test('untrusted ledger and duplicate issue identities cannot be promoted',async()=>{
 const capture=await source();
 const first=compilePublicIssueBacklog({capture,observedAt:date});
 const corrupt={...first.ledger,latestItems:[{taskId:'issue-1211',
   taskContentDigest:'invalid',sourceUrl:'https://github.com/mohammedwessam2007/uberbondd/issues/1211'}]};
 assert.equal(compilePublicIssueBacklog({capture,prior:corrupt,observedAt:date}).ok,false);
 const dup={...capture,sourceIssueVersions:[...capture.sourceIssueVersions.slice(0,11),
   capture.sourceIssueVersions[0]]};
 assert.equal(compilePublicIssueBacklog({capture:dup,observedAt:date}).ok,false);
});
