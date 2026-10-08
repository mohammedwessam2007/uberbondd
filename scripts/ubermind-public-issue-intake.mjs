import crypto from 'node:crypto';
import {precommitPublicWorkload} from '../src/ubermind-public-workload-precommit.mjs';
import {containsSecretValue} from '../src/secret-patterns.mjs';

export const PUBLIC_ISSUE_INTAKE='uberbond.ubermind-public-github-issue-intake.v1';
const OWNER='mohammedwessam2007',REPO='uberbondd';
const SOURCE_IDS=Object.freeze([1211,1206,1001,1000,999,998,997,996,995,994,908,902]);
const sha=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const reason=(status,more={})=>({ok:false,status,sourceCandidateCount:0,
  independentlyAdmittedQualitySamples:0,providerCallsPerformed:0,
  providerInferenceAuthorized:false,actualSpendUsd:0,...more});

/** One read-only public GitHub issue inventory. Returns hashes and refs,
 * NEVER issue bodies, private task data or benchmark permission.
 */
export async function capturePublicIssueWorkload({
 fetchImpl=fetch,clock=Date.now,repoOwner=OWNER,repoName=REPO,
 selectedIssueNumbers=SOURCE_IDS,includeJevShadowInputs=false,
 // Reuse only the existing protected GitHub relay credential, if configured.
 // A public issue reader never asks the founder for a new secret.
 githubToken=process.env.GITHUB_TOKEN
}={}){
 if(repoOwner!==OWNER||repoName!==REPO||
    !Array.isArray(selectedIssueNumbers)||selectedIssueNumbers.length<1||
    selectedIssueNumbers.length>50||new Set(selectedIssueNumbers).size!==selectedIssueNumbers.length||
    selectedIssueNumbers.some(n=>!Number.isSafeInteger(n)||n<1))
   return reason('PUBLIC_SOURCE_SCOPE_NOT_AUTHORIZED');
 // Query only the explicit approved public issue numbers. GitHub's first
 // /issues?per_page=100 page is not an exhaustive historical source inventory.
 // Token is neither returned nor persisted or logged. The 12 explicit
 // public issue numbers and read-only GET method remain unchanged.
 const hasGithubToken=typeof githubToken==='string'&&githubToken.length>=16;
 const sourceAuthenticationMode=hasGithubToken
   ?'EXISTING_PROTECTED_GITHUB_TOKEN_READ_ONLY'
   :'ANONYMOUS_GITHUB_PUBLIC_GET';
 const candidates=[],sourceReadFailures=[],shadowInputs=[];
 const load=async number=>{
  let response;
  try{response=await fetchImpl('https://api.github.com/repos/'+OWNER+'/'+REPO+'/issues/'+number,{
   headers:{Accept:'application/vnd.github+json',
     'User-Agent':'UberBond-Public-Workload-Evidence',
     'X-GitHub-Api-Version':'2022-11-28',
     ...(hasGithubToken?{Authorization:'Bearer '+githubToken}:{})},
   signal:AbortSignal.timeout(7000)
  });}
  catch{return {number,failure:'SOURCE_REQUEST_FAILED'};}
  if(!response?.ok)return {number,failure:'SOURCE_HTTP_UNAVAILABLE',httpStatus:response?.status??null};
  let row;
  try{row=await response.json();}
  catch{return {number,failure:'SOURCE_JSON_UNAVAILABLE'};}
  if(!row||typeof row!=='object'||row.pull_request||
     row.number!==number||row.state!=='open'||
     row.html_url!=='https://github.com/'+OWNER+'/'+REPO+'/issues/'+number||
     typeof row.title!=='string'||typeof row.body!=='string'||
     row.body.length>300000||!Number.isFinite(Date.parse(row.updated_at)))
   return {number,failure:'SOURCE_VERSION_OR_TYPE_UNVERIFIED'};
  let shadowInput=null;
  if(includeJevShadowInputs){
    const title=row.title.slice(0,220);
    const excerpt=row.body.slice(0,1100);
    // Public issue content is still untrusted model input. Any credential-like
    // source snippet must not cross into a Jev provider request.
    if(!containsSecretValue(title)&&!containsSecretValue(excerpt))
      shadowInput={taskId:'issue-'+number,sourceUrl:row.html_url,
      taskContentDigest:sha(JSON.stringify([number,row.title,row.body,row.updated_at])),
      sourceObservedAt:row.updated_at,title,excerpt};
  }
  return {number,shadowInput,candidate:{
   taskId:'issue-'+number,taskClass:'PUBLIC_REPOSITORY_ISSUE_WORK',
   taskContentDigest:sha(JSON.stringify([number,row.title,row.body,row.updated_at])),
   sourceUrl:row.html_url,sourceObservedAt:row.updated_at,
   dataClass:'PUBLIC',sourcePubliclyAccessible:true,
   externalConsentVerified:false}};
 };
 // Four bounded read-only requests at a time, with individual 7s aborts.
 for(let i=0;i<selectedIssueNumbers.length;i+=4){
  const batch=await Promise.all(selectedIssueNumbers.slice(i,i+4).map(load));
  for(const entry of batch){
   if(entry.candidate){
    candidates.push(entry.candidate);
    if(includeJevShadowInputs&&entry.shadowInput)shadowInputs.push(entry.shadowInput);
   }
   else sourceReadFailures.push({issueNumber:entry.number,
     reason:entry.failure,httpStatus:entry.httpStatus??null});
  }
 }
 if(!candidates.length)return reason('NO_VERIFIABLE_OPEN_PUBLIC_ISSUE_SOURCES',{
  selectedSourceCount:selectedIssueNumbers.length,sourceScanComplete:false,
  sourceAuthenticationMode,sourceReadFailures
 });
 const now=new Date(clock()).toISOString();
 const plan=precommitPublicWorkload({campaignId:'oct2026-public-issue-work-intake',asOf:now,taskRows:candidates});
 if(!plan.ok)return reason('SOURCE_WORKLOAD_PRECOMMIT_REFUSED',{precommitFailureClass:plan.reason});
 return {ok:true,schemaVersion:PUBLIC_ISSUE_INTAKE,
  status:'REAL_PUBLIC_GITHUB_ISSUE_CANDIDATE_INTAKE_ONLY',
  sourceRepo:OWNER+'/'+REPO,sourceAuthenticationMode,
  liveIssueCount:null,selectedOpenIssueCount:candidates.length,
  sourceScanComplete:sourceReadFailures.length===0,sourceReadFailures,
  selectedSourceCount:selectedIssueNumbers.length,
  observedPublicSourceTasks:plan.taskCount,
  sourceCommitmentDigest:plan.manifestDigest,
  sourceVersionDigest:sha(JSON.stringify(plan.items.map(({taskId,taskContentDigest,sourceUrl})=>({taskId,taskContentDigest,sourceUrl})))),
  sourceIssueVersions:plan.items.map(({taskId,taskContentDigest,sourceUrl})=>({taskId,taskContentDigest,sourceUrl})),
  // Only synthetic-independent provenance is asserted. No task is a fresh
  // sealed hidden test because these issue texts are already historical.
  historicPublicTasksNotIndependentHoldouts:plan.taskCount,
  independentlyAdmittedQualitySamples:0,providerCallsPerformed:0,
  paidInferenceAuthorized:false,actualSpendUsd:0,
  benchmarkReuseConsentVerified:false,empiricalMultiplier:null,
  global33333xConfirmed:false,
  sourceRefs:plan.items.map(x=>x.sourceUrl),
  // Optional transient-only bounded public input for governed Jev preflight.
  // Never persisted by the W15 backlog and never logged by the worker.
  ...(includeJevShadowInputs?{jevShadowInputs:shadowInputs}:{}),
  truthBoundary:'Only explicitly selected public GitHub issue IDs were read and their exact title+body versions hashed. Partial source reads are labeled with failures; liveIssueCount is null because repository-wide listing was not performed. These are historical visible project tasks, NOT fresh independent blind tasks or provider-reuse permission, and have no paired outputs, grades, audited economics or multiplier admission.'};
}
