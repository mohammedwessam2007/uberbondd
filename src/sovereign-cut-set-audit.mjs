import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_CUT_SET_AUDIT_VERSION='uberbond.sovereign-cut-set-audit.v1';
export const SOVEREIGN_CUT_IDS=Object.freeze([
  'SOURCE_REPOSITORY_HOST','DATABASE_STATE','WEB_RUNTIME_HOST','WORKER_SCHEDULER_PROCESS',
  'MODEL_PROVIDER','MESSAGING_PROVIDER','PAYMENT_PROVIDER','DEPLOYMENT_PROVIDER',
  'CREDENTIAL_CUSTODY','SOVEREIGN_IDENTITY'
]);
export const CUT_CLASSES=Object.freeze(['INTERNAL_ENGINEERING','RUNTIME_PROOF','EXTERNAL_PROVIDER','OWNER_CUSTODY']);
const text=(v,max=1200)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,1200)).filter(Boolean))].sort();
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
const fail=(reasons,extra={})=>({ok:false,status:'SOVEREIGN_CUT_SET_AUDIT_REFUSED',reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

function sourceMarkerReasons(sourceBodies,markers=[]){
  const reasons=[];
  for(const marker of Array.isArray(markers)?markers:[]){
    const path=text(marker?.path,600),body=sourceBodies?.[path];
    if(!path||typeof body!=='string'){reasons.push(`source-required:${path||'unknown'}`);continue;}
    for(const token of uniq(marker?.mustContain))if(!body.includes(token))reasons.push(`source-marker-missing:${path}:${token}`);
    for(const token of uniq(marker?.mustNotContain))if(body.includes(token))reasons.push(`prohibited-source-marker:${path}:${token}`);
  }
  return reasons;
}

export function compileSovereignCutSetAudit({cuts=[],sourceBodies={}}={}){
  const reasons=[];const rows=Array.isArray(cuts)?cuts:[];
  const ids=rows.map(r=>text(r?.cutId,120)).filter(Boolean);
  if(rows.length!==SOVEREIGN_CUT_IDS.length)reasons.push('exact-sovereign-cut-denominator-required');
  if(new Set(ids).size!==ids.length)reasons.push('unique-cut-ids-required');
  for(const required of SOVEREIGN_CUT_IDS)if(!ids.includes(required))reasons.push(`cut-missing:${required}`);
  for(const id of ids)if(!SOVEREIGN_CUT_IDS.includes(id))reasons.push(`unknown-cut:${id}`);

  const normalized=[];
  for(const raw of rows){
    const cutId=text(raw?.cutId,120);if(!cutId)continue;
    const local=[];const cutClass=text(raw?.cutClass,80);
    if(!CUT_CLASSES.includes(cutClass))local.push('recognized-cut-class-required');
    const mechanisms=uniq(raw?.mitigationRefs),tests=uniq(raw?.testRefs),recovery=uniq(raw?.recoveryRefs),alternatives=uniq(raw?.alternativeRefs);
    if(!text(raw?.failureMode,1600))local.push('failure-mode-required');
    if(!text(raw?.truthBoundary,1800))local.push('truth-boundary-required');
    if(!text(raw?.resumeTrigger,1200))local.push('resume-trigger-required');
    if(cutClass==='INTERNAL_ENGINEERING'){
      if(mechanisms.length===0)local.push('internal-cut-mitigation-required');
      if(tests.length===0)local.push('internal-cut-test-required');
      if(recovery.length===0)local.push('internal-cut-recovery-or-refusal-required');
      if(alternatives.length===0)local.push('internal-cut-alternative-required');
      if(raw?.sourceMechanismComplete!==true)local.push('internal-cut-source-mechanism-incomplete');
    }
    if(cutClass==='RUNTIME_PROOF'){
      if(mechanisms.length===0||tests.length===0)local.push('runtime-proof-source-and-test-mechanism-required');
      if(!text(raw?.runtimeProofRequirement,1600))local.push('runtime-proof-requirement-required');
      if(raw?.runtimeObserved===true&&!text(raw?.runtimeEvidenceRef,1200))local.push('runtime-observation-evidence-reference-required');
    }
    if(cutClass==='EXTERNAL_PROVIDER'){
      if(!text(raw?.externalEvidenceRequirement,1600))local.push('external-provider-evidence-requirement-required');
      if(raw?.providerIndependenceClaim===true&&alternatives.length===0)local.push('provider-independence-needs-named-alternative');
      if(raw?.externalObserved===true&&!text(raw?.externalEvidenceRef,1200))local.push('external-observation-evidence-reference-required');
    }
    if(cutClass==='OWNER_CUSTODY'){
      if(!text(raw?.ownerActionBoundary,1600))local.push('owner-custody-boundary-required');
      if(raw?.ownerEnrollmentObserved===true&&!text(raw?.ownerEvidenceRef,1200))local.push('owner-enrollment-evidence-reference-required');
    }
    local.push(...sourceMarkerReasons(sourceBodies,raw?.sourceMarkers));
    normalized.push({cutId,cutClass,failureMode:raw?.failureMode||null,mitigationRefs:mechanisms,testRefs:tests,recoveryRefs:recovery,alternativeRefs:alternatives,sourceMechanismComplete:raw?.sourceMechanismComplete===true,runtimeObserved:raw?.runtimeObserved===true,externalObserved:raw?.externalObserved===true,ownerEnrollmentObserved:raw?.ownerEnrollmentObserved===true,truthBoundary:raw?.truthBoundary||null,resumeTrigger:raw?.resumeTrigger||null,reasonCodes:[...new Set(local)]});
    if(local.length)reasons.push(`cut-audit-gap:${cutId}`);
  }

  const unresolvedInternalCuts=normalized.filter(r=>r.cutClass==='INTERNAL_ENGINEERING'&&r.reasonCodes.length).map(r=>r.cutId);
  const runtimeProofRequiredCuts=normalized.filter(r=>r.cutClass==='RUNTIME_PROOF'&&!r.runtimeObserved).map(r=>r.cutId);
  const externalProviderCuts=normalized.filter(r=>r.cutClass==='EXTERNAL_PROVIDER'&&!r.externalObserved).map(r=>r.cutId);
  const ownerCustodyCuts=normalized.filter(r=>r.cutClass==='OWNER_CUSTODY'&&!r.ownerEnrollmentObserved).map(r=>r.cutId);
  if(reasons.length)return fail(reasons,{cuts:normalized,unresolvedInternalCuts,runtimeProofRequiredCuts,externalProviderCuts,ownerCustodyCuts,counts:{cuts:rows.length,internal:normalized.filter(r=>r.cutClass==='INTERNAL_ENGINEERING').length,runtime:normalized.filter(r=>r.cutClass==='RUNTIME_PROOF').length,external:normalized.filter(r=>r.cutClass==='EXTERNAL_PROVIDER').length,owner:normalized.filter(r=>r.cutClass==='OWNER_CUSTODY').length}});
  const receipt={version:SOVEREIGN_CUT_SET_AUDIT_VERSION,cutIds:[...SOVEREIGN_CUT_IDS],cutDigests:rows.map(digest).sort(),sourceDigests:Object.fromEntries(Object.entries(sourceBodies).sort().map(([path,body])=>[path,digest(body)]))};
  return{ok:true,status:'SOVEREIGN_CUT_SET_AUDIT_CURRENT',cuts:normalized,unresolvedInternalCuts:[],runtimeProofRequiredCuts,externalProviderCuts,ownerCustodyCuts,counts:{cuts:rows.length,internal:normalized.filter(r=>r.cutClass==='INTERNAL_ENGINEERING').length,runtime:normalized.filter(r=>r.cutClass==='RUNTIME_PROOF').length,external:normalized.filter(r=>r.cutClass==='EXTERNAL_PROVIDER').length,owner:normalized.filter(r=>r.cutClass==='OWNER_CUSTODY').length},receipt,receiptDigest:digest(receipt),truthBoundary:'A current cut-set audit can prove that every declared internally solvable single-point failure has source/test/recovery alternatives. It deliberately does not convert unobserved host failover, provider substitution, credential custody or owner identity recovery into source completion.',businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS)};
}
