import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileContextProjection, verifyContextProjection } from './context-projection.mjs';
import { routeCapabilityModel } from './capability-genome-runtime.mjs';
import { validateOrchestrationGraph } from './orchestration-frontier.mjs';

export const NATIVE_RUNTIME_SUBSTITUTES_VERSION='uberbond.native-runtime-substitutes.v1';
const MAX_INPUT_BYTES=8*1024*1024;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function compressLosslessContext({value,encoding='json',quality=5}={}){
  let bytes;
  try{bytes=encoding==='utf8'?Buffer.from(String(value??''),'utf8'):Buffer.from(JSON.stringify(value),'utf8');}catch{return envelope({ok:false,status:'CONTEXT_COMPRESSION_INVALID',reasonCodes:['serializable-value-required']});}
  if(bytes.length>MAX_INPUT_BYTES)return envelope({ok:false,status:'CONTEXT_COMPRESSION_INVALID',reasonCodes:['bounded-input-required']});
  const q=Number(quality);if(!Number.isInteger(q)||q<0||q>11)return envelope({ok:false,status:'CONTEXT_COMPRESSION_INVALID',reasonCodes:['brotli-quality-0-11-required']});
  const compressed=zlib.brotliCompressSync(bytes,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:q}});
  const packet={schemaVersion:'uberbond.lossless-context.v1',codec:'BROTLI',encoding,originalBytes:bytes.length,compressedBytes:compressed.length,originalSha256:hash(bytes),payloadBase64:compressed.toString('base64')};
  return envelope({ok:true,status:'LOSSLESS_CONTEXT_COMPRESSED',packet,compressionRatio:bytes.length?Number((compressed.length/bytes.length).toFixed(6)):0,packetDigest:hash(Buffer.from(JSON.stringify(packet)))});
}

export function restoreLosslessContext(packet={}){
  if(packet?.schemaVersion!=='uberbond.lossless-context.v1'||packet?.codec!=='BROTLI'||!['json','utf8'].includes(packet?.encoding)||!Number.isSafeInteger(packet?.originalBytes)||packet.originalBytes<0||packet.originalBytes>MAX_INPUT_BYTES||!/^[a-f0-9]{64}$/.test(String(packet?.originalSha256||''))||typeof packet?.payloadBase64!=='string')return envelope({ok:false,status:'CONTEXT_RESTORE_REFUSED',reasonCodes:['valid-lossless-packet-required']});
  let restored;try{const compressed=Buffer.from(packet.payloadBase64,'base64');restored=zlib.brotliDecompressSync(compressed);}catch{return envelope({ok:false,status:'CONTEXT_RESTORE_REFUSED',reasonCodes:['brotli-decompression-failed']});}
  if(restored.length!==packet.originalBytes)return envelope({ok:false,status:'CONTEXT_RESTORE_REFUSED',reasonCodes:['restored-length-mismatch']});
  if(hash(restored)!==packet.originalSha256)return envelope({ok:false,status:'CONTEXT_RESTORE_REFUSED',reasonCodes:['restored-digest-mismatch']});
  if(packet.encoding==='utf8')return envelope({ok:true,status:'LOSSLESS_CONTEXT_RESTORED',value:restored.toString('utf8'),originalSha256:packet.originalSha256});
  try{return envelope({ok:true,status:'LOSSLESS_CONTEXT_RESTORED',value:JSON.parse(restored.toString('utf8')),originalSha256:packet.originalSha256});}catch{return envelope({ok:false,status:'CONTEXT_RESTORE_REFUSED',reasonCodes:['restored-json-invalid']});}
}

function sampleMount(){
  const a='a'.repeat(40),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64);
  return {ok:true,status:'CONTEXT_MOUNT_READY',mount:{schemaVersion:'uberbond.context-mount.v1',sourceCommit:a,brainstateId:b,contextMountId:c,missionContextId:d,mission:'continue capability closure',brainstate:{objective:'expand verified reachable futures',economicNorthStar:'risk-adjusted cleared contribution profit per founder minute',frontier:{activeMission:'continue capability closure',blockers:[],nextActions:['verify native substitutes']}},missionContext:{relevantInitiatives:[{id:'native-runtime',name:'Native Runtime Substitutes',status:'ACTIVE'}]},cognitiveHistory:{events:[{sequence:1,eventId:'evt_1',kind:'MILESTONE',subjectId:'native-runtime',summary:'context fabric is authoritative',truthClass:'VERIFIED_CURRENT',observedAt:'2026-09-13T10:00:00Z',evidenceRefs:['receipt:context']}]},laws:{zeroRetelling:'recover machine-known context',staleContext:'refresh before action'}}};
}

export function probeClaudeMemSubstitute(){
  const compiled=compileContextProjection({mountResult:sampleMount(),audience:'isolated-worker',maxHistory:8});
  if(!compiled.ok)return envelope({ok:false,status:'NATIVE_MEMORY_SUBSTITUTE_FAILED',reasonCodes:compiled.reasonCodes||[]});
  const verified=verifyContextProjection(compiled.projection,{audience:'isolated-worker',sourceCommit:'a'.repeat(40)});
  return envelope({ok:verified.ok===true,status:verified.ok?'NATIVE_MEMORY_SUBSTITUTE_READY':'NATIVE_MEMORY_SUBSTITUTE_FAILED',projectionId:compiled.projection.projectionId,verified:verified.ok===true,claimBoundary:'VERIFIED_CONTEXT_PROJECTION_IS_A_SUBORDINATE_WORKING_MEMORY_VIEW_NOT_A_SECOND_CANONICAL_MEMORY'});
}

export function probeOmniRouteSubstitute(){
  const common={capabilityId:'native:model-route',taskClass:'research',configured:true,securityPassed:true,providerIdentityObservable:true,taskSuccess:0.9,reliability:0.95,quality:0.9};
  const route=routeCapabilityModel({taskClass:'research',allowedCapabilityIds:['native:model-route'],candidates:[{...common,modelId:'model-fast',providerId:'provider-a',available:false,costCents:0,latencyMs:1},{...common,modelId:'model-safe',providerId:'provider-b',available:true,costCents:1,latencyMs:25}]});
  return envelope({ok:route.ok===true&&route.selected?.providerId==='provider-b',status:route.ok?'NATIVE_MODEL_ROUTER_READY':'NATIVE_MODEL_ROUTER_FAILED',selected:route.selected?{capabilityId:route.selected.capabilityId,modelId:route.selected.modelId,providerId:route.selected.providerId}:null,routingDigest:route.routingDigest,claimBoundary:'NATIVE_ROUTING_PRESERVES_PROVIDER_IDENTITY_AND_AVAILABILITY_GATES; IT_DOES_NOT_CREATE_PROVIDER_CAPACITY'});
}

export function probeFableSubstitute(){
  const graph=validateOrchestrationGraph({mode:'FABLE_GRAPH',parentAuthority:'NONE',dataClass:'INTERNAL_NON_SECRET',maxDepth:1,maxIterations:3,nodes:[{id:'plan',purpose:'prepare bounded plan',dependencies:[],workerRequirement:'verified planner',ownedFilesOrResponsibility:['plan'],inputs:['mission'],expectedOutput:'bounded task graph',verification:['schema validation'],stopCondition:'graph compiled',authorityCeiling:'NONE',implementation:true,callableWorkerVerified:true},{id:'verify',purpose:'verify plan',dependencies:['plan'],workerRequirement:'independent verifier',ownedFilesOrResponsibility:['verification'],inputs:['plan'],expectedOutput:'verification receipt',verification:['independent review'],stopCondition:'receipt produced',authorityCeiling:'NONE',implementation:true,callableWorkerVerified:true}]});
  return envelope({ok:graph.ok===true,status:graph.ok?'NATIVE_FABLE_SUBSTITUTE_READY':'NATIVE_FABLE_SUBSTITUTE_FAILED',graphDigest:graph.graphDigest||null,claimBoundary:'BOUNDED_GRAPH_PROTOCOL_REPLACES THE REQUIRED ORCHESTRATION BEHAVIOR; IT DOES NOT CLAIM THE UPSTREAM FABLE RUNTIME IS INSTALLED'});
}

export function inspectNativeRuntimeSubstitutes(){
  const compression=compressLosslessContext({value:{mission:'retain exact evidence',rows:Array.from({length:64},(_,i)=>({i,text:'evidence '.repeat(8)}))}});
  const restored=compression.ok?restoreLosslessContext(compression.packet):compression;
  const headroom={ok:compression.ok===true&&restored.ok===true&&restored.originalSha256===compression.packet?.originalSha256,status:'NATIVE_HEADROOM_SUBSTITUTE'};
  const claudeMem=probeClaudeMemSubstitute(),omniRoute=probeOmniRouteSubstitute(),fable=probeFableSubstitute();
  const substitutes={headroom,claudeMem:{ok:claudeMem.ok,status:claudeMem.status},omniRoute:{ok:omniRoute.ok,status:omniRoute.status},fable:{ok:fable.ok,status:fable.status}};
  const ok=Object.values(substitutes).every(x=>x.ok===true);
  return envelope({ok,status:ok?'NATIVE_OPTIONAL_RUNTIME_SUBSTITUTES_READY':'NATIVE_OPTIONAL_RUNTIME_SUBSTITUTES_DEGRADED',substitutes,substituteCount:Object.keys(substitutes).length,readyCount:Object.values(substitutes).filter(x=>x.ok).length,receiptDigest:hash(Buffer.from(JSON.stringify(substitutes))),truthBoundary:'NATIVE_SUBSTITUTE_READY_MEANS THE REQUIRED INTERNAL BEHAVIOR IS AVAILABLE WITHOUT THE OPTIONAL UPSTREAM RUNTIME. IT NEVER CLAIMS THE UPSTREAM BINARY OR SERVICE IS INSTALLED.'});
}
