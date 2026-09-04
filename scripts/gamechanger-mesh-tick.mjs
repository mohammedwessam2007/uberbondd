#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoverageReceipt, buildSourceFetchPlan, buildGamechangerTournament, buildFrontierSignalFromGamechanger } from '../src/gamechanger-mesh.mjs';
import { normalizeFrontierSignal, buildIdeaAtomizationPacket, buildFrontierThinkerSwarm } from '../src/autonomous-frontier-intelligence.mjs';
import { buildGdeltSearchUrl, parseGdeltArticles, parseGitHubRepositories, parseHuggingFaceModels, mergeGamechangerState, advanceGamechangerState } from '../src/gamechanger-search-adapters.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=new Map();for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(a.startsWith('--'))args.set(a,process.argv[i+1]?.startsWith('--')?true:process.argv[++i]??true);}
const registryPath=resolve(root,String(args.get('--sources')||'data/gamechanger-mesh/sources.json'));
const structuredPath=resolve(root,String(args.get('--structured-sources')||'data/gamechanger-mesh/structured-sources.json'));
const outputPath=resolve(root,String(args.get('--output')||'artifacts/gamechanger-mesh-latest.json'));
const statePath=resolve(root,String(args.get('--state')||'.cache/gamechanger-mesh-state.json'));
const knownPath=args.get('--known')?resolve(root,String(args.get('--known'))):null;
const dryRun=args.has('--dry-run');
const observedAt=new Date().toISOString();

async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}}
const registry=await readJson(registryPath,{sources:[]});
const structured=await readJson(structuredPath,{sources:[]});
const priorState=await readJson(statePath,{schemaVersion:'uberbond.gamechanger-mesh-state.v2',fingerprints:[],lastCheckedAtBySource:{}});
const configuredSources=[...(Array.isArray(registry.sources)?registry.sources:[]),...(Array.isArray(structured.sources)?structured.sources:[])];
const sources=mergeGamechangerState(priorState,configuredSources);
const coverage=buildCoverageReceipt({sources,minIndependentSourcesPerDomain:2});
const plan=buildSourceFetchPlan({sources,now:observedAt});

function clean(s=''){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}
function first(block,tag){const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return m?clean(m[1]):null;}
function feedItems(xml,source){const blocks=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0,60).map(m=>m[2]),out=[];let n=0;for(const b of blocks){const title=first(b,'title'),summary=first(b,'description')||first(b,'summary')||first(b,'content')||title;let link=first(b,'link');if(!link){const lm=b.match(/<link[^>]+href=["']([^"']+)["']/i);link=lm?.[1]||source.url;}const publishedAt=first(b,'pubDate')||first(b,'published')||first(b,'updated');if(title&&summary&&String(link||'').startsWith('https://'))out.push({id:`${source.id}:${n++}`,sourceId:source.id,sourceTier:source.sourceTier,sourceType:'FEED_ITEM',url:link,title,summary:summary.slice(0,6000),observedAt,publishedAt:publishedAt||null,domains:source.domains,evidenceRefs:[link],claims:[]});}return out;}
function hnItems(json,source){const hits=Array.isArray(json?.hits)?json.hits.slice(0,60):[],out=[];let n=0;for(const h of hits){const title=String(h.title||h.story_title||'').trim(),url=h.url||h.story_url;if(!title||!url||!String(url).startsWith('https://'))continue;out.push({id:`${source.id}:${n++}`,sourceId:source.id,sourceTier:source.sourceTier,sourceType:'COMMUNITY_SIGNAL',url,title,summary:`Hacker News public discovery signal: ${title}`,observedAt,publishedAt:h.created_at||null,domains:source.domains,evidenceRefs:[url],claims:[]});}return out;}
function htmlObservation(html,source){const title=clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||source.id);const body=clean(html).slice(0,6000);return body?[{id:`${source.id}:page`,sourceId:source.id,sourceTier:source.sourceTier,sourceType:'PUBLIC_PAGE_SNAPSHOT',url:source.url,title,summary:body,observedAt,domains:source.domains,evidenceRefs:[source.url],claims:[]}]:[];}

async function publicFetch(url,{accept='application/json, application/rss+xml, application/atom+xml, text/xml, text/html;q=0.9, */*;q=0.5'}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const headers={'user-agent':'UberBond-GamechangerMesh/2.0 public-research-read','accept':accept};
    if(new URL(url).hostname==='api.github.com'&&process.env.GITHUB_TOKEN)headers.authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
    const res=await fetch(url,{signal:controller.signal,redirect:'follow',headers});
    if(!res.ok)throw new Error(`http-${res.status}`);
    const len=Number(res.headers.get('content-length')||0);if(len>2_000_000)throw new Error('response-too-large');
    return {body:(await res.text()).slice(0,2_000_000),contentType:res.headers.get('content-type')||''};
  }finally{clearTimeout(timer);}
}

async function fetchSource(source){
  const {body,contentType}=await publicFetch(source.url);
  if(source.parser==='JSON_HN')return hnItems(JSON.parse(body),source);
  if(source.parser==='JSON_GITHUB')return parseGitHubRepositories(JSON.parse(body),source,observedAt);
  if(source.parser==='JSON_HF')return parseHuggingFaceModels(JSON.parse(body),source,observedAt);
  if(source.parser==='RSS'||source.parser==='ATOM'||/xml|rss|atom/i.test(contentType))return feedItems(body,source);
  return htmlObservation(body,source);
}

async function searchLane(source){
  const url=buildGdeltSearchUrl(source.query,{maxRecords:40,timespan:'1d'});if(!url)throw new Error('invalid-search-query');
  const {body}=await publicFetch(url,{accept:'application/json'});
  return parseGdeltArticles(JSON.parse(body),source,observedAt);
}

const observations=[],fetchReceipts=[],searchReceipts=[],successfulSourceIds=[];
if(!dryRun){
  for(const source of plan.directReads){
    try{const items=await fetchSource(source);observations.push(...items);successfulSourceIds.push(source.id);fetchReceipts.push({sourceId:source.id,status:'READ_OK',items:items.length});}
    catch(error){fetchReceipts.push({sourceId:source.id,status:'READ_FAILED',reason:String(error?.message||error).slice(0,300)});}
  }
  for(const source of plan.searchLanes){
    try{const items=await searchLane(source);observations.push(...items);successfulSourceIds.push(source.id);searchReceipts.push({sourceId:source.id,status:'SEARCH_OK',items:items.length});}
    catch(error){searchReceipts.push({sourceId:source.id,status:'SEARCH_FAILED',reason:String(error?.message||error).slice(0,300)});}
  }
}

let knownFingerprints=Array.isArray(priorState.fingerprints)?priorState.fingerprints:[];
if(knownPath){const known=await readJson(knownPath,[]);knownFingerprints=[...new Set([...knownFingerprints,...(Array.isArray(known)?known:Array.isArray(known.fingerprints)?known.fingerprints:[])])];}
const tournament=buildGamechangerTournament({observations,knownFingerprints,maxEscalations:25});
const frontierSignals=tournament.ok?tournament.escalations.map(buildFrontierSignalFromGamechanger).filter(x=>x.ok).map(x=>x.signal):[];
const intelligencePackets=frontierSignals.map(signal=>{
  const normalized=normalizeFrontierSignal(signal);
  if(!normalized.ok)return {signalId:signal.id,status:'FRONTIER_NORMALIZATION_FAILED',reasonCodes:normalized.reasonCodes||[]};
  const atomization=buildIdeaAtomizationPacket({signal:normalized.signal,knownCapabilities:[],knownOpportunityMechanisms:[]});
  const thinkerSwarm=buildFrontierThinkerSwarm({missionId:`gamechanger-${signal.id.replace(/[^a-z0-9-]+/gi,'-').slice(0,120)}`,objective:`Determine what ${normalized.signal.summary} newly makes possible for UberBond. Separate capability improvement, economic mechanism, distribution leverage, cost-curve shift, risks, substitutes and evidence gaps. Preserve disagreement, seek primary corroboration and do not self-promote.`});
  return {signalId:signal.id,status:atomization.ok&&thinkerSwarm.ok?'FRONTIER_INTELLIGENCE_PACKET_READY':'FRONTIER_INTELLIGENCE_PACKET_PARTIAL',normalizedSignal:normalized.signal,atomization:atomization.ok?atomization.packet:null,thinkerSwarm:thinkerSwarm.ok?{missionId:thinkerSwarm.missionId,lanes:thinkerSwarm.lanes,synthesisRule:thinkerSwarm.synthesisRule}:null,reasonCodes:[...(atomization.reasonCodes||[]),...(thinkerSwarm.reasonCodes||[])],promotionAuthority:'NONE'};
});

const nextState=advanceGamechangerState(priorState,tournament,successfulSourceIds,observedAt);
if(!dryRun){await mkdir(dirname(statePath),{recursive:true});await writeFile(statePath,JSON.stringify(nextState,null,2)+'\n','utf8');}
const networkReadCalls=fetchReceipts.length+searchReceipts.length;
const receipt={schemaVersion:'uberbond.gamechanger-mesh.tick.v2',generatedAt:observedAt,dryRun,coverage,sourcePlan:{status:plan.status,directReads:plan.directReads.map(x=>({id:x.id,url:x.url,domains:x.domains})),searchLanes:plan.searchLanes.map(x=>({id:x.id,query:x.query,domains:x.domains})),invalid:plan.invalid},fetchReceipts,searchReceipts,tournament,frontierSignals,intelligencePackets,state:{path:statePath,previousFingerprints:Array.isArray(priorState.fingerprints)?priorState.fingerprints.length:0,currentFingerprints:nextState.fingerprints.length,rememberedSources:Object.keys(nextState.lastCheckedAtBySource).length},businessEffectAuthority:'NONE',externalEffectLedger:{messages:0,moneyMovements:0,providerCalls:networkReadCalls},networkReadAuthority:'PUBLIC_RESEARCH_ONLY',prohibitedEffects:['MESSAGE','MONEY_MOVEMENT','PURCHASE','DEPLOYMENT','CUSTOMER_STATE_MUTATION','AUTHORITY_WIDENING'],truthBoundary:'PUBLIC_SIGNAL_OR_SEARCH_RANK_IS_NOT_OPPORTUNITY_PROOF_COMMERCIAL_PROOF_OR_IMPLEMENTATION_PROOF'};
await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify({status:receipt.tournament.status,observations:observations.length,escalations:receipt.tournament.escalations?.length||0,intelligencePackets:intelligencePackets.length,coverage:coverage.coverageRatio,coverageGaps:coverage.gaps?.length||0,directReads:plan.directReads.length,searchLanes:plan.searchLanes.length,fetchFailures:fetchReceipts.filter(x=>x.status==='READ_FAILED').length,searchFailures:searchReceipts.filter(x=>x.status==='SEARCH_FAILED').length,rememberedFingerprints:nextState.fingerprints.length,networkReadCalls,output:outputPath,state:statePath,businessEffectAuthority:'NONE'},null,2));
