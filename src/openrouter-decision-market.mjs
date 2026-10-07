import { semanticHash } from './semantic-closure-kernel.mjs';

export const OPENROUTER_JEV_DECISION_MODEL='typesafe/jev-1.13';
export const OPENROUTER_JEV_DECISION_PAGE='https://openrouter.ai/typesafe/jev-1.13/api';
export const OPENROUTER_DECISIONS_ENDPOINT='https://openrouter.ai/api/alpha/decisions';
export const OPENROUTER_JEV_INPUT_USD_PER_MILLION=0.042;
export const OPENROUTER_JEV_OUTPUT_USD_PER_MILLION=0;
export const OPENROUTER_JEV_CONTEXT_TOKENS=32000;

const compact=value=>String(value??'').replace(/\s+/g,' ');
const has=(text,re)=>re.test(text);

export function compileOpenRouterJevDecisionEvidence(raw,{
  verifiedAt,
  ttlMs=10*60*1000,
  sourceRef=OPENROUTER_JEV_DECISION_PAGE
}={}){
  if(typeof raw!=='string'||!raw.length||Buffer.byteLength(raw)>5_000_000)
    throw new Error('bounded-openrouter-jev-public-page-required');
  const at=Date.parse(verifiedAt);
  if(!Number.isFinite(at)||!Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>86_400_000)
    throw new Error('fresh-openrouter-jev-observation-time-required');
  const text=compact(raw);
  const reasons=[];
  if(!text.includes(OPENROUTER_JEV_DECISION_MODEL))reasons.push('exact-jev-model-id-not-observed');
  const inputPriceObserved=
    has(text,/0\.000000042/)||
    has(text,/\$\s*0\.042\s*(?:\/|per)\s*(?:1M|M|million)/i)||
    has(text,/0\.042\s*\/\s*\$?\s*0(?:\.0+)?\s*(?:per\s*1M)?/i);
  if(!inputPriceObserved)reasons.push('jev-input-price-not-observed');
  const zeroOutputObserved=
    has(text,/(?:completion|output)[^0-9]{0,80}(?:["':=\s]+)0(?:\.0+)?(?:[^0-9]|$)/i)||
    has(text,/0\.042\s*\/\s*\$?\s*0(?:\.0+)?/i)||
    has(text,/\$\s*0(?:\.0+)?\s*(?:\/\s*1M|per\s*(?:1M|million))?\s*(?:output|completion)/i);
  if(!zeroOutputObserved)reasons.push('jev-zero-output-price-not-observed');
  const contextObserved=has(text,/32\s*K\b/i)||has(text,/32,?000\s*(?:token|context)/i)||has(text,/"context_length"\s*:\s*32000/i);
  if(!contextObserved)reasons.push('jev-32k-context-not-observed');
  const decisionsObserved=
    has(text,/Decisions\s*API/i)||
    text.includes('/api/alpha/decisions')||
    has(text,/structured decision model/i);
  if(!decisionsObserved)reasons.push('openrouter-decisions-surface-not-observed');
  if(reasons.length)throw new Error('openrouter-jev-public-evidence-refused:'+reasons.join(','));

  const expiresAt=new Date(at+ttlMs).toISOString();
  return Object.freeze({
    model:OPENROUTER_JEV_DECISION_MODEL,
    modelRevision:'PUBLIC_DECISIONS_SKU__EXACT_SERVED_REVISION_OBSERVED_ONLY_AFTER_CALL',
    provider:'openrouter',
    marketClass:'DECISIONS_API',
    sourceRef,
    sourceRecordHash:semanticHash({
      sourceRef,
      exactModel:OPENROUTER_JEV_DECISION_MODEL,
      inputUsdPerMillion:OPENROUTER_JEV_INPUT_USD_PER_MILLION,
      outputUsdPerMillion:OPENROUTER_JEV_OUTPUT_USD_PER_MILLION,
      contextTokens:OPENROUTER_JEV_CONTEXT_TOKENS,
      routeEndpoint:OPENROUTER_DECISIONS_ENDPOINT,
      publicPageDigest:semanticHash(raw)
    }),
    verifiedAt:new Date(at).toISOString(),
    expiresAt,
    inputUsdPerMillion:OPENROUTER_JEV_INPUT_USD_PER_MILLION,
    outputUsdPerMillion:OPENROUTER_JEV_OUTPUT_USD_PER_MILLION,
    cacheReadUsdPerMillion:null,
    cacheWriteUsdPerMillion:null,
    cacheWrite1hUsdPerMillion:null,
    priceOverrides:[],
    otherChargesPerUnit:{},
    contextTokens:OPENROUTER_JEV_CONTEXT_TOKENS,
    maxOutputTokens:1,
    tools:false,
    structuredOutput:true,
    modalities:['text'],
    supportedParameters:['state','questions'],
    batch:false,
    flex:'UNKNOWN',
    privacy:'ROUTE_DEPENDENT_UNVERIFIED',
    rateLimits:'UNKNOWN',
    latency:'UNKNOWN',
    throughput:'UNKNOWN',
    reliability:'PUBLIC_PAGE_UPTIME_NOT_IMPORTED_AS_AUTHORITY',
    callableOnOwnerAccount:'UNKNOWN',
    routeEndpoint:OPENROUTER_DECISIONS_ENDPOINT,
    priceAdmission:'PUBLIC_PRICE_CANDIDATE',
    semanticAuthority:'NONE',
    publicEvidenceOnly:true,
    accountCallabilityProven:false
  });
}

export function augmentInfiniteOpusMarketWithDecisionRecord(snapshot,record){
  if(snapshot?.schemaVersion!=='uberbond.infinite-opus.market.v1'||!Array.isArray(snapshot.records))
    throw new Error('compiled-infinite-opus-market-required');
  if(!record||record.marketClass!=='DECISIONS_API'||record.provider!=='openrouter')
    throw new Error('openrouter-decision-market-record-required');
  const existing=snapshot.records.find(x=>x.model===record.model);
  if(existing){
    if(existing.priceAdmission==='PUBLIC_PRICE_CANDIDATE')return structuredClone(snapshot);
    throw new Error('conflicting-market-identity-refused');
  }
  const records=[...snapshot.records,structuredClone(record)].sort((a,b)=>a.model.localeCompare(b.model));
  return {
    ...structuredClone(snapshot),
    recordCount:records.length,
    records,
    supplementalSources:[
      ...(Array.isArray(snapshot.supplementalSources)?snapshot.supplementalSources:[]),
      {
        marketClass:'DECISIONS_API',
        sourceRef:record.sourceRef,
        sourceRecordHash:record.sourceRecordHash,
        verifiedAt:record.verifiedAt,
        expiresAt:record.expiresAt,
        model:record.model
      }
    ],
    publicCatalogProvesAccountCallability:false,
    providerInferenceCallsPerformed:0
  };
}
