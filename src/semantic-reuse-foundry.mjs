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


export function compileVerifiedSemanticCanonicalizer({
  expressions=[],rewriteReceipts=[],rewriteTrustPins={},
  qualityContractHash,crownRevision,sourceDependencies={},invalidators={},now=Date.now()
}={}){
  const fail=reason=>({ok:false,status:'SEMANTIC_CANONICALIZER_REFUSED',reasons:[reason],semanticAuthority:'NONE'});
  try{
    if(!Array.isArray(expressions)||!expressions.length||expressions.length>4096||!exact(rewriteTrustPins))throw new Error('bounded-expressions-and-trust-pins-required');
    if(typeof qualityContractHash!=='string'||!/^sha256:[0-9a-f]{64}$/.test(qualityContractHash)||typeof crownRevision!=='string'||!crownRevision)throw new Error('quality-and-crown-binding-required');
    if(!exact(sourceDependencies)||!exact(invalidators)||Object.values(invalidators).some(v=>v!==false))throw new Error('current-dependency-and-invalidator-state-required');
    const byId=new Map(),byValue=new Map();
    for(const expression of expressions){
      if(!exact(expression)||typeof expression.id!=='string'||!expression.id||byId.has(expression.id)||!Object.hasOwn(expression,'value'))throw new Error('unique-valued-expression-required');
      const valueKey=JSON.stringify(expression.value);
      if(byValue.has(valueKey)&&byValue.get(valueKey)!==expression.id)throw new Error('duplicate-exact-value-expression');
      byId.set(expression.id,structuredClone(expression));byValue.set(valueKey,expression.id);
    }
    const parent=new Map([...byId.keys()].map(id=>[id,id]));
    const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x);}return x;};
    const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
    for(const receipt of rewriteReceipts){
      if(!exact(receipt)||typeof receipt.id!=='string'||!receipt.id||!byId.has(receipt.from)||!byId.has(receipt.to))throw new Error('known-rewrite-endpoints-required');
      const pin=rewriteTrustPins[receipt.id];
      if(pin!==hash(receipt))throw new Error('trusted-rewrite-receipt-required');
      if(receipt.verifierPassed!==true||receipt.authority!=='E2_VERIFIED_TRANSFORMATION'||!/^sha256:[0-9a-f]{64}$/.test(String(receipt.proofHash||'')))throw new Error('e2-verified-rewrite-required');
      if(receipt.qualityContractHash!==qualityContractHash||receipt.crownRevision!==crownRevision)throw new Error('rewrite-quality-or-crown-drift');
      if(JSON.stringify(receipt.sourceDependencies??{})!==JSON.stringify(sourceDependencies)||JSON.stringify(receipt.invalidators??{})!==JSON.stringify(invalidators))throw new Error('rewrite-dependency-or-invalidator-drift');
      if(typeof receipt.evidenceRef!=='string'||!receipt.evidenceRef)throw new Error('rewrite-evidence-required');
      const expiry=Date.parse(receipt.expiresAt);if(!Number.isFinite(expiry)||expiry<=now)throw new Error('rewrite-expired');
      union(receipt.from,receipt.to);
    }
    const classes=new Map();
    for(const id of byId.keys()){const root=find(id);const members=classes.get(root)??[];members.push(id);classes.set(root,members);}
    const canonicalById=new Map();
    for(const members of classes.values()){
      members.sort();const canonical=members[0];
      for(const id of members)canonicalById.set(id,canonical);
    }
    const canonicalizerHash=hash({
      expressions:[...byId.values()],rewriteReceipts,qualityContractHash,crownRevision,sourceDependencies,invalidators
    });
    return {
      ok:true,status:'VERIFIED_SEMANTIC_CANONICALIZER_COMPILED',canonicalizerHash,
      semanticAuthority:'E2_VERIFIED_TRANSFORMATION_ONLY',
      canonicalize(value,{currentContext}={}){
        if(!exact(currentContext)||currentContext.crownRevision!==crownRevision||
           JSON.stringify(currentContext.sourceHashes??{})!==JSON.stringify(sourceDependencies)||
           JSON.stringify(currentContext.invalidators??{})!==JSON.stringify(invalidators)||
           Object.values(currentContext.invalidators??{}).some(v=>v!==false)){
          return fail('canonicalizer-current-context-drift');
        }
        const id=byValue.get(JSON.stringify(value));
        if(!id)return {ok:true,status:'NO_VERIFIED_REWRITE_IDENTITY',value:structuredClone(value),transformed:false,canonicalizerHash};
        const canonicalId=canonicalById.get(id),canonicalValue=byId.get(canonicalId).value;
        return {ok:true,status:id===canonicalId?'ALREADY_CANONICAL':'E2_CANONICALIZED',
          value:structuredClone(canonicalValue),transformed:id!==canonicalId,fromExpressionId:id,toExpressionId:canonicalId,
          canonicalizerHash,semanticAuthority:'E2_VERIFIED_TRANSFORMATION_ONLY'};
      }
    };
  }catch(error){return fail(String(error?.message||error));}
}
