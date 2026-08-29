import crypto from 'node:crypto';

export const STAGING_CONTENT_POLICY_VERSION='uberbond.staging-content-repository.v1';
const TYPES=new Set(['SEO_AEO','TECHNICAL_SEO','SOCIAL','VIDEO_SCRIPT','PARTNER_SALES','OUTBOUND_INSIGHT','TRANSACTIONAL']);
const text=(v,m=500)=>String(v??'').trim().slice(0,m);
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const secret=/(?:sk-[a-z0-9_-]{12,}|api[_-]?key\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._-]{12,}|password\s*[:=])/i;
function fail(reasonCodes){return {ok:false,policyVersion:STAGING_CONTENT_POLICY_VERSION,status:'BLOCKED',reasonCodes,businessEffectAuthority:'NONE'};}

export function compileStagedContent(input={}){
  const assetType=String(input.assetType??'').trim().toUpperCase(), audienceRef=text(input.audienceRef,200), offerRef=text(input.offerRef,200), profileRef=text(input.profileRef,200), payload=text(input.payload,20000), sourceEvidenceRefs=[...new Set((Array.isArray(input.sourceEvidenceRefs)?input.sourceEvidenceRefs:[]).map(x=>text(x,240)).filter(Boolean))], policyRef=text(input.policyRef,240), generatedAt=new Date(input.generatedAt||Date.now()), expiresAt=new Date(input.expiresAt||Date.now()+7*86400000);
  const reasons=[]; if(!TYPES.has(assetType)) reasons.push('invalid-asset-type'); if(!audienceRef) reasons.push('audience-ref-required'); if(!offerRef) reasons.push('offer-ref-required'); if(!profileRef) reasons.push('profile-ref-required'); if(!payload) reasons.push('compiled-payload-required'); if(secret.test(payload)) reasons.push('secret-like-content-prohibited'); if(!sourceEvidenceRefs.length) reasons.push('source-evidence-required'); if(!policyRef) reasons.push('policy-ref-required'); if(!Number.isFinite(generatedAt.getTime())||!Number.isFinite(expiresAt.getTime())||expiresAt<=generatedAt) reasons.push('valid-content-lifetime-required'); if(reasons.length)return fail(reasons);
  const identity={assetType,audienceRef,offerRef,profileRef,sourceEvidenceRefs,policyRef,payloadHash:sha(payload)};
  return {ok:true,policyVersion:STAGING_CONTENT_POLICY_VERSION,status:'STAGED_CONTENT_READY',content:{schemaVersion:'staged-content-1.0.0',contentId:`stg_${sha(identity).slice(0,28)}`,contentRef:`staged-content:${sha(identity).slice(0,28)}`,...identity,payload,generatedAt:generatedAt.toISOString(),expiresAt:expiresAt.toISOString(),publicationAuthority:'NONE',sendAuthority:'NONE'}};
}

export function stagingContentSchemaSql(){
 return `CREATE TABLE IF NOT EXISTS staged_content_repository (\n  content_id TEXT PRIMARY KEY,\n  content_ref TEXT NOT NULL UNIQUE,\n  asset_type TEXT NOT NULL,\n  audience_ref TEXT NOT NULL,\n  offer_ref TEXT NOT NULL,\n  profile_ref TEXT NOT NULL,\n  payload JSONB NOT NULL,\n  payload_hash TEXT NOT NULL,\n  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,\n  policy_ref TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'READY',\n  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  expires_at TIMESTAMPTZ NOT NULL,\n  locked_at TIMESTAMPTZ,\n  locked_by TEXT,\n  consumed_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  CHECK (status IN ('READY','CLAIMED','CONSUMED','FAILED','EXPIRED','SUPERSEDED'))\n);\nCREATE INDEX IF NOT EXISTS staged_content_ready_idx ON staged_content_repository(status, available_at, expires_at);`;
}

export function claimReadyContentSql(){
 return `WITH candidate AS (\n  SELECT content_id FROM staged_content_repository\n  WHERE status='READY' AND available_at <= now() AND expires_at > now()\n  ORDER BY available_at, created_at\n  FOR UPDATE SKIP LOCKED\n  LIMIT $1\n)\nUPDATE staged_content_repository s\nSET status='CLAIMED', locked_at=now(), locked_by=$2, updated_at=now()\nFROM candidate c\nWHERE s.content_id=c.content_id\nRETURNING s.*;`;
}

export function createPostgresStagingContentRepository(pool){
  if(!pool?.query) throw new Error('PostgreSQL pool with query() required');
  return {
    ensureSchema:()=>pool.query(stagingContentSchemaSql()),
    async put(compiled,{availableAt=new Date()}={}){
      if(!compiled?.contentId || compiled.schemaVersion!=='staged-content-1.0.0') throw new Error('valid staged content required');
      await pool.query(`INSERT INTO staged_content_repository(content_id,content_ref,asset_type,audience_ref,offer_ref,profile_ref,payload,payload_hash,source_evidence_refs,policy_ref,status,available_at,expires_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,'READY',$11,$12,now()) ON CONFLICT(content_id) DO UPDATE SET payload=EXCLUDED.payload,payload_hash=EXCLUDED.payload_hash,source_evidence_refs=EXCLUDED.source_evidence_refs,policy_ref=EXCLUDED.policy_ref,status='READY',available_at=EXCLUDED.available_at,expires_at=EXCLUDED.expires_at,locked_at=NULL,locked_by=NULL,updated_at=now()`,[compiled.contentId,compiled.contentRef,compiled.assetType,compiled.audienceRef,compiled.offerRef,compiled.profileRef,JSON.stringify({text:compiled.payload}),compiled.payloadHash,JSON.stringify(compiled.sourceEvidenceRefs),compiled.policyRef,new Date(availableAt).toISOString(),compiled.expiresAt]);
      return {ok:true,contentRef:compiled.contentRef};
    },
    async claim(workerId,limit=1){
      const wid=text(workerId,160); if(!wid) throw new Error('worker id required'); const bounded=Math.max(1,Math.min(100,Math.round(Number(limit)||1))); const r=await pool.query(claimReadyContentSql(),[bounded,wid]); return r.rows||[];
    },
    async consume(contentId,workerId){
      const r=await pool.query(`UPDATE staged_content_repository SET status='CONSUMED',consumed_at=now(),updated_at=now() WHERE content_id=$1 AND status='CLAIMED' AND locked_by=$2 RETURNING content_ref`,[text(contentId,200),text(workerId,160)]); return r.rows?.[0]||null;
    },
    async releaseExpiredClaims(maxAgeMinutes=15){
      const minutes=Math.max(1,Math.min(1440,Math.round(Number(maxAgeMinutes)||15))); const r=await pool.query(`UPDATE staged_content_repository SET status='READY',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE status='CLAIMED' AND locked_at < now() - ($1::text || ' minutes')::interval AND expires_at>now() RETURNING content_id`,[String(minutes)]); return r.rows||[];
    }
  };
}
