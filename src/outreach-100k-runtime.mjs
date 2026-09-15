import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { compileOutreach100kLaunchCertificate, OUTREACH_100K_TARGET } from './outreach-100k-launch-contract.mjs';
import { inspectOutreach100kPacketCorpus } from './outreach-100k-packet-corpus.mjs';
import { evaluateOutreachLaunchGate } from './outreach-launch-gate.mjs';
import { dispatchGovernedOutreach } from './governed-outreach-dispatch.mjs';
import { createUberSmtpSubmissionTransport } from './ubersmtp-submission-adapter.mjs';
import { suppressionLookup } from './send-safety.mjs';

export const OUTREACH_100K_RUNTIME_VERSION='uberbond.outreach-100k-runtime.v1';
const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function readJson(file,max=4_000_000){try{const s=await fsp.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)return null;const v=JSON.parse(await fsp.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
async function atomicJson(file,value){await fsp.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp.${process.pid}`;await fsp.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});await fsp.rename(tmp,file);}
function day(now=new Date()){return new Date(now).toISOString().slice(0,10);}
function dayEndIso(now=new Date()){const d=new Date(now);d.setUTCHours(23,59,59,999);return d.toISOString();}
function freshHeartbeat(row,now,maxAgeMs=90_000){const t=Date.parse(row?.heartbeatAt||'');return Number.isFinite(t)&&new Date(now).getTime()-t>=0&&new Date(now).getTime()-t<=maxAgeMs;}

export function compileOutreach100kBatchAuthorization({certificate,authorizedBy='FOUNDER_ADMIN',campaignId,now=new Date()}={}){
  if(certificate?.state!=='CERTIFIED_100K_READY'||certificate?.oneButton100kPressAvailable!==true)return{ok:false,status:'OUTREACH_100K_AUTH_REFUSED',reasonCodes:['certified-100k-certificate-required']};
  const c=clean(campaignId,240);if(!c)return{ok:false,status:'OUTREACH_100K_AUTH_REFUSED',reasonCodes:['campaign-id-required']};
  const seed={certificateId:certificate.certificateId,recipientSetDigest:certificate.recipientSetDigest,campaignId:c,target:OUTREACH_100K_TARGET,authorizedBy:clean(authorizedBy,240)||'FOUNDER_ADMIN',authorizedAt:new Date(now).toISOString(),expiresAt:dayEndIso(now)};
  return{ok:true,status:'OUTREACH_100K_BATCH_AUTHORIZED',...seed,receiptId:`ub100kauth_${digest(seed)}`,authorityScope:'EXACT_CORPUS_EXACT_CAMPAIGN_EXACT_DAY_UP_TO_100000_PROVIDER_CONFIRMED_SENDS',truthBoundary:'This receipt records the founder press for the exact certified corpus/campaign/day. Child per-recipient authorizations may only attenuate this scope and cannot widen it.'};
}

export function deriveRecipientAuthorization(batch,packet){
  if(batch?.ok!==true)return null;const recipient=clean(packet?.message?.to,320).toLowerCase(),campaignId=clean(packet?.campaignId,240);
  if(!recipient||campaignId!==batch.campaignId)return null;
  return {authorized:true,receiptId:`${batch.receiptId}:child:${digest({recipient,campaignId,idempotencyKey:packet.idempotencyKey})}`,authorizedBy:batch.authorizedBy,recipientEmail:recipient,campaignId,expiresAt:batch.expiresAt,parentAuthorizationReceiptId:batch.receiptId};
}

export function createOutreach100kRuntime({config,createStore,env=process.env,clock=()=>new Date(),transportFactory=createUberSmtpSubmissionTransport}={}){
  const root=path.resolve(env.UBERBOND_OUTREACH_100K_RUNTIME_DIR||path.join(env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond','outreach-100k'));
  const evidencePath=path.resolve(env.UBERBOND_OUTREACH_100K_EVIDENCE_PATH||path.join(root,'evidence.json'));
  let storePromise=null,running=false,timer=null,transportCache=new Map();
  const store=async()=>{if(!storePromise){const s=createStore(config);storePromise=s.init().then(()=>s);}return storePromise;};
  const statePath=d=>path.join(root,`mission-${d}.json`);

  async function outboundObservation(evidence,now){
    const s=await store();const [settings,reservations,workers]=await Promise.all([s.getSettings(),s.list('outboundReservations'),s.list('workerHeartbeats')]);
    const d=day(now);const today=reservations.filter(r=>String(r.reservedAt||'').startsWith(d)&&r.kind==='outreach100k');
    return {enabled:config?.outbound?.enabled===true,dryRun:config?.outbound?.dryRun===true,globalPaused:settings?.outboundPaused===true,uncertain:today.filter(r=>r.status==='uncertain').length,workerOnline:workers.some(w=>freshHeartbeat(w,now)),schedulerActive:config?.autopilot===true,providerConfirmedToday:today.filter(r=>r.status==='sent'&&clean(r.providerReceiptId,500)).length,evidenceRuntime:evidence?.runtime||{}};
  }

  function transportReadiness(evidence){
    const routes=new Map((evidence?.egressRoutes||[]).map(r=>[clean(r.routeId||r.id,240),r]));const configs=evidence?.transports&&typeof evidence.transports==='object'?evidence.transports:{};const reasons=[];
    for(const [routeId,route] of routes){if(route?.ready!==true&&String(route?.status||'').toUpperCase()!=='READY')continue;const t=configs[routeId];if(!t)reasons.push(`transport:${routeId}:config-required`);else{if(t.type!=='SMTP_SUBMISSION')reasons.push(`transport:${routeId}:supported-type-required`);for(const field of ['usernameEnv','passwordEnv']){const name=clean(t?.[field],160);if(name&&!/^UBERBOND_SMTP_[A-Z0-9_]+$/.test(name))reasons.push(`transport:${routeId}:${field}-must-use-uberbond-smtp-secret-namespace`);else if(name&&!env[name])reasons.push(`transport:${routeId}:${field}-secret-required`);}}}
    return{ok:reasons.length===0,reasonCodes:reasons};
  }

  async function certify(){
    const now=clock();const evidence=await readJson(evidencePath);if(!evidence)return{ok:false,status:'OUTREACH_100K_EVIDENCE_MISSING',reasonCodes:['runtime-evidence-file-required'],evidencePath};
    const packetCorpusPath=path.resolve(String(evidence.packetCorpusPath||''));if(!packetCorpusPath.startsWith(`${root}${path.sep}`))return{ok:false,status:'OUTREACH_100K_CORPUS_PATH_REFUSED',reasonCodes:['packet-corpus-must-be-inside-runtime-root'],evidencePath};evidence.packetCorpusPath=packetCorpusPath;
    const observation=await outboundObservation(evidence,now);const transport=transportReadiness(evidence);
    const runtime={...(evidence.runtime||{}),ready:evidence.runtime?.ready===true&&transport.ok&&config?.storeBackend==='postgres',observedAt:evidence.runtime?.observedAt,evidenceRef:evidence.runtime?.evidenceRef};
    const pre=compileOutreach100kLaunchCertificate({domains:evidence.domains,mailboxes:evidence.mailboxes,egressRoutes:evidence.egressRoutes,recipientProviders:evidence.recipientProviders,campaign:evidence.campaign,runtime,schedule:{},inventory:{},outbound:{...observation,providerConfirmedToday:observation.providerConfirmedToday},now});
    const corpus=await inspectOutreach100kPacketCorpus({filePath:evidence.packetCorpusPath,mailboxes:pre.mailboxFleet,campaignId:evidence.campaign?.id,expectedCount:Number(evidence.packetCorpusExpectedCount||OUTREACH_100K_TARGET),businessHourStart:Number(evidence.businessHourStart??9),businessHourEnd:Number(evidence.businessHourEnd??17)});
    if(!corpus.ok)return{ok:false,status:'OUTREACH_100K_CORPUS_NOT_READY',corpus,transport,storeBackend:config?.storeBackend||null};
    const certificate=compileOutreach100kLaunchCertificate({inventory:corpus.inventory,domains:evidence.domains,mailboxes:evidence.mailboxes,egressRoutes:evidence.egressRoutes,recipientProviders:evidence.recipientProviders,campaign:evidence.campaign,runtime,schedule:corpus.schedule,outbound:{...observation,providerConfirmedToday:observation.providerConfirmedToday},now});
    return{ok:true,status:certificate.state,certificate,corpus:{status:corpus.status,count:corpus.count,recipientSetDigest:corpus.recipientSetDigest,mailboxCounts:corpus.mailboxCounts},transport,storeBackend:config?.storeBackend||null,evidencePath};
  }

  function transportFor(evidence,routeId){
    if(transportCache.has(routeId))return transportCache.get(routeId);const cfg=evidence?.transports?.[routeId];if(!cfg)return null;
    const userEnv=clean(cfg.usernameEnv,160),passEnv=clean(cfg.passwordEnv,160);if((userEnv&&!/^UBERBOND_SMTP_[A-Z0-9_]+$/.test(userEnv))||(passEnv&&!/^UBERBOND_SMTP_[A-Z0-9_]+$/.test(passEnv)))return null;const t=transportFactory({host:cfg.host,port:Number(cfg.port||465),secure:cfg.secure!==false,username:userEnv?env[userEnv]||'':'',password:passEnv?env[passEnv]||'':'',authorized:cfg.authorized===true,termsCompatible:cfg.termsCompatible===true,evidenceRef:cfg.evidenceRef||`runtime:${routeId}`});
    if(t?.ok)transportCache.set(routeId,t);return t;
  }

  async function start({authorizedBy='FOUNDER_ADMIN'}={}){
    const checked=await certify();if(!checked.ok||checked.certificate?.state!=='CERTIFIED_100K_READY')return{ok:false,status:'OUTREACH_100K_START_REFUSED',certificate:checked.certificate||null,diagnostic:checked};
    const evidence=await readJson(evidencePath);const auth=compileOutreach100kBatchAuthorization({certificate:checked.certificate,authorizedBy,campaignId:evidence.campaign?.id,now:clock()});if(!auth.ok)return auth;
    const d=day(clock()),file=statePath(d);const existing=await readJson(file);if(existing?.state&&['RUNNING','WAITING_FOR_SCHEDULE'].includes(existing.state))return{ok:true,status:'OUTREACH_100K_ALREADY_RUNNING',mission:existing};
    const mission={version:OUTREACH_100K_RUNTIME_VERSION,missionId:`ub100kmission_${digest({date:d,certificateId:checked.certificate.certificateId,auth:auth.receiptId})}`,date:d,state:'RUNNING',certificate:checked.certificate,batchAuthorization:auth,packetCorpusPath:evidence.packetCorpusPath,nextLineIndex:0,providerConfirmed:checked.certificate.providerConfirmedToday||0,startedAt:clock().toISOString(),updatedAt:clock().toISOString(),lastError:null};
    await atomicJson(file,mission);void run(d);return{ok:true,status:'OUTREACH_100K_STARTED',missionId:mission.missionId,certificateId:mission.certificate.certificateId,target:OUTREACH_100K_TARGET};
  }

  async function processPacket(packet,mission,evidence,s){
    const now=clock();const to=clean(packet?.message?.to,320).toLowerCase();const box=mission.certificate.mailboxFleet.find(x=>x.mailboxId===packet.mailboxId&&x.ready);if(!box)return{advance:false,blocked:true,reason:'certified-mailbox-required'};
    const liveSupp=await suppressionLookup(s,{website:packet?.launchInput?.recipient?.website||packet?.launchInput?.recipient?.domain||'',email:to});if(liveSupp.suppressed)return{advance:true,sent:false,reason:'live-suppression'};
    const launchInput=structuredClone(packet.launchInput||{});launchInput.suppression={...(launchInput.suppression||{}),checked:true,suppressed:false,unsubscribeRequested:false};
    const decision=evaluateOutreachLaunchGate({...launchInput,now});if(decision.state!=='READY_FOR_GOVERNED_CANARY'||decision.readyForGovernedCanary!==true)return{advance:true,sent:false,reason:'recipient-launch-gate-refused',decision};
    const authorization=deriveRecipientAuthorization(mission.batchAuthorization,packet);if(!authorization)return{advance:false,blocked:true,reason:'child-authorization-refused'};
    const reserved=await s.reserveOutboundSend({idempotencyKey:packet.idempotencyKey,prospectId:packet.recipientId,campaignId:packet.campaignId,inbox:packet.mailboxId,recipientEmail:to,kind:'outreach100k',followup:0,dailyCap:box.observedDailyCap,hourlyCap:box.observedHourlyCap,minGapSeconds:box.minGapSeconds,now:now.toISOString()});
    if(!reserved.ok){if(reserved.reason==='duplicate-sent')return{advance:true,sent:true,duplicate:true};if(String(reserved.reason).startsWith('duplicate-'))return{advance:false,blocked:true,reason:reserved.reason};return{advance:false,wait:true,reason:reserved.reason,retryAt:reserved.retryAt||null};}
    await s.markOutboundReservation(reserved.reservation.id,'dispatching',{missionId:mission.missionId,recipientSetDigest:mission.certificate.recipientSetDigest});
    const routeId=box.routeId;const transport=transportFor(evidence,routeId);if(!transport?.ok){await s.markOutboundReservation(reserved.reservation.id,'cancelled',{cancelReason:'transport-not-ready'});return{advance:false,blocked:true,reason:'transport-not-ready'};}
    const result=await dispatchGovernedOutreach({launchDecision:decision,authorization,message:{...packet.message,campaignId:packet.campaignId},transportAdapter:transport,idempotencyKey:packet.idempotencyKey,now});
    if(result.ok&&result.state==='PROVIDER_CONFIRMED_SEND'){
      await s.markOutboundReservation(reserved.reservation.id,'sent',{sentAt:clock().toISOString(),providerReceiptId:result.providerReceiptId,dispatchId:result.dispatchId,missionId:mission.missionId});
      await s.recordOutboundEvent({inbox:packet.mailboxId,eventType:'sent',prospectId:packet.recipientId,recipientEmail:to,detail:{missionId:mission.missionId,providerReceiptId:result.providerReceiptId,dispatchId:result.dispatchId}},{});
      return{advance:true,sent:true,providerReceiptId:result.providerReceiptId};
    }
    await s.markOutboundReservation(reserved.reservation.id,'uncertain',{dispatchId:result.dispatchId||null,missionId:mission.missionId,reasonCodes:result.reasonCodes||[]});
    await s.recordOutboundEvent({inbox:packet.mailboxId,eventType:'send_uncertain',prospectId:packet.recipientId,recipientEmail:to,detail:{missionId:mission.missionId,dispatchId:result.dispatchId||null}},{});
    return{advance:false,blocked:true,uncertain:true,reason:'provider-outcome-uncertain'};
  }

  async function run(date=day(clock())){
    if(running)return;running=true;clearTimeout(timer);timer=null;
    try{
      const file=statePath(date);let mission=await readJson(file);if(!mission||!['RUNNING','WAITING_FOR_SCHEDULE'].includes(mission.state))return;
      const evidence=await readJson(evidencePath);if(!evidence){mission.state='BLOCKED';mission.lastError='runtime-evidence-file-missing';await atomicJson(file,mission);return;}
      const s=await store();const stream=fs.createReadStream(mission.packetCorpusPath);const rl=readline.createInterface({input:stream,crlfDelay:Infinity});let index=0,nextWake=null;let reachedEof=true;
      for await(const line of rl){if(!line.trim())continue;if(index++<Number(mission.nextLineIndex||0))continue;let packet;try{packet=JSON.parse(line);}catch{mission.state='BLOCKED';mission.lastError=`packet-json-invalid:${index}`;break;}
        const due=Date.parse(packet.notBefore||'');const nowMs=clock().getTime();if(Number.isFinite(due)&&due>nowMs){mission.state='WAITING_FOR_SCHEDULE';nextWake=due;reachedEof=false;break;}
        const out=await processPacket(packet,mission,evidence,s);if(out.sent)mission.providerConfirmed=Number(mission.providerConfirmed||0)+1;if(out.advance)mission.nextLineIndex=index;
        mission.updatedAt=clock().toISOString();mission.lastResult={line:index,...out};await atomicJson(file,mission);
        if(mission.providerConfirmed>=OUTREACH_100K_TARGET){mission.state='COMPLETE';mission.completedAt=clock().toISOString();await atomicJson(file,mission);break;}
        if(out.blocked){mission.state=out.uncertain?'BLOCKED_UNCERTAIN':'BLOCKED';mission.lastError=out.reason;reachedEof=false;await atomicJson(file,mission);break;}
        if(out.wait){mission.state='WAITING_FOR_CAPACITY';mission.lastError=out.reason;nextWake=out.retryAt?Date.parse(out.retryAt):Date.now()+60_000;reachedEof=false;await atomicJson(file,mission);break;}
      }
      if(reachedEof&&mission.state==='RUNNING'&&mission.providerConfirmed<OUTREACH_100K_TARGET){mission.state='BLOCKED_TARGET_SHORTFALL';mission.lastError='packet-corpus-exhausted-before-100k-provider-confirmed';await atomicJson(file,mission);}
      if(nextWake&&Number.isFinite(nextWake)&&['WAITING_FOR_SCHEDULE','WAITING_FOR_CAPACITY'].includes(mission.state)){const delay=Math.max(1000,Math.min(3_600_000,nextWake-Date.now()));timer=setTimeout(()=>{void resume(date);},delay);timer.unref?.();}
    }finally{running=false;}
  }

  async function resume(date=day(clock())){const file=statePath(date);const mission=await readJson(file);if(!mission)return{ok:false,status:'OUTREACH_100K_NO_MISSION'};if(mission.state==='WAITING_FOR_CAPACITY'||mission.state==='WAITING_FOR_SCHEDULE'){mission.state='RUNNING';mission.updatedAt=clock().toISOString();await atomicJson(file,mission);}void run(date);return{ok:true,status:'OUTREACH_100K_RESUME_REQUESTED',missionId:mission.missionId};}
  async function status(date=day(clock())){const mission=await readJson(statePath(date));return mission||{version:OUTREACH_100K_RUNTIME_VERSION,state:'NOT_STARTED',date,target:OUTREACH_100K_TARGET};}
  async function bootResume(){const mission=await readJson(statePath(day(clock())));if(mission&&['RUNNING','WAITING_FOR_SCHEDULE','WAITING_FOR_CAPACITY'].includes(mission.state)){if(mission.lastResult?.line&&mission.lastResult?.uncertain){mission.state='BLOCKED_UNCERTAIN';await atomicJson(statePath(mission.date),mission);return;}void resume(mission.date);}}
  return{certify,start,status,resume,bootResume,runtimeRoot:root,evidencePath};
}
