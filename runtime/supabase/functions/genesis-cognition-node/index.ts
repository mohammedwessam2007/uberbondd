import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
async function sha256Hex(v:string){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function validResult(r:any){
  if(!r||typeof r!=="object"||Array.isArray(r)) return false;
  const exp=r.minimumExperiment,sketch=r.implementationSketch;
  return typeof r.thesis==="string"&&r.thesis.trim().length>0
    &&Array.isArray(r.strongestCounterexamples)&&r.strongestCounterexamples.length>0
    &&r.strongestCounterexamples.every((x:any)=>typeof x==="string"&&x.trim())
    &&typeof r.falsifierRefinement==="string"&&r.falsifierRefinement.trim()
    &&exp&&typeof exp==="object"&&!Array.isArray(exp)
    &&typeof exp.objective==="string"&&exp.objective.trim()
    &&Array.isArray(exp.procedure)&&exp.procedure.length>0&&exp.procedure.every((x:any)=>typeof x==="string"&&x.trim())
    &&typeof exp.successCriterion==="string"&&exp.successCriterion.trim()
    &&typeof exp.failureCriterion==="string"&&exp.failureCriterion.trim()
    &&sketch&&typeof sketch==="object"&&!Array.isArray(sketch)&&sketch.internalOnly===true
    &&Array.isArray(sketch.steps)&&sketch.steps.length>0&&sketch.steps.every((x:any)=>typeof x==="string"&&x.trim())
    &&Array.isArray(sketch.dependencies)&&Array.isArray(sketch.risks)
    &&Number.isFinite(Number(r.confidence))&&Number(r.confidence)>=0&&Number(r.confidence)<=1
    &&Array.isArray(r.unresolved);
}
function classes(req:any){return Array.isArray(req?.allowedSupplierClasses)?req.allowedSupplierClasses.map(String):[];}
function caps(req:any){return Array.isArray(req?.requiredCapabilities)?req.requiredCapabilities.map(String):[];}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({ok:false,error:"method-not-allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service) return json({ok:false,error:"runtime-auth-unavailable"},503);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  const supplierId=(req.headers.get("x-genesis-supplier")||"").trim();
  const token=(req.headers.get("x-genesis-supplier-token")||"").trim();
  if(!/^supplier:[a-z0-9][a-z0-9._-]{1,119}$/.test(supplierId)||token.length<32||token.length>256){
    return json({ok:false,error:"supplier-auth-required"},401);
  }
  const sr=await db.from("genesis_cognition_suppliers").select("*").eq("supplier_id",supplierId).maybeSingle();
  if(sr.error) return json({ok:false,error:"supplier-auth-query-failed"},500);
  const supplier=sr.data;
  if(!supplier?.enabled||!supplier?.callable||!supplier?.token_hash) return json({ok:false,error:"supplier-not-callable"},401);
  if(await sha256Hex(token)!==supplier.token_hash) return json({ok:false,error:"supplier-token-rejected"},401);

  const now=new Date().toISOString();
  await db.from("genesis_cognition_suppliers").update({last_seen_at:now,updated_at:now}).eq("supplier_id",supplierId);

  let body:any={};try{body=await req.json();}catch{return json({ok:false,error:"invalid-json"},400);}
  const op=String(body?.op||"");

  if(op==="heartbeat") return json({ok:true,status:"SUPPLIER_ALIVE",supplierId,at:now,externalEffectAuthority:"NONE"});

  if(op==="poll"){
    await db.from("genesis_cognition_jobs").update({status:"EXPIRED",updated_at:now})
      .in("status",["PENDING","LEASED"]).lte("expires_at",now);
    await db.from("genesis_cognition_jobs").update({status:"PENDING",supplier_id:null,lease_expires_at:null,updated_at:now})
      .eq("status","LEASED").lte("lease_expires_at",now).gt("expires_at",now);

    const pending=await db.from("genesis_cognition_jobs").select("*")
      .eq("status","PENDING").gt("expires_at",now).order("priority",{ascending:false}).order("created_at",{ascending:true}).limit(32);
    if(pending.error) return json({ok:false,error:"job-query-failed"},500);

    const supplierCaps=Array.isArray(supplier.capabilities)?supplier.capabilities.map(String):[];
    const eligible=(pending.data||[]).find((job:any)=>{
      const reqs=job.requirements||{};
      return classes(reqs).includes(String(supplier.supplier_class))
        &&caps(reqs).every(c=>supplierCaps.includes(c))
        &&Number(supplier.max_observed_cost_microusd_per_job)<=Number(job.max_cost_microusd);
    });
    if(!eligible) return json({ok:true,job:null,status:"NO_ELIGIBLE_JOB"});

    const leaseUntil=new Date(Date.now()+5*60*1000).toISOString();
    const claimed=await db.from("genesis_cognition_jobs")
      .update({status:"LEASED",supplier_id:supplierId,lease_expires_at:leaseUntil,attempt_count:Number(eligible.attempt_count||0)+1,updated_at:now})
      .eq("id",eligible.id).eq("status","PENDING")
      .select("id,candidate_id,kind,revision,priority,prompt,requirements,max_input_tokens,max_output_tokens,max_cost_microusd,lease_expires_at,expires_at")
      .maybeSingle();
    if(claimed.error) return json({ok:false,error:"job-claim-failed"},500);
    return json({ok:true,status:claimed.data?"JOB_LEASED":"LEASE_RACE_LOST",job:claimed.data||null,externalEffectAuthority:"NONE"});
  }

  if(op==="receipt"){
    const jobId=String(body?.jobId||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ok:false,error:"valid-job-id-required"},400);
    const jr=await db.from("genesis_cognition_jobs").select("*").eq("id",jobId).eq("supplier_id",supplierId).maybeSingle();
    if(jr.error) return json({ok:false,error:"job-read-failed"},500);
    const job=jr.data;
    if(!job||job.status!=="LEASED") return json({ok:false,error:"leased-job-required"},409);

    const ok=body?.ok===true;
    const inputTokens=Number(body?.inputTokens),outputTokens=Number(body?.outputTokens),costMicrousd=Number(body?.costMicrousd),latencyMs=Number(body?.latencyMs);
    const result=body?.result;
    const usageValid=[inputTokens,outputTokens,costMicrousd,latencyMs].every(Number.isSafeInteger)
      &&inputTokens>=0&&outputTokens>=0&&costMicrousd>=0&&latencyMs>=0
      &&inputTokens<=Number(job.max_input_tokens)&&outputTokens<=Number(job.max_output_tokens)
      &&costMicrousd<=Number(job.max_cost_microusd)&&latencyMs<=3600000;
    if(!usageValid) return json({ok:false,error:"usage-or-cost-envelope-violated"},400);
    if(ok&&!validResult(result)) return json({ok:false,error:"structured-cognition-result-required"},400);

    const receipt={
      job_id:jobId,supplier_id:supplierId,ok,
      provider:String(supplier.provider),model:String(supplier.model),
      input_tokens:inputTokens,output_tokens:outputTokens,cost_microusd:costMicrousd,latency_ms:latencyMs,
      result:ok?result:{error:String(body?.error||"supplier-failure").slice(0,2000)},
      provenance:{
        supplierClass:supplier.supplier_class,
        supplierEvidence:supplier.evidence||{},
        receivedAt:now,
        externalEffectAuthority:"NONE"
      }
    };
    const rr=await db.from("genesis_cognition_receipts").upsert(receipt,{onConflict:"job_id"});
    if(rr.error) return json({ok:false,error:"receipt-write-failed"},500);
    await db.from("genesis_cognition_jobs").update({
      status:ok?"COMPLETED":"FAILED",lease_expires_at:null,updated_at:now
    }).eq("id",jobId).eq("supplier_id",supplierId);

    if(ok){
      const cr=await db.from("genesis_runtime_candidates").select("state,evidence").eq("candidate_id",job.candidate_id).single();
      if(!cr.error&&cr.data?.state!=="IMPLEMENTED"){
        await db.from("genesis_runtime_candidates").update({
          state:"PROBED",
          state_reason:"COGNITION_RECEIPT_ACCEPTED_RESEARCH_EVIDENCE_ONLY",
          evidence:{...(cr.data?.evidence||{}),cognition:{jobId,supplierId,provider:supplier.provider,model:supplier.model,costMicrousd,receivedAt:now,truthBoundary:"MODEL_ANALYSIS_IS_RESEARCH_EVIDENCE_ONLY"}},
          updated_at:now
        }).eq("candidate_id",job.candidate_id);
      }
    }
    return json({ok:true,status:ok?"COGNITION_RECEIPT_ACCEPTED":"COGNITION_RECEIPT_RECORDED_FAILURE",jobId,candidateId:job.candidate_id,externalEffectAuthority:"NONE"});
  }

  return json({ok:false,error:"unsupported-op"},400);
});