import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SEMANTIC_REQUIREMENT_TRIBUNAL_VERSION='uberbond.semantic-requirement-tribunal.v1';
export const SEMANTIC_REQUIREMENT_CLASSES=Object.freeze(['FINITE_BEHAVIOR','STRUCTURAL_CONSTITUTION','EXTERNAL','ELAPSED','OPEN_ENDED_FRONTIER']);
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^(?:sha256:)?[0-9a-f]{64}$/;
const TERMINAL_STRUCTURAL=new Set(['STRUCTURAL_NOT_A_BUILD_TARGET','REFERENCE_ONLY_BY_CANON','HISTORICAL_DONOR_PRESERVED','ALIAS_OF_CANONICAL_CONCEPT','SUPERSEDED_WITH_PRESERVED_DONATION']);
const text=(v,max=4000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,1000)).filter(Boolean))].sort();
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
const fail=(reasons,extra={})=>({ok:false,status:'SEMANTIC_REQUIREMENT_TRIBUNAL_REFUSED',reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function inferSemanticRequirementClass(row={},explicit=null){
  if(SEMANTIC_REQUIREMENT_CLASSES.includes(explicit))return explicit;
  if(row.currentState==='ELAPSED_TIME_REQUIRED')return'ELAPSED';
  if(row.currentState==='EXTERNAL_BLOCKED'||row.currentState==='OWNER_BOUNDARY')return'EXTERNAL';
  if(TERMINAL_STRUCTURAL.has(row.currentState))return'STRUCTURAL_CONSTITUTION';
  return'FINITE_BEHAVIOR';
}
function meaningReasons(row,contract){
  const reasons=[];
  const meaning=contract?.meaning||{};
  if(!['SECTION_BODY','STRUCTURED_CANONICAL_VALUE','ALIAS_CANONICAL_HOME','CANONICAL_RULE_BODY'].includes(meaning.sourceClass))reasons.push(`meaning-bearing-source-required:${row.canonicalId}`);
  if(!text(meaning.sourceRef,1000))reasons.push(`canonical-meaning-reference-required:${row.canonicalId}`);
  if(!SHA256.test(String(meaning.bodyDigest||'')))reasons.push(`canonical-meaning-body-digest-required:${row.canonicalId}`);
  if(meaning.headingOnly===true)reasons.push(`heading-only-semantic-credit-prohibited:${row.canonicalId}`);
  return reasons;
}
function finiteReasons(row,contract){
  const reasons=[];
  const id=row.canonicalId;
  const names=new Set((row.literalNames||[]).map(v=>String(v).trim().toLowerCase()).filter(Boolean));
  const observables=uniq(contract.observableBehaviorsOrRefusals);
  if(uniq(contract.inputRefs).length===0)reasons.push(`finite-input-required:${id}`);
  if(observables.length===0||observables.every(v=>names.has(v.toLowerCase())))reasons.push(`behavior-or-refusal-evidence-required:${id}`);
  if(!text(contract.ownerRef,500))reasons.push(`canonical-owner-required:${id}`);
  if(uniq(contract.callerRefs).length===0)reasons.push(`caller-required:${id}`);
  if(uniq(contract.stateRefs).length===0)reasons.push(`state-evidence-required:${id}`);
  const sources=uniq(contract.sourceRefs),tests=uniq(contract.testRefs);
  if(sources.length===0)reasons.push(`source-evidence-required:${id}`);
  if(tests.length===0)reasons.push(`behavior-test-required:${id}`);
  if(uniq(contract.hostileFalsifiers).length===0)reasons.push(`hostile-falsifier-required:${id}`);
  if(!text(contract.recoveryBehavior,2000))reasons.push(`recovery-behavior-or-explicit-na-required:${id}`);
  if(!text(contract.runtimeEvidenceRequirement,2000))reasons.push(`runtime-evidence-requirement-required:${id}`);
  if(!text(contract.externalEvidenceRequirement,2000))reasons.push(`external-evidence-requirement-required:${id}`);
  const rowSources=new Set([...(row.currentEvidence?.sourceModules||[]),...(row.sourceArtifacts||[])].map(String));
  const rowTests=new Set((row.currentEvidence?.testModules||[]).map(String));
  if(sources.some(ref=>!rowSources.has(ref)))reasons.push(`semantic-source-must-bind-canonical-row-evidence:${id}`);
  if(tests.some(ref=>!rowTests.has(ref)))reasons.push(`semantic-test-must-bind-canonical-row-evidence:${id}`);
  if(['VERIFIED_CURRENT','ENFORCED_BY_CODE'].includes(row.currentState)&&tests.length===0)reasons.push(`current-state-cannot-outrun-behavior-test:${id}`);
  return reasons;
}
function structuralReasons(row,contract){
  const reasons=[];const id=row.canonicalId;
  if(!text(contract.structuralRationale,2000))reasons.push(`structural-rationale-required:${id}`);
  if(contract.implementationClaim===true)reasons.push(`structural-row-cannot-create-implementation-claim:${id}`);
  return reasons;
}
function boundaryReasons(row,contract,kind){
  const reasons=[];const id=row.canonicalId;
  if(!text(contract.externalEvidenceRequirement,2000))reasons.push(`${kind.toLowerCase()}-evidence-requirement-required:${id}`);
  if(kind==='ELAPSED'&&!/time|elapsed|observation|longitudinal/i.test(String(contract.externalEvidenceRequirement||'')))reasons.push(`elapsed-requirement-must-name-real-observation:${id}`);
  if(contract.implementationClaim===true)reasons.push(`${kind.toLowerCase()}-boundary-cannot-be-closed-by-source:${id}`);
  return reasons;
}

export function compileSemanticRequirementTribunal({coverage={},contracts=[]}={}){
  const reasons=[];
  const sourceCommit=String(coverage?.sourceCommit||'').toLowerCase();
  const rows=Array.isArray(coverage?.rows)?coverage.rows:[];
  if(coverage?.ok!==true||coverage?.status!=='COVERAGE_MATRIX_COMPILED')reasons.push('exact-canonical-coverage-required');
  if(!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');
  if(rows.length===0)reasons.push('canonical-requirements-required');
  const ids=rows.map(r=>text(r?.canonicalId,300));
  if(ids.some(v=>!v)||new Set(ids).size!==ids.length)reasons.push('unique-canonical-requirement-ids-required');
  const normalizedContracts=(Array.isArray(contracts)?contracts:[]).map(c=>({...c,requirementId:text(c?.requirementId,300)}));
  const contractIds=normalizedContracts.map(c=>c.requirementId).filter(Boolean);
  if(contractIds.length!==normalizedContracts.length||new Set(contractIds).size!==contractIds.length)reasons.push('unique-semantic-contract-ids-required');
  const rowSet=new Set(ids.filter(Boolean)),contractSet=new Set(contractIds);
  const semanticOrphans=[...rowSet].filter(id=>!contractSet.has(id)).sort();
  const floatingContracts=[...contractSet].filter(id=>!rowSet.has(id)).sort();
  if(semanticOrphans.length)reasons.push('semantic-orphan-requirements-remain');
  if(floatingContracts.length)reasons.push('floating-semantic-contracts-remain');
  if(reasons.length&&(!rows.length||!normalizedContracts.length))return fail(reasons,{sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,semanticOrphans,floatingContracts});

  const byContract=new Map(normalizedContracts.map(c=>[c.requirementId,c]));
  const invalid=[];const classifiedCounts=Object.fromEntries(SEMANTIC_REQUIREMENT_CLASSES.map(k=>[k,0]));
  const normalized=[];
  for(const row of rows){
    const contract=byContract.get(row.canonicalId);
    if(!contract)continue;
    const klass=inferSemanticRequirementClass(row,contract.requirementClass);
    const local=[...meaningReasons(row,contract)];
    if(klass==='FINITE_BEHAVIOR')local.push(...finiteReasons(row,contract));
    else if(klass==='STRUCTURAL_CONSTITUTION')local.push(...structuralReasons(row,contract));
    else if(klass==='EXTERNAL'||klass==='ELAPSED')local.push(...boundaryReasons(row,contract,klass));
    else if(klass==='OPEN_ENDED_FRONTIER'&&!text(contract.frontierDefinition,2000))local.push(`open-ended-frontier-definition-required:${row.canonicalId}`);
    if(local.length)invalid.push({requirementId:row.canonicalId,reasonCodes:[...new Set(local)]});
    classifiedCounts[klass]++;
    normalized.push({requirementId:row.canonicalId,requirementClass:klass,currentState:row.currentState,meaning:contract.meaning,ownerRef:contract.ownerRef||row.owningLane||null,sourceRefs:uniq(contract.sourceRefs),testRefs:uniq(contract.testRefs),callerRefs:uniq(contract.callerRefs),runtimeEvidenceRequirement:text(contract.runtimeEvidenceRequirement,2000),externalEvidenceRequirement:text(contract.externalEvidenceRequirement,2000)});
  }
  if(invalid.length)reasons.push('semantic-contracts-fail-behavior-tribunal');
  if(semanticOrphans.length)reasons.push('semantic-orphan-requirements-remain');
  if(floatingContracts.length)reasons.push('floating-semantic-contracts-remain');
  if(reasons.length)return fail(reasons,{sourceCommit,semanticOrphans,floatingContracts,invalidContracts:invalid,counts:{requirements:rows.length,contracts:normalizedContracts.length,...classifiedCounts}});
  const receipt={version:SEMANTIC_REQUIREMENT_TRIBUNAL_VERSION,sourceCommit,requirementIds:[...rowSet].sort(),contractDigests:normalizedContracts.map(c=>digest(c)).sort(),classifiedCounts};
  return{ok:true,status:'SEMANTIC_ZERO_ORPHAN_REQUIREMENTS_VERIFIED',sourceCommit,semanticOrphans:[],floatingContracts:[],invalidContracts:[],counts:{requirements:rows.length,contracts:normalizedContracts.length,...classifiedCounts},requirements:normalized,receipt,receiptDigest:digest(receipt),truthBoundary:'SEMANTIC CLOSURE REQUIRES MEANING-BEARING CANON PLUS BEHAVIOR OR REFUSAL, CALLER, STATE, TEST, HOSTILE FALSIFIER, RECOVERY AND EVIDENCE BOUNDARIES. A HEADING, FILE NAME OR GENERIC VERIFICATION LEAF ALONE EARNS ZERO CREDIT. THIS RECEIPT DOES NOT CREATE RUNTIME OR EXTERNAL EVIDENCE.',businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS)};
}
