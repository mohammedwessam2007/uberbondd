import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function sha256Hex(v:string){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");}
const REALITY_NEEDS=new Set(["HUMAN_APPROVAL","UBERWATT","THERMAL_TELEMETRY","TELEMETRY"]);
const SEMANTIC_NEEDS=new Set(["MODEL_MARKET","LOCAL_COMPUTE","SOVEREIGN_COMPUTE","FRONTIER_REVIEW","RESEARCH_SEARCH","RESEARCH_INGEST","CODE_GENERATION"]);

function decide(c:any,receipt:any,realization:any,suppliers:any[],paidProviderEnabled:boolean){
  if(realization?.realization_state==="SOURCE_IMPLEMENTED_HYPOTHESIS_UNVALIDATED") return {decision:"ALREADY_IMPLEMENTED",score:1,reasonCodes:["source-realization-exists"],realityBlockers:[],semanticNeeds:[],unresolved:receipt?.result?.unresolved||[]};
  const needs=Array.isArray(c.substrate_needs)?c.substrate_needs.map(String):[];
  const unresolved=Array.isArray(receipt?.result?.unresolved)?receipt.result.unresolved:[];
  const realityBlockers=needs.filter(x=>REALITY_NEEDS.has(x));
  const semanticNeeds=needs.filter(x=>SEMANTIC_NEEDS.has(x));
  const unresolvedSemantic=unresolved.some((x:any)=>/supplier quality|semantic uncertainty|model quality|model supplier|coordination overhead/i.test(String(x)));
  if(unresolvedSemantic&&!semanticNeeds.includes("UNRESOLVED_SEMANTIC_SUPPLIER")) semanticNeeds.push("UNRESOLVED_SEMANTIC_SUPPLIER");
  const classes=new Set((suppliers||[]).filter(s=>s.callable===true&&s.enabled===true).map(s=>String(s.supplier_class||"").toUpperCase()));
  const localSemanticCallable=classes.has("LOCAL");
  const cloudCallable=classes.has("CHEAP_CLOUD")||classes.has("FRONTIER");
  const utility=Number(c.utility||0),testability=Number(c.testability||0),reversibility=Number(c.reversibility||0),confidence=Number(receipt?.result?.confidence||0);
  let decision="HOLD",reasonCodes:string[]=[];
  if(realityBlockers.length){decision="WAIT_REALITY_EVIDENCE";reasonCodes=["reality-evidence-required",...realityBlockers.map(x=>`needs:${x}`)];}
  else if(utility>=.93&&testability>=.88&&reversibility>=.94&&semanticNeeds.length===0&&confidence>=.60){decision="IMPLEMENT_NOW";reasonCodes=["high-utility-high-testability-high-reversibility","no-reality-blocker","no-semantic-supplier-dependency"];}
  else if(semanticNeeds.length>0&&localSemanticCallable){decision="ESCALATE_LOCAL_SEMANTIC";reasonCodes=["material-semantic-uncertainty","callable-local-semantic-supplier-exists"];}
  else if((utility>=.90||testability>=.90)&&semanticNeeds.length>0&&paidProviderEnabled&&cloudCallable){decision="ESCALATE_PAID_SEMANTIC";reasonCodes=["material-semantic-uncertainty","paid-provider-authority-present"];}
  else if(semanticNeeds.length>0){decision=paidProviderEnabled?"WAIT_CALLABLE_SEMANTIC_SUPPLIER":"WAIT_PAID_SEMANTIC_AUTHORITY";reasonCodes=["material-semantic-uncertainty",paidProviderEnabled?"no-callable-semantic-supplier":"paid-provider-disabled"];}
  else if(utility>=.90&&testability>=.84&&reversibility>=.94){decision="IMPLEMENT_NOW";reasonCodes=["strong-internal-source-prototype-candidate","no-reality-blocker"];}
  else {decision="HOLD";reasonCodes=["below-current-realization-frontier"];}
  const score=Number((.38*utility+.30*testability+.20*reversibility+.12*confidence).toFixed(4));
  return {decision,score,reasonCodes,realityBlockers,semanticNeeds,unresolved};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({ok:false,error:"method-not-allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service) return json({ok:false,error:"runtime-auth-unavailable"},503);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const token=(req.headers.get("x-genesis-escalation-token")||"").trim();
  if(token.length<32||token.length>256) return json({ok:false,error:"escalation-token-required"},401);
  const ar=await db.from("genesis_escalation_auth").select("token_sha256").eq("singleton_id",1).single();
  if(ar.error||!ar.data?.token_sha256) return json({ok:false,error:"escalation-auth-read-failed"},500);
  if(await sha256Hex(token)!==ar.data.token_sha256) return json({ok:false,error:"escalation-token-rejected"},401);

  const [policyR,suppliersR,candsR,realR,jobsR]=await Promise.all([
    db.from("genesis_cognition_policy").select("*").eq("singleton_id",1).single(),
    db.from("genesis_cognition_suppliers").select("*"),
    db.from("genesis_runtime_candidates").select("*"),
    db.from("genesis_runtime_realizations").select("*"),
    db.from("genesis_cognition_jobs").select("id,candidate_id,kind,status")
  ]);
  if(policyR.error||suppliersR.error||candsR.error||realR.error||jobsR.error) return json({ok:false,error:"tribunal-input-read-failed"},500);
  const realizations=new Map((realR.data||[]).map((r:any)=>[r.candidate_id,r]));
  const latestReceiptByCandidate=new Map<string,any>();
  const completedJobs=(jobsR.data||[]).filter((j:any)=>j.kind==="CANDIDATE_CRITIQUE"&&j.status==="COMPLETED");
  for(const j of completedJobs){
    const rr=await db.from("genesis_cognition_receipts").select("id,result,created_at").eq("job_id",j.id).eq("ok",true).maybeSingle();
    if(rr.error) return json({ok:false,error:"receipt-read-failed"},500);
    if(rr.data){
      const prior=latestReceiptByCandidate.get(j.candidate_id);
      if(!prior||String(rr.data.created_at)>String(prior.created_at)) latestReceiptByCandidate.set(j.candidate_id,rr.data);
    }
  }

  const paid=policyR.data?.paid_provider_enabled===true;
  const decisions:any[]=[];
  let queued=0;
  for(const c of (candsR.data||[])){
    const receipt=latestReceiptByCandidate.get(c.candidate_id);
    if(!receipt) continue;
    const d=decide(c,receipt,realizations.get(c.candidate_id),(suppliersR.data||[]),paid);
    const row={
      candidate_id:c.candidate_id,decision:d.decision,score:d.score,reason_codes:d.reasonCodes,
      reality_blockers:d.realityBlockers,semantic_needs:d.semanticNeeds,unresolved:d.unresolved,
      source_receipt_id:receipt.id,paid_provider_enabled:paid,execution_authority:"NONE",updated_at:new Date().toISOString()
    };
    const up=await db.from("genesis_escalation_decisions").upsert(row,{onConflict:"candidate_id"});
    if(up.error) return json({ok:false,error:"decision-upsert-failed",candidateId:c.candidate_id},500);
    decisions.push({...row,title:c.title,utility:c.utility,testability:c.testability,reversibility:c.reversibility});
    if(d.decision==="IMPLEMENT_NOW"){
      const existingQ=await db.from("genesis_realization_queue").select("status").eq("candidate_id",c.candidate_id).maybeSingle();
      if(existingQ.error) return json({ok:false,error:"realization-queue-read-failed",candidateId:c.candidate_id},500);
      if(!["SOURCE_IMPLEMENTED","CLAIMED"].includes(String(existingQ.data?.status||""))){
        const qr=await db.from("genesis_realization_queue").upsert({
          candidate_id:c.candidate_id,status:"PENDING",priority:d.score,source_only:true,max_files:6,max_changed_lines:900,
          external_effect_authority:"NONE",business_effect_authority:"NONE",
          evidence:{decision:d.decision,decisionScore:d.score,sourceReceiptId:receipt.id,externalEffectAuthority:"NONE",truthBoundary:"QUEUE_ENTRY_AUTHORIZES_ONLY_BOUNDED_INTERNAL_SOURCE_REALIZATION_REVIEW_NOT_AUTO_MERGE"},
          updated_at:new Date().toISOString()
        },{onConflict:"candidate_id"});
        if(qr.error) return json({ok:false,error:"realization-queue-upsert-failed",candidateId:c.candidate_id},500);
        queued++;
      }
    } else if(d.decision==="ALREADY_IMPLEMENTED"){
      await db.from("genesis_realization_queue").update({
        status:"SOURCE_IMPLEMENTED",updated_at:new Date().toISOString(),
        evidence:{decision:d.decision,decisionScore:d.score,sourceReceiptId:receipt.id,externalEffectAuthority:"NONE",truthBoundary:"IMPLEMENTATION_IS_RECORDED_SEPARATELY_IN_THE_REALIZATION_LEDGER"}
      }).eq("candidate_id",c.candidate_id).in("status",["PENDING","CLAIMED","BLOCKED"]);
    } else {
      await db.from("genesis_realization_queue").update({
        status:"BLOCKED",updated_at:new Date().toISOString(),
        evidence:{decision:d.decision,decisionScore:d.score,sourceReceiptId:receipt.id,reasonCodes:d.reasonCodes,externalEffectAuthority:"NONE",truthBoundary:"QUEUE_ROW_BLOCKED_AFTER_CURRENT_TRIBUNAL_RECONCILIATION"}
      }).eq("candidate_id",c.candidate_id).in("status",["PENDING","CLAIMED"]);
    }
  }
  const counts=Object.fromEntries([...new Set(decisions.map(x=>x.decision))].sort().map(k=>[k,decisions.filter(x=>x.decision===k).length]));
  const top=[...decisions].sort((a,b)=>{
    const order:any={IMPLEMENT_NOW:0,ESCALATE_LOCAL_SEMANTIC:1,ESCALATE_PAID_SEMANTIC:2,WAIT_REALITY_EVIDENCE:3,WAIT_PAID_SEMANTIC_AUTHORITY:4,WAIT_CALLABLE_SEMANTIC_SUPPLIER:5,HOLD:6,ALREADY_IMPLEMENTED:7};
    return (order[a.decision]??99)-(order[b.decision]??99)||b.score-a.score||String(a.candidate_id).localeCompare(String(b.candidate_id));
  }).slice(0,12).map(x=>({candidateId:x.candidate_id,title:x.title,decision:x.decision,score:x.score}));
  return json({ok:true,status:"GENESIS_ESCALATION_TRIBUNAL_ACTIVE",decisionCount:decisions.length,counts,realizationQueueWrites:queued,top,paidProviderEnabled:paid,externalEffectAuthority:"NONE"});
});