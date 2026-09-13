import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PUBLIC_RESEARCH_ADAPTER_MESH_VERSION='uberbond.public-research-adapter-mesh.v1.2';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'READ_ONLY_NETWORK',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
const text=(v,max=2000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const MAX_RESULTS=25;
const ALLOWED_PROVENANCE_HOSTS=Object.freeze({github:'github.com',hackernews:'news.ycombinator.com',npm:'registry.npmjs.org'});

function queryUrl(adapter,query,limit){
  const q=encodeURIComponent(query);
  if(adapter==='github')return `https://api.github.com/search/repositories?q=${q}&per_page=${limit}`;
  if(adapter==='hackernews')return `https://hn.algolia.com/api/v1/search?query=${q}&hitsPerPage=${limit}`;
  if(adapter==='npm')return `https://registry.npmjs.org/-/v1/search?text=${q}&size=${limit}`;
  return null;
}
function canonicalProvenanceUrl(adapter,value){
  try{
    const parsed=new URL(String(value||''));
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hostname!==ALLOWED_PROVENANCE_HOSTS[adapter])return null;
    parsed.hash='';return parsed.toString();
  }catch{return null;}
}
function parse(adapter,json){
  if(adapter==='github')return (json?.items||[]).map(x=>{const full=text(x.full_name,300);return {id:`github:${x.id}`,title:full,url:full?`https://github.com/${full}`:null,summary:x.description||'',observedSignals:{stars:x.stargazers_count,updatedAt:x.updated_at,language:x.language}};});
  if(adapter==='hackernews')return (json?.hits||[]).map(x=>({id:`hn:${x.objectID}`,title:x.title||x.story_title||'untitled',url:`https://news.ycombinator.com/item?id=${encodeURIComponent(String(x.objectID||''))}`,targetUrl:x.url||x.story_url||null,summary:x.story_text||x.comment_text||'',observedSignals:{points:x.points,createdAt:x.created_at,author:x.author}}));
  if(adapter==='npm')return (json?.objects||[]).map(x=>{const name=text(x.package?.name,300),encoded=name?encodeURIComponent(name):null;return {id:`npm:${name}`,title:name,url:encoded?`https://registry.npmjs.org/${encoded}`:null,targetUrl:encoded?`https://www.npmjs.com/package/${encoded}`:null,summary:x.package?.description||'',observedSignals:{version:x.package?.version,date:x.package?.date,score:x.score?.final}};});
  return [];
}

export async function searchPublicAdapter({adapter,query,limit=10,fetchImpl=globalThis.fetch,timeoutMs=8000}={}){
  const id=String(adapter||'').toLowerCase(),q=text(query,500),cap=Number(limit),timeout=Number(timeoutMs);
  if(!['github','hackernews','npm'].includes(id)||!q||!Number.isSafeInteger(cap)||cap<1||cap>MAX_RESULTS||!Number.isSafeInteger(timeout)||timeout<100||timeout>30000||typeof fetchImpl!=='function')return envelope({ok:false,status:'PUBLIC_RESEARCH_ADAPTER_INVALID',reasonCodes:['recognized-adapter-query-bounds-and-fetch-required']});
  const url=queryUrl(id,q,cap),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetchImpl(url,{method:'GET',redirect:'follow',signal:controller.signal,headers:{accept:'application/json','user-agent':'UberBond-Public-Research/1.0'}});
    if(!response.ok)return envelope({ok:false,status:'PUBLIC_RESEARCH_ADAPTER_FAILED',adapter:id,reasonCodes:[`http-status-${response.status}`]});
    const json=await response.json(),rows=parse(id,json).slice(0,cap).map(r=>({...r,url:canonicalProvenanceUrl(id,r.url)})).filter(r=>r.id&&r.title&&r.url);
    const observedAt=new Date().toISOString();
    const results=rows.map(r=>({...r,adapter:id,sourceUrl:r.url,observedAt,evidenceDigest:hash({adapter:id,id:r.id,title:r.title,url:r.url,targetUrl:r.targetUrl||null,summary:r.summary,observedSignals:r.observedSignals})}));
    return envelope({ok:true,status:'PUBLIC_RESEARCH_ADAPTER_COMPLETE',adapter:id,query:q,resultCount:results.length,results,receiptDigest:hash({adapter:id,query:q,results:results.map(r=>r.evidenceDigest)}),claimBoundary:'PUBLIC_SEARCH_RESULTS_ARE OBSERVATIONS_WITH_CANONICAL_SOURCE_PROVENANCE_NOT_VERIFIED_FACTS'});
  }catch(error){return envelope({ok:false,status:'PUBLIC_RESEARCH_ADAPTER_FAILED',adapter:id,reasonCodes:['network-read-failed'],errorClass:String(error?.name||'ERROR')});}
  finally{clearTimeout(timer);}
}

export async function searchPublicMesh({query,adapters=['github','hackernews','npm'],limitPerAdapter=5,fetchImpl=globalThis.fetch}={}){
  const unique=[...new Set((Array.isArray(adapters)?adapters:[]).map(x=>String(x).toLowerCase()))].filter(x=>['github','hackernews','npm'].includes(x));
  if(!text(query,500)||unique.length<2)return envelope({ok:false,status:'PUBLIC_RESEARCH_MESH_INVALID',reasonCodes:['query-and-at-least-two-recognized-adapters-required']});
  const settled=await Promise.all(unique.map(adapter=>searchPublicAdapter({adapter,query,limit:limitPerAdapter,fetchImpl})));
  const successes=settled.filter(x=>x.ok),failures=settled.filter(x=>!x.ok).map(x=>({adapter:x.adapter||'unknown',reasonCodes:x.reasonCodes||[]}));
  const byUrl=new Map();for(const receipt of successes)for(const row of receipt.results){const key=row.sourceUrl.toLowerCase();if(!byUrl.has(key))byUrl.set(key,row);}
  const results=[...byUrl.values()].sort((a,b)=>a.adapter.localeCompare(b.adapter)||a.id.localeCompare(b.id));
  const state={requestedAdapters:unique,successfulAdapters:successes.map(x=>x.adapter).sort(),failedAdapters:failures.map(x=>x.adapter).sort(),resultCount:results.length};
  return envelope({ok:successes.length>=2,status:successes.length===unique.length?'PUBLIC_RESEARCH_MESH_COMPLETE':successes.length>=2?'PUBLIC_RESEARCH_MESH_PARTIAL':'PUBLIC_RESEARCH_MESH_INSUFFICIENT',state,results,failures,meshDigest:hash({state,evidence:results.map(r=>r.evidenceDigest)}),claimBoundary:'MESH_REQUIRES_AT_LEAST_TWO_INDEPENDENT_PUBLIC_ADAPTERS; PARTIAL_FAILURE_IS_VISIBLE; OBSERVATIONS_RETAIN_CANONICAL_SOURCE_IDENTITY'});
}
