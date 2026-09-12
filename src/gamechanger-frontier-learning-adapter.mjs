export const GAMECHANGER_FRONTIER_LEARNING_ADAPTER_VERSION='uberbond.gamechanger-frontier-learning-adapter.v1';
const STOP=new Set(['the','and','for','with','from','that','this','into','over','under','when','where','what','which','while','about','their','there','have','has','had','will','would','could','should','using','use','used','new','now','more','most','less','than','then','they','them','you','your','our','are','was','were','been','being','not','but','can']);
const text=v=>String(v??'').trim();
function tokens(value){return [...new Set(text(value).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9_-]+/g,' ').split(/\s+/).filter(x=>x.length>=4&&!STOP.has(x)))].slice(0,12);}
function domains(signal={}){return Array.isArray(signal.domains)?signal.domains.map(v=>text(v).toLowerCase()).filter(Boolean):[];}
export function discoveryFingerprint(signal={}){const atoms=[...new Set([...domains(signal),...tokens(signal.claimedChange),...tokens(signal.summary)])].slice(0,16);return atoms.length?atoms:['unresolved-signal'];}
export function adaptGamechangerReceipt(receipt={}){
 const reasons=[];
 if(receipt?.networkReadAuthority!=='PUBLIC_RESEARCH_ONLY') reasons.push('PUBLIC_RESEARCH_RECEIPT_REQUIRED');
 if(receipt?.businessEffectAuthority!=='NONE') reasons.push('ZERO_BUSINESS_AUTHORITY_REQUIRED');
 if(reasons.length)return {ok:false,reasons,observations:[]};
 const packets=Array.isArray(receipt.intelligencePackets)?receipt.intelligencePackets:[];
 const observations=[];
 for(const packet of packets){const signal=packet?.normalizedSignal;if(!signal||packet?.promotionAuthority!=='NONE')continue;const refs=Array.isArray(signal.evidenceRefs)?signal.evidenceRefs.filter(Boolean):[];if(!refs.length)continue;observations.push({policyDecision:'ALLOW',sourceRef:text(signal.source)||refs[0],sourceKind:'GAMECHANGER_PUBLIC_SIGNAL',rightsState:'PUBLIC_FACTS',mechanismAtoms:discoveryFingerprint(signal),observations:[text(signal.claimedChange)||text(signal.summary)].filter(Boolean),evidenceRefs:refs,novelty:.65,impact:.7,evidenceStrength:Math.max(0,Math.min(1,(Number(signal.confidence)||50)/100)),legalConfidence:1,founderMinutes:0,costUsd:0,discoveryFingerprintOnly:true,capabilityAtomAuthority:'NONE'});}
 return {ok:true,reasons:[],observations,truthBoundary:'DISCOVERY_FINGERPRINTS_CLUSTER_SIGNALS_BUT_ARE_NOT_CAPABILITY_ATOMS',executionAuthority:'NONE'};
}
