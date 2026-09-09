import crypto from 'node:crypto';

export const EVIDENCE_REFERENCE_INTEGRITY_VERSION = 'uberbond.evidence-reference-integrity.v1.1';
const ZERO = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const REPO_PREFIXES = Object.freeze(['src/','scripts/','tests/','api/','config/','artifacts/','docs/','.claude/']);
const REPO_FILES = new Set(['package.json','package-lock.json','server.mjs','worker.mjs','AGENTS.md','CLAUDE.md','UBERBOND_BOOTSTRAP.json','vercel.json']);
const BOUNDARY_STATES = new Set(['EXTERNAL_BLOCKED','OWNER_BOUNDARY','ELAPSED_TIME_REQUIRED']);
const text=v=>String(v??'').trim();
const unique=v=>[...new Set((Array.isArray(v)?v:[]).map(text).filter(Boolean))];
const sorted=v=>unique(v).sort();
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const isRepoPath=v=>REPO_FILES.has(v)||REPO_PREFIXES.some(prefix=>v.startsWith(prefix));
const fail=(reasonCodes,extra={})=>({ok:false,version:EVIDENCE_REFERENCE_INTEGRITY_VERSION,status:'EVIDENCE_REFERENCE_INTEGRITY_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

function rowRefs(row={}) {
  const evidence=row?.currentEvidence||{};
  return {
    sourceModules: sorted(evidence.sourceModules),
    testModules: sorted(evidence.testModules),
    sourceArtifacts: sorted(row?.sourceArtifacts)
  };
}

export function verifyEvidenceReferenceIntegrity({coverage={},leafGraph={},trackedPaths=[]}={}) {
  const rows=Array.isArray(coverage?.rows)?coverage.rows:[];
  const requirements=Array.isArray(leafGraph?.requirements)?leafGraph.requirements:[];
  const leaves=Array.isArray(leafGraph?.leaves)?leafGraph.leaves:[];
  const tracked=new Set(unique(trackedPaths));
  const reasons=[];
  if(!rows.length) reasons.push('coverage-rows-required');
  if(!requirements.length) reasons.push('leaf-graph-requirements-required');
  if(!leaves.length) reasons.push('leaf-graph-leaves-required');
  if(!tracked.size) reasons.push('tracked-repository-inventory-required');

  const rowById=new Map(rows.map(row=>[text(row?.canonicalId),row]));
  const requirementById=new Map(requirements.map(row=>[text(row?.id),row]));
  const leafById=new Map(leaves.map(row=>[text(row?.leafId),row]));
  const checkedRepoPaths=new Set();
  const rowBindings=[];
  const requirementBindings=[];
  const leafBindings=[];

  const checkPath=(path,reasonPrefix)=>{
    const p=text(path); if(!p||!isRepoPath(p)) return;
    checkedRepoPaths.add(p);
    if(!tracked.has(p)) reasons.push(`${reasonPrefix}:${p}`);
  };

  for(const [id,row] of rowById){
    if(!id) continue;
    const refs=rowRefs(row);
    for(const path of refs.sourceModules){
      if(!path.startsWith('src/')&&!path.startsWith('scripts/')&&!path.startsWith('api/')&&!path.startsWith('.claude/')) reasons.push(`source-module-reference-has-wrong-class:${id}:${path}`);
      checkPath(path,`missing-source-module-reference:${id}`);
    }
    for(const path of refs.testModules){
      if(!path.startsWith('tests/')||!path.endsWith('.test.mjs')) reasons.push(`test-module-reference-has-wrong-class:${id}:${path}`);
      checkPath(path,`missing-test-module-reference:${id}`);
    }
    for(const path of refs.sourceArtifacts) checkPath(path,`missing-source-artifact-reference:${id}`);
    const internalRefs=[...refs.sourceModules,...refs.testModules,...refs.sourceArtifacts].filter(isRepoPath);
    if(!BOUNDARY_STATES.has(text(row?.currentState))&&internalRefs.length===0) reasons.push(`internal-coverage-row-needs-repository-evidence-reference:${id}`);
    rowBindings.push({canonicalId:id,currentState:text(row?.currentState),...refs});
  }

  for(const [id,requirement] of requirementById){
    const row=rowById.get(id);
    if(!row){ reasons.push(`requirement-without-coverage-row:${id}`); continue; }
    checkPath(requirement?.canonicalSource,`missing-requirement-canonical-source:${id}`);
    const expectedStatus=`coverage:${id}:${text(row?.currentState)}`;
    if(text(requirement?.statusEvidenceRef)!==expectedStatus) reasons.push(`requirement-status-evidence-detached-from-coverage:${id}`);
    const executionLeafIds=sorted(requirement?.executionLeafIds);
    requirementBindings.push({id,canonicalSource:text(requirement?.canonicalSource),statusEvidenceRef:text(requirement?.statusEvidenceRef),executionLeafIds});
    for(const leafId of executionLeafIds){
      const leaf=leafById.get(leafId);
      if(!leaf) continue;
      const exactScope=sorted(leaf?.exactScope);
      const inputEvidence=sorted(leaf?.inputEvidence);
      for(const scope of exactScope) checkPath(scope,`missing-leaf-exact-scope:${leafId}`);
      const expectedInput=`coverage:${id}:${text(row?.currentState)}`;
      if(!inputEvidence.includes(expectedInput)) reasons.push(`leaf-input-evidence-detached-from-coverage:${leafId}`);
      leafBindings.push({leafId,requirementId:id,exactScope,inputEvidence});
    }
  }

  if(reasons.length) return fail(reasons,{checkedRepositoryPaths:[...checkedRepoPaths].sort()});
  const stable={
    coverageSourceCommit:text(coverage?.sourceCommit),
    rowBindings:rowBindings.sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId)),
    requirementBindings:requirementBindings.sort((a,b)=>a.id.localeCompare(b.id)),
    leafBindings:leafBindings.sort((a,b)=>`${a.requirementId}\u0000${a.leafId}`.localeCompare(`${b.requirementId}\u0000${b.leafId}`)),
    checkedRepositoryPaths:[...checkedRepoPaths].sort(),
    trackedPathCount:tracked.size
  };
  return {ok:true,version:EVIDENCE_REFERENCE_INTEGRITY_VERSION,status:'INTERNAL_EVIDENCE_REFERENCES_RESOLVE_ON_EXACT_REPOSITORY_TREE',checkedRepositoryPaths:stable.checkedRepositoryPaths,trackedPathCount:tracked.size,referenceDigest:digest(stable),bindingCounts:{rows:stable.rowBindings.length,requirements:stable.requirementBindings.length,leafAssignments:stable.leafBindings.length},truthBoundary:'REFERENCE_INTEGRITY_PROVES_ONLY_THAT_DECLARED_INTERNAL_REPOSITORY_EVIDENCE_POINTERS RESOLVE AND THEIR EXACT ROW_REQUIREMENT_LEAF_ASSIGNMENTS ARE BOUND TO THE CANONICAL COVERAGE STATE. IT_DOES_NOT_PROVE_EXTERNAL_RUNTIME_CUSTOMER_PAYMENT_ACCEPTANCE_LIFE_OUTCOME_OR_ASI_TRUTH.',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
}
