import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { SANDWICH_EVIDENCE_KINDS } from './sandwich-evidence-binding.mjs';
import { verifyCoverageStateEvidenceIntegrity } from './coverage-state-evidence-integrity.mjs';

export const MOONSHOT_TRUTH_EVIDENCE_SUBSTRATE_VERSION='uberbond.moonshot-truth-evidence-substrate.v1';

const EXTERNAL_OBSERVED=new Set(['PHYSICAL_RUNTIME','PROVIDER','COMMERCIAL','ELAPSED_REALITY']);
const SOURCE_BOUND=new Set(['SOURCE_TEST','CANONICAL_TRIBUNAL']);
const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const text=(v,max=2000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const fail=(status,reasons,extra={})=>envelope({ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra});

export function compileMoonshotEvidenceRecord({
  id,kind,scope,observedAt,
  independentlyVerified=false,
  synthetic=false,
  revoked=false,
  sourceCommit=null,
  evidenceRef=null
}={}){
  const eid=text(id,300),k=String(kind||'').toUpperCase(),s=text(scope,1000),at=text(observedAt,100);
  if(!eid||!SANDWICH_EVIDENCE_KINDS.includes(k)||!s||!at){
    return fail('MOONSHOT_EVIDENCE_RECORD_INVALID',['id-kind-scope-and-observed-at-required']);
  }
  return envelope({
    ok:true,status:'MOONSHOT_EVIDENCE_RECORD_COMPILED',
    record:{
      id:eid,kind:k,scope:s,observedAt:at,
      independentlyVerified:Boolean(independentlyVerified),
      synthetic:Boolean(synthetic),
      revoked:Boolean(revoked),
      sourceCommit:text(sourceCommit,80),
      evidenceRef:text(evidenceRef,1200)
    },
    truthBoundary:'AN_EVIDENCE_RECORD_PRESERVES_SCOPE_AND_PROVENANCE__IT_DOES_NOT_EXPAND_WHAT_WAS_OBSERVED'
  });
}

export function evaluateMoonshotEvidence({
  claimId,claim,
  currentSourceCommit=null,
  records=[],
  requiredKinds=[]
}={}){
  const cid=text(claimId,160),statement=text(claim,4000),head=text(currentSourceCommit,80);
  if(!cid||!statement||!Array.isArray(records)||records.length>10000||!Array.isArray(requiredKinds)){
    return fail('MOONSHOT_EVIDENCE_SET_INVALID',['claim-records-and-required-kinds-required']);
  }
  const live=[];
  const rejected=[];
  for(const raw of records){
    const compiled=raw?.status==='MOONSHOT_EVIDENCE_RECORD_COMPILED'?raw:compileMoonshotEvidenceRecord(raw);
    if(!compiled.ok){rejected.push({id:raw?.id||null,reason:'invalid-record'});continue;}
    const row=compiled.record;
    if(row.revoked){rejected.push({id:row.id,reason:'revoked'});continue;}
    if(!row.independentlyVerified){rejected.push({id:row.id,reason:'not-independently-verified'});continue;}
    if(SOURCE_BOUND.has(row.kind)&&(!head||row.sourceCommit!==head)){
      rejected.push({id:row.id,reason:'source-commit-mismatch'});continue;
    }
    live.push(row);
  }
  const kinds=new Set(live.map(r=>r.kind));
  const missingKinds=requiredKinds.map(k=>String(k).toUpperCase()).filter(k=>!kinds.has(k));
  const externalObserved=live.filter(r=>EXTERNAL_OBSERVED.has(r.kind)&&r.synthetic!==true);
  const research=live.filter(r=>r.kind==='RESEARCH_EVIDENCE');
  const internal=live.filter(r=>SOURCE_BOUND.has(r.kind));
  const evidenceClass=externalObserved.length
    ?(internal.length||research.length?'MIXED_WITH_EXTERNAL_OBSERVATION':'EXTERNAL_OBSERVED')
    :research.length
      ?(internal.length?'INTERNAL_SOURCE_AND_RESEARCH':'INTERNAL_RESEARCH')
      :internal.length?'INTERNAL_SOURCE':'NO_ADMITTED_EVIDENCE';

  return envelope({
    ok:true,
    status:missingKinds.length?'EVIDENCE_REQUIREMENTS_UNMET':'EVIDENCE_SET_BOUND',
    claimId:cid,claim:statement,
    evidenceClass,
    admittedRecordIds:live.map(r=>r.id),
    rejected,
    presentKinds:[...kinds].sort(),
    missingKinds,
    externalObservedRecordIds:externalObserved.map(r=>r.id),
    externalRealityObserved:externalObserved.length>0,
    promotionAuthority:'NONE',
    law:'EVIDENCE_SCOPE_NEVER_EXPANDS_DURING_BINDING__REVOKED_STALE_UNVERIFIED_OR_WRONG_COMMIT_EVIDENCE_CANNOT_PROMOTE_A_CLAIM',
    truthBoundary:'INTERNAL_SOURCE_OR_RESEARCH_EVIDENCE_IS_NOT_PHYSICAL_COMMERCIAL_PROVIDER_OR_ELAPSED_REALITY_EVIDENCE'
  });
}

export function verifyMoonshotCoverageState(coverage={}){
  const result=verifyCoverageStateEvidenceIntegrity(coverage);
  return envelope({
    ...result,
    promotionAuthority:'NONE',
    truthBoundary:'COVERAGE_STATE_INTEGRITY_CAN_REFUSE_OVERCLAIM__IT_CANNOT_CREATE_MISSING_EVIDENCE'
  });
}
