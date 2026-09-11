import crypto from 'node:crypto';
import { authenticate, contradictions, traverse } from './life-knowledge-graph.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const KNOWLEDGE_LABYRINTH_UBERGRAPH_VERSION = 'uberbond.knowledge-labyrinth-ubergraph.v1';
const DOMAINS = new Set(['REALITY','SELF','COMPANY','CAPABILITY','EVIDENCE','CAUSALITY','TEMPORAL']);
const text=(v,m=2000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=(reasonCodes,extra={})=>({ok:false,status:'KNOWLEDGE_LABYRINTH_BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function normalizeSemanticMatch(raw){
  const nodeId=text(raw?.nodeId,240), sourceRef=text(raw?.sourceRef,1000), score=Number(raw?.score);
  if(!nodeId||!sourceRef||!Number.isFinite(score)||score<0||score>1)return null;
  return {nodeId,sourceRef,score:Number(score.toFixed(6))};
}

/**
 * Compiles the three canonical knowledge planes without pretending any adapter
 * exists: transactional refs are durable-truth pointers, semantic matches are
 * caller-supplied vector evidence, and causal structure reuses the provenance-
 * typed Life Knowledge Graph. The output is a read-only reasoning packet.
 */
export function compileKnowledgeLabyrinth({
  nodes=[], edges=[], claims=[], transactionRefs=[], semanticMatches=[], startNodes=[], strictOnly=true, maxDepth=4, asOf=new Date().toISOString()
}={}){
  if(!Array.isArray(nodes)||nodes.length>20000||!Array.isArray(edges)||edges.length>100000)return fail(['bounded-graph-required']);
  const normalizedNodes=[];const ids=new Set();
  for(const raw of nodes){
    const id=text(raw?.id,240),domain=text(raw?.domain,80)?.toUpperCase();
    if(!id||!DOMAINS.has(domain)||ids.has(id))return fail(['unique-node-id-and-recognized-domain-required']);
    ids.add(id);normalizedNodes.push({id,domain,label:text(raw?.label,500)||id,observedAt:text(raw?.observedAt,100)||null});
  }
  const tx=[...new Set((Array.isArray(transactionRefs)?transactionRefs:[]).map(v=>text(v,1000)).filter(Boolean))];
  const semantic=(Array.isArray(semanticMatches)?semanticMatches:[]).map(normalizeSemanticMatch);
  if(semantic.some(v=>!v))return fail(['provenance-bearing-semantic-matches-required']);
  if(semantic.some(v=>!ids.has(v.nodeId)))return fail(['semantic-match-node-must-exist']);
  const provenance=[];
  for(const raw of (Array.isArray(claims)?claims:[])){
    const result=authenticate(raw);if(!result.ok)return fail(['claim-provenance-invalid',...(result.reasonCodes||[])]);provenance.push(result);
  }
  const starts=[...new Set((Array.isArray(startNodes)?startNodes:[]).map(v=>text(v,240)).filter(Boolean))];
  if(starts.some(id=>!ids.has(id)))return fail(['start-node-must-exist']);
  const traversals=starts.map(from=>traverse({edges,from,strictOnly,maxDepth}));
  if(traversals.some(r=>!r.ok))return fail(['graph-traversal-invalid']);
  const conflictReport=contradictions(edges);
  const packet={
    schemaVersion:'uberbond.knowledge-labyrinth.packet.v1',asOf:text(asOf,100),nodes:normalizedNodes,edgeCount:edges.length,
    transactionRefs:tx,semanticMatches:semantic.sort((a,b)=>b.score-a.score||a.nodeId.localeCompare(b.nodeId)),
    provenance,traversals,contradictions:conflictReport,
    planes:{transactional:'REFERENCE_ONLY',semantic:'CALLER_SUPPLIED_PROVENANCE_BOUND_MATCHES',graph:'PROVENANCE_TYPED_CAUSAL_RELATIONSHIPS'},
    law:'CONTRADICTIONS_STAY_OPEN; WEAK_EDGES_DO_NOT_BECOME_STRONG_BY_GRAPH_POSITION; SEMANTIC_SIMILARITY_IS_NOT TRUTH',
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()
  };
  return {ok:true,status:'KNOWLEDGE_LABYRINTH_READY',packet,packetDigest:digest(packet),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export const KNOWLEDGE_LABYRINTH_DOMAINS=Object.freeze([...DOMAINS]);
