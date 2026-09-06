import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graphPath = path.join(root, 'data', 'uberbond-ultimate-graph-latest.json');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'private, no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-robots-tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(body));
}
function text(value, max = 240) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function integer(value, fallback, min, max) { const parsed = Number(value); return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }
function nodeLabel(node) { return node?.label || node?.name || node?.path || node?.sourcePath || node?.featureAtomId || node?.id || 'unknown'; }
function publicNode(node) { return { id:node.id, class:node.class||null, label:nodeLabel(node), kind:node.kind||node.artifactKind||null, truthClass:node.truthClass||null, path:node.path||node.sourcePath||null, organId:node.organId||null, families:Array.isArray(node.families)?node.families.slice(0,12):[], organs:Array.isArray(node.organs)?node.organs.slice(0,12):[], maturity:node.maturity||null, implementationStatus:node.implementationStatus||null }; }
function publicEdge(edge) { return { id:edge.id, from:edge.from, to:edge.to, type:edge.type||'RELATION' }; }
function searchable(node) { return JSON.stringify({ id:node.id,class:node.class,label:node.label,name:node.name,path:node.path,sourcePath:node.sourcePath,kind:node.kind,artifactKind:node.artifactKind,families:node.families,organs:node.organs,organId:node.organId,maturity:node.maturity,implementationStatus:node.implementationStatus }).toLowerCase(); }
function lensPredicate(lens,node){const cls=String(node?.class||'').toUpperCase(),hay=searchable(node);if(lens==='all')return true;if(lens==='brain')return cls==='COGNITIVE_ORGAN'||/world-brain|max-council|wallbreaker|genesis|gamechanger|context-spine|truth-evidence|economic-memory|compute-sovereignty|capability-genome|self-maintainer/.test(hay);if(lens==='software')return cls==='REPOSITORY_ARTIFACT'||cls==='EXPORTED_CODE_FEATURE'||/^DEEP_(CODE_SYMBOL|DECLARED_BINDING|IMPORT|REEXPORT|HTTP_ROUTE|SQL_OBJECT|TEST_CASE|UI_SURFACE|CSS_SELECTOR)$/.test(cls);if(lens==='memory')return cls==='TOTAL_BRAIN_MEMORY_ATOM'||cls==='HISTORICAL_DONOR'||/^DEEP_DOCUMENT_/.test(cls)||/memory|canon|context|handoff|history|lineage/.test(hay);if(lens==='capability')return cls==='GENESIS_IDEA'||cls==='READINESS_CAPABILITY'||cls==='ACTIVATION_GATE'||/capability|model|skill|plugin|genesis|harvest|frontier/.test(hay);if(lens==='economic')return /economic|payment|revenue|opportunity|offer|distribution|retention|renewal|customer|fulfil|event-horizon|business-genome/.test(hay);if(lens==='evolution')return cls==='GENESIS_IDEA'||cls==='HISTORICAL_DONOR'||/genesis|evolution|metabolism|self-maintain|wallbreaker|mutation|experiment|benchmark|learning/.test(hay);return true;}
function degreeMap(graph){const d=new Map(graph.nodes.map(n=>[n.id,0]));for(const e of graph.edges){d.set(e.from,(d.get(e.from)||0)+1);d.set(e.to,(d.get(e.to)||0)+1);}return d;}
function project(graph,{lens='brain',query=null,limit=180}={}){const degree=degreeMap(graph),needle=query?query.toLowerCase():null;const selected=graph.nodes.filter(n=>lensPredicate(lens,n)).filter(n=>!needle||searchable(n).includes(needle)).sort((a,b)=>(degree.get(b.id)||0)-(degree.get(a.id)||0)||nodeLabel(a).localeCompare(nodeLabel(b))).slice(0,limit);const ids=new Set(selected.map(n=>n.id));const edges=graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).slice(0,limit*8);return{nodes:selected.map(publicNode),edges:edges.map(publicEdge),projection:{lens,query,projectedNodeCount:selected.length,projectedEdgeCount:edges.length,canonicalNodeCount:graph.nodeCount??graph.nodes.length,canonicalEdgeCount:graph.edgeCount??graph.edges.length,hiddenNodeCount:Math.max(0,(graph.nodeCount??graph.nodes.length)-selected.length),hiddenEdgeCount:Math.max(0,(graph.edgeCount??graph.edges.length)-edges.length),amputation:false,law:'HIDDEN_IN_PROJECTION_NEVER_MEANS_DELETED_FROM_CANONICAL_GRAPH'}};}
function neighborhood(graph,id,depth=1,limit=220){const byId=new Map(graph.nodes.map(n=>[n.id,n]));if(!byId.has(id))return null;const adjacency=new Map();for(const e of graph.edges){if(!adjacency.has(e.from))adjacency.set(e.from,[]);if(!adjacency.has(e.to))adjacency.set(e.to,[]);adjacency.get(e.from).push(e.to);adjacency.get(e.to).push(e.from);}const visited=new Set([id]);let frontier=[id];for(let step=0;step<depth&&visited.size<limit;step+=1){const next=[];for(const current of frontier){for(const neighbor of adjacency.get(current)||[]){if(visited.size>=limit)break;if(!visited.has(neighbor)){visited.add(neighbor);next.push(neighbor);}}}frontier=next;}const edges=graph.edges.filter(e=>visited.has(e.from)&&visited.has(e.to)).slice(0,limit*8);return{nodes:[...visited].map(n=>publicNode(byId.get(n))).filter(Boolean),edges:edges.map(publicEdge),projection:{lens:'neighborhood',focusNode:id,depth,projectedNodeCount:visited.size,projectedEdgeCount:edges.length,canonicalNodeCount:graph.nodeCount??graph.nodes.length,canonicalEdgeCount:graph.edgeCount??graph.edges.length,hiddenNodeCount:Math.max(0,(graph.nodeCount??graph.nodes.length)-visited.size),hiddenEdgeCount:Math.max(0,(graph.edgeCount??graph.edges.length)-edges.length),amputation:false,law:'HIDDEN_IN_PROJECTION_NEVER_MEANS_DELETED_FROM_CANONICAL_GRAPH'}};}
function summary(graph){const organs=graph.nodes.filter(n=>n.class==='COGNITIVE_ORGAN').map(publicNode),organIds=new Set(organs.map(n=>n.id));return{organs,organEdges:graph.edges.filter(e=>organIds.has(e.from)&&organIds.has(e.to)).map(publicEdge),classCounts:graph.classCounts||{},edgeTypeCounts:graph.edgeTypeCounts||{},coverage:{repositoryArtifactCount:graph.repositoryArtifactCount??null,featureAtomCount:graph.featureAtomCount??null,deepFeatureCount:graph.deepFeatureCount??null,canonicalNodeCount:graph.nodeCount??graph.nodes.length,canonicalEdgeCount:graph.edgeCount??graph.edges.length,orphanNodeCount:Array.isArray(graph.orphanNodes)?graph.orphanNodes.length:null,missingArtifactCount:Array.isArray(graph.missingArtifacts)?graph.missingArtifacts.length:null,missingFeatureAtomCount:Array.isArray(graph.missingFeatureAtoms)?graph.missingFeatureAtoms.length:null,missingDeepFeatureCount:Array.isArray(graph.missingDeepFeatures)?graph.missingDeepFeatures.length:null}};}

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('allow','GET');return send(res,405,{ok:false,status:'METHOD_NOT_ALLOWED'});}
  try{
    const graph=JSON.parse(await readFile(graphPath,'utf8'));
    if(!graph?.ok||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))throw new Error('invalid-graph');
    const url=new URL(req.url||'/api/ultimate-graph','https://uberbond.invalid');
    const view=text(url.searchParams.get('view'),32)||'overview';
    const lens=text(url.searchParams.get('lens'),32)||'brain';
    const query=text(url.searchParams.get('q'),200);
    const limit=integer(url.searchParams.get('limit'),180,20,500);
    let payload;
    if(view==='summary')payload=summary(graph);
    else if(view==='neighborhood'){const id=text(url.searchParams.get('id'),500);if(!id)return send(res,400,{ok:false,status:'REFUSED',reasonCodes:['node-id-required']});payload=neighborhood(graph,id,integer(url.searchParams.get('depth'),1,1,2),limit);if(!payload)return send(res,404,{ok:false,status:'NOT_FOUND',reasonCodes:['node-not-found']});}
    else payload=project(graph,{lens,query,limit});
    return send(res,200,{ok:true,status:'ULTIMATE_GRAPH_PROJECTION_READY',graphDigest:graph.graphDigest||null,graphStatus:graph.status||null,memoryContract:graph.memoryContract||null,truthBoundary:graph.truthBoundary||null,hostingBoundary:'VERCEL_DEPLOYMENT_PROTECTED_LITE_READ_ONLY_SNAPSHOT',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...payload});
  }catch{return send(res,503,{ok:false,status:'ULTIMATE_GRAPH_UNAVAILABLE',reasonCodes:['generated-graph-snapshot-unavailable']});}
}
