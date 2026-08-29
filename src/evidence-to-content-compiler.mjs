import crypto from 'node:crypto';

export const EVIDENCE_CONTENT_POLICY_VERSION='uberbond.evidence-to-content-compiler-1.0.0';
export const CONTENT_FORMATS=Object.freeze(['SEO_AEO_BRIEF','TECHNICAL_SEO_REMEDIATION','LINKEDIN_POST_BRIEF','SOCIAL_SHORT_BRIEF','VIDEO_SCRIPT_BRIEF','PARTNER_SALES_ASSET','OUTBOUND_INSIGHT']);

function text(v,max=500){const s=String(v??'').trim();return s&&s.length<=max?s:null;}
function unique(values,max=50){return [...new Set((Array.isArray(values)?values:[]).map(v=>text(v,240)).filter(Boolean))].slice(0,max);}
function fail(reasonCodes,extra={}){return{ok:false,policyVersion:EVIDENCE_CONTENT_POLICY_VERSION,status:'REVIEW_REQUIRED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',publicationAuthority:'NONE',...extra};}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}

export function compileEvidenceContentPack(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))return fail(['content-pack-object-required']);
  const topic=text(input.topic,300); const audienceRef=text(input.audienceRef,240); const offerRef=input.offerRef==null?null:text(input.offerRef,240); const claimPolicyRef=text(input.claimPolicyRef,240);
  const evidenceRefs=unique(input.evidenceRefs,100); const contradictionRefs=unique(input.contradictionRefs,50);
  const formats=[...new Set((Array.isArray(input.formats)?input.formats:[]).map(v=>String(v).trim().toUpperCase()).filter(v=>CONTENT_FORMATS.includes(v)))];
  const reasons=[];
  if(!topic)reasons.push('topic-required');
  if(!audienceRef)reasons.push('audience-ref-required');
  if(!claimPolicyRef)reasons.push('claim-policy-ref-required');
  if(!evidenceRefs.length)reasons.push('source-evidence-required');
  if(!formats.length)reasons.push('at-least-one-supported-content-format-required');
  if(input.publishNow===true||input.autoPublish===true)reasons.push('automatic-publication-not-authorized');
  if(input.fabricatedMetric||input.estimatedRevenueClaim)reasons.push('fabricated-or-estimated-commercial-claim-prohibited');
  if(reasons.length)return fail(reasons);
  const sharedConstraints=[
    'Every factual claim must be traceable to supplied evidenceRefs.',
    'Contradictory evidence must be preserved or explicitly scoped, never averaged away.',
    'Do not invent customer results, revenue, market share, rankings, testimonials, quotes or case studies.',
    'Do not turn a vendor or creator claim into independent demand evidence.',
    'Do not auto-publish; output is a local preparation artifact only.'
  ];
  const formatConstraints={
    SEO_AEO_BRIEF:['Prioritize original utility and buyer questions over keyword volume.','No scaled low-value pages or doorway-page patterns.','Include answer-ready structure only where evidence supports the answer.'],
    TECHNICAL_SEO_REMEDIATION:['Separate observed technical evidence from recommended remediation.','Never claim a ranking or traffic outcome before measurement.'],
    LINKEDIN_POST_BRIEF:['No automated LinkedIn engagement or messaging authority.','Prefer evidence-led insight over engagement bait.'],
    SOCIAL_SHORT_BRIEF:['No fabricated urgency or social proof.','Keep platform-specific publication policy separate from content generation.'],
    VIDEO_SCRIPT_BRIEF:['Distinguish hook from factual claim.','Source-backed numbers must retain evidence references in the production notes.'],
    PARTNER_SALES_ASSET:['Do not imply partner endorsement or customer acceptance without receipts.','Keep scope, exclusions and proof boundary visible.'],
    OUTBOUND_INSIGHT:['This output is research/personalization input only; cold outreach still uses the canonical outreach engine.','No private contact inference.']
  };
  const tasks=formats.map(format=>({format,taskId:`content_task_${digest([topic,audienceRef,offerRef,format,evidenceRefs]).slice(0,24)}`,topic,audienceRef,offerRef,evidenceRefs,contradictionRefs,claimPolicyRef,constraints:[...sharedConstraints,...(formatConstraints[format]||[])],requiredOutput:{format,includeEvidenceMap:true,includeUnsupportedClaimList:true,includeNextMeasurement:true},executionAuthority:'LOCAL_PREPARATION_ONLY'}));
  const pack={schemaVersion:'uberbond-evidence-content-pack-1.0.0',packId:`content_pack_${digest(tasks).slice(0,32)}`,topic,audienceRef,offerRef,evidenceRefs,contradictionRefs,claimPolicyRef,tasks,attributionRequirement:'EVERY_PUBLISHED_DERIVATIVE_MUST_LINK_BACK_TO_SOURCE_EVIDENCE_AND_DISTRIBUTION_ATTRIBUTION',publicationAuthority:'NONE'};
  return{ok:true,policyVersion:EVIDENCE_CONTENT_POLICY_VERSION,status:'EVIDENCE_CONTENT_PACK_COMPILED',pack,businessEffectAuthority:'NONE',publicationAuthority:'NONE'};
}
