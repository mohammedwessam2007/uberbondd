import { semanticHash } from './semantic-closure-kernel.mjs';

export const OPENROUTER_JEV_MODEL='typesafe/jev-1.13';
export const OPENROUTER_JEV_MODEL_PAGE='https://openrouter.ai/typesafe/jev-1.13/api';

const htmlText=html=>String(html??'')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&#36;|&dollar;/gi,'$')
  .replace(/\s+/g,' ')
  .trim();

const numberFrom=(text,re)=>{
  const m=text.match(re);
  if(!m)return null;
  const n=Number(String(m[1]).replaceAll(',',''));
  return Number.isFinite(n)&&n>=0?n:null;
};

export function compileOpenRouterJevPublicPriceRecord(html,{verifiedAt,ttlMs=10*60*1000}={}){
  const at=Date.parse(verifiedAt);
  if(!Number.isFinite(at)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>86400000)
    throw new Error('bounded-jev-public-observation-required');
  const raw=String(html??'');
  if(Buffer.byteLength(raw)>3_000_000)throw new Error('jev-public-model-page-too-large');
  const text=htmlText(raw);
  if(!text.includes(OPENROUTER_JEV_MODEL)||!/Jev\s*1\.13/i.test(text))
    throw new Error('exact-jev-public-model-page-required');

  const input=numberFrom(text,/Jev\s*1\.13\s+costs\s+\$([0-9.,]+)\s*(?:\/M|per million)\s+input/i)
    ??numberFrom(text,/\$([0-9.,]+)\s*\/\s*M\s*input/i);
  const output=numberFrom(text,/\$([0-9.,]+)\s*(?:\/M|per million)\s+output/i)
    ??numberFrom(text,/output[^$]{0,40}\$([0-9.,]+)/i)
    ??(/output\s+(?:is\s+)?(?:completely\s+)?free/i.test(text)?0:null);
  const context=numberFrom(text,/([0-9,]+)\s*token\s+context\s+window/i)
    ??( /Context\s+32K/i.test(text)?32000:null);

  if(input==null||output==null||context==null||context<1024)
    throw new Error('fresh-fixed-jev-public-price-not-parseable');

  const expiresAt=new Date(at+ttlMs).toISOString();
  const body={
    model:OPENROUTER_JEV_MODEL,
    modelRevision:null,
    provider:'openrouter',
    sourceRef:OPENROUTER_JEV_MODEL_PAGE,
    sourceRecordHash:semanticHash({model:OPENROUTER_JEV_MODEL,input,output,context,textDigest:semanticHash(text)}),
    verifiedAt:new Date(at).toISOString(),
    expiresAt,
    inputUsdPerMillion:input,
    outputUsdPerMillion:output,
    cacheReadUsdPerMillion:null,
    cacheWriteUsdPerMillion:null,
    cacheWrite1hUsdPerMillion:null,
    priceOverrides:[],
    otherChargesPerUnit:{},
    contextTokens:context,
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
    reliability:'UNKNOWN',
    callableOnOwnerAccount:'UNKNOWN',
    routeEndpoint:'https://openrouter.ai/api/alpha/decisions',
    priceAdmission:'PUBLIC_PRICE_CANDIDATE',
    routeKind:'OPENROUTER_DECISIONS',
    semanticAuthority:'NONE'
  };
  return {...body,recordDigest:semanticHash(body)};
}

export function augmentInfiniteOpusMarketWithDecisionRecord(snapshot,record){
  if(!snapshot||!Array.isArray(snapshot.records)||!record||record.model!==OPENROUTER_JEV_MODEL)
    throw new Error('market-and-exact-jev-record-required');
  const records=snapshot.records.filter(r=>r.model!==record.model);
  records.push(structuredClone(record));
  records.sort((a,b)=>a.model.localeCompare(b.model));
  return {
    ...structuredClone(snapshot),
    records,
    recordCount:records.length,
    sourceHash:semanticHash({
      baseSourceHash:snapshot.sourceHash,
      decisionRecordHash:record.recordDigest??record.sourceRecordHash
    }),
    decisionMarket:{
      observed:true,
      models:[record.model],
      sourceRef:record.sourceRef,
      providerInferenceCallsPerformed:0,
      spendUsd:0
    }
  };
}
