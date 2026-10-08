import crypto from 'node:crypto';

export const PUBLIC_ISSUE_BACKLOG_SCHEMA='uberbond.ubermind-public-issue-backlog.v1';
const sha=s=>'sha256:'+crypto.createHash('sha256').update(s).digest('hex');
const dig=s=>typeof s==='string'&&/^sha256:[a-f0-9]{64}$/.test(s);
const canonicalIssue=(row)=>{
  const match=typeof row?.sourceUrl==='string'?
    /^https:\/\/github\.com\/mohammedwessam2007\/uberbondd\/issues\/([1-9][0-9]*)$/.exec(row.sourceUrl):null;
  if(!match||row.taskId!=='issue-'+match[1]||!dig(row.taskContentDigest))
    return null;
  return {taskId:row.taskId,taskContentDigest:row.taskContentDigest,sourceUrl:row.sourceUrl};
};
const refuse=reason=>({ok:false,status:'PUBLIC_ISSUE_BACKLOG_REFUSED',reason,
  newDistinctIssueCandidates:0,independentlyAdmittedQualitySamples:0,
  paidModelCallsPerformed:0,economicMultiplier:null,externalEffectAuthority:'NONE'});

/**
 * A production work-candidate ledger, NOT admission as customer demand,
 * autonomous action permission, or an independent frontier holdout.
 * Trust boundary: called only with locally fetched GitHub API results.
 */
export function compilePublicIssueBacklog({capture,prior=null,observedAt}={}){
  if(!Number.isFinite(Date.parse(observedAt))||typeof observedAt!=='string'||
     !capture?.ok||capture.status!=='REAL_PUBLIC_GITHUB_ISSUE_CANDIDATE_INTAKE_ONLY'||
     capture.sourceRepo!=='mohammedwessam2007/uberbondd'||
     capture.sourceScanComplete!==true||
     capture.benchmarkReuseConsentVerified!==false||
     capture.independentlyAdmittedQualitySamples!==0||
     capture.providerCallsPerformed!==0||
     capture.paidInferenceAuthorized!==false||
     capture.empiricalMultiplier!==null||
     capture.global33333xConfirmed!==false||
     !Array.isArray(capture.sourceIssueVersions)||
     capture.sourceIssueVersions.length<1||capture.sourceIssueVersions.length>50||
     capture.selectedOpenIssueCount!==capture.sourceIssueVersions.length||
     capture.observedPublicSourceTasks!==capture.sourceIssueVersions.length||
     !dig(capture.sourceVersionDigest)||
     !dig(capture.sourceCommitmentDigest))
    return refuse('complete-observed-public-source-intake-required');
  const current=[],seenIds=new Set(),seenUrl=new Set(),seenDigests=new Set();
  for(const raw of capture.sourceIssueVersions){
    const row=canonicalIssue(raw);
    if(!row||seenIds.has(row.taskId)||seenUrl.has(row.sourceUrl)||
       seenDigests.has(row.taskContentDigest))return refuse('invalid-or-duplicate-source-provenance');
    current.push(row);seenIds.add(row.taskId);seenUrl.add(row.sourceUrl);
    seenDigests.add(row.taskContentDigest);
  }
  const exactDigest=sha(JSON.stringify(current));
  if(exactDigest!==capture.sourceVersionDigest)return refuse('source-fingerprint-drift');
  if(prior!==null){
    if(prior.schemaVersion!==PUBLIC_ISSUE_BACKLOG_SCHEMA||
       !Array.isArray(prior.versions)||!Array.isArray(prior.latestItems)||
       !Array.isArray(prior.seenTaskIds)||!Array.isArray(prior.everObservedIssueNumbers)||
       prior.versions.length>64||prior.versions.some(v=>!dig(v.versionDigest))||
       prior.latestItems.some(x=>!canonicalIssue(x))||
       prior.seenTaskIds.some(x=>typeof x!=='string')||
       prior.everObservedIssueNumbers.some(x=>!Number.isSafeInteger(x)||x<1))
      return refuse('untrusted-protected-backlog-state');
  }
  const previous=prior?.latestItems??[];
  const oldMap=new Map(previous.map(x=>[x.taskId,x.taskContentDigest]));
  const oldIds=new Set(prior?.seenTaskIds??[]);
  const newCandidates=current.filter(x=>!oldIds.has(x.taskId)).length;
  const changedExisting=current.filter(x=>oldMap.has(x.taskId)&&oldMap.get(x.taskId)!==x.taskContentDigest).length;
  if(prior?.versions?.some(x=>x.versionDigest===exactDigest)){
    if(prior.latestSourceVersionDigest===exactDigest)
      return {ok:true,status:'PUBLIC_ISSUE_VERSION_ALREADY_RECORDED',
        changed:false,newDistinctIssueCandidates:0,changedExistingIssueVersions:0,
        retainedOpenIssueCount:current.length,ledger:prior,
        independentlyAdmittedQualitySamples:0,customerDemandVerified:false,
        economicMultiplier:null,paidModelCallsPerformed:0,externalEffectAuthority:'NONE'};
    return refuse('historical-version-reappeared-requires-reconciliation');
  }
  if((prior?.versions?.length??0)>=64)return refuse('backlog-version-archive-required');
  const nums=new Set(prior?.everObservedIssueNumbers??[]);
  for(const item of current)nums.add(Number(item.taskId.slice('issue-'.length)));
  const ledger={
    schemaVersion:PUBLIC_ISSUE_BACKLOG_SCHEMA,
    sourceRepo:'mohammedwessam2007/uberbondd',
    sourceType:'PUBLIC_HISTORICAL_GITHUB_ISSUES',
    latestSourceVersionDigest:exactDigest,latestItems:current,
    seenTaskIds:[...new Set([...(prior?.seenTaskIds??[]),...current.map(x=>x.taskId)])].sort(),
    everObservedIssueNumbers:[...nums].sort((a,b)=>a-b),
    versions:[...(prior?.versions??[]),{versionDigest:exactDigest,
      observedAt,openIssueCount:current.length,
      newDistinctIssueCandidates:newCandidates,
      changedExistingIssueVersions:changedExisting}],
    noAutonomousDispatch:true,noPaidModelAuthorization:true
  };
  return {ok:true,status:'LIVE_PUBLIC_ISSUE_BACKLOG_VERSION_COMMITTED',
    changed:true,newDistinctIssueCandidates:newCandidates,
    changedExistingIssueVersions:changedExisting,
    retainedOpenIssueCount:current.length,ledger,
    independentFreshModelHoldouts:0,independentlyAdmittedQualitySamples:0,
    customerDemandVerified:false,paidModelCallsPerformed:0,
    economicMultiplier:null,externalEffectAuthority:'NONE',
    truthBoundary:'These are genuine read-only observations of pre-existing open project GitHub issues. They are NOT verified customers, independent new hidden holdouts, finished tasks, or permission for provider benchmarking/queue dispatch.'};
}
