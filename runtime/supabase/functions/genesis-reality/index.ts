import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const REPO="mohammedwessam2007/uberbondd";
const INDEX_PATH="artifacts/genesis/GENESIS_BURST_INDEX.json";
const GH_HEADERS={"Accept":"application/vnd.github+json","User-Agent":"UberBond-GENESIS-Reality"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

async function sha256Hex(v:string){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function utility(c:any){
  const a=Array.isArray(c?.moonshotAffinity)&&c.moonshotAffinity.length?1:0;
  return Number((.30*Number(c?.leverage||0)+.25*Number(c?.testability||0)+.20*Number(c?.novelty||0)+.15*Number(c?.reversibility||0)+.10*a).toFixed(4));
}
function validCandidate(c:any){
  return typeof c?.id==="string" && /^genesis-candidate-[a-z0-9-]+$/.test(c.id)
    && typeof c?.title==="string" && c.title.length>0
    && typeof c?.generatorKey==="string" && c.generatorKey.length>2
    && typeof c?.hypothesis==="string" && c.hypothesis.length>0
    && typeof c?.mechanism==="string" && c.mechanism.length>0
    && typeof c?.falsifier==="string" && c.falsifier.length>0
    && typeof c?.nextProbe==="string" && c.nextProbe.length>0
    && Array.isArray(c?.moonshotAffinity) && c.moonshotAffinity.length>0
    && c.moonshotAffinity.every((x:unknown)=>typeof x==="string" && /^founder-moonshot-\d{4}$/.test(x))
    && Array.isArray(c?.substrateNeeds)
    && [c?.novelty,c?.leverage,c?.testability,c?.reversibility].every(v=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1);
}
function human(needs:string[]){return needs.includes("HUMAN_APPROVAL");}
function physical(needs:string[]){return needs.some(x=>["THERMAL_TELEMETRY","TELEMETRY"].includes(x));}
function implReady(c:any){return utility(c)>=.90&&Number(c.testability)>=.85&&Number(c.reversibility)>=.90;}
async function ghJson(path:string){
  const r=await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`,{headers:GH_HEADERS});
  if(!r.ok) throw new Error(`github-raw-${r.status}:${path}`);
  return await r.json();
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({ok:false,error:"method-not-allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service) return json({ok:false,error:"runtime-auth-unavailable"},503);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  const supplied=(req.headers.get("x-genesis-runtime-token")||"").trim();
  if(supplied.length<32||supplied.length>256) return json({ok:false,error:"runtime-token-required"},401);
  const auth=await db.from("genesis_runtime_auth").select("token_sha256").eq("singleton_id",1).single();
  if(auth.error||!auth.data?.token_sha256) return json({ok:false,error:"runtime-auth-read-failed"},500);
  if(await sha256Hex(supplied)!==auth.data.token_sha256) return json({ok:false,error:"runtime-token-rejected"},401);

  const sr=await db.from("genesis_runtime_state").select("*").eq("singleton_id",1).single();
  if(sr.error) return json({ok:false,error:"state-read-failed"},500);
  if(sr.data?.enabled!==true) return json({ok:true,status:"GENESIS_REALITY_DISABLED"});

  let mainSha:string|null=null;
  try{
    const head=await fetch(`https://api.github.com/repos/${REPO}/commits/main`,{headers:GH_HEADERS});
    if(head.ok){const h=await head.json();mainSha=typeof h?.sha==="string"?h.sha:null;}

    const index=await ghJson(INDEX_PATH);
    if(!Array.isArray(index?.bursts)||index.bursts.length<1||index.bursts.length>256) throw new Error("invalid-burst-index");

    const er=await db.from("genesis_runtime_candidates").select("candidate_id,state,state_reason,evidence");
    if(er.error) throw new Error("candidate-state-read-failed");
    const existing=new Map((er.data||[]).map((x:any)=>[x.candidate_id,{state:x.state,stateReason:x.state_reason,evidence:x.evidence||{}}]));

    const rows:any[]=[]; const payloads:any[]=[]; const seen=new Set<string>(); let newCandidates=0;
    for(const entry of index.bursts){
      if(typeof entry?.burstId!=="string"||!/^genesis-burst-[a-z0-9-]+$/.test(entry.burstId)) throw new Error("invalid-burst-id");
      if(typeof entry?.artifactRef!=="string") throw new Error("invalid-artifact-ref");
      const burst=await ghJson(entry.artifactRef);
      if(burst?.externalEffectAuthority!=="NONE"||burst?.businessEffectAuthority!=="NONE") throw new Error("nonzero-authority-burst-refused");
      if(!Array.isArray(burst?.candidates)||burst.candidates.length!==Number(burst.materializedCandidateCount)) throw new Error("candidate-count-mismatch");
      payloads.push({entry,burst});
      for(const c of burst.candidates){
        if(!validCandidate(c)) throw new Error(`invalid-candidate:${String(c?.id||"unknown")}`);
        if(seen.has(c.id)) throw new Error(`duplicate-candidate:${c.id}`);
        seen.add(c.id);
        const prior=existing.get(c.id); if(!prior)newCandidates++;
        rows.push({
          candidate_id:c.id,burst_id:entry.burstId,source_artifact:entry.artifactRef,
          signal_id:String(burst?.signal?.id||entry?.signalId||"unknown"),title:c.title,generator_key:c.generatorKey,
          hypothesis:c.hypothesis,mechanism:c.mechanism,falsifier:c.falsifier,next_probe:c.nextProbe,
          moonshot_affinity:c.moonshotAffinity,substrate_needs:c.substrateNeeds,
          novelty:Number(c.novelty),leverage:Number(c.leverage),testability:Number(c.testability),reversibility:Number(c.reversibility),utility:utility(c),
          state:prior?.state||"PROBE_READY",state_reason:prior?.stateReason||"VALIDATED_FROM_CURRENT_MAIN_BURST",
          evidence:{...(prior?.evidence||{}),mainSha,burstId:entry.burstId,sourceArtifact:entry.artifactRef,signalEvidenceRefs:Array.isArray(burst?.signal?.evidenceRefs)?burst.signal.evidenceRefs:[],externalEffectAuthority:"NONE"},
          last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()
        });
      }
    }
    const up=await db.from("genesis_runtime_candidates").upsert(rows,{onConflict:"candidate_id"});
    if(up.error) throw new Error("candidate-upsert-failed");

    let probeAttempts=0;
    for(const {burst} of payloads){
      for(const c of burst.candidates){
        const needs=c.substrateNeeds.map(String), base=c.id, now=new Date().toISOString();
        const probes:any[]=[
          {candidate_id:c.id,probe_type:"SCHEMA_INTEGRITY",probe_key:`${base}:schema:v1`,status:"COMPLETED",completed_at:now,result:{ok:true,mainSha}},
          {candidate_id:c.id,probe_type:"FALSIFIER_PRESENT",probe_key:`${base}:falsifier:v1`,status:"COMPLETED",completed_at:now,result:{ok:true,falsifier:c.falsifier,nextProbe:c.nextProbe}},
          {candidate_id:c.id,probe_type:"ANCESTRY_FORMAT",probe_key:`${base}:ancestry:v1`,status:"COMPLETED",completed_at:now,result:{ok:true,ancestorIds:c.moonshotAffinity}}
        ];
        const h=human(needs),p=physical(needs);
        probes.push({candidate_id:c.id,probe_type:"SUBSTRATE_PREFLIGHT",probe_key:`${base}:substrate:v1`,status:(h||p)?"BLOCKED":"COMPLETED",completed_at:now,result:{ok:!(h||p),humanApprovalRequired:h,physicalMeasurementRequired:p,houseEnergyVerified:false,substrateNeeds:needs}});
        if(implReady(c)&&!h) probes.push({candidate_id:c.id,probe_type:"IMPLEMENTATION_PACKET",probe_key:`${base}:implementation:v1`,status:"COMPLETED",completed_at:now,result:{ok:true,candidateId:c.id,title:c.title,hypothesis:c.hypothesis,mechanism:c.mechanism,falsifier:c.falsifier,nextProbe:c.nextProbe,utility:utility(c),mode:p?"SOURCE_PROTOTYPE_ONLY_UNTIL_MEASUREMENT":"INTERNAL_SOURCE_PROTOTYPE",externalEffectAuthority:"NONE"}});
        for(const p0 of probes){probeAttempts++;await db.from("genesis_runtime_probes").upsert(p0,{onConflict:"probe_key",ignoreDuplicates:true});}
      }
    }

    const policyRead=await db.from("genesis_cognition_policy").select("*").eq("singleton_id",1).single();
    if(policyRead.error) throw new Error("cognition-policy-read-failed");
    const cognitionPolicy=policyRead.data;
    const cognitionNow=new Date().toISOString();
    await db.from("genesis_cognition_jobs").update({status:"EXPIRED",updated_at:cognitionNow})
      .in("status",["PENDING","LEASED"]).lte("expires_at",cognitionNow);
    await db.from("genesis_cognition_jobs").update({status:"PENDING",supplier_id:null,lease_expires_at:null,updated_at:cognitionNow})
      .eq("status","LEASED").lte("lease_expires_at",cognitionNow).gt("expires_at",cognitionNow);

    const openJobsRead=await db.from("genesis_cognition_jobs").select("*",{count:"exact",head:true}).in("status",["PENDING","LEASED"]);
    if(openJobsRead.error) throw new Error("cognition-open-count-failed");
    const openJobs=openJobsRead.count||0;
    const room=Math.max(0,Number(cognitionPolicy?.max_pending_jobs||0)-openJobs);
    const perTick=Math.min(Number(cognitionPolicy?.max_jobs_per_tick||0),room);
    let cognitionJobsCreated=0;
    if(cognitionPolicy?.enabled===true&&perTick>0){
      const queueable=rows
        .filter((row:any)=>["PROBE_READY","IMPLEMENTATION_READY"].includes(String(row.state||"")))
        .sort((a:any,b:any)=>Number(b.utility)-Number(a.utility)||String(a.candidate_id).localeCompare(String(b.candidate_id)))
        .slice(0,Math.min(rows.length,32));
      for(const row of queueable){
        if(cognitionJobsCreated>=perTick) break;
        const exists=await db.from("genesis_cognition_jobs").select("id").eq("candidate_id",row.candidate_id).eq("kind","CANDIDATE_CRITIQUE").eq("revision",1).maybeSingle();
        if(exists.error) throw new Error("cognition-existing-job-read-failed");
        if(exists.data) continue;
        const prompt={
          system:"Act as a bounded research worker. Treat this candidate as a hypothesis, not truth. Return structured JSON only. Do not claim external effects, implementation, market proof, scientific proof, or authority.",
          candidate:{
            candidateId:row.candidate_id,title:row.title,hypothesis:row.hypothesis,mechanism:row.mechanism,
            falsifier:row.falsifier,nextProbe:row.next_probe,moonshotAffinity:row.moonshot_affinity,substrateNeeds:row.substrate_needs
          },
          task:{
            kind:"CANDIDATE_CRITIQUE",
            requiredOutput:{
              thesis:"string",strongestCounterexamples:["string"],falsifierRefinement:"string",
              minimumExperiment:{objective:"string",procedure:["string"],successCriterion:"string",failureCriterion:"string"},
              implementationSketch:{internalOnly:true,steps:["string"],dependencies:["string"],risks:["string"]},
              confidence:"number 0..1",unresolved:["string"]
            }
          }
        };
        const reqs={
          allowedSupplierClasses:["DETERMINISTIC","LOCAL"],
          requiredCapabilities:["STRUCTURED_JSON"],
          maxInputTokens:Number(cognitionPolicy.default_max_input_tokens),
          maxOutputTokens:Number(cognitionPolicy.default_max_output_tokens),
          maxCostMicrousd:0,
          externalEffectAuthority:"NONE",
          paidProviderEnabled:false
        };
        const ins=await db.from("genesis_cognition_jobs").insert({
          candidate_id:row.candidate_id,kind:"CANDIDATE_CRITIQUE",revision:1,status:"PENDING",
          priority:Number(row.utility),prompt,requirements:reqs,
          max_input_tokens:Number(cognitionPolicy.default_max_input_tokens),
          max_output_tokens:Number(cognitionPolicy.default_max_output_tokens),
          max_cost_microusd:0,
          expires_at:new Date(Date.now()+24*60*60*1000).toISOString()
        });
        if(ins.error) throw new Error("cognition-job-insert-failed");
        cognitionJobsCreated++;
      }
    }

    const counts=await Promise.all([
      db.from("genesis_runtime_candidates").select("*",{count:"exact",head:true}),
      db.from("genesis_runtime_candidates").select("*",{count:"exact",head:true}).in("state",["PROBE_READY","IMPLEMENTATION_READY"]),
      db.from("genesis_runtime_candidates").select("*",{count:"exact",head:true}).in("state",["BLOCKED_ENERGY","BLOCKED_HUMAN","BLOCKED_EXTERNAL"]),
      db.from("genesis_runtime_candidates").select("*",{count:"exact",head:true}).eq("state","IMPLEMENTED"),
      db.from("genesis_cognition_jobs").select("*",{count:"exact",head:true}).in("status",["PENDING","LEASED"]),
      db.from("genesis_cognition_jobs").select("*",{count:"exact",head:true}).eq("status","COMPLETED"),
      db.from("genesis_cognition_suppliers").select("*",{count:"exact",head:true}).eq("enabled",true).eq("callable",true)
    ]);
    const candidateCount=counts[0].count||0,probeReady=counts[1].count||0,blocked=counts[2].count||0,implemented=counts[3].count||0;
    const cognitionPending=counts[4].count||0,cognitionCompleted=counts[5].count||0,callableSuppliers=counts[6].count||0;
    const now=new Date().toISOString(),tickCount=Number(sr.data?.tick_count||0)+1;
    await db.from("genesis_runtime_state").update({
      tick_count:tickCount,last_tick_at:now,last_status:"GENESIS_REALITY_ACTIVE",observed_main_sha:mainSha,
      burst_count:index.bursts.length,candidate_count:candidateCount,probe_ready_count:probeReady,blocked_count:blocked,implemented_count:implemented,
      cognition_pending_count:cognitionPending,cognition_completed_count:cognitionCompleted,callable_cognition_supplier_count:callableSuppliers,
      last_error:null,updated_at:now
    }).eq("singleton_id",1);
    await db.from("genesis_runtime_ticks").insert({
      observed_main_sha:mainSha,burst_count:index.bursts.length,candidate_count:candidateCount,new_candidate_count:newCandidates,
      probe_ready_count:probeReady,blocked_count:blocked,status:"GENESIS_REALITY_ACTIVE",
      payload:{tickCount,probeAttempts,cognitionJobsCreated,cognitionPending,cognitionCompleted,callableSuppliers,
        cognitionPaidProviderEnabled:cognitionPolicy?.paid_provider_enabled===true,
        cognitionDailySpendCapMicrousd:Number(cognitionPolicy?.max_daily_cost_microusd||0),
        indexGeneratedAt:index.generatedAt||null,externalEffectAuthority:"NONE"}
    });
    return json({
      ok:true,status:"GENESIS_REALITY_ACTIVE",tickCount,mainSha,burstCount:index.bursts.length,candidateCount,newCandidates,
      probeReadyCount:probeReady,blockedCount:blocked,implementedCount:implemented,probeAttempts,
      cognition:{jobsCreated:cognitionJobsCreated,pending:cognitionPending,completed:cognitionCompleted,callableSuppliers,paidProviderEnabled:cognitionPolicy?.paid_provider_enabled===true,maxDailyCostMicrousd:Number(cognitionPolicy?.max_daily_cost_microusd||0)},
      externalEffectAuthority:"NONE"
    });
  }catch(err){
    const message=err instanceof Error?err.message:String(err),now=new Date().toISOString();
    await db.from("genesis_runtime_state").update({last_tick_at:now,last_status:"GENESIS_REALITY_DEGRADED",observed_main_sha:mainSha,last_error:message,updated_at:now}).eq("singleton_id",1);
    await db.from("genesis_runtime_ticks").insert({observed_main_sha:mainSha,status:"GENESIS_REALITY_DEGRADED",payload:{error:message,externalEffectAuthority:"NONE"}});
    return json({ok:false,status:"GENESIS_REALITY_DEGRADED",error:message},500);
  }
});