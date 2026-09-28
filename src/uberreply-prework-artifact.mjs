import crypto from 'node:crypto';
import { getUberReplyOffer } from './uberreply-four-offer-genome.mjs';

export const UBERREPLY_PREWORK_ARTIFACT_VERSION = 'uberbond.uberreply-prework-artifact.v1';

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).filter(Boolean))];
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

const ARTIFACT_BY_OFFER=Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT:Object.freeze({
    artifactType:'ONE_PAGE_REVENUE_LEAK_EVIDENCE_MAP',
    publicLabel:'one-page revenue-leak evidence map'
  }),
  AI_AGENT_RELEASE_GATE:Object.freeze({
    artifactType:'SAMPLE_RELEASE_FAILURE_PACKET',
    publicLabel:'sample release-failure packet'
  }),
  CLIENT_ROI_PROOF_SPRINT:Object.freeze({
    artifactType:'REVENUE_RECONCILIATION_GAP_MAP',
    publicLabel:'revenue reconciliation map'
  }),
  BILINGUAL_BOOKING_LEAK_AUDIT:Object.freeze({
    artifactType:'BILINGUAL_PARITY_EVIDENCE_MAP',
    publicLabel:'Arabic-English booking parity map'
  })
});

function screenshotRefs(finding={}){
  const shots=finding?.screenshots;
  if(!shots||typeof shots!=='object')return[];
  return Object.values(shots).flatMap(value=>{
    if(Array.isArray(value))return value.map(v=>clean(v,1000)).filter(Boolean);
    const one=clean(value,1000);
    return one?[one]:[];
  });
}

export function compileUberReplyPreworkArtifact({
  offerId,
  prospect={},
  issue=null,
  audit=[],
  maxFindings=3
}={}){
  const offer=getUberReplyOffer(offerId);
  if(!offer)return{
    ok:false,
    state:'UNKNOWN_OFFER',
    reasonCodes:['known-offer-required'],
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };
  const spec=ARTIFACT_BY_OFFER[offer.offerId];
  const candidates=[issue,...(Array.isArray(audit)?audit:[])]
    .filter(Boolean)
    .filter((row,index,all)=>all.findIndex(other=>
      clean(other.code||other.title,300)===clean(row.code||row.title,300)
      && clean(other.evidenceUrl,1000)===clean(row.evidenceUrl,1000)
    )===index)
    .filter(row=>row.safeForOutreach!==false)
    .filter(row=>clean(row.evidenceUrl,1000)&&clean(row.evidenceExcerpt,1200))
    .slice(0,Math.max(1,Math.min(8,Number(maxFindings)||3)));

  const findings=candidates.map((row,index)=>({
    rank:index+1,
    code:clean(row.code||`finding-${index+1}`,200),
    title:clean(row.title||'Observed issue',300),
    service:clean(row.service||'',240)||null,
    implication:clean(row.implication||'',600)||null,
    confidence:Number.isFinite(Number(row.confidence))?Math.max(0,Math.min(1,Number(row.confidence))):null,
    evidenceUrl:clean(row.evidenceUrl,1000),
    evidenceExcerpt:clean(row.evidenceExcerpt,500),
    screenshotRefs:screenshotRefs(row)
  }));

  const evidenceRefs=uniq(findings.flatMap(row=>[row.evidenceUrl,...row.screenshotRefs]));
  const prepared=findings.length>0&&evidenceRefs.length>0;
  const repairOrder=findings.map(row=>({
    rank:row.rank,
    code:row.code,
    action:`Review and repair: ${row.title}`,
    confidence:row.confidence
  }));
  const seed={
    offerId:offer.offerId,
    prospectId:clean(prospect.id||prospect.website||prospect.company,300),
    findingKeys:findings.map(row=>[row.code,row.evidenceUrl,row.evidenceExcerpt]),
    artifactType:spec.artifactType
  };

  return{
    ok:prepared,
    state:prepared?'UBERREPLY_PREWORK_ARTIFACT_READY':'UBERREPLY_PREWORK_ARTIFACT_INSUFFICIENT_EVIDENCE',
    version:UBERREPLY_PREWORK_ARTIFACT_VERSION,
    offerId:offer.offerId,
    publicOfferName:offer.publicName,
    artifactType:spec.artifactType,
    publicLabel:spec.publicLabel,
    artifactId:`ubart_${digest(seed).replace('sha256:','').slice(0,32)}`,
    prepared,
    company:clean(prospect.company,240)||null,
    website:clean(prospect.website,1000)||null,
    findings,
    evidenceRefs,
    screenshotRefs:uniq(findings.flatMap(row=>row.screenshotRefs)),
    repairOrder,
    topFinding:findings[0]||null,
    reasonCodes:prepared?[]:['at-least-one-safe-evidence-backed-finding-required'],
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'This is a prepared evidence object for truthful pre-sale outreach. It may summarize only supplied findings with explicit evidence references. It does not prove revenue loss, customer behavior, causality, remediation success, or authorize contact.'
  };
}
