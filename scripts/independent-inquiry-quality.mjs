import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fetchPublicPinned } from '../src/inquiry-public-http.mjs';
const cohort=JSON.parse(fs.readFileSync('artifacts/commercialization/field-cohort-40-node2gb-2026-10.json','utf8'));
const findings=cohort.records.flatMap(r=>r.findings.filter(f=>f.firstTouchUse==='MAY_STATE_AS_OBSERVED_FACT').map(f=>({...f,website:r.website})));
const evaluations=[];
for(const finding of findings) {
 const url=finding.evidence?.[0]?.url;
 let urlState='OK', source=null, independent=null;
 try {
  if(!url || !/^https?:\/\//i.test(url)) throw Error('UNSAFE_EVIDENCE_URL');
  let current=url;
  for(let redirect=0;redirect<6;redirect++) {
   const response=await fetchPublicPinned(current,{signal:AbortSignal.timeout(10000)});
   if(response.status>=300&&response.status<400 && response.headers.get('location')) {
    const next=new URL(response.headers.get('location'),current).href;
    if(new URL(next).hostname.replace(/^www\./,'')!==new URL(url).hostname.replace(/^www\./,'')) throw Error('OFF_SITE_REDIRECT');
    current=next;continue;
   }
   if(response.status<200 || response.status>=300) throw Error(`STATUS_${response.status}`);
   source=await response.text();break;
  }
  if(!source) throw Error('NO_STABLE_PAGE');
  independent=JSON.parse(execFileSync('python3',['scripts/independent-inquiry-html.py'],{input:JSON.stringify({html:source}),encoding:'utf8',maxBuffer:100000}));
 }catch(error){urlState=String(error?.message??error).slice(0,140);}
 const parserSupports=finding.code==='STRUCTURED_DATA_UNPARSEABLE' && independent?.jsonLdParseFailures>0;
 evaluations.push({website:finding.website,evidenceUrl:url,code:finding.code,automatedIndependentStatus:parserSupports?'PARSER_CORROBORATED_NOT_HUMAN_VERIFIED':urlState!=='OK'?'UNOBSERVABLE':'NOT_INDEPENDENTLY_CORROBORATED',sourceShaMatches:independent?.rawSourceSha256===finding.evidence?.[0]?.sourceSha256,sourceSha256:independent?.rawSourceSha256??null,rawSourceStorage:'NOT_COMMITTED_PUBLIC_URL_AND_HASH_ONLY',jsonLdParseFailures:independent?.jsonLdParseFailures??null,fetchState:urlState,humanBrowserConfirmation:'NOT_PERFORMED',routingIntent:'UNKNOWN',buyerReproduction:'NOT_PERFORMED'});
 process.stderr.write(`Independent ${evaluations.length}/${findings.length} ${finding.code} -> ${evaluations.at(-1).automatedIndependentStatus}\n`);
}
const confirmed=evaluations.filter(e=>e.automatedIndependentStatus==='PARSER_CORROBORATED_NOT_HUMAN_VERIFIED');
const output={schema:'uberbond.quality-eval.2026-10.v1',source: 'artifacts/commercialization/field-cohort-40-node2gb-2026-10.json',dateUtc:new Date().toISOString(),evidenceClass:'AUTOMATED_INDEPENDENT_PARSER_PUBLIC_PAGE_RETRIEVAL_NOT_HUMAN_VERIFIED',supportedFindingsTarget:20,assertableCandidates:findings.length,shortfallFromTarget:Math.max(0,20-findings.length),independentlyParserCorroborated:confirmed.length,independentlyHumanVerified:0,precision:'UNKNOWN_NO_HUMAN_REFERENCE_STANDARD',falsePositiveRate:'UNKNOWN',reproductionReliability:'UNKNOWN_NO_INDEPENDENT_BUYER_REPRODUCTIONS',cleanSiteAccuracy:'UNKNOWN_NO_HUMAN_GROUND_TRUTH',abstentionQuality:'PARTIALLY_MEASURED_FROM_ROBOTS_NETWORK_AND_RUNTIME_ERRORS',costPerSupportedFinding:'UNKNOWN_HUMAN_AND_BROWSER_COST_MISSING',callTrackingSafety:'MISMATCH_IS_A_QUESTION_UNLESS_INTENDED_ROUTING_CONFIRMED',validityBoundary:'Parser corroboration does not prove a customer-affecting defect; do not bill these candidate findings as human-confirmed.',evaluations};
fs.writeFileSync('artifacts/commercialization/quality-eval-2026-10.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({candidates:findings.length,parserCorroborated:confirmed.length,humanConfirmed:0}));
