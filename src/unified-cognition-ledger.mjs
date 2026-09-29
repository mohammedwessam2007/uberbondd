import crypto from 'node:crypto';
export const UNIFIED_COGNITION_LEDGER_SCHEMA='uberbond.unified-cognition-ledger.v1';
export const COGNITION_COST_CLASSES=Object.freeze(['CASH_API_SPEND','PLAN_INCLUDED_COGNITION','DONATED_COMPUTE','CREDITS','ALGORITHMIC_COMPRESSION']);
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id=x=>typeof x==='string'&&x.length>0&&x.length<=300;
const finite=x=>Number.isFinite(Number(x))&&Number(x)>=0;
export function createUnifiedCognitionLedger({month}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||'')))throw new Error('billing-month-required');
 return {schemaVersion:UNIFIED_COGNITION_LEDGER_SCHEMA,month,events:[]};
}
export function appendCognitionEvent(ledger,event={}){
 if(ledger?.schemaVersion!==UNIFIED_COGNITION_LEDGER_SCHEMA||event.billing_month!==ledger.month)throw new Error('ledger-month-binding-required');
 const required=['channel_id','task_id','call_id','provider','model','provider_route','timestamp','authorization_ref','cost_class'];
 if(required.some(k=>!id(event[k]))||!COGNITION_COST_CLASSES.includes(event.cost_class))throw new Error('complete-cognition-event-required');
 if(ledger.events.some(e=>e.call_id===event.call_id))throw new Error('duplicate-call-id');
 const numeric=['input_tokens','cached_input_tokens','output_tokens','reasoning_tokens','cache_write_tokens','estimated_cost_usd','actual_cost_usd','platform_fee_usd'];
 for(const k of numeric)if(event[k]!=null&&!finite(event[k]))throw new Error(`invalid-${k}`);
 if(event.cost_class==='CASH_API_SPEND'&&!finite(event.actual_cost_usd))throw new Error('cash-event-requires-observed-actual-cost');
 if(event.cost_class!=='CASH_API_SPEND'&&Number(event.actual_cost_usd??0)!==0)throw new Error('noncash-class-cannot-carry-cash-api-cost');
 const normalized={...event,model_revision:event.model_revision??null,currency:event.currency??'USD',input_tokens:Number(event.input_tokens??0),cached_input_tokens:Number(event.cached_input_tokens??0),output_tokens:Number(event.output_tokens??0),reasoning_tokens:Number(event.reasoning_tokens??0),cache_write_tokens:Number(event.cache_write_tokens??0),estimated_cost_usd:event.estimated_cost_usd==null?null:Number(event.estimated_cost_usd),actual_cost_usd:event.actual_cost_usd==null?null:Number(event.actual_cost_usd),platform_fee_usd:Number(event.platform_fee_usd??0)};
 const next=structuredClone(ledger);next.events.push({...normalized,event_hash:hash(normalized)});return next;
}
export function cognitionLedgerSummary(ledger){
 if(ledger?.schemaVersion!==UNIFIED_COGNITION_LEDGER_SCHEMA)throw new Error('unified-ledger-required');
 const byClass=Object.fromEntries(COGNITION_COST_CLASSES.map(k=>[k,{events:0,cashUsd:0}]));
 let actualAllInUsd=0;
 for(const e of ledger.events){const b=byClass[e.cost_class];b.events++;if(e.cost_class==='CASH_API_SPEND'){const cost=Number(e.actual_cost_usd)+Number(e.platform_fee_usd??0);b.cashUsd+=cost;actualAllInUsd+=cost;}}
 return {month:ledger.month,events:ledger.events.length,byClass,actualAllInUsd:Number(actualAllInUsd.toFixed(9)),doubleCountingPrevented:true};
}
