import crypto from 'node:crypto';

export const PUBLIC_EVIDENCE_TIER_POLICY_VERSION = 'uberbond.public-evidence-cost-tier.v1';
export const EVIDENCE_SOURCE_TIERS = Object.freeze([
  'CACHE', 'DNS_PUBLIC', 'OFFICIAL_REGISTRY', 'PUBLIC_HTTP', 'PUBLIC_BROWSER', 'LICENSED_API', 'MODEL_INFERENCE'
]);
const EXTERNAL = new Set(['DNS_PUBLIC','OFFICIAL_REGISTRY','PUBLIC_HTTP','PUBLIC_BROWSER','LICENSED_API']);
const PUBLIC_WEB = new Set(['OFFICIAL_REGISTRY','PUBLIC_HTTP','PUBLIC_BROWSER']);
const SENSITIVE = /(?:password|secret|token|authorization|cookie|credential|api[_-]?key|session|privateemail|personalemail|login)/i;

const text = (v, max=300) => String(v ?? '').trim().slice(0,max);
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq = xs => [...new Set((Array.isArray(xs) ? xs : []).map(x => text(x,180)).filter(Boolean))];
function bad(reasonCodes, extra={}) { return {ok:false, policyVersion:PUBLIC_EVIDENCE_TIER_POLICY_VERSION, status:'BLOCKED', reasonCodes:[...new Set(reasonCodes)], businessEffectAuthority:'NONE', externalEffectLedger:{providerCalls:0,spendCents:0}, ...extra}; }
function sensitiveKeys(v, depth=0, seen=new WeakSet()) {
  if (!v || typeof v !== 'object' || depth > 5) return [];
  if (seen.has(v)) return [];
  seen.add(v); const out=[];
  for (const [k,c] of Object.entries(v)) { if (SENSITIVE.test(k)) out.push(k); if (c && typeof c === 'object') out.push(...sensitiveKeys(c, depth+1, seen)); }
  return uniq(out).slice(0,20);
}

export function compileEvidenceAcquisitionPlan(input={}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad(['plan-object-required']);
  const targetRef=text(input.targetRef,240), field=text(input.field,120).toLowerCase(), occurrenceKey=text(input.occurrenceKey,300);
  const reasons=[]; if(!targetRef) reasons.push('target-ref-required'); if(!field) reasons.push('field-required'); if(!occurrenceKey) reasons.push('occurrence-key-required');
  const prohibited=sensitiveKeys(input); if(prohibited.length) reasons.push('secret-or-private-credential-prohibited');
  if (input.privateSource === true || input.credentialedAccess === true || input.captchaBypass === true || input.personalDataInference === true) reasons.push('prohibited-source-access');
  const cache = input.cache && typeof input.cache === 'object' ? input.cache : {};
  const cacheFresh = cache.hit === true && cache.expired !== true && /^[a-f0-9]{64}$/i.test(text(cache.contentHash,64));
  const candidates = (Array.isArray(input.sources) ? input.sources : []).slice(0,64).map((s,index) => {
    const tier=String(s?.tier ?? '').trim().toUpperCase();
    const source={index,id:text(s?.id||`source-${index}`,120),tier,configured:s?.configured !== false,costKnown:s?.costKnown===true || Number(s?.estimatedCostCents||0)===0,estimatedCostCents:Math.max(0,Math.round(Number(s?.estimatedCostCents||0)||0)),termsPurposeRef:text(s?.termsPurposeRef,240)||null,robotsDecisionRef:text(s?.robotsDecisionRef,240)||null,publicSourceCheckRef:text(s?.publicSourceCheckRef,240)||null,requiresClientRender:s?.requiresClientRender===true,observedHttpInsufficient:s?.observedHttpInsufficient===true,allowedPurpose:s?.allowedPurpose===true};
    const blocks=[];
    if(!EVIDENCE_SOURCE_TIERS.includes(tier)) blocks.push('unsupported-tier');
    if(EXTERNAL.has(tier)&&!source.configured) blocks.push('source-not-configured');
    if(EXTERNAL.has(tier)&&!source.allowedPurpose) blocks.push('purpose-not-confirmed');
    if(PUBLIC_WEB.has(tier)&&!source.publicSourceCheckRef) blocks.push('public-source-check-required');
    if(PUBLIC_WEB.has(tier)&&!source.termsPurposeRef) blocks.push('terms-purpose-ref-required');
    if(PUBLIC_WEB.has(tier)&&!source.robotsDecisionRef) blocks.push('robots-decision-ref-required');
    if(tier==='PUBLIC_BROWSER' && !(source.requiresClientRender && source.observedHttpInsufficient)) blocks.push('browser-requires-observed-static-http-insufficiency');
    if(tier==='LICENSED_API' && !source.costKnown) blocks.push('licensed-api-cost-unknown');
    return {...source,blocked:blocks.length>0,blockReasons:blocks};
  });
  if(reasons.length) return bad(reasons,{prohibitedKeys:prohibited});
  const order = {CACHE:0,DNS_PUBLIC:1,OFFICIAL_REGISTRY:2,PUBLIC_HTTP:3,PUBLIC_BROWSER:4,LICENSED_API:5,MODEL_INFERENCE:6};
  const runnable = candidates.filter(s=>!s.blocked).sort((a,b)=>order[a.tier]-order[b.tier]||a.estimatedCostCents-b.estimatedCostCents||a.id.localeCompare(b.id));
  const steps=[];
  if(cacheFresh) steps.push({tier:'CACHE',action:'USE_CACHE',sourceId:cache.sourceId||null,contentHash:text(cache.contentHash,64),spendCents:0,stopOnSufficientEvidence:true});
  else for(const s of runnable) steps.push({tier:s.tier,sourceId:s.id,action:s.tier==='LICENSED_API'?'CALL_ONLY_IF_LOWER_TIERS_INSUFFICIENT':s.tier==='MODEL_INFERENCE'?'INFERENCE_ONLY_NOT_CONTACT_TRUTH':'FETCH_IF_NEEDED',estimatedCostCents:s.estimatedCostCents,stopOnSufficientEvidence:true});
  const plan={schemaVersion:'public-evidence-acquisition-plan-1.0.0',planId:`evplan_${sha({targetRef,field,occurrenceKey,candidates:steps}).slice(0,28)}`,targetRef,field,occurrenceKey,cacheChecked:true,cacheFresh,steps,blockedSources:candidates.filter(s=>s.blocked).map(s=>({sourceId:s.id,tier:s.tier,reasonCodes:s.blockReasons})),law:'STOP_WHEN_EVIDENCE_THRESHOLD_IS_MET; PAID_API_LAST; BROWSER_ONLY_AFTER_STATIC_HTTP_INSUFFICIENCY',commercialTruthAuthority:'NONE'};
  return {ok:true,policyVersion:PUBLIC_EVIDENCE_TIER_POLICY_VERSION,status:cacheFresh?'CACHE_SATISFIES_FIRST_TIER':'ACQUISITION_PLAN_PREPARED',plan,businessEffectAuthority:'NONE',externalEffectLedger:{providerCalls:0,spendCents:0}};
}

export function compileEvidenceCacheEntry({targetRef,field,sourceId,sourcePolicyRef,contentHash,observedAt,expiresAt,evidenceRef}={}) {
  const reasons=[]; const t=text(targetRef,240), f=text(field,120).toLowerCase(), s=text(sourceId,120), p=text(sourcePolicyRef,240), h=text(contentHash,64).toLowerCase(), e=text(evidenceRef,240);
  const observed=new Date(observedAt||''), expires=new Date(expiresAt||'');
  if(!t) reasons.push('target-ref-required'); if(!f) reasons.push('field-required'); if(!s) reasons.push('source-id-required'); if(!p) reasons.push('source-policy-ref-required'); if(!/^[a-f0-9]{64}$/.test(h)) reasons.push('sha256-content-hash-required'); if(!e) reasons.push('evidence-ref-required'); if(!Number.isFinite(observed.getTime())||!Number.isFinite(expires.getTime())||expires<=observed) reasons.push('valid-cache-window-required');
  if(reasons.length) return bad(reasons);
  const core={targetRef:t,field:f,sourceId:s,sourcePolicyRef:p,contentHash:h,observedAt:observed.toISOString(),expiresAt:expires.toISOString(),evidenceRef:e};
  return {ok:true,policyVersion:PUBLIC_EVIDENCE_TIER_POLICY_VERSION,status:'CACHE_ENTRY_READY',entry:{schemaVersion:'public-evidence-cache-entry-1.0.0',cacheKey:`evcache_${sha(core).slice(0,32)}`,...core},businessEffectAuthority:'NONE',externalEffectLedger:{providerCalls:0,spendCents:0}};
}

export function publicEvidenceCacheSchemaSql(){
  return `CREATE TABLE IF NOT EXISTS public_evidence_cache (\n  cache_key TEXT PRIMARY KEY,\n  target_ref TEXT NOT NULL,\n  field TEXT NOT NULL,\n  source_id TEXT NOT NULL,\n  source_policy_ref TEXT NOT NULL,\n  content_hash TEXT NOT NULL,\n  evidence_ref TEXT NOT NULL,\n  observed_at TIMESTAMPTZ NOT NULL,\n  expires_at TIMESTAMPTZ NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\nCREATE INDEX IF NOT EXISTS public_evidence_cache_lookup_idx ON public_evidence_cache(target_ref, field, expires_at DESC);`;
}

export function createPublicEvidenceCacheRepository(pool){
  if(!pool?.query) throw new Error('PostgreSQL pool with query() required');
  return {
    ensureSchema:()=>pool.query(publicEvidenceCacheSchemaSql()),
    async put(entry){
      if(!entry?.cacheKey || entry.schemaVersion!=='public-evidence-cache-entry-1.0.0') throw new Error('valid public evidence cache entry required');
      await pool.query(`INSERT INTO public_evidence_cache(cache_key,target_ref,field,source_id,source_policy_ref,content_hash,evidence_ref,observed_at,expires_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(cache_key) DO UPDATE SET content_hash=EXCLUDED.content_hash,evidence_ref=EXCLUDED.evidence_ref,observed_at=EXCLUDED.observed_at,expires_at=EXCLUDED.expires_at,updated_at=now()`,[entry.cacheKey,entry.targetRef,entry.field,entry.sourceId,entry.sourcePolicyRef,entry.contentHash,entry.evidenceRef,entry.observedAt,entry.expiresAt]);
      return {ok:true,cacheKey:entry.cacheKey};
    },
    async getFresh(targetRef,field,now=new Date()){
      const r=await pool.query(`SELECT cache_key,target_ref,field,source_id,source_policy_ref,content_hash,evidence_ref,observed_at,expires_at FROM public_evidence_cache WHERE target_ref=$1 AND field=$2 AND expires_at>$3 ORDER BY observed_at DESC LIMIT 1`,[text(targetRef,240),text(field,120).toLowerCase(),now.toISOString()]);
      return r.rows?.[0]||null;
    }
  };
}
