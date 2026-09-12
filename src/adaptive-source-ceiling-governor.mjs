export const SOURCE_CEILING_GOVERNOR_VERSION='uberbond.source-ceiling-governor.v1';

const n=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const lowerHeaders=h=>Object.fromEntries(Object.entries(h||{}).map(([k,v])=>[String(k).toLowerCase(),String(v)]));

export function parseRateLimitHeaders(headers={}){
 const h=lowerHeaders(headers);
 const retryAfter=n(h['retry-after']);
 const resetEpoch=n(h['x-ratelimit-reset']);
 const remaining=n(h['x-ratelimit-remaining']);
 const limit=n(h['x-ratelimit-limit']);
 const hf=h['ratelimit']||null;
 const hfPolicy=h['ratelimit-policy']||null;
 return {retryAfterSeconds:retryAfter,resetEpochSeconds:resetEpoch,remaining,limit,hfRateLimit:hf,hfPolicy};
}

export function buildSourceCeilingPolicy({sourceId,mode='POLL',publishedLimit=null,publishedWindowSeconds=null,quotaUnitsPerDay=null,minDelayMs=250,maxConcurrency=1,continuous=false}={}){
 if(!sourceId) throw new Error('sourceId required');
 return {
  version:SOURCE_CEILING_GOVERNOR_VERSION,
  sourceId:String(sourceId),mode,
  publishedLimit:n(publishedLimit),publishedWindowSeconds:n(publishedWindowSeconds),quotaUnitsPerDay:n(quotaUnitsPerDay),
  minDelayMs:Math.max(0,Number(minDelayMs)||0),maxConcurrency:Math.max(1,Math.floor(Number(maxConcurrency)||1)),continuous:Boolean(continuous),
  authority:'PUBLIC_READ_RESEARCH_ONLY',
  laws:['HONOR_PROVIDER_LIMITS','HONOR_RETRY_AFTER_AND_RESET','USE_CONDITIONAL_REQUESTS_WHERE_SUPPORTED','CACHE_AND_DEDUPE','NO_AUTHORITY_FROM_INGESTION']
 };
}

export function nextSourceAction({policy,headers={},status=200,nowMs=Date.now(),usedQuotaUnitsToday=0,lastRequestAtMs=0}={}){
 if(!policy?.sourceId) return {action:'STOP',reason:'INVALID_POLICY'};
 const parsed=parseRateLimitHeaders(headers);
 if(status===429||(status===403&&parsed.remaining===0)){
  const retryAt=parsed.retryAfterSeconds!=null?nowMs+parsed.retryAfterSeconds*1000:parsed.resetEpochSeconds!=null?parsed.resetEpochSeconds*1000:nowMs+60000;
  return {action:'SLEEP_UNTIL',retryAtMs:retryAt,reason:'RATE_LIMIT'};
 }
 if(policy.quotaUnitsPerDay!=null&&usedQuotaUnitsToday>=policy.quotaUnitsPerDay) return {action:'SLEEP_UNTIL_DAY_RESET',reason:'DAILY_QUOTA_EXHAUSTED'};
 if(parsed.remaining!=null&&parsed.remaining<=0){
  const retryAt=parsed.resetEpochSeconds!=null?parsed.resetEpochSeconds*1000:nowMs+60000;
  return {action:'SLEEP_UNTIL',retryAtMs:retryAt,reason:'WINDOW_EXHAUSTED'};
 }
 const floor=Math.max(0,(lastRequestAtMs||0)+(policy.minDelayMs||0)-nowMs);
 if(floor>0) return {action:'SLEEP_FOR',delayMs:floor,reason:'POLITENESS_FLOOR'};
 return {action:policy.continuous?'KEEP_STREAMING':'REQUEST_NEXT',reason:'CAPACITY_AVAILABLE',remaining:parsed.remaining};
}

export const DEFAULT_PUBLIC_SOURCE_POLICIES=Object.freeze({
 x:{sourceId:'x',mode:'STREAM_PLUS_SEARCH',continuous:true,minDelayMs:0,maxConcurrency:1},
 github:{sourceId:'github',mode:'API',publishedLimit:5000,publishedWindowSeconds:3600,minDelayMs:250,maxConcurrency:1},
 reddit:{sourceId:'reddit',mode:'API',publishedLimit:100,publishedWindowSeconds:60,minDelayMs:650,maxConcurrency:1},
 youtube:{sourceId:'youtube',mode:'QUOTA',quotaUnitsPerDay:10000,minDelayMs:250,maxConcurrency:1},
 huggingface:{sourceId:'huggingface',mode:'HEADER_DRIVEN',minDelayMs:100,maxConcurrency:2},
 arxiv:{sourceId:'arxiv',mode:'POLITE_POLL',minDelayMs:3000,maxConcurrency:1},
 hackernews:{sourceId:'hackernews',mode:'PUBLIC_API',continuous:true,minDelayMs:1000,maxConcurrency:1},
 web:{sourceId:'public-web',mode:'ROBOTS_AND_PROVIDER_LIMITS',continuous:true,minDelayMs:1000,maxConcurrency:2}
});

export function buildAlwaysOnSensoriumPlan({overrides={}}={}){
 const lanes=Object.entries(DEFAULT_PUBLIC_SOURCE_POLICIES).map(([id,base])=>buildSourceCeilingPolicy({...base,...overrides[id]}));
 return {version:SOURCE_CEILING_GOVERNOR_VERSION,status:'ALWAYS_ON_SENSORIUM_PLAN_READY',lanes,goal:'MAXIMIZE_LAWFUL_USEFUL_SIGNAL_INGESTION_PER_UNIT_TIME',schedulerLaw:'RUN_24_7_WHILE_CAPACITY_EXISTS_SLEEP_EXACTLY_WHEN_PROVIDER_OR_POLITENESS_REQUIRES'};
}
