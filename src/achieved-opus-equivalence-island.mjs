import crypto from 'node:crypto';

export const ACHIEVED_EQUIVALENCE_VERSION='uberbond.achieved-opus-equivalence-island.v1';
export const DEFAULT_EQUIVALENCE_SOURCES=Object.freeze([
  'open router/79_CURRENT_RUNTIME_FRONTIER_2026-10-07.json',
  'config/absolute-frontier-quality-lock.json',
  'config/infinite-opus-first-real-workload.json',
  'config/infinite-opus-live-market-candidates.json'
]);

const digest=value=>'sha256:'+crypto.createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
};
const valueDigest=value=>digest(JSON.stringify(canonical(value)));
const encodePointerPart=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const decodePointerPart=value=>String(value).replaceAll('~1','/').replaceAll('~0','~');

export function flattenExactLeaves(value,pointer=''){
  if(Array.isArray(value)){
    return value.flatMap((item,index)=>flattenExactLeaves(item,pointer+'/'+index));
  }
  if(value&&typeof value==='object'){
    return Object.entries(value).flatMap(([key,item])=>flattenExactLeaves(item,pointer+'/'+encodePointerPart(key)));
  }
  return [{pointer:pointer||'/',value}];
}

export function resolveJsonPointer(document,pointer){
  if(pointer==='/')return document;
  if(typeof pointer!=='string'||!pointer.startsWith('/'))throw new Error('absolute-json-pointer-required');
  return pointer.slice(1).split('/').reduce((node,part)=>{
    const key=decodePointerPart(part);
    if(node===null||node===undefined||!(key in Object(node)))throw new Error('json-pointer-not-found:'+pointer);
    return node[key];
  },document);
}

export function buildSourceGroundedObligations(sourceDocuments={}){
  const paths=Object.keys(sourceDocuments).sort();
  if(!paths.length)throw new Error('nonempty-source-documents-required');
  const obligations=[];
  const sourceDigests={};
  for(const path of paths){
    const document=sourceDocuments[path];
    if(document===undefined)throw new Error('defined-source-document-required');
    sourceDigests[path]=digest(JSON.stringify(canonical(document)));
    for(const leaf of flattenExactLeaves(document)){
      obligations.push(Object.freeze({
        id:digest(path+'\n'+leaf.pointer),
        sourcePath:path,
        sourceDigest:sourceDigests[path],
        pointer:leaf.pointer,
        expectedValueDigest:valueDigest(leaf.value)
      }));
    }
  }
  if(!obligations.length)throw new Error('nonempty-exact-obligations-required');
  return {sourceDigests,obligations};
}

export function evaluateSourceGroundedEquivalence({
  sourceDocuments={},
  resolve=(document,pointer)=>resolveJsonPointer(document,pointer),
  referenceModel='anthropic/claude-opus-5.5',
  inputUsdPerMillion=4,
  outputUsdPerMillion=20
}={}){
  if(!(Number(inputUsdPerMillion)>0)||!(Number(outputUsdPerMillion)>0))throw new Error('positive-frontier-tariff-required');
  const compiled=buildSourceGroundedObligations(sourceDocuments);
  const failures=[];
  for(const obligation of compiled.obligations){
    const document=sourceDocuments[obligation.sourcePath];
    let observed;
    try{observed=resolve(document,obligation.pointer);}
    catch(error){
      failures.push({id:obligation.id,reason:'RESOLUTION_FAILED',detail:String(error?.message||error).slice(0,160)});
      continue;
    }
    const observedDigest=valueDigest(observed);
    if(observedDigest!==obligation.expectedValueDigest)failures.push({
      id:obligation.id,reason:'EXACT_VALUE_MISMATCH',expectedValueDigest:obligation.expectedValueDigest,observedValueDigest:observedDigest
    });
  }
  const ok=failures.length===0;
  return {
    schemaVersion:ACHIEVED_EQUIVALENCE_VERSION,
    ok,
    status:ok?'ACHIEVED_ZERO_API_COST_OPUS_EQUIVALENCE_ISLAND':'EQUIVALENCE_ISLAND_REGRESSION_DETECTED',
    taskClass:'SOURCE_GROUNDED_EXACT_JSON_RETRIEVAL',
    equivalenceClass:'E1',
    proofMethod:'SOURCE_SNAPSHOT_PLUS_INDEPENDENT_JSON_POINTER_RESOLUTION_PLUS_EXACT_VALUE_HASH_EQUALITY',
    sourceCount:Object.keys(compiled.sourceDigests).length,
    exactObligationCount:compiled.obligations.length,
    passedObligationCount:compiled.obligations.length-failures.length,
    failedObligationCount:failures.length,
    failures:failures.slice(0,20),
    sourceDigests:compiled.sourceDigests,
    referenceModel,
    referenceTariff:{inputUsdPerMillion:Number(inputUsdPerMillion),outputUsdPerMillion:Number(outputUsdPerMillion)},
    referenceCallClass:'FRESH_DIRECT_FRONTIER_CALL_WOULD_HAVE_POSITIVE_MODEL_API_COST',
    directReferenceDollarAmount:'NOT_ASSERTED_WITHOUT_OBSERVED_OR_TOKENIZER_BOUND_USAGE',
    candidateProviderCallsPerformed:0,
    candidateModelInferenceCallsPerformed:0,
    candidateExternalApiSpendUsd:0,
    achievedApiPriceReductionVsFreshDirectFrontierPercent:ok?100:null,
    semanticAuthority:ok?'E1_DETERMINISTIC_DERIVATION':'NONE',
    crownSuppressionAuthority:ok?'ONLY_FOR_THIS_EXACT_SOURCE_GROUNDED_TASK_CLASS':'NONE',
    generalOpenEndedOpusEquivalenceClaim:false,
    jevRole:'JEV_OR_ROUTER_MAY_DISPATCH_THIS_CERTIFIED_CLASS_TO_EXACT_EXECUTION; JEV ITSELF IS NOT CLAIMED AS LIVE SEMANTIC AUTHORITY',
    deoptimizationLaw:'ANY_SOURCE_DIGEST_CHANGE_POINTER_FAILURE_SCHEMA_DRIFT_OR_NONEXACT_SEMANTIC_REQUEST_PAGES_UPWARD',
    truthBoundary:'ACHIEVED means exact source-grounded retrieval obligations were executed without model inference and matched the admitted source snapshot exactly. This does not prove general open-ended Opus equivalence, a dollar compression factor, or live JEV authority.'
  };
}
