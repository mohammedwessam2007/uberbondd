import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const TERMINAL_SEMANTIC_REFUSAL_HANDOFF_VERSION='uberbond.terminal-semantic-refusal-handoff.v1';
const SHA=/^[0-9a-f]{40}$/;
const text=(v,max=1000)=>String(v??'').trim().slice(0,max);
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,500)).filter(Boolean))];
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=(reasons,extra={})=>({ok:false,status:'TERMINAL_SEMANTIC_REFUSAL_HANDOFF_REFUSED',reasonCodes:uniq(reasons),businessEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

function samplesByReasonFamily(invalid=[]){
  const out={};
  for(const item of invalid){
    const id=text(item?.requirementId,300);if(!id)continue;
    for(const raw of item?.reasonCodes||[]){
      const family=String(raw).split(':',1)[0];
      if(!family)continue;
      const bucket=out[family]||(out[family]=[]);
      if(bucket.length<8&&!bucket.includes(id))bucket.push(id);
    }
  }
  return Object.fromEntries(Object.entries(out).sort((a,b)=>a[0].localeCompare(b[0])));
}

export function compileTerminalSemanticRefusalHandoff({truthReceipt={},semanticTribunal={},runs=[],sinkAuthorityReport=null,cutSetReport=null}={}){
  const head=String(truthReceipt?.headSha||'').toLowerCase();
  const semanticHead=String(semanticTribunal?.sourceCommit||'').toLowerCase();
  if(truthReceipt?.ok!==true||!SHA.test(head))return fail(['exact-current-truth-receipt-required']);
  if(!SHA.test(semanticHead)||semanticHead!==head)return fail(['semantic-refusal-must-bind-exact-current-head'],{sourceCommit:head});
  if(semanticTribunal?.ok===true)return fail(['semantic-tribunal-must-be-refused-for-refusal-handoff'],{sourceCommit:head});
  const invalid=Array.isArray(semanticTribunal?.invalidContracts)?semanticTribunal.invalidContracts:[];
  const contracts=new Map((Array.isArray(semanticTribunal?.contracts)?semanticTribunal.contracts:[]).map(c=>[c?.requirementId,c]));
  const finiteOpenRequirements=invalid
    .map(item=>text(item?.requirementId,300))
    .filter(id=>id&&contracts.get(id)?.requirementClass==='FINITE_BEHAVIOR');
  const histogram=semanticTribunal?.diagnostics?.reasonFamilyHistogram&&typeof semanticTribunal.diagnostics.reasonFamilyHistogram==='object'
    ? structuredClone(semanticTribunal.diagnostics.reasonFamilyHistogram):{};
  const semanticDiagnostics={
    invalidContractCount:invalid.length,
    finiteInvalidContractCount:finiteOpenRequirements.length,
    reasonFamilyHistogram:histogram,
    samplesByReasonFamily:samplesByReasonFamily(invalid)
  };
  return{
    ok:false,
    version:TERMINAL_SEMANTIC_REFUSAL_HANDOFF_VERSION,
    status:'TERMINAL_REALIZATION_REFUSED',
    sourceCommit:head,
    finiteEngineeringClosure:'INCOMPLETE',
    reasonCodes:['semantic-requirement-tribunal-refused'],
    finiteOpenRequirements,
    semanticDiagnostics,
    detail:{runs:Array.isArray(runs)?runs.map(r=>({script:r?.script||null,exitCode:r?.exitCode??null,error:r?.error||null})):[]},
    componentReceipts:{
      currentTruth:{ok:true,status:truthReceipt.status||null,headSha:head},
      semanticTribunal:{ok:false,status:semanticTribunal.status||null,invalidContracts:invalid.length},
      effectAuthority:sinkAuthorityReport?{ok:sinkAuthorityReport.ok===true,status:sinkAuthorityReport.status||null}:null,
      cutSets:cutSetReport?{ok:cutSetReport.ok===true,status:cutSetReport.status||null,runtimeProofRequiredCuts:cutSetReport.runtimeProofRequiredCuts||[],externalProviderCuts:cutSetReport.externalProviderCuts||[],ownerCustodyCuts:cutSetReport.ownerCustodyCuts||[]}:null
    },
    truthBoundary:'A CURRENT SEMANTIC REFUSAL IS PRESERVED AS A REPAIR QUEUE, NOT A PASS. ONLY INVALID CONTRACTS ALREADY CLASSIFIED FINITE_BEHAVIOR ENTER finiteOpenRequirements. RUNTIME, OWNER, PROVIDER, CUSTOMER, REVENUE, LIFE-OUTCOME AND ASI EVIDENCE REMAIN SEPARATE.',
    businessEffectAuthority:'NONE',externalEffectLedger:zero()
  };
}
