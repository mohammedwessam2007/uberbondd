#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoverageReceipt, buildSourceFetchPlan, buildGamechangerTournament, buildFrontierSignalFromGamechanger } from '../src/gamechanger-mesh.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=new Map();for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(a.startsWith('--'))args.set(a,process.argv[i+1]?.startsWith('--')?true:process.argv[++i]??true);}
const registryPath=resolve(root,String(args.get('--sources')||'data/gamechanger-mesh/sources.json'));
const outputPath=resolve(root,String(args.get('--output')||'artifacts/gamechanger-mesh-latest.json'));
const knownPath=args.get('--known')?resolve(root,String(args.get('--known'))):null;
const dryRun=args.has('--dry-run');
const observedAt=new Date().toISOString();
const registry=JSON.parse(await readFile(registryPath,'utf8'));
const sources=Array.isArray(registry.sources)?registry.sources:[];
const coverage=buildCoverageReceipt({sources,minIndependentSourcesPerDomain:2});
const plan=buildSourceFetchPlan({sources,now:observedAt});

function clean(s=''){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}
function first(block,tag){const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return m?clean(m[1]):null;}
function feedItems(xml,source){const blocks=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0,50).map(m=>m[2]),out=[];let n=0;for(const b of blocks){const title=first(b,'title'),summary=first(b,'description')||first(b,'summary')||first(b,'content')||title;let link=first(b,'link');if(!link){const lm=b.match(/<link[^>]+href=["']([^"']+)["']/i);link=lm?.[1]||source.url;}const publishedAt=first(b,'pubDate')||first(b,'published')||first(b,'updated');if(title&&summary)out.push({id:`${source.id}:${n++}`,sourceId:source.id,sourceTier:source.sourceTier,sourceType:'FEED_ITEM',url:link||source.url,title,summary:summary.slice(0,6000),observedAt,publishedAt:publishedAt||null,domains:source.domains,evidenceRefs:[link||source.url],claims:[]});}return out;}
function hnItems(json,source){const hits=Array.isArray(json?.hits)?json.hits.slice(0,50):[],out=[];let n=0;for(const h of hits){const title=String(h.title||h.story_title||'').trim(),url=h.url||h.story_url;if(!title||!url||!String(url).startsWith('https://'))continue;out.push({id:`${source.id}:${n++}`,sourceId:source.id,sourceTier:source.sourceTier,sourceType:'COMMUNITY_SIGNAL',url,title,summary:`Hacker News signal: ${title}`,observedAt,publishedAt:h.created_at||null,domains:source.domains,evidenceRefs:[url],claims:[]});}return out;}
function htmlObservation(html,source){const title=clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||source.id);const body=clean(html).slice(0,6000);return body?[{id:`${source.id}:page`,sourceId:source.id,sourceTier:source.sourceTier,sourceType:'PUBLIC_PAGE_SNAPSHOT',url:source.url,title,summary:body,observedAt,domains:source.domains,evidenceRefs:[source.url],claims:[]}]:[];}
async function fetchSource(source){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);try{const res=await fetch(source.url,{signal:controller.signal,redirect:'follow',headers:{'user-agent':'UberBond-GamechangerMesh/1.0 public-research-read','accept':'application/json, application/rss+xml, application/atom+xml, text/xml, text/html;q=0.9, */*;q=0.5'}});if(!res.ok)throw new Error(`http-${res.status}`);const len=Number(res.headers.get('content-length')||0);if(len>2_000_000)throw new Error('response-too-large');const body=(await res.text()).slice(0,2_000_000);if(source.parser==='JSON_HN')return hnItems(JSON.parse(body),source);if(source.parser==='RSS'||source.parser==='ATOM'||/xml|rss|atom/i.test(res.headers.get('content-type')||''))return feedItems(body,source);return htmlObservation(body,source);}finally{clearTimeout(timer);}}

const observations=[],fetchReceipts=[];
if(!dryRun){for(const source of plan.directReads){try{const items=await fetchSource(source);observations.push(...items);fetchReceipts.push({sourceId:source.id,status:'READ_OK',items:items.length});}catch(error){fetchReceipts.push({sourceId:source.id,status:'READ_FAILED',reason:String(error?.message||error).slice(0,300)});}}}
let knownFingerprints=[];if(knownPath){try{const known=JSON.parse(await readFile(knownPath,'utf8'));knownFingerprints=Array.isArray(known)?known:Array.isArray(known.fingerprints)?known.fingerprints:[];}catch{}}
const tournament=buildGamechangerTournament({observations,knownFingerprints,maxEscalations:25});
const frontierSignals=tournament.ok?tournament.escalations.map(buildFrontierSignalFromGamechanger).filter(x=>x.ok).map(x=>x.signal):[];
const receipt={schemaVersion:'uberbond.gamechanger-mesh.tick.v1',generatedAt:observedAt,dryRun,coverage,sourcePlan:{status:plan.status,directReads:plan.directReads.map(x=>({id:x.id,url:x.url,domains:x.domains})),searchLanes:plan.searchLanes,invalid:plan.invalid},fetchReceipts,tournament,frontierSignals,businessEffectAuthority:'NONE',externalEffectLedger:{messages:0,moneyMovements:0,providerCalls:0},truthBoundary:'PUBLIC_SIGNAL_IS_NOT_OPPORTUNITY_PROOF_OR_COMMERCIAL_PROOF'};
await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify({status:receipt.tournament.status,observations:observations.length,escalations:receipt.tournament.escalations?.length||0,coverage:coverage.coverageRatio,coverageGaps:coverage.gaps?.length||0,searchLanes:plan.searchLanes.length,fetchFailures:fetchReceipts.filter(x=>x.status==='READ_FAILED').length,output:outputPath,businessEffectAuthority:'NONE'},null,2));
