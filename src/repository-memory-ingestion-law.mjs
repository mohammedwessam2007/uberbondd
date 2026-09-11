import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const REPOSITORY_MEMORY_INGESTION_LAW_VERSION='uberbond.repository-memory-ingestion-law.v1';
const SHA256=/^(?:sha256:)?[0-9a-f]{64}$/i;
const AUTHORITY_CLASSES=new Set(['VERIFIED_CURRENT','DRAFT_BRANCH','HISTORICAL_DONOR','CHAT_SPEC_GOAL','EXTERNAL_BLOCKED','OWNER_BOUNDARY','REFERENCE_ONLY']);
const text=(v,max=1800)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const bounded=(v,max=128)=>Array.isArray(v)&&v.length<=max?v.map(x=>text(x,1800)).filter(Boolean):null;
const envelope=extra=>({businessEffectAuthority:'NONE',repositoryWriteAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function compileRepositoryMemoryIngestion(input={}){
  const observedAt=text(input.observedAt,80);const observedDate=observedAt?new Date(observedAt):null;
  const provenanceRefs=bounded(input.provenanceRefs||[]);const decisions=bounded(input.decisions||[]);const contradictions=bounded(input.contradictions||[]);const supersessionLinks=bounded(input.supersessionLinks||[]);
  const authorityClass=text(input.authorityClass,80)?.toUpperCase();const contentDigest=text(input.contentDigest,90);const bodyRef=text(input.bodyRef,1600);const shareUrl=text(input.shareUrl,1600);
  const reasonCodes=[];
  if(!observedDate||!Number.isFinite(observedDate.getTime()))reasonCodes.push('memory-observed-at-required');
  if(!provenanceRefs||provenanceRefs.length===0)reasonCodes.push('memory-provenance-required');
  if(!AUTHORITY_CLASSES.has(authorityClass))reasonCodes.push('memory-authority-class-required');
  if(!contentDigest||!SHA256.test(contentDigest))reasonCodes.push('memory-content-digest-required');
  if(!bodyRef)reasonCodes.push('repository-native-memory-body-ref-required');
  if(!decisions||!contradictions||!supersessionLinks)reasonCodes.push('bounded-memory-relations-required');
  if(shareUrl&&!bodyRef)reasonCodes.push('share-url-alone-is-not-durable-memory');
  if(reasonCodes.length)return envelope({ok:false,status:'REPOSITORY_MEMORY_INGESTION_BLOCKED',reasonCodes});
  return envelope({ok:true,status:'REPOSITORY_MEMORY_INGESTION_PACKET_READY',packet:{observedAt:observedDate.toISOString(),provenanceRefs,authorityClass,contentDigest,bodyRef,shareUrl:shareUrl||null,decisions,contradictions,supersessionLinks},truthBoundary:'THIS PACKET MAKES MATERIAL CONTEXT DURABLE AND PROVENANCE-BOUND; IT DOES NOT WRITE THE REPOSITORY OR PROMOTE CHAT CONTENT TO CURRENT TRUTH'});
}
