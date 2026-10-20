/**
 * PHOENIX swarm integration intelligence. Evidence is PR changed-path metadata,
 * never permission to close, merge, deploy, or discard a donor branch.
 */
const GENERATED = new Set([
  'artifacts/system-readiness.json',
  'docs/CURRENT_SYSTEM_STATE.md',
  'artifacts/constitution/directives.json'
]);
const SHA = /^[0-9a-f]{40}$/;
const PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./+@\- ]{1,450}$/;
const MAX_PRS = 16;

export function analyzePhoenixSwarmPrs(records, {mainSha, checkedAt} = {}) {
  if (!Array.isArray(records) || records.length < 2 || records.length > MAX_PRS ||
    !SHA.test(mainSha || '') || !Number.isFinite(Date.parse(checkedAt || ''))) {
    return {ok:false, status:'REFUSED_MISSING_OR_MALFORMED_SNAPSHOT'};
  }
  const ids = new Set();
  const prs = [];
  for (const raw of records) {
    if (!Number.isSafeInteger(raw?.number) || raw.number < 1 || ids.has(raw.number) ||
      !SHA.test(raw.headSha || '') || !SHA.test(raw.baseSha || '') ||
      !['open', 'closed'].includes(raw.state) ||
      !Array.isArray(raw.files) || raw.files.length > 3000 ||
      !raw.files.every(p => typeof p === 'string' && PATH.test(p)) ||
      new Set(raw.files).size !== raw.files.length ||
      raw.headChangedDuringRead === true) {
      return {ok:false, status:'REFUSED_STALE_OR_INVALID_PR_EVIDENCE', pr:raw?.number ?? null};
    }
    ids.add(raw.number);
    prs.push({number:raw.number, headSha:raw.headSha, baseSha:raw.baseSha,
      state:raw.state, sourceBaseDiffersFromObservedMain:raw.baseSha !== mainSha,
      fileCount:raw.files.length, files:raw.files});
  }
  const intersections = [];
  for (let i=0;i<prs.length;i++) for(let j=i+1;j<prs.length;j++) {
    const a=prs[i], b=prs[j];
    const bfiles=new Set(b.files);
    const common=a.files.filter(p=>bfiles.has(p)).sort();
    const generatedOnly=common.filter(p=>GENERATED.has(p));
    const source=common.filter(p=>!GENERATED.has(p));
    if (!common.length) continue;
    intersections.push({prs:[a.number,b.number].sort((x,y)=>x-y),
      overlappingPaths:common, sourcePaths:source, generatedPaths:generatedOnly,
      sharedHeadSha:a.headSha===b.headSha,
      severity:source.length?'SOURCE_OVERLAP_REVIEW_REQUIRED':'GENERATED_ONLY_INTEGRATION_REGEN',
      releaseAuthority:'NONE',
      note:source.length?'Check source ancestry, exact lines, security and donor retention; paths alone do not prove duplicate behavior.'
        :'Regenerate canonical files after combining sources; this is not proof that either PR is redundant.'});
  }
  intersections.sort((x,y)=> (y.sourcePaths.length-x.sourcePaths.length)||
    (y.overlappingPaths.length-x.overlappingPaths.length)||x.prs[0]-y.prs[0]);
  return {ok:true,status:'PHOENIX_PR_OVERLAP_READ_ONLY',mainSha,checkedAt,
    observedPrCount:prs.length,prs:prs.map(({files,...rest})=>rest),
    intersectionCount:intersections.length,sourceOverlapPairs:intersections.filter(p=>p.sourcePaths.length).length,
    generatedOnlyPairs:intersections.filter(p=>!p.sourcePaths.length).length,
    intersections,releaseAuthority:'NONE',autoMergeAllowed:false,autoCloseAllowed:false,
    sideEffectBoundary:{repositoryWrites:0,providerSends:0,deploymentChanges:0,credentialChanges:0},
    evidenceBoundary:'CHANGED_PATHS_NOT_SEMANTIC_DEDUPLICATION_OR_GREEN_CI'};
}
