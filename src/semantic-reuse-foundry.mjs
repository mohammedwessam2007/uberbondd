import crypto from 'node:crypto';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const exact=o=>o&&typeof o==='object'&&!Array.isArray(o);

export function partialEvaluateSemanticProgram(program,stableBindings={}){
  if(!exact(program)||!Array.isArray(program.obligations)||!exact(stableBindings)) throw new Error('typed-program-and-bindings-required');
  const folded=[],residual=[];
  for(const obligation of program.obligations){
    const key=String(obligation?.id||'');
    if(!key) throw new Error('obligation-id-required');
    if(Object.hasOwn(stableBindings,key)) folded.push({id:key,value:stableBindings[key],source:'PINNED_STABLE_BINDING'});
    else residual.push(structuredClone(obligation));
  }
  const specialized={schemaVersion:'uberbond.semantic-specialization.v1',programId:program.programId,sourceProgramHash:hash(program),folded,residual,
    invalidators:structuredClone(program.invalidators??[]),qualityContractHash:program.qualityContractHash};
  return {...specialized,specializationHash:hash(specialized)};
}
export function verifySpecialization({program,specialized,stableBindings}){
  const rebuilt=partialEvaluateSemanticProgram(program,stableBindings);
  return {ok:hash(rebuilt)===hash(specialized),status:hash(rebuilt)===hash(specialized)?'SPECIALIZATION_EXACT':'SPECIALIZATION_REFUSED'};
}

export function buildVerifiedSemanticEGraph({expressions=[],rewriteReceipts=[]}={}){
  const parent=new Map(expressions.map(e=>[e.id,e.id]));
  const byId=new Map(expressions.map(e=>[e.id,e]));
  const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x);}return x;};
  const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
  const rejected=[];
  for(const r of rewriteReceipts){
    if(!byId.has(r.from)||!byId.has(r.to)||r.verifierPassed!==true||r.authority!=='E2_VERIFIED_TRANSFORMATION'||!/^sha256:[0-9a-f]{64}$/.test(String(r.proofHash||''))){rejected.push(r.id??null);continue;}
    union(r.from,r.to);
  }
  const classes={}; for(const e of expressions){const root=find(e.id);(classes[root]??=[]).push(e.id);}
  return {status:'VERIFIED_EGRAPH_BUILT',classes,rejected,mergedPairs:rewriteReceipts.length-rejected.length};
}

export function selectActiveBoundaryCases(cases,{maxCases=16}={}){
  if(!Array.isArray(cases)||!Number.isSafeInteger(maxCases)||maxCases<1) throw new Error('bounded-cases-required');
  const eligible=cases.filter(c=>c&&c.certified!==true&&Number.isFinite(c.informationGain)&&c.informationGain>=0&&Number.isFinite(c.disagreement)&&c.disagreement>=0);
  eligible.sort((a,b)=>(b.informationGain*b.disagreement)-(a.informationGain*a.disagreement)||String(a.id).localeCompare(String(b.id)));
  return {status:'ACTIVE_BOUNDARY_BATCH',selected:eligible.slice(0,maxCases).map(c=>c.id),rejectedCount:cases.length-eligible.length,
    semanticAuthority:'NONE',crownDollarClaim:null};
}

export const SEMANTIC_MICROCODE=Object.freeze({
  LOAD_FACT:{sideEffects:'NONE',deterministic:true},CHECK_FRESHNESS:{sideEffects:'NONE',deterministic:true},
  CHECK_CONSTRAINT:{sideEffects:'NONE',deterministic:true},APPLY_POLICY:{sideEffects:'NONE',deterministic:true},
  INVALIDATE:{sideEffects:'NONE',deterministic:true},EMIT_CLAIM:{sideEffects:'NONE',deterministic:true}
});
export function microcodeVerdict(program=[]){
  const unknown=program.filter(op=>!SEMANTIC_MICROCODE[op]);
  return unknown.length?{ok:false,status:'MICROCODE_PAGE_FAULT',unknown}:{ok:true,status:'MICROCODE_EXACT_SUBSET',semanticAuthority:'BOUNDED_ONLY'};
}
