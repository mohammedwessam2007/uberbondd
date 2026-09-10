import crypto from 'node:crypto';
import { compileSandwichMethod } from './sandwich-method.mjs';

export const SANDWICH_EVIDENCE_BINDING_VERSION = 'uberbond.sandwich-evidence-binding.v1.0.0';
export const SANDWICH_EVIDENCE_KINDS = Object.freeze([
  'SOURCE_TEST',
  'CANONICAL_TRIBUNAL',
  'RESEARCH_EVIDENCE',
  'FOUNDER_ATTESTATION',
  'PHYSICAL_RUNTIME',
  'PROVIDER',
  'COMMERCIAL',
  'ELAPSED_REALITY'
]);

const ZERO_EFFECTS=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const SHA40=/^[0-9a-f]{40}$/;const SHA256=/^[0-9a-f]{64}$/;
const text=(v,max=2000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const iso=v=>{const d=new Date(String(v??''));return Number.isFinite(d.getTime())?d.toISOString():null;};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasons,extra={})=>({ok:false,status:'SANDWICH_EVIDENCE_BINDING_REFUSED',version:SANDWICH_EVIDENCE_BINDING_VERSION,reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});

const ALLOWED_BY_FOLD_CLASS=Object.freeze({
  INTERNAL_SOURCE:new Set(['SOURCE_TEST','CANONICAL_TRIBUNAL']),
  INTERNAL_RESEARCH:new Set(['RESEARCH_EVIDENCE','CANONICAL_TRIBUNAL']),
  FOUNDER_CHOICE:new Set(['FOUNDER_ATTESTATION']),
  OWNED_PHYSICAL_HOST:new Set(['PHYSICAL_RUNTIME']),
  EXTERNAL_PROVIDER:new Set(['PROVIDER']),
  EXTERNAL_COMMERCIAL:new Set(['COMMERCIAL']),
  ELAPSED_REALITY:new Set(['ELAPSED_REALITY']),
  UNKNOWN:new Set()
});

function normalizeRegistry(registry,currentSourceCommit){
  if(!Array.isArray(registry)||registry.length>20_000)return{ok:false,reasonCodes:['bounded-evidence-registry-required']};
  const map=new Map();
  for(const raw of registry){
    const id=text(raw?.id,1000);const kind=text(raw?.kind,80);const observedAt=iso(raw?.observedAt);const evidenceDigest=text(raw?.evidenceDigest,80)?.toLowerCase();
    const sourceCommit=text(raw?.sourceCommit,80)?.toLowerCase()||null;
    if(!id||!SANDWICH_EVIDENCE_KINDS.includes(kind)||!observedAt||!SHA256.test(evidenceDigest||'')||raw?.independentlyVerified!==true||raw?.revoked===true||map.has(id))return{ok:false,reasonCodes:['valid-unique-live-independent-evidence-records-required']};
    if(['SOURCE_TEST','CANONICAL_TRIBUNAL'].includes(kind)&&(!sourceCommit||!SHA40.test(sourceCommit)||sourceCommit!==currentSourceCommit))return{ok:false,reasonCodes:['source-evidence-must-bind-exact-current-commit'],evidenceId:id};
    map.set(id,{id,kind,observedAt,evidenceDigest,sourceCommit,independentlyVerified:true,revoked:false});
  }
  return{ok:true,map};
}

export function compileEvidenceBoundSandwich({currentSourceCommit=null,target=null,evidenceRegistry=[]}={}){
  const head=text(currentSourceCommit,80)?.toLowerCase();
  if(!head||!SHA40.test(head))return fail(['valid-exact-current-source-commit-required']);
  const structural=compileSandwichMethod({currentSourceCommit:head,target});
  if(!structural.ok)return fail(['structural-sandwich-required',...(structural.reasonCodes||[])]);
  const registry=normalizeRegistry(evidenceRegistry,head);
  if(!registry.ok)return fail(registry.reasonCodes,registry.evidenceId?{evidenceId:registry.evidenceId}:{});

  const bindings=[];const reasons=[];
  for(const node of (Array.isArray(target?.nodes)?target.nodes:[])){
    if(node?.state!=='VERIFIED_CURRENT')continue;
    const refs=Array.isArray(node.evidenceRefs)?node.evidenceRefs.map(String):[];
    if(refs.length===0){reasons.push(`verified-node-has-no-evidence:${node.id}`);continue;}
    const admitted=[];
    for(const ref of refs){
      const record=registry.map.get(ref);
      if(!record){reasons.push(`evidence-ref-not-independently-bound:${node.id}:${ref}`);continue;}
      const allowed=ALLOWED_BY_FOLD_CLASS[node.foldClass]||new Set();
      if(!allowed.has(record.kind)){reasons.push(`evidence-kind-does-not-prove-fold-class:${node.id}:${record.kind}`);continue;}
      admitted.push(record);
    }
    if(admitted.length===0)reasons.push(`verified-node-lacks-admissible-evidence:${node.id}`);
    else bindings.push({nodeId:String(node.id).toLowerCase(),evidence:admitted});
  }
  if(reasons.length)return fail(reasons,{verifiedNodeCount:structural.lowerSlice.verifiedNodes.length,boundVerifiedNodeCount:bindings.length});

  const core={sourceCommit:head,targetDigest:structural.upperSlice.targetDigest,bindings:bindings.map(row=>({nodeId:row.nodeId,evidence:row.evidence.map(e=>({id:e.id,kind:e.kind,evidenceDigest:e.evidenceDigest,sourceCommit:e.sourceCommit}))}))};
  return{
    ok:true,status:'SANDWICH_EVIDENCE_BOUND',version:SANDWICH_EVIDENCE_BINDING_VERSION,
    sandwich:structural,evidenceBindingDigest:digest(core),bindings,
    authorityBoundary:'ONLY_EVIDENCE_BOUND_SANDWICHES_MAY_COMPILE_AUTHORITATIVE_INTERNAL_FOLD_TASKS__STRUCTURAL_SANDWICHES_REMAIN_PLANNING_OBJECTS',
    truthBoundary:'EVIDENCE_BINDING_PROVES_ONLY_THAT_DECLARED_VERIFIED_NODES_HAVE_ADMISSIBLE_INDEPENDENT_EVIDENCE_OF_THE_CORRECT_CLASS__IT_DOES_NOT_PROVE_UNDECLARED_GLOBAL_COMPLETENESS',
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS}
  };
}
