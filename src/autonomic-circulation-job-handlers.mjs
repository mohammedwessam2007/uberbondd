import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { compileAutonomicCirculationPlan, compileAutonomicFeedback } from './autonomic-circulation.mjs';
import { compileObjectiveMetabolism, planMetabolismCycle } from './organism-metabolism.mjs';
import { compileRevenueMethodExchange } from './revenue-method-exchange.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AUTONOMIC_CIRCULATION_JOB_HANDLERS_VERSION='uberbond.autonomic-circulation-job-handlers.v1';
const execFileAsync=promisify(execFile);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const text=(value,max=1000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
async function latest(store,type,limit=50){
  try{
    const rows=await store.list('auditLog',{filters:{type},limit});
    if(!Array.isArray(rows)||!rows.length)return null;
    return rows.sort((a,b)=>Date.parse(a?.createdAt||0)-Date.parse(b?.createdAt||0)).at(-1)?.detail||null;
  }catch{return null;}
}
function exactSource(root){
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(head))throw new Error('autonomic-exact-source-required');
  const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();
  if(dirty)throw new Error('autonomic-source-must-be-clean');
  return head;
}
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}}
async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});await fs.chmod(tmp,0o600);await fs.rename(tmp,file);}
function strategyCandidates(targetCounts={}){
  const targets=Object.entries(targetCounts||{}).filter(([,count])=>Number(count)>0).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,12).map(([id])=>id);
  const evidenceRef=`cognitive-targets:${digest(targetCounts).slice(0,24)}`;
  return [
    {id:'autonomic-info',family:'INFORMATION_ACQUISITION',mechanism:`Refresh local/read-only evidence for active cognitive targets: ${targets.join(', ')||'unknown'}`,assumptions:['current receipts may be stale'],constraintViolations:[],evidenceRefs:[evidenceRef],reversible:true,successProbability:.9,expectedContributionCents:100,costCents:0,founderMinutes:0,risk:0,evidenceStrength:7,novelty:2,robustness:9},
    {id:'autonomic-decompose',family:'DECOMPOSITION_OR_REFRAME',mechanism:'Decompose the highest-pressure target into dependency-satisfied local preparation leaves and preserve blocked consequence edges.',assumptions:['at least one useful precursor is separable'],constraintViolations:[],evidenceRefs:[evidenceRef],reversible:true,successProbability:.8,expectedContributionCents:120,costCents:0,founderMinutes:0,risk:0,evidenceStrength:6,novelty:4,robustness:8},
    {id:'autonomic-capability-substitute',family:'CAPABILITY_SUBSTITUTION',mechanism:'Search already-approved capability inventory for a lower-cost substitute before requesting a new dependency.',assumptions:['approved inventory may contain a substitute'],constraintViolations:[],evidenceRefs:[evidenceRef],reversible:true,successProbability:.6,expectedContributionCents:90,costCents:0,founderMinutes:0,risk:1,evidenceStrength:5,novelty:5,robustness:7},
    {id:'autonomic-new-mechanism',family:'NEW_MECHANISM_INVENTION',mechanism:'Generate a bounded new mechanism only if existing direct, decomposition and substitution families remain insufficient.',assumptions:['novel composition may dominate existing mechanisms'],constraintViolations:[],evidenceRefs:[evidenceRef],reversible:true,successProbability:.35,expectedContributionCents:180,costCents:0,founderMinutes:0,risk:2,evidenceStrength:3,novelty:9,robustness:4}
  ];
}

export function attachAutonomicCirculationJobHandlers({handlers,store,cfg,enqueueJob}={}){
  if(!handlers||typeof handlers!=='object'||!store||typeof store.log!=='function')return handlers;
  const root=path.resolve(cfg?.root||'.');
  const dataDir=path.resolve(cfg?.dataDir||path.join(root,'data'));
  const autonomicDir=path.join(dataDir,'autonomic');
  const cyclePath=path.join(autonomicDir,'cognitive-cycle.json');
  const feedbackPath=path.join(autonomicDir,'feedback-events.json');

  handlers['autonomic.cognitive.refresh']=async payload=>{
    const sourceCommit=exactSource(root);
    if(payload?.sourceCommit&&String(payload.sourceCommit).toLowerCase()!==sourceCommit)throw new Error('autonomic-cognitive-source-mismatch');
    await fs.mkdir(autonomicDir,{recursive:true,mode:0o700});
    const args=['scripts/uberbond-cognitive-cycle.mjs','--output',cyclePath];
    if(await fs.stat(feedbackPath).then(s=>s.isFile()).catch(()=>false))args.push('--autonomic-events',feedbackPath);
    const run=await execFileAsync(process.execPath,args,{cwd:root,timeout:120_000,maxBuffer:8_000_000});
    const cycle=await readJson(cyclePath);
    if(!cycle||cycle.schemaVersion!=='uberbond.cognitive-cycle.v1'||cycle.externalEffectAuthority!=='NONE')throw new Error('autonomic-cognitive-cycle-invalid');
    const cycleDigest=digest({sourceCommit,graph:cycle.graph?.graphDigest||null,events:(cycle.events||[]).map(event=>event.eventId),activationSummary:cycle.activationSummary});
    const receipt={schemaVersion:'uberbond.autonomic-cognitive-cycle-receipt.v1',receiptId:digest({sourceCommit,cycleDigest}),observedAt:new Date().toISOString(),sourceCommit,cycleDigest,eventCount:Number(cycle.activationSummary?.eventCount||0),activationCount:Number(cycle.activationSummary?.activationCount||0),targetCounts:cycle.activationSummary?.targetCounts||{},eventSummaries:(cycle.events||[]).slice(0,24).map(event=>text(event.summary,500)).filter(Boolean),stdout:String(run.stdout||'').slice(0,2000),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
    await store.log('autonomic_cognitive_cycle',receipt);
    return receipt;
  };

  handlers['autonomic.metabolism.plan']=async payload=>{
    const sourceCommit=exactSource(root);
    if(payload?.sourceCommit&&String(payload.sourceCommit).toLowerCase()!==sourceCommit)throw new Error('autonomic-metabolism-source-mismatch');
    const targetCounts=payload?.targetCounts&&typeof payload.targetCounts==='object'?payload.targetCounts:{};
    const cognitiveDigest=text(payload?.cognitiveDigest,64);
    if(!cognitiveDigest)throw new Error('autonomic-metabolism-cognitive-digest-required');
    const compiled=compileObjectiveMetabolism({objective:text(payload?.objective,1000)||'Convert current cognitive pressure into bounded evidence-producing progress.',successCriteria:['at least one reversible evidence-producing strategy is selected or the missing strategy families are explicitly identified'],hardConstraints:['authority:owner-reserved','no-external-effects-without-existing-gate','no-secret-exfiltration'],assumptions:['some active cognitive pressure can be reduced by local preparation or read-only evidence'],unknowns:(payload?.eventSummaries||[]).slice(0,8),anomalies:[],contradictions:[],blindSpots:['unobserved external reality remains unknown'],disagreements:[],riskBudget:2,maxSpendCents:0,maxFounderMinutes:0});
    if(!compiled.ok)return compiled;
    const plan=planMetabolismCycle({metabolism:compiled.metabolism,candidates:strategyCandidates(targetCounts)});
    if(!plan.ok)return plan;
    const selected=plan.wallbreaker?.selected?.candidate||null;
    const receipt={schemaVersion:'uberbond.autonomic-metabolism-receipt.v1',receiptId:digest({sourceCommit,cognitiveDigest,selected:selected?.signature||null,missingFamilies:plan.missingFamilies||[]}),observedAt:new Date().toISOString(),sourceCommit,inputDigest:cognitiveDigest,status:plan.status,selectedCandidateId:selected?.id||null,selectedCandidateSignature:selected?.signature||null,selectedFamily:selected?.family||null,missingFamilies:plan.missingFamilies||[],next:plan.next||null,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
    await store.log('autonomic_metabolism_plan',receipt);
    return receipt;
  };

  handlers['autonomic.revenue.paper']=async payload=>{
    const sourceCommit=exactSource(root);
    if(payload?.sourceCommit&&String(payload.sourceCommit).toLowerCase()!==sourceCommit)throw new Error('autonomic-revenue-source-mismatch');
    const configPath=path.join(root,'config','revenue-method-exchange.json');
    const raw=await readJson(configPath);
    if(raw?.schema!=='uberbond.revenue-method-exchange.config.v1'||raw?.mode!=='PAPER_CANARY_SELECTION'||raw?.externalEffectAuthority!=='NONE')throw new Error('autonomic-revenue-paper-config-required');
    const result=compileRevenueMethodExchange({methods:raw.methods,maxCanaries:raw.maxCanaries});
    if(!result.ok)return result;
    const inputDigest=digest({sourceCommit,config:raw});
    const receipt={schemaVersion:'uberbond.autonomic-revenue-paper-receipt.v1',receiptId:digest({sourceCommit,inputDigest,canaries:result.canaries}),observedAt:new Date().toISOString(),sourceCommit,inputDigest,status:result.status,canaries:result.canaries||[],forecastTruth:raw.forecastTruth||'HYPOTHESIS_NOT_REVENUE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'Paper/canary selection is a hypothesis allocation only. LIVE still requires cleared payment plus accepted delivery and all existing consequence authority.'};
    await store.log('autonomic_revenue_paper',receipt);
    return receipt;
  };

  handlers['autonomic.feedback.compile']=async payload=>{
    const sourceCommit=exactSource(root);
    if(payload?.sourceCommit&&String(payload.sourceCommit).toLowerCase()!==sourceCommit)throw new Error('autonomic-feedback-source-mismatch');
    const cognitive=await latest(store,'autonomic_cognitive_cycle');
    const metabolism=await latest(store,'autonomic_metabolism_plan');
    const revenue=await latest(store,'autonomic_revenue_paper');
    const result=compileAutonomicFeedback({sourceCommit,cognitive,metabolism,revenue,observedAt:new Date()});
    if(!result.ok)return result;
    await atomicJson(feedbackPath,result.bundle);
    const receipt={...result.bundle,receiptId:result.bundle.feedbackDigest,path:feedbackPath};
    await store.log('autonomic_feedback_bundle',receipt);
    return receipt;
  };

  handlers['autonomic.circulation.tick']=async ()=>{
    if(typeof enqueueJob!=='function')return{ok:false,status:'AUTONOMIC_CIRCULATION_REFUSED',reasonCodes:['durable-enqueue-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
    const sourceCommit=exactSource(root);
    const [cognitive,metabolism,revenue,capabilityPlan,commercialCatalog,contradictionScan,feedback]=await Promise.all([
      latest(store,'autonomic_cognitive_cycle'),latest(store,'autonomic_metabolism_plan'),latest(store,'autonomic_revenue_paper'),latest(store,'capability_genome_discovery_plan'),latest(store,'commercial_opportunity_catalog'),latest(store,'commercial_memory_contradictions_found'),latest(store,'autonomic_feedback_bundle')
    ]);
    const compiled=compileAutonomicCirculationPlan({sourceCommit,cognitive,metabolism,revenue,capabilityPlan,commercialCatalog,contradictionScan,feedback,now:new Date()});
    if(!compiled.ok)return compiled;
    const queued=[];const failures=[];
    for(const spec of compiled.plan.jobs){
      try{
        const row=await enqueueJob(spec.type,spec.payload,{maxAttempts:spec.maxAttempts,priority:spec.priority,dedupeKey:`autonomic:${spec.dedupeKey}`});
        queued.push({type:spec.type,dedupeKey:spec.dedupeKey,jobId:row?.id||null});
      }catch(error){failures.push({type:spec.type,dedupeKey:spec.dedupeKey,reason:text(error?.message,300)||'enqueue-failed'});}
    }
    const receipt={schemaVersion:'uberbond.autonomic-circulation-receipt.v1',receiptId:digest({planDigest:compiled.plan.planDigest,queued,failures}),observedAt:new Date().toISOString(),sourceCommit,planDigest:compiled.plan.planDigest,cognitiveDigest:compiled.plan.cognitiveDigest,jobsRequested:compiled.plan.jobs.map(row=>row.type),queued,failures,status:failures.length?'AUTONOMIC_CIRCULATION_DEGRADED':queued.length?'AUTONOMIC_CIRCULATION_ENERGIZED':'AUTONOMIC_CIRCULATION_STABLE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
    await store.log('autonomic_circulation',receipt);
    return receipt;
  };
  return handlers;
}
