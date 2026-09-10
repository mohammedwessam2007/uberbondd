import crypto from 'node:crypto';
import { compileSandwichMethod, SANDWICH_TARGET_AUTHORITIES } from './sandwich-method.mjs';

export const SANDWICH_BLUEPRINT_EVOLUTION_VERSION = 'uberbond.sandwich-blueprint-evolution.v1.0.0';
const ZERO_EFFECTS = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=2000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const list=(v,max=512,itemMax=1000)=>{if(!Array.isArray(v)||v.length>max)return null;const out=[];const seen=new Set();for(const raw of v){const s=text(raw,itemMax);if(!s)return null;if(!seen.has(s)){seen.add(s);out.push(s);}}return out;};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasons,extra={})=>({ok:false,status:'SANDWICH_BLUEPRINT_REVISION_REFUSED',version:SANDWICH_BLUEPRINT_EVOLUTION_VERSION,reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});

const AUTHORITY_RANK=Object.freeze({HYPOTHETICAL_ONLY:0,FOUNDER_AUTHORIZED_PRIVATE:1,CANONICAL_REPOSITORY:1});

export function proposeSandwichBlueprintRevision({currentSourceCommit=null,currentTarget=null,newRevision=null,addNodes=[],removeNodes=[],statement=null,discoveryEvidenceRefs=[],independentlyVerified=false}={}){
  const current=compileSandwichMethod({currentSourceCommit,target:currentTarget});
  if(!current.ok)return fail(['valid-current-sandwich-target-required']);
  const revision=text(newRevision,120);
  if(!revision||revision===currentTarget.targetRevision)return fail(['distinct-new-target-revision-required']);
  const evidence=list(discoveryEvidenceRefs,512,1000);
  if(!evidence)return fail(['bounded-discovery-evidence-refs-required']);
  if(!Array.isArray(addNodes)||addNodes.length>1000||!Array.isArray(removeNodes)||removeNodes.length>1000)return fail(['bounded-blueprint-mutations-required']);

  const removeById=new Map();
  for(const raw of removeNodes){
    const id=text(raw?.id,200)?.toLowerCase();
    const reason=text(raw?.reason,80);
    const refs=list(raw?.evidenceRefs||[],128,1000);
    if(!id||reason!=='TARGET_INVALIDATED'||!refs||refs.length===0)return fail(['removal-requires-target-invalidated-independent-evidence']);
    if(removeById.has(id))return fail(['unique-removal-ids-required']);
    removeById.set(id,{id,reason,evidenceRefs:refs});
  }
  if(removeById.size>0&&!independentlyVerified)return fail(['independent-verification-required-for-blueprint-removal']);

  const oldNodes=Array.isArray(currentTarget.nodes)?currentTarget.nodes:[];
  const oldById=new Map(oldNodes.map(node=>[String(node.id||'').toLowerCase(),node]));
  for(const id of removeById.keys())if(!oldById.has(id))return fail(['removal-must-reference-existing-node'],{nodeId:id});

  const retained=oldNodes.filter(node=>!removeById.has(String(node.id||'').toLowerCase()));
  const existingIds=new Set(retained.map(node=>String(node.id||'').toLowerCase()));
  for(const node of addNodes){
    const id=text(node?.id,200)?.toLowerCase();
    if(!id||existingIds.has(id))return fail(['new-blueprint-nodes-require-unique-ids'],{nodeId:id});
    existingIds.add(id);
  }

  const candidate={
    ...currentTarget,
    targetRevision:revision,
    statement:text(statement,4000)||currentTarget.statement,
    nodes:[...retained,...addNodes]
  };
  const compiled=compileSandwichMethod({currentSourceCommit,target:candidate});
  if(!compiled.ok)return fail(['candidate-descendant-target-invalid',...compiled.reasonCodes]);

  const oldAuthority=currentTarget.authority;
  const newAuthority=candidate.authority;
  if(!SANDWICH_TARGET_AUTHORITIES.includes(newAuthority)||AUTHORITY_RANK[newAuthority]>AUTHORITY_RANK[oldAuthority])return fail(['blueprint-revision-may-not-escalate-target-authority']);
  const oldInvariants=list(currentTarget.invariants||[],256,1000)||[];
  const newInvariants=new Set(list(candidate.invariants||[],256,1000)||[]);
  const removedInvariants=oldInvariants.filter(item=>!newInvariants.has(item));
  if(removedInvariants.length)return fail(['blueprint-revision-may-not-silently-remove-invariants'],{removedInvariants});

  const addedIds=addNodes.map(node=>String(node.id).toLowerCase()).sort();
  const removedIds=[...removeById.keys()].sort();
  const proposalCore={
    sourceCommit:current.currentSourceCommit,
    previousTargetDigest:current.upperSlice.targetDigest,
    candidateTargetDigest:compiled.upperSlice.targetDigest,
    previousRevision:current.upperSlice.targetRevision,
    candidateRevision:compiled.upperSlice.targetRevision,
    addedIds,
    removedIds,
    discoveryEvidenceRefs:evidence,
    independentlyVerified:Boolean(independentlyVerified)
  };
  return{
    ok:true,status:'SANDWICH_BLUEPRINT_REVISION_PROPOSED',version:SANDWICH_BLUEPRINT_EVOLUTION_VERSION,
    proposalDigest:digest(proposalCore),...proposalCore,candidateTarget:candidate,candidateSandwich:compiled,
    mutationBoundary:'THIS_IS_A_VERSIONED_DESCENDANT_MODEL_PROPOSAL__IT_DOES_NOT_ADOPT_THE_TARGET_OR_CREATE_FOUNDER_GOALS_AUTHORITY_OR_COMPLETION_PROOF',
    removalBoundary:'UNRESOLVED_TARGET_STRUCTURE_MAY_DISAPPEAR_ONLY_THROUGH_EXPLICIT_TARGET_INVALIDATION_WITH_INDEPENDENT_EVIDENCE',
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS}
  };
}

export function admitSandwichBlueprintRevision({proposal=null,adoptionAuthority=null,evidenceRefs=[],independentlyVerified=false}={}){
  if(!proposal?.ok||proposal.status!=='SANDWICH_BLUEPRINT_REVISION_PROPOSED'||!/^[0-9a-f]{64}$/.test(String(proposal.proposalDigest||'')))return fail(['valid-blueprint-revision-proposal-required']);
  const evidence=list(evidenceRefs,512,1000);
  if(!evidence||evidence.length===0||independentlyVerified!==true)return fail(['independent-evidence-required-for-blueprint-admission']);
  const authority=text(adoptionAuthority,80);
  const targetAuthority=proposal.candidateTarget?.authority;
  if(targetAuthority==='CANONICAL_REPOSITORY'&&authority!=='CANONICAL_REPOSITORY_PROMOTION')return fail(['canonical-repository-promotion-required']);
  if(targetAuthority==='FOUNDER_AUTHORIZED_PRIVATE'&&authority!=='FOUNDER_EXPLICIT_PRIVATE_ADOPTION')return fail(['founder-explicit-private-adoption-required']);
  if(targetAuthority==='HYPOTHETICAL_ONLY'&&authority!=='HYPOTHESIS_REGISTRY')return fail(['hypothesis-registry-admission-required']);
  return{
    ok:true,status:'SANDWICH_BLUEPRINT_REVISION_ADMITTED',version:SANDWICH_BLUEPRINT_EVOLUTION_VERSION,
    proposalDigest:proposal.proposalDigest,candidateTarget:proposal.candidateTarget,evidenceRefs:evidence,
    adoptionAuthority:authority,
    nextRequiredAction:'RECOMPILE_SANDWICH_FROM_EXACT_CURRENT_SOURCE_AND_ADMITTED_TARGET',
    adoptionBoundary:'ADMISSION_CHANGES_ONLY_THE_DECLARED_DESCENDANT_MODEL_UNDER_ITS_EXISTING_AUTHORITY_CLASS__IT_DOES_NOT_VERIFY_ANY_GAP_OR_EXPAND_EFFECT_AUTHORITY',
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS}
  };
}
