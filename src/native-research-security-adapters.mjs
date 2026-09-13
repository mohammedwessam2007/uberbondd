import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { deterministicAudit } from './audit-rules.mjs';

export const NATIVE_RESEARCH_SECURITY_ADAPTERS_VERSION='uberbond.native-research-security-adapters.v1';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
const text=(v,max=2000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};

export function compileOwnedTargetSecurityEvidence({targetClass='OWNED_LOCAL',crawl,sourceFindings=[]}={}){
  const allowed=new Set(['OWNED_LOCAL','OWNED_TEST','OWNED_PREVIEW']);
  if(!allowed.has(String(targetClass).toUpperCase()))return envelope({ok:false,status:'NATIVE_SECURITY_TRIBUNAL_REFUSED',reasonCodes:['owned-nonproduction-target-required']});
  if(!crawl||typeof crawl!=='object'||!Array.isArray(crawl.pages))return envelope({ok:false,status:'NATIVE_SECURITY_TRIBUNAL_REFUSED',reasonCodes:['crawl-evidence-required']});
  const websiteFindings=deterministicAudit(crawl,{}).filter(f=>['Trust','Technical','Agent Readiness'].includes(f.category)||/https|broken|structured|index/i.test(f.code||''));
  const staticFindings=Array.isArray(sourceFindings)?sourceFindings.map((f,i)=>({id:text(f?.id,120)||`source_${i+1}`,severity:Number(f?.severity)||1,summary:text(f?.summary,1200),evidenceRef:text(f?.evidenceRef,1000)})).filter(f=>f.summary&&f.evidenceRef).slice(0,256):[];
  const findings=[...websiteFindings.map(f=>({id:f.code,severity:f.severity,summary:f.title,evidenceRef:`url:${f.evidenceUrl}`,confidence:f.confidence})),...staticFindings];
  const receipt={targetClass:String(targetClass).toUpperCase(),findingCount:findings.length,findings,verificationClass:'DETERMINISTIC_OWNED_TARGET_EVIDENCE',exploitAttempted:false,persistenceAttempted:false,credentialAccessAttempted:false};
  return envelope({ok:true,status:'NATIVE_OWNED_TARGET_SECURITY_EVIDENCE_READY',receipt,receiptDigest:hash(receipt),securityTestAuthority:'NONE',claimBoundary:'THIS IS NON-EXPLOITATIVE OWNED-TARGET EVIDENCE TRIAGE, NOT FULL AUTONOMOUS PENTESTING OR STRIX PARITY'});
}

export function compilePublicResearchPacket({question,observations=[]}={}){
  const q=text(question,2000);
  if(!q||!Array.isArray(observations)||observations.length===0||observations.length>5000)return envelope({ok:false,status:'PUBLIC_RESEARCH_PACKET_INVALID',reasonCodes:['question-and-bounded-observations-required']});
  const normalized=[];
  for(const raw of observations){
    const sourceUrl=text(raw?.sourceUrl,2000),sourceClass=text(raw?.sourceClass,120)?.toUpperCase(),claim=text(raw?.claim,3000),observedAt=text(raw?.observedAt,80),evidenceDigest=text(raw?.evidenceDigest,64)?.toLowerCase();
    if(!sourceUrl?.startsWith('https://')||!sourceClass||!claim||!observedAt||!/^[a-f0-9]{64}$/.test(String(evidenceDigest||'')))continue;
    normalized.push({sourceUrl,sourceClass,claim,observedAt,evidenceDigest,confidence:Number.isFinite(Number(raw?.confidence))?Math.max(0,Math.min(1,Number(raw.confidence))):null});
  }
  if(!normalized.length)return envelope({ok:false,status:'PUBLIC_RESEARCH_PACKET_INVALID',reasonCodes:['provenanced-observations-required']});
  const groups=new Map();
  for(const row of normalized){const key=row.claim.toLowerCase().replace(/\s+/g,' ').slice(0,500);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  const claims=[...groups.entries()].map(([key,rows])=>({claim:rows[0].claim,sourceCount:new Set(rows.map(r=>r.sourceUrl)).size,sourceClasses:[...new Set(rows.map(r=>r.sourceClass))].sort(),meanConfidence:Number((rows.reduce((s,r)=>s+(r.confidence??0.5),0)/rows.length).toFixed(4)),evidence:rows})).sort((a,b)=>b.sourceCount-a.sourceCount||b.meanConfidence-a.meanConfidence||a.claim.localeCompare(b.claim));
  const conflicts=[];
  for(let i=0;i<claims.length;i++)for(let j=i+1;j<claims.length;j++){const a=claims[i].claim.toLowerCase(),b=claims[j].claim.toLowerCase();const negA=/\b(no|not|never|without|false)\b/.test(a),negB=/\b(no|not|never|without|false)\b/.test(b);const tokensA=new Set(a.match(/[a-z0-9]{4,}/g)||[]),tokensB=new Set(b.match(/[a-z0-9]{4,}/g)||[]);let overlap=0;for(const t of tokensA)if(tokensB.has(t))overlap++;if(negA!==negB&&overlap>=2)conflicts.push({left:claims[i].claim,right:claims[j].claim,reason:'lexical-polarity-conflict'});}
  const packet={question:q,observationCount:normalized.length,claimCount:claims.length,claims,conflicts,provenanceComplete:true};
  return envelope({ok:true,status:'PUBLIC_RESEARCH_PACKET_READY',packet,packetDigest:hash(packet),networkAuthority:'NONE',claimBoundary:'THIS FUSES ALREADY_ACQUIRED PUBLIC EVIDENCE WITH PROVENANCE. LIVE PLATFORM REACHABILITY DEPENDS ON SEPARATE PERMITTED ADAPTERS AND IS NOT IMPLIED'});
}

export function inspectNativeResearchSecurityCoverage(){
  const crawl={pages:[{url:'https://owned.example',title:'Owned',description:'test',h1Count:1,visibleH1:['Owned Site'],headings:[],robotsMeta:[],responseHeaders:{},jsonLd:[],genericHero:false,ctas:[{aboveFold:true,text:'Contact'}],mobile:{horizontalOverflow:false,controls:[],ctas:[{aboveFold:true}]},images:[],forms:[],brokenLinks:[],contactSignals:1,bodyText:'owned test site',lang:'en',screenshots:{}}],errors:[]};
  const security=compileOwnedTargetSecurityEvidence({targetClass:'OWNED_LOCAL',crawl,sourceFindings:[{id:'s1',severity:2,summary:'test source finding',evidenceRef:'test:source'}]});
  const research=compilePublicResearchPacket({question:'What changed?',observations:[{sourceUrl:'https://example.com/a',sourceClass:'PUBLIC_WEB',claim:'Capability A is available',observedAt:'2026-09-13T10:00:00Z',evidenceDigest:'a'.repeat(64),confidence:0.9},{sourceUrl:'https://example.org/b',sourceClass:'PUBLIC_REGISTRY',claim:'Capability A is available',observedAt:'2026-09-13T10:01:00Z',evidenceDigest:'b'.repeat(64),confidence:0.8}]});
  const coverage={ownedTargetSecurityEvidence:{ok:security.ok,status:security.status},publicResearchFusion:{ok:research.ok,status:research.status}};
  return envelope({ok:security.ok===true&&research.ok===true,status:security.ok&&research.ok?'NATIVE_RESEARCH_SECURITY_COVERAGE_READY':'NATIVE_RESEARCH_SECURITY_COVERAGE_DEGRADED',coverage,readyCount:Object.values(coverage).filter(x=>x.ok).length,total:2,receiptDigest:hash(coverage),remainingExternalCapabilities:['AUTONOMOUS_EXPLOIT_VERIFICATION_RUNTIME','LIVE_CROSS_PLATFORM_PUBLIC_RESEARCH_ADAPTERS'],truthBoundary:'INTERNAL SECURITY TRIAGE AND RESEARCH FUSION ARE READY; AUTONOMOUS EXPLOIT EXECUTION AND LIVE PLATFORM-SPECIFIC REACH REQUIRE SEPARATE RUNTIME EVIDENCE'});
}
