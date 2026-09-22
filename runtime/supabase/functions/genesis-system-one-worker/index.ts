import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPPLIER_ID="supplier:jev-system-one";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function sha256Hex(v:string){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function text(v:any,max=8000){const s=String(v??"").trim();return s&&s.length<=max?s:null;}
function list(v:any,n=64,max=1000){return Array.isArray(v)&&v.length<=n?[...new Set(v.map((x:any)=>text(x,max)).filter(Boolean))]:[];}
function candidateFrom(job:any){
  const c=job?.prompt?.candidate;
  if(!c||typeof c!=="object"||Array.isArray(c)) return null;
  const candidateId=text(c.candidateId,240),title=text(c.title,500),hypothesis=text(c.hypothesis),mechanism=text(c.mechanism),falsifier=text(c.falsifier,6000),nextProbe=text(c.nextProbe,6000);
  const moonshotAffinity=list(c.moonshotAffinity,32,120),substrateNeeds=list(c.substrateNeeds,32,120);
  if(!candidateId||!/^genesis-candidate-[a-z0-9-]+$/.test(candidateId)||!title||!hypothesis||!mechanism||!falsifier||!nextProbe||!moonshotAffinity.length||!substrateNeeds.length) return null;
  return {candidateId,title,hypothesis,mechanism,falsifier,nextProbe,moonshotAffinity,substrateNeeds};
}
function counterexamples(c:any){
  const out=[
    "The mechanism may restate the desired outcome without identifying a causal lever that survives a controlled baseline.",
    "A measured improvement may come from easier task selection, hidden assistance, or changed evaluation conditions rather than the proposed mechanism."
  ];
  const needs=new Set(c.substrateNeeds.map(String));
  if([...needs].some(x=>/UBERWATT|THERMAL|TELEMETRY|ENERGY/i.test(x))) out.push("The idea may depend on energy or thermal measurements that are not yet observed, so simulated efficiency gains could disappear on real hardware.");
  if([...needs].some(x=>/LOCAL_COMPUTE|SOVEREIGN_COMPUTE|JEV|MODEL/i.test(x))) out.push("Coordination, context-transfer, model-loading, or retry overhead may erase the apparent advantage of distributing cognition to cheaper layers.");
  if([...needs].some(x=>/HUMAN_APPROVAL|DECISION|OPTION/i.test(x))) out.push("A simulated decision benefit may not preserve the human preferences, uncertainty, or reversibility that the idea claims to protect.");
  if([...needs].some(x=>/RESEARCH|EVIDENCE|EXPERIMENT/i.test(x))) out.push("The experiment may optimize an internal proxy that does not transfer to the real target phenomenon.");
  return [...new Set(out)].slice(0,5);
}
function unresolved(c:any){
  const out=["Whether the stated mechanism causes the claimed benefit on a fixed held-out task population."];
  const needs=new Set(c.substrateNeeds.map(String));
  if([...needs].some(x=>/UBERWATT|THERMAL|TELEMETRY|ENERGY/i.test(x))) out.push("Real measured energy/thermal evidence is still required.");
  if([...needs].some(x=>/HUMAN_APPROVAL/i.test(x))) out.push("Human approval cannot be simulated or inherited from model output.");
  if([...needs].some(x=>/MODEL|JEV|LOCAL_COMPUTE|SOVEREIGN_COMPUTE/i.test(x))) out.push("Supplier quality, latency, and coordination overhead must be measured on the actual runtime.");
  return out.slice(0,6);
}
function critique(job:any){
  const c=candidateFrom(job);
  if(!c||String(job?.kind||"")!=="CANDIDATE_CRITIQUE"||Number(job?.max_cost_microusd)!==0) return null;
  const strongestCounterexamples=counterexamples(c),riskCount=strongestCounterexamples.length;
  const confidence=Math.max(.35,Math.min(.72,Number((.68-(riskCount-2)*.06).toFixed(2))));
  return {
    thesis:`The ${c.title} hypothesis is worth an internal falsification pass only if its claimed benefit survives a fixed baseline, identical evaluation conditions, and explicit accounting for hidden assistance and coordination overhead.`,
    strongestCounterexamples,
    falsifierRefinement:`${c.falsifier} Strengthen this by pre-registering the same task population, baseline, acceptance metric, hidden-intervention count, retry count, latency/cost inputs, and a stop rule before comparing the candidate mechanism.`,
    minimumExperiment:{
      objective:`Try to falsify ${c.title} before allocating broader cognition or implementation effort.`,
      procedure:[
        "Freeze the exact candidate, baseline, task population, metrics, and stop rule.",
        `Execute the smallest internal version of the proposed probe: ${c.nextProbe}`,
        "Record accepted outcomes, failures, retries, hidden assistance, latency, and any required substrate evidence.",
        "Compare candidate and baseline under identical scoring and reject the hypothesis if the pre-registered failure condition is met."
      ],
      successCriterion:"The candidate improves the declared primary metric without worse acceptance, hidden intervention, defect/retry burden, or missing substrate evidence.",
      failureCriterion:"The candidate fails to beat baseline, requires hidden assistance, worsens reliability, or depends on unavailable evidence or authority."
    },
    implementationSketch:{
      internalOnly:true,
      steps:[
        "Represent the experiment as a bounded internal task with immutable baseline and candidate arms.",
        "Collect machine-readable receipts for every compared outcome and resource input.",
        "Run the declared falsifier before any promotion or broader rollout.",
        "Escalate only unresolved semantic or causal uncertainty to a stronger supplier."
      ],
      dependencies:[...new Set(["fixed baseline","held-out task set","receipt ledger",...c.substrateNeeds])].slice(0,16),
      risks:strongestCounterexamples.slice(0,5)
    },
    confidence,
    unresolved:unresolved(c)
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({ok:false,error:"method-not-allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service) return json({ok:false,error:"runtime-auth-unavailable"},503);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const workerToken=(req.headers.get("x-genesis-worker-token")||"").trim();
  const supplierToken=(req.headers.get("x-genesis-supplier-token")||"").trim();
  if(workerToken.length<32||workerToken.length>256||supplierToken.length<32||supplierToken.length>256) return json({ok:false,error:"worker-and-supplier-auth-required"},401);
  const ar=await db.from("genesis_system_one_auth").select("token_sha256").eq("singleton_id",1).single();
  if(ar.error||!ar.data?.token_sha256) return json({ok:false,error:"worker-auth-read-failed"},500);
  if(await sha256Hex(workerToken)!==ar.data.token_sha256) return json({ok:false,error:"worker-token-rejected"},401);

  const nodeUrl=`${url}/functions/v1/genesis-cognition-node`;
  const supplierHeaders={"content-type":"application/json","x-genesis-supplier":SUPPLIER_ID,"x-genesis-supplier-token":supplierToken};
  const started=Date.now();
  const poll=await fetch(nodeUrl,{method:"POST",headers:supplierHeaders,body:JSON.stringify({op:"poll"})});
  let polled:any={};try{polled=await poll.json();}catch{return json({ok:false,error:"poll-response-invalid"},502);}
  if(!poll.ok) return json({ok:false,error:"poll-failed",detail:polled},502);
  if(!polled?.job) return json({ok:true,status:"SYSTEM_ONE_IDLE",detail:polled?.status||"NO_JOB",externalEffectAuthority:"NONE"});

  const result=critique(polled.job);
  if(!result){
    const fail=await fetch(nodeUrl,{method:"POST",headers:supplierHeaders,body:JSON.stringify({op:"receipt",jobId:polled.job.id,ok:false,inputTokens:0,outputTokens:0,costMicrousd:0,latencyMs:Date.now()-started,error:"system-one-job-contract-refused"})});
    return json({ok:false,status:"SYSTEM_ONE_JOB_REFUSED",jobId:polled.job.id,receiptStatus:fail.status,externalEffectAuthority:"NONE"},422);
  }

  const receipt=await fetch(nodeUrl,{method:"POST",headers:supplierHeaders,body:JSON.stringify({
    op:"receipt",jobId:polled.job.id,ok:true,inputTokens:0,outputTokens:0,costMicrousd:0,latencyMs:Date.now()-started,result
  })});
  let receiptBody:any={};try{receiptBody=await receipt.json();}catch{return json({ok:false,error:"receipt-response-invalid"},502);}
  if(!receipt.ok) return json({ok:false,error:"receipt-rejected",detail:receiptBody},502);
  return json({
    ok:true,status:"SYSTEM_ONE_JOB_COMPLETED",supplierId:SUPPLIER_ID,jobId:polled.job.id,candidateId:polled.job.candidate_id,
    provider:"uberbond",model:"jev-system-one-v1",costMicrousd:0,modelTokens:0,latencyMs:Date.now()-started,
    externalEffectAuthority:"NONE",truthBoundary:"DETERMINISTIC_PREFILTER_RECEIPT_IS_RESEARCH_EVIDENCE_ONLY"
  });
});