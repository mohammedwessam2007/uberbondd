import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePublicIssueWorkload} from '../scripts/ubermind-public-issue-intake.mjs';

const issue=(n,extra={})=>({
 number:n,state:'open',
 html_url:'https://github.com/mohammedwessam2007/uberbondd/issues/'+n,
 title:'task '+n,body:'public task evidence '+n,
 updated_at:'2026-10-08T10:00:00Z',...extra
});
const run=(fetchImpl,selectedIssueNumbers=[902,1211])=>
 capturePublicIssueWorkload({fetchImpl,selectedIssueNumbers,
  clock:()=>Date.parse('2026-10-08T12:00:00Z')});
const nFromUrl=url=>Number(url.split('/').at(-1));

test('historical selected issue IDs are fetched directly even when outside first listing page',async()=>{
 const urls=[];
 const r=await run(async url=>{
  urls.push(url);
  return {ok:true,json:async()=>issue(nFromUrl(url))};
 });
 assert.deepEqual(urls,[
  'https://api.github.com/repos/mohammedwessam2007/uberbondd/issues/902',
  'https://api.github.com/repos/mohammedwessam2007/uberbondd/issues/1211']);
 assert.equal(r.ok,true);
 assert.equal(r.observedPublicSourceTasks,2);
 assert.equal(r.sourceScanComplete,true);
 assert.deepEqual(r.sourceReadFailures,[]);
 assert.equal(r.liveIssueCount,null);
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.benchmarkReuseConsentVerified,false);
 assert.equal(r.independentlyAdmittedQualitySamples,0);
 assert.equal(r.empiricalMultiplier,null);
 assert.equal(JSON.stringify(r).includes('public task evidence'),false);
});

test('partial GitHub HTTP failure remains explicit without losing valid evidence',async()=>{
 const r=await run(async url=>nFromUrl(url)===902?
  {ok:false,status:403}:{ok:true,json:async()=>issue(1211)});
 assert.equal(r.ok,true);
 assert.equal(r.observedPublicSourceTasks,1);
 assert.equal(r.selectedSourceCount,2);
 assert.equal(r.sourceScanComplete,false);
 assert.deepEqual(r.sourceReadFailures,[{
  issueNumber:902,reason:'SOURCE_HTTP_UNAVAILABLE',httpStatus:403
 }]);
 assert.equal(r.global33333xConfirmed,false);
});

test('missing all requested sources returns bounded refusal with no false success',async()=>{
 const r=await run(async()=>({ok:false,status:404}));
 assert.equal(r.ok,false);
 assert.equal(r.status,'NO_VERIFIABLE_OPEN_PUBLIC_ISSUE_SOURCES');
 assert.equal(r.providerInferenceAuthorized,false);
 assert.equal(r.independentlyAdmittedQualitySamples,0);
});

test('PR masquerading as issue is never admitted as a selected historical issue',async()=>{
 const r=await run(async url=>({ok:true,json:async()=>issue(nFromUrl(url),{pull_request:{url:'x'}})}));
 assert.equal(r.ok,false);
});

test('wrong issue ID or malicious source URL cannot be rebound to trusted selected number',async()=>{
 const r=await run(async url=>({ok:true,json:async()=>issue(nFromUrl(url)+1)}));
 assert.equal(r.ok,false);
});

test('per-source network failures are bounded and cannot inflate quality',async()=>{
 const r=await run(async url=>{
  if(nFromUrl(url)===902)throw new Error('fixture transport down');
  return {ok:true,json:async()=>issue(1211)};
 });
 assert.equal(r.ok,true);
 assert.equal(r.sourceScanComplete,false);
 assert.equal(r.sourceReadFailures[0].reason,'SOURCE_REQUEST_FAILED');
 assert.equal(r.independentlyAdmittedQualitySamples,0);
 assert.equal(r.providerCallsPerformed,0);
});

test('selected issue scope refuses duplicates and excess selections without network reads',async()=>{
 let count=0;
 const fetchImpl=async()=>{count++;throw new Error('unexpected network');};
 for(const selectedIssueNumbers of [[902,902],Array.from({length:51},(_,i)=>i+1),[-1]]){
  const r=await run(fetchImpl,selectedIssueNumbers);
  assert.equal(r.ok,false);
  assert.equal(r.status,'PUBLIC_SOURCE_SCOPE_NOT_AUTHORIZED');
 }
 assert.equal(count,0);
});

test('deterministic source digest changes when public issue version changes',async()=>{
 const r1=await run(async url=>({ok:true,json:async()=>issue(nFromUrl(url))}));
 const r2=await run(async url=>({ok:true,json:async()=>issue(nFromUrl(url),{
  body:'revised on GitHub'
 })}));
 assert.equal(r1.ok,true);assert.equal(r2.ok,true);
 assert.notEqual(r1.sourceCommitmentDigest,r2.sourceCommitmentDigest);
});

test('W22 uses existing bounded GitHub token for read-only selected public issue GET without revealing it',async()=>{
 const secret='existing-protected-fixture-credential-not-real';
 const urls=[],headers=[];
 const r=await capturePublicIssueWorkload({
  selectedIssueNumbers:[902,1211],githubToken:secret,
  clock:()=>Date.parse('2026-10-09T00:00:00Z'),
  fetchImpl:async(url,options)=>{
   urls.push(url);headers.push(options.headers);
   assert.equal(options.method,undefined);
   return {ok:true,json:async()=>issue(nFromUrl(url))};
  }
 });
 assert.equal(r.ok,true);
 assert.equal(r.sourceAuthenticationMode,'EXISTING_PROTECTED_GITHUB_TOKEN_READ_ONLY');
 assert.equal(urls.length,2);
 assert.ok(urls.every(x=>x.startsWith('https://api.github.com/repos/mohammedwessam2007/uberbondd/issues/')));
 assert.ok(headers.every(x=>x.Authorization==='Bearer '+secret));
 assert.equal(JSON.stringify(r).includes(secret),false);
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.paidInferenceAuthorized,false);
});

test('W22 without a configured GitHub credential makes anonymous official public GETs only',async()=>{
 let count=0;
 const r=await capturePublicIssueWorkload({
  selectedIssueNumbers:[1211],githubToken:'',
  fetchImpl:async(url,options)=>{
   count++;
   assert.equal(options.headers.Authorization,undefined);
   return {ok:true,json:async()=>issue(1211)};
  }
 });
 assert.equal(r.ok,true);
 assert.equal(r.sourceAuthenticationMode,'ANONYMOUS_GITHUB_PUBLIC_GET');
 assert.equal(count,1);
});

test('W22 token-supplied 403 refuses complete-source claim and never leaks credential',async()=>{
 const secret='existing-protected-fixture-credential-not-real';
 const r=await capturePublicIssueWorkload({
  selectedIssueNumbers:[902,1211],githubToken:secret,
  fetchImpl:async()=>({ok:false,status:403})
 });
 assert.equal(r.ok,false);
 assert.equal(r.status,'NO_VERIFIABLE_OPEN_PUBLIC_ISSUE_SOURCES');
 assert.equal(r.sourceAuthenticationMode,'EXISTING_PROTECTED_GITHUB_TOKEN_READ_ONLY');
 assert.equal(r.sourceReadFailures.length,2);
 assert.ok(r.sourceReadFailures.every(x=>x.httpStatus===403));
 assert.equal(JSON.stringify(r).includes(secret),false);
 assert.equal(r.providerInferenceAuthorized,false);
});
