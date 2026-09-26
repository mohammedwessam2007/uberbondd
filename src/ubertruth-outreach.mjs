import crypto from 'node:crypto';

export const UBERTRUTH_OUTREACH_VERSION='uberbond.ubertruth-outreach.v1';
const clean=(v,n=12000)=>String(v??'').trim().slice(0,n);
const https=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:';}catch{return false;}};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const RISK_PATTERNS=[
  {id:'invented-revenue-loss',re:/\b(you('| a)?re|you are|your (business|company|site).{0,50})(losing|costing).{0,20}(\$|usd|egp|money|revenue|sales)\b/i},
  {id:'unsupported-performance-claim',re:/\b(increase|boost|grow|improve).{0,25}\b(conversion|revenue|sales|bookings|leads)\b.{0,20}\b\d{1,3}%\b/i},
  {id:'unsupported-client-history',re:/\b(i|we) (have )?(helped|worked with|generated|made|grew)\b/i},
  {id:'fake-familiarity',re:/\b(i know you|been following you|love your work|big fan)\b/i}
];
export function evaluateOutreachPersonalization({
  prospect={},issue={},contact={},subject='',body='',claimEvidence=[],minEvidenceConfidence=0.65
}={}){
  const deny=[],review=[],evidence=[];
  const company=clean(prospect.company||prospect.name,180);
  if(!company)deny.push('company-identity-required');
  if(issue.safeForOutreach===false)deny.push('issue-not-safe-for-outreach');
  if(!https(issue.evidenceUrl))deny.push('https-issue-evidence-url-required');
  if(!clean(issue.evidenceExcerpt||issue.excerpt,1000))deny.push('issue-evidence-excerpt-required');
  const confidence=Number(issue.confidence);
  if(!Number.isFinite(confidence)||confidence<Number(minEvidenceConfidence||0.65))review.push('issue-confidence-below-auto-send-threshold');
  if(issue.evidenceUrl)evidence.push({kind:'issue',ref:clean(issue.evidenceUrl,1000),excerptDigest:`sha256:${digest(clean(issue.evidenceExcerpt||issue.excerpt,1000))}`});
  const first=clean(contact.firstName||'',120);
  const greeting=clean(body,300).match(/^hi\s+([^,\n]+)[,\n]/i)?.[1]?.trim()||'';
  if(greeting&&greeting.toLowerCase()!=='there'){
    if(!first)deny.push('personal-name-used-without-exact-first-name');
    else if(greeting.toLowerCase()!==first.toLowerCase())deny.push('personal-name-does-not-match-contact-evidence');
  }
  const supplied=new Set((Array.isArray(claimEvidence)?claimEvidence:[]).map(x=>String(x?.claimId||x?.kind||'').trim()).filter(Boolean));
  for(const rule of RISK_PATTERNS){
    if(rule.re.test(`${subject}\n${body}`)&&!supplied.has(rule.id))deny.push(`unsupported-claim:${rule.id}`);
  }
  if(!clean(subject,500))deny.push('subject-required');
  if(!clean(body,12000))deny.push('body-required');
  const state=deny.length?'DENY':review.length?'REVIEW':'PASS';
  const seed={state,deny:[...new Set(deny)],review:[...new Set(review)],company,contact:first||null,evidence};
  return Object.freeze({
    version:UBERTRUTH_OUTREACH_VERSION,
    state,
    autoSendEligible:state==='PASS',
    denyReasonCodes:seed.deny,
    reviewReasonCodes:seed.review,
    evidence,
    decisionId:`ubtruth_${digest(seed)}`,
    externalEffectAuthority:'NONE',
    truthBoundary:'PASS means only that the candidate message is bound to the supplied contact/company/issue evidence and contains no detected unsupported high-risk claim. It does not prove recipient eligibility, provider permission, deliverability, or business outcome.'
  });
}
